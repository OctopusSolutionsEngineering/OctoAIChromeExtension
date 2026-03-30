/* ==========================================================================
   Octopus Deploy Dashboard — Data Layer
   
   Fetches data from the Octopus REST API across all spaces and aggregates
   it for the value dashboard.
   
   Key endpoints used (confirmed working 2026-02):
     GET /api                                        → Server info & version
     GET /api/spaces?take=100                        → All spaces
     GET /api/licenses/licenses-current-usage        → SpacesUsage + Limits[] (CurrentUsage, EffectiveLimit, IsUnlimited)
     GET /api/licenses/licenses-current-status       → Compliance, expiry, hosting; Limits[] caps / unlimited
     GET /api/{spaceId}/teams/all                    → Teams (membership & scoping; needs TeamView)
     GET /api/{spaceId}/projects?take=1000           → Projects per space
     GET /api/{spaceId}/environments/all           → All environments per space (includes disabled/deleted)
     GET /api/{spaceId}/environments/summary         → Machine / target health summary
     GET /api/{spaceId}/deployments?take=200         → Recent deployments per space
     GET /api/{spaceId}/dashboard                    → Dashboard overview (latest per project/env)
     GET /api/{spaceId}/releases?take=0              → Release count
     GET /api/{spaceId}/runbooks?take=0              → Runbook count
     GET /api/{spaceId}/machines?take=200            → Deployment targets
     GET /api/tasks?spaces=X,Y&name=Deploy&take=200  → Cross-space deploy tasks with timing
   
   DEPRECATED / NOT AVAILABLE:
     /api/{spaceId}/reporting/deployments-counted-by-week  → DEPRECATED
     /api/{spaceId}/projects/pulse                         → 404 not found
     /api/{spaceId}/insights/reports                       → Needs manual setup
   
   Docs: https://octopus.com/docs/octopus-rest-api
   ========================================================================== */

const DashboardData = (() => {

  // ---- State ----
  let _spaces = [];
  let _spaceData = {};
  let _serverInfo = null;
  let _licenseUsage = null;
  let _licenseStatus = null;
  let _crossSpaceTasks = [];
  let _activeSpaceIds = [];
  let _lastFetch = null;

  const log = (...args) => (window._debug || console.log)(...args);

  // ---- Fetch all data ----

  /**
   * Main entry point — fetches everything we need for the dashboard.
   * Call this on load and on refresh.
   */
  async function fetchAll(onProgress) {
    const report = (msg) => onProgress && onProgress(msg);

    // Phase 1: Global data (no per-space iteration)
    report('Connecting to Octopus...');
    const [serverInfo, spacesResponse, licenseUsage, licenseStatus] = await Promise.all([
      OctopusApi.get('/api'),
      OctopusApi.get('/api/spaces?take=100&partialName='),
      safeGet('/api/licenses/licenses-current-usage'),
      safeGet('/api/licenses/licenses-current-status'),
    ]);

    _serverInfo = serverInfo;
    _spaces = spacesResponse.Items || [];
    _licenseUsage = licenseUsage;
    _licenseStatus = licenseStatus;

    log('Server info', { Version: _serverInfo?.Version, ApiVersion: _serverInfo?.ApiVersion });
    log(`Found ${_spaces.length} spaces`);

    // Build usage lookup: spaceName → { ProjectsCount, TenantsCount, MachinesCount }
    const usageByName = {};
    let activeSpaces;

    if (_licenseUsage?.SpacesUsage && _licenseUsage.SpacesUsage.length > 0) {
      for (const su of _licenseUsage.SpacesUsage) {
        usageByName[su.SpaceName] = su;
      }

      // Filter to only spaces that have at least 1 project (skip empty T1–T30 etc.)
      activeSpaces = _spaces.filter(s => {
        const usage = usageByName[s.Name];
        return usage && (usage.ProjectsCount > 0 || usage.MachinesCount > 0);
      });
    } else {
      // License usage information is unavailable; fall back to treating all spaces as active.
      activeSpaces = _spaces;
    }
    log(`Active spaces (with projects/targets): ${activeSpaces.length}`, activeSpaces.map(s => s.Name));

    // Phase 2: Per-space detail (parallel fetch for each active space)
    _spaceData = {};
    report(`Loading data for ${activeSpaces.length} active spaces...`);

    const spacePromises = activeSpaces.map(async (space) => {
      report(`Loading ${space.Name}...`);
      const data = await fetchSpaceData(space);
      _spaceData[space.Id] = data;
      log(`  ${space.Name}: ${data.projects.length} projects, ${data.totalDeployments} deployments, ${data.environments.length} envs, ${data.targetCount} targets`);
    });
    await Promise.all(spacePromises);

    // Phase 3: Cross-space deployment tasks (may require multiple calls for many spaces)
    report('Loading deployment task history...');
    const activeSpaceIds = activeSpaces.map(s => s.Id);
    _activeSpaceIds = activeSpaceIds;

    // Avoid building an excessively long query string by chunking space IDs
    const SPACE_ID_CHUNK_SIZE = 25;
    const taskRequests = [];
    for (let i = 0; i < activeSpaceIds.length; i += SPACE_ID_CHUNK_SIZE) {
      const chunkIds = activeSpaceIds.slice(i, i + SPACE_ID_CHUNK_SIZE).join(',');
      taskRequests.push(
        safeGet(`/api/tasks?spaces=${encodeURIComponent(chunkIds)}&name=Deploy&states=Success,Failed&take=200`)
      );
    }

    const taskResponses = await Promise.all(taskRequests);
    _crossSpaceTasks = [];
    let totalResults = 0;
    for (const resp of taskResponses) {
      if (resp?.Items && Array.isArray(resp.Items)) {
        _crossSpaceTasks.push(...resp.Items);
      }
      if (typeof resp?.TotalResults === 'number') {
        totalResults += resp.TotalResults;
      }
    }

    // If TotalResults was not provided, fall back to the number of aggregated items
    if (!totalResults) {
      totalResults = _crossSpaceTasks.length;
    }

    log(`Cross-space deploy tasks: ${_crossSpaceTasks.length} (total: ${totalResults})`);

    // Enrich per-space deployments with state from dashboard items + cross-space tasks
    const taskStateMap = {};
    for (const task of _crossSpaceTasks) taskStateMap[task.Id] = task;
    for (const sd of Object.values(_spaceData)) {
      const dashMap = {};
      if (sd.dashboard?.Items) {
        for (const item of sd.dashboard.Items) dashMap[item.DeploymentId] = item;
      }
      for (const dep of sd.deployments) {
        if (!dep.State || dep.State === 'Unknown') {
          const dashItem = dashMap[dep.Id];
          const task = dep.TaskId ? taskStateMap[dep.TaskId] : null;
          dep.State = dashItem?.State || task?.State || dep.State || 'Unknown';
          if (!dep.CompletedTime) dep.CompletedTime = dashItem?.CompletedTime || task?.CompletedTime;
          if (!dep.Duration) dep.Duration = dashItem?.Duration;
        }
      }
    }

    _lastFetch = new Date();
    const summary = getSummary(usageByName);
    log('Dashboard summary', {
      totalDeployments: summary.kpi.totalDeployments,
      successRate: summary.kpi.successRate + '%',
      projects: summary.kpi.activeProjects,
      activeSpaces: summary.kpi.activeSpaces,
      totalTargets: summary.kpi.totalTargets,
      healthyTargets: summary.kpi.healthyTargetsPct + '%',
    });
    return summary;
  }

  // ---- Per-space data fetching ----

  async function fetchSpaceData(space) {
    const sid = space.Id;
    
    // Fetch everything in parallel
    const [projects, environments, envSummary, dashboard, deployments, machines, releasesResp, runbooksResp] = await Promise.all([
      safeGet(`/api/${sid}/projects?take=1000`),
      safeGet(`/api/${sid}/environments/all`),
      safeGet(`/api/${sid}/environments/summary`),
      safeGet(`/api/${sid}/dashboard`),
      safeGet(`/api/${sid}/deployments?take=200`),
      safeGet(`/api/${sid}/machines?take=200`),
      safeGet(`/api/${sid}/releases?take=0`),
      safeGet(`/api/${sid}/runbooks?take=0`),
    ]);

    // Teams: use real errors (not safeGet) so we can tell 403 from “no teams”
    let teams = [];
    let teamsAccess = 'ok';
    try {
      const teamsRaw = await OctopusApi.get(`/api/${sid}/teams/all`);
      teams = normalizeTeamsList(teamsRaw);
    } catch (err) {
      const st = err && err.status;
      if (st === 401 || st === 403) teamsAccess = 'denied';
      else {
        teamsAccess = 'error';
        log(`${space.Name}: teams fetch failed`, err.message || err);
      }
    }

    // Build project name lookup
    const projectNames = {};
    for (const p of (projects?.Items || [])) {
      projectNames[p.Id] = p.Name;
    }

    // /environments/all may return either a raw array or an { Items } list
    const normalizeEnvironmentsList = (raw) => {
      if (raw == null) return [];
      if (Array.isArray(raw)) return raw;
      if (Array.isArray(raw.Items)) return raw.Items;
      return [];
    };

    const environmentsList = normalizeEnvironmentsList(environments);

    // Build environment name lookup
    const envNames = {};
    for (const e of environmentsList) {
      envNames[e.Id] = e.Name;
    }

    // Parse machine health from environment summary
    const machineHealth = envSummary?.MachineHealthStatusSummaries || {};
    const totalMachines = envSummary?.TotalMachines || 0;

    return {
      space,
      projects: projects?.Items || [],
      projectNames,
      environments: environmentsList,
      envNames,
      envSummary,
      dashboard,
      deployments: deployments?.Items || [],
      totalDeployments: deployments?.TotalResults || 0,
      machines: machines?.Items || [],
      targetCount: machines?.TotalResults || totalMachines,
      machineHealth,
      releaseCount: releasesResp?.TotalResults || 0,
      runbookCount: runbooksResp?.TotalResults || 0,
      teams,
      teamsAccess,
    };
  }

  // Safe getter — returns null instead of throwing on 404/403
  async function safeGet(endpoint) {
    try {
      return await OctopusApi.get(endpoint);
    } catch (err) {
      if (err.status === 401 || err.status === 403 || err.status === 404) return null;
      // Also swallow deprecation errors (the weekly report endpoint)
      if (err.message && err.message.includes('deprecated')) return null;
      throw err;
    }
  }

  /** Normalize Octopus list responses (some `/all` routes return a raw array, others `{ Items }`). */
  function normalizeTeamsList(raw) {
    if (raw == null) return [];
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw.Items)) return raw.Items;
    return [];
  }

  /**
   * PTM totals from GET /api/licenses/licenses-current-usage (authoritative for licensing).
   * Sums per-space ProjectsCount, TenantsCount, MachinesCount; uses root totals if present.
   */
  function aggregatePtmFromLicenseUsage(licenseUsage) {
    if (!licenseUsage || typeof licenseUsage !== 'object') return null;

    const n = (v) => {
      if (v === undefined || v === null) return null;
      const x = Number(v);
      return Number.isFinite(x) ? x : null;
    };

    const tp = n(licenseUsage.TotalProjectsCount ?? licenseUsage.totalProjectsCount
      ?? licenseUsage.TotalProjects ?? licenseUsage.totalProjects);
    const tt = n(licenseUsage.TotalTenantsCount ?? licenseUsage.totalTenantsCount
      ?? licenseUsage.TotalTenants ?? licenseUsage.totalTenants);
    const tm = n(licenseUsage.TotalMachinesCount ?? licenseUsage.totalMachinesCount
      ?? licenseUsage.TotalMachines ?? licenseUsage.totalMachines);
    if (tp != null && tt != null && tm != null) {
      return { projects: tp, tenants: tt, machines: tm };
    }

    const spaces = licenseUsage.SpacesUsage || licenseUsage.spacesUsage;
    if (!Array.isArray(spaces) || spaces.length === 0) return null;

    let projects = 0;
    let tenants = 0;
    let machines = 0;
    for (const su of spaces) {
      projects += n(su.ProjectsCount ?? su.projectsCount) ?? 0;
      tenants += n(su.TenantsCount ?? su.tenantsCount) ?? 0;
      machines += n(su.MachinesCount ?? su.machinesCount) ?? 0;
    }
    return { projects, tenants, machines };
  }

  /**
   * Map Octopus `Limits` row name → PTM bucket. Matches LicenseLimitUsageResource rows on
   * /api/licenses/licenses-current-usage and licenses-current-status (Octopus.Server.Client).
   */
  function classifyPtmLimitName(name) {
    if (!name || typeof name !== 'string') return null;
    const n = name.toLowerCase().trim();
    if (n.includes('tenant')) return 'tenants';
    if (n.includes('project')) return 'projects';
    if (n.includes('worker') && !n.includes('deployment')) return null;
    // Octopus Cloud/API uses "Targets" for licensed deployment targets (PTM machines).
    if (n === 'targets' || n.includes('machine') || n.includes('deployment target')) return 'machines';
    return null;
  }

  /**
   * Parse `Limits` array → PTM cells.
   * Display cap uses LicensedLimit (entitlement); EffectiveLimit is the grace/overage ceiling (e.g. ~10% over).
   */
  function mapLimitsArrayToPtmCells(limitsArray) {
    const out = { projects: null, tenants: null, machines: null };
    if (!Array.isArray(limitsArray)) return out;
    const n = (v) => {
      if (v === undefined || v === null) return null;
      const x = Number(v);
      return Number.isFinite(x) ? x : null;
    };
    const POSITIVE_INT_MAX = 2147483647;
    for (const lim of limitsArray) {
      const key = classifyPtmLimitName(lim.Name ?? lim.name);
      if (!key || out[key]) continue;
      const used = n(lim.CurrentUsage ?? lim.currentUsage);
      const eff = n(lim.EffectiveLimit ?? lim.effectiveLimit);
      const lic = n(lim.LicensedLimit ?? lim.licensedLimit);
      const flagUnlimited = lim.IsUnlimited === true || lim.isUnlimited === true;
      const maxIntUnlimited = eff === POSITIVE_INT_MAX && (lic === POSITIVE_INT_MAX || lic == null);
      const isUnlimited = flagUnlimited || maxIntUnlimited;
      let limit = null;
      let effectiveLimit = null;
      if (!isUnlimited) {
        limit = lic ?? eff;
        if (eff != null && lic != null && eff > lic) effectiveLimit = eff;
      }
      out[key] = { used, limit, effectiveLimit, unlimited: isUnlimited };
    }
    return out;
  }

  function normalizePtmCell(cell) {
    if (!cell) return { used: null, limit: null, effectiveLimit: null, unlimited: false };
    const unlimited = cell.unlimited === true;
    return {
      used: cell.used != null ? cell.used : null,
      limit: unlimited ? null : (cell.limit != null ? cell.limit : null),
      effectiveLimit: unlimited ? null : (cell.effectiveLimit != null ? cell.effectiveLimit : null),
      unlimited,
    };
  }

  function mergePtmCells(a, b) {
    return normalizePtmCell({
      used: a?.used ?? b?.used,
      limit: a?.limit ?? b?.limit,
      effectiveLimit: a?.effectiveLimit ?? b?.effectiveLimit,
      unlimited: !!(a && a.unlimited) || !!(b && b.unlimited),
    });
  }

  /** Prefer usage Limits, then status Limits; fill used from SpacesUsage sum or space fallback; legacy scalar limits last. */
  function buildLicensePtmSummary(licenseUsage, licenseStatus, spaceFallback) {
    const keys = ['projects', 'tenants', 'machines'];
    const usageLim = mapLimitsArrayToPtmCells(licenseUsage?.Limits || licenseUsage?.limits);
    const statusLim = mapLimitsArrayToPtmCells(licenseStatus?.Limits || licenseStatus?.limits);
    const fromAgg = aggregatePtmFromLicenseUsage(licenseUsage);
    const legacyLimits = extractPtmLegacyScalarLimits(licenseStatus);

    const ptm = {};
    for (const key of keys) {
      let cell = mergePtmCells(usageLim[key], statusLim[key]);
      let used = cell.used;
      if (used == null && fromAgg) used = fromAgg[key];
      if (used == null && spaceFallback) used = spaceFallback[key];

      let { limit, effectiveLimit, unlimited } = cell;
      if (!unlimited && limit == null && legacyLimits[key] != null) limit = legacyLimits[key];

      ptm[key] = { used: used ?? null, limit, effectiveLimit: unlimited ? null : effectiveLimit, unlimited };
    }

    const hasLimitsArray = (Array.isArray(licenseUsage?.Limits) && licenseUsage.Limits.length > 0)
      || (Array.isArray(licenseUsage?.limits) && licenseUsage.limits.length > 0)
      || (Array.isArray(licenseStatus?.Limits) && licenseStatus.Limits.length > 0)
      || (Array.isArray(licenseStatus?.limits) && licenseStatus.limits.length > 0);

    const source = hasLimitsArray ? 'license-limits' : fromAgg ? 'license-usage-spaces' : 'spaces-aggregate';
    return { ptm, source };
  }

  /** Legacy flat limit fields on status (not the Limits[] resource). */
  function extractPtmLegacyScalarLimits(licenseStatus) {
    const out = { projects: null, tenants: null, machines: null };
    if (!licenseStatus || typeof licenseStatus !== 'object') return out;

    const tryKeys = (obj, keys) => {
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
      for (const k of keys) {
        const v = obj[k];
        if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v;
      }
      return null;
    };

    const buckets = [
      licenseStatus,
      licenseStatus.License,
      licenseStatus.license,
      licenseStatus.LicenseDetails,
    ];

    const projectKeys = ['MaximumProjects', 'MaximumLicensedProjects', 'LicensedProjectMaximum', 'ProjectLimit'];
    const tenantKeys = ['MaximumTenants', 'LicensedTenantMaximum', 'TenantLimit'];
    const machineKeys = ['MaximumMachines', 'MaximumDeploymentTargets', 'MachineLimit', 'DeploymentTargetLimit', 'LicensedMachineLimit'];

    for (const o of buckets) {
      if (out.projects == null) out.projects = tryKeys(o, projectKeys);
      if (out.tenants == null) out.tenants = tryKeys(o, tenantKeys);
      if (out.machines == null) out.machines = tryKeys(o, machineKeys);
    }
    return out;
  }

  // ---- Aggregation / Summary ----

  function getSummary(usageByName) {
    const allDeployments = [];
    const spaceBreakdown = [];
    let totalProjects = 0;
    let totalReleases = 0;
    let totalRunbooks = 0;
    let totalSuccessful = 0;
    let totalFailed = 0;
    let totalCancelled = 0;
    let totalDeploymentsCount = 0;
    let totalTargets = 0;
    let healthyTargets = 0;
    const envHealthMap = {};     // envName → { success, failed, total, machines, healthy }
    const projectDeployMap = {}; // global project → deployment data

    for (const [spaceId, data] of Object.entries(_spaceData)) {
      const { space, projects, projectNames, environments, envNames, dashboard, deployments, 
              totalDeployments, machines, targetCount, machineHealth, releaseCount, runbookCount } = data;

      totalProjects += projects.length;
      totalReleases += releaseCount;
      totalRunbooks += runbookCount;
      totalTargets += targetCount;
      healthyTargets += (machineHealth.Healthy || 0);

      // Seed envHealthMap from the full environment list so environments with no
      // dashboard items (e.g. disabled/deleted, or never-deployed) still show up
      // with "No data" instead of disappearing entirely.
      for (const env of (environments || [])) {
        const envId = env?.Id;
        if (!envId) continue;
        const envName = (envNames && envNames[envId]) || env?.Name || envId;
        if (!envHealthMap[envName]) {
          envHealthMap[envName] = { success: 0, failed: 0, total: 0, spaces: new Set() };
        }
        envHealthMap[envName].spaces.add(space.Name);
      }

      // Count deployment states
      let spaceSuccessful = 0;
      let spaceFailed = 0;
      let spaceCancelled = 0;

      for (const dep of deployments) {
        // Deployments list doesn't have State directly — we look it up from tasks later
        // But the dashboard items DO have State
        allDeployments.push({
          ...dep,
          _spaceName: space.Name,
          _spaceId: space.Id,
          _projectName: projectNames[dep.ProjectId] || dep.ProjectId,
          _envName: envNames[dep.EnvironmentId] || dep.EnvironmentId,
        });
      }

      // Use dashboard items for state (these represent the LATEST state per project/env)
      // But for historical success rate, use deployment list + cross-space tasks
      if (dashboard && dashboard.Items) {
        for (const item of dashboard.Items) {
          const state = (item.State || '').toLowerCase();
          // Track env health from dashboard items (latest per project/env)
          const envName = envNames[item.EnvironmentId] || item.EnvironmentId;
          if (!envHealthMap[envName]) envHealthMap[envName] = { success: 0, failed: 0, total: 0, spaces: new Set() };
          envHealthMap[envName].total++;
          envHealthMap[envName].spaces.add(space.Name);
          if (state === 'success') envHealthMap[envName].success++;
          else if (state === 'failed') envHealthMap[envName].failed++;
        }
      }

      // Count from cross-space tasks for this space
      const spaceTasks = _crossSpaceTasks.filter(t => t.SpaceId === spaceId);
      for (const task of spaceTasks) {
        const state = (task.State || '').toLowerCase();
        if (state === 'success') spaceSuccessful++;
        else if (state === 'failed') spaceFailed++;
        else if (state === 'canceled' || state === 'cancelled') spaceCancelled++;
      }

      // If no tasks data, fall back to counting from dashboard items
      if (spaceTasks.length === 0 && dashboard?.Items) {
        for (const item of dashboard.Items) {
          const state = (item.State || '').toLowerCase();
          if (state === 'success') spaceSuccessful++;
          else if (state === 'failed') spaceFailed++;
        }
      }

      totalSuccessful += spaceSuccessful;
      totalFailed += spaceFailed;
      totalCancelled += spaceCancelled;
      totalDeploymentsCount += totalDeployments;

      const spaceTotal = spaceSuccessful + spaceFailed + spaceCancelled;
      const successRate = spaceTotal > 0 ? (spaceSuccessful / spaceTotal * 100) : 0;

      // Find last deployment time
      let lastDeployment = null;
      if (deployments.length > 0) {
        lastDeployment = deployments[0].Created || deployments[0].QueueTime;
      }

      // Machine health for this space
      const spaceHealthy = machineHealth.Healthy || 0;
      const spaceUnhealthy = (machineHealth.Unhealthy || 0) + (machineHealth.Unavailable || 0);
      const spaceWarning = machineHealth.HasWarnings || 0;

      spaceBreakdown.push({
        id: space.Id,
        name: space.Name,
        description: space.Description || '',
        projectCount: projects.length,
        environmentCount: environments.length,
        deploymentCount: totalDeployments,
        successRate: Math.round(successRate),
        successCount: spaceSuccessful,
        failedCount: spaceFailed,
        cancelledCount: spaceCancelled,
        lastDeployment,
        environments: environments.map(e => e.Name),
        targetCount,
        healthyTargets: spaceHealthy,
        unhealthyTargets: spaceUnhealthy,
        warningTargets: spaceWarning,
        releaseCount,
        runbookCount,
      });
    }

    // Sort all deployments by date descending
    allDeployments.sort((a, b) => {
      const da = new Date(a.Created || a.QueueTime || 0);
      const db = new Date(b.Created || b.QueueTime || 0);
      return db - da;
    });

    // Enrich recent deployments with state from dashboard data + cross-space tasks
    const dashboardStateMap = {};
    for (const [spaceId, data] of Object.entries(_spaceData)) {
      if (data.dashboard?.Items) {
        for (const item of data.dashboard.Items) {
          dashboardStateMap[item.DeploymentId] = item;
        }
      }
    }

    // Map task states back to deployments via TaskId
    const taskStateMap = {};
    for (const task of _crossSpaceTasks) {
      taskStateMap[task.Id] = task;
    }

    const enrichedDeployments = allDeployments.map(dep => {
      const dashItem = dashboardStateMap[dep.Id];
      const task = dep.TaskId ? taskStateMap[dep.TaskId] : null;
      return {
        ...dep,
        State: dashItem?.State || task?.State || dep.State || 'Unknown',
        Duration: dashItem?.Duration || dep.Duration || '--',
        ReleaseVersion: dashItem?.ReleaseVersion || dep.ReleaseVersion || dep.ReleaseId,
        CompletedTime: dashItem?.CompletedTime || task?.CompletedTime || dep.CompletedTime,
      };
    });

    // Overall success rate
    const totalRated = totalSuccessful + totalFailed + totalCancelled;
    const overallSuccessRate = totalRated > 0 ? (totalSuccessful / totalRated * 100) : 0;

    // Build weekly trend from deployment timestamps (since the weekly report endpoint is deprecated)
    const weeklyTrend = computeWeeklyTrend(enrichedDeployments);
    const dailyTrend = computeDailyTrend(enrichedDeployments, 30);

    // Deployment frequency (per day over last 30 days)
    const now = new Date();
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const recentAll = enrichedDeployments.filter(d => new Date(d.Created || d.QueueTime) >= thirtyDaysAgo);
    const deployFrequency = recentAll.length > 0 ? (recentAll.length / 30) : 0;

    // Average deployment duration from cross-space tasks
    const avgDuration = computeAvgDuration(_crossSpaceTasks);

    // Target health percentage
    const healthyPct = totalTargets > 0 ? Math.round(healthyTargets / totalTargets * 100) : 0;

    // License: PTM from Limits[] on usage/status (used + cap / unlimited), else SpacesUsage, else loaded spaces
    const { ptm: ptmCells, source: ptmSource } = buildLicensePtmSummary(
      _licenseUsage,
      _licenseStatus,
      { projects: totalProjects, tenants: null, machines: totalTargets },
    );

    const licenseInfo = {
      isCompliant: _licenseStatus?.IsCompliant,
      daysToExpiry: _licenseStatus?.DaysToEffectiveExpiryDate,
      expiryDate: _licenseStatus?.EffectiveExpiryDate,
      hostingEnv: _licenseStatus?.HostingEnvironment,
      complianceSummary: _licenseStatus?.ComplianceSummary || null,
      ptm: {
        projects: ptmCells.projects,
        tenants: ptmCells.tenants,
        machines: ptmCells.machines,
        source: ptmSource,
      },
    };

    // Teams (per-space fetch in fetchSpaceData)
    const teamRows = [];
    let teamsAnyDenied = false;
    let teamsAnyOkFetch = false;
    let teamsAnyError = false;
    for (const [spaceId, data] of Object.entries(_spaceData)) {
      const acc = data.teamsAccess || 'ok';
      if (acc === 'denied') teamsAnyDenied = true;
      else if (acc === 'error') teamsAnyError = true;
      else teamsAnyOkFetch = true;

      const spaceName = data.space?.Name || spaceId;
      for (const t of (data.teams || [])) {
        const unrestricted = !t.ProjectIds || t.ProjectIds.length === 0;
        const projSet = unrestricted ? null : new Set(t.ProjectIds);
        let recentDeploysInScope = 0;
        for (const d of (data.deployments || [])) {
          if (unrestricted || projSet.has(d.ProjectId)) recentDeploysInScope++;
        }
        const scopedRoles = t.SpaceTeamScopedUserRoles || t.spaceTeamScopedUserRoles || [];
        const roleN = Array.isArray(scopedRoles) ? scopedRoles.length : 0;
        teamRows.push({
          spaceId,
          spaceName,
          id: t.Id,
          name: t.Name || '—',
          memberCount: (t.MemberUserIds || []).length,
          projectsLabel: unrestricted ? 'All projects' : String(t.ProjectIds.length),
          envScopeLabel: (t.EnvironmentIds && t.EnvironmentIds.length) ? String(t.EnvironmentIds.length) : '—',
          scopedRoles: roleN,
          recentDeploysInScope,
        });
      }
    }
    teamRows.sort((a, b) => {
      const s = (a.spaceName || '').localeCompare(b.spaceName || '');
      if (s !== 0) return s;
      return (a.name || '').localeCompare(b.name || '');
    });
    const teamsInsight = {
      rows: teamRows,
      totalTeams: teamRows.length,
      anyDenied: teamsAnyDenied,
      anyOkFetch: teamsAnyOkFetch,
      anyError: teamsAnyError,
    };

    return {
      serverInfo: _serverInfo,
      lastFetch: _lastFetch,
      spaces: _spaces,
      licenseInfo,

      // KPIs
      kpi: {
        totalDeployments: totalDeploymentsCount,
        successRate: Math.round(overallSuccessRate),
        activeProjects: totalProjects,
        activeSpaces: Object.keys(_spaceData).length,
        totalSpaces: _spaces.length,
        deployFrequency: deployFrequency.toFixed(1),
        avgDuration,
        totalTargets,
        healthyTargets,
        healthyTargetsPct: healthyPct,
        totalReleases,
        totalRunbooks,
      },

      // Breakdown
      spaceBreakdown: spaceBreakdown.sort((a, b) => b.deploymentCount - a.deploymentCount),
      envHealth: Object.entries(envHealthMap).map(([name, data]) => ({
        name,
        success: data.success,
        failed: data.failed,
        total: data.total,
        spaces: [...data.spaces],
        successRate: data.total > 0 ? Math.round(data.success / data.total * 100) : 0,
      })),

      // Recent deploys (top 20)
      recentDeployments: enrichedDeployments.slice(0, 20),

      // Trends
      weeklyTrend,
      dailyTrend,

      // Counts for donut
      successCount: totalSuccessful,
      failedCount: totalFailed,
      cancelledCount: totalCancelled,

      teamsInsight,
    };
  }

  /**
   * Compute weekly deployment trend from deployment timestamps.
   * Groups deployments by ISO week and counts success/failed.
   */
  function computeWeeklyTrend(deployments) {
    const weekMap = {}; // "YYYY-WW" → { year, week, success, failed, total }

    for (const dep of deployments) {
      const created = dep.Created || dep.QueueTime;
      if (!created) continue;

      const date = new Date(created);
      const { year, week } = getISOWeek(date);
      const key = `${year}-${String(week).padStart(2, '0')}`;

      if (!weekMap[key]) weekMap[key] = { year, week, success: 0, failed: 0, total: 0 };
      weekMap[key].total++;

      const state = (dep.State || '').toLowerCase();
      if (state === 'success') weekMap[key].success++;
      else if (state === 'failed') weekMap[key].failed++;
    }

    const sorted = Object.values(weekMap)
      .sort((a, b) => {
        if (a.year !== b.year) return a.year - b.year;
        return a.week - b.week;
      })
      .slice(-52); // Keep up to a year of weekly data

    // Mark year boundaries so the chart can show them
    for (let i = 0; i < sorted.length; i++) {
      sorted[i].showYear = (i === 0) || (sorted[i].year !== sorted[i - 1].year);
    }

    return sorted;
  }

  /**
   * Last `numDays` UTC calendar days (today inclusive), including days with zero deployments.
   */
  function computeDailyTrend(deployments, numDays = 30) {
    const dayMap = {};
    const today = new Date();
    const endUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());

    for (let i = numDays - 1; i >= 0; i--) {
      const d = new Date(endUtc - i * 86400000);
      const key = d.toISOString().slice(0, 10);
      dayMap[key] = {
        dateKey: key,
        year: d.getUTCFullYear(),
        month: d.getUTCMonth(),
        day: d.getUTCDate(),
        success: 0,
        failed: 0,
        total: 0,
      };
    }

    for (const dep of deployments) {
      const created = dep.Created || dep.QueueTime;
      if (!created) continue;
      const key = new Date(created).toISOString().slice(0, 10);
      if (!dayMap[key]) continue;
      dayMap[key].total++;
      const state = (dep.State || '').toLowerCase();
      if (state === 'success') dayMap[key].success++;
      else if (state === 'failed') dayMap[key].failed++;
    }

    return Object.keys(dayMap).sort().map(k => dayMap[k]);
  }

  /**
   * Get ISO week number for a date.
   */
  function getISOWeek(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return { year: d.getUTCFullYear(), week: weekNo };
  }

  /**
   * Compute average deployment duration from task data.
   * Returns a human-readable string like "2m 30s"
   */
  function computeAvgDuration(tasks) {
    if (!tasks || tasks.length === 0) return '--';

    let totalSeconds = 0;
    let count = 0;

    for (const task of tasks) {
      const start = task.StartTime ? new Date(task.StartTime) : null;
      const end = task.CompletedTime ? new Date(task.CompletedTime) : null;
      if (start && end) {
        const diffMs = end - start;
        if (diffMs > 0 && diffMs < 3600000) { // ignore > 1 hour (likely stuck)
          totalSeconds += diffMs / 1000;
          count++;
        }
      }
    }

    if (count === 0) return '--';
    const avgSecs = Math.round(totalSeconds / count);

    if (avgSecs < 60) return `${avgSecs}s`;
    const mins = Math.floor(avgSecs / 60);
    const secs = avgSecs % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }

  // ---- Analysis helpers for Trends & Velocity views ----

  function _guessEnvClass(name) {
    const n = (name || '').toLowerCase();
    if (n.includes('prod') && !n.includes('pre-prod') && !n.includes('preprod') && !n.includes('non-prod') && !n.includes('nonprod')) return 'production';
    if (n.includes('stag') || n.includes('uat') || n.includes('pre-prod') || n.includes('preprod') || n.includes('test')) return 'staging';
    return 'dev';
  }

  function computeDayOfWeekDistribution() {
    const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const counts = new Array(7).fill(0);
    for (const sd of Object.values(_spaceData)) {
      for (const dep of (sd.deployments || [])) {
        const d = new Date(dep.Created || dep.QueueTime);
        if (isNaN(d.getTime())) continue;
        const jsDay = d.getUTCDay();
        counts[jsDay === 0 ? 6 : jsDay - 1]++;
      }
    }
    return DAYS.map((name, i) => ({ name, count: counts[i], isWeekend: i >= 5 }));
  }

  function computeHourOfDayDistribution() {
    const counts = new Array(24).fill(0);
    for (const sd of Object.values(_spaceData)) {
      for (const dep of (sd.deployments || [])) {
        const d = new Date(dep.Created || dep.QueueTime);
        if (isNaN(d.getTime())) continue;
        counts[d.getUTCHours()]++;
      }
    }
    return counts.map((count, hour) => ({ hour, count }));
  }

  function computePerEnvTypeDeployments() {
    const types = { production: 0, staging: 0, dev: 0 };
    const perEnv = {};
    for (const sd of Object.values(_spaceData)) {
      const envNames = sd.envNames || {};
      for (const dep of (sd.deployments || [])) {
        const envName = envNames[dep.EnvironmentId] || dep.EnvironmentId || 'Unknown';
        const cls = _guessEnvClass(envName);
        types[cls] = (types[cls] || 0) + 1;
        if (!perEnv[envName]) perEnv[envName] = { name: envName, cls, count: 0, success: 0, failed: 0 };
        perEnv[envName].count++;
        const state = (dep.State || '').toLowerCase();
        if (state === 'success') perEnv[envName].success++;
        else if (state === 'failed') perEnv[envName].failed++;
      }
    }
    return { types, environments: Object.values(perEnv).sort((a, b) => b.count - a.count) };
  }

  function computeTrendChange(weeklyTrend) {
    if (!weeklyTrend || weeklyTrend.length < 2) return null;
    const recent = weeklyTrend.slice(-4);
    const prior = weeklyTrend.slice(-8, -4);
    if (prior.length === 0) return null;
    const recentAvg = recent.reduce((s, w) => s + w.total, 0) / recent.length;
    const priorAvg = prior.reduce((s, w) => s + w.total, 0) / prior.length;
    if (priorAvg === 0) return recentAvg > 0 ? { pct: 100, direction: 'up' } : { pct: 0, direction: 'flat' };
    const pct = Math.round(((recentAvg - priorAvg) / priorAvg) * 100);
    return {
      pct: Math.abs(pct),
      direction: pct > 5 ? 'up' : pct < -5 ? 'down' : 'flat',
      recentAvg: Math.round(recentAvg * 10) / 10,
      priorAvg: Math.round(priorAvg * 10) / 10,
    };
  }

  function computeProjectVelocity() {
    const projects = [];
    const now = new Date();
    const thirtyDaysAgo = new Date(now - 30 * 86400000);
    for (const [spaceId, sd] of Object.entries(_spaceData)) {
      const spaceName = sd.space?.Name || spaceId;
      for (const proj of (sd.projects || [])) {
        const projDeps = (sd.deployments || []).filter(d => d.ProjectId === proj.Id);
        const recentDeps = projDeps.filter(d => new Date(d.Created || d.QueueTime) >= thirtyDaysAgo);
        const successCount = projDeps.filter(d => (d.State || '').toLowerCase() === 'success').length;
        const rate = projDeps.length > 0 ? Math.round(successCount / projDeps.length * 100) : null;
        const prodDeps = projDeps.filter(d => {
          const envName = (sd.envNames || {})[d.EnvironmentId] || '';
          return _guessEnvClass(envName) === 'production';
        });
        projects.push({
          name: proj.Name || proj.Id,
          space: spaceName,
          spaceId,
          totalDeploys: projDeps.length,
          recentDeploys: recentDeps.length,
          deploysPerWeek: recentDeps.length > 0 ? (recentDeps.length / 4.3).toFixed(1) : '0',
          successRate: rate,
          prodDeploys: prodDeps.length,
          lastDeploy: projDeps.length > 0 ? projDeps[0].Created || projDeps[0].QueueTime : null,
        });
      }
    }
    projects.sort((a, b) => b.recentDeploys - a.recentDeploys);
    return projects;
  }

  function computeDurationPercentiles() {
    const durations = [];
    for (const t of (_crossSpaceTasks || [])) {
      if (!t.StartTime || !t.CompletedTime) continue;
      const ms = new Date(t.CompletedTime) - new Date(t.StartTime);
      if (ms > 0 && ms < 3600000) durations.push(ms / 1000);
    }
    if (durations.length === 0) return null;
    durations.sort((a, b) => a - b);
    const pct = (p) => durations[Math.min(Math.floor(durations.length * p), durations.length - 1)];
    return {
      avg: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
      p50: Math.round(pct(0.5)),
      p90: Math.round(pct(0.9)),
      p95: Math.round(pct(0.95)),
      min: Math.round(durations[0]),
      max: Math.round(durations[durations.length - 1]),
      count: durations.length,
    };
  }

  // ---- Historical Enrichment Engine ----
  // Pages through older deploy tasks in the background, building approximate
  // aggregate histograms for duration percentiles and trend buckets.
  // Aggregates are cached in localStorage so subsequent loads are near-instant.

  const ENRICH_PAGE = 200;
  const ENRICH_CAP = 10000;
  const INITIAL_TAKE = 200;
  const CACHE_PFX = 'vdash_hist_';
  const CACHE_MAX_AGE = 4 * 3600 * 1000; // 4 hours

  let _enrichment = { state: 'idle', lookbackMonths: 3, tasksFetched: 0, oldestDate: null, progress: 0, error: null };
  let _enrichCancelled = false;
  let _histAgg = null;

  function _histKey() {
    const url = OctopusApi.getInstanceUrl() || '';
    let h = 0;
    for (let i = 0; i < url.length; i++) { h = ((h << 5) - h) + url.charCodeAt(i); h |= 0; }
    return CACHE_PFX + Math.abs(h).toString(36);
  }

  function _loadHistCache() {
    try {
      const raw = localStorage.getItem(_histKey());
      if (!raw) return null;
      const c = JSON.parse(raw);
      if (c.version !== 1 || c.serverUrl !== OctopusApi.getInstanceUrl()) return null;
      if (Date.now() - new Date(c.updatedAt).getTime() > CACHE_MAX_AGE) return null;
      return c;
    } catch { return null; }
  }

  function _saveHistCache(agg) {
    try {
      localStorage.setItem(_histKey(), JSON.stringify({
        version: 1,
        serverUrl: OctopusApi.getInstanceUrl(),
        updatedAt: new Date().toISOString(),
        lookbackMonths: agg.lookbackMonths,
        durationBucketWidth: agg.durationBucketWidth,
        durationBuckets: agg.durationBuckets,
        durationStats: agg.durationStats,
        weeklyBuckets: agg.weeklyBuckets,
        dowCounts: agg.dowCounts,
        hodCounts: agg.hodCounts,
        spaceTotals: agg.spaceTotals,
        totalTasksFetched: agg.totalTasksFetched,
        oldestTaskDate: agg.oldestTaskDate,
      }));
    } catch (e) { log('History cache save failed', e.message); }
  }

  function _emptyAgg(lookbackMonths) {
    return {
      lookbackMonths,
      durationBucketWidth: 30,
      durationBuckets: new Array(120).fill(0), // 0–3600s in 30s bins
      durationStats: { count: 0, sum: 0, min: Infinity, max: 0 },
      weeklyBuckets: {},
      dowCounts: new Array(7).fill(0),
      hodCounts: new Array(24).fill(0),
      spaceTotals: {},
      totalTasksFetched: 0,
      oldestTaskDate: null,
    };
  }

  function _accTask(agg, task) {
    if (task.StartTime && task.CompletedTime) {
      const secs = (new Date(task.CompletedTime) - new Date(task.StartTime)) / 1000;
      if (secs > 0 && secs < 3600) {
        const bi = Math.min(Math.floor(secs / agg.durationBucketWidth), agg.durationBuckets.length - 1);
        agg.durationBuckets[bi]++;
        agg.durationStats.count++;
        agg.durationStats.sum += secs;
        agg.durationStats.min = Math.min(agg.durationStats.min, secs);
        agg.durationStats.max = Math.max(agg.durationStats.max, secs);
      }
    }
    const ts = task.CompletedTime || task.QueueTime;
    if (ts) {
      const d = new Date(ts);
      if (!isNaN(d.getTime())) {
        const { year, week } = getISOWeek(d);
        const wk = `${year}-W${String(week).padStart(2, '0')}`;
        if (!agg.weeklyBuckets[wk]) agg.weeklyBuckets[wk] = { year, week, success: 0, failed: 0, total: 0 };
        agg.weeklyBuckets[wk].total++;
        const st = (task.State || '').toLowerCase();
        if (st === 'success') agg.weeklyBuckets[wk].success++;
        else if (st === 'failed') agg.weeklyBuckets[wk].failed++;
        agg.dowCounts[d.getUTCDay() === 0 ? 6 : d.getUTCDay() - 1]++;
        agg.hodCounts[d.getUTCHours()]++;
      }
    }
    if (task.SpaceId) {
      if (!agg.spaceTotals[task.SpaceId]) agg.spaceTotals[task.SpaceId] = { success: 0, failed: 0, total: 0 };
      agg.spaceTotals[task.SpaceId].total++;
      const st = (task.State || '').toLowerCase();
      if (st === 'success') agg.spaceTotals[task.SpaceId].success++;
      else if (st === 'failed') agg.spaceTotals[task.SpaceId].failed++;
    }
    agg.totalTasksFetched++;
    const td = task.CompletedTime || task.QueueTime || task.StartTime;
    if (td && (!agg.oldestTaskDate || new Date(td) < new Date(agg.oldestTaskDate))) {
      agg.oldestTaskDate = td;
    }
  }

  function _percFromHist(agg) {
    const { durationBuckets, durationBucketWidth, durationStats } = agg;
    if (!durationStats || durationStats.count === 0) return null;
    const total = durationStats.count;
    const thr = { p50: Math.floor(total * 0.5), p90: Math.floor(total * 0.9), p95: Math.floor(total * 0.95) };
    let cum = 0;
    const r = { p50: null, p90: null, p95: null };
    for (let i = 0; i < durationBuckets.length; i++) {
      cum += durationBuckets[i];
      const mid = Math.round((i + 0.5) * durationBucketWidth);
      for (const [k, v] of Object.entries(thr)) { if (r[k] === null && cum >= v) r[k] = mid; }
    }
    return {
      avg: Math.round(durationStats.sum / durationStats.count),
      p50: r.p50 || 0, p90: r.p90 || 0, p95: r.p95 || 0,
      min: Math.round(durationStats.min === Infinity ? 0 : durationStats.min),
      max: Math.round(durationStats.max),
      count: durationStats.count,
    };
  }

  /**
   * Start background enrichment: pages through task history for the given
   * lookback period, calling onProgress with state updates.
   * Re-renders the active view on completion via the callback.
   */
  async function startHistoricalEnrichment(lookbackMonths, onProgress) {
    _enrichCancelled = true;
    await new Promise(r => setTimeout(r, 50));
    _enrichCancelled = false;

    const allTime = lookbackMonths === 0;
    _enrichment = { state: 'loading', lookbackMonths, tasksFetched: 0, oldestDate: null, progress: 0, error: null };
    const notify = () => { if (onProgress) onProgress({ ..._enrichment }); };
    notify();

    try {
      const cached = _loadHistCache();
      const cacheValid = cached && cached.totalTasksFetched > 0 &&
        cached.lookbackMonths === lookbackMonths;
      if (cacheValid) {
        _histAgg = cached;
        Object.assign(_enrichment, { state: 'complete', progress: 100, tasksFetched: cached.totalTasksFetched, oldestDate: cached.oldestTaskDate });
        notify();
        log('History from cache', { tasks: cached.totalTasksFetched, oldest: cached.oldestTaskDate });
        return;
      }

      const agg = _emptyAgg(lookbackMonths);
      for (const task of _crossSpaceTasks) _accTask(agg, task);
      _histAgg = agg;

      const useCutoff = !allTime;
      let cutoff = null;
      if (useCutoff) {
        cutoff = new Date();
        cutoff.setMonth(cutoff.getMonth() - lookbackMonths);
      }

      // Early-out: check if initial load already reaches the cutoff
      if (useCutoff && _crossSpaceTasks.length > 0) {
        const oldest = _crossSpaceTasks.reduce((min, t) => {
          const d = new Date(t.CompletedTime || t.QueueTime || t.StartTime || 0);
          return !isNaN(d.getTime()) && d < min ? d : min;
        }, new Date());
        if (oldest <= cutoff) {
          Object.assign(_enrichment, { state: 'complete', progress: 100, tasksFetched: agg.totalTasksFetched, oldestDate: agg.oldestTaskDate });
          _saveHistCache(agg);
          notify();
          log('Initial load covers lookback');
          return;
        }
      }

      if (_activeSpaceIds.length === 0) {
        Object.assign(_enrichment, { state: 'complete', progress: 100 });
        notify();
        return;
      }

      const CHUNK = 25;
      let estimatedTotal = null;

      for (let c = 0; c < _activeSpaceIds.length; c += CHUNK) {
        const ids = _activeSpaceIds.slice(c, c + CHUNK).join(',');
        let skip = INITIAL_TAKE;
        let chunkDone = false;

        while (!chunkDone && agg.totalTasksFetched < ENRICH_CAP) {
          if (_enrichCancelled) return;

          let resp;
          try {
            resp = await OctopusApi.get(
              `/api/tasks?spaces=${encodeURIComponent(ids)}&name=Deploy&states=Success,Failed&take=${ENRICH_PAGE}&skip=${skip}`
            );
          } catch (err) {
            if (err.status === 401 || err.status === 403) {
              Object.assign(_enrichment, { state: 'error', error: 'Permission denied — your API key may lack TaskView permission.' });
              notify();
              log('Enrichment: auth/permission error', err.status);
              return;
            }
            if (err.status === 404) { chunkDone = true; break; }
            throw err;
          }

          if (!resp?.Items?.length) { chunkDone = true; break; }
          if (!estimatedTotal && resp.TotalResults) estimatedTotal = resp.TotalResults;

          for (const task of resp.Items) {
            if (useCutoff) {
              const td = new Date(task.CompletedTime || task.QueueTime || task.StartTime || 0);
              if (td < cutoff) { chunkDone = true; break; }
            }
            _accTask(agg, task);
          }

          skip += ENRICH_PAGE;
          _histAgg = agg;

          const pct = estimatedTotal
            ? Math.min(95, Math.round((agg.totalTasksFetched / Math.min(estimatedTotal, ENRICH_CAP)) * 100))
            : Math.min(95, Math.round((skip / 2000) * 100));
          Object.assign(_enrichment, { progress: pct, tasksFetched: agg.totalTasksFetched, oldestDate: agg.oldestTaskDate });
          notify();

          log(`Enrichment: ${agg.totalTasksFetched} tasks, oldest ${agg.oldestTaskDate}`);
        }
      }

      _saveHistCache(agg);
      Object.assign(_enrichment, { state: 'complete', progress: 100, tasksFetched: agg.totalTasksFetched, oldestDate: agg.oldestTaskDate });
      notify();
      log('Enrichment complete', { tasks: agg.totalTasksFetched, oldest: agg.oldestTaskDate });

    } catch (err) {
      if (_enrichCancelled) return;
      Object.assign(_enrichment, { state: 'error', error: err.message });
      notify();
      log('Enrichment failed', err.message);
    }
  }

  function getEnrichmentState() { return { ..._enrichment }; }

  function getHistoricalDurationPercentiles() {
    if (_histAgg) return _percFromHist(_histAgg);
    return computeDurationPercentiles();
  }

  function getHistoricalWeeklyTrend() {
    if (!_histAgg?.weeklyBuckets) return null;
    const entries = Object.values(_histAgg.weeklyBuckets);
    if (entries.length === 0) return null;
    const sorted = entries.sort((a, b) => a.year !== b.year ? a.year - b.year : a.week - b.week).slice(-52);
    for (let i = 0; i < sorted.length; i++) {
      sorted[i].showYear = i === 0 || sorted[i].year !== sorted[i - 1].year;
    }
    return sorted;
  }

  function getHistoricalAggregates() { return _histAgg; }

  function cancelEnrichment() { _enrichCancelled = true; _enrichment.state = 'idle'; }

  function clearHistoryCache() {
    try { localStorage.removeItem(_histKey()); } catch {}
    _histAgg = null;
  }

  function _lookbackLabel(months) {
    if (months === 0) return 'all time';
    if (months < 12) return `last ${months} months`;
    const y = months / 12;
    if (Number.isInteger(y)) return y === 1 ? 'last year' : `last ${y} years`;
    return `last ${months} months`;
  }

  /**
   * Time-filtered KPIs from enriched aggregates. Returns null if no
   * enriched data is available yet. Structural KPIs (spaces, projects,
   * targets, releases) are not included — they don't vary by period.
   */
  function computeEnrichedKPIs() {
    if (!_histAgg) return null;
    const agg = _histAgg;
    // If the enrichment aggregate has no buckets or no tasks were fetched,
    // treat this as "no enriched data" so callers fall back to base KPIs.
    if (!agg.weeklyBuckets || Object.keys(agg.weeklyBuckets).length === 0 || agg.totalTasksFetched === 0) {
      return null;
    }
    // If the enrichment aggregate has no buckets or no tasks were fetched,
    // treat this as "no enriched data" so callers fall back to base KPIs.
    if (!agg.weeklyBuckets || Object.keys(agg.weeklyBuckets).length === 0 || agg.totalTasksFetched === 0) {
      return null;
    }
    let total = 0, success = 0, failed = 0;
    for (const w of Object.values(agg.weeklyBuckets)) {
      total += w.total;
      success += w.success;
      failed += w.failed;
    }
    const rated = success + failed;
    const successRate = rated > 0 ? Math.round(success / rated * 100) : 0;

    // For all-time (0), compute actual days from oldest task to now
    let days;
    if (agg.lookbackMonths === 0 && agg.oldestTaskDate) {
      days = Math.max(1, Math.ceil((Date.now() - new Date(agg.oldestTaskDate).getTime()) / 86400000));
    } else {
      days = Math.max(1, agg.lookbackMonths * 30);
    }
    const deployFrequency = total > 0 ? (total / days).toFixed(1) : '0';

    let avgDuration = '--';
    if (agg.durationStats.count > 0) {
      const s = Math.round(agg.durationStats.sum / agg.durationStats.count);
      if (s < 60) avgDuration = `${s}s`;
      else { const m = Math.floor(s / 60); const r = s % 60; avgDuration = r > 0 ? `${m}m ${r}s` : `${m}m`; }
    }
    return {
      totalDeployments: total,
      successRate,
      deployFrequency,
      avgDuration,
      lookbackMonths: agg.lookbackMonths,
      periodLabel: _lookbackLabel(agg.lookbackMonths),
      totalSuccess: success,
      totalFailed: failed,
      durationCount: agg.durationStats.count,
    };
  }

  // ---- Public API ----

  return {
    fetchAll,
    getSummary: () => getSummary({}),
    getSpaces: () => _spaces,
    getSpaceData: (id) => _spaceData[id],
    getAllSpaceData: () => _spaceData,
    getCrossSpaceTasks: () => _crossSpaceTasks,
    getServerInfo: () => _serverInfo,
    getLastFetch: () => _lastFetch,
    getLicenseUsage: () => _licenseUsage,
    getLicenseStatus: () => _licenseStatus,
    computeDayOfWeekDistribution,
    computeHourOfDayDistribution,
    computePerEnvTypeDeployments,
    computeTrendChange,
    computeProjectVelocity,
    computeDurationPercentiles,
    startHistoricalEnrichment,
    getEnrichmentState,
    getHistoricalDurationPercentiles,
    getHistoricalWeeklyTrend,
    getHistoricalAggregates,
    cancelEnrichment,
    clearHistoryCache,
    computeEnrichedKPIs,
  };

})();


/* ==========================================================================
   Dashboard UI Binding
   
   Wires DashboardData into the DOM elements.
   ========================================================================== */

const DashboardUI = (() => {

  let _loadingDepth = 0;

  async function loadDashboard() {
    if (!OctopusApi.isConfigured()) return;

    setLoading(true);

    try {
      const summary = await DashboardData.fetchAll((msg) => {
        setStatusMessage(msg);
      });

      renderKPIs(summary.kpi);
      renderSpaceBreakdown(summary.spaceBreakdown);
      renderRecentDeployments(summary.recentDeployments);
      renderEnvHealth(summary.envHealth);
      renderSuccessFailureChart(summary);
      renderWeeklyTrend(summary.weeklyTrend, summary.dailyTrend);
      renderLicenseInfo(summary.licenseInfo);
      updateRefreshTime();
      updateConnectionStatus();
      setStatusMessage(null);

    } catch (err) {
      console.error('Dashboard load error:', err);
      setStatusMessage(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  function setLoading(loading) {
    const overlay = document.getElementById('metrics-loading-overlay');
    const detail = document.getElementById('metrics-loading-detail');
    const card = document.getElementById('metrics-loading-card');

    if (loading) {
      _loadingDepth++;
      document.body.classList.add('is-loading');
      if (_loadingDepth !== 1) return;

      if (detail && detail.dataset.defaultText) {
        detail.textContent = detail.dataset.defaultText;
      }
      if (card) card.setAttribute('aria-busy', 'true');
      if (overlay) {
        overlay.removeAttribute('hidden');
        overlay.setAttribute('aria-hidden', 'false');
        requestAnimationFrame(() => {
          overlay.classList.add('visible');
        });
      }
      return;
    }

    _loadingDepth = Math.max(0, _loadingDepth - 1);
    if (_loadingDepth > 0) return;

    document.body.classList.remove('is-loading');
    if (card) card.setAttribute('aria-busy', 'false');
    if (overlay) {
      overlay.classList.remove('visible');
      overlay.setAttribute('aria-hidden', 'true');
      setTimeout(() => {
        if (_loadingDepth === 0) {
          overlay.setAttribute('hidden', '');
        }
      }, 300);
    }
  }

  function setStatusMessage(msg) {
    const el = document.getElementById('status-message');
    if (el) {
      el.textContent = msg || '';
      el.style.display = msg ? '' : 'none';
    }
    const loadingDetail = document.getElementById('metrics-loading-detail');
    if (loadingDetail && msg && document.body.classList.contains('is-loading')) {
      loadingDetail.textContent = msg;
    }
  }

  // ---- KPIs ----

  function renderKPIs(kpi) {

    // Structural KPIs (don't change with lookback period)
    setText('kpi-projects', kpi.activeProjects.toLocaleString());
    setText('kpi-targets', kpi.totalTargets.toLocaleString());
    setText('kpi-target-health', kpi.healthyTargetsPct + '%');
    setText('kpi-active-spaces', kpi.activeSpaces + '/' + kpi.totalSpaces);
    setText('kpi-releases', kpi.totalReleases.toLocaleString());
    setTrendLabel('kpi-targets-label', `${kpi.healthyTargets} healthy`);
    setTrendLabel('kpi-spaces-label', `${kpi.totalSpaces} total`);

    // Time-sensitive KPIs — use enriched data when available
    const enriched = DashboardData.computeEnrichedKPIs();
    if (enriched) {
      const label = enriched.periodLabel;
      setText('kpi-deployments', enriched.totalDeployments.toLocaleString());
      setText('kpi-success-rate', enriched.successRate + '%');
      setText('kpi-frequency', enriched.deployFrequency + '/day');
      setText('kpi-avg-duration', enriched.avgDuration);
      setTrendLabel('kpi-deployments-label', label);
      setTrendLabel('kpi-success-rate-label', label);
      setTrendLabel('kpi-frequency-label', label);
      setTrendLabel('kpi-avg-duration-label', `${enriched.durationCount.toLocaleString()} tasks measured`);
    } else {
      setText('kpi-deployments', kpi.totalDeployments.toLocaleString());
      setText('kpi-success-rate', kpi.successRate + '%');
      setText('kpi-frequency', kpi.deployFrequency + '/day');
      setText('kpi-avg-duration', kpi.avgDuration);
      setTrendLabel('kpi-deployments-label', 'all time, all spaces');
      setTrendLabel('kpi-success-rate-label', 'across recent deploys');
      setTrendLabel('kpi-frequency-label', 'last 30 days');
      setTrendLabel('kpi-avg-duration-label', 'per deployment');
    }
  }

  function setTrendLabel(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  // ---- Space Breakdown ----

  function renderSpaceBreakdown(spaces) {
    const tbody = document.getElementById('table-spaces');
    if (!tbody) return;

    if (spaces.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-secondary" style="text-align:center;padding:var(--space-lg);">No spaces found</td></tr>`;
      return;
    }

    tbody.innerHTML = spaces.map(s => `
      <tr>
        <td>
          <div class="flex items-center gap-sm">
            <div class="space-avatar sm">${DOMPurify.sanitize(s.name.charAt(0).toUpperCase())}</div>
            <div>
              <div>${DOMPurify.sanitize(s.name)}</div>
              ${s.description ? `<div class="text-tertiary" style="font:var(--textBodyRegularXSmall);">${DOMPurify.sanitize(s.description)}</div>` : ''}
            </div>
          </div>
        </td>
        <td>${s.projectCount}</td>
        <td>${s.environmentCount}</td>
        <td>
          <span class="monospace">${s.deploymentCount}</span>
        </td>
        <td>
          <div class="flex items-center gap-xs">
            <div class="progress-bar" style="width:80px;">
              <div class="progress-fill ${s.successRate >= 90 ? 'success' : s.successRate >= 70 ? 'warning' : 'danger'}" 
                   style="width:${s.successRate}%;"></div>
            </div>
            <span class="text-secondary">${s.successRate}%</span>
          </div>
        </td>
        <td>
          ${targetHealthPill(s.healthyTargets, s.unhealthyTargets, s.warningTargets, s.targetCount)}
        </td>
        <td class="text-secondary">${s.lastDeployment ? timeAgo(s.lastDeployment) : '--'}</td>
        <td>${healthBadge(s.successRate, s.deploymentCount > 0)}</td>
      </tr>
    `).join('');
  }

  function targetHealthPill(healthy, unhealthy, warning, total) {
    if (total === 0) return '<span class="text-tertiary">--</span>';
    const parts = [];
    if (healthy > 0) parts.push(`<span class="text-success">${healthy} <span style="opacity:.6">✓</span></span>`);
    if (warning > 0) parts.push(`<span class="text-warning">${warning} <span style="opacity:.6">⚠</span></span>`);
    if (unhealthy > 0) parts.push(`<span class="text-danger">${unhealthy} <span style="opacity:.6">✗</span></span>`);
    if (parts.length === 0) parts.push(`<span class="text-tertiary">0</span>`);
    return parts.join(' <span class="text-tertiary" style="opacity:.4;">·</span> ') + ` <span class="text-tertiary">/ ${total}</span>`;
  }

  function _tooltipAttr(text) {
    return String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  function _escapeAttr(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function healthBadge(rate, hasDeployments) {
    if (rate >= 95) {
      return `<span class="badge success" data-tooltip="${_tooltipAttr('Deployment success rate is 95% or higher for this row in the selected time range.')}">Healthy</span>`;
    }
    if (rate >= 80) {
      return `<span class="badge info" data-tooltip="${_tooltipAttr('Success rate is between 80% and 94%. Worth monitoring before it drops further.')}">Attention</span>`;
    }
    if (rate < 80 && (rate > 0 || hasDeployments)) {
      return `<span class="badge warning" data-tooltip="${_tooltipAttr('Success rate is below 80%, or there was deployment activity with a low success rate. Review failed deployments and trends.')}">Warning</span>`;
    }
    return `<span class="badge neutral" data-tooltip="${_tooltipAttr('Not enough deployment outcomes in the selected period to calculate a success rate.')}">No data</span>`;
  }

  // ---- Recent Deployments ----

  function renderRecentDeployments(deployments) {
    const tbody = document.getElementById('table-recent-deploys');
    if (!tbody) return;

    if (deployments.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-secondary" style="text-align:center;padding:var(--space-lg);">
        <i class="fa-solid fa-plug" style="margin-right:var(--space-xs);"></i>No deployment data available</td></tr>`;
      return;
    }

    const root = (typeof OctopusApi?.getInstanceUrl === 'function') ? OctopusApi.getInstanceUrl() : '';

    tbody.innerHTML = deployments.map(d => {
      const state = (d.State || 'unknown').toLowerCase();
      const statusClass = state === 'success' ? 'success' : state === 'failed' ? 'danger' : state === 'executing' ? 'info' : state === 'queued' ? 'info' : 'neutral';
      const statusLabel = state.charAt(0).toUpperCase() + state.slice(1);

      const spaceId = d._spaceId;
      const projId = d.ProjectId;
      const envId = d.EnvironmentId;
      const projUrl = root && spaceId && projId ? `${root}/app#/${encodeURIComponent(spaceId)}/projects/${encodeURIComponent(projId)}` : null;
      const envUrl = root && spaceId && envId ? `${root}/app#/${encodeURIComponent(spaceId)}/infrastructure/environments/${encodeURIComponent(envId)}` : null;

      return `
        <tr>
          <td>
            ${projUrl
              ? `<a class="text-tertiary" href="${_escapeAttr(projUrl)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;">${DOMPurify.sanitize(d._projectName || d.ProjectId || '--')}</a>`
              : DOMPurify.sanitize(d._projectName || d.ProjectId || '--')}
          </td>
          <td><span class="monospace">${DOMPurify.sanitize(d.ReleaseVersion || '--')}</span></td>
          <td>
            ${envUrl
              ? `<a class="text-tertiary" href="${_escapeAttr(envUrl)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;">${DOMPurify.sanitize(d._envName || d.EnvironmentId || '--')}</a>`
              : DOMPurify.sanitize(d._envName || d.EnvironmentId || '--')}
          </td>
          <td>
            <div class="flex items-center gap-xs">
              <div class="space-avatar sm" style="width:20px;height:20px;font-size:0.5rem;">${DOMPurify.sanitize((d._spaceName || '?').charAt(0))}</div>
              <span class="text-secondary">${DOMPurify.sanitize(d._spaceName || '--')}</span>
            </div>
          </td>
          <td><span class="badge ${statusClass}"><span class="status-dot ${statusClass}"></span> ${DOMPurify.sanitize(statusLabel)}</span></td>
          <td class="text-secondary monospace">${DOMPurify.sanitize(d.Duration || '--')}</td>
          <td class="text-secondary">${d.Created ? timeAgo(d.Created) : '--'}</td>
        </tr>`;
    }).join('');
  }

  // ---- Environment Health ----

  function renderEnvHealth(envs) {
    const container = document.getElementById('env-health');
    if (!container) return;

    if (envs.length === 0) return;

    const root = (typeof OctopusApi?.getInstanceUrl === 'function') ? OctopusApi.getInstanceUrl() : '';
    const allSpaceData = DashboardData.getAllSpaceData ? DashboardData.getAllSpaceData() : {};

    const spaceNameToId = {};
    for (const [sid, sd] of Object.entries(allSpaceData || {})) {
      const spaceName = sd?.space?.Name || sid;
      spaceNameToId[spaceName] = sid;
    }

    function octopusEnvHref(envName, envSpaces) {
      if (!root || !envName) return null;
      const list = Array.isArray(envSpaces) ? envSpaces : [];
      if (list.length === 0) return null;

      // Choose deterministically so URLs are stable across renders.
      const chosenSpaceName = String(list.slice().sort((a, b) => String(a).localeCompare(String(b)))[0]);
      const spaceId = spaceNameToId[chosenSpaceName];
      if (!spaceId) return null;

      const sd = allSpaceData?.[spaceId];
      const environments = sd?.environments || [];
      const env = environments.find(e => e?.Name === envName);
      const envId = env?.Id;
      if (!envId) return null;

      return `${root}/app#/${encodeURIComponent(spaceId)}/infrastructure/environments/${encodeURIComponent(envId)}`;
    }

    // Sort: production-like first, then staging, then dev, then others
    const priority = { production: 0, prod: 0, staging: 1, stage: 1, uat: 2, test: 3, development: 4, dev: 4 };
    envs.sort((a, b) => {
      const pa = priority[a.name.toLowerCase()] ?? 99;
      const pb = priority[b.name.toLowerCase()] ?? 99;
      return pa - pb;
    });

    container.innerHTML = envs.map(env => {
      const tagClass = guessEnvClass(env.name);
      const envUrl = octopusEnvHref(env.name, env.spaces);
      return `
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-sm">
            ${envUrl
              ? `<a class="text-tertiary" href="${_escapeAttr(envUrl)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;"><span class="env-tag ${tagClass}">${DOMPurify.sanitize(env.name)}</span></a>`
              : `<span class="env-tag ${tagClass}">${DOMPurify.sanitize(env.name)}</span>`}
            <span class="text-tertiary" style="font:var(--textBodyRegularXSmall);">${env.spaces.length > 1 ? env.spaces.length + ' spaces' : DOMPurify.sanitize(env.spaces[0] || '')}</span>
          </div>
          <div class="flex items-center gap-xs">
            <span class="text-secondary" style="font:var(--textBodyRegularSmall);">${env.success}/${env.total}</span>
            ${healthBadge(env.successRate, env.total > 0)}
          </div>
        </div>`;
    }).join('');
  }

  function guessEnvClass(name) {
    const n = name.toLowerCase();
    if (n.includes('prod') && !n.includes('pre-prod') && !n.includes('preprod') && !n.includes('non-prod') && !n.includes('nonprod')) return 'production';
    if (n.includes('stag') || n.includes('uat') || n.includes('pre-prod') || n.includes('preprod') || n.includes('test')) return 'staging';
    return 'dev';
  }

  // ---- Charts ----

  function renderSuccessFailureChart(summary) {
    const el = document.getElementById('chart-success-failure');
    if (!el) return;

    const total = summary.successCount + summary.failedCount + summary.cancelledCount;
    if (total === 0) return;

    const sp = Math.round(summary.successCount / total * 100);
    const fp = Math.round(summary.failedCount / total * 100);
    const cp = 100 - sp - fp;

    el.innerHTML = `
      <div style="text-align:center;width:100%;">
        <div style="position:relative;width:160px;height:160px;margin:0 auto;">
          <svg viewBox="0 0 36 36" style="width:160px;height:160px;transform:rotate(-90deg);">
            <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--colorBackgroundTertiary)" stroke-width="3"></circle>
            <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--colorSuccess)" stroke-width="3"
              stroke-dasharray="${sp} ${100-sp}" stroke-dashoffset="0"></circle>
            <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--colorDanger)" stroke-width="3"
              stroke-dasharray="${fp} ${100-fp}" stroke-dashoffset="${-sp}"></circle>
            <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--colorWarningAccent)" stroke-width="3"
              stroke-dasharray="${cp} ${100-cp}" stroke-dashoffset="${-(sp+fp)}"></circle>
          </svg>
          <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);">
            <div style="font:var(--textHeadingMedium);color:var(--colorTextPrimary);">${sp}%</div>
            <div style="font:var(--textBodyRegularXSmall);color:var(--colorTextTertiary);">success</div>
          </div>
        </div>
        <div class="flex justify-between mt-sm" style="font:var(--textBodyRegularSmall);max-width:240px;margin:var(--space-sm) auto 0;">
          <span class="text-success">${summary.successCount} passed</span>
          <span class="text-danger">${summary.failedCount} failed</span>
          <span class="text-warning">${summary.cancelledCount} cancelled</span>
        </div>
      </div>`;
  }

  // ---- Trend chart state ----
  let _fullWeeklyTrend = [];
  let _fullDailyTrend = [];
  let _currentRange = '30d';
  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function formatDailyAxisLabel(d, prev) {
    const M = MONTH_NAMES;
    if (!prev) return `${d.day}<br>${M[d.month]}<br>${d.year}`;
    if (d.year !== prev.year) return `${d.day}<br>${M[d.month]}<br>${d.year}`;
    if (d.month !== prev.month) return `${d.day}<br>${M[d.month]}`;
    return String(d.day);
  }

  function formatUtcDayTip(dateKey) {
    const parts = dateKey.split('-').map(Number);
    const y = parts[0];
    const mo = parts[1];
    const da = parts[2];
    return `${da} ${MONTH_NAMES[mo - 1]} ${y} (UTC)`;
  }

  /**
   * Aggregate weekly buckets into monthly buckets for the 12-month view.
   */
  function _aggregateMonthly(weeklyData) {
    // Build a month map from the weekly data using approximate month from (year, week)
    const monthMap = {}; // "YYYY-MM" → { year, month, success, failed, total }

    for (const w of weeklyData) {
      // Approximate the date of the Monday of this ISO week
      const jan4 = new Date(Date.UTC(w.year, 0, 4));
      const dayOfWeek = jan4.getUTCDay() || 7;
      const monday = new Date(jan4);
      monday.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1 + (w.week - 1) * 7);
      const m = monday.getUTCMonth();     // 0-based
      const y = monday.getUTCFullYear();
      const key = `${y}-${String(m).padStart(2, '0')}`;

      if (!monthMap[key]) monthMap[key] = { year: y, month: m, success: 0, failed: 0, total: 0 };
      monthMap[key].success += w.success;
      monthMap[key].failed += w.failed;
      monthMap[key].total += w.total;
    }

    return Object.values(monthMap)
      .sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month)
      .slice(-12);
  }

  const _ISO_WEEK_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /** Monday 00:00 UTC of ISO week `isoWeek` in ISO week-year `isoYear`. */
  function getIsoWeekMondayUTC(isoYear, isoWeek) {
    const jan4 = new Date(Date.UTC(isoYear, 0, 4));
    const dow = jan4.getUTCDay() || 7;
    const monday = new Date(jan4);
    monday.setUTCDate(jan4.getUTCDate() - dow + 1 + (isoWeek - 1) * 7);
    return monday;
  }

  /** e.g. 129 → "129", 12_400 → "12.4K" (exact value stays in tooltip). */
  function formatCompactCount(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return '0';
    return new Intl.NumberFormat('en-AU', { notation: 'compact', maximumFractionDigits: 2 }).format(x);
  }

  /** Max stacked bar height in px (sqrt-scaled; cap keeps charts readable). */
  const TREND_BAR_MAX_PX = 168;

  /**
   * Pixel height for one column’s stacked bar (sqrt scale vs max in view).
   */
  function trendBarPixelHeight(total, maxTotal, maxPx = TREND_BAR_MAX_PX) {
    const t = Math.max(0, Number(total) || 0);
    const mx = Math.max(1, Number(maxTotal) || 0);
    if (t <= 0) return 0;
    const h = (Math.sqrt(t) / Math.sqrt(mx)) * maxPx;
    return Math.max(4, Math.round(h));
  }

  /** Calendar span for chart copy, e.g. "3–9 Mar 2026" (Mon–Sun of that ISO week, UTC). */
  function formatIsoWeekDateRange(isoYear, isoWeek) {
    const monday = getIsoWeekMondayUTC(isoYear, isoWeek);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    const d1 = monday.getUTCDate();
    const d2 = sunday.getUTCDate();
    const m1 = monday.getUTCMonth();
    const m2 = sunday.getUTCMonth();
    const y1 = monday.getUTCFullYear();
    const y2 = sunday.getUTCFullYear();
    const M = _ISO_WEEK_MONTHS;
    if (y1 === y2 && m1 === m2) return `${d1}–${d2} ${M[m1]} ${y1}`;
    if (y1 === y2) return `${d1} ${M[m1]} – ${d2} ${M[m2]} ${y2}`;
    return `${d1} ${M[m1]} ${y1} – ${d2} ${M[m2]} ${y2}`;
  }

  function renderWeeklyTrend(weeklyTrend, dailyTrend, range) {
    if (weeklyTrend != null) _fullWeeklyTrend = weeklyTrend;
    if (dailyTrend != null) _fullDailyTrend = dailyTrend;
    if (range != null) _currentRange = range;

    const el = document.getElementById('chart-deployment-trends');
    if (!el) return;

    // Decide what to show based on range
    let bars;      // array of { total, success, failed, label, tooltip }
    let useDailyBars = false;
    if (_currentRange === '12m') {
      const monthly = _aggregateMonthly(_fullWeeklyTrend);
      bars = monthly.map(m => ({
        total: m.total,
        success: m.success,
        failed: m.failed,
        label: MONTH_NAMES[m.month] + (m.month === 0 ? '<br>' + m.year : ''),
        tooltip: _tooltipAttr(`${MONTH_NAMES[m.month]} ${m.year}: ${m.total} deployments (${m.success} success, ${m.failed} failed, ${m.total - m.success - m.failed} other)`),
      }));
    } else if (_currentRange === '30d' && _fullDailyTrend && _fullDailyTrend.length > 0) {
      useDailyBars = true;
      bars = _fullDailyTrend.map((d, i) => {
        const prev = i > 0 ? _fullDailyTrend[i - 1] : null;
        const counts = `${d.total} deployments (${d.success} success, ${d.failed} failed, ${d.total - d.success - d.failed} other)`;
        const tip = `${formatUtcDayTip(d.dateKey)}. ${counts}`;
        return {
          total: d.total,
          success: d.success,
          failed: d.failed,
          label: formatDailyAxisLabel(d, prev),
          tooltip: _tooltipAttr(tip),
        };
      });
    } else {
      const weeksToShow = _currentRange === '90d' ? 13 : 5;
      const sliced = _fullWeeklyTrend.slice(-weeksToShow);
      bars = sliced.map((w, i) => {
        const showYear = (i === 0) || (sliced[i - 1] && sliced[i - 1].year !== w.year);
        const rangeStr = formatIsoWeekDateRange(w.year, w.week);
        const counts = `${w.total} deployments (${w.success} success, ${w.failed} failed, ${w.total - w.success - w.failed} other)`;
        const tip = `${rangeStr} · ISO week ${w.week}, ${w.year} (Mon–Sun, UTC). ${counts}`;
        return {
          total: w.total,
          success: w.success,
          failed: w.failed,
          label: `W${w.week}${showYear ? '<br>' + w.year : ''}`,
          tooltip: _tooltipAttr(tip),
        };
      });
    }

    const gapPx = _currentRange === '12m' ? 8 : (useDailyBars ? 2 : (_currentRange === '90d' ? 6 : 12));
    const chartExtra = useDailyBars ? ' deployment-trend-chart--daily' : '';

    if (!bars || bars.length === 0) {
      el.innerHTML = `<div class="text-tertiary" style="text-align:center;padding:var(--space-lg);">
        <i class="fa-solid fa-chart-area" style="font-size:2rem;display:block;margin-bottom:var(--space-sm);"></i>
        No deployment trend data available yet.<br>
        <span style="font:var(--textBodyRegularXSmall);">Trends are computed from deployment history.</span>
      </div>`;
      return;
    }

    const maxTotal = Math.max(...bars.map(b => b.total), 1);

    el.innerHTML = `
      <div class="deployment-trend-chart${chartExtra}">
        <div class="deployment-trend-bars" style="gap:${gapPx}px;padding:0 var(--space-xs);">
          ${bars.map(b => {
            const t = b.total;
            const hPx = trendBarPixelHeight(t, maxTotal);
            let failH = 0;
            let otherH = 0;
            let succH = 0;
            if (t > 0 && hPx > 0) {
              failH = Math.round((b.failed / t) * hPx);
              succH = Math.round((b.success / t) * hPx);
              otherH = Math.max(0, hPx - failH - succH);
            }
            const topSegment = failH > 0 ? 'fail' : (otherH > 0 ? 'other' : 'success');
            return `
              <div class="deployment-trend-col" data-tooltip="${b.tooltip}">
                <div class="deployment-trend-value">${formatCompactCount(t)}</div>
                <div class="deployment-trend-bar-area">
                  <div class="deployment-trend-bar-stack" style="height:${t > 0 ? hPx : 0}px;">
                    ${failH > 0 ? `<div class="deployment-trend-seg deployment-trend-seg--fail" style="height:${failH}px;border-radius:${topSegment === 'fail' ? '3px 3px' : '0 0'} 0 0;"></div>` : ''}
                    ${otherH > 0 ? `<div class="deployment-trend-seg deployment-trend-seg--other" style="height:${otherH}px;border-radius:${topSegment === 'other' ? '3px 3px' : '0 0'} ${succH > 0 ? '0 0' : '3px 3px'};"></div>` : ''}
                    ${succH > 0 ? `<div class="deployment-trend-seg deployment-trend-seg--success" style="height:${succH}px;border-radius:0 0 3px 3px;"></div>` : ''}
                  </div>
                </div>
                <div class="deployment-trend-axis-label${useDailyBars ? ' deployment-trend-axis-label--dense' : ''}">${b.label}</div>
              </div>`;
          }).join('')}
        </div>
      </div>`;
  }

  function setTrendRange(range) {
    renderWeeklyTrend(null, null, range);
  }

  // ---- License Info ----

  function formatPtmPair(used, limit, unlimited) {
    if (unlimited) {
      if (used == null) return 'Unlimited';
      return `${used} / Unlimited`;
    }
    if (used == null && limit == null) return '—';
    if (used == null) return limit == null ? '—' : `— / ${limit}`;
    if (limit == null) return String(used);
    return `${used} / ${limit}`;
  }

  function renderLicenseInfo(info) {
    const el = document.getElementById('license-info');
    const ptmEl = document.getElementById('license-ptm');
    if (!el || !info) return;

    const compliant = info.isCompliant === true;
    const nonCompliant = info.isCompliant === false;
    const badgeClass = compliant ? 'success' : nonCompliant ? 'danger' : 'neutral';
    const badgeLabel = compliant ? 'Compliant' : nonCompliant ? 'Non-Compliant' : 'Unknown';

    const days = info.daysToExpiry;
    const daysClass = days == null ? 'secondary' : days > 60 ? 'success' : days > 30 ? 'warning' : 'danger';
    const daysFragment = days == null
      ? '<span class="text-secondary">Renewal date unavailable</span>'
      : `<span class="text-${daysClass}">${days} days</span> until renewal`;

    el.innerHTML = `
      <div class="flex items-center gap-sm flex-wrap">
        <span class="badge ${badgeClass}">${badgeLabel}</span>
        <span class="text-secondary" style="font:var(--textBodyRegularSmall);">
          ${DOMPurify.sanitize(info.hostingEnv || 'Self-Hosted')} &mdash; ${daysFragment}
        </span>
      </div>`;

    if (!ptmEl) return;
    const ptm = info.ptm;
    if (!ptm) {
      ptmEl.innerHTML = '';
      return;
    }

    const metric = (label, key) => {
      const cell = ptm[key] || {};
      const used = cell.used;
      const limit = cell.limit;
      const effCap = cell.effectiveLimit;
      const unlimited = cell.unlimited === true;
      const text = formatPtmPair(used, limit, unlimited);
      const overLicensed = !unlimited && typeof used === 'number' && typeof limit === 'number' && limit > 0 && used > limit;
      const overEffective = !unlimited && typeof used === 'number' && typeof effCap === 'number' && effCap > 0 && used > effCap;
      const inGraceZone = overLicensed && !overEffective && effCap != null && effCap > limit;
      let valClass = 'license-ptm-metric-value';
      if (overEffective) valClass += ' license-ptm-metric-value--over';
      else if (inGraceZone) valClass += ' license-ptm-metric-value--grace';
      else if (overLicensed) valClass += ' license-ptm-metric-value--over';
      return `
        <div class="license-ptm-metric">
          <span class="license-ptm-metric-label">${label}</span>
          <span class="${valClass}">${text}</span>
        </div>`;
    };

    const capsMissing = ['projects', 'tenants', 'machines'].every((key) => {
      const c = ptm[key] || {};
      return !c.unlimited && (c.limit == null || c.limit === undefined);
    });

    let note = '';
    if (ptm.source === 'spaces-aggregate') {
      note = '<p class="license-ptm-note text-tertiary"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> PTM uses loaded spaces only; grant access to read <code class="license-ptm-code">/api/licenses/licenses-current-usage</code> for exact counts and caps.</p>';
    } else if (ptm.source === 'license-usage-spaces' && capsMissing) {
      note = '<p class="license-ptm-note text-tertiary"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> Usage totals are from per-space data; numeric caps are in the <code class="license-ptm-code">Limits</code> array on the license endpoints. Open Configuration → License in Octopus to see your full entitlement.</p>';
    }

    const summaryLine = info.complianceSummary
      ? `<p class="license-compliance-summary text-tertiary">${String(info.complianceSummary)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`
      : '';

    const ptmHint = (ptm.source === 'license-limits' || ptm.source === 'license-usage-spaces')
      ? `<p class="license-ptm-hint text-tertiary">Compared to your <span class="license-ptm-hint-em">licensed</span> entitlement; Octopus also exposes a higher effective cap as a short overage allowance.</p>`
      : '';

    ptmEl.innerHTML = `
      <div class="license-ptm-label text-tertiary">License usage (PTM)</div>
      ${ptmHint}
      <div class="license-ptm-grid">
        ${metric('Projects', 'projects')}
        ${metric('Tenants', 'tenants')}
        ${metric('Machines', 'machines')}
      </div>
      ${summaryLine}
      ${note}`;
  }

  // ---- Helpers ----

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }


  function timeAgo(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
    if (seconds < 604800) return Math.floor(seconds / 86400) + 'd ago';
    return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  }

  // ---- Render overview from existing summary (no fetch) ----

  function renderOverview(summary) {
    if (!summary) return;
    renderKPIs(summary.kpi);
    renderSpaceBreakdown(summary.spaceBreakdown);
    renderRecentDeployments(summary.recentDeployments);
    renderEnvHealth(summary.envHealth);

    // Always use summary deployment counts for the donut chart so that
    // all task outcomes (including Cancelled and other non-success/failure
    // states) are represented accurately. The enriched KPI aggregation
    // currently only covers Success/Failed, so it must not be used to
    // derive donut counts.
    renderSuccessFailureChart(summary);

    // Use enriched weekly trend for the chart when available
    const enrichedWeekly = DashboardData.getHistoricalWeeklyTrend();
    if (enrichedWeekly && enrichedWeekly.length > 0) {
      renderWeeklyTrend(enrichedWeekly, summary.dailyTrend);
    } else {
      renderWeeklyTrend(summary.weeklyTrend, summary.dailyTrend);
    }

    renderLicenseInfo(summary.licenseInfo);
  }

  // ---- Public ----

  return {
    loadDashboard,
    renderOverview,
    setTrendRange,
    // Expose helpers for views
    timeAgo,
    formatIsoWeekDateRange,
    formatCompactCount,
    trendBarPixelHeight,
    TREND_BAR_MAX_PX,
  };

})();

// Views reference chart utilities on DashboardData — alias from DashboardUI
DashboardData.formatCompactCount = DashboardUI.formatCompactCount;
DashboardData.trendBarPixelHeight = DashboardUI.trendBarPixelHeight;
DashboardData.TREND_BAR_MAX_PX = DashboardUI.TREND_BAR_MAX_PX;
DashboardData.formatIsoWeekDateRange = DashboardUI.formatIsoWeekDateRange;
