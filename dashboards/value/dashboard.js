// ================================================================
// Debug logger (hidden by default, toggle with Ctrl+D)
// ================================================================
const debugEl = document.getElementById('debug-log');
function debug(msg, data) {
    const ts = new Date().toLocaleTimeString('en-AU', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
    let line = `[${ts}] ${msg}`;
    if (data !== undefined) {
        try { line += '\n  → ' + JSON.stringify(data, null, 2); } catch(e) { line += '\n  → [unserializable]'; }
    }
    debugEl.textContent += line + '\n';
    debugEl.scrollTop = debugEl.scrollHeight;
    console.log('[ValueDashboard]', msg, data);
}
window._debug = debug;

document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'd') {
        debugEl.style.display = debugEl.style.display === 'none' ? '' : 'none';
        e.preventDefault();
    }
});

// ================================================================
// Connection status indicator (sidebar footer)
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
// Value Impact Rendering
// ================================================================
let _lastSummary = null;

function renderValueImpact(summary) {
    _lastSummary = summary;
    const answers = Onboarding.getAnswers();
    const value = Onboarding.calculateValue(summary, answers);

    const ctaEl = document.getElementById('onboarding-cta');
    const impactEl = document.getElementById('value-impact-section');

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
        html += `
        <div class="value-card confidence">
            <div class="value-card-icon"><i class="fa-solid fa-face-smile"></i></div>
            <div class="value-card-label">Release Confidence</div>
            <div class="value-card-number">${value.confidenceNow}%</div>
            <div class="value-card-detail">
                ${improved
                    ? `Up from <strong>${value.confidenceBefore}%</strong> before — a <strong>+${value.confidenceImprovement}pt</strong> improvement.`
                    : `Current success rate is <strong>${value.confidenceNow}%</strong>. Before automation: ${value.confidenceBefore}%.`
                }
            </div>
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

    cards.innerHTML = html;
}

// ================================================================
// Onboarding triggers
// ================================================================
function openOnboarding() {
    Onboarding.open((answers) => {
        debug('Onboarding complete', answers ? Object.keys(answers) : 'skipped');
        if (_lastSummary) renderValueImpact(_lastSummary);
    });
}

document.getElementById('btn-start-onboarding').addEventListener('click', openOnboarding);
document.getElementById('nav-onboarding').addEventListener('click', (e) => { e.preventDefault(); openOnboarding(); });
document.getElementById('nav-reset-onboarding').addEventListener('click', (e) => {
    e.preventDefault();
    Onboarding.clear();
    debug('Onboarding answers cleared');
    if (_lastSummary) renderValueImpact(_lastSummary);
});
document.getElementById('btn-edit-value-settings').addEventListener('click', openOnboarding);

// ================================================================
// Override DashboardUI.loadDashboard to also render value impact
// ================================================================
const _originalLoadDashboard = DashboardUI.loadDashboard;
DashboardUI.loadDashboard = async function() {
    await _originalLoadDashboard.call(DashboardUI);
    const summary = DashboardData.getSummary();
    if (summary) renderValueImpact(summary);
};

// ================================================================
// Bootstrap — init from extension config, then load dashboard
// ================================================================
(async function bootstrap() {
    try {
        debug('Initialising from Chrome extension config...');
        await OctopusApi.init();
        debug('Connected', { serverUrl: OctopusApi.getInstanceUrl() });
        updateConnectionStatus();

        // Load dashboard
        DashboardUI.loadDashboard().then(() => {
            if (!Onboarding.hasAnswers()) {
                setTimeout(openOnboarding, 1500);
            }
        });
    } catch (err) {
        debug('Init failed', err.message);
        document.getElementById('status-message').textContent = 'Failed to connect: ' + err.message;
        document.getElementById('status-message').style.display = '';
        updateConnectionStatus();
    }
})();

// ================================================================
// General UI
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

document.querySelectorAll('[data-range]').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('[data-range]').forEach(b => b.classList.remove('active-toggle'));
        btn.classList.add('active-toggle');
    });
});
