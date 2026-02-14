/* ==========================================================================
   Octopus Deploy Dashboard — Data Layer
   
   Fetches data from the Octopus REST API across all spaces and aggregates
   it for the value dashboard.
   
   Key endpoints used (confirmed working 2026-02):
     GET /api                                        → Server info & version
     GET /api/spaces?take=100                        → All spaces
     GET /api/licenses/licenses-current-usage        → Per-space project/tenant/machine counts
     GET /api/{spaceId}/projects?take=1000           → Projects per space
     GET /api/{spaceId}/environments?take=100        → Environments per space
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
  let _spaceData = {};       // keyed by space Id
  let _serverInfo = null;
  let _licenseUsage = null;
  let _licenseStatus = null;
  let _crossSpaceTasks = [];
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
    if (_licenseUsage?.SpacesUsage) {
      for (const su of _licenseUsage.SpacesUsage) {
        usageByName[su.SpaceName] = su;
      }
    }

    // Filter to only spaces that have at least 1 project (skip empty T1–T30 etc.)
    const activeSpaces = _spaces.filter(s => {
      const usage = usageByName[s.Name];
      return usage && (usage.ProjectsCount > 0 || usage.MachinesCount > 0);
    });

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

    // Phase 3: Cross-space deployment tasks (single call — gives timing data)
    report('Loading deployment task history...');
    const activeSpaceIds = activeSpaces.map(s => s.Id).join(',');
    const tasksResponse = await safeGet(`/api/tasks?spaces=${activeSpaceIds}&name=Deploy&states=Success,Failed&take=200`);
    _crossSpaceTasks = tasksResponse?.Items || [];
    log(`Cross-space deploy tasks: ${_crossSpaceTasks.length} (total: ${tasksResponse?.TotalResults || 0})`);

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
      safeGet(`/api/${sid}/environments?take=100`),
      safeGet(`/api/${sid}/environments/summary`),
      safeGet(`/api/${sid}/dashboard`),
      safeGet(`/api/${sid}/deployments?take=200`),
      safeGet(`/api/${sid}/machines?take=200`),
      safeGet(`/api/${sid}/releases?take=0`),
      safeGet(`/api/${sid}/runbooks?take=0`),
    ]);

    // Build project name lookup
    const projectNames = {};
    for (const p of (projects?.Items || [])) {
      projectNames[p.Id] = p.Name;
    }

    // Build environment name lookup
    const envNames = {};
    for (const e of (environments?.Items || [])) {
      envNames[e.Id] = e.Name;
    }

    // Parse machine health from environment summary
    const machineHealth = envSummary?.MachineHealthStatusSummaries || {};
    const totalMachines = envSummary?.TotalMachines || 0;

    return {
      space,
      projects: projects?.Items || [],
      projectNames,
      environments: environments?.Items || [],
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
    };
  }

  // Safe getter — returns null instead of throwing on 404/403
  async function safeGet(endpoint) {
    try {
      return await OctopusApi.get(endpoint);
    } catch (err) {
      if (err.status === 404 || err.status === 403) return null;
      // Also swallow deprecation errors (the weekly report endpoint)
      if (err.message && err.message.includes('deprecated')) return null;
      throw err;
    }
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
        recentDeploymentCount: deployments.length,
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

    // Enrich recent deployments with state from dashboard data
    const dashboardStateMap = {};
    for (const [spaceId, data] of Object.entries(_spaceData)) {
      if (data.dashboard?.Items) {
        for (const item of data.dashboard.Items) {
          dashboardStateMap[item.DeploymentId] = item;
        }
      }
    }

    const enrichedDeployments = allDeployments.map(dep => {
      const dashItem = dashboardStateMap[dep.Id];
      return {
        ...dep,
        State: dashItem?.State || dep.State || 'Unknown',
        Duration: dashItem?.Duration || dep.Duration || '--',
        ReleaseVersion: dashItem?.ReleaseVersion || dep.ReleaseVersion || dep.ReleaseId,
        CompletedTime: dashItem?.CompletedTime || dep.CompletedTime,
      };
    });

    // Overall success rate
    const totalRated = totalSuccessful + totalFailed + totalCancelled;
    const overallSuccessRate = totalRated > 0 ? (totalSuccessful / totalRated * 100) : 0;

    // Build weekly trend from deployment timestamps (since the weekly report endpoint is deprecated)
    const weeklyTrend = computeWeeklyTrend(enrichedDeployments);

    // Deployment frequency (per day over last 30 days)
    const now = new Date();
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const recentAll = enrichedDeployments.filter(d => new Date(d.Created || d.QueueTime) >= thirtyDaysAgo);
    const deployFrequency = recentAll.length > 0 ? (recentAll.length / 30) : 0;

    // Average deployment duration from cross-space tasks
    const avgDuration = computeAvgDuration(_crossSpaceTasks);

    // Target health percentage
    const healthyPct = totalTargets > 0 ? Math.round(healthyTargets / totalTargets * 100) : 0;

    // License info
    const licenseInfo = {
      isCompliant: _licenseStatus?.IsCompliant,
      daysToExpiry: _licenseStatus?.DaysToEffectiveExpiryDate,
      expiryDate: _licenseStatus?.EffectiveExpiryDate,
      hostingEnv: _licenseStatus?.HostingEnvironment,
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
        // Estimated time saved: ~15 min saved per automated deployment vs manual
        timeSavedHours: Math.round(totalDeploymentsCount * 15 / 60),
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

      // Counts for donut
      successCount: totalSuccessful,
      failedCount: totalFailed,
      cancelledCount: totalCancelled,
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

  // ---- Public API ----

  return {
    fetchAll,
    getSummary: () => getSummary({}),
    getSpaces: () => _spaces,
    getSpaceData: (id) => _spaceData[id],
    getServerInfo: () => _serverInfo,
    getLastFetch: () => _lastFetch,
    getLicenseUsage: () => _licenseUsage,
    getLicenseStatus: () => _licenseStatus,
  };

})();


/* ==========================================================================
   Dashboard UI Binding
   
   Wires DashboardData into the DOM elements.
   ========================================================================== */

const DashboardUI = (() => {

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
      renderWeeklyTrend(summary.weeklyTrend);
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
    document.body.classList.toggle('is-loading', loading);
  }

  function setStatusMessage(msg) {
    const el = document.getElementById('status-message');
    if (el) {
      el.textContent = msg || '';
      el.style.display = msg ? '' : 'none';
    }
  }

  // ---- KPIs ----

  function renderKPIs(kpi) {
    setText('kpi-deployments', kpi.totalDeployments.toLocaleString());
    setText('kpi-success-rate', kpi.successRate + '%');
    setText('kpi-projects', kpi.activeProjects.toLocaleString());
    setText('kpi-frequency', kpi.deployFrequency + '/day');
    setText('kpi-time-saved', formatHours(kpi.timeSavedHours));
    setText('kpi-targets', kpi.totalTargets.toLocaleString());
    setText('kpi-target-health', kpi.healthyTargetsPct + '%');
    setText('kpi-active-spaces', kpi.activeSpaces + '/' + kpi.totalSpaces);
    setText('kpi-avg-duration', kpi.avgDuration);
    setText('kpi-releases', kpi.totalReleases.toLocaleString());

    // Update trend indicators
    setTrendLabel('kpi-frequency-label', `last 30 days`);
    setTrendLabel('kpi-targets-label', `${kpi.healthyTargets} healthy`);
    setTrendLabel('kpi-spaces-label', `${kpi.totalSpaces} total`);
  }

  function formatHours(h) {
    if (h >= 24) {
      const days = Math.round(h / 8); // working days
      return days + ' days';
    }
    return h + ' hrs';
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
            <div class="space-avatar sm">${s.name.charAt(0).toUpperCase()}</div>
            <div>
              <div>${esc(s.name)}</div>
              ${s.description ? `<div class="text-tertiary" style="font:var(--textBodyRegularXSmall);">${esc(s.description)}</div>` : ''}
            </div>
          </div>
        </td>
        <td>${s.projectCount}</td>
        <td>${s.environmentCount}</td>
        <td>
          <span class="monospace">${s.deploymentCount}</span>
          ${s.recentDeploymentCount > 0 ? `<span class="text-tertiary" style="font:var(--textBodyRegularXSmall);"> (${s.recentDeploymentCount} recent)</span>` : ''}
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

  function healthBadge(rate, hasDeployments) {
    if (rate >= 95) return '<span class="badge success">Healthy</span>';
    if (rate >= 80) return '<span class="badge warning">Attention</span>';
    if (rate < 80 && (rate > 0 || hasDeployments)) return '<span class="badge danger">At Risk</span>';
    return '<span class="badge neutral">No data</span>';
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

    tbody.innerHTML = deployments.map(d => {
      const state = (d.State || 'unknown').toLowerCase();
      const statusClass = state === 'success' ? 'success' : state === 'failed' ? 'danger' : state === 'executing' ? 'info' : state === 'queued' ? 'info' : 'neutral';
      const statusLabel = state.charAt(0).toUpperCase() + state.slice(1);

      return `
        <tr>
          <td>${esc(d._projectName || d.ProjectId || '--')}</td>
          <td><span class="monospace">${esc(d.ReleaseVersion || '--')}</span></td>
          <td>${esc(d._envName || d.EnvironmentId || '--')}</td>
          <td>
            <div class="flex items-center gap-xs">
              <div class="space-avatar sm" style="width:20px;height:20px;font-size:0.5rem;">${(d._spaceName || '?').charAt(0)}</div>
              <span class="text-secondary">${esc(d._spaceName || '--')}</span>
            </div>
          </td>
          <td><span class="badge ${statusClass}"><span class="status-dot ${statusClass}"></span> ${statusLabel}</span></td>
          <td class="text-secondary monospace">${d.Duration || '--'}</td>
          <td class="text-secondary">${d.Created ? timeAgo(d.Created) : '--'}</td>
        </tr>`;
    }).join('');
  }

  // ---- Environment Health ----

  function renderEnvHealth(envs) {
    const container = document.getElementById('env-health');
    if (!container) return;

    if (envs.length === 0) return;

    // Sort: production-like first, then staging, then dev, then others
    const priority = { production: 0, prod: 0, staging: 1, stage: 1, uat: 2, test: 3, development: 4, dev: 4 };
    envs.sort((a, b) => {
      const pa = priority[a.name.toLowerCase()] ?? 99;
      const pb = priority[b.name.toLowerCase()] ?? 99;
      return pa - pb;
    });

    container.innerHTML = envs.map(env => {
      const tagClass = guessEnvClass(env.name);
      return `
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-sm">
            <span class="env-tag ${tagClass}">${esc(env.name)}</span>
            <span class="text-tertiary" style="font:var(--textBodyRegularXSmall);">${env.spaces.length > 1 ? env.spaces.length + ' spaces' : env.spaces[0] || ''}</span>
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
    if (n.includes('prod')) return 'production';
    if (n.includes('stag') || n.includes('uat') || n.includes('pre-prod')) return 'staging';
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
  let _currentRange = '30d';
  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

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

  function renderWeeklyTrend(weeklyTrend, range) {
    if (weeklyTrend) _fullWeeklyTrend = weeklyTrend;
    if (range) _currentRange = range;

    const el = document.getElementById('chart-deployment-trends');
    if (!el) return;

    // Decide what to show based on range
    let bars;      // array of { total, success, failed, label, tooltip }
    if (_currentRange === '12m') {
      const monthly = _aggregateMonthly(_fullWeeklyTrend);
      bars = monthly.map(m => ({
        total: m.total,
        success: m.success,
        failed: m.failed,
        label: MONTH_NAMES[m.month] + (m.month === 0 ? '<br>' + m.year : ''),
        tooltip: `${MONTH_NAMES[m.month]} ${m.year}: ${m.total} deployments (${m.success} success, ${m.failed} failed)`,
      }));
    } else {
      const weeksToShow = _currentRange === '90d' ? 13 : 5;
      const sliced = _fullWeeklyTrend.slice(-weeksToShow);
      bars = sliced.map((w, i) => {
        const showYear = (i === 0) || (sliced[i - 1] && sliced[i - 1].year !== w.year);
        return {
          total: w.total,
          success: w.success,
          failed: w.failed,
          label: `W${w.week}${showYear ? '<br>' + w.year : ''}`,
          tooltip: `Week ${w.week}, ${w.year}: ${w.total} deployments (${w.success} success, ${w.failed} failed)`,
        };
      });
    }

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
      <div style="width:100%;overflow-x:auto;">
        <div style="display:flex;align-items:flex-end;gap:6px;height:200px;padding:0 var(--space-xs);">
          ${bars.map(b => {
            const h = Math.max(4, (b.total / maxTotal) * 180);
            const successH = b.total > 0 ? (b.success / b.total * h) : 0;
            const failH = h - successH;
            return `
              <div style="display:flex;flex-direction:column;align-items:center;flex:1;min-width:28px;cursor:default;" title="${b.tooltip}">
                <div style="font:var(--textBodyRegularXSmall);color:var(--colorTextTertiary);margin-bottom:4px;">${b.total}</div>
                <div style="width:100%;max-width:40px;display:flex;flex-direction:column;">
                  ${failH > 0 ? `<div style="height:${failH}px;background:var(--colorDanger);border-radius:3px 3px 0 0;"></div>` : ''}
                  ${successH > 0 ? `<div style="height:${successH}px;background:var(--colorSuccess);border-radius:${failH > 0 ? '0 0 3px 3px' : '3px'};"></div>` : ''}
                </div>
                <div style="font:var(--textBodyRegularXSmall);color:var(--colorTextTertiary);margin-top:4px;white-space:nowrap;text-align:center;">${b.label}</div>
              </div>`;
          }).join('')}
        </div>
      </div>`;
  }

  function setTrendRange(range) {
    renderWeeklyTrend(null, range);
  }

  // ---- License Info ----

  function renderLicenseInfo(info) {
    const el = document.getElementById('license-info');
    if (!el || !info) return;

    const daysClass = info.daysToExpiry > 60 ? 'success' : info.daysToExpiry > 30 ? 'warning' : 'danger';
    el.innerHTML = `
      <div class="flex items-center gap-sm">
        <span class="badge ${info.isCompliant ? 'success' : 'danger'}">${info.isCompliant ? 'Compliant' : 'Non-Compliant'}</span>
        <span class="text-secondary" style="font:var(--textBodyRegularSmall);">
          ${info.hostingEnv || 'Self-Hosted'} &mdash; 
          <span class="text-${daysClass}">${info.daysToExpiry} days</span> until renewal
        </span>
      </div>`;
  }

  // ---- Helpers ----

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function esc(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
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

  // ---- Public ----

  return {
    loadDashboard,
    setTrendRange,
  };

})();
