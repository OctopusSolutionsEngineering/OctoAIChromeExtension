// ================================================================
// Debug logger
// ================================================================
let _debugEl = null;
function debug(msg, data) {
    const ts = new Date().toLocaleTimeString('en-AU', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
    let line = `[${ts}] ${msg}`;
    if (data !== undefined) {
        try { line += '\n  → ' + JSON.stringify(data, null, 2); } catch(e) { line += '\n  → [unserializable]'; }
    }
    // debugEl may move between views; always re-query
    _debugEl = document.getElementById('debug-log');
    if (_debugEl) {
        _debugEl.textContent += line + '\n';
        _debugEl.scrollTop = _debugEl.scrollHeight;
    }
    console.log('[ValueDashboard]', msg, data);
}
window._debug = debug;

// Debug log toggle (Ctrl+D) — registered once, works when overview is active
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'd') {
        const dl = document.getElementById('debug-log');
        if (dl) { dl.style.display = dl.style.display === 'none' ? '' : 'none'; }
        e.preventDefault();
    }
});

// ================================================================
// Connection status indicator (sidebar footer — always present)
// ================================================================
const statusDot   = document.querySelector('.sidebar-footer .status-dot');
const statusLabel = document.querySelector('.sidebar-footer .text-secondary');

function updateConnectionStatus() {
    const configured = OctopusApi.isConfigured();
    statusDot.className = `status-dot ${configured ? 'success' : 'neutral'}`;
    statusLabel.textContent = configured
        ? OctopusApi.getInstanceUrl().replace(/^https?:\/\//, '')
        : 'Not connected';
}

// ================================================================
// Value Impact Rendering (called by router when Overview is active)
// ================================================================
let _lastSummary = null;

function renderValueImpact(summary) {
    _lastSummary = summary;
    const answers = Onboarding.getAnswers();
    const value = Onboarding.calculateValue(summary, answers);

    const ctaEl = document.getElementById('onboarding-cta');
    const impactEl = document.getElementById('value-impact-section');

    // Elements only exist on the Overview view
    if (!ctaEl || !impactEl) return;

    if (!value || !value.hasData) {
        ctaEl.style.display = '';
        impactEl.style.display = 'none';
        return;
    }

    ctaEl.style.display = 'none';
    impactEl.style.display = '';

    const cards = document.getElementById('value-cards');

    const fmt$ = (n) => {
        if (n >= 1000000) return '$' + (n / 1000000).toFixed(1) + 'M';
        if (n >= 1000) return '$' + Math.round(n / 1000) + 'K';
        return '$' + n.toLocaleString();
    };

    const fmtHrs = (h) => {
        if (h >= 2000) return Math.round(h / 2000) + ' FTE-years';
        if (h >= 160) return Math.round(h / 160) + ' person-months';
        if (h >= 8) return Math.round(h / 8) + ' working days';
        return h + ' hours';
    };

    let html = '';

    if (value.engineeringCostSaved) {
        html += `
        <div class="value-card savings">
            <div class="value-card-icon"><i class="fa-solid fa-coins"></i></div>
            <div class="value-card-label">Engineering Cost Saved</div>
            <div class="value-card-number">${fmt$(value.totalCostSaved)}</div>
            <div class="value-card-detail">
                <strong>${value.engineeringHoursSaved.toLocaleString()} hours</strong> (${fmtHrs(value.engineeringHoursSaved)}) of engineering time recovered.<br>
                Based on ${summary.kpi.totalDeployments} deployments &times; ${value.hoursPerDeploy}min &times; ${value.peoplePerDeploy} people @ $${value.hourlyRate}/hr
            </div>
        </div>`;
    }

    if (value.throughputMultiplier && value.throughputMultiplier > 1) {
        html += `
        <div class="value-card throughput">
            <div class="value-card-icon"><i class="fa-solid fa-bolt"></i></div>
            <div class="value-card-label">Delivery Throughput</div>
            <div class="value-card-number">${value.throughputMultiplier}x faster</div>
            <div class="value-card-detail">
                From <strong>${value.oldCadenceLabel}</strong> (${value.oldDeploysPerMonth}/mo) to <strong>${value.currentDeploysPerMonth} deploys/month</strong> now.
            </div>
        </div>`;
    }

    if (value.incidentHoursAvoided > 0) {
        html += `
        <div class="value-card risk">
            <div class="value-card-icon"><i class="fa-solid fa-shield-halved"></i></div>
            <div class="value-card-label">Incident Impact Reduction</div>
            <div class="value-card-number">${value.incidentHoursAvoided} hrs avoided</div>
            <div class="value-card-detail">
                ${summary.failedCount} failed deployments &times; ${value.recoveryTimeBefore}hr recovery reduced to minutes.
                <strong>${fmt$(value.incidentCostAvoided)}</strong> in incident cost avoided.
            </div>
        </div>`;
    }

    if (value.confidenceNow !== undefined) {
        const improved = value.confidenceImprovement > 0;
        const regressed = value.confidenceNow < value.confidenceBefore;
        const icon = regressed ? 'fa-solid fa-triangle-exclamation' : 'fa-solid fa-face-smile';
        const cardClass = regressed ? 'confidence attention' : 'confidence';
        let detail;
        if (improved) {
            detail = `Up from <strong>${value.confidenceBefore}%</strong> before — a <strong>+${value.confidenceImprovement}pt</strong> improvement.`;
        } else if (regressed) {
            detail = `Success rate <strong>${value.confidenceNow}%</strong> is below your pre-automation confidence of <strong>${value.confidenceBefore}%</strong>. Investigate recent failures to close the gap.`;
        } else {
            detail = `Maintaining <strong>${value.confidenceNow}%</strong> success rate — consistent with your pre-automation baseline.`;
        }
        html += `
        <div class="value-card ${cardClass}">
            <div class="value-card-icon"><i class="${icon}"></i></div>
            <div class="value-card-label">Release Confidence</div>
            <div class="value-card-number">${value.confidenceNow}%</div>
            <div class="value-card-detail">${detail}</div>
        </div>`;
    }

    if (value.afterHoursRemoved > 0) {
        html += `
        <div class="value-card qol">
            <div class="value-card-icon"><i class="fa-solid fa-moon"></i></div>
            <div class="value-card-label">After-Hours Burden Removed</div>
            <div class="value-card-number">${fmtHrs(value.afterHoursRemoved)}</div>
            <div class="value-card-detail">
                Previously <strong>${value.afterHoursPctBefore}%</strong> of deployments required after-hours work. Now eliminated.
            </div>
        </div>`;
    }

    if (value.leadTimeReduction > 0) {
        html += `
        <div class="value-card leadtime">
            <div class="value-card-icon"><i class="fa-solid fa-forward-fast"></i></div>
            <div class="value-card-label">Lead Time Improvement</div>
            <div class="value-card-number">${value.leadTimeReduction < 1 ? (Math.round(value.leadTimeReduction * 60) + ' min') : (value.leadTimeReduction + 'hr')} faster</div>
            <div class="value-card-detail">
                Wait time was <strong>${value.waitBeforeLabel}</strong>. Now near-instant with automated pipelines.
            </div>
        </div>`;
    }

    // --- ROI cards (require contract investment answer) ---
    if (value.hasROI) {
        const roiLabel = value.roiMultiplier >= 1
            ? `For every <strong>$1</strong> invested, you've recovered <strong>$${value.roiMultiplier.toFixed(2)}</strong> in engineering value.`
            : `ROI building — ${fmt$(value.totalCostSaved)} recovered against a ${fmt$(value.annualInvestment)}/yr investment so far.`;
        const manualLine = value.manualEquivalentCost
            ? ` The manual alternative would have cost <strong>${fmt$(value.manualEquivalentCost)}</strong>.`
            : '';

        html += `
        <div class="value-card roi">
            <div class="value-card-icon"><i class="fa-solid fa-chart-line"></i></div>
            <div class="value-card-label">Platform ROI</div>
            <div class="value-card-number">${value.roiMultiplier >= 0.1 ? value.roiMultiplier.toFixed(1) + 'x' : '< 0.1x'} return</div>
            <div class="value-card-detail">
                ${roiLabel}${manualLine}
            </div>
        </div>`;

        const breakEvenLine = value.breakEvenDeploy
            ? value.deploysIntoSavings > 0
                ? `Platform paid for itself at deployment <strong>#${value.breakEvenDeploy}</strong> — you're <strong>${value.deploysIntoSavings} deployments</strong> into net savings.`
                : `Break-even at deployment <strong>#${value.breakEvenDeploy}</strong> — <strong>${value.breakEvenDeploy - summary.kpi.totalDeployments}</strong> to go.`
            : '';
        const vsManual = value.manualCostPerDeploy
            ? ` Down from <strong>$${value.manualCostPerDeploy}</strong>/deploy manually.`
            : '';

        html += `
        <div class="value-card costdeploy">
            <div class="value-card-icon"><i class="fa-solid fa-receipt"></i></div>
            <div class="value-card-label">Cost Per Deployment</div>
            <div class="value-card-number">$${value.costPerDeploy}</div>
            <div class="value-card-detail">
                ${breakEvenLine}${vsManual}
            </div>
        </div>`;
    }

    cards.innerHTML = html;
}

// ================================================================
// Onboarding triggers (sidebar links are always present)
// ================================================================
function openOnboarding() {
    Onboarding.open((answers) => {
        debug('Onboarding complete', answers ? Object.keys(answers) : 'skipped');
        if (_lastSummary && Router.getCurrentView() === 'overview') {
            renderValueImpact(_lastSummary);
        }
    });
}

document.getElementById('nav-onboarding').addEventListener('click', (e) => { e.preventDefault(); openOnboarding(); });
document.getElementById('nav-reset-onboarding').addEventListener('click', (e) => {
    e.preventDefault();
    Onboarding.clear();
    debug('Onboarding answers cleared');
    if (_lastSummary && Router.getCurrentView() === 'overview') {
        renderValueImpact(_lastSummary);
    }
});

// ================================================================
// Override DashboardUI.loadDashboard to also render value impact
// and refresh the current view after data loads
// ================================================================
const _originalLoadDashboard = DashboardUI.loadDashboard;
DashboardUI.loadDashboard = async function() {
    await _originalLoadDashboard.call(DashboardUI);
    const summary = DashboardData.getSummary();
    _lastSummary = summary;

    // Reset compliance cache so it re-fetches on next visit
    if (typeof ComplianceData !== 'undefined') ComplianceData.reset();

    // After data loads, refresh the current view
    if (Router.getCurrentView() === 'overview') {
        if (summary) renderValueImpact(summary);
    } else {
        Router.refresh();
    }
};

// ================================================================
// Bootstrap — init API, load data, then hand off to Router
// ================================================================
(async function bootstrap() {
    try {
        debug('Initialising from Chrome extension config...');
        await OctopusApi.init();
        debug('Connected', { serverUrl: OctopusApi.getInstanceUrl() });
        updateConnectionStatus();

        // Initialise router (renders the initial view)
        Router.init();

        // Load dashboard data
        DashboardUI.loadDashboard().then(() => {
            // Re-render current view now that data is loaded
            Router.refresh();
            if (!Onboarding.hasAnswers() && Router.getCurrentView() === 'overview') {
                setTimeout(openOnboarding, 1500);
            }
        });
    } catch (err) {
        debug('Init failed', err.message);
        // Still init router to show the shell
        Router.init();
        const statusEl = document.getElementById('status-message');
        if (statusEl) {
            statusEl.textContent = 'Failed to connect: ' + err.message;
            statusEl.style.display = '';
        }
        updateConnectionStatus();
    }
})();

// ================================================================
// General UI — always-present elements
// ================================================================
function updateRefreshTime() {
    const now = new Date();
    document.getElementById('last-refresh').textContent =
        now.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
}
updateRefreshTime();

document.getElementById('btn-refresh').addEventListener('click', () => {
    updateRefreshTime();
    DashboardUI.loadDashboard();
});

// ================================================================
// Export (always-present in header)
// ================================================================
const exportBtn = document.getElementById('btn-export');
const exportDropdown = document.getElementById('export-dropdown');

exportBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    exportDropdown.classList.toggle('open');
});

document.addEventListener('click', () => {
    exportDropdown.classList.remove('open');
});
exportDropdown.addEventListener('click', (e) => e.stopPropagation());

document.querySelectorAll('.export-option').forEach(btn => {
    btn.addEventListener('click', () => {
        const format = btn.dataset.format;
        exportDropdown.classList.remove('open');
        performExport(format);
    });
});

/**
 * Assemble all dashboard data into a single export object.
 */
function assembleExportData() {
    const summary = _lastSummary;
    if (!summary) return null;

    const answers = Onboarding.getAnswers();
    const value = Onboarding.calculateValue(summary, answers);

    return {
        metadata: {
            exportedAt: new Date().toISOString(),
            serverUrl: OctopusApi.getInstanceUrl(),
            serverVersion: summary.serverInfo?.Version || '--',
        },
        kpi: summary.kpi,
        valueImpact: value && value.hasData ? value : null,
        spaceBreakdown: summary.spaceBreakdown.map(s => ({
            space: s.name,
            projects: s.projectCount,
            environments: s.environmentCount,
            deployments: s.deploymentCount,
            successRate: s.successRate + '%',
            successCount: s.successCount,
            failedCount: s.failedCount,
            targets: s.targetCount,
            healthyTargets: s.healthyTargets,
            lastDeployment: s.lastDeployment || '--',
            releases: s.releaseCount,
        })),
        recentDeployments: summary.recentDeployments.map(d => ({
            project: d._projectName || d.ProjectId || '--',
            release: d.ReleaseVersion || '--',
            environment: d._envName || d.EnvironmentId || '--',
            space: d._spaceName || '--',
            status: d.State || 'Unknown',
            duration: d.Duration || '--',
            when: d.Created || '--',
        })),
        envHealth: summary.envHealth.map(e => ({
            environment: e.name,
            success: e.success,
            failed: e.failed,
            total: e.total,
            successRate: e.successRate + '%',
            spaces: e.spaces,
        })),
        weeklyTrend: summary.weeklyTrend,
        licenseInfo: summary.licenseInfo,
    };
}

/**
 * Format export data as CSV with section headers.
 */
function formatCSV(data) {
    const lines = [];
    const esc = (v) => {
        const s = String(v == null ? '' : v);
        return s.includes(',') || s.includes('"') || s.includes('\n') ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const row = (...vals) => lines.push(vals.map(esc).join(','));

    lines.push('# Export Metadata');
    row('Field', 'Value');
    row('Exported At', data.metadata.exportedAt);
    row('Server URL', data.metadata.serverUrl);
    row('Server Version', data.metadata.serverVersion);
    lines.push('');

    lines.push('# Dashboard KPIs');
    row('Metric', 'Value');
    row('Total Deployments', data.kpi.totalDeployments);
    row('Success Rate', data.kpi.successRate + '%');
    row('Deploy Frequency', data.kpi.deployFrequency + '/day');
    row('Avg Duration', data.kpi.avgDuration);
    row('Active Spaces', data.kpi.activeSpaces + '/' + data.kpi.totalSpaces);
    row('Active Projects', data.kpi.activeProjects);
    row('Total Targets', data.kpi.totalTargets);
    row('Healthy Targets', data.kpi.healthyTargetsPct + '%');
    row('Total Releases', data.kpi.totalReleases);
    row('Time Saved (est. hrs)', data.kpi.timeSavedHours);
    lines.push('');

    if (data.valueImpact) {
        const v = data.valueImpact;
        lines.push('# Value Impact');
        row('Metric', 'Value');
        if (v.engineeringCostSaved) row('Engineering Cost Saved', '$' + v.engineeringCostSaved);
        if (v.engineeringHoursSaved) row('Engineering Hours Saved', v.engineeringHoursSaved);
        if (v.incidentCostAvoided) row('Incident Cost Avoided', '$' + v.incidentCostAvoided);
        if (v.incidentHoursAvoided) row('Incident Hours Avoided', v.incidentHoursAvoided);
        if (v.throughputMultiplier) row('Throughput Multiplier', v.throughputMultiplier + 'x');
        if (v.confidenceNow !== undefined) row('Release Confidence (now)', v.confidenceNow + '%');
        if (v.confidenceBefore !== undefined) row('Release Confidence (before)', v.confidenceBefore + '%');
        if (v.afterHoursRemoved) row('After-Hours Burden Removed (hrs)', v.afterHoursRemoved);
        if (v.leadTimeReduction) row('Lead Time Improvement (hrs)', v.leadTimeReduction);
        if (v.hasROI) {
            row('Platform ROI', v.roiMultiplier + 'x');
            row('Cost Per Deployment', '$' + v.costPerDeploy);
            if (v.manualCostPerDeploy) row('Manual Cost Per Deployment', '$' + v.manualCostPerDeploy);
            if (v.breakEvenDeploy) row('Break-Even Deployment #', v.breakEvenDeploy);
            if (v.manualEquivalentCost) row('Manual Equivalent Cost', '$' + v.manualEquivalentCost);
            row('Annual Investment', '$' + v.annualInvestment);
        }
        row('Total Cost Saved', '$' + v.totalCostSaved);
        lines.push('');
    }

    lines.push('# Space Breakdown');
    row('Space', 'Projects', 'Environments', 'Deployments', 'Success Rate', 'Success', 'Failed', 'Targets', 'Healthy Targets', 'Last Deployment', 'Releases');
    for (const s of data.spaceBreakdown) {
        row(s.space, s.projects, s.environments, s.deployments, s.successRate, s.successCount, s.failedCount, s.targets, s.healthyTargets, s.lastDeployment, s.releases);
    }
    lines.push('');

    lines.push('# Recent Deployments');
    row('Project', 'Release', 'Environment', 'Space', 'Status', 'Duration', 'When');
    for (const d of data.recentDeployments) {
        row(d.project, d.release, d.environment, d.space, d.status, d.duration, d.when);
    }
    lines.push('');

    lines.push('# Environment Health');
    row('Environment', 'Success', 'Failed', 'Total', 'Success Rate', 'Spaces');
    for (const e of data.envHealth) {
        row(e.environment, e.success, e.failed, e.total, e.successRate, e.spaces.join('; '));
    }
    lines.push('');

    lines.push('# Weekly Deployment Trend');
    row('Year', 'Week', 'Total', 'Success', 'Failed');
    for (const w of (data.weeklyTrend || [])) {
        row(w.year, w.week, w.total, w.success, w.failed);
    }

    return lines.join('\n');
}

/**
 * Trigger a file download in the browser.
 */
function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);
}

/**
 * Main export handler.
 */
function performExport(format) {
    const data = assembleExportData();
    if (!data) {
        debug('Export failed — no dashboard data loaded yet');
        return;
    }

    const date = new Date().toISOString().slice(0, 10);
    const baseName = `octopus-dashboard-${date}`;

    if (format === 'json') {
        const json = JSON.stringify(data, null, 2);
        downloadFile(json, baseName + '.json', 'application/json');
        debug('Exported JSON', { filename: baseName + '.json', size: json.length });
    } else if (format === 'csv') {
        const csv = formatCSV(data);
        downloadFile(csv, baseName + '.csv', 'text/csv');
        debug('Exported CSV', { filename: baseName + '.csv', size: csv.length });
    }
}
