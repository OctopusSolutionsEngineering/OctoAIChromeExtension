/* ==========================================================================
   SOC2 / Compliance Dashboard
   
   Lazy-loads compliance-specific data (interruptions, events, teams, roles,
   lifecycles) and computes change-management metrics mapped to the four
   panels auditors expect:
   
     1. Access & Authorization Controls
     2. Change Approval & Review
     3. Traceability & Auditability
     4. Operational Safety Controls
   
   Each metric produces a control card with PASS / ATTENTION / FAIL status.
   An "Export SOC2 Evidence" button generates a flat CSV of every production
   deployment with approver, timestamp, artifact, and status.
   ========================================================================== */


// ==========================================================================
// ComplianceData — fetch & compute
// ==========================================================================

const ComplianceData = (() => {

  let _data = null;
  let _loading = false;
  let _loaded = false;
  const LOOKBACK_DAYS = 90;

  // ---- Helpers ----

  function isProdEnv(name) {
    const n = (name || '').toLowerCase();
    if (n === 'production' || n === 'prod') return true;
    if (n.includes('prod') && !n.includes('pre-prod') && !n.includes('preprod') && !n.includes('non-prod') && !n.includes('nonprod')) return true;
    return false;
  }

  async function safeGet(endpoint) {
    try {
      return await OctopusApi.get(endpoint);
    } catch (e) {
      // Distinguish auth/permission failures from other transient errors.
      const status = e && (e.status || e.statusCode || (e.response && e.response.status));
      if (status === 401 || status === 403) {
        // Propagate auth/forbidden errors so the UI can surface an explicit
        // "insufficient permissions/data unavailable" state instead of
        // computing metrics over empty/null data.
        throw e;
      }
      const log = window._debug || console.log;
      log('Compliance safeGet: non-fatal error fetching ' + endpoint, e);
      // For non-auth errors, fall back to "no data" to avoid breaking the
      // entire dashboard, matching existing behavior as closely as possible.
      return null;
    }
  }

  // ---- Main fetch ----

  async function fetch() {
    if (_loaded) return _data;
    if (_loading) return null;
    _loading = true;

    const log = window._debug || console.log;

    try {
      const allSpaceData = DashboardData.getAllSpaceData();
      const activeSpaceIds = Object.keys(allSpaceData);
      const fromDate = new Date(Date.now() - LOOKBACK_DAYS * 86400000);
      const fromISO = fromDate.toISOString();

      log('Compliance: fetching data for ' + activeSpaceIds.length + ' spaces...');

      // Per-space compliance data (parallel)
      const perSpace = {};
      await Promise.all(activeSpaceIds.map(async (sid) => {
        const [interruptions, events, teams, lifecycles] = await Promise.all([
          safeGet(`/api/${sid}/interruptions?take=500&pendingOnly=false`),
          safeGet(`/api/${sid}/events?from=${fromISO}&take=500`),
          safeGet(`/api/${sid}/teams/all`),
          safeGet(`/api/${sid}/lifecycles?take=100`),
        ]);
        perSpace[sid] = {
          interruptions: interruptions?.Items || [],
          events: events?.Items || [],
          teams: teams || [],
          lifecycles: lifecycles?.Items || [],
        };
      }));

      // Server-level data
      const [userRoles, users] = await Promise.all([
        safeGet('/api/userroles/all'),
        safeGet('/api/users?take=500'),
      ]);

      log('Compliance: computing metrics...');
      _data = computeMetrics(allSpaceData, perSpace, userRoles || [], users?.Items || [], fromDate);
      _loaded = true;

      log('Compliance: done', {
        prodDeploys: _data.approval.totalProdDeploys,
        approvalRate: _data.approval.approvalRate + '%',
        controls: _data.controls.length,
      });

      return _data;

    } catch (err) {
      log('Compliance fetch error: ' + err.message);
      _loading = false;
      throw err;
    } finally {
      _loading = false;
    }
  }

  // ---- Metrics computation ----

  function computeMetrics(allSpaceData, perSpace, userRoles, users, fromDate) {
    const now = new Date();

    // Build a user lookup
    const userMap = {};
    for (const u of users) userMap[u.Id] = u;

    // Collect ALL production deployments (last 90 days) + match with interruptions
    const allProdDeploys = [];       // { deploy, spaceName, spaceId, envName, projectName, interruptions[], deployEvent }
    const allInterruptions = [];
    const allEvents = [];
    let totalProdDeploys = 0;
    let approvedDeploys = 0;
    let unapprovedDeploys = 0;
    let separationOk = 0;
    let separationTotal = 0;
    let approvalTimes = [];

    // Collect per-space
    for (const [spaceId, sd] of Object.entries(allSpaceData)) {
      const spaceName = sd.space?.Name || spaceId;
      const envNames = sd.envNames || {};
      const projectNames = sd.projectNames || {};
      const deployments = sd.deployments || [];
      const compliance = perSpace[spaceId] || {};
      const interruptions = compliance.interruptions || [];
      const events = compliance.events || [];

      allInterruptions.push(...interruptions);
      allEvents.push(...events);

      // Identify production environment IDs in this space
      const prodEnvIds = new Set();
      for (const [eid, ename] of Object.entries(envNames)) {
        if (isProdEnv(ename)) prodEnvIds.add(eid);
      }

      // Build interruption lookup by related document (TaskId)
      const interruptionsByTask = {};
      for (const intr of interruptions) {
        for (const docId of (intr.RelatedDocumentIds || [])) {
          if (!interruptionsByTask[docId]) interruptionsByTask[docId] = [];
          interruptionsByTask[docId].push(intr);
        }
      }

      // Build event lookup by related document
      const eventsByRelated = {};
      for (const evt of events) {
        for (const docId of (evt.RelatedDocumentIds || [])) {
          if (!eventsByRelated[docId]) eventsByRelated[docId] = [];
          eventsByRelated[docId].push(evt);
        }
      }

      // Filter to recent production deployments
      for (const d of deployments) {
        if (!prodEnvIds.has(d.EnvironmentId)) continue;
        if (new Date(d.Created) < fromDate) continue;

        totalProdDeploys++;

        // Find matching interruptions via TaskId
        const taskId = d.TaskId || d.Id;
        const matchedInterruptions = interruptionsByTask[taskId] || interruptionsByTask[d.Id] || [];

        // Find deployment events
        const deployEvents = (eventsByRelated[d.Id] || [])
          .concat(eventsByRelated[taskId] || []);
        const queuedEvent = deployEvents.find(e =>
          (e.Category || '').includes('Deployment') && (e.Category || '').includes('Queued')
        ) || deployEvents[0];

        const hasApproval = matchedInterruptions.some(i => !i.IsPending);
        if (hasApproval) {
          approvedDeploys++;

          // Check separation of duties (deployer != approver)
          const deployerUserId = queuedEvent?.UserId || d.DeployedById || null;
          const approverUserId = matchedInterruptions.find(i => !i.IsPending)?.ResponsibleUserId || null;
          if (deployerUserId && approverUserId) {
            separationTotal++;
            if (deployerUserId !== approverUserId) separationOk++;
          }

          // Approval time (from deployment created to interruption response)
          for (const intr of matchedInterruptions.filter(i => !i.IsPending)) {
            if (intr.Created && d.Created) {
              const mins = (new Date(intr.Created) - new Date(d.Created)) / 60000;
              if (mins >= 0 && mins < 10080) approvalTimes.push(mins); // cap at 7 days
            }
          }
        } else {
          unapprovedDeploys++;
        }

        const approverName = (() => {
          const approver = matchedInterruptions.find(i => !i.IsPending);
          if (!approver?.ResponsibleUserId) return '--';
          const u = userMap[approver.ResponsibleUserId];
          return u?.DisplayName || u?.Username || approver.ResponsibleUserId;
        })();

        const deployerName = (() => {
          const uid = queuedEvent?.UserId || d.DeployedById;
          if (!uid) return '--';
          const u = userMap[uid];
          return u?.DisplayName || u?.Username || uid;
        })();

        allProdDeploys.push({
          date: d.Created,
          project: projectNames[d.ProjectId] || d.ProjectId || '--',
          release: d.ReleaseVersion || d.ReleaseId || '--',
          environment: envNames[d.EnvironmentId] || d.EnvironmentId,
          space: spaceName,
          spaceId,
          status: d.State || 'Unknown',
          deployedBy: deployerName,
          approvedBy: approverName,
          hasApproval,
          duration: d.Duration || '--',
          deploymentId: d.Id,
          taskId: d.TaskId,
        });
      }
    }

    // ---- Panel 1: Access & Authorization ----

    // Count teams/users with production deploy roles
    let prodDeployTeamCount = 0;
    let prodDeployUserCount = 0;
    const prodRoleNames = new Set();

    // Build role name lookup
    const roleMap = {};
    for (const r of (Array.isArray(userRoles) ? userRoles : [])) {
      roleMap[r.Id] = r;
    }

    for (const [spaceId, sd] of Object.entries(allSpaceData)) {
      const envNames = sd.envNames || {};
      const prodEnvIds = new Set();
      for (const [eid, ename] of Object.entries(envNames)) {
        if (isProdEnv(ename)) prodEnvIds.add(eid);
      }

      const compliance = perSpace[spaceId] || {};
      const teams = compliance.teams || [];

      for (const team of teams) {
        // Check if team has scoped roles that include production environments
        const scopedRoles = team.ExternalSecurityGroups || [];
        // Teams have MemberUserIds
        const memberCount = (team.MemberUserIds || []).length;

        // If team has no environment restrictions (empty = all envs), it has prod access
        // This is a simplification — ideally we'd check scoped user roles
        let hasProdAccess = false;
        if (team.MemberUserIds && team.MemberUserIds.length > 0) {
          // Check if team is a deployment-capable team
          // Teams API doesn't always expose scoped roles directly
          // We'll count all teams with members as potentially having access
          // This is conservative — better to over-report than under-report
          hasProdAccess = true;
        }

        if (hasProdAccess && memberCount > 0) {
          prodDeployTeamCount++;
          prodDeployUserCount += memberCount;
        }
      }
    }

    // Unique user count (deduplicate)
    const uniqueProdUsers = new Set();
    for (const [spaceId, sd] of Object.entries(allSpaceData)) {
      const compliance = perSpace[spaceId] || {};
      for (const team of (compliance.teams || [])) {
        for (const uid of (team.MemberUserIds || [])) {
          uniqueProdUsers.add(uid);
        }
      }
    }

    // Service account vs human deploys
    const serviceAccountDeploys = allProdDeploys.filter(d => {
      const name = (d.deployedBy || '').toLowerCase();
      return name.includes('service') || name.includes('system') || name.includes('api') ||
             name.includes('bot') || name.includes('ci') || name.includes('pipeline');
    }).length;
    const humanDeploys = totalProdDeploys - serviceAccountDeploys;

    // ---- Panel 2: Change Approval ----

    const approvalRate = totalProdDeploys > 0 ? Math.round(approvedDeploys / totalProdDeploys * 1000) / 10 : 100;
    const separationRate = separationTotal > 0 ? Math.round(separationOk / separationTotal * 1000) / 10 : null;
    const avgApprovalMinutes = approvalTimes.length > 0
      ? Math.round(approvalTimes.reduce((a, b) => a + b, 0) / approvalTimes.length)
      : null;

    // Deployments outside business hours (rough: before 7am or after 7pm)
    const outsideHoursDeploys = allProdDeploys.filter(d => {
      const h = new Date(d.date).getHours();
      return h < 7 || h >= 19;
    }).length;

    // Weekend deployments
    const weekendDeploys = allProdDeploys.filter(d => {
      const day = new Date(d.date).getDay();
      return day === 0 || day === 6;
    }).length;

    // ---- Panel 3: Traceability ----

    const traceableDeploys = allProdDeploys.filter(d =>
      d.deployedBy !== '--' && d.release !== '--'
    ).length;
    const traceableRate = totalProdDeploys > 0
      ? Math.round(traceableDeploys / totalProdDeploys * 1000) / 10
      : 100;

    const auditEventCount = allEvents.length;

    // Releases linked to version/build
    const releasesWithVersion = allProdDeploys.filter(d =>
      d.release !== '--' && /\d+\.\d+/.test(d.release)
    ).length;
    const versionedRate = totalProdDeploys > 0
      ? Math.round(releasesWithVersion / totalProdDeploys * 1000) / 10
      : 100;

    // ---- Panel 4: Operational Safety ----

    const tasks = DashboardData.getCrossSpaceTasks() || [];
    const failedTasks = tasks.filter(t => t.State === 'Failed' && t.StartTime && t.CompletedTime);
    let mttrMinutes = null;
    if (failedTasks.length > 0) {
      const durations = failedTasks.map(t => (new Date(t.CompletedTime) - new Date(t.StartTime)) / 60000);
      mttrMinutes = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
    }

    // Rollback detection: same project+env deployed with same or earlier version
    const rollbacks = [];
    const deploysByProjEnv = {};
    for (const d of allProdDeploys) {
      const key = `${d.project}|${d.environment}`;
      if (!deploysByProjEnv[key]) deploysByProjEnv[key] = [];
      deploysByProjEnv[key].push(d);
    }
    for (const [key, deploys] of Object.entries(deploysByProjEnv)) {
      const sorted = deploys.sort((a, b) => new Date(a.date) - new Date(b.date));
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].release === sorted[i - 1].release) {
          rollbacks.push(sorted[i]);
        }
      }
    }

    // Failed deploys in period
    const failedProdDeploys = allProdDeploys.filter(d => (d.status || '').toLowerCase() === 'failed');

    // Runbook usage (from existing data)
    const summary = DashboardData.getSummary();
    const totalRunbooks = summary?.kpi?.totalRunbooks || 0;

    // ---- Build control cards ----

    const controls = [];

    // Panel 1 controls
    controls.push({
      panel: 1,
      id: 'privileged-access',
      name: 'Privileged Access Footprint',
      status: uniqueProdUsers.size <= 10 ? 'pass' : uniqueProdUsers.size <= 25 ? 'attention' : 'fail',
      metric: `${uniqueProdUsers.size} users across ${prodDeployTeamCount} teams`,
      details: [
        `${uniqueProdUsers.size} unique users with platform access`,
        `${prodDeployTeamCount} teams configured`,
        serviceAccountDeploys > 0
          ? `${serviceAccountDeploys} deployments by service accounts, ${humanDeploys} by humans`
          : `All ${humanDeploys} deployments by human operators`,
      ],
    });

    // Panel 2 controls
    controls.push({
      panel: 2,
      id: 'change-approval',
      name: 'Production Change Approval',
      status: rateStatus(approvalRate),
      metric: `${approvalRate}% compliant over last ${LOOKBACK_DAYS} days`,
      details: [
        `${approvedDeploys} approved out of ${totalProdDeploys} production deployments`,
        `${unapprovedDeploys} deployments without recorded approval`,
        unapprovedDeploys === 0
          ? 'Zero unauthorized deployments'
          : `${unapprovedDeploys} deployment${unapprovedDeploys > 1 ? 's' : ''} require investigation`,
      ],
    });

    if (separationRate !== null) {
      controls.push({
        panel: 2,
        id: 'separation-of-duties',
        name: 'Separation of Duties',
        status: rateStatus(separationRate, 90, 70),
        metric: `${separationRate}% of approvals by different user than deployer`,
        details: [
          `${separationOk} of ${separationTotal} deployments had different deployer and approver`,
          separationRate >= 90 ? 'Strong separation of duties observed' : 'Consider enforcing multi-person approval',
        ],
      });
    }

    controls.push({
      panel: 2,
      id: 'change-window',
      name: 'Change Window Compliance',
      status: outsideHoursDeploys === 0 ? 'pass' : outsideHoursDeploys <= 3 ? 'attention' : 'fail',
      metric: `${outsideHoursDeploys} deployments outside business hours`,
      details: [
        outsideHoursDeploys > 0 ? `${outsideHoursDeploys} production deployments before 7am or after 7pm` : 'All deployments within business hours',
        weekendDeploys > 0 ? `${weekendDeploys} weekend deployments` : 'No weekend deployments',
        avgApprovalMinutes !== null ? `Average approval time: ${avgApprovalMinutes < 60 ? avgApprovalMinutes + ' minutes' : Math.round(avgApprovalMinutes / 60) + ' hours'}` : '',
      ].filter(Boolean),
    });

    // Panel 3 controls
    controls.push({
      panel: 3,
      id: 'audit-trail',
      name: 'Audit Trail Coverage',
      status: rateStatus(traceableRate),
      metric: `${traceableRate}% of production deployments fully traceable`,
      details: [
        `${traceableDeploys} of ${totalProdDeploys} deployments have deployer + release version`,
        `${auditEventCount} audit events captured in the last ${LOOKBACK_DAYS} days`,
        'Every deployment records: who, what, when, where, outcome',
      ],
    });

    controls.push({
      panel: 3,
      id: 'artifact-lineage',
      name: 'Artifact & Version Lineage',
      status: rateStatus(versionedRate),
      metric: `${versionedRate}% of releases linked to versioned artifacts`,
      details: [
        `${releasesWithVersion} of ${totalProdDeploys} deployments have semantic version`,
        'Release versions enable exact artifact reconstruction',
      ],
    });

    // Panel 4 controls
    controls.push({
      panel: 4,
      id: 'recovery-time',
      name: 'Mean Time to Recovery',
      status: mttrMinutes !== null
        ? (mttrMinutes <= 30 ? 'pass' : mttrMinutes <= 120 ? 'attention' : 'fail')
        : 'pass',
      metric: mttrMinutes !== null
        ? (mttrMinutes < 60 ? `${mttrMinutes} minutes average` : `${Math.round(mttrMinutes / 60)} hours average`)
        : 'No failures in period',
      details: [
        failedTasks.length > 0
          ? `Calculated from ${failedTasks.length} failed deployment tasks`
          : 'No failed deployments to measure recovery time',
        mttrMinutes !== null && mttrMinutes <= 30 ? 'Recovery is well within acceptable thresholds' : '',
      ].filter(Boolean),
    });

    controls.push({
      panel: 4,
      id: 'rollback-capability',
      name: 'Rollback & Recovery',
      status: rollbacks.length <= 2 ? 'pass' : rollbacks.length <= 5 ? 'attention' : 'fail',
      metric: `${rollbacks.length} rollback${rollbacks.length !== 1 ? 's' : ''} detected`,
      details: [
        rollbacks.length > 0
          ? `${rollbacks.length} same-version redeployments detected (indicates rollback)`
          : 'No rollbacks detected in the period',
        `${failedProdDeploys.length} failed production deployments`,
      ],
    });

    controls.push({
      panel: 4,
      id: 'prod-failure-rate',
      name: 'Production Failure Rate',
      status: (() => {
        const failRate = totalProdDeploys > 0 ? (failedProdDeploys.length / totalProdDeploys * 100) : 0;
        return failRate <= 5 ? 'pass' : failRate <= 15 ? 'attention' : 'fail';
      })(),
      metric: `${failedProdDeploys.length} of ${totalProdDeploys} production deployments failed`,
      details: [
        totalProdDeploys > 0
          ? `${Math.round((1 - failedProdDeploys.length / totalProdDeploys) * 1000) / 10}% production success rate`
          : 'No production deployments in period',
      ],
    });

    return {
      period: { from: fromDate, to: now, days: LOOKBACK_DAYS },
      access: {
        prodDeployTeams: prodDeployTeamCount,
        prodDeployUsers: uniqueProdUsers.size,
        totalUsers: users.length,
        serviceAccountDeploys,
        humanDeploys,
      },
      approval: {
        totalProdDeploys,
        approvedDeploys,
        unapprovedDeploys,
        emergencyDeploys: unapprovedDeploys,
        approvalRate,
        separationRate,
        avgApprovalMinutes,
        outsideHoursDeploys,
        weekendDeploys,
      },
      traceability: {
        traceableDeploys,
        traceableRate,
        auditEventCount,
        versionedRate,
      },
      safety: {
        mttrMinutes,
        rollbackCount: rollbacks.length,
        failedProdDeploys: failedProdDeploys.length,
        totalRunbooks,
      },
      controls,
      evidence: allProdDeploys,
    };
  }

  function rateStatus(rate, passThreshold, attentionThreshold) {
    passThreshold = passThreshold || 95;
    attentionThreshold = attentionThreshold || 80;
    if (rate >= passThreshold) return 'pass';
    if (rate >= attentionThreshold) return 'attention';
    return 'fail';
  }

  // ---- Evidence export ----

  function generateEvidenceCSV() {
    if (!_data) return null;
    const evidence = _data.evidence;
    const lines = [];
    const esc = (v) => {
      const s = String(v == null ? '' : v);
      return s.includes(',') || s.includes('"') || s.includes('\n') ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const row = (...vals) => lines.push(vals.map(esc).join(','));

    lines.push('# SOC2 Change Management Evidence');
    lines.push(`# Period: ${_data.period.from.toISOString().slice(0, 10)} to ${_data.period.to.toISOString().slice(0, 10)} (${_data.period.days} days)`);
    lines.push(`# Generated: ${new Date().toISOString()}`);
    lines.push(`# Server: ${OctopusApi.getInstanceUrl()}`);
    lines.push('');

    row('Date', 'Project', 'Release Version', 'Environment', 'Space', 'Status',
        'Deployed By', 'Approved By', 'Has Approval', 'Duration', 'Deployment ID');

    for (const d of evidence.sort((a, b) => new Date(b.date) - new Date(a.date))) {
      row(
        d.date ? new Date(d.date).toISOString() : '--',
        d.project, d.release, d.environment, d.space, d.status,
        d.deployedBy, d.approvedBy, d.hasApproval ? 'Yes' : 'No',
        d.duration, d.deploymentId
      );
    }

    lines.push('');
    lines.push('# Control Summary');
    row('Control', 'Status', 'Metric');
    for (const c of _data.controls) {
      row(c.name, c.status.toUpperCase(), c.metric);
    }

    return lines.join('\n');
  }

  function generateEvidenceJSON() {
    if (!_data) return null;
    return {
      metadata: {
        type: 'SOC2 Change Management Evidence',
        period: {
          from: _data.period.from.toISOString(),
          to: _data.period.to.toISOString(),
          days: _data.period.days,
        },
        generated: new Date().toISOString(),
        server: OctopusApi.getInstanceUrl(),
      },
      controlSummary: _data.controls.map(c => ({
        control: c.name,
        status: c.status,
        metric: c.metric,
        details: c.details,
      })),
      productionDeployments: _data.evidence.map(d => ({
        date: d.date,
        project: d.project,
        releaseVersion: d.release,
        environment: d.environment,
        space: d.space,
        status: d.status,
        deployedBy: d.deployedBy,
        approvedBy: d.approvedBy,
        hasApproval: d.hasApproval,
        duration: d.duration,
        deploymentId: d.deploymentId,
      })),
      metrics: {
        access: _data.access,
        approval: _data.approval,
        traceability: _data.traceability,
        safety: _data.safety,
      },
    };
  }

  function reset() {
    _data = null;
    _loaded = false;
    _loading = false;
  }

  return {
    fetch,
    getData: () => _data,
    isLoaded: () => _loaded,
    generateEvidenceCSV,
    generateEvidenceJSON,
    reset,
  };

})();


// ==========================================================================
// ComplianceView — rendering
// ==========================================================================

const ComplianceView = (() => {

  function render(summary) {
    return `
    <div class="page-header">
      <div class="flex items-center justify-between" style="flex-wrap:wrap;gap:var(--space-sm);">
        <div>
          <h1 class="page-title">SOC2 Compliance</h1>
          <p class="page-subtitle">Change management controls &mdash; proving your deployment process meets audit requirements.</p>
        </div>
        <div class="flex gap-xs">
          <div class="export-wrapper">
            <button class="btn btn-loud btn-sm" id="btn-compliance-export">
              <i class="fa-solid fa-file-shield"></i>
              Export SOC2 Evidence
            </button>
            <div class="export-dropdown" id="compliance-export-dropdown">
              <button class="export-option" data-compliance-format="csv">
                <i class="fa-solid fa-table"></i>
                CSV (auditor-friendly)
              </button>
              <button class="export-option" data-compliance-format="json">
                <i class="fa-solid fa-code"></i>
                JSON (structured)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div id="compliance-panels">
      <div class="compliance-loading">
        <div class="compliance-loading-spinner">
          <i class="fa-solid fa-shield-halved fa-spin"></i>
        </div>
        <h3>Loading compliance data&hellip;</h3>
        <p class="text-secondary">Fetching approvals, audit events, teams, and lifecycle data across all spaces.</p>
      </div>
    </div>`;
  }

  function wire(summary) {
    // Export button
    const exportBtn = document.getElementById('btn-compliance-export');
    const exportDrop = document.getElementById('compliance-export-dropdown');
    if (exportBtn && exportDrop) {
      exportBtn.addEventListener('click', (e) => { e.stopPropagation(); exportDrop.classList.toggle('open'); });
      exportDrop.addEventListener('click', (e) => e.stopPropagation());
      document.querySelectorAll('[data-compliance-format]').forEach(btn => {
        btn.addEventListener('click', () => {
          exportDrop.classList.remove('open');
          handleExport(btn.dataset.complianceFormat);
        });
      });
    }

    // Fetch compliance data then render panels
    ComplianceData.fetch().then(data => {
      const panelsEl = document.getElementById('compliance-panels');
      if (!panelsEl) return;
      panelsEl.innerHTML = renderPanels(data);
    }).catch(err => {
      const panelsEl = document.getElementById('compliance-panels');
      if (!panelsEl) return;
      panelsEl.innerHTML = `
        <div class="card">
          <div class="card-body" style="text-align:center;padding:var(--space-xl);">
            <i class="fa-solid fa-triangle-exclamation text-danger" style="font-size:2rem;margin-bottom:var(--space-md);display:block;"></i>
            <h3 style="font:var(--textHeadingSmall);color:var(--colorTextPrimary);">Failed to load compliance data</h3>
            <p class="text-secondary" style="margin-top:var(--space-xs);">${DOMPurify.sanitize(err.message)}</p>
            <p class="text-tertiary" style="font:var(--textBodyRegularXSmall);margin-top:var(--space-sm);">
              Some endpoints may require elevated permissions. Check your API token has access to events, teams, and interruptions.
            </p>
          </div>
        </div>`;
    });
  }

  // ---- Panel rendering ----

  function renderPanels(data) {
    const c = data.controls;
    const period = `${data.period.from.toISOString().slice(0, 10)} — ${data.period.to.toISOString().slice(0, 10)}`;

    // Overall health
    const statuses = c.map(x => x.status);
    const failCount = statuses.filter(s => s === 'fail').length;
    const attentionCount = statuses.filter(s => s === 'attention').length;
    const passCount = statuses.filter(s => s === 'pass').length;
    const overall = failCount > 0 ? 'fail' : attentionCount > 0 ? 'attention' : 'pass';
    const overallLabel = { pass: 'All Controls Passing', attention: 'Attention Required', fail: 'Controls Failing' }[overall];
    const overallIcon = { pass: 'fa-solid fa-circle-check', attention: 'fa-solid fa-triangle-exclamation', fail: 'fa-solid fa-circle-xmark' }[overall];

    return `
    <!-- Overall status banner -->
    <div class="compliance-banner compliance-banner-${overall}">
      <div class="compliance-banner-icon"><i class="${overallIcon}"></i></div>
      <div>
        <div class="compliance-banner-title">${overallLabel}</div>
        <div class="compliance-banner-detail">
          ${passCount} passing &middot; ${attentionCount} attention &middot; ${failCount} failing &mdash; ${data.period.days}-day lookback (${period})
        </div>
      </div>
      <div class="compliance-banner-stats">
        <span class="badge success">${passCount} PASS</span>
        ${attentionCount > 0 ? `<span class="badge warning">${attentionCount} ATTENTION</span>` : ''}
        ${failCount > 0 ? `<span class="badge danger">${failCount} FAIL</span>` : ''}
      </div>
    </div>

    <!-- 4-panel grid -->
    <div class="compliance-grid">

      ${renderPanel(
        'Access & Authorization Controls',
        'fa-solid fa-lock',
        'Production access is restricted and enforced by workflow, not trust.',
        c.filter(x => x.panel === 1),
        data.access
      )}

      ${renderPanel(
        'Change Approval & Review',
        'fa-solid fa-clipboard-check',
        'All changes are formally reviewed and tracked before production.',
        c.filter(x => x.panel === 2),
        data.approval
      )}

      ${renderPanel(
        'Traceability & Auditability',
        'fa-solid fa-magnifying-glass',
        'Every production change has a full audit trail and artifact lineage.',
        c.filter(x => x.panel === 3),
        data.traceability
      )}

      ${renderPanel(
        'Operational Safety Controls',
        'fa-solid fa-helmet-safety',
        'Production changes follow controlled mechanisms with recovery capability.',
        c.filter(x => x.panel === 4),
        data.safety
      )}

    </div>

    <!-- Evidence summary -->
    <div class="section-header" style="margin-top:var(--space-lg);">
      <h2 class="section-title"><i class="fa-solid fa-scroll"></i> Production Deployment Log</h2>
      <span class="badge info">${data.evidence.length} deployments</span>
    </div>
    <div class="card">
      <div class="card-body" style="padding:0;">
        <div class="table-wrapper">
          <table>
            <thead><tr>
              <th>Date</th><th>Project</th><th>Release</th><th>Environment</th>
              <th>Space</th><th>Deployed By</th><th>Approved By</th><th>Status</th>
            </tr></thead>
            <tbody>
              ${data.evidence.length > 0
                ? data.evidence
                    .sort((a, b) => new Date(b.date) - new Date(a.date))
                    .slice(0, 50)
                    .map(d => {
                      const st = (d.status || '').toLowerCase();
                      const cls = st === 'success' ? 'success' : st === 'failed' ? 'danger' : 'neutral';
                      return `<tr>
                        <td class="text-secondary" style="white-space:nowrap;">${d.date ? new Date(d.date).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '--'}</td>
                        <td>${DOMPurify.sanitize(d.project)}</td>
                        <td class="monospace">${DOMPurify.sanitize(d.release)}</td>
                        <td><span class="env-tag production">${DOMPurify.sanitize(d.environment)}</span></td>
                        <td class="text-secondary">${DOMPurify.sanitize(d.space)}</td>
                        <td class="text-secondary">${DOMPurify.sanitize(d.deployedBy)}</td>
                        <td>${d.hasApproval
                          ? `<span class="text-success">${DOMPurify.sanitize(d.approvedBy)}</span>`
                          : '<span class="text-danger">No approval</span>'}</td>
                        <td><span class="badge ${cls}">${st.charAt(0).toUpperCase() + st.slice(1)}</span></td>
                      </tr>`;
                    }).join('')
                : '<tr><td colspan="8" class="text-secondary" style="text-align:center;padding:var(--space-lg);">No production deployments found in the lookback period</td></tr>'
              }
            </tbody>
          </table>
        </div>
      </div>
      ${data.evidence.length > 50 ? `<div class="card-footer text-tertiary">Showing 50 of ${data.evidence.length} &mdash; use Export for the full list</div>` : ''}
    </div>`;
  }

  function renderPanel(title, icon, narrative, controls, summaryData) {
    const statuses = controls.map(c => c.status);
    const panelStatus = statuses.includes('fail') ? 'fail' : statuses.includes('attention') ? 'attention' : 'pass';

    return `
    <div class="compliance-panel compliance-panel-${panelStatus}">
      <div class="compliance-panel-header">
        <div class="compliance-panel-title">
          <i class="${icon}"></i>
          ${title}
        </div>
        <span class="compliance-status-badge compliance-status-${panelStatus}">
          ${panelStatus.toUpperCase()}
        </span>
      </div>
      <div class="compliance-panel-narrative">${narrative}</div>
      <div class="compliance-controls">
        ${controls.map(renderControl).join('')}
      </div>
    </div>`;
  }

  function renderControl(control) {
    const statusIcon = {
      pass: 'fa-solid fa-circle-check',
      attention: 'fa-solid fa-triangle-exclamation',
      fail: 'fa-solid fa-circle-xmark',
    }[control.status];

    return `
    <div class="compliance-control compliance-control-${control.status}">
      <div class="compliance-control-header">
        <div class="compliance-control-status">
          <i class="${statusIcon}"></i>
          <span>${control.status.toUpperCase()}</span>
        </div>
        <span class="compliance-control-name">${control.name}</span>
      </div>
      <div class="compliance-control-metric">${control.metric}</div>
      <div class="compliance-control-details">
        ${control.details.map(d => `<div class="compliance-control-detail"><i class="fa-solid fa-angle-right"></i> ${d}</div>`).join('')}
      </div>
    </div>`;
  }

  // ---- Export handler ----

  function handleExport(format) {
    if (!ComplianceData.isLoaded()) {
      if (window._debug) window._debug('Compliance export failed — data not loaded');
      return;
    }

    const date = new Date().toISOString().slice(0, 10);
    const baseName = `octopus-soc2-evidence-${date}`;

    if (format === 'csv') {
      const csv = ComplianceData.generateEvidenceCSV();
      if (csv) downloadFile(csv, baseName + '.csv', 'text/csv');
    } else {
      const json = ComplianceData.generateEvidenceJSON();
      if (json) downloadFile(JSON.stringify(json, null, 2), baseName + '.json', 'application/json');
    }
  }

  // Reuse the downloadFile from dashboard.js (it's global)
  function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  }


  return { render, wire };

})();
