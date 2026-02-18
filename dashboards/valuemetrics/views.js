/* ==========================================================================
   SPA Views — Render functions for each dashboard view
   
   Each view returns an HTML string that gets inserted into #main-content.
   Data is pulled from DashboardData (already fetched at load time).
   ========================================================================== */

const Views = (() => {

  // ---- Shared helpers ----


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

  function healthBadge(rate, hasDeployments) {
    if (rate >= 95) return '<span class="badge success">Healthy</span>';
    if (rate >= 80) return '<span class="badge warning">Attention</span>';
    if (rate < 80 && (rate > 0 || hasDeployments)) return '<span class="badge danger">At Risk</span>';
    return '<span class="badge neutral">No data</span>';
  }

  function guessEnvClass(name) {
    const n = name.toLowerCase();
    if (n.includes('prod') && !n.includes('pre-prod') && !n.includes('preprod') && !n.includes('non-prod') && !n.includes('nonprod')) return 'production';
    if (n.includes('stag') || n.includes('uat') || n.includes('pre-prod') || n.includes('preprod') || n.includes('test')) return 'staging';
    return 'dev';
  }

  function fmt$(n) {
    if (n >= 1000000) return '$' + (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return '$' + Math.round(n / 1000) + 'K';
    return '$' + n.toLocaleString();
  }

  function sparkline(data, width, height) {
    if (!data || data.length < 2) return '';
    const max = Math.max(...data, 1);
    const step = width / (data.length - 1);
    const points = data.map((v, i) => `${i * step},${height - (v / max) * (height - 4)}`).join(' ');
    return `<svg width="${width}" height="${height}" style="display:block;">
      <polyline points="${points}" fill="none" stroke="var(--colorPrimaryLight)" stroke-width="1.5" stroke-linejoin="round"/>
    </svg>`;
  }

  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  // ==================================================================
  // OVERVIEW — HTML skeleton (populated by DashboardUI.renderOverview)
  // ==================================================================

  function getOverviewHTML() {
    return `
    <!-- Page Header -->
    <div class="page-header">
      <h1 class="page-title">Overview</h1>
      <p class="page-subtitle">
        Cross-space deployment insights &mdash; demonstrating the impact and ROI of Octopus Deploy across your organisation.
      </p>
      <div id="status-message" class="connection-test-result result-info mt-sm" style="display:none;"></div>
      <div id="debug-log" class="mt-sm" style="background:var(--colorBackgroundSecondaryDefault);border:1px solid var(--colorBorderDefault);border-radius:var(--radiusMedium);padding:var(--space-md);font:var(--textCodeRegularSmall);color:var(--colorTextSecondary);max-height:300px;overflow-y:auto;white-space:pre-wrap;word-break:break-all;display:none;"></div>
    </div>

    <!-- Value Impact Section -->
    <div id="value-impact-section" class="mb-lg" style="display:none;">
      <div class="value-section-header">
        <h2 class="value-section-title">
          <i class="fa-solid fa-chart-line"></i>
          Value Impact
        </h2>
        <button class="btn btn-secondary btn-sm" id="btn-edit-value-settings">
          <i class="fa-solid fa-pen"></i>
          Edit assumptions
        </button>
      </div>
      <div class="value-grid" id="value-cards"></div>
    </div>

    <!-- Onboarding CTA -->
    <div id="onboarding-cta" class="card mb-lg" style="display:none;">
      <div class="card-body" style="text-align:center;padding:var(--space-xl) var(--space-lg);">
        <div style="font-size:2.5rem;margin-bottom:var(--space-sm);">
          <i class="fa-solid fa-wand-magic-sparkles" style="color:var(--colorPrimaryLighter);"></i>
        </div>
        <h3 style="font:var(--textHeadingSmall);color:var(--colorTextPrimary);margin:0 0 var(--space-xs);">Unlock your value dashboard</h3>
        <p class="text-secondary" style="font:var(--textBodyRegularMedium);max-width:500px;margin:0 auto var(--space-md);line-height:1.5;">
          Answer a few quick questions about your deployment process before Octopus, and we'll calculate the real engineering time, cost savings, ROI, and risk reduction you're getting.
        </p>
        <button class="btn btn-loud" id="btn-start-onboarding">
          <i class="fa-solid fa-rocket"></i>
          Get started &mdash; takes 1 minute
        </button>
      </div>
    </div>

    <!-- KPI Section Header -->
    <div class="section-header">
      <h2 class="section-title"><i class="fa-solid fa-gauge-high"></i> Platform Metrics</h2>
    </div>

    <!-- KPI Row 1 -->
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="flex items-center justify-between">
          <span class="kpi-label">Total Deployments</span>
          <div class="kpi-icon blue"><i class="fa-solid fa-rocket"></i></div>
        </div>
        <span class="kpi-value" id="kpi-deployments">--</span>
        <span class="kpi-trend neutral"><i class="fa-solid fa-database"></i> <span>all time, all spaces</span></span>
      </div>
      <div class="kpi-card">
        <div class="flex items-center justify-between">
          <span class="kpi-label">Success Rate</span>
          <div class="kpi-icon green"><i class="fa-solid fa-circle-check"></i></div>
        </div>
        <span class="kpi-value" id="kpi-success-rate">--</span>
        <span class="kpi-trend neutral"><i class="fa-solid fa-chart-simple"></i> <span>across recent deploys</span></span>
      </div>
      <div class="kpi-card">
        <div class="flex items-center justify-between">
          <span class="kpi-label">Deploy Frequency</span>
          <div class="kpi-icon amber"><i class="fa-solid fa-bolt"></i></div>
        </div>
        <span class="kpi-value" id="kpi-frequency">--</span>
        <span class="kpi-trend neutral"><i class="fa-solid fa-calendar-days"></i> <span id="kpi-frequency-label">last 30 days</span></span>
      </div>
      <div class="kpi-card">
        <div class="flex items-center justify-between">
          <span class="kpi-label">Avg Duration</span>
          <div class="kpi-icon purple"><i class="fa-solid fa-stopwatch"></i></div>
        </div>
        <span class="kpi-value" id="kpi-avg-duration">--</span>
        <span class="kpi-trend neutral"><i class="fa-solid fa-clock"></i> <span>per deployment</span></span>
      </div>
      <div class="kpi-card">
        <div class="flex items-center justify-between">
          <span class="kpi-label">Time Saved (est.)</span>
          <div class="kpi-icon green"><i class="fa-solid fa-hourglass-half"></i></div>
        </div>
        <span class="kpi-value" id="kpi-time-saved">--</span>
        <span class="kpi-trend neutral"><i class="fa-solid fa-hand-sparkles"></i> <span>vs manual process</span></span>
      </div>
    </div>

    <!-- KPI Row 2 -->
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="flex items-center justify-between">
          <span class="kpi-label">Active Spaces</span>
          <div class="kpi-icon blue"><i class="fa-solid fa-cubes"></i></div>
        </div>
        <span class="kpi-value" id="kpi-active-spaces">--</span>
        <span class="kpi-trend neutral"><i class="fa-solid fa-layer-group"></i> <span id="kpi-spaces-label">with projects</span></span>
      </div>
      <div class="kpi-card">
        <div class="flex items-center justify-between">
          <span class="kpi-label">Active Projects</span>
          <div class="kpi-icon purple"><i class="fa-solid fa-diagram-project"></i></div>
        </div>
        <span class="kpi-value" id="kpi-projects">--</span>
        <span class="kpi-trend neutral"><i class="fa-solid fa-folder-open"></i> <span>across all spaces</span></span>
      </div>
      <div class="kpi-card">
        <div class="flex items-center justify-between">
          <span class="kpi-label">Deployment Targets</span>
          <div class="kpi-icon amber"><i class="fa-solid fa-server"></i></div>
        </div>
        <span class="kpi-value" id="kpi-targets">--</span>
        <span class="kpi-trend neutral"><i class="fa-solid fa-heart-pulse"></i> <span id="kpi-targets-label">machines &amp; agents</span></span>
      </div>
      <div class="kpi-card">
        <div class="flex items-center justify-between">
          <span class="kpi-label">Target Health</span>
          <div class="kpi-icon green"><i class="fa-solid fa-shield-halved"></i></div>
        </div>
        <span class="kpi-value" id="kpi-target-health">--</span>
        <span class="kpi-trend neutral"><i class="fa-solid fa-check-double"></i> <span>healthy targets</span></span>
      </div>
      <div class="kpi-card">
        <div class="flex items-center justify-between">
          <span class="kpi-label">Total Releases</span>
          <div class="kpi-icon blue"><i class="fa-solid fa-tag"></i></div>
        </div>
        <span class="kpi-value" id="kpi-releases">--</span>
        <span class="kpi-trend neutral"><i class="fa-solid fa-code-branch"></i> <span>across all projects</span></span>
      </div>
    </div>

    <!-- Charts Section Header -->
    <div class="section-header">
      <h2 class="section-title"><i class="fa-solid fa-chart-bar"></i> Deployment Activity</h2>
    </div>

    <!-- Charts Row -->
    <div class="dashboard-grid mb-lg">
      <div class="card col-span-8">
        <div class="card-header">
          <h3 class="card-title">Deployment Trends</h3>
          <div class="flex items-center gap-md">
            <div class="flex gap-xs" style="font:var(--textBodyRegularXSmall);color:var(--colorTextTertiary);">
              <span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:var(--colorSuccess);vertical-align:middle;margin-right:3px;"></span>Success</span>
              <span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:var(--colorDanger);vertical-align:middle;margin-right:3px;"></span>Failed</span>
              <span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:var(--colorBackgroundTertiary);vertical-align:middle;margin-right:3px;"></span>Other</span>
            </div>
            <div class="flex gap-xs">
              <button class="btn btn-secondary btn-sm active-toggle" data-range="30d">30 days</button>
              <button class="btn btn-secondary btn-sm" data-range="90d">90 days</button>
              <button class="btn btn-secondary btn-sm" data-range="12m">12 months</button>
            </div>
          </div>
        </div>
        <div class="card-body">
          <div class="chart-container" id="chart-deployment-trends">
            <i class="fa-solid fa-chart-area" style="font-size:2rem;margin-right:var(--space-sm);"></i>
            Loading deployment trends...
          </div>
        </div>
      </div>
      <div class="card col-span-4">
        <div class="card-header">
          <h3 class="card-title">Success vs Failure</h3>
          <div class="flex gap-xs" style="font:var(--textBodyRegularXSmall);color:var(--colorTextTertiary);">
            <span><span class="status-dot success"></span> Success</span>
            <span><span class="status-dot danger"></span> Failed</span>
            <span><span class="status-dot warning"></span> Cancelled</span>
          </div>
        </div>
        <div class="card-body">
          <div class="chart-container" id="chart-success-failure">
            <i class="fa-solid fa-chart-pie" style="font-size:2rem;margin-right:var(--space-sm);"></i>
            Loading...
          </div>
        </div>
      </div>
    </div>

    <!-- Spaces Section Header -->
    <div class="section-header">
      <h2 class="section-title"><i class="fa-solid fa-cubes"></i> Space Breakdown</h2>
      <span class="badge info">All Spaces</span>
    </div>

    <!-- Spaces Breakdown Table -->
    <div class="dashboard-grid mb-lg">
      <div class="card col-span-12">
        <div class="card-body" style="padding:0;">
          <div class="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Space</th><th>Projects</th><th>Envs</th><th>Deployments</th>
                  <th>Success Rate</th><th>Targets</th><th>Last Deploy</th><th>Health</th>
                </tr>
              </thead>
              <tbody id="table-spaces">
                <tr><td colspan="8" class="text-secondary" style="text-align:center;padding:var(--space-lg);">
                  <i class="fa-solid fa-spinner fa-spin" style="margin-right:var(--space-xs);"></i> Loading space data...
                </td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <!-- Recent Section Header -->
    <div class="section-header">
      <h2 class="section-title"><i class="fa-solid fa-clock-rotate-left"></i> Recent Activity</h2>
    </div>

    <!-- Recent Deployments & Environment Health -->
    <div class="dashboard-grid">
      <div class="card col-span-8">
        <div class="card-header">
          <h3 class="card-title">Recent Deployments</h3>
          <a href="#" class="text-secondary" style="font:var(--textBodyRegularSmall);">View all <i class="fa-solid fa-arrow-right"></i></a>
        </div>
        <div class="card-body" style="padding:0;">
          <div class="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Project</th><th>Release</th><th>Environment</th>
                  <th>Space</th><th>Status</th><th>Duration</th><th>When</th>
                </tr>
              </thead>
              <tbody id="table-recent-deploys">
                <tr><td class="text-secondary" colspan="7" style="text-align:center;padding:var(--space-lg);">
                  <i class="fa-solid fa-spinner fa-spin" style="margin-right:var(--space-xs);"></i> Loading deployments...
                </td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div class="card col-span-4">
        <div class="card-header"><h3 class="card-title">Environment Health</h3></div>
        <div class="card-body">
          <div class="flex flex-col gap-md" id="env-health">
            <div class="flex items-center justify-between"><div class="flex items-center gap-sm"><span class="env-tag production">Production</span></div><span class="badge neutral">--</span></div>
            <div class="flex items-center justify-between"><div class="flex items-center gap-sm"><span class="env-tag staging">Staging</span></div><span class="badge neutral">--</span></div>
            <div class="flex items-center justify-between"><div class="flex items-center gap-sm"><span class="env-tag dev">Development</span></div><span class="badge neutral">--</span></div>
          </div>
        </div>
        <div class="card-footer">
          <span class="text-tertiary"><i class="fa-solid fa-info-circle"></i> Based on latest deployment status per environment</span>
        </div>
      </div>
    </div>

    <!-- License Info -->
    <div class="card mt-lg" style="padding:var(--space-sm) var(--space-md);">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-sm">
          <i class="fa-solid fa-id-badge text-tertiary"></i>
          <span class="text-secondary" style="font:var(--textBodyRegularSmall);">License</span>
          <span id="license-info">--</span>
        </div>
        <span class="text-tertiary" style="font:var(--textBodyRegularXSmall);" id="server-version"></span>
      </div>
    </div>`;
  }

  /** Wire up Overview-specific event listeners after HTML is inserted */
  function wireOverviewEvents() {
    const startBtn = document.getElementById('btn-start-onboarding');
    if (startBtn) startBtn.addEventListener('click', () => { if (typeof openOnboarding === 'function') openOnboarding(); });

    const editBtn = document.getElementById('btn-edit-value-settings');
    if (editBtn) editBtn.addEventListener('click', () => { if (typeof openOnboarding === 'function') openOnboarding(); });

    // Trend range buttons
    document.querySelectorAll('[data-range]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-range]').forEach(b => b.classList.remove('active-toggle'));
        btn.classList.add('active-toggle');
        DashboardUI.setTrendRange(btn.dataset.range);
      });
    });
  }


  // ==================================================================
  // DEPLOYMENT TRENDS view
  // ==================================================================

  function renderTrends(summary) {
    const trend = summary.weeklyTrend || [];
    const totalDeploys = summary.kpi.totalDeployments;
    const successRate = summary.kpi.successRate;
    const frequency = summary.kpi.deployFrequency;

    return `
    <div class="page-header">
      <h1 class="page-title">Deployment Trends</h1>
      <p class="page-subtitle">Deployment activity over time &mdash; track trends, patterns, and compare across spaces.</p>
    </div>

    <!-- KPI strip -->
    <div class="kpi-grid mb-lg">
      <div class="kpi-card">
        <div class="flex items-center justify-between">
          <span class="kpi-label">Total Deployments</span>
          <div class="kpi-icon blue"><i class="fa-solid fa-rocket"></i></div>
        </div>
        <span class="kpi-value">${totalDeploys.toLocaleString()}</span>
        <span class="kpi-trend neutral"><i class="fa-solid fa-database"></i> <span>all time</span></span>
      </div>
      <div class="kpi-card">
        <div class="flex items-center justify-between">
          <span class="kpi-label">Success Rate</span>
          <div class="kpi-icon green"><i class="fa-solid fa-circle-check"></i></div>
        </div>
        <span class="kpi-value">${successRate}%</span>
        <span class="kpi-trend neutral"><i class="fa-solid fa-chart-simple"></i> <span>across all deploys</span></span>
      </div>
      <div class="kpi-card">
        <div class="flex items-center justify-between">
          <span class="kpi-label">Deploy Frequency</span>
          <div class="kpi-icon amber"><i class="fa-solid fa-bolt"></i></div>
        </div>
        <span class="kpi-value">${frequency}/day</span>
        <span class="kpi-trend neutral"><i class="fa-solid fa-calendar-days"></i> <span>last 30 days</span></span>
      </div>
      <div class="kpi-card">
        <div class="flex items-center justify-between">
          <span class="kpi-label">Successful</span>
          <div class="kpi-icon green"><i class="fa-solid fa-check"></i></div>
        </div>
        <span class="kpi-value">${summary.successCount.toLocaleString()}</span>
        <span class="kpi-trend neutral"><i class="fa-solid fa-thumbs-up"></i> <span>total successful</span></span>
      </div>
      <div class="kpi-card">
        <div class="flex items-center justify-between">
          <span class="kpi-label">Failed</span>
          <div class="kpi-icon danger"><i class="fa-solid fa-xmark"></i></div>
        </div>
        <span class="kpi-value">${summary.failedCount.toLocaleString()}</span>
        <span class="kpi-trend neutral"><i class="fa-solid fa-triangle-exclamation"></i> <span>total failures</span></span>
      </div>
    </div>

    <!-- Full-width trend chart -->
    <div class="section-header">
      <h2 class="section-title"><i class="fa-solid fa-chart-bar"></i> Deployment Timeline</h2>
    </div>
    <div class="card mb-lg">
      <div class="card-header">
        <h3 class="card-title">Deployments Over Time</h3>
        <div class="flex items-center gap-md">
          <div class="flex gap-xs" style="font:var(--textBodyRegularXSmall);color:var(--colorTextTertiary);">
            <span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:var(--colorSuccess);vertical-align:middle;margin-right:3px;"></span>Success</span>
            <span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:var(--colorDanger);vertical-align:middle;margin-right:3px;"></span>Failed</span>
            <span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:var(--colorBackgroundTertiary);vertical-align:middle;margin-right:3px;"></span>Other</span>
          </div>
          <div class="flex gap-xs">
            <button class="btn btn-secondary btn-sm active-toggle" data-trends-range="30d">30 days</button>
            <button class="btn btn-secondary btn-sm" data-trends-range="90d">90 days</button>
            <button class="btn btn-secondary btn-sm" data-trends-range="12m">12 months</button>
          </div>
        </div>
      </div>
      <div class="card-body">
        <div class="chart-container" id="trends-chart">${_renderTrendChart(trend, '30d')}</div>
      </div>
    </div>

    <!-- Success/Failure breakdown + space comparison -->
    <div class="dashboard-grid mb-lg">
      <div class="card col-span-6">
        <div class="card-header">
          <h3 class="card-title">Success vs Failure</h3>
          <div class="flex gap-xs" style="font:var(--textBodyRegularXSmall);color:var(--colorTextTertiary);">
            <span><span class="status-dot success"></span> Success</span>
            <span><span class="status-dot danger"></span> Failed</span>
            <span><span class="status-dot warning"></span> Cancelled</span>
          </div>
        </div>
        <div class="card-body">${_renderDonutChart(summary)}</div>
      </div>
      <div class="card col-span-6">
        <div class="card-header"><h3 class="card-title">Deployments by Space</h3></div>
        <div class="card-body">${_renderSpaceBarChart(summary.spaceBreakdown)}</div>
      </div>
    </div>

    <!-- Per-space deployment table -->
    <div class="section-header">
      <h2 class="section-title"><i class="fa-solid fa-table"></i> Space Deployment Summary</h2>
    </div>
    <div class="card">
      <div class="card-body" style="padding:0;">
        <div class="table-wrapper">
          <table>
            <thead><tr>
              <th>Space</th><th>Deployments</th><th>Success</th><th>Failed</th><th>Success Rate</th><th>Last Deploy</th>
            </tr></thead>
            <tbody>
              ${summary.spaceBreakdown.map(s => `<tr>
                <td><div class="flex items-center gap-sm"><div class="space-avatar sm">${s.name.charAt(0).toUpperCase()}</div> ${DOMPurify.sanitize(s.name)}</div></td>
                <td class="monospace">${s.deploymentCount}</td>
                <td class="text-success monospace">${s.successCount}</td>
                <td class="text-danger monospace">${s.failedCount}</td>
                <td><div class="flex items-center gap-xs"><div class="progress-bar" style="width:80px;"><div class="progress-fill ${s.successRate >= 90 ? 'success' : s.successRate >= 70 ? 'warning' : 'danger'}" style="width:${s.successRate}%;"></div></div><span class="text-secondary">${s.successRate}%</span></div></td>
                <td class="text-secondary">${s.lastDeployment ? timeAgo(s.lastDeployment) : '--'}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
  }

  function wireTrendsEvents(summary) {
    const trend = summary.weeklyTrend || [];
    document.querySelectorAll('[data-trends-range]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-trends-range]').forEach(b => b.classList.remove('active-toggle'));
        btn.classList.add('active-toggle');
        const el = document.getElementById('trends-chart');
        if (el) el.innerHTML = _renderTrendChart(trend, btn.dataset.trendsRange);
      });
    });
  }

  // ---- Trend chart helpers (shared) ----

  function _aggregateMonthly(weeklyData) {
    const monthMap = {};
    for (const w of weeklyData) {
      const jan4 = new Date(Date.UTC(w.year, 0, 4));
      const dow = jan4.getUTCDay() || 7;
      const monday = new Date(jan4);
      monday.setUTCDate(jan4.getUTCDate() - dow + 1 + (w.week - 1) * 7);
      const m = monday.getUTCMonth();
      const y = monday.getUTCFullYear();
      const key = `${y}-${String(m).padStart(2, '0')}`;
      if (!monthMap[key]) monthMap[key] = { year: y, month: m, success: 0, failed: 0, total: 0 };
      monthMap[key].success += w.success;
      monthMap[key].failed += w.failed;
      monthMap[key].total += w.total;
    }
    return Object.values(monthMap).sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month).slice(-12);
  }

  function _renderTrendChart(weeklyTrend, range) {
    let bars;
    if (range === '12m') {
      const monthly = _aggregateMonthly(weeklyTrend);
      bars = monthly.map(m => ({
        total: m.total, success: m.success, failed: m.failed,
        label: MONTH_NAMES[m.month] + (m.month === 0 ? '<br>' + m.year : ''),
        tooltip: `${MONTH_NAMES[m.month]} ${m.year}: ${m.total} deployments (${m.success} success, ${m.failed} failed, ${m.total - m.success - m.failed} other)`,
      }));
    } else {
      const weeks = range === '90d' ? 13 : 5;
      const sliced = weeklyTrend.slice(-weeks);
      bars = sliced.map((w, i) => {
        const showYear = i === 0 || (sliced[i - 1] && sliced[i - 1].year !== w.year);
        return {
          total: w.total, success: w.success, failed: w.failed,
          label: `W${w.week}${showYear ? '<br>' + w.year : ''}`,
          tooltip: `Week ${w.week}, ${w.year}: ${w.total} deployments (${w.success} success, ${w.failed} failed, ${w.total - w.success - w.failed} other)`,
        };
      });
    }
    if (!bars || bars.length === 0) {
      return '<div class="text-tertiary" style="text-align:center;padding:var(--space-lg);">No trend data available</div>';
    }
    const maxTotal = Math.max(...bars.map(b => b.total), 1);
    const barWidth = range === '12m' ? 32 : range === '90d' ? 24 : 40;
    const gap = range === '12m' ? 8 : range === '90d' ? 6 : 12;
    const maxBarH = 180;
    return `<div style="width:100%;overflow-x:auto;">
      <div style="display:flex;align-items:flex-end;gap:${gap}px;height:200px;padding:var(--space-sm) 0;">
        ${bars.map(b => {
          const h = Math.max(4, (b.total / maxTotal) * maxBarH);
          const successH = b.total > 0 ? (b.success / b.total * h) : 0;
          const failH = b.total > 0 ? (b.failed / b.total * h) : 0;
          const otherH = h - successH - failH;
          const topSegment = failH > 0 ? 'fail' : (otherH > 0 ? 'other' : 'success');
          return `<div style="display:flex;flex-direction:column;align-items:center;flex:1;min-width:${barWidth}px;max-width:60px;" title="${b.tooltip}">
            <div style="font:var(--textBodyBoldXSmall);color:var(--colorTextSecondary);margin-bottom:4px;">${b.total}</div>
            <div style="width:100%;display:flex;flex-direction:column;">
              ${failH > 0 ? `<div style="height:${failH}px;background:var(--colorDanger);border-radius:${topSegment === 'fail' ? '3px 3px' : '0 0'} 0 0;"></div>` : ''}
              ${otherH > 0 ? `<div style="height:${otherH}px;background:var(--colorBackgroundTertiary);border-radius:${topSegment === 'other' ? '3px 3px' : '0 0'} ${successH > 0 ? '0 0' : '3px 3px'};"></div>` : ''}
              ${successH > 0 ? `<div style="height:${successH}px;background:var(--colorSuccess);border-radius:0 0 3px 3px;"></div>` : ''}
            </div>
            <div style="font:var(--textBodyRegularXSmall);color:var(--colorTextTertiary);margin-top:4px;text-align:center;height:2.5em;line-height:1.25em;">${b.label}</div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }

  function _renderDonutChart(summary) {
    const total = summary.successCount + summary.failedCount + summary.cancelledCount;
    if (total === 0) return '<div class="text-tertiary" style="text-align:center;">No data</div>';
    const sp = Math.round(summary.successCount / total * 100);
    const fp = Math.round(summary.failedCount / total * 100);
    const cp = 100 - sp - fp;
    return `<div style="text-align:center;width:100%;">
      <div style="position:relative;width:160px;height:160px;margin:0 auto;">
        <svg viewBox="0 0 36 36" style="width:160px;height:160px;transform:rotate(-90deg);">
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--colorBackgroundTertiary)" stroke-width="3"></circle>
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--colorSuccess)" stroke-width="3" stroke-dasharray="${sp} ${100 - sp}" stroke-dashoffset="0"></circle>
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--colorDanger)" stroke-width="3" stroke-dasharray="${fp} ${100 - fp}" stroke-dashoffset="${-sp}"></circle>
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--colorWarningAccent)" stroke-width="3" stroke-dasharray="${cp} ${100 - cp}" stroke-dashoffset="${-(sp + fp)}"></circle>
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

  function _renderSpaceBarChart(spaces) {
    if (!spaces.length) return '<div class="text-tertiary" style="text-align:center;">No spaces</div>';
    const max = Math.max(...spaces.map(s => s.deploymentCount), 1);
    return `<div class="flex flex-col gap-sm" style="padding:var(--space-sm) 0;">
      ${spaces.map(s => {
        const pct = Math.round(s.deploymentCount / max * 100);
        return `<div>
          <div class="flex items-center justify-between" style="margin-bottom:2px;">
            <span style="font:var(--textBodyRegularSmall);color:var(--colorTextSecondary);">${DOMPurify.sanitize(s.name)}</span>
            <span class="monospace" style="font:var(--textBodyBoldXSmall);color:var(--colorTextPrimary);">${s.deploymentCount}</span>
          </div>
          <div class="progress-bar" style="width:100%;"><div class="progress-fill info" style="width:${pct}%;"></div></div>
        </div>`;
      }).join('')}
    </div>`;
  }


  // ==================================================================
  // RELEASE VELOCITY view
  // ==================================================================

  function renderVelocity(summary) {
    const freq = summary.kpi.deployFrequency;
    const weeklyRate = (freq * 7).toFixed(1);
    const monthlyRate = (freq * 30).toFixed(0);
    const answers = Onboarding.getAnswers();
    const value = answers ? Onboarding.calculateValue(summary, answers) : null;

    let comparisonHtml = '';
    if (value && value.throughputMultiplier) {
      comparisonHtml = `
      <div class="section-header"><h2 class="section-title"><i class="fa-solid fa-scale-balanced"></i> Before vs Now</h2></div>
      <div class="dashboard-grid mb-lg">
        <div class="card col-span-4">
          <div class="card-body" style="text-align:center;">
            <div style="font:var(--textBodyRegularSmall);color:var(--colorTextTertiary);margin-bottom:var(--space-xs);">Before Automation</div>
            <div style="font:var(--textHeadingLarge);color:var(--colorTextSecondary);">${value.oldDeploysPerMonth}/mo</div>
            <div style="font:var(--textBodyRegularXSmall);color:var(--colorTextTertiary);margin-top:var(--space-xs);">${value.oldCadenceLabel}</div>
          </div>
        </div>
        <div class="card col-span-4">
          <div class="card-body" style="text-align:center;">
            <div style="font:var(--textBodyRegularSmall);color:var(--colorTextTertiary);margin-bottom:var(--space-xs);">Improvement</div>
            <div style="font:var(--textHeadingLarge);color:var(--colorSuccess);">${value.throughputMultiplier}x</div>
            <div style="font:var(--textBodyRegularXSmall);color:var(--colorTextTertiary);margin-top:var(--space-xs);">throughput multiplier</div>
          </div>
        </div>
        <div class="card col-span-4">
          <div class="card-body" style="text-align:center;">
            <div style="font:var(--textBodyRegularSmall);color:var(--colorTextTertiary);margin-bottom:var(--space-xs);">Current</div>
            <div style="font:var(--textHeadingLarge);color:var(--colorPrimaryLight);">${value.currentDeploysPerMonth}/mo</div>
            <div style="font:var(--textBodyRegularXSmall);color:var(--colorTextTertiary);margin-top:var(--space-xs);">automated deploys</div>
          </div>
        </div>
      </div>`;
    }

    return `
    <div class="page-header">
      <h1 class="page-title">Release Velocity</h1>
      <p class="page-subtitle">How fast your team ships &mdash; deployment frequency, cadence improvements, and per-space velocity.</p>
    </div>

    <!-- Frequency KPIs -->
    <div class="kpi-grid mb-lg">
      <div class="kpi-card">
        <div class="flex items-center justify-between">
          <span class="kpi-label">Per Day</span>
          <div class="kpi-icon blue"><i class="fa-solid fa-bolt"></i></div>
        </div>
        <span class="kpi-value">${freq}</span>
        <span class="kpi-trend neutral"><i class="fa-solid fa-calendar-day"></i> <span>deploys/day average</span></span>
      </div>
      <div class="kpi-card">
        <div class="flex items-center justify-between">
          <span class="kpi-label">Per Week</span>
          <div class="kpi-icon purple"><i class="fa-solid fa-calendar-week"></i></div>
        </div>
        <span class="kpi-value">${weeklyRate}</span>
        <span class="kpi-trend neutral"><i class="fa-solid fa-chart-line"></i> <span>deploys/week</span></span>
      </div>
      <div class="kpi-card">
        <div class="flex items-center justify-between">
          <span class="kpi-label">Per Month</span>
          <div class="kpi-icon amber"><i class="fa-solid fa-calendar"></i></div>
        </div>
        <span class="kpi-value">${monthlyRate}</span>
        <span class="kpi-trend neutral"><i class="fa-solid fa-calendar-days"></i> <span>deploys/month</span></span>
      </div>
      <div class="kpi-card">
        <div class="flex items-center justify-between">
          <span class="kpi-label">Total Releases</span>
          <div class="kpi-icon green"><i class="fa-solid fa-tag"></i></div>
        </div>
        <span class="kpi-value">${summary.kpi.totalReleases.toLocaleString()}</span>
        <span class="kpi-trend neutral"><i class="fa-solid fa-code-branch"></i> <span>across all projects</span></span>
      </div>
    </div>

    ${comparisonHtml}

    <!-- Velocity trend -->
    <div class="section-header"><h2 class="section-title"><i class="fa-solid fa-chart-area"></i> Velocity Over Time</h2></div>
    <div class="card mb-lg">
      <div class="card-header">
        <h3 class="card-title"></h3>
        <div class="flex gap-xs" style="font:var(--textBodyRegularXSmall);color:var(--colorTextTertiary);">
          <span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:var(--colorSuccess);vertical-align:middle;margin-right:3px;"></span>Success</span>
          <span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:var(--colorDanger);vertical-align:middle;margin-right:3px;"></span>Failed</span>
          <span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:var(--colorBackgroundTertiary);vertical-align:middle;margin-right:3px;"></span>Other</span>
        </div>
      </div>
      <div class="card-body">
        <div class="chart-container">${_renderTrendChart(summary.weeklyTrend || [], '12m')}</div>
      </div>
    </div>

    <!-- Per-space velocity comparison -->
    <div class="section-header"><h2 class="section-title"><i class="fa-solid fa-ranking-star"></i> Velocity by Space</h2></div>
    <div class="card">
      <div class="card-body" style="padding:0;">
        <div class="table-wrapper">
          <table>
            <thead><tr><th>Space</th><th>Deployments</th><th>Releases</th><th>Deploys/Release</th><th>Trend</th></tr></thead>
            <tbody>
              ${summary.spaceBreakdown.map(s => {
                const dpr = s.releaseCount > 0 ? (s.deploymentCount / s.releaseCount).toFixed(1) : '--';
                // Build mini sparkline from recent deployment counts per week
                const spaceData = DashboardData.getSpaceData(s.id);
                const weeklyTotals = (summary.weeklyTrend || []).slice(-8).map(w => w.total);
                return `<tr>
                  <td><div class="flex items-center gap-sm"><div class="space-avatar sm">${s.name.charAt(0).toUpperCase()}</div> ${DOMPurify.sanitize(s.name)}</div></td>
                  <td class="monospace">${s.deploymentCount}</td>
                  <td class="monospace">${s.releaseCount}</td>
                  <td class="monospace">${dpr}</td>
                  <td>${sparkline(weeklyTotals, 80, 24)}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
  }


  // ==================================================================
  // RELIABILITY view
  // ==================================================================

  function renderReliability(summary) {
    const deploys = summary.recentDeployments || [];
    const failedDeploys = deploys.filter(d => (d.State || '').toLowerCase() === 'failed');
    const tasks = DashboardData.getCrossSpaceTasks() || [];

    // MTTR calculation from tasks that are failed
    let mttrMinutes = null;
    const failedTasks = tasks.filter(t => t.State === 'Failed' && t.StartTime && t.CompletedTime);
    if (failedTasks.length > 0) {
      const durations = failedTasks.map(t => (new Date(t.CompletedTime) - new Date(t.StartTime)) / 60000);
      mttrMinutes = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
    }

    // Success rate by space
    const spaceRates = summary.spaceBreakdown
      .filter(s => s.deploymentCount > 0)
      .sort((a, b) => a.successRate - b.successRate);

    // Failure trend from weekly data
    const failureTrend = (summary.weeklyTrend || []).slice(-12).map(w => w.failed);
    const successTrend = (summary.weeklyTrend || []).slice(-12).map(w => w.total > 0 ? Math.round(w.success / w.total * 100) : 100);

    return `
    <div class="page-header">
      <h1 class="page-title">Reliability</h1>
      <p class="page-subtitle">Deployment success, failure analysis, and mean time to recovery insights.</p>
    </div>

    <!-- Reliability KPIs -->
    <div class="kpi-grid mb-lg">
      <div class="kpi-card">
        <div class="flex items-center justify-between">
          <span class="kpi-label">Success Rate</span>
          <div class="kpi-icon green"><i class="fa-solid fa-circle-check"></i></div>
        </div>
        <span class="kpi-value">${summary.kpi.successRate}%</span>
        <span class="kpi-trend neutral"><i class="fa-solid fa-chart-simple"></i> <span>overall</span></span>
      </div>
      <div class="kpi-card">
        <div class="flex items-center justify-between">
          <span class="kpi-label">Failure Rate</span>
          <div class="kpi-icon danger"><i class="fa-solid fa-circle-xmark"></i></div>
        </div>
        <span class="kpi-value">${(100 - summary.kpi.successRate)}%</span>
        <span class="kpi-trend neutral"><i class="fa-solid fa-triangle-exclamation"></i> <span>${summary.failedCount} total failures</span></span>
      </div>
      <div class="kpi-card">
        <div class="flex items-center justify-between">
          <span class="kpi-label">MTTR (est.)</span>
          <div class="kpi-icon amber"><i class="fa-solid fa-stopwatch"></i></div>
        </div>
        <span class="kpi-value">${mttrMinutes !== null ? (mttrMinutes < 60 ? mttrMinutes + 'm' : Math.round(mttrMinutes / 60) + 'h') : '--'}</span>
        <span class="kpi-trend neutral"><i class="fa-solid fa-clock-rotate-left"></i> <span>${mttrMinutes !== null ? 'avg recovery time' : 'insufficient data'}</span></span>
      </div>
      <div class="kpi-card">
        <div class="flex items-center justify-between">
          <span class="kpi-label">Failed Deploys</span>
          <div class="kpi-icon danger"><i class="fa-solid fa-bug"></i></div>
        </div>
        <span class="kpi-value">${summary.failedCount}</span>
        <span class="kpi-trend neutral"><i class="fa-solid fa-database"></i> <span>all time</span></span>
      </div>
    </div>

    <!-- Failure trend + success rate by space -->
    <div class="dashboard-grid mb-lg">
      <div class="card col-span-6">
        <div class="card-header"><h3 class="card-title">Failure Trend (12 weeks)</h3></div>
        <div class="card-body">
          <div class="chart-container">${_renderMiniBarChart(failureTrend, 'var(--colorDanger)')}</div>
        </div>
      </div>
      <div class="card col-span-6">
        <div class="card-header"><h3 class="card-title">Success Rate by Space</h3></div>
        <div class="card-body">
          ${spaceRates.length ? spaceRates.map(s => `
            <div style="margin-bottom:var(--space-sm);">
              <div class="flex items-center justify-between" style="margin-bottom:2px;">
                <span style="font:var(--textBodyRegularSmall);color:var(--colorTextSecondary);">${DOMPurify.sanitize(s.name)}</span>
                <span style="font:var(--textBodyBoldSmall);color:${s.successRate >= 90 ? 'var(--colorSuccess)' : s.successRate >= 70 ? 'var(--colorWarningAccent)' : 'var(--colorDanger)'};">${s.successRate}%</span>
              </div>
              <div class="progress-bar" style="width:100%;"><div class="progress-fill ${s.successRate >= 90 ? 'success' : s.successRate >= 70 ? 'warning' : 'danger'}" style="width:${s.successRate}%;"></div></div>
            </div>
          `).join('') : '<div class="text-tertiary">No space data</div>'}
        </div>
      </div>
    </div>

    <!-- Failed deployments table -->
    <div class="section-header"><h2 class="section-title"><i class="fa-solid fa-circle-xmark"></i> Failed Deployments</h2></div>
    <div class="card">
      <div class="card-body" style="padding:0;">
        <div class="table-wrapper">
          <table>
            <thead><tr><th>Project</th><th>Release</th><th>Environment</th><th>Space</th><th>Duration</th><th>When</th></tr></thead>
            <tbody>
              ${failedDeploys.length > 0 ? failedDeploys.map(d => `<tr>
                <td>${DOMPurify.sanitize(d._projectName || d.ProjectId || '--')}</td>
                <td class="monospace">${DOMPurify.sanitize(d.ReleaseVersion || '--')}</td>
                <td>${DOMPurify.sanitize(d._envName || d.EnvironmentId || '--')}</td>
                <td><div class="flex items-center gap-xs"><div class="space-avatar sm" style="width:20px;height:20px;font-size:0.5rem;">${(d._spaceName || '?').charAt(0)}</div> <span class="text-secondary">${DOMPurify.sanitize(d._spaceName || '--')}</span></div></td>
                <td class="text-secondary monospace">${d.Duration || '--'}</td>
                <td class="text-secondary">${d.Created ? timeAgo(d.Created) : '--'}</td>
              </tr>`).join('') : '<tr><td colspan="6" class="text-secondary" style="text-align:center;padding:var(--space-lg);"><i class="fa-solid fa-check-circle text-success" style="margin-right:var(--space-xs);"></i> No failed deployments — nice!</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
  }

  function _renderMiniBarChart(data, color) {
    if (!data || data.length === 0) return '<div class="text-tertiary" style="text-align:center;">No data</div>';
    const max = Math.max(...data, 1);
    return `<div style="display:flex;align-items:flex-end;gap:4px;height:120px;padding:var(--space-sm) 0;">
      ${data.map(v => {
        const h = Math.max(v / max * 100, 2);
        return `<div style="flex:1;background:${color};height:${h}%;border-radius:3px 3px 0 0;min-width:8px;" title="${v}"></div>`;
      }).join('')}
    </div>`;
  }


  // ==================================================================
  // SPACES view
  // ==================================================================

  function renderSpaces(summary) {
    const spaces = summary.spaceBreakdown || [];

    return `
    <div class="page-header">
      <h1 class="page-title">Spaces</h1>
      <p class="page-subtitle">Overview of all Octopus spaces with key stats and drill-down detail.</p>
    </div>

    <div class="kpi-grid mb-lg">
      <div class="kpi-card">
        <div class="flex items-center justify-between">
          <span class="kpi-label">Total Spaces</span>
          <div class="kpi-icon blue"><i class="fa-solid fa-cubes"></i></div>
        </div>
        <span class="kpi-value">${summary.kpi.totalSpaces}</span>
        <span class="kpi-trend neutral"><i class="fa-solid fa-layer-group"></i> <span>${summary.kpi.activeSpaces} active</span></span>
      </div>
      <div class="kpi-card">
        <div class="flex items-center justify-between">
          <span class="kpi-label">Total Projects</span>
          <div class="kpi-icon purple"><i class="fa-solid fa-diagram-project"></i></div>
        </div>
        <span class="kpi-value">${summary.kpi.activeProjects}</span>
        <span class="kpi-trend neutral"><i class="fa-solid fa-folder-open"></i> <span>across all spaces</span></span>
      </div>
    </div>

    <div class="section-header"><h2 class="section-title"><i class="fa-solid fa-th-large"></i> All Spaces</h2></div>
    <div class="space-card-grid" id="space-card-grid">
      ${spaces.map(s => `
        <div class="space-card" data-space-id="${s.id}">
          <div class="space-card-header">
            <div class="space-avatar">${s.name.charAt(0).toUpperCase()}</div>
            <div>
              <div class="space-card-name">${DOMPurify.sanitize(s.name)}</div>
              ${s.description ? `<div class="space-card-desc">${DOMPurify.sanitize(s.description)}</div>` : ''}
            </div>
          </div>
          <div class="space-card-stats">
            <div class="space-card-stat">
              <span class="space-card-stat-value">${s.projectCount}</span>
              <span class="space-card-stat-label">Projects</span>
            </div>
            <div class="space-card-stat">
              <span class="space-card-stat-value">${s.deploymentCount}</span>
              <span class="space-card-stat-label">Deploys</span>
            </div>
            <div class="space-card-stat">
              <span class="space-card-stat-value">${s.successRate}%</span>
              <span class="space-card-stat-label">Success</span>
            </div>
            <div class="space-card-stat">
              <span class="space-card-stat-value">${s.targetCount}</span>
              <span class="space-card-stat-label">Targets</span>
            </div>
          </div>
          <div class="space-card-footer">
            <div class="flex items-center gap-xs">
              <div class="progress-bar" style="width:60px;"><div class="progress-fill ${s.successRate >= 90 ? 'success' : s.successRate >= 70 ? 'warning' : 'danger'}" style="width:${s.successRate}%;"></div></div>
              ${healthBadge(s.successRate, s.deploymentCount > 0)}
            </div>
            <span class="text-tertiary" style="font:var(--textBodyRegularXSmall);">${s.lastDeployment ? timeAgo(s.lastDeployment) : 'No deploys'}</span>
          </div>
        </div>
      `).join('')}
    </div>

    <!-- Drill-down panel -->
    <div id="space-detail-panel" class="space-detail-panel" style="display:none;"></div>`;
  }

  function wireSpacesEvents(summary) {
    document.querySelectorAll('.space-card[data-space-id]').forEach(card => {
      card.addEventListener('click', () => {
        const spaceId = card.dataset.spaceId;
        const spaceInfo = summary.spaceBreakdown.find(s => s.id === spaceId);
        const spaceData = DashboardData.getSpaceData(spaceId);
        const panel = document.getElementById('space-detail-panel');
        if (!panel || !spaceInfo) return;

        // Toggle off if clicking same card
        if (panel.style.display !== 'none' && panel.dataset.activeSpace === spaceId) {
          panel.style.display = 'none';
          card.classList.remove('active');
          return;
        }

        document.querySelectorAll('.space-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        panel.dataset.activeSpace = spaceId;
        panel.style.display = '';

        const projects = spaceData?.projects || [];
        const envs = spaceData?.environments || [];
        const deploys = spaceData?.deployments || [];
        const recent = deploys.slice(0, 10);

        panel.innerHTML = `
          <div class="card mt-lg">
            <div class="card-header">
              <h3 class="card-title"><div class="space-avatar sm" style="display:inline-flex;vertical-align:middle;margin-right:var(--space-xs);">${spaceInfo.name.charAt(0).toUpperCase()}</div> ${DOMPurify.sanitize(spaceInfo.name)} — Detail</h3>
              <button class="btn btn-secondary btn-sm" id="close-space-detail"><i class="fa-solid fa-times"></i></button>
            </div>
            <div class="card-body">
              <div class="dashboard-grid">
                <div class="col-span-6">
                  <h4 style="font:var(--textBodyBoldMedium);color:var(--colorTextPrimary);margin-bottom:var(--space-sm);">Projects (${projects.length})</h4>
                  ${projects.length ? `<div class="flex flex-col gap-xs">${projects.map(p => `<div class="flex items-center gap-xs"><i class="fa-solid fa-diagram-project text-tertiary" style="font-size:0.7rem;"></i> <span style="font:var(--textBodyRegularSmall);color:var(--colorTextSecondary);">${DOMPurify.sanitize(p.Name || p.Id)}</span></div>`).join('')}</div>` : '<span class="text-tertiary">No projects</span>'}
                </div>
                <div class="col-span-6">
                  <h4 style="font:var(--textBodyBoldMedium);color:var(--colorTextPrimary);margin-bottom:var(--space-sm);">Environments (${envs.length})</h4>
                  ${envs.length ? `<div class="flex flex-wrap gap-xs">${envs.map(e => `<span class="env-tag ${guessEnvClass(e.Name || '')}">${DOMPurify.sanitize(e.Name || e.Id)}</span>`).join('')}</div>` : '<span class="text-tertiary">No environments</span>'}
                </div>
              </div>
              ${recent.length ? `
              <h4 style="font:var(--textBodyBoldMedium);color:var(--colorTextPrimary);margin:var(--space-md) 0 var(--space-sm);">Recent Deployments</h4>
              <div class="table-wrapper">
                <table>
                  <thead><tr><th>Project</th><th>Environment</th><th>Status</th><th>When</th></tr></thead>
                  <tbody>
                    ${recent.map(d => {
                      const state = (d.State || '').toLowerCase();
                      const cls = state === 'success' ? 'success' : state === 'failed' ? 'danger' : 'neutral';
                      return `<tr>
                        <td>${DOMPurify.sanitize(d._projectName || d.ProjectId || '--')}</td>
                        <td>${DOMPurify.sanitize(d._envName || d.EnvironmentId || '--')}</td>
                        <td><span class="badge ${cls}">${state.charAt(0).toUpperCase() + state.slice(1)}</span></td>
                        <td class="text-secondary">${d.Created ? timeAgo(d.Created) : '--'}</td>
                      </tr>`;
                    }).join('')}
                  </tbody>
                </table>
              </div>` : ''}
            </div>
          </div>`;

        document.getElementById('close-space-detail')?.addEventListener('click', () => {
          panel.style.display = 'none';
          document.querySelectorAll('.space-card').forEach(c => c.classList.remove('active'));
        });

        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }


  // ==================================================================
  // PROJECTS view
  // ==================================================================

  function renderProjects(summary) {
    // Collect all projects across all spaces
    const allProjects = [];
    const allSpaceData = DashboardData.getAllSpaceData();

    for (const spaceId of Object.keys(allSpaceData)) {
      const sd = allSpaceData[spaceId];
      const spaceName = sd.space?.Name || spaceId;
      const projects = sd.projects || [];
      const deploys = sd.deployments || [];

      for (const p of projects) {
        const projDeploys = deploys.filter(d => d.ProjectId === p.Id);
        const successCount = projDeploys.filter(d => (d.State || '').toLowerCase() === 'success').length;
        const rate = projDeploys.length > 0 ? Math.round(successCount / projDeploys.length * 100) : null;
        const lastDeploy = projDeploys.length > 0 ? projDeploys[0].Created : null;

        allProjects.push({
          name: p.Name || p.Id,
          space: spaceName,
          deployments: projDeploys.length,
          successRate: rate,
          lastDeploy: lastDeploy,
        });
      }
    }

    // Sort by most recently deployed
    allProjects.sort((a, b) => {
      if (!a.lastDeploy && !b.lastDeploy) return 0;
      if (!a.lastDeploy) return 1;
      if (!b.lastDeploy) return -1;
      return new Date(b.lastDeploy) - new Date(a.lastDeploy);
    });

    return `
    <div class="page-header">
      <h1 class="page-title">Projects</h1>
      <p class="page-subtitle">All projects across all spaces &mdash; search, filter, and compare deployment activity.</p>
    </div>

    <div class="kpi-grid mb-lg">
      <div class="kpi-card">
        <div class="flex items-center justify-between">
          <span class="kpi-label">Total Projects</span>
          <div class="kpi-icon purple"><i class="fa-solid fa-diagram-project"></i></div>
        </div>
        <span class="kpi-value">${allProjects.length}</span>
        <span class="kpi-trend neutral"><i class="fa-solid fa-folder-open"></i> <span>across ${summary.kpi.totalSpaces} spaces</span></span>
      </div>
      <div class="kpi-card">
        <div class="flex items-center justify-between">
          <span class="kpi-label">With Deployments</span>
          <div class="kpi-icon green"><i class="fa-solid fa-rocket"></i></div>
        </div>
        <span class="kpi-value">${allProjects.filter(p => p.deployments > 0).length}</span>
        <span class="kpi-trend neutral"><i class="fa-solid fa-check"></i> <span>projects with deploys</span></span>
      </div>
    </div>

    <div class="section-header">
      <h2 class="section-title"><i class="fa-solid fa-list"></i> All Projects</h2>
    </div>

    <div class="card">
      <div class="card-header">
        <div class="view-search-wrapper">
          <i class="fa-solid fa-search text-tertiary"></i>
          <input type="text" id="project-search" class="view-search-input" placeholder="Search projects...">
        </div>
      </div>
      <div class="card-body" style="padding:0;">
        <div class="table-wrapper">
          <table>
            <thead><tr>
              <th>Project</th><th>Space</th><th>Deployments</th><th>Success Rate</th><th>Last Deploy</th>
            </tr></thead>
            <tbody id="projects-tbody">
              ${_renderProjectRows(allProjects)}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
  }

  function _renderProjectRows(projects) {
    if (projects.length === 0) {
      return '<tr><td colspan="5" class="text-secondary" style="text-align:center;padding:var(--space-lg);">No projects found</td></tr>';
    }
    return projects.map(p => `<tr data-project-name="${DOMPurify.sanitize(p.name.toLowerCase())}">
      <td><div class="flex items-center gap-sm"><i class="fa-solid fa-diagram-project text-tertiary" style="font-size:0.8rem;"></i> ${DOMPurify.sanitize(p.name)}</div></td>
      <td><span class="text-secondary">${DOMPurify.sanitize(p.space)}</span></td>
      <td class="monospace">${p.deployments}</td>
      <td>${p.successRate !== null ? `<div class="flex items-center gap-xs"><div class="progress-bar" style="width:60px;"><div class="progress-fill ${p.successRate >= 90 ? 'success' : p.successRate >= 70 ? 'warning' : 'danger'}" style="width:${p.successRate}%;"></div></div><span class="text-secondary">${p.successRate}%</span></div>` : '<span class="text-tertiary">--</span>'}</td>
      <td class="text-secondary">${p.lastDeploy ? timeAgo(p.lastDeploy) : '--'}</td>
    </tr>`).join('');
  }

  function wireProjectsEvents() {
    const input = document.getElementById('project-search');
    if (!input) return;
    input.addEventListener('input', () => {
      const query = input.value.toLowerCase().trim();
      document.querySelectorAll('#projects-tbody tr[data-project-name]').forEach(row => {
        row.style.display = !query || row.dataset.projectName.includes(query) ? '' : 'none';
      });
    });
  }


  // ==================================================================
  // ENVIRONMENTS view
  // ==================================================================

  function renderEnvironments(summary) {
    const envHealth = summary.envHealth || [];
    const allSpaceData = DashboardData.getAllSpaceData();

    // Build richer environment data with categorisation
    const envGroups = { production: [], staging: [], dev: [] };

    for (const env of envHealth) {
      const cls = guessEnvClass(env.name);
      const entry = {
        name: env.name,
        success: env.success,
        failed: env.failed,
        total: env.total,
        successRate: env.successRate,
        spaces: env.spaces,
        cls: cls,
      };
      if (envGroups[cls]) envGroups[cls].push(entry);
      else envGroups.dev.push(entry);
    }

    // Also gather per-space environment details
    const envDetails = [];
    for (const spaceId of Object.keys(allSpaceData)) {
      const sd = allSpaceData[spaceId];
      const spaceName = sd.space?.Name || spaceId;
      for (const env of (sd.environments || [])) {
        envDetails.push({
          name: env.Name || env.Id,
          space: spaceName,
          cls: guessEnvClass(env.Name || ''),
        });
      }
    }

    function renderGroup(label, icon, envs, tagClass) {
      if (envs.length === 0) return '';
      return `
        <div class="section-header"><h2 class="section-title"><i class="${icon}"></i> ${label}</h2></div>
        <div class="env-card-grid mb-lg">
          ${envs.map(e => `
            <div class="env-detail-card">
              <div class="env-detail-header">
                <span class="env-tag ${tagClass}">${DOMPurify.sanitize(e.name)}</span>
                ${healthBadge(e.successRate, e.total > 0)}
              </div>
              <div class="env-detail-stats">
                <div class="env-detail-stat">
                  <span class="env-detail-stat-value">${e.total}</span>
                  <span class="env-detail-stat-label">Deploys</span>
                </div>
                <div class="env-detail-stat">
                  <span class="env-detail-stat-value text-success">${e.success}</span>
                  <span class="env-detail-stat-label">Success</span>
                </div>
                <div class="env-detail-stat">
                  <span class="env-detail-stat-value text-danger">${e.failed}</span>
                  <span class="env-detail-stat-label">Failed</span>
                </div>
                <div class="env-detail-stat">
                  <span class="env-detail-stat-value">${e.successRate}%</span>
                  <span class="env-detail-stat-label">Rate</span>
                </div>
              </div>
              <div class="env-detail-footer">
                <span class="text-tertiary" style="font:var(--textBodyRegularXSmall);">
                  <i class="fa-solid fa-cubes"></i> ${e.spaces.length} space${e.spaces.length !== 1 ? 's' : ''}: ${e.spaces.join(', ')}
                </span>
              </div>
              <div style="margin-top:var(--space-xs);">
                <div class="progress-bar" style="width:100%;"><div class="progress-fill ${e.successRate >= 90 ? 'success' : e.successRate >= 70 ? 'warning' : 'danger'}" style="width:${e.successRate}%;"></div></div>
              </div>
            </div>
          `).join('')}
        </div>`;
    }

    return `
    <div class="page-header">
      <h1 class="page-title">Environments</h1>
      <p class="page-subtitle">Environment health, deployment success rates, and target health grouped by type.</p>
    </div>

    <div class="kpi-grid mb-lg">
      <div class="kpi-card">
        <div class="flex items-center justify-between">
          <span class="kpi-label">Environments</span>
          <div class="kpi-icon blue"><i class="fa-solid fa-server"></i></div>
        </div>
        <span class="kpi-value">${envHealth.length}</span>
        <span class="kpi-trend neutral"><i class="fa-solid fa-list"></i> <span>unique environments</span></span>
      </div>
      <div class="kpi-card">
        <div class="flex items-center justify-between">
          <span class="kpi-label">Production</span>
          <div class="kpi-icon green"><i class="fa-solid fa-shield-halved"></i></div>
        </div>
        <span class="kpi-value">${envGroups.production.length}</span>
        <span class="kpi-trend neutral"><i class="fa-solid fa-lock"></i> <span>prod environments</span></span>
      </div>
      <div class="kpi-card">
        <div class="flex items-center justify-between">
          <span class="kpi-label">Deployment Targets</span>
          <div class="kpi-icon amber"><i class="fa-solid fa-bullseye"></i></div>
        </div>
        <span class="kpi-value">${summary.kpi.totalTargets}</span>
        <span class="kpi-trend neutral"><i class="fa-solid fa-heart-pulse"></i> <span>${summary.kpi.healthyTargetsPct}% healthy</span></span>
      </div>
    </div>

    ${renderGroup('Production', 'fa-solid fa-shield-halved', envGroups.production, 'production')}
    ${renderGroup('Staging / UAT', 'fa-solid fa-flask', envGroups.staging, 'staging')}
    ${renderGroup('Development', 'fa-solid fa-code', envGroups.dev, 'dev')}

    <!-- All environments table -->
    <div class="section-header"><h2 class="section-title"><i class="fa-solid fa-table"></i> All Environments</h2></div>
    <div class="card">
      <div class="card-body" style="padding:0;">
        <div class="table-wrapper">
          <table>
            <thead><tr><th>Environment</th><th>Type</th><th>Spaces</th><th>Deployments</th><th>Success Rate</th><th>Health</th></tr></thead>
            <tbody>
              ${envHealth.map(e => `<tr>
                <td><span class="env-tag ${guessEnvClass(e.name)}">${DOMPurify.sanitize(e.name)}</span></td>
                <td class="text-secondary">${guessEnvClass(e.name).charAt(0).toUpperCase() + guessEnvClass(e.name).slice(1)}</td>
                <td class="text-secondary">${e.spaces.join(', ')}</td>
                <td class="monospace">${e.total}</td>
                <td><div class="flex items-center gap-xs"><div class="progress-bar" style="width:60px;"><div class="progress-fill ${e.successRate >= 90 ? 'success' : e.successRate >= 70 ? 'warning' : 'danger'}" style="width:${e.successRate}%;"></div></div><span class="text-secondary">${e.successRate}%</span></div></td>
                <td>${healthBadge(e.successRate, e.total > 0)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
  }


  // ==================================================================
  // TEAMS view
  // ==================================================================

  function renderTeams(summary) {
    // Teams data isn't available from the standard Octopus Deploy REST API endpoints
    // we're using (Spaces, Projects, Deployments, Environments, Machines).
    // Show a helpful placeholder with available activity data.

    const spaces = summary.spaceBreakdown || [];
    const totalDeploys = summary.kpi.totalDeployments;

    return `
    <div class="page-header">
      <h1 class="page-title">Teams</h1>
      <p class="page-subtitle">Team-level deployment activity and ownership insights.</p>
    </div>

    <div class="card mb-lg">
      <div class="card-body" style="text-align:center;padding:var(--space-xl) var(--space-lg);">
        <div style="font-size:3rem;margin-bottom:var(--space-md);color:var(--colorTextTertiary);">
          <i class="fa-solid fa-users"></i>
        </div>
        <h3 style="font:var(--textHeadingSmall);color:var(--colorTextPrimary);margin:0 0 var(--space-xs);">Team data requires additional API access</h3>
        <p class="text-secondary" style="font:var(--textBodyRegularMedium);max-width:500px;margin:0 auto var(--space-md);line-height:1.5;">
          The Octopus Deploy Teams API requires specific permissions to access team membership and project ownership data.
          Below is a space-level activity breakdown as a proxy for team activity.
        </p>
        <a href="https://octopus.com/docs/octopus-rest-api" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm">
          <i class="fa-solid fa-external-link-alt"></i>
          Octopus REST API Docs
        </a>
      </div>
    </div>

    <!-- Space-level activity as team proxy -->
    <div class="section-header"><h2 class="section-title"><i class="fa-solid fa-cubes"></i> Activity by Space</h2></div>
    <div class="card">
      <div class="card-body" style="padding:0;">
        <div class="table-wrapper">
          <table>
            <thead><tr>
              <th>Space</th><th>Projects</th><th>Deployments</th><th>Success Rate</th>
              <th>Share of Deploys</th><th>Last Activity</th>
            </tr></thead>
            <tbody>
              ${spaces.map(s => {
                const share = totalDeploys > 0 ? Math.round(s.deploymentCount / totalDeploys * 100) : 0;
                return `<tr>
                  <td><div class="flex items-center gap-sm"><div class="space-avatar sm">${s.name.charAt(0).toUpperCase()}</div> ${DOMPurify.sanitize(s.name)}</div></td>
                  <td class="monospace">${s.projectCount}</td>
                  <td class="monospace">${s.deploymentCount}</td>
                  <td><div class="flex items-center gap-xs"><div class="progress-bar" style="width:60px;"><div class="progress-fill ${s.successRate >= 90 ? 'success' : s.successRate >= 70 ? 'warning' : 'danger'}" style="width:${s.successRate}%;"></div></div><span class="text-secondary">${s.successRate}%</span></div></td>
                  <td><div class="flex items-center gap-xs"><div class="progress-bar" style="width:60px;"><div class="progress-fill info" style="width:${share}%;"></div></div><span class="text-secondary">${share}%</span></div></td>
                  <td class="text-secondary">${s.lastDeployment ? timeAgo(s.lastDeployment) : '--'}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
  }


  // ---- Public API ----

  return {
    // Overview
    getOverviewHTML,
    wireOverviewEvents,
    // Dashboard views
    renderTrends,
    wireTrendsEvents,
    renderVelocity,
    renderReliability,
    // Insight views
    renderSpaces,
    wireSpacesEvents,
    renderProjects,
    wireProjectsEvents,
    renderEnvironments,
    renderTeams,
  };

})();
