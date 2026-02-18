/* ==========================================================================
   SOC2 Compliance Dashboard — Bootstrap
   
   Initialises the Octopus API client, loads the minimal data set, then
   renders ComplianceView into the page.
   ========================================================================== */

// ---- Debug logger ----

function debug(msg, data) {
    const ts = new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    let line = `[${ts}] ${msg}`;
    if (data !== undefined) {
        try { line += '\n  → ' + JSON.stringify(data, null, 2); } catch (e) { line += '\n  → [unserializable]'; }
    }
    console.log('[Compliance]', msg, data);
}
window._debug = debug;

// ---- UI helpers ----

function setStatusMessage(msg) {
    const el = document.getElementById('status-message');
    if (el) {
        el.textContent = msg || '';
        el.style.display = msg ? '' : 'none';
    }
}

function updateRefreshTime() {
    const el = document.getElementById('last-refresh');
    if (el) el.textContent = new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
}

function updateConnectionStatus() {
    const statusDot = document.querySelector('.sidebar-footer .status-dot');
    const statusLabel = document.querySelector('.sidebar-footer .text-secondary');
    const configured = OctopusApi.isConfigured();
    if (statusDot) statusDot.className = `status-dot ${configured ? 'success' : 'neutral'}`;
    if (statusLabel) {
        statusLabel.textContent = configured
            ? OctopusApi.getInstanceUrl().replace(/^https?:\/\//, '')
            : 'Not connected';
    }
}

// ---- Load and render ----

async function loadDashboard() {
    const main = document.getElementById('main-content');

    main.innerHTML = `
        <div style="text-align:center;padding:var(--space-xl);color:var(--colorTextTertiary);">
            <i class="fa-solid fa-spinner fa-spin" style="font-size:2rem;display:block;margin-bottom:var(--space-md);"></i>
            Loading compliance data&hellip;
        </div>`;

    try {
        await DashboardData.fetchAll((msg) => setStatusMessage(msg));

        // Render the compliance view shell (includes its own header, export button, loading spinner)
        main.innerHTML = ComplianceView.render(null);
        ComplianceView.wire(null);

        updateRefreshTime();
        setStatusMessage(null);

    } catch (err) {
        debug('Load failed', err.message);
        main.innerHTML = `
            <div class="card">
                <div class="card-body" style="text-align:center;padding:var(--space-xl);">
                    <i class="fa-solid fa-triangle-exclamation text-danger" style="font-size:2rem;margin-bottom:var(--space-md);display:block;"></i>
                    <h3 style="font:var(--textHeadingSmall);color:var(--colorTextPrimary);">Failed to load compliance data</h3>
                    <p class="text-secondary" style="margin-top:var(--space-xs);">${err.message || err}</p>
                    <p class="text-tertiary" style="font:var(--textBodyRegularXSmall);margin-top:var(--space-sm);">
                        Check that the Octopus Deploy extension is configured and your API key has the required permissions.
                    </p>
                </div>
            </div>`;
        setStatusMessage(null);
    }
}

// ---- Bootstrap ----

(async function bootstrap() {
    try {
        debug('Initialising from Chrome extension config…');
        await OctopusApi.init();
        debug('Connected', { serverUrl: OctopusApi.getInstanceUrl() });
        updateConnectionStatus();

        await loadDashboard();
    } catch (err) {
        debug('Init failed', err.message);
        setStatusMessage('Failed to connect: ' + err.message);
        updateConnectionStatus();
    }
})();

// ---- Refresh button ----

document.getElementById('btn-refresh').addEventListener('click', () => {
    ComplianceData.reset();
    loadDashboard();
});

// ---- Close export dropdowns on outside click ----

document.addEventListener('click', () => {
    document.querySelectorAll('.export-dropdown.open').forEach(el => el.classList.remove('open'));
});
