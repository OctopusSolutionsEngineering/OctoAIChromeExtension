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

  /** Deployment success–rate tier for the selected dashboard period (not target/machine health). */
  function healthBadge(rate, hasDeployments) {
    if (rate >= 95) {
      return `<span class="badge success" data-tooltip="${_tooltipAttr('Deployment success rate is 95% or higher for this row in the selected time range.')}" aria-label="${_tooltipAttr('Deployment success rate is 95% or higher for this row in the selected time range.')}" title="${_tooltipAttr('Deployment success rate is 95% or higher for this row in the selected time range.')}">Healthy</span>`;
    }
    if (rate >= 80) {
      return `<span class="badge info" data-tooltip="${_tooltipAttr('Success rate is between 80% and 94%. Worth monitoring before it drops further.')}" aria-label="${_tooltipAttr('Success rate is between 80% and 94%. Worth monitoring before it drops further.')}" title="${_tooltipAttr('Success rate is between 80% and 94%. Worth monitoring before it drops further.')}">Attention</span>`;
    }
    if (rate < 80 && (rate > 0 || hasDeployments)) {
      return `<span class="badge warning" data-tooltip="${_tooltipAttr('Success rate is below 80%, or there was deployment activity with a low success rate. Review failed deployments and trends.')}" aria-label="${_tooltipAttr('Success rate is below 80%, or there was deployment activity with a low success rate. Review failed deployments and trends.')}" title="${_tooltipAttr('Success rate is below 80%, or there was deployment activity with a low success rate. Review failed deployments and trends.')}">Warning</span>`;
    }
    return `<span class="badge neutral" data-tooltip="${_tooltipAttr('Not enough deployment outcomes in the selected period to calculate a success rate.')}" aria-label="${_tooltipAttr('Not enough deployment outcomes in the selected period to calculate a success rate.')}" title="${_tooltipAttr('Not enough deployment outcomes in the selected period to calculate a success rate.')}">No data</span>`;
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

    ${_enrichBannerHtml()}

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
        <span class="kpi-trend neutral"><i class="fa-solid fa-database"></i> <span id="kpi-deployments-label">all time, all spaces</span></span>
      </div>
      <div class="kpi-card">
        <div class="flex items-center justify-between">
          <span class="kpi-label">Success Rate</span>
          <div class="kpi-icon green"><i class="fa-solid fa-circle-check"></i></div>
        </div>
        <span class="kpi-value" id="kpi-success-rate">--</span>
        <span class="kpi-trend neutral"><i class="fa-solid fa-chart-simple"></i> <span id="kpi-success-rate-label">across recent deploys</span></span>
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
        <span class="kpi-trend neutral"><i class="fa-solid fa-clock"></i> <span id="kpi-avg-duration-label">per deployment</span></span>
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
      <div class="kpi-card">
        <div class="flex items-center justify-between">
          <span class="kpi-label">Current Tasks</span>
          <div class="kpi-icon blue"><i class="fa-solid fa-list-check"></i></div>
        </div>
        <span class="kpi-value" id="kpi-tasks-executing">--</span>
        <span class="kpi-trend neutral"><i class="fa-solid fa-hourglass-half"></i> <span id="kpi-tasks-label">executing now</span></span>
      </div>
    </div>

    <!-- Charts Section Header -->
    <div class="section-header">
      <h2 class="section-title"><i class="fa-solid fa-chart-bar"></i> Deployment Activity</h2>
    </div>

    <!-- Charts Row -->
    <div class="dashboard-grid mb-lg">
      <div class="card col-span-8 card--chart-tooltips">
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

    <!-- Task Activity Section -->
    <div class="section-header">
      <h2 class="section-title"><i class="fa-solid fa-list-check"></i> Task Activity</h2>
    </div>
    <div class="dashboard-grid mb-lg">
      <div class="card col-span-12 card--chart-tooltips">
        <div class="card-header">
          <h3 class="card-title">Task Volume</h3>
          <div class="flex items-center gap-md">
            <span style="font:var(--textBodyRegularXSmall);color:var(--colorTextTertiary);display:flex;align-items:center;gap:4px">
              <span style="display:inline-block;width:20px;height:0;border-bottom:2px dashed var(--colorWarningLight);vertical-align:middle;margin-right:2px;"></span>Task cap
            </span>
            <div class="flex gap-xs">
              <button class="btn btn-secondary btn-sm task-range-btn${(DashboardUI.getTaskChartRange() || '30d') === '1h' ? ' active-toggle' : ''}" data-range="1h">1h</button>
              <button class="btn btn-secondary btn-sm task-range-btn${(DashboardUI.getTaskChartRange() || '30d') === '3h' ? ' active-toggle' : ''}" data-range="3h">3h</button>
              <button class="btn btn-secondary btn-sm task-range-btn${(DashboardUI.getTaskChartRange() || '30d') === '6h' ? ' active-toggle' : ''}" data-range="6h">6h</button>
              <button class="btn btn-secondary btn-sm task-range-btn${(DashboardUI.getTaskChartRange() || '30d') === '12h' ? ' active-toggle' : ''}" data-range="12h">12h</button>
              <button class="btn btn-secondary btn-sm task-range-btn${(DashboardUI.getTaskChartRange() || '30d') === '24h' ? ' active-toggle' : ''}" data-range="24h">24h</button>
            </div>
            <div class="flex gap-xs">
              <button class="btn btn-secondary btn-sm task-range-btn${(DashboardUI.getTaskChartRange() || '30d') === '7d' ? ' active-toggle' : ''}" data-range="7d">7d</button>
              <button class="btn btn-secondary btn-sm task-range-btn${(DashboardUI.getTaskChartRange() || '30d') === '30d' ? ' active-toggle' : ''}" data-range="30d">30d</button>
              <button class="btn btn-secondary btn-sm task-range-btn${(DashboardUI.getTaskChartRange() || '30d') === '90d' ? ' active-toggle' : ''}" data-range="90d">90d</button>
              <button class="btn btn-secondary btn-sm task-range-btn${(DashboardUI.getTaskChartRange() || '30d') === '12m' ? ' active-toggle' : ''}" data-range="12m">12m</button>
            </div>
          </div>
        </div>
        <div class="card-body">
          <div id="chart-task-activity" style="padding:var(--space-sm) 0;">
            <i class="fa-solid fa-chart-line" style="font-size:2rem;margin-right:var(--space-sm);"></i>
            Loading task activity...
          </div>
        </div>
      </div>
    </div>

    <!-- Spaces Section Header -->
    <div class="section-header">
      <h2 class="section-title"><i class="fa-solid fa-cubes"></i> Space Breakdown</h2>
    </div>

    <!-- Spaces Breakdown Table -->
    <div class="dashboard-grid mb-lg">
      <div class="card col-span-12">
        <div class="card-body" style="padding:0;">
          <div class="table-wrapper table-wrapper--recent-scroll">
            <table>
              <thead>
                <tr>
                  <th>Space</th><th>Projects</th><th>Envs</th><th>Deployments</th>
                  <th>Success Rate</th><th>Targets</th><th>Last Deploy</th>
                  <th data-tooltip="Deployment success tier for the selected time range (not target health). Hover a badge for definitions: Healthy ≥95%, Attention 80–94%, Warning &lt;80%, No data when there is nothing to score." title="Deployment success tier for the selected time range (not target health). Hover a badge for definitions: Healthy ≥95%, Attention 80–94%, Warning &lt;80%, No data when there is nothing to score.">Health</th>
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
          <div class="table-wrapper table-wrapper--recent-scroll">
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
    <div class="card license-card mt-lg">
      <div class="license-card-header">
        <div class="license-card-main">
          <i class="fa-solid fa-id-badge text-tertiary" aria-hidden="true"></i>
          <span class="license-card-heading text-secondary">License</span>
          <div id="license-info" class="license-card-status">--</div>
        </div>
        <span class="text-tertiary license-card-version" id="server-version"></span>
      </div>
      <div id="license-ptm" class="license-ptm" aria-label="Licensed usage: projects, tenants, machines"></div>
    </div>
`;
  }

  /** Wire up Overview-specific event listeners after HTML is inserted */
  function wireOverviewEvents() {
    const startBtn = document.getElementById('btn-start-onboarding');
    if (startBtn) startBtn.addEventListener('click', () => {
      Analytics.trackEvent('onboarding_started', { trigger: 'cta_button' });
      if (typeof openOnboarding === 'function') openOnboarding();
    });

    const editBtn = document.getElementById('btn-edit-value-settings');
    if (editBtn) editBtn.addEventListener('click', () => {
      Analytics.trackEvent('value_settings_opened');
      if (typeof openOnboarding === 'function') openOnboarding();
    });

    // Deployment trend range buttons (exclude task chart buttons)
    document.querySelectorAll('[data-range]:not(.task-range-btn)').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-range]:not(.task-range-btn)').forEach(b => b.classList.remove('active-toggle'));
        btn.classList.add('active-toggle');
        DashboardUI.setTrendRange(btn.dataset.range);
        Analytics.trackEvent('chart_range_changed', { view: 'overview', range: btn.dataset.range });
      });
    });

    // Task activity chart range buttons
    document.querySelectorAll('.task-range-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const range = btn.dataset.range;

        // Check if the requested range exceeds loaded data
        const rangeMonths = { '90d': 3, '12m': 12 }[range];
        if (rangeMonths) {
          const loadedRaw = DashboardData.getEnrichmentState().lookbackMonths ?? 3;
          const loaded = loadedRaw === 0 ? Infinity : loadedRaw;
          if (rangeMonths > loaded) {
            const label = rangeMonths >= 12 ? `${rangeMonths / 12} year` : `${rangeMonths} months`;
            const heavy = rangeMonths >= 12;
            const msg = `This range requires ${label} of data, but only ${loaded} months are currently loaded.\n\nLoad ${label} now?`
              + (heavy ? '\n\nNote: loading a year or more of data can be slow and heavy on larger Octopus instances.' : '');
            if (!confirm(msg)) return;
            document.dispatchEvent(new CustomEvent('tc-request-lookback', {
              detail: { months: rangeMonths, afterDays: rangeMonths * 30 }
            }));
            return;
          }
        }

        document.querySelectorAll('.task-range-btn').forEach(b => b.classList.remove('active-toggle'));
        btn.classList.add('active-toggle');
        DashboardUI.setTaskChartRange(range);
      });
    });
  }


  // ==================================================================
  // DEPLOYMENT TRENDS view
  // ==================================================================

  function renderTrends(summary) {
    const enriched = DashboardData.computeEnrichedKPIs();
    const totalDeploys = enriched ? enriched.totalDeployments : summary.kpi.totalDeployments;
    const successRate = enriched ? enriched.successRate : summary.kpi.successRate;
    const frequency = enriched ? enriched.deployFrequency : summary.kpi.deployFrequency;
    const periodLabel = enriched ? enriched.periodLabel : null;
    const trendChange = DashboardData.computeTrendChange(summary.weeklyTrend);
    const envBreakdown = DashboardData.computePerEnvTypeDeployments();
    const tzMode = DashboardData.getTimezoneMode();

    const wt = summary.weeklyTrend || [];
    const thisWeek = wt.length > 0 ? wt[wt.length - 1] : null;
    const lastWeek = wt.length > 1 ? wt[wt.length - 2] : null;
    const thisWeekTotal = thisWeek ? thisWeek.total : 0;
    const weekChangeHtml = lastWeek && lastWeek.total > 0
      ? (() => {
          const pct = Math.round(((thisWeekTotal - lastWeek.total) / lastWeek.total) * 100);
          const icon = pct > 0 ? 'fa-arrow-up' : pct < 0 ? 'fa-arrow-down' : 'fa-minus';
          const cls = pct > 0 ? 'text-success' : pct < 0 ? 'text-danger' : 'text-secondary';
          return `<span class="${cls}"><i class="fa-solid ${icon}"></i> ${Math.abs(pct)}% vs last wk</span>`;
        })()
      : '<span>current week</span>';

    const trendArrow = !trendChange ? { icon: 'fa-minus', cls: 'amber', label: 'insufficient data' }
      : trendChange.direction === 'up' ? { icon: 'fa-arrow-trend-up', cls: 'green', label: `↑ ${trendChange.pct}% vs prior period` }
      : trendChange.direction === 'down' ? { icon: 'fa-arrow-trend-down', cls: 'danger', label: `↓ ${trendChange.pct}% vs prior period` }
      : { icon: 'fa-minus', cls: 'amber', label: 'stable' };

    const envTotal = envBreakdown.types.production + envBreakdown.types.staging + envBreakdown.types.dev;
    const envPct = (n) => envTotal > 0 ? Math.round(n / envTotal * 100) : 0;

    return `
    <div class="page-header">
      <h1 class="page-title">Deployment Trends</h1>
      <p class="page-subtitle">Deployment activity over time &mdash; track patterns, compare spaces, and spot trends.</p>
    </div>

    ${_enrichBannerHtml()}

    <!-- KPI strip -->
    <div class="kpi-grid mb-lg">
      <div class="kpi-card">
        <div class="flex items-center justify-between">
          <span class="kpi-label">Total Deployments</span>
          <div class="kpi-icon blue"><i class="fa-solid fa-rocket"></i></div>
        </div>
        <span class="kpi-value">${totalDeploys.toLocaleString()}</span>
        <span class="kpi-trend neutral"><i class="fa-solid fa-database"></i> <span>${periodLabel || 'all time'}</span></span>
      </div>
      <div class="kpi-card">
        <div class="flex items-center justify-between">
          <span class="kpi-label">This Week</span>
          <div class="kpi-icon purple"><i class="fa-solid fa-calendar-week"></i></div>
        </div>
        <span class="kpi-value">${thisWeekTotal}</span>
        <span class="kpi-trend neutral"><i class="fa-solid fa-chart-line"></i> ${weekChangeHtml}</span>
      </div>
      <div class="kpi-card">
        <div class="flex items-center justify-between">
          <span class="kpi-label">Success Rate</span>
          <div class="kpi-icon green"><i class="fa-solid fa-circle-check"></i></div>
        </div>
        <span class="kpi-value">${successRate}%</span>
        <span class="kpi-trend neutral"><i class="fa-solid fa-chart-simple"></i> <span>${periodLabel || 'across all deploys'}</span></span>
      </div>
      <div class="kpi-card">
        <div class="flex items-center justify-between">
          <span class="kpi-label">Deploy Frequency</span>
          <div class="kpi-icon amber"><i class="fa-solid fa-bolt"></i></div>
        </div>
        <span class="kpi-value">${frequency}/day</span>
        <span class="kpi-trend neutral"><i class="fa-solid fa-calendar-days"></i> <span>${periodLabel || 'last 30 days'}</span></span>
      </div>
      <div class="kpi-card">
        <div class="flex items-center justify-between">
          <span class="kpi-label">4-Week Trend</span>
          <div class="kpi-icon ${trendArrow.cls}"><i class="fa-solid ${trendArrow.icon}"></i></div>
        </div>
        <span class="kpi-value" style="${trendChange ? (trendChange.direction === 'up' ? 'color:var(--colorSuccess)' : trendChange.direction === 'down' ? 'color:var(--colorDanger)' : '') : ''}">${trendChange ? (trendChange.direction === 'flat' ? 'Stable' : `${trendChange.pct}%`) : '--'}</span>
        <span class="kpi-trend neutral"><i class="fa-solid fa-scale-balanced"></i> <span>${trendArrow.label}</span></span>
      </div>
    </div>

    <!-- Full-width trend chart -->
    <div class="section-header">
      <h2 class="section-title"><i class="fa-solid fa-chart-bar"></i> Deployment Timeline</h2>
    </div>
    <div class="card card--chart-tooltips mb-lg">
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
        <div class="chart-container" id="trends-chart">${_renderTrendChart(summary, '30d')}</div>
      </div>
    </div>

    <!-- Deployment Patterns -->
    <div class="section-header">
      <h2 class="section-title"><i class="fa-solid fa-calendar-alt"></i> Deployment Patterns</h2>
      <div class="flex gap-xs" role="group" aria-label="Timezone for deployment patterns">
        <button class="btn btn-secondary btn-sm${tzMode === 'local' ? ' active-toggle' : ''}" data-tz-mode="local" aria-pressed="${tzMode === 'local' ? 'true' : 'false'}" title="Use your local timezone">Local</button>
        <button class="btn btn-secondary btn-sm${tzMode === 'utc' ? ' active-toggle' : ''}" data-tz-mode="utc" aria-pressed="${tzMode === 'utc' ? 'true' : 'false'}" title="Use UTC">UTC</button>
      </div>
    </div>
    <div id="deploy-patterns">${_renderPatternsCards()}</div>

    <!-- Environment Distribution -->
    <div class="section-header">
      <h2 class="section-title"><i class="fa-solid fa-server"></i> Environment Distribution</h2>
    </div>
    <div class="dashboard-grid mb-lg">
      <div class="card col-span-4">
        <div class="card-body" style="text-align:center;padding:var(--space-lg);">
          <div class="env-tag production" style="margin-bottom:var(--space-sm);display:inline-block;">Production</div>
          <div style="font:var(--textHeadingLarge);color:var(--colorTextPrimary);">${envBreakdown.types.production.toLocaleString()}</div>
          <div style="font:var(--textBodyRegularSmall);color:var(--colorTextTertiary);margin-top:var(--space-xxs);">${envPct(envBreakdown.types.production)}% of deployments</div>
        </div>
      </div>
      <div class="card col-span-4">
        <div class="card-body" style="text-align:center;padding:var(--space-lg);">
          <div class="env-tag staging" style="margin-bottom:var(--space-sm);display:inline-block;">Staging / UAT</div>
          <div style="font:var(--textHeadingLarge);color:var(--colorTextPrimary);">${envBreakdown.types.staging.toLocaleString()}</div>
          <div style="font:var(--textBodyRegularSmall);color:var(--colorTextTertiary);margin-top:var(--space-xxs);">${envPct(envBreakdown.types.staging)}% of deployments</div>
        </div>
      </div>
      <div class="card col-span-4">
        <div class="card-body" style="text-align:center;padding:var(--space-lg);">
          <div class="env-tag dev" style="margin-bottom:var(--space-sm);display:inline-block;">Development</div>
          <div style="font:var(--textHeadingLarge);color:var(--colorTextPrimary);">${envBreakdown.types.dev.toLocaleString()}</div>
          <div style="font:var(--textBodyRegularSmall);color:var(--colorTextTertiary);margin-top:var(--space-xxs);">${envPct(envBreakdown.types.dev)}% of deployments</div>
        </div>
      </div>
    </div>

    <!-- Per-Environment Breakdown -->
    ${envBreakdown.environments.length > 0 ? `
    <div class="card mb-lg">
      <div class="card-header"><h3 class="card-title">Per-Environment Breakdown</h3></div>
      <div class="card-body" style="padding:0;">
        <div class="table-wrapper">
          <table>
            <thead><tr><th>Environment</th><th>Type</th><th>Deployments</th><th>Success</th><th>Failed</th><th>Success Rate</th></tr></thead>
            <tbody>
              ${envBreakdown.environments.slice(0, 15).map(e => {
                const rate = e.count > 0 ? Math.round(e.success / e.count * 100) : 0;
                return `<tr>
                  <td><span class="env-tag ${e.cls}">${DOMPurify.sanitize(e.name)}</span></td>
                  <td class="text-secondary">${e.cls.charAt(0).toUpperCase() + e.cls.slice(1)}</td>
                  <td class="monospace">${e.count}</td>
                  <td class="text-success monospace">${e.success}</td>
                  <td class="text-danger monospace">${e.failed}</td>
                  <td><div class="flex items-center gap-xs"><div class="progress-bar" style="width:60px;"><div class="progress-fill ${rate >= 90 ? 'success' : rate >= 70 ? 'warning' : 'danger'}" style="width:${rate}%;"></div></div><span class="text-secondary">${rate}%</span></div></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>` : ''}

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

  // Day-of-Week + Time-of-Day cards. Rendered separately so the timezone
  // toggle can re-render just this block (no data refetch — the timezone mode
  // only changes how already-loaded timestamps are bucketed).
  function _renderPatternsCards() {
    const dayOfWeek = DashboardData.computeDayOfWeekDistribution();
    const hourOfDay = DashboardData.computeHourOfDayDistribution();
    const tzLabel = DashboardData.getTimezoneMode() === 'utc' ? 'UTC' : 'Local';
    const maxDow = Math.max(...dayOfWeek.map(d => d.count), 1);
    const busiestDay = dayOfWeek.reduce((a, b) => a.count >= b.count ? a : b);
    const maxHour = Math.max(...hourOfDay.map(h => h.count), 1);
    const busiestHour = hourOfDay.reduce((a, b) => a.count >= b.count ? a : b);
    return `
    <div class="dashboard-grid mb-lg">
      <div class="card col-span-6">
        <div class="card-header">
          <h3 class="card-title">Day of Week (${tzLabel})</h3>
          <span class="text-tertiary" style="font:var(--textBodyRegularXSmall);">Busiest: <strong style="color:var(--colorTextSecondary);">${busiestDay.name}</strong></span>
        </div>
        <div class="card-body">
          <div class="dow-chart">
            ${dayOfWeek.map(d => {
              const pct = maxDow > 0 ? Math.round(d.count / maxDow * 100) : 0;
              const isBusiest = d === busiestDay && d.count > 0;
              return `<div class="dow-row${d.isWeekend ? ' dow-row--weekend' : ''}${isBusiest ? ' dow-row--peak' : ''}">
                <span class="dow-label">${d.name}</span>
                <div class="progress-bar dow-bar"><div class="progress-fill ${isBusiest ? 'info' : 'success'}" style="width:${pct}%;"></div></div>
                <span class="dow-count monospace">${d.count}</span>
              </div>`;
            }).join('')}
          </div>
        </div>
      </div>
      <div class="card col-span-6">
        <div class="card-header">
          <h3 class="card-title">Time of Day (${tzLabel})</h3>
          <span class="text-tertiary" style="font:var(--textBodyRegularXSmall);">Peak: <strong style="color:var(--colorTextSecondary);">${String(busiestHour.hour).padStart(2, '0')}:00</strong></span>
        </div>
        <div class="card-body">
          <div class="hour-chart">
            ${hourOfDay.map(h => {
              const pct = maxHour > 0 ? Math.round(h.count / maxHour * 100) : 0;
              const isPeak = h === busiestHour && h.count > 0;
              const tip = `${String(h.hour).padStart(2, '0')}:00 ${tzLabel} — ${h.count} deployments`;
              return `<div class="hour-col${isPeak ? ' hour-col--peak' : ''}" tabindex="0" role="img" aria-label="${tip}" title="${tip}" data-tooltip="${tip}">
                <div class="hour-bar-wrap"><div class="hour-bar" style="height:${pct}%;"></div></div>
                <span class="hour-label">${h.hour % 6 === 0 ? String(h.hour).padStart(2, '0') : ''}</span>
              </div>`;
            }).join('')}
          </div>
        </div>
      </div>
    </div>`;
  }

  function wireTrendsEvents(summary) {
    document.querySelectorAll('[data-trends-range]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-trends-range]').forEach(b => b.classList.remove('active-toggle'));
        btn.classList.add('active-toggle');
        const el = document.getElementById('trends-chart');
        if (el) el.innerHTML = _renderTrendChart(summary, btn.dataset.trendsRange);
        Analytics.trackEvent('chart_range_changed', { view: 'trends', range: btn.dataset.trendsRange });
      });
    });

    // Timezone toggle for the deployment-pattern cards. No refetch — just
    // re-bucket the loaded timestamps and re-render the patterns block.
    document.querySelectorAll('[data-tz-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.tzMode;
        if (mode === DashboardData.getTimezoneMode()) return;
        DashboardData.setTimezoneMode(mode);
        document.querySelectorAll('[data-tz-mode]').forEach(b => {
          const active = b.dataset.tzMode === mode;
          b.setAttribute('aria-pressed', active ? 'true' : 'false');
          b.classList.toggle('active-toggle', active);
        });
        const patternsEl = document.getElementById('deploy-patterns');
        if (patternsEl) patternsEl.innerHTML = _renderPatternsCards();
        Analytics.trackEvent('timezone_mode_changed', { mode });
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

  function _trendTipAttr(text) {
    return String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  function _dailyAxisLabel(d, prev) {
    const M = MONTH_NAMES;
    if (!prev) return `${d.day}<br>${M[d.month]}<br>${d.year}`;
    if (d.year !== prev.year) return `${d.day}<br>${M[d.month]}<br>${d.year}`;
    if (d.month !== prev.month) return `${d.day}<br>${M[d.month]}`;
    return String(d.day);
  }

  function _dailyUtcTip(dateKey) {
    const [y, mo, da] = dateKey.split('-').map(Number);
    return `${da} ${MONTH_NAMES[mo - 1]} ${y} (UTC)`;
  }

  function _renderTrendChart(summary, range) {
    if (!summary) {
      return '<div class="text-tertiary" style="text-align:center;padding:var(--space-lg);">No trend data available</div>';
    }
    const weeklyTrend = summary.weeklyTrend || [];
    const dailyTrend = summary.dailyTrend || [];
    let bars;
    let useDailyBars = false;
    if (range === '12m') {
      const monthly = _aggregateMonthly(weeklyTrend);
      bars = monthly.map(m => ({
        total: m.total, success: m.success, failed: m.failed,
        label: MONTH_NAMES[m.month] + (m.month === 0 ? '<br>' + m.year : ''),
        tooltip: _trendTipAttr(`${MONTH_NAMES[m.month]} ${m.year}: ${m.total} deployments (${m.success} success, ${m.failed} failed, ${m.total - m.success - m.failed} other)`),
      }));
    } else if (range === '30d' && dailyTrend.length > 0) {
      useDailyBars = true;
      bars = dailyTrend.map((d, i) => {
        const prev = i > 0 ? dailyTrend[i - 1] : null;
        const counts = `${d.total} deployments (${d.success} success, ${d.failed} failed, ${d.total - d.success - d.failed} other)`;
        const tip = `${_dailyUtcTip(d.dateKey)}. ${counts}`;
        return {
          total: d.total, success: d.success, failed: d.failed,
          label: _dailyAxisLabel(d, prev),
          tooltip: _trendTipAttr(tip),
        };
      });
    } else {
      const weeks = range === '90d' ? 13 : 5;
      const sliced = weeklyTrend.slice(-weeks);
      bars = sliced.map((w, i) => {
        const showYear = i === 0 || (sliced[i - 1] && sliced[i - 1].year !== w.year);
        const rangeStr = DashboardData.formatIsoWeekDateRange(w.year, w.week);
        const counts = `${w.total} deployments (${w.success} success, ${w.failed} failed, ${w.total - w.success - w.failed} other)`;
        const tip = `${rangeStr} · ISO week ${w.week}, ${w.year} (Mon–Sun, UTC). ${counts}`;
        return {
          total: w.total, success: w.success, failed: w.failed,
          label: `W${w.week}${showYear ? '<br>' + w.year : ''}`,
          tooltip: _trendTipAttr(tip),
        };
      });
    }
    if (!bars || bars.length === 0) {
      return '<div class="text-tertiary" style="text-align:center;padding:var(--space-lg);">No trend data available</div>';
    }
    const maxTotal = Math.max(...bars.map(b => b.total), 1);
    const gap = range === '12m' ? 8 : (useDailyBars ? 2 : (range === '90d' ? 6 : 12));
    const chartExtra = useDailyBars ? ' deployment-trend-chart--daily' : '';
    const maxBar = DashboardData.TREND_BAR_MAX_PX;
    const fmt = (n) => DashboardData.formatCompactCount(n);
    return `<div class="deployment-trend-chart${chartExtra}">
      <div class="deployment-trend-bars" style="gap:${gap}px;padding:var(--space-sm) 0;">
        ${bars.map(b => {
          const t = b.total;
          const hPx = DashboardData.trendBarPixelHeight(t, maxTotal, maxBar);
          let failH = 0;
          let otherH = 0;
          let succH = 0;
          if (t > 0 && hPx > 0) {
            failH = Math.round((b.failed / t) * hPx);
            succH = Math.round((b.success / t) * hPx);
            otherH = Math.max(0, hPx - failH - succH);
          }
          const topSegment = failH > 0 ? 'fail' : (otherH > 0 ? 'other' : 'success');
          return `<div class="deployment-trend-col" data-tooltip="${b.tooltip}">
            <div class="deployment-trend-value deployment-trend-value--emph">${fmt(t)}</div>
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
    </div>

    <!-- Environment spaces modal -->
    <div class="modal-overlay" id="env-spaces-modal" aria-hidden="true" role="presentation">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="env-spaces-modal-title">
        <div class="modal-header">
          <h3 class="modal-title" id="env-spaces-modal-title">
            <i class="fa-solid fa-layer-group"></i>
            Spaces for <span id="env-spaces-modal-envname"></span>
          </h3>
          <button class="btn btn-secondary btn-sm" id="env-spaces-modal-close" type="button" aria-label="Close modal">
            <i class="fa-solid fa-times"></i>
          </button>
        </div>
        <div class="modal-body" id="env-spaces-modal-body"></div>
        <div class="modal-footer">
          <span class="text-tertiary" id="env-spaces-modal-meta"></span>
          <button class="btn btn-secondary btn-sm" id="env-spaces-modal-done" type="button">Close</button>
        </div>
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

  function _enrichBannerHtml() {
    const es = DashboardData.getEnrichmentState();
    if (es.state === 'idle') return '';
    if (es.state === 'loading') {
      return `<div id="enrichment-banner" class="enrichment-banner">
        <i class="fa-solid fa-spinner enrichment-spinner"></i>
        <div class="enrichment-progress-track"><div class="enrichment-progress-bar" style="width:${es.progress}%"></div></div>
        <span class="enrichment-text">Loading historical data&hellip; ${(es.tasksFetched || 0).toLocaleString()} tasks</span>
      </div>`;
    }
    if (es.state === 'complete') {
      const m = es.lookbackMonths;
      const periodLabel = m === 0 ? 'All time' : m < 12 ? `${m} months` : (m % 12 === 0 ? `${m / 12} year${m / 12 === 1 ? '' : 's'}` : `${m} months`);
      const oldest = es.oldestDate ? new Date(es.oldestDate) : null;
      const ageLabel = oldest ? ` (since ${oldest.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })})` : '';
      return `<div id="enrichment-banner" class="enrichment-banner enrichment-banner--complete">
        <i class="fa-solid fa-circle-check text-success"></i>
        <span class="enrichment-text">${periodLabel} of data &bull; ${(es.tasksFetched || 0).toLocaleString()} tasks${ageLabel}</span>
      </div>`;
    }
    if (es.state === 'error') {
      return `<div id="enrichment-banner" class="enrichment-banner enrichment-banner--error">
        <i class="fa-solid fa-triangle-exclamation text-danger"></i>
        <span class="enrichment-text">Historical data load failed</span>
      </div>`;
    }
    return '';
  }

  function renderVelocity(summary) {
    const enriched = DashboardData.computeEnrichedKPIs();
    const freq = enriched ? enriched.deployFrequency : summary.kpi.deployFrequency;
    const weeklyRate = (freq * 7).toFixed(1);
    const monthlyRate = (freq * 30).toFixed(0);
    const periodLabel = enriched ? enriched.periodLabel : null;
    const answers = Onboarding.getAnswers();
    const value = answers ? Onboarding.calculateValue(summary, answers) : null;
    const trendChange = DashboardData.computeTrendChange(summary.weeklyTrend);
    const durationStats = DashboardData.getHistoricalDurationPercentiles();
    const projectVelocity = DashboardData.computeProjectVelocity();

    const fmtSecs = (s) => {
      if (s == null) return '--';
      if (s < 60) return `${s}s`;
      const mins = Math.floor(s / 60);
      const secs = s % 60;
      return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
    };

    const trendArrow = !trendChange ? { icon: 'fa-minus', cls: 'amber', label: 'insufficient data' }
      : trendChange.direction === 'up' ? { icon: 'fa-arrow-trend-up', cls: 'green', label: `↑ ${trendChange.pct}% vs prior period` }
      : trendChange.direction === 'down' ? { icon: 'fa-arrow-trend-down', cls: 'danger', label: `↓ ${trendChange.pct}% vs prior period` }
      : { icon: 'fa-minus', cls: 'amber', label: 'stable velocity' };

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

    const activeProjects = projectVelocity.filter(p => p.recentDeploys > 0);
    const staleProjects = projectVelocity.filter(p => p.recentDeploys === 0 && p.totalDeploys > 0);

    return `
    <div class="page-header">
      <h1 class="page-title">Release Velocity</h1>
      <p class="page-subtitle">How fast your team ships &mdash; deployment frequency, duration analysis, and per-project velocity.</p>
    </div>

    ${_enrichBannerHtml()}

    <!-- Frequency KPIs -->
    <div class="kpi-grid mb-lg">
      <div class="kpi-card">
        <div class="flex items-center justify-between">
          <span class="kpi-label">Per Day</span>
          <div class="kpi-icon blue"><i class="fa-solid fa-bolt"></i></div>
        </div>
        <span class="kpi-value">${freq}</span>
        <span class="kpi-trend neutral"><i class="fa-solid fa-calendar-day"></i> <span>${periodLabel ? periodLabel + ' avg' : 'deploys/day average'}</span></span>
      </div>
      <div class="kpi-card">
        <div class="flex items-center justify-between">
          <span class="kpi-label">Per Week</span>
          <div class="kpi-icon purple"><i class="fa-solid fa-calendar-week"></i></div>
        </div>
        <span class="kpi-value">${weeklyRate}</span>
        <span class="kpi-trend neutral"><i class="fa-solid fa-chart-line"></i> <span>${periodLabel ? periodLabel + ' avg' : 'deploys/week'}</span></span>
      </div>
      <div class="kpi-card">
        <div class="flex items-center justify-between">
          <span class="kpi-label">Per Month</span>
          <div class="kpi-icon amber"><i class="fa-solid fa-calendar"></i></div>
        </div>
        <span class="kpi-value">${monthlyRate}</span>
        <span class="kpi-trend neutral"><i class="fa-solid fa-calendar-days"></i> <span>${periodLabel ? periodLabel + ' avg' : 'deploys/month'}</span></span>
      </div>
      <div class="kpi-card">
        <div class="flex items-center justify-between">
          <span class="kpi-label">Total Releases</span>
          <div class="kpi-icon green"><i class="fa-solid fa-tag"></i></div>
        </div>
        <span class="kpi-value">${summary.kpi.totalReleases.toLocaleString()}</span>
        <span class="kpi-trend neutral"><i class="fa-solid fa-code-branch"></i> <span>across all projects</span></span>
      </div>
      <div class="kpi-card">
        <div class="flex items-center justify-between">
          <span class="kpi-label">Velocity Trend</span>
          <div class="kpi-icon ${trendArrow.cls}"><i class="fa-solid ${trendArrow.icon}"></i></div>
        </div>
        <span class="kpi-value" style="${trendChange ? (trendChange.direction === 'up' ? 'color:var(--colorSuccess)' : trendChange.direction === 'down' ? 'color:var(--colorDanger)' : '') : ''}">${trendChange ? (trendChange.direction === 'flat' ? 'Stable' : `${trendChange.pct}%`) : '--'}</span>
        <span class="kpi-trend neutral"><i class="fa-solid fa-scale-balanced"></i> <span>${trendArrow.label}</span></span>
      </div>
    </div>

    ${comparisonHtml}

    <!-- Velocity trend chart -->
    <div class="section-header"><h2 class="section-title"><i class="fa-solid fa-chart-area"></i> Velocity Over Time</h2></div>
    <div class="card card--chart-tooltips mb-lg">
      <div class="card-header">
        <h3 class="card-title">Deployment Volume</h3>
        <div class="flex items-center gap-md">
          <div class="flex gap-xs" style="font:var(--textBodyRegularXSmall);color:var(--colorTextTertiary);">
            <span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:var(--colorSuccess);vertical-align:middle;margin-right:3px;"></span>Success</span>
            <span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:var(--colorDanger);vertical-align:middle;margin-right:3px;"></span>Failed</span>
            <span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:var(--colorBackgroundTertiary);vertical-align:middle;margin-right:3px;"></span>Other</span>
          </div>
          <div class="flex gap-xs">
            <button class="btn btn-secondary btn-sm" data-velocity-range="30d">30 days</button>
            <button class="btn btn-secondary btn-sm" data-velocity-range="90d">90 days</button>
            <button class="btn btn-secondary btn-sm active-toggle" data-velocity-range="12m">12 months</button>
          </div>
        </div>
      </div>
      <div class="card-body">
        <div class="chart-container" id="velocity-chart">${_renderTrendChart(summary, '12m')}</div>
      </div>
    </div>

    <!-- Duration Percentiles -->
    ${durationStats ? `
    <div class="section-header"><h2 class="section-title"><i class="fa-solid fa-stopwatch"></i> Deployment Duration</h2></div>
    <div class="kpi-grid mb-lg">
      <div class="kpi-card">
        <div class="flex items-center justify-between">
          <span class="kpi-label">Median (p50)</span>
          <div class="kpi-icon green"><i class="fa-solid fa-gauge"></i></div>
        </div>
        <span class="kpi-value">${fmtSecs(durationStats.p50)}</span>
        <span class="kpi-trend neutral"><i class="fa-solid fa-chart-simple"></i> <span>50th percentile</span></span>
      </div>
      <div class="kpi-card">
        <div class="flex items-center justify-between">
          <span class="kpi-label">p90</span>
          <div class="kpi-icon amber"><i class="fa-solid fa-clock"></i></div>
        </div>
        <span class="kpi-value">${fmtSecs(durationStats.p90)}</span>
        <span class="kpi-trend neutral"><i class="fa-solid fa-chart-simple"></i> <span>90th percentile</span></span>
      </div>
      <div class="kpi-card">
        <div class="flex items-center justify-between">
          <span class="kpi-label">p95</span>
          <div class="kpi-icon danger"><i class="fa-solid fa-clock"></i></div>
        </div>
        <span class="kpi-value">${fmtSecs(durationStats.p95)}</span>
        <span class="kpi-trend neutral"><i class="fa-solid fa-chart-simple"></i> <span>95th percentile</span></span>
      </div>
      <div class="kpi-card">
        <div class="flex items-center justify-between">
          <span class="kpi-label">Fastest</span>
          <div class="kpi-icon blue"><i class="fa-solid fa-forward-fast"></i></div>
        </div>
        <span class="kpi-value">${fmtSecs(durationStats.min)}</span>
        <span class="kpi-trend neutral"><i class="fa-solid fa-bolt"></i> <span>minimum</span></span>
      </div>
      <div class="kpi-card">
        <div class="flex items-center justify-between">
          <span class="kpi-label">Slowest</span>
          <div class="kpi-icon purple"><i class="fa-solid fa-hourglass-half"></i></div>
        </div>
        <span class="kpi-value">${fmtSecs(durationStats.max)}</span>
        <span class="kpi-trend neutral"><i class="fa-solid fa-chart-simple"></i> <span>${durationStats.count.toLocaleString()} measured</span></span>
      </div>
    </div>` : ''}

    <!-- Project Velocity -->
    <div class="section-header"><h2 class="section-title"><i class="fa-solid fa-ranking-star"></i> Project Velocity</h2></div>
    <div class="dashboard-grid mb-lg">
      <div class="card col-span-4">
        <div class="card-body" style="text-align:center;padding:var(--space-lg);">
          <div style="font:var(--textBodyRegularSmall);color:var(--colorTextTertiary);margin-bottom:var(--space-xs);">Active Projects</div>
          <div style="font:var(--textHeadingLarge);color:var(--colorSuccess);">${activeProjects.length}</div>
          <div style="font:var(--textBodyRegularXSmall);color:var(--colorTextTertiary);margin-top:var(--space-xs);">deployed in last 30 days</div>
        </div>
      </div>
      <div class="card col-span-4">
        <div class="card-body" style="text-align:center;padding:var(--space-lg);">
          <div style="font:var(--textBodyRegularSmall);color:var(--colorTextTertiary);margin-bottom:var(--space-xs);">Idle Projects</div>
          <div style="font:var(--textHeadingLarge);color:${staleProjects.length > 0 ? 'var(--colorWarningAccent)' : 'var(--colorTextPrimary)'};">${staleProjects.length}</div>
          <div style="font:var(--textBodyRegularXSmall);color:var(--colorTextTertiary);margin-top:var(--space-xs);">no deploys in 30 days</div>
        </div>
      </div>
      <div class="card col-span-4">
        <div class="card-body" style="text-align:center;padding:var(--space-lg);">
          <div style="font:var(--textBodyRegularSmall);color:var(--colorTextTertiary);margin-bottom:var(--space-xs);">Total Projects</div>
          <div style="font:var(--textHeadingLarge);color:var(--colorTextPrimary);">${projectVelocity.length}</div>
          <div style="font:var(--textBodyRegularXSmall);color:var(--colorTextTertiary);margin-top:var(--space-xs);">across all spaces</div>
        </div>
      </div>
    </div>

    <div class="card mb-lg">
      <div class="card-header">
        <h3 class="card-title">All Projects — Last 30 Days</h3>
        <div class="view-search-wrapper">
          <i class="fa-solid fa-search text-tertiary"></i>
          <input type="text" id="velocity-project-search" class="view-search-input" placeholder="Search projects...">
        </div>
      </div>
      <div class="card-body" style="padding:0;">
        <div class="table-wrapper table-wrapper--recent-scroll">
          <table>
            <thead><tr>
              <th>Project</th><th>Space</th><th>Last 30d</th><th>Deploys/Wk</th><th>To Prod</th><th>Success Rate</th><th>Last Deploy</th>
            </tr></thead>
            <tbody id="velocity-projects-tbody">
              ${projectVelocity.length > 0 ? projectVelocity.map(p => `<tr data-proj-name="${_escapeAttr((p.name || '').toLowerCase())}">
                <td><div class="flex items-center gap-sm"><i class="fa-solid fa-diagram-project text-tertiary" style="font-size:0.7rem;"></i> ${DOMPurify.sanitize(p.name)}</div></td>
                <td class="text-secondary">${DOMPurify.sanitize(p.space)}</td>
                <td class="monospace${p.recentDeploys > 0 ? '' : ' text-tertiary'}">${p.recentDeploys}</td>
                <td class="monospace">${p.deploysPerWeek}</td>
                <td class="monospace">${p.prodDeploys}</td>
                <td>${p.successRate !== null ? `<div class="flex items-center gap-xs"><div class="progress-bar" style="width:60px;"><div class="progress-fill ${p.successRate >= 90 ? 'success' : p.successRate >= 70 ? 'warning' : 'danger'}" style="width:${p.successRate}%;"></div></div><span class="text-secondary">${p.successRate}%</span></div>` : '<span class="text-tertiary">--</span>'}</td>
                <td class="text-secondary">${p.lastDeploy ? timeAgo(p.lastDeploy) : '--'}</td>
              </tr>`).join('') : '<tr><td colspan="7" class="text-secondary" style="text-align:center;padding:var(--space-lg);">No project data</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Velocity by Space -->
    <div class="section-header"><h2 class="section-title"><i class="fa-solid fa-cubes"></i> Velocity by Space</h2></div>
    <div class="card">
      <div class="card-body" style="padding:0;">
        <div class="table-wrapper">
          <table>
            <thead><tr><th>Space</th><th>Deployments</th><th>Releases</th><th>Deploys/Release</th><th>Trend</th></tr></thead>
            <tbody>
              ${summary.spaceBreakdown.map(s => {
                const dpr = s.releaseCount > 0 ? (s.deploymentCount / s.releaseCount).toFixed(1) : '--';
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

  function wireVelocityEvents(summary) {
    const input = document.getElementById('velocity-project-search');
    if (input) {
      let _searchTracked = false;
      input.addEventListener('input', () => {
        const query = input.value.toLowerCase().trim();
        document.querySelectorAll('#velocity-projects-tbody tr[data-proj-name]').forEach(row => {
          row.style.display = !query || row.dataset.projName.includes(query) ? '' : 'none';
        });
        if (query.length >= 2 && !_searchTracked) {
          _searchTracked = true;
          Analytics.trackEvent('search_used', { view: 'velocity' });
        }
      });
    }
    document.querySelectorAll('[data-velocity-range]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-velocity-range]').forEach(b => b.classList.remove('active-toggle'));
        btn.classList.add('active-toggle');
        const el = document.getElementById('velocity-chart');
        if (el) el.innerHTML = _renderTrendChart(summary, btn.dataset.velocityRange);
        Analytics.trackEvent('chart_range_changed', { view: 'velocity', range: btn.dataset.velocityRange });
      });
    });
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

    const totalRated = summary.successCount + summary.failedCount + summary.cancelledCount;
    const overallFailureRate = totalRated > 0 ? Math.round((summary.failedCount / totalRated) * 100) : 0;

    // Failure rate trend from weekly counts
    const failureWeeks = (summary.weeklyTrend || []).slice(-12);
    const failureMax = Math.max(...failureWeeks.map(w => (w.total > 0 ? (w.failed / w.total) * 100 : 0)), 1);
    const failureTrend = failureWeeks.map(w => {
      const value = w.total > 0 ? (w.failed / w.total) * 100 : 0;
      const showYear = !!w.showYear;
      const label = `W${w.week}${showYear ? '<br>' + w.year : ''}`;
      const tooltip = `ISO week ${w.week}, ${w.year}: ${w.failed} failed of ${w.total} total deployments (${value.toFixed(1).replace(/\.0$/, '')}%).`;
      return { value, label, tooltip };
    });

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
        <span class="kpi-value">${overallFailureRate}%</span>
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
        <div class="card-header"><h3 class="card-title">Failure Rate Trend (12 weeks)</h3></div>
        <div class="card-body">
          <div class="reliability-failure-trend-list">
            ${failureTrend.map(w => {
              const pct = failureMax > 0 ? (w.value / failureMax) * 100 : 0;
              const display = `${w.value.toFixed(1).replace(/\.0$/, '')}%`;
              return `
                <div class="reliability-failure-trend-row" data-tooltip="${_tooltipAttr(w.tooltip)}">
                  <div class="reliability-failure-trend-week">${w.label}</div>
                  <div class="progress-bar reliability-failure-trend-bar" aria-hidden="true">
                    <div class="progress-fill danger" style="width:${pct}%;"></div>
                  </div>
                  <div class="reliability-failure-trend-value">${display}</div>
                </div>`;
            }).join('')}
          </div>
        </div>
      </div>
      <div class="card col-span-6">
        <div class="card-header"><h3 class="card-title">Success Rate by Space</h3></div>
        <div class="card-body">
          ${spaceRates.length
            ? `<div class="reliability-space-rates">
                ${spaceRates.map(s => `
                  <div style="margin-bottom:var(--space-sm);">
                    <div class="flex items-center justify-between" style="margin-bottom:2px;">
                      <span style="font:var(--textBodyRegularSmall);color:var(--colorTextSecondary);">${DOMPurify.sanitize(s.name)}</span>
                      <span style="font:var(--textBodyBoldSmall);color:${s.successRate >= 90 ? 'var(--colorSuccess)' : s.successRate >= 70 ? 'var(--colorWarningAccent)' : 'var(--colorDanger)'};">${s.successRate}%</span>
                    </div>
                    <div class="progress-bar" style="width:100%;"><div class="progress-fill ${s.successRate >= 90 ? 'success' : s.successRate >= 70 ? 'warning' : 'danger'}" style="width:${s.successRate}%;"></div></div>
                  </div>
                `).join('')}
              </div>`
            : '<div class="text-tertiary">No space data</div>'}
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
                <td><div class="flex items-center gap-xs"><div class="space-avatar sm" style="width:20px;height:20px;font-size:0.5rem;">${DOMPurify.sanitize((d._spaceName || '?').charAt(0))}</div> <span class="text-secondary">${DOMPurify.sanitize(d._spaceName || '--')}</span></div></td>
                <td class="text-secondary monospace">${DOMPurify.sanitize(d.Duration || '--')}</td>
                <td class="text-secondary">${d.Created ? timeAgo(d.Created) : '--'}</td>
              </tr>`).join('') : '<tr><td colspan="6" class="text-secondary" style="text-align:center;padding:var(--space-lg);"><i class="fa-solid fa-check-circle text-success" style="margin-right:var(--space-xs);"></i> No failed deployments — nice!</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
  }

  // (legacy _renderMiniBarChart removed - replaced by a compact list)


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
          Analytics.trackEvent('space_detail_closed');
          return;
        }

        Analytics.trackEvent('space_detail_opened', {
          space_projects: spaceInfo.projectCount,
          space_deployments: spaceInfo.deploymentCount,
        });

        document.querySelectorAll('.space-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        panel.dataset.activeSpace = spaceId;
        panel.style.display = '';

        const projects = spaceData?.projects || [];
        const envs = spaceData?.environments || [];
        const deploys = spaceData?.deployments || [];
        const recent = deploys.slice(0, 10);

        const root = (typeof OctopusApi?.getInstanceUrl === 'function') ? OctopusApi.getInstanceUrl() : '';
        const octopusSpaceUrl = root
          ? `${root}/app#/${encodeURIComponent(spaceId)}/projects`
          : '';

        panel.innerHTML = `
          <div class="card mt-lg">
            <div class="card-header">
              <h3 class="card-title">
                <div class="space-avatar sm" style="display:inline-flex;vertical-align:middle;margin-right:var(--space-xs);">${DOMPurify.sanitize(spaceInfo.name.charAt(0).toUpperCase())}</div>
                ${DOMPurify.sanitize(spaceInfo.name)} — Detail
              </h3>
              ${octopusSpaceUrl ? `
                <a
                  class="text-tertiary"
                  href="${_escapeAttr(octopusSpaceUrl)}"
                  target="_blank"
                  rel="noopener noreferrer"
                  style="font:var(--textBodyRegularSmall);display:inline-flex;align-items:center;gap:var(--space-xxs);text-decoration:none;"
                >
                  <span>Open in Octopus</span>
                  <span aria-hidden="true" style="opacity:.9;">&rarr;</span>
                </a>
              ` : ''}
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
                        <td><span class="badge ${cls}">${DOMPurify.sanitize(state.charAt(0).toUpperCase() + state.slice(1))}</span></td>
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
    const root = (typeof OctopusApi?.getInstanceUrl === 'function') ? OctopusApi.getInstanceUrl() : '';

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

        const octopusProjectUrl = root
          ? `${root}/app#/${encodeURIComponent(spaceId)}/projects/${encodeURIComponent(p.Id)}`
          : null;

        allProjects.push({
          name: p.Name || p.Id,
          projectId: p.Id,
          space: spaceName,
          spaceId,
          octopusProjectUrl,
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
    return projects.map(p => `<tr data-project-name="${_escapeAttr(p.name.toLowerCase())}">
      <td><div class="flex items-center gap-sm">
        <i class="fa-solid fa-diagram-project text-tertiary" style="font-size:0.8rem;"></i>
        ${p.octopusProjectUrl
          ? `<a class="text-tertiary" href="${_escapeAttr(p.octopusProjectUrl)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;">${DOMPurify.sanitize(p.name)}</a>`
          : DOMPurify.sanitize(p.name)}
      </div></td>
      <td><span class="text-secondary">${DOMPurify.sanitize(p.space)}</span></td>
      <td class="monospace">${p.deployments}</td>
      <td>${p.successRate !== null ? `<div class="flex items-center gap-xs"><div class="progress-bar" style="width:60px;"><div class="progress-fill ${p.successRate >= 90 ? 'success' : p.successRate >= 70 ? 'warning' : 'danger'}" style="width:${p.successRate}%;"></div></div><span class="text-secondary">${p.successRate}%</span></div>` : '<span class="text-tertiary">--</span>'}</td>
      <td class="text-secondary">${p.lastDeploy ? timeAgo(p.lastDeploy) : '--'}</td>
    </tr>`).join('');
  }

  function wireProjectsEvents() {
    const input = document.getElementById('project-search');
    if (!input) return;
    let _searchTracked = false;
    input.addEventListener('input', () => {
      const query = input.value.toLowerCase().trim();
      document.querySelectorAll('#projects-tbody tr[data-project-name]').forEach(row => {
        row.style.display = !query || row.dataset.projectName.includes(query) ? '' : 'none';
      });
      if (query.length >= 2 && !_searchTracked) {
        _searchTracked = true;
        Analytics.trackEvent('search_used', { view: 'projects' });
      }
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

    const SPACES_PREVIEW_LIMIT = 4;

    const spaceNameToId = new Map();
    const envIdBySpaceAndName = new Map(); // `${spaceId}::${envName}` → envId

    // Build environment deep-link ids so we can open environments in Octopus.
    for (const [spaceId, sd] of Object.entries(allSpaceData || {})) {
      const spaceName = sd?.space?.Name || spaceId;
      spaceNameToId.set(spaceName, spaceId);

      for (const env of (sd?.environments || [])) {
        if (!env?.Id || !env?.Name) continue;
        envIdBySpaceAndName.set(`${spaceId}::${env.Name}`, env.Id);
      }
    }

    function octopusEnvUrl(envName, spaceName) {
      const spaceId = spaceNameToId.get(spaceName);
      if (!spaceId) return null;
      const envId = envIdBySpaceAndName.get(`${spaceId}::${envName}`);
      if (!envId) return null;

      const root = (typeof OctopusApi?.getInstanceUrl === 'function') ? OctopusApi.getInstanceUrl() : '';
      if (!root) return null;

      return `${root}/app#/${encodeURIComponent(spaceId)}/infrastructure/environments/${encodeURIComponent(envId)}`;
    }

    function renderOctopusEnvLink(envName, spaces) {
      const list = Array.isArray(spaces) ? spaces.slice() : [];
      if (!list.length) return '';

      // Choose first space deterministically (spaces in envHealth are a Set so order is not stable).
      list.sort((a, b) => String(a).localeCompare(String(b)));
      const spaceName = list[0];
      const url = octopusEnvUrl(envName, spaceName);
      if (!url) return '';

      return `<a class="env-octopus-link text-tertiary" href="${_escapeAttr(url)}" target="_blank" rel="noopener noreferrer" data-tooltip="${_tooltipAttr('Open this environment in Octopus (in the selected space)')}">
        <span class="env-octopus-link-label">Open in Octopus</span>
        <span class="env-octopus-link-arrow" aria-hidden="true">&rarr;</span>
      </a>`;
    }

    function renderSpacesPreview(envName, spaces) {
      const allSpaces = Array.isArray(spaces) ? spaces : [];
      if (allSpaces.length === 0) return '<span class="text-tertiary">No spaces</span>';

      const preview = allSpaces.slice(0, SPACES_PREVIEW_LIMIT);
      const remaining = allSpaces.length - preview.length;

      const previewHtml = preview.map(s => DOMPurify.sanitize(String(s))).join(', ');
      if (remaining <= 0) return previewHtml;

      return `${previewHtml} <button class="env-spaces-more view-env-spaces" data-env-name="${_escapeAttr(envName)}" type="button"><span>+${remaining} more</span><span class="env-spaces-more-arrow" aria-hidden="true">→</span></button>`;
    }

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
                  <i class="fa-solid fa-cubes"></i> ${e.spaces.length} space${e.spaces.length !== 1 ? 's' : ''}: ${renderSpacesPreview(e.name, e.spaces)}
                </span>
              </div>
              <div style="margin-top:var(--space-xs);">
                <div class="progress-bar" style="width:100%;"><div class="progress-fill ${e.successRate >= 90 ? 'success' : e.successRate >= 70 ? 'warning' : 'danger'}" style="width:${e.successRate}%;"></div></div>
              </div>
              <div style="margin-top:var(--space-sm);">
                ${renderOctopusEnvLink(e.name, e.spaces)}
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

    <!-- Environment spaces modal -->
    <div class="modal-overlay" id="env-spaces-modal" aria-hidden="true" role="presentation">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="env-spaces-modal-title">
        <div class="modal-header">
          <h3 class="modal-title" id="env-spaces-modal-title">
            <i class="fa-solid fa-layer-group"></i>
            Spaces for <span id="env-spaces-modal-envname"></span>
          </h3>
          <button class="btn btn-secondary btn-sm" id="env-spaces-modal-close" type="button" aria-label="Close">
            <i class="fa-solid fa-times"></i>
          </button>
        </div>
        <div class="modal-body" id="env-spaces-modal-body"></div>
        <div class="modal-footer">
          <span class="text-tertiary" id="env-spaces-modal-meta"></span>
          <button class="btn btn-secondary btn-sm" id="env-spaces-modal-done" type="button">Close</button>
        </div>
      </div>
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
            <thead><tr><th>Environment</th><th>Type</th><th>Spaces</th><th>Octopus</th><th>Deployments</th><th>Success Rate</th><th data-tooltip="Deployment success tier for the selected time range (not target machine health). Hover each badge for Healthy, Attention, Warning, and No data.">Health</th></tr></thead>
            <tbody>
              ${envHealth.map(e => `<tr>
                <td><span class="env-tag ${guessEnvClass(e.name)}">${DOMPurify.sanitize(e.name)}</span></td>
                <td class="text-secondary">${guessEnvClass(e.name).charAt(0).toUpperCase() + guessEnvClass(e.name).slice(1)}</td>
                <td class="text-secondary">${renderSpacesPreview(e.name, e.spaces)}</td>
                <td>${renderOctopusEnvLink(e.name, e.spaces)}</td>
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

  function wireEnvironmentsEvents(summary) {
    const overlay = document.getElementById('env-spaces-modal');
    if (!overlay) return;

    const closeBtn = document.getElementById('env-spaces-modal-close');
    const doneBtn = document.getElementById('env-spaces-modal-done');
    const body = document.getElementById('env-spaces-modal-body');
    const envNameEl = document.getElementById('env-spaces-modal-envname');
    const metaEl = document.getElementById('env-spaces-modal-meta');

    const envHealth = summary?.envHealth || [];
    const envSpacesByName = new Map(envHealth.map(e => [e.name, e.spaces || []]));

    function close() {
      overlay.setAttribute('aria-hidden', 'true');
    }

    function open(envName) {
      const spaces = envSpacesByName.get(envName) || [];
      envNameEl.textContent = envName;
      metaEl.textContent = `${spaces.length} space${spaces.length !== 1 ? 's' : ''}`;

      body.innerHTML = spaces.length
        ? `
          <div style="margin-bottom:var(--space-sm);">
            <div class="view-search-wrapper" style="max-width:100%;padding:var(--space-xs) var(--space-sm);">
              <i class="fa-solid fa-search text-tertiary"></i>
              <input type="text" id="env-spaces-search-input" class="view-search-input" placeholder="Search spaces...">
            </div>
          </div>
          <div class="env-spaces-grid" id="env-spaces-grid">
            ${spaces
              .slice()
              .sort((a, b) => String(a).localeCompare(String(b)))
              .map(s => {
                const name = String(s);
                const needle = name.toLowerCase();
                return `<span class="badge neutral env-space-pill" data-space-name="${_escapeAttr(needle)}">${DOMPurify.sanitize(name)}</span>`;
              })
              .join('')}
          </div>`
        : `<div class="text-tertiary">No spaces</div>`;

      overlay.setAttribute('aria-hidden', 'false');
      closeBtn?.focus?.();

      const input = document.getElementById('env-spaces-search-input');
      if (input) {
        input.addEventListener('input', () => {
          const q = input.value.toLowerCase().trim();
          const grid = document.getElementById('env-spaces-grid');
          if (!grid) return;

          grid.querySelectorAll('.env-space-pill').forEach(pill => {
            const name = pill.dataset.spaceName || '';
            pill.style.display = !q || name.includes(q) ? '' : 'none';
          });
        });
      }
    }

    document.querySelectorAll('.view-env-spaces[data-env-name]').forEach(btn => {
      btn.addEventListener('click', () => {
        const envName = btn.dataset.envName || '';
        open(envName);
        Analytics.trackEvent('env_spaces_modal_opened', { environment: envName });
      });
    });

    closeBtn?.addEventListener('click', close);
    doneBtn?.addEventListener('click', close);
    overlay?.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    if (!wireEnvironmentsEvents._escInstalled) {
      wireEnvironmentsEvents._escInstalled = true;
      document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const modal = document.getElementById('env-spaces-modal');
        if (!modal) return;
        if (modal.getAttribute('aria-hidden') === 'true') return;
        document.getElementById('env-spaces-modal-close')?.click?.();
      });
    }
  }


  // ==================================================================
  // TEAMS view
  // ==================================================================

  function renderTeams(summary) {
    const spaces = summary.spaceBreakdown || [];
    const totalDeploys = summary.kpi.totalDeployments;
    const ti = summary.teamsInsight || {
      rows: [],
      totalTeams: 0,
      anyDenied: false,
      anyOkFetch: false,
      anyError: false,
    };

    const permissionExplainer = `
    <div class="card mb-lg">
      <div class="card-body" style="text-align:center;padding:var(--space-xl) var(--space-lg);">
        <div style="font-size:3rem;margin-bottom:var(--space-md);color:var(--colorTextTertiary);">
          <i class="fa-solid fa-users"></i>
        </div>
        <h3 style="font:var(--textHeadingSmall);color:var(--colorTextPrimary);margin:0 0 var(--space-xs);">Team list blocked for this Octopus session</h3>
        <div class="text-secondary" style="font:var(--textBodyRegularMedium);max-width:560px;margin:0 auto var(--space-md);line-height:1.55;text-align:left;">
          <p style="margin:0 0 var(--space-sm);">
            This dashboard calls <code style="font-size:0.9em;">GET /api/{spaceId}/teams/all</code> using your <strong>browser session</strong> to Octopus (cookies), not a separate API key.
            If you see this message, Octopus returned 401/403 for team data: the <strong>user you are signed in as</strong> needs <strong>TeamView</strong> (and usually space access) for those spaces.
          </p>
          <p style="margin:0 0 var(--space-xs);font-weight:600;color:var(--colorTextPrimary);">Typical permissions</p>
          <ul style="margin:0 0 var(--space-sm);padding-left:1.25rem;">
            <li><strong>TeamView</strong> — list teams and membership (system and/or space scope).</li>
            <li><strong>UserView</strong> — optional, for resolving member IDs to display names in other views.</li>
            <li><strong>UserRoleView</strong> — optional, for role assignments on teams.</li>
          </ul>
          <p style="margin:0;font-size:0.92em;">Tip: open Octopus in the same browser, confirm you are logged in as the user you expect, then reload this dashboard.</p>
        </div>
        <div class="flex items-center gap-sm" style="justify-content:center;flex-wrap:wrap;">
          <a href="https://octopus.com/docs/security/users-and-teams/default-permissions" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm">
            <i class="fa-solid fa-external-link-alt"></i>
            Default permissions (TeamView, etc.)
          </a>
          <a href="https://octopus.com/docs/octopus-rest-api" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm">
            <i class="fa-solid fa-external-link-alt"></i>
            REST API overview
          </a>
        </div>
      </div>
    </div>`;

    let statusBlock = '';

    if (ti.anyError && (ti.anyOkFetch || ti.anyDenied)) {
      statusBlock += `
      <div class="card mb-lg" style="border-color:var(--colorWarningBorder, #b8860b);">
        <div class="card-body text-secondary" style="font:var(--textBodyRegularMedium);">
          <strong style="color:var(--colorTextPrimary);">Some team requests failed.</strong>
          Check the debug log (Ctrl+D) for errors; network or server issues can hide teams even when permissions are correct.
        </div>
      </div>`;
    }

    if (ti.totalTeams > 0) {
      statusBlock += `
      <div class="section-header"><h2 class="section-title"><i class="fa-solid fa-users"></i> Teams</h2></div>
      <div class="card mb-lg">
        <div class="card-body" style="padding:0;">
          <div class="table-wrapper">
            <table>
              <thead><tr>
                <th>Space</th><th>Team</th><th>Members</th><th>Project scope</th><th>Env scopes</th><th>Role assignments</th>
                <th data-tooltip="Deployments in the recent sample (200 per space) whose project falls in this team’s scope.">Recent deploys (sample)</th>
              </tr></thead>
              <tbody>
                ${ti.rows.map(r => `<tr>
                  <td class="text-secondary">${DOMPurify.sanitize(r.spaceName)}</td>
                  <td>${DOMPurify.sanitize(r.name)}</td>
                  <td class="monospace">${r.memberCount}</td>
                  <td class="text-secondary">${DOMPurify.sanitize(r.projectsLabel)}</td>
                  <td class="monospace">${r.envScopeLabel}</td>
                  <td class="monospace">${r.scopedRoles}</td>
                  <td class="monospace">${r.recentDeploysInScope}</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
    }

    if (ti.anyDenied && ti.totalTeams > 0) {
      statusBlock += `
      <div class="card mb-lg">
        <div class="card-body text-secondary" style="font:var(--textBodyRegularMedium);">
          <strong style="color:var(--colorTextPrimary);">Partial access:</strong> at least one space returned 403 for teams. The table shows teams only from spaces where the request succeeded.
        </div>
      </div>`;
    }

    if (!ti.anyOkFetch && ti.anyDenied) {
      statusBlock += permissionExplainer;
    } else if (ti.anyOkFetch && ti.totalTeams === 0 && !ti.anyDenied) {
      statusBlock += `
      <div class="card mb-lg">
        <div class="card-body text-center text-secondary" style="padding:var(--space-xl);font:var(--textBodyRegularMedium);">
          <i class="fa-solid fa-users" style="font-size:2rem;display:block;margin-bottom:var(--space-md);color:var(--colorTextTertiary);"></i>
          <strong style="color:var(--colorTextPrimary);">No teams in the active spaces we loaded.</strong>
          <p style="margin:var(--space-sm) 0 0;">Spaces without projects or targets may be excluded; add teams in Octopus or widen scope if you expected to see them here.</p>
        </div>
      </div>`;
    } else if (ti.anyOkFetch && ti.totalTeams === 0 && ti.anyDenied) {
      statusBlock += permissionExplainer;
      statusBlock += `
      <div class="card mb-lg">
        <div class="card-body text-secondary" style="font:var(--textBodyRegularMedium);">
          Where teams were readable, there were no team records—combined with 403s on other spaces this often means a permission scope issue rather than an empty org.
        </div>
      </div>`;
    } else if (!ti.anyOkFetch && !ti.anyDenied && ti.anyError) {
      statusBlock += `
      <div class="card mb-lg">
        <div class="card-body text-secondary" style="font:var(--textBodyRegularMedium);">
          <strong style="color:var(--colorTextPrimary);">Could not load teams.</strong>
          Octopus did not return usable team payloads (non-auth failure). Open the debug log (Ctrl+D), verify connectivity to your Octopus URL, and reload.
        </div>
      </div>`;
    } else if (!ti.anyOkFetch && !ti.anyDenied && !ti.anyError) {
      statusBlock += `
      <div class="card mb-lg">
        <div class="card-body text-center text-secondary" style="padding:var(--space-xl);font:var(--textBodyRegularMedium);">
          No per-space team requests ran (no active spaces in this summary). Load the dashboard from a connected Octopus instance with at least one active space.
        </div>
      </div>`;
    }

    return `
    <div class="page-header">
      <h1 class="page-title">Teams</h1>
      <p class="page-subtitle">Team-level deployment activity and ownership insights.</p>
    </div>

    ${statusBlock}

    <!-- Space-level activity -->
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


  // ==================================================================
  // TENANTS — Multi-Tenanted Deployment Dashboard
  // ==================================================================

  function renderTenants() {
    return `
    <div class="tv-view">
      <div class="tv-space-bar">
        <label class="tv-space-bar__label" for="tv-spaces-select">Space</label>
        <select id="tv-spaces-select" class="tv-select">
          <option value="">Loading spaces…</option>
        </select>
      </div>

      <div id="tv-error-banner" class="tv-error-banner hidden"></div>

      <div id="tv-dashboard-content" class="tv-dashboard-content hidden">
        <div class="tv-toolbar">
          <div class="tv-search-wrap">
            <i class="fa-solid fa-magnifying-glass tv-search-wrap__icon"></i>
            <input id="tv-tenant-search" type="text" placeholder="Filter by tenant name…" aria-label="Filter tenants by name" class="tv-search-input">
          </div>
          <button id="tv-filter-toggle-btn" class="btn btn-secondary btn-sm" aria-expanded="false" aria-controls="tv-advanced-filters">
            <i class="fa-solid fa-sliders"></i>
            <span id="tv-filter-toggle-label">Show advanced filters</span>
          </button>
        </div>

        <div id="tv-advanced-filters" class="tv-advanced-filters hidden">
          <div class="tv-filter-row">
            <div class="tv-filter-group">
              <label class="tv-filter-label" for="tv-environment-select">Environment</label>
              <select id="tv-environment-select" class="tv-select">
                <option value="">All environments</option>
              </select>
            </div>
            <div class="tv-filter-group">
              <label class="tv-filter-label">Projects</label>
              <div class="tv-multiselect" id="tv-projects-multiselect">
                <button class="tv-multiselect__trigger" id="tv-projects-trigger" type="button">
                  All projects <i class="fa-solid fa-chevron-down tv-multiselect__caret"></i>
                </button>
                <div class="tv-multiselect__menu hidden" id="tv-projects-menu">
                  <div id="tv-projects-options"></div>
                </div>
              </div>
            </div>
            <div class="tv-filter-group">
              <label class="tv-filter-label">Task Types</label>
              <div class="tv-checkbox-row">
                <label class="tv-checkbox-label">
                  <input type="checkbox" id="tv-type-deployment" checked> Deployment
                </label>
                <label class="tv-checkbox-label">
                  <input type="checkbox" id="tv-type-runbook" checked> Runbook Run
                </label>
              </div>
            </div>
            <div class="tv-filter-group">
              <label class="tv-filter-label">Date Range</label>
              <div class="tv-date-range">
                <input type="date" id="tv-date-from" class="tv-date-input">
                <span style="color:var(--colorTextTertiary)">–</span>
                <input type="date" id="tv-date-to" class="tv-date-input">
              </div>
            </div>
          </div>
          <div class="tv-filter-row" style="margin-top:var(--space-sm)">
            <div class="tv-filter-group" id="tv-tag-filter-group">
              <label class="tv-filter-label">Filter by tag</label>
              <div class="tv-tag-filter-chips" id="tv-tag-filter-chips"></div>
            </div>
          </div>
        </div>

        <div class="kpi-grid">
          <div class="kpi-card">
            <div class="kpi-label">Total Tenants</div>
            <div style="display:flex;align-items:baseline;gap:var(--space-xs)">
              <span id="tv-stat-total" style="font:var(--textHeadingMedium);color:var(--colorTextPrimary)">0</span>
              <span class="text-tertiary" style="font:var(--textBodyRegularSmall)">customers</span>
            </div>
          </div>
          <div class="kpi-card" style="border-color:var(--colorSuccessLight)">
            <div class="kpi-label" style="color:var(--colorTextSuccess)">All Succeeded</div>
            <div style="display:flex;align-items:baseline;gap:var(--space-xs)">
              <span id="tv-stat-succeeded" style="font:var(--textHeadingMedium);color:var(--colorTextSuccess)">0</span>
              <span class="text-tertiary" style="font:var(--textBodyRegularSmall)">successful</span>
            </div>
          </div>
          <div class="kpi-card" style="border-color:var(--colorDangerLight)">
            <div class="kpi-label" style="color:var(--colorTextDanger)">Has Failures</div>
            <div style="display:flex;align-items:baseline;gap:var(--space-xs)">
              <span id="tv-stat-failures" style="font:var(--textHeadingMedium);color:var(--colorTextDanger)">0</span>
              <span class="text-tertiary" style="font:var(--textBodyRegularSmall)">with issues</span>
            </div>
          </div>
          <div class="kpi-card" style="border-color:var(--colorPrimaryLight)">
            <div class="kpi-label" style="color:var(--colorPrimaryLighter)">In Progress</div>
            <div style="display:flex;align-items:baseline;gap:var(--space-xs)">
              <span id="tv-stat-inprogress" style="font:var(--textHeadingMedium);color:var(--colorPrimaryLighter)">0</span>
              <span class="text-tertiary" style="font:var(--textBodyRegularSmall)">deploying</span>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="tv-view-toggle" id="tv-view-toggle">
            <button class="tv-view-btn active" data-view="status">
              <i class="fa-solid fa-list-ul"></i> Tenant Status
            </button>
            <button class="tv-view-btn" data-view="matrix">
              <i class="fa-solid fa-table-cells"></i> Version Adoption
            </button>
          </div>

          <div id="tv-status-pane">
            <div class="tv-status-tabs" id="tv-status-tabs">
              <button class="tv-status-tab active" data-filter="all">All (<span id="tv-tab-all">0</span>)</button>
              <button class="tv-status-tab" data-filter="All succeeded">Succeeded (<span id="tv-tab-succeeded">0</span>)</button>
              <button class="tv-status-tab" data-filter="Has failures">Failures (<span id="tv-tab-failures">0</span>)</button>
              <button class="tv-status-tab" data-filter="In progress">In Progress (<span id="tv-tab-inprogress">0</span>)</button>
            </div>
            <div class="tv-tenant-grid tv-tenant-grid--header" id="tv-tenant-grid-header">
              <div></div>
              <div data-sort="name" class="tv-sortable-header">Tenant <i class="tv-sort-icon fa-solid fa-sort"></i></div>
              <div>Tags</div>
              <div>Status</div>
              <div style="text-align:center" data-sort="deployments" class="tv-sortable-header">Deployments <i class="tv-sort-icon fa-solid fa-sort"></i></div>
              <div data-sort="successRate" class="tv-sortable-header">Success Rate <i class="tv-sort-icon fa-solid fa-sort"></i></div>
              <div data-sort="lastUpdated" class="tv-sortable-header is-sorted">Last Updated <i class="tv-sort-icon fa-solid fa-sort-down"></i></div>
            </div>
            <div id="tv-tenant-rows">
              <div class="tv-loading-state" id="tv-loading-state">
                <i class="fa-solid fa-spinner fa-spin"></i> Loading tenants…
              </div>
            </div>
            <div id="tv-empty-state" class="tv-empty-state hidden">
              No tenants match the current filters.
            </div>
          </div>

          <div id="tv-matrix-container" class="hidden"></div>
        </div>
      </div>
    </div>`;
  }

  function showTenantInitError(error) {
    console.error('Failed to initialize tenant view', error);

    const errorBanner = document.getElementById('tv-error-banner');
    const dashboardContent = document.getElementById('tv-dashboard-content');
    const message = (error && error.message) ? error.message : 'Failed to load tenant dashboard.';

    if (dashboardContent) {
      dashboardContent.classList.add('hidden');
    }

    if (errorBanner) {
      errorBanner.textContent = message;
      errorBanner.classList.remove('hidden');
    }
  }

  function wireTenantsEvents() {
    TenantView.init().catch(showTenantInitError);
  }

  // ==================================================================
  // TASK CAP view
  // ==================================================================

  function _tcSvgLine(points, cap, H = 140) {
    if (!points || points.length === 0) return '<p class="text-tertiary" style="text-align:center;padding:var(--space-lg);">No data for this period.</p>';

    const VW = 1000, VH = 100; // normalised viewBox — SVG carries no text
    const maxVal = Math.max(...points.map(p => p.v), cap || 0, 1);
    const xN = i => (i / Math.max(points.length - 1, 1)) * VW;
    const yN = v => VH - (v / maxVal) * VH;

    // Smooth bezier line: cubic with midpoint control points
    let linePath = `M${xN(0).toFixed(1)},${yN(points[0].v).toFixed(1)}`;
    for (let i = 1; i < points.length; i++) {
      const x0 = xN(i - 1), y0 = yN(points[i - 1].v);
      const x1 = xN(i),     y1 = yN(points[i].v);
      const mx = ((x0 + x1) / 2).toFixed(1);
      linePath += ` C${mx},${y0.toFixed(1)} ${mx},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
    }
    const areaPath = `${linePath} L${xN(points.length - 1).toFixed(1)},${VH} L0,${VH} Z`;

    // Grid lines (purely graphical — no text in SVG)
    const gridLines = [1, 0.5, 0].map(frac =>
      `<line x1="0" y1="${(VH - frac * VH).toFixed(1)}" x2="${VW}" y2="${(VH - frac * VH).toFixed(1)}"
         stroke="rgba(255,255,255,0.06)" stroke-width="0.8"/>`
    ).join('');

    // Cap reference line (graphical only)
    const capLine = cap != null
      ? `<line x1="0" y1="${yN(cap).toFixed(1)}" x2="${VW}" y2="${yN(cap).toFixed(1)}"
           stroke="rgba(247,155,60,0.7)" stroke-width="1.2" stroke-dasharray="6,4"/>` : '';

    // Hover dots
    const dots = points.map((p, i) =>
      `<circle cx="${xN(i).toFixed(1)}" cy="${yN(p.v).toFixed(1)}" r="5"
         fill="var(--colorPrimaryLighter)" stroke="var(--colorBackgroundPrimaryDefault)" stroke-width="2"
         class="lc-dot">`+
      `<title>${p.label}: ${p.v}</title></circle>`
    ).join('');

    // --- HTML labels (never distorted) ---
    const yVals = [maxVal, Math.round(maxVal / 2), 0];
    const yLabelHtml = yVals.map(v =>
      `<span style="position:absolute;right:4px;top:${(100 - (v / maxVal) * 100).toFixed(1)}%;
         transform:translateY(-50%);font-size:10px;font-family:var(--fontFamilyCode);
         color:var(--colorTextTertiary);white-space:nowrap">${v}</span>`
    ).join('');

    const capLabelHtml = cap != null
      ? `<span style="position:absolute;right:4px;top:${(100 - (cap / maxVal) * 100).toFixed(1)}%;
           transform:translateY(-150%);font-size:9px;font-family:var(--fontFamilyCode);
           color:var(--colorWarningLight);background:var(--colorBackgroundPrimaryDefault);
           padding:0 3px;border-radius:2px">cap ${cap}</span>` : '';

    const xStep = Math.max(1, Math.floor(points.length / 7));
    const xLabelHtml = points
      .map((p, i) => ({ p, i }))
      .filter(({ i }) => i % xStep === 0 || i === points.length - 1)
      .map(({ p, i }) =>
        `<span style="position:absolute;left:${((i / Math.max(points.length - 1, 1)) * 100).toFixed(1)}%;
           transform:translateX(-50%);font-size:10px;font-family:var(--fontFamilyCode);
           color:var(--colorTextTertiary);white-space:nowrap">${p.label}</span>`
      ).join('');

    return `
      <style>
        .lc-dot{opacity:0;transition:opacity .15s;cursor:default}
        .lc-wrap:hover .lc-dot{opacity:1}
      </style>
      <div class="lc-wrap" style="position:relative;padding-left:42px;padding-bottom:22px">
        <div style="position:absolute;left:0;top:0;bottom:22px;width:40px;pointer-events:none">
          ${yLabelHtml}
        </div>
        <div style="position:relative" class="lc-inner">
          <svg viewBox="0 0 ${VW} ${VH}" preserveAspectRatio="none"
               style="width:100%;height:${H}px;display:block">
            ${gridLines}
            <path d="${areaPath}" fill="rgba(26,119,202,0.12)"/>
            ${capLine}
            <path d="${linePath}" fill="none" stroke="var(--colorPrimaryLighter)"
                  stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
            ${dots}
          </svg>
          ${capLabelHtml}
        </div>
        <div style="position:absolute;bottom:0;left:42px;right:0;height:20px">
          ${xLabelHtml}
        </div>
      </div>`;
  }

  function _tcBarTable(rows, valueKey = 'total', label = 'Tasks') {
    if (!rows || rows.length === 0) return '<p class="text-tertiary" style="padding:var(--space-md)">No data.</p>';
    const max = Math.max(...rows.map(r => r[valueKey]), 1);
    return `<table style="width:100%;border-collapse:collapse;font:var(--textBodyRegularSmall)">
      <thead><tr>
        <th style="text-align:left;padding:6px var(--space-sm);color:var(--colorTextTertiary);font:var(--textBodyBoldXSmall);text-transform:uppercase;border-bottom:1px solid var(--colorBorderDefault)">Name</th>
        <th style="text-align:right;padding:6px var(--space-sm);color:var(--colorTextTertiary);font:var(--textBodyBoldXSmall);text-transform:uppercase;border-bottom:1px solid var(--colorBorderDefault)">${label}</th>
        <th style="width:35%;padding:6px var(--space-sm);border-bottom:1px solid var(--colorBorderDefault)"></th>
      </tr></thead>
      <tbody>${rows.slice(0, 12).map(r => {
        const pct = Math.round((r[valueKey] / max) * 100);
        return `<tr>
          <td style="padding:5px var(--space-sm);color:var(--colorTextPrimary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px" title="${_escapeAttr(String(r.name))}">${DOMPurify.sanitize(String(r.name))}</td>
          <td style="padding:5px var(--space-sm);text-align:right;font-family:var(--fontFamilyCode);color:var(--colorTextSecondary)">${r[valueKey].toLocaleString()}</td>
          <td style="padding:5px var(--space-sm)">
            <div style="background:var(--colorBorderSubtle,rgba(255,255,255,0.05));border-radius:2px;height:6px">
              <div style="background:var(--colorPrimaryLighter);border-radius:2px;height:6px;width:${pct}%"></div>
            </div>
          </td>
        </tr>`;
      }).join('')}</tbody></table>`;
  }

  const TC_PERIODS = [
    { days: 1,   label: '24 hours' },
    { days: 7,   label: '7 days' },
    { days: 30,  label: '30 days' },
    { days: 90,  label: '90 days' },
    { days: 180, label: '6 months' },
    { days: 365, label: '1 year' },
  ];

  function renderTaskcap(summary) {
    if (!summary) return `<div class="page-content"><p class="text-tertiary" style="padding:var(--space-xl)">Loading data…</p></div>`;
    const currentDays = DashboardData.getTaskCapDays();
    const d = DashboardData.computeTaskCapData();

    // Pre-compute displayed values
    const exec       = d.executing ?? 0;
    const queued     = d.queued    ?? 0;
    const currentVal = d.cap != null ? `${exec} / ${d.cap}` : String(exec);
    const utilVal    = d.avgUtil != null ? `${d.avgUtil}%` : '--';

    // Concurrency chart — default to the currently selected period
    const chart7d = (() => {
      if (currentDays === 1) {
        const pts = d.hourlyConc.slice(-24).map((v, i) => {
          const ts = new Date(Date.now() - (23 - i) * 3600000);
          return { v, label: `${ts.getUTCHours()}:00` };
        });
        return _tcSvgLine(pts, d.cap);
      }

      if (currentDays === 7) {
        const pts = d.hourlyConc.slice(-168).reduce((acc, v, i) => {
          const bucket = Math.floor(i / 24);
          if (!acc[bucket]) {
            const ts = new Date(Date.now() - (167 - i) * 3600000);
            acc[bucket] = { v: 0, label: `${ts.getUTCDate()}/${ts.getUTCMonth() + 1}` };
          }
          acc[bucket].v = Math.max(acc[bucket].v, v);
          return acc;
        }, []).filter(Boolean);
        return _tcSvgLine(pts, d.cap);
      }

      const hours = Math.min(d.hourlyConc.length, currentDays * 24);
      const pts = d.hourlyConc.slice(-hours).map((v, i) => {
        const ts = new Date(Date.now() - (hours - 1 - i) * 3600000);
        return { v, label: `${ts.getUTCDate()}/${ts.getUTCMonth() + 1}` };
      });
      return _tcSvgLine(pts, d.cap);
    })();



    const periodLabel = TC_PERIODS.find(p => p.days === currentDays)?.label || `${currentDays} days`;

    return `<div class="page-content">
      <div class="flex items-center justify-between mb-lg" style="gap:var(--space-md);flex-wrap:wrap">
        <div style="font:var(--textBodyRegularSmall);color:var(--colorTextTertiary);display:flex;align-items:center;gap:var(--space-xs)">
          <i class="fa-solid fa-clock-rotate-left"></i>
          <span>Showing: <strong style="color:var(--colorTextPrimary)">${periodLabel}</strong></span>
        </div>
        <div class="flex items-center gap-xs">
          <span style="font:var(--textBodyRegularXSmall);color:var(--colorTextTertiary)">Period:</span>
          <select id="tc-period-select" class="lookback-select" style="min-width:110px">
            ${TC_PERIODS.map(p => `<option value="${p.days}"${p.days === currentDays ? ' selected' : ''}>${p.label}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="section-header">
        <h2 class="section-title"><i class="fa-solid fa-gauge-simple-high"></i> Task Cap Overview</h2>
      </div>
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="flex items-center justify-between">
            <span class="kpi-label">Current Tasks</span>
            <div class="kpi-icon blue"><i class="fa-solid fa-list-check"></i></div>
          </div>
          <span class="kpi-value">${currentVal}</span>
          <span class="kpi-trend neutral">${exec} executing · ${queued} queued</span>
        </div>
        <div class="kpi-card">
          <div class="flex items-center justify-between">
            <span class="kpi-label">Peak (${periodLabel})</span>
            <div class="kpi-icon purple"><i class="fa-solid fa-arrow-trend-up"></i></div>
          </div>
          <span class="kpi-value">${d.peakInPeriod}</span>
          <span class="kpi-trend neutral">peak 24h: ${d.peak24h} concurrent</span>
        </div>
        <div class="kpi-card">
          <div class="flex items-center justify-between">
            <span class="kpi-label">Avg Utilisation</span>
            <div class="kpi-icon ${d.avgUtil != null && d.avgUtil >= 80 ? 'amber' : 'blue'}"><i class="fa-solid fa-percent"></i></div>
          </div>
          <span class="kpi-value">${utilVal}</span>
          <span class="kpi-trend neutral">avg ${d.avgConc} concurrent · ${periodLabel}</span>
        </div>
        <div class="kpi-card">
          <div class="flex items-center justify-between">
            <span class="kpi-label">Time At Cap</span>
            <div class="kpi-icon ${d.timeAtCap > 0 ? 'amber' : 'green'}"><i class="fa-solid fa-clock"></i></div>
          </div>
          <span class="kpi-value">${d.timeAtCap}h</span>
          <span class="kpi-trend neutral">${d.timeNearCap}h near cap (≥80%) · ${periodLabel}</span>
        </div>
      </div>

      <div class="section-header">
        <h2 class="section-title"><i class="fa-solid fa-chart-line"></i> Concurrency Over Time</h2>
      </div>
      <div class="dashboard-grid mb-lg">
        <div class="card col-span-12 card--chart-tooltips">
          <div class="card-header">
            <h3 class="card-title">Concurrent Tasks</h3>
            <div class="flex items-center gap-md">
              <div style="font:var(--textBodyRegularXSmall);color:var(--colorTextTertiary);display:flex;align-items:center;gap:4px">
                <span style="display:inline-block;width:20px;height:0;border-bottom:2px dashed var(--colorWarningLight);vertical-align:middle;margin-right:2px"></span>Cap
              </div>
              <div class="flex gap-xs">
                ${[['24h',1],['7d',7],['30d',30],['90d',90],['180d',180]]
                  .filter(([,d]) => currentDays >= d || d === 1)
                  .map(([range, d]) => {
                    const active = d === currentDays || (d === 1 && currentDays < 7) ? ' active-toggle' : '';
                    return `<button class="btn btn-secondary btn-sm tc-range-btn${active}" data-range="${range}">${range}</button>`;
                  }).join('')}
              </div>
            </div>
          </div>
          <div class="card-body">
            <div id="tc-conc-chart" style="padding:var(--space-sm) 0">${chart7d}</div>
          </div>
        </div>
      </div>

      <div class="dashboard-grid mb-lg">
        <div class="card col-span-6">
          <div class="card-header"><h3 class="card-title">Volume by Space</h3></div>
          <div class="card-body">${_tcBarTable(d.spaceBreakdown, 'total', 'Tasks')}</div>
        </div>
        <div class="card col-span-6">
          <div class="card-header"><h3 class="card-title">Top Projects by Volume</h3></div>
          <div class="card-body">${_tcBarTable(d.projectBreakdown, 'count', 'Deployments')}</div>
        </div>
      </div>

    </div>`;
  }

  function wireTaskcapEvents(summary) {
    if (!summary) return;

    // Period selector
    const periodSel = document.getElementById('tc-period-select');
    if (periodSel) {
      periodSel.addEventListener('change', () => {
        const days = parseInt(periodSel.value, 10);
        const enrichState  = DashboardData.getEnrichmentState();
        const loadedMonths = enrichState.lookbackMonths ?? 3;
        const loadedDays   = loadedMonths === 0 ? Infinity : loadedMonths * 30;

        // If user picks a period beyond the currently loaded data, offer to load more
        if (days > loadedDays) {
          const neededMonths = Math.ceil(days / 30);
          const formatLookbackLabel = (months) => {
            if (months < 12) {
              return `${months} month${months !== 1 ? 's' : ''}`;
            }

            if (months % 12 === 0) {
              const years = months / 12;
              return `${years} year${years !== 1 ? 's' : ''}`;
            }

            const years = Math.floor(months / 12);
            const remainingMonths = months % 12;
            return `${years} year${years !== 1 ? 's' : ''} ${remainingMonths} month${remainingMonths !== 1 ? 's' : ''}`;
          };
          const label = formatLookbackLabel(neededMonths);
          const heavy = neededMonths > 12;
          const msg = `The selected period (${days} days) is longer than your currently loaded data (${loadedMonths} months).\n\n`
            + `Load ${label} of data?`
            + (heavy ? `\n\nThis may take a while and could be heavy on larger Octopus instances.` : '');

          if (!confirm(msg)) {
            periodSel.value = String(DashboardData.getTaskCapDays());
            return;
          }

          // Ask dashboard.js to update the global lookback and re-run enrichment,
          // then re-render this page when it's done
          document.dispatchEvent(new CustomEvent('tc-request-lookback', {
            detail: { months: neededMonths, afterDays: days }
          }));
          return; // dashboard.js will re-render the page once data is ready
        }

        DashboardData.setTaskCapDays(days);
        const main = document.getElementById('main-content');
        if (main) {
          main.innerHTML = Views.renderTaskcap(summary);
          Views.wireTaskcapEvents(summary);
        }
      });
    }

    const d = DashboardData.computeTaskCapData();

    document.querySelectorAll('.tc-range-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tc-range-btn').forEach(b => b.classList.remove('active-toggle'));
        btn.classList.add('active-toggle');
        const range = btn.dataset.range;
        const el = document.getElementById('tc-conc-chart');
        if (!el) return;

        let pts;
        if (range === '24h') {
          pts = d.hourlyConc.slice(-24).map((v, i) => {
            const ts = new Date(Date.now() - (23-i)*3600000);
            return { v, label: `${ts.getUTCHours()}:00` };
          });
        } else {
          // For 7d/30d/90d/180d: group hourly buckets into sensible intervals
          const rangeDays = parseInt(range);
          const totalHours = d.hourlyConc.length;
          const hoursToShow = Math.min(rangeDays * 24, totalHours);
          // Group size: 6h for ≤7d, 24h for ≤90d, 48h otherwise
          const groupSize = rangeDays <= 7 ? 6 : rangeDays <= 90 ? 24 : 48;
          const slice = d.hourlyConc.slice(-hoursToShow);
          pts = slice.reduce((acc, v, i) => {
            const bucket = Math.floor(i / groupSize);
            if (!acc[bucket]) {
              const ts = new Date(Date.now() - (hoursToShow - 1 - i) * 3600000);
              acc[bucket] = { v: 0, label: `${ts.getUTCDate()}/${ts.getUTCMonth() + 1}` };
            }
            acc[bucket].v = Math.max(acc[bucket].v, v);
            return acc;
          }, []).filter(Boolean);
        }
        el.innerHTML = _tcSvgLine(pts, d.cap);
        _wireTcTooltip(el, pts);
      });
    });

    // Wire tooltip for the initial chart render (7d default)
    // Compute initialPts using the same logic as the rendered chart so tooltips match
    const _tcPtsForDays = (days, hourlyConc) => {
      if (days <= 1) {
        return hourlyConc.slice(-24).map((v, i) => {
          const ts = new Date(Date.now() - (23 - i) * 3600000);
          return { v, label: `${ts.getUTCHours()}:00` };
        });
      }
      const hoursToShow = Math.min(days * 24, hourlyConc.length);
      const groupSize   = days <= 7 ? 6 : days <= 90 ? 24 : 48;
      return hourlyConc.slice(-hoursToShow).reduce((acc, v, i) => {
        const bucket = Math.floor(i / groupSize);
        if (!acc[bucket]) { const ts = new Date(Date.now() - (hoursToShow - 1 - i) * 3600000); acc[bucket] = { v: 0, label: `${ts.getUTCDate()}/${ts.getUTCMonth() + 1}` }; }
        acc[bucket].v = Math.max(acc[bucket].v, v);
        return acc;
      }, []).filter(Boolean);
    };
    const initialPts = _tcPtsForDays(DashboardData.getTaskCapDays(), d.hourlyConc);
    _wireTcTooltip(document.getElementById('tc-conc-chart'), initialPts);
  }

  function _wireTcTooltip(chartEl, points) {
    if (!chartEl || !points || points.length < 2) return;
    const inner = chartEl.querySelector('.lc-inner');
    if (!inner) return;
    const svg = inner.querySelector('svg');
    if (!svg) return;

    const tip = document.createElement('div');
    tip.style.cssText = 'position:absolute;pointer-events:none;display:none;background:var(--colorBackgroundSecondaryDefault);border:1px solid var(--colorBorderDefault);border-radius:var(--radiusMedium);box-shadow:0 4px 14px rgba(0,0,0,0.35);padding:6px 10px;font:var(--textBodyRegularSmall);color:var(--colorTextPrimary);white-space:nowrap;z-index:10000;transform:translateX(-50%)';
    inner.appendChild(tip);

    const VH = 100;
    const maxVal = Math.max(...points.map(p => p.v), 1);
    const yN = v => VH - (v / maxVal) * VH;

    svg.addEventListener('mousemove', e => {
      const rect = svg.getBoundingClientRect();
      const idx  = Math.min(points.length - 1, Math.max(0,
        Math.round(((e.clientX - rect.left) / rect.width) * (points.length - 1))
      ));
      const p = points[idx];
      tip.innerHTML = `<strong>${p.label}</strong>: ${p.v} concurrent`;
      tip.style.left    = `${((idx / Math.max(points.length - 1, 1)) * 100).toFixed(1)}%`;
      tip.style.bottom  = `${(100 - (yN(p.v) / VH) * 100 + 2).toFixed(1)}%`;
      tip.style.display = 'block';
    });
    svg.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
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
    wireVelocityEvents,
    renderReliability,
    // Insight views
    renderSpaces,
    wireSpacesEvents,
    renderProjects,
    wireProjectsEvents,
    renderEnvironments,
    wireEnvironmentsEvents,
    renderTeams,
    // Tenant view
    renderTenants,
    wireTenantsEvents,
    // Task Cap view
    renderTaskcap,
    wireTaskcapEvents,
  };

})();
