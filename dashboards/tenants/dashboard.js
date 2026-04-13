/* ─── Mock data ──────────────────────────────────────────────────────────────
 *
 * Replace MOCK_TENANTS with real Octopus API data when ready.
 * See the TODO comments below for the API integration points.
 *
 * ─────────────────────────────────────────────────────────────────────────── */

const now = new Date();

function minsAgo(n) { return new Date(now.getTime() - n * 60 * 1000); }
function hoursAgo(n) { return new Date(now.getTime() - n * 60 * 60 * 1000); }

const MOCK_TENANTS = [
    // ── All succeeded ──────────────────────────────────────────────────────
    {
        id: 'tenant-1', tenantDisplayId: 'Tenants-1001',
        name: 'Acme Corp', environment: 'Production',
        status: 'All succeeded', tags: ['Enterprise', 'Americas'],
        lastUpdated: minsAgo(2),
        tasks: [
            { id: 't1-1', serverTaskId: 'ServerTasks-8841', projectName: 'Web API', releaseVersion: '2.4.1', taskType: 'Deployment', taskState: 'Success', startedAt: minsAgo(14), duration: '6m 22s', machines: [{ id: 'm1', name: 'web-prod-01', status: 'Success' }, { id: 'm2', name: 'web-prod-02', status: 'Success' }] },
            { id: 't1-2', serverTaskId: 'ServerTasks-8842', projectName: 'Database Migrator', releaseVersion: '2.4.0', taskType: 'Deployment', taskState: 'Success', startedAt: minsAgo(22), duration: '4m 07s', machines: [{ id: 'm3', name: 'db-prod-01', status: 'Success' }] },
            { id: 't1-3', serverTaskId: 'ServerTasks-8843', projectName: 'Background Worker', releaseVersion: '2.4.1', taskType: 'Deployment', taskState: 'Success', startedAt: minsAgo(18), duration: '8m 21s', machines: [{ id: 'm4', name: 'worker-prod-01', status: 'Success' }, { id: 'm5', name: 'worker-prod-02', status: 'Success' }, { id: 'm6', name: 'worker-prod-03', status: 'Success' }] },
        ]
    },
    {
        id: 'tenant-2', tenantDisplayId: 'Tenants-1002',
        name: 'Globex Corp', environment: 'Production',
        status: 'All succeeded', tags: ['Enterprise', 'EMEA'],
        lastUpdated: minsAgo(8),
        tasks: [
            { id: 't2-1', serverTaskId: 'ServerTasks-8850', projectName: 'Web API', releaseVersion: '2.4.1', taskType: 'Deployment', taskState: 'Success', startedAt: minsAgo(35), duration: '7m 14s', machines: [{ id: 'm10', name: 'web-prod-01', status: 'Success' }, { id: 'm11', name: 'web-prod-02', status: 'Success' }] },
            { id: 't2-2', serverTaskId: 'ServerTasks-8851', projectName: 'Auth Service', releaseVersion: '1.9.3', taskType: 'Deployment', taskState: 'Success', startedAt: minsAgo(40), duration: '3m 52s', machines: [{ id: 'm12', name: 'auth-prod-01', status: 'Success' }] },
            { id: 't2-3', serverTaskId: 'ServerTasks-8852', projectName: 'Database Migrator', releaseVersion: '2.4.0', taskType: 'Deployment', taskState: 'Success', startedAt: minsAgo(45), duration: '5m 01s', machines: [{ id: 'm13', name: 'db-prod-01', status: 'Success' }] },
        ]
    },
    {
        id: 'tenant-3', tenantDisplayId: 'Tenants-1003',
        name: 'Initech Solutions', environment: 'Production',
        status: 'All succeeded', tags: ['Enterprise', 'APAC'],
        lastUpdated: minsAgo(22),
        tasks: [
            { id: 't3-1', serverTaskId: 'ServerTasks-8860', projectName: 'Web API', releaseVersion: '2.4.1', taskType: 'Deployment', taskState: 'Success', startedAt: minsAgo(55), duration: '9m 43s', machines: [{ id: 'm20', name: 'web-prod-01', status: 'Success' }] },
            { id: 't3-2', serverTaskId: 'ServerTasks-8861', projectName: 'Notification Service', releaseVersion: '3.1.0', taskType: 'Deployment', taskState: 'Success', startedAt: minsAgo(60), duration: '2m 18s', machines: [{ id: 'm21', name: 'notify-prod-01', status: 'Success' }] },
        ]
    },
    {
        id: 'tenant-4', tenantDisplayId: 'Tenants-1004',
        name: 'Umbrella Ltd', environment: 'Production',
        status: 'All succeeded', tags: ['Enterprise', 'EMEA', 'Regulated'],
        lastUpdated: hoursAgo(1),
        tasks: [
            { id: 't4-1', serverTaskId: 'ServerTasks-8870', projectName: 'Web API', releaseVersion: '2.3.9', taskType: 'Deployment', taskState: 'Success', startedAt: hoursAgo(1.5), duration: '11m 05s', machines: [{ id: 'm30', name: 'web-prod-01', status: 'Success' }, { id: 'm31', name: 'web-prod-02', status: 'Success' }] },
            { id: 't4-2', serverTaskId: 'ServerTasks-8871', projectName: 'Compliance Reporter', releaseVersion: '1.2.0', taskType: 'Runbook Run', taskState: 'Success', startedAt: hoursAgo(1.4), duration: '1m 44s', machines: [{ id: 'm32', name: 'compliance-prod-01', status: 'Success' }] },
        ]
    },
    {
        id: 'tenant-5', tenantDisplayId: 'Tenants-1005',
        name: 'Soylent Corp', environment: 'Staging',
        status: 'All succeeded', tags: ['Starter', 'Americas'],
        lastUpdated: minsAgo(5),
        tasks: [
            { id: 't5-1', serverTaskId: 'ServerTasks-8880', projectName: 'Web API', releaseVersion: '2.5.0', taskType: 'Deployment', taskState: 'Success', startedAt: minsAgo(12), duration: '5m 30s', machines: [{ id: 'm40', name: 'web-staging-01', status: 'Success' }] },
        ]
    },

    // ── Has failures ───────────────────────────────────────────────────────
    {
        id: 'tenant-6', tenantDisplayId: 'Tenants-1006',
        name: 'Stark Industries', environment: 'Production',
        status: 'Has failures', tags: ['Enterprise', 'Americas', 'High Priority'],
        lastUpdated: minsAgo(14),
        tasks: [
            { id: 't6-1', serverTaskId: 'ServerTasks-8891', projectName: 'Web API', releaseVersion: '2.4.1', taskType: 'Deployment', taskState: 'Failed', startedAt: minsAgo(26), duration: '12m 34s', errorMessage: 'Step "Deploy Web API" failed on 2 of 4 machines — connection timeout on web-prod-03 and web-prod-04', machines: [{ id: 'm50', name: 'web-prod-01', status: 'Success' }, { id: 'm51', name: 'web-prod-02', status: 'Success' }, { id: 'm52', name: 'web-prod-03', status: 'Failed' }, { id: 'm53', name: 'web-prod-04', status: 'Failed' }] },
            { id: 't6-2', serverTaskId: 'ServerTasks-8892', projectName: 'Database Migrator', releaseVersion: '2.4.0', taskType: 'Deployment', taskState: 'Success', startedAt: minsAgo(38), duration: '4m 07s', machines: [{ id: 'm54', name: 'db-prod-01', status: 'Success' }] },
            { id: 't6-3', serverTaskId: 'ServerTasks-8893', projectName: 'Background Worker', releaseVersion: '2.4.1', taskType: 'Deployment', taskState: 'Success', startedAt: minsAgo(32), duration: '8m 21s', machines: [{ id: 'm55', name: 'worker-prod-01', status: 'Success' }, { id: 'm56', name: 'worker-prod-02', status: 'Success' }, { id: 'm57', name: 'worker-prod-03', status: 'Success' }] },
        ]
    },
    {
        id: 'tenant-7', tenantDisplayId: 'Tenants-1007',
        name: 'Contoso Ltd', environment: 'Production',
        status: 'Has failures', tags: ['Enterprise', 'EMEA'],
        lastUpdated: minsAgo(31),
        tasks: [
            { id: 't7-1', serverTaskId: 'ServerTasks-8900', projectName: 'Auth Service', releaseVersion: '1.9.3', taskType: 'Deployment', taskState: 'Failed', startedAt: minsAgo(50), duration: '8m 02s', errorMessage: 'Health check endpoint returned 503 after deployment', machines: [{ id: 'm60', name: 'auth-prod-01', status: 'Failed' }, { id: 'm61', name: 'auth-prod-02', status: 'Success' }] },
            { id: 't7-2', serverTaskId: 'ServerTasks-8901', projectName: 'Web API', releaseVersion: '2.4.1', taskType: 'Deployment', taskState: 'Success', startedAt: minsAgo(55), duration: '6m 15s', machines: [{ id: 'm62', name: 'web-prod-01', status: 'Success' }] },
            { id: 't7-3', serverTaskId: 'ServerTasks-8902', projectName: 'Email Service', releaseVersion: '2.0.1', taskType: 'Deployment', taskState: 'TimedOut', startedAt: minsAgo(65), duration: '30m 00s', errorMessage: 'Deployment timed out after 30 minutes waiting for health check', machines: [{ id: 'm63', name: 'email-prod-01', status: 'Failed' }] },
        ]
    },
    {
        id: 'tenant-8', tenantDisplayId: 'Tenants-1008',
        name: 'Wonka Industries', environment: 'Production',
        status: 'Has failures', tags: ['SMB', 'EMEA'],
        lastUpdated: minsAgo(47),
        tasks: [
            { id: 't8-1', serverTaskId: 'ServerTasks-8910', projectName: 'Web API', releaseVersion: '2.4.1', taskType: 'Deployment', taskState: 'Canceled', startedAt: minsAgo(60), duration: '2m 11s', errorMessage: 'Deployment was canceled by operator', machines: [{ id: 'm70', name: 'web-prod-01', status: 'Failed' }] },
        ]
    },
    {
        id: 'tenant-9', tenantDisplayId: 'Tenants-1009',
        name: 'Weyland Corp', environment: 'Staging',
        status: 'Has failures', tags: ['Enterprise', 'Beta'],
        lastUpdated: minsAgo(19),
        tasks: [
            { id: 't9-1', serverTaskId: 'ServerTasks-8920', projectName: 'Data Pipeline', releaseVersion: '4.0.1', taskType: 'Deployment', taskState: 'Failed', startedAt: minsAgo(30), duration: '15m 44s', errorMessage: 'Database migration step failed: constraint violation on table users', machines: [{ id: 'm80', name: 'pipeline-staging-01', status: 'Failed' }, { id: 'm81', name: 'pipeline-staging-02', status: 'Failed' }] },
            { id: 't9-2', serverTaskId: 'ServerTasks-8921', projectName: 'Web API', releaseVersion: '4.0.1', taskType: 'Deployment', taskState: 'Success', startedAt: minsAgo(35), duration: '7m 02s', machines: [{ id: 'm82', name: 'web-staging-01', status: 'Success' }] },
        ]
    },

    // ── In progress ────────────────────────────────────────────────────────
    {
        id: 'tenant-10', tenantDisplayId: 'Tenants-1010',
        name: 'Cyberdyne Systems', environment: 'Production',
        status: 'In progress', tags: ['Enterprise', 'Americas', 'Managed'],
        lastUpdated: new Date(now.getTime() - 12 * 1000),
        tasks: [
            { id: 't10-1', serverTaskId: 'ServerTasks-8930', projectName: 'Web API', releaseVersion: '2.4.2', taskType: 'Deployment', taskState: 'Executing', startedAt: minsAgo(4), duration: '4m 12s', machines: [{ id: 'm90', name: 'web-prod-01', status: 'Executing' }, { id: 'm91', name: 'web-prod-02', status: 'Queued' }] },
            { id: 't10-2', serverTaskId: 'ServerTasks-8931', projectName: 'Database Migrator', releaseVersion: '2.4.1', taskType: 'Deployment', taskState: 'Queued', startedAt: minsAgo(1), duration: '–', machines: [{ id: 'm92', name: 'db-prod-01', status: 'Queued' }] },
            { id: 't10-3', serverTaskId: 'ServerTasks-8932', projectName: 'Background Worker', releaseVersion: '2.4.2', taskType: 'Deployment', taskState: 'Success', startedAt: minsAgo(18), duration: '8m 55s', machines: [{ id: 'm93', name: 'worker-prod-01', status: 'Success' }, { id: 'm94', name: 'worker-prod-02', status: 'Success' }] },
        ]
    },
    {
        id: 'tenant-11', tenantDisplayId: 'Tenants-1011',
        name: 'Initrode Global', environment: 'Production',
        status: 'In progress', tags: ['SMB', 'APAC'],
        lastUpdated: new Date(now.getTime() - 8 * 1000),
        tasks: [
            { id: 't11-1', serverTaskId: 'ServerTasks-8940', projectName: 'Auth Service', releaseVersion: '1.9.4', taskType: 'Deployment', taskState: 'Executing', startedAt: minsAgo(6), duration: '6m 03s', machines: [{ id: 'm100', name: 'auth-prod-01', status: 'Executing' }] },
            { id: 't11-2', serverTaskId: 'ServerTasks-8941', projectName: 'Web API', releaseVersion: '2.4.2', taskType: 'Deployment', taskState: 'Queued', startedAt: minsAgo(2), duration: '–', machines: [{ id: 'm101', name: 'web-prod-01', status: 'Queued' }, { id: 'm102', name: 'web-prod-02', status: 'Queued' }] },
        ]
    },
    {
        id: 'tenant-12', tenantDisplayId: 'Tenants-1012',
        name: 'Delos Incorporated', environment: 'Staging',
        status: 'In progress', tags: ['Enterprise', 'Americas', 'Beta'],
        lastUpdated: new Date(now.getTime() - 3 * 1000),
        tasks: [
            { id: 't12-1', serverTaskId: 'ServerTasks-8950', projectName: 'Web API', releaseVersion: '3.0.0', taskType: 'Deployment', taskState: 'Cancelling', startedAt: minsAgo(8), duration: '8m 14s', machines: [{ id: 'm110', name: 'web-staging-01', status: 'Executing' }] },
            { id: 't12-2', serverTaskId: 'ServerTasks-8951', projectName: 'ML Inference', releaseVersion: '1.0.0', taskType: 'Deployment', taskState: 'Queued', startedAt: minsAgo(1), duration: '–', machines: [{ id: 'm111', name: 'ml-staging-01', status: 'Queued' }] },
        ]
    },
];

/* ─── App state ──────────────────────────────────────────────────────────── */

const state = {
    allTenants: [],          // raw (mock or API) tenant data
    filteredTenants: [],     // after applying all filters
    activeTab: 'all',        // current status tab
    searchQuery: '',         // tenant name search
    expandedIds: new Set(),  // expanded tenant IDs
    failuresOnlyIds: new Set(), // tenants with "failures only" active
    errorExpandedIds: new Set(), // task IDs with error row expanded
    retriedTaskIds: new Set(),   // task IDs that have been retried
    showFilters: false,

    filters: {
        environment: '',
        projects: [],        // empty = all
        taskTypes: ['Deployment', 'Runbook Run'],
        dateFrom: null,
        dateTo: null,
    },

    spaces: [],
    environments: [],
    projects: [],

    countdownValue: 60,
    countdownTimer: null,
    pollingTimer: null,
    elapsedTimer: null,
    elapsedStart: null,
};

/* ─── Initialisation ─────────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
    // Fallback for opening outside extension context (e.g. direct file:// preview)
    if (typeof dashboardGetConfig === 'undefined' || typeof chrome === 'undefined') {
        initDashboard(null);
        return;
    }
    dashboardGetConfig(config => {
        if (!config || !config.lastServerUrl) {
            // No server URL configured — fall back to mock data for UI preview
            initDashboard(null);
            return;
        }
        initDashboard(config.lastServerUrl);
    });
});

async function initDashboard(serverUrl) {
    state.serverUrl = serverUrl;

    const spacesSelect = document.getElementById('spaces-select');

    try {
        let spaces;
        if (serverUrl) {
            spaces = await fetchFromOctopus(serverUrl, '/api/spaces/all');
        } else {
            spaces = [{ Id: 'mock-space', Name: 'Mock Data Preview' }];
        }

        state.spaces = spaces;
        spacesSelect.innerHTML = spaces.map(s =>
            `<option value="${s.Id}">${s.Name}</option>`
        ).join('');

        if (spaces.length > 0) {
            await onSpaceChange(spaces[0].Id);
        }
    } catch (err) {
        showError('Failed to load spaces: ' + err.message);
    }

    spacesSelect.addEventListener('change', () => {
        if (spacesSelect.value) onSpaceChange(spacesSelect.value);
    });

    wireUpControls();
}

function showLoading(visible) {
    // loading-state lives inside tenant-rows and gets replaced by render() —
    // null-check guards against accessing it after that happens
    const el = document.getElementById('loading-state');
    if (el) el.style.display = visible ? 'block' : 'none';
}

async function onSpaceChange(spaceId) {
    state.spaceId = spaceId;
    document.getElementById('dashboard-content').classList.remove('hidden');
    showLoading(true);

    try {
        let envs, rawProjects, rawTenants, tenants;

        if (!state.serverUrl) {
            // No server URL — use mock data for UI preview
            envs = [
                { Id: 'Environments-1', Name: 'Production' },
                { Id: 'Environments-2', Name: 'Staging' },
                { Id: 'Environments-3', Name: 'UAT' },
            ];
            rawProjects = [...new Set(MOCK_TENANTS.flatMap(t => t.tasks.map(tk => tk.projectName)))].sort().map(n => ({ Id: n, Name: n }));
            tenants = MOCK_TENANTS;
        } else {
            // Real API: fetch reference data and recent deployment activity in parallel
            const [rawEnvs, projectList, tenantList, deploymentsData, tasksData] = await Promise.all([
                fetchFromOctopus(state.serverUrl, `/api/${spaceId}/environments/all`),
                fetchFromOctopus(state.serverUrl, `/api/${spaceId}/projects/all`),
                fetchFromOctopus(state.serverUrl, `/api/${spaceId}/tenants/all`),
                fetchFromOctopus(state.serverUrl, `/api/${spaceId}/deployments?take=200`),
                fetchFromOctopus(state.serverUrl, `/api/${spaceId}/tasks?skip=0&take=200`),
            ]);

            envs = rawEnvs;
            rawProjects = projectList;
            rawTenants = tenantList;

            // Build lookup maps
            const envMap = {};
            rawEnvs.forEach(e => envMap[e.Id] = e.Name);

            const projectMap = {};
            projectList.forEach(p => projectMap[p.Id] = p.Name);

            // Index tasks by ID for O(1) lookup
            const taskMap = {};
            (tasksData.Items || tasksData).forEach(t => taskMap[t.Id] = t);

            // Group deployments by TenantId
            const tenantDeployments = {};
            (deploymentsData.Items || deploymentsData).forEach(dep => {
                if (!dep.TenantId) return;
                if (!tenantDeployments[dep.TenantId]) tenantDeployments[dep.TenantId] = [];
                tenantDeployments[dep.TenantId].push(dep);
            });

            // Build tenant objects — only include tenants with recent deployments
            tenants = rawTenants
                .map(apiTenant => {
                    const deps = tenantDeployments[apiTenant.Id] || [];
                    const tasks = deps.map(dep => {
                        const task = taskMap[dep.TaskId];
                        if (!task) return null;
                        return {
                            id: dep.Id,
                            serverTaskId: dep.TaskId,
                            projectName: projectMap[dep.ProjectId] || dep.ProjectId || 'Unknown project',
                            releaseVersion: dep.ReleaseVersion || dep.ReleaseId || '–',
                            taskType: task.Name === 'RunbookRun' ? 'Runbook Run' : 'Deployment',
                            taskState: task.State || 'Unknown',
                            startedAt: task.StartTime ? new Date(task.StartTime) : new Date(),
                            duration: task.Duration || '–',
                            machines: [],
                            errorMessage: task.ErrorMessage || undefined,
                        };
                    }).filter(Boolean);

                    if (tasks.length === 0) return null;

                    const status = deriveTenantStatus(tasks);
                    // TenantTags is { "TagSetId": ["TagSetId/TagId", ...] } — flatten to readable names
                    const tags = Object.values(apiTenant.TenantTags || {})
                        .flat()
                        .map(t => t.split('/').pop());

                    const firstDep = tenantDeployments[apiTenant.Id][0];
                    const envName = firstDep ? (envMap[firstDep.EnvironmentId] || firstDep.EnvironmentId || '') : '';

                    return {
                        id: apiTenant.Id,
                        tenantDisplayId: apiTenant.Id,
                        name: apiTenant.Name,
                        environment: envName,
                        status,
                        tags,
                        tasks,
                        projectCount: tasks.length,
                        taskCount: tasks.length,
                        lastUpdated: new Date(Math.max(...tasks.map(t => t.startedAt.getTime()))),
                    };
                })
                .filter(Boolean);
        }

        state.environments = envs;
        state.projects = rawProjects.map(p => p.Name || p);
        state.allTenants = tenants;

        populateEnvironmentFilter(envs);
        populateProjectsFilter(state.projects);
        setDefaultDateRange();

        state.elapsedStart = new Date();

        applyFilters();
        render();
        showLoading(false);

        startPolling();
        startElapsedTimer();

    } catch (err) {
        showError('Failed to load data: ' + err.message);
        showLoading(false);
    }
}

function deriveTenantStatus(tasks) {
    if (tasks.some(t => t.taskState === 'Failed' || t.taskState === 'TimedOut' || t.taskState === 'Canceled')) {
        return 'Has failures';
    }
    if (tasks.some(t => t.taskState === 'Executing' || t.taskState === 'Queued' || t.taskState === 'Cancelling')) {
        return 'In progress';
    }
    return 'All succeeded';
}

/* ─── Controls wiring ────────────────────────────────────────────────────── */

function wireUpControls() {
    // Search
    document.getElementById('tenant-search').addEventListener('input', e => {
        state.searchQuery = e.target.value;
        applyFilters();
        renderTenantRows();
        renderStats();
    });

    // Filter toggle
    document.getElementById('filter-toggle-btn').addEventListener('click', () => {
        state.showFilters = !state.showFilters;
        document.getElementById('advanced-filters').classList.toggle('hidden', !state.showFilters);
        document.getElementById('filter-toggle-label').textContent =
            state.showFilters ? 'Hide filters' : 'Show advanced filters';
    });

    // Export CSV
    document.getElementById('export-csv-btn').addEventListener('click', exportCSV);

    // Status tabs
    document.getElementById('status-tabs').addEventListener('click', e => {
        const tab = e.target.closest('[data-filter]');
        if (!tab) return;
        state.activeTab = tab.dataset.filter;
        state.expandedIds.clear();
        document.querySelectorAll('.status-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        applyFilters();
        renderTenantRows();
    });

    // Environment filter
    document.getElementById('environment-select').addEventListener('change', e => {
        state.filters.environment = e.target.value;
        applyFilters();
        renderTenantRows();
        renderStats();
    });

    // Task type checkboxes
    document.getElementById('type-deployment').addEventListener('change', updateTaskTypeFilter);
    document.getElementById('type-runbook').addEventListener('change', updateTaskTypeFilter);

    // Date range
    document.getElementById('date-from').addEventListener('change', updateDateFilter);
    document.getElementById('date-to').addEventListener('change', updateDateFilter);

    // Projects multi-select toggle
    document.getElementById('projects-trigger').addEventListener('click', e => {
        e.stopPropagation();
        document.getElementById('projects-menu').classList.toggle('hidden');
    });

    document.addEventListener('click', e => {
        if (!document.getElementById('projects-multiselect').contains(e.target)) {
            document.getElementById('projects-menu').classList.add('hidden');
        }
    });
}

function updateTaskTypeFilter() {
    const types = [];
    if (document.getElementById('type-deployment').checked) types.push('Deployment');
    if (document.getElementById('type-runbook').checked) types.push('Runbook Run');
    state.filters.taskTypes = types;
    applyFilters();
    renderTenantRows();
    renderStats();
}

function updateDateFilter() {
    const from = document.getElementById('date-from').value;
    const to = document.getElementById('date-to').value;
    state.filters.dateFrom = from ? new Date(from) : null;
    state.filters.dateTo = to ? new Date(to + 'T23:59:59') : null;
    applyFilters();
    renderTenantRows();
    renderStats();
}

/* ─── Filter population ──────────────────────────────────────────────────── */

function populateEnvironmentFilter(envs) {
    const select = document.getElementById('environment-select');
    select.innerHTML = '<option value="">All environments</option>' +
        envs.map(e => `<option value="${e.Name}">${e.Name}</option>`).join('');
}

function populateProjectsFilter(projects) {
    const container = document.getElementById('projects-options');
    container.innerHTML = `
        <button class="multiselect__all-option" id="projects-all-option">
            <span id="all-projects-check">☑</span> All projects
        </button>
        ${projects.map(p => `
            <button class="multiselect__option" data-project="${escHtml(p)}">
                <input type="checkbox" checked class="projects-checkbox" data-project="${escHtml(p)}" style="pointer-events:none"> ${escHtml(p)}
            </button>
        `).join('')}
    `;

    container.addEventListener('click', e => {
        const allBtn = e.target.closest('#projects-all-option');
        const optBtn = e.target.closest('.multiselect__option');

        if (allBtn) {
            state.filters.projects = [];
            updateProjectCheckboxes();
            applyFilters();
            renderTenantRows();
            renderStats();
        } else if (optBtn) {
            const proj = optBtn.dataset.project;
            const idx = state.filters.projects.indexOf(proj);
            if (idx === -1) {
                state.filters.projects.push(proj);
            } else {
                state.filters.projects.splice(idx, 1);
            }
            // If all projects are now selected, revert to "all" mode
            if (state.filters.projects.length === projects.length) {
                state.filters.projects = [];
            }
            updateProjectCheckboxes();
            applyFilters();
            renderTenantRows();
            renderStats();
        }
    });
}

function updateProjectCheckboxes() {
    const allSelected = state.filters.projects.length === 0;
    const trigger = document.getElementById('projects-trigger');

    // Update trigger label
    if (allSelected) {
        trigger.innerHTML = 'All projects <i class="fas fa-chevron-down multiselect__caret"></i>';
    } else if (state.filters.projects.length === 1) {
        trigger.innerHTML = `${escHtml(state.filters.projects[0])} <i class="fas fa-chevron-down multiselect__caret"></i>`;
    } else {
        trigger.innerHTML = `${state.filters.projects.length} projects <i class="fas fa-chevron-down multiselect__caret"></i>`;
    }

    // Update checkboxes
    document.querySelectorAll('.projects-checkbox').forEach(cb => {
        const proj = cb.dataset.project;
        cb.checked = allSelected || state.filters.projects.includes(proj);
    });
}

function setDefaultDateRange() {
    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    document.getElementById('date-from').value = formatDateInput(yesterday);
    document.getElementById('date-to').value = formatDateInput(today);
    state.filters.dateFrom = yesterday;
    state.filters.dateTo = today;
}

/* ─── Filtering ──────────────────────────────────────────────────────────── */

function applyFilters() {
    let list = state.allTenants.filter(tenant => {
        // Environment
        if (state.filters.environment && tenant.environment !== state.filters.environment) return false;

        // Task types
        if (state.filters.taskTypes.length > 0) {
            const hasMatchingType = tenant.tasks.some(t => state.filters.taskTypes.includes(t.taskType));
            if (!hasMatchingType) return false;
        }

        // Projects
        if (state.filters.projects.length > 0) {
            const hasMatchingProject = tenant.tasks.some(t => state.filters.projects.includes(t.projectName));
            if (!hasMatchingProject) return false;
        }

        return true;
    });

    // Tenant name search
    if (state.searchQuery.trim()) {
        const q = state.searchQuery.toLowerCase();
        list = list.filter(t => t.name.toLowerCase().includes(q));
    }

    // Status tab
    if (state.activeTab !== 'all') {
        list = list.filter(t => t.status === state.activeTab);
    }

    state.filteredTenants = list;
}

/* ─── Stats calculation ──────────────────────────────────────────────────── */

function calculateStats(tenants) {
    const total = tenants.length;
    const succeeded = tenants.filter(t => t.status === 'All succeeded').length;
    const failures = tenants.filter(t => t.status === 'Has failures').length;
    const inProgress = tenants.filter(t => t.status === 'In progress').length;
    const resolved = succeeded + failures;
    const pct = total > 0 ? Math.round((resolved / total) * 100) : 0;

    // Time elapsed from earliest in-progress task
    let maxElapsedMs = 0;
    tenants.forEach(tenant => {
        tenant.tasks.forEach(task => {
            if (task.taskState === 'Executing' || task.taskState === 'Queued') {
                const elapsed = now.getTime() - task.startedAt.getTime();
                if (elapsed > maxElapsedMs) maxElapsedMs = elapsed;
            }
        });
    });

    const hrs = Math.floor(maxElapsedMs / 3600000);
    const mins = Math.floor((maxElapsedMs % 3600000) / 60000);
    const timeElapsed = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;

    return { total, succeeded, failures, inProgress, resolved, pct, timeElapsed };
}

/* ─── Render ─────────────────────────────────────────────────────────────── */

function render() {
    renderStats();
    renderTenantRows();
}

function renderStats() {
    // Use ALL tenants (pre-tab-filter) for stats but respect search + env + project filters
    const allFiltered = getPreTabFilteredTenants();
    const s = calculateStats(allFiltered);

    document.getElementById('stat-total').textContent = s.total;
    document.getElementById('stat-succeeded').textContent = s.succeeded;
    document.getElementById('stat-failures').textContent = s.failures;
    document.getElementById('stat-inprogress').textContent = s.inProgress;

    document.getElementById('progress-pct').textContent = s.pct + '%';
    document.getElementById('progress-fill').style.width = s.pct + '%';
    document.getElementById('progress-resolved').textContent = `${s.resolved} of ${s.total} resolved`;

    const timeCard = document.getElementById('time-card');
    if (s.inProgress > 0) {
        timeCard.classList.remove('hidden');
        document.getElementById('time-elapsed').textContent = s.timeElapsed;
    } else {
        timeCard.classList.add('hidden');
    }

    // Tab counts
    document.getElementById('tab-all').textContent = allFiltered.length;
    document.getElementById('tab-succeeded').textContent = allFiltered.filter(t => t.status === 'All succeeded').length;
    document.getElementById('tab-failures').textContent = allFiltered.filter(t => t.status === 'Has failures').length;
    document.getElementById('tab-inprogress').textContent = allFiltered.filter(t => t.status === 'In progress').length;
}

function getPreTabFilteredTenants() {
    // Apply all filters except the status tab
    return state.allTenants.filter(tenant => {
        if (state.filters.environment && tenant.environment !== state.filters.environment) return false;
        if (state.filters.taskTypes.length > 0) {
            const hasMatchingType = tenant.tasks.some(t => state.filters.taskTypes.includes(t.taskType));
            if (!hasMatchingType) return false;
        }
        if (state.filters.projects.length > 0) {
            const hasMatchingProject = tenant.tasks.some(t => state.filters.projects.includes(t.projectName));
            if (!hasMatchingProject) return false;
        }
        if (state.searchQuery.trim()) {
            const q = state.searchQuery.toLowerCase();
            if (!tenant.name.toLowerCase().includes(q)) return false;
        }
        return true;
    });
}

function renderTenantRows() {
    const container = document.getElementById('tenant-rows');
    const emptyState = document.getElementById('empty-state');

    if (state.filteredTenants.length === 0) {
        container.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
    }

    emptyState.classList.add('hidden');

    // Re-render each tenant row
    const html = state.filteredTenants.map(tenant => renderTenantRowHtml(tenant)).join('');
    container.innerHTML = html;

    // Wire up click handlers
    container.querySelectorAll('.tenant-row-header').forEach(btn => {
        btn.addEventListener('click', () => toggleExpand(btn.dataset.tenantId));
    });
}

function renderTenantRowHtml(tenant) {
    const isExpanded = state.expandedIds.has(tenant.id);
    const totalMachines = tenant.tasks.reduce((sum, t) => sum + t.machines.length, 0);

    const chevron = isExpanded
        ? '<i class="fas fa-chevron-down"></i>'
        : '<i class="fas fa-chevron-right"></i>';

    const statusBadge = renderStatusBadge(tenant.status);

    const tags = tenant.tags.map(tag =>
        `<span class="tag-chip">${escHtml(tag)}</span>`
    ).join('');

    const header = `
        <button class="tenant-row-header ${isExpanded ? 'is-expanded' : ''}" data-tenant-id="${tenant.id}">
            <div class="tenant-row-header__chevron">${chevron}</div>
            <div>
                <span class="tenant-row-header__name">${escHtml(tenant.name)}</span>
                <span class="tenant-row-header__display-id">(${escHtml(tenant.tenantDisplayId)})</span>
            </div>
            <div class="tenant-row-header__tags">${tags}</div>
            <div>${statusBadge}</div>
            <div class="tenant-row-header__count">${tenant.tasks.length}</div>
            <div class="tenant-row-header__count">${tenant.tasks.length}</div>
            <div class="tenant-row-header__count">${totalMachines}</div>
            <div class="tenant-row-header__updated">${formatRelativeTime(tenant.lastUpdated)}</div>
        </button>
    `;

    const detail = isExpanded ? renderTenantDetailHtml(tenant) : '';

    return header + detail;
}

/* ─── Tenant detail ──────────────────────────────────────────────────────── */

function renderTenantDetailHtml(tenant) {
    const failureCount = tenant.tasks.filter(t =>
        t.taskState === 'Failed' || t.taskState === 'TimedOut' || t.taskState === 'Canceled'
    ).length;

    const failuresOnly = state.failuresOnlyIds.has(tenant.id);
    const failuresOnlyActive = failuresOnly ? 'active' : '';

    const detailSearch = state.detailSearchQueries && state.detailSearchQueries[tenant.id] || '';

    let visibleTasks = tenant.tasks;
    if (failuresOnly) {
        visibleTasks = visibleTasks.filter(t =>
            t.taskState === 'Failed' || t.taskState === 'TimedOut' || t.taskState === 'Canceled'
        );
    }
    if (detailSearch.trim()) {
        const q = detailSearch.toLowerCase();
        visibleTasks = visibleTasks.filter(t => t.projectName.toLowerCase().includes(q));
    }

    const failureCountLabel = failureCount > 0
        ? `<span class="detail-toolbar__failure-count">(${failureCount} failed)</span>`
        : '';

    const failuresOnlyBtn = failureCount > 0 ? `
        <button class="failures-only-btn ${failuresOnlyActive}" data-action="toggle-failures-only" data-tenant-id="${tenant.id}">
            <i class="fas fa-filter"></i> Failures only
        </button>
    ` : '';

    const rows = visibleTasks.length === 0
        ? `<tr><td colspan="9" class="task-table__empty">No projects match the current filter.</td></tr>`
        : visibleTasks.map(task => renderTaskRowHtml(tenant, task)).join('');

    const detail = `
        <div class="tenant-detail" data-detail-for="${tenant.id}">
            <div class="detail-toolbar">
                <span class="detail-toolbar__name">${escHtml(tenant.name)}</span>
                <span class="detail-toolbar__meta">(${escHtml(tenant.tenantDisplayId)})</span>
                <span class="detail-toolbar__meta">— ${escHtml(tenant.environment)}</span>
                <span class="detail-toolbar__meta">${tenant.tasks.length} project${tenant.tasks.length !== 1 ? 's' : ''}</span>
                ${failureCountLabel}
                <div class="detail-toolbar__actions">
                    ${failuresOnlyBtn}
                    <div class="detail-search-wrap">
                        <i class="fas fa-search detail-search-icon"></i>
                        <input type="text" class="detail-search-input" placeholder="Filter projects..."
                            data-tenant-id="${tenant.id}" value="${escHtml(detailSearch)}">
                    </div>
                </div>
            </div>
            <table class="task-table">
                <thead>
                    <tr>
                        <th>Project</th>
                        <th>Server Task</th>
                        <th>Release</th>
                        <th>Type</th>
                        <th>State</th>
                        <th>Started</th>
                        <th>Duration</th>
                        <th>Machines</th>
                        <th class="col-right">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        </div>
    `;

    // Wire up handlers after next tick (DOM needs to exist first)
    setTimeout(() => wireDetailHandlers(tenant.id), 0);

    return detail;
}

function renderTaskRowHtml(tenant, task) {
    const hasError = !!task.errorMessage;
    const isErrorExpanded = state.errorExpandedIds.has(task.id);
    const isRetried = state.retriedTaskIds.has(task.id);
    const canRetry = !isRetried && (task.taskState === 'Failed' || task.taskState === 'Canceled' || task.taskState === 'TimedOut');
    const confirming = state.confirmingRetryId === task.id;

    const rowClass = (task.taskState === 'Failed' || task.taskState === 'TimedOut')
        ? 'task-row--failed'
        : task.taskState === 'Executing' || task.taskState === 'Cancelling'
        ? 'task-row--executing'
        : '';

    const errorIcon = hasError
        ? `<i class="fas fa-exclamation-triangle task-error-icon" data-action="toggle-error" data-task-id="${task.id}"></i>`
        : '';

    const successMachines = task.machines.filter(m => m.status === 'Success').length;
    const failedMachines = task.machines.filter(m => m.status === 'Failed').length;
    const totalMachines = task.machines.length;
    const machineClass = failedMachines > 0 ? 'machines-count--failures' : '';
    const machineLabel = `${successMachines}/${totalMachines}${failedMachines > 0 ? ` (${failedMachines} failed)` : ''}`;

    let actionCell;
    if (isRetried) {
        actionCell = `<span class="retry-queued"><i class="fas fa-spinner fa-spin"></i> Queued</span>`;
    } else if (confirming) {
        actionCell = `
            <span class="retry-confirm">
                <span class="retry-confirm__text">Retry?</span>
                <button class="btn btn--primary btn--sm" data-action="confirm-retry" data-task-id="${task.id}" data-tenant-id="${tenant.id}">Confirm</button>
                <button class="btn btn--ghost btn--sm" data-action="cancel-retry" data-task-id="${task.id}">Cancel</button>
            </span>
        `;
    } else if (canRetry) {
        actionCell = `
            <button class="retry-btn" data-action="start-retry" data-task-id="${task.id}">
                <i class="fas fa-redo"></i> Retry
            </button>
        `;
    } else {
        actionCell = '';
    }

    const mainRow = `
        <tr class="${rowClass}" data-task-id="${task.id}">
            <td>
                ${errorIcon}
                <strong>${escHtml(task.projectName)}</strong>
            </td>
            <td class="col-mono">${escHtml(task.serverTaskId)}</td>
            <td class="col-mono">${escHtml(task.releaseVersion)}</td>
            <td style="color:#718096">${escHtml(task.taskType)}</td>
            <td>${renderTaskBadge(task.taskState)}</td>
            <td style="color:#718096;white-space:nowrap;font-size:12px">${formatDateTime(task.startedAt)}</td>
            <td class="col-mono">${escHtml(task.duration)}</td>
            <td><span class="machines-count ${machineClass}">${machineLabel}</span></td>
            <td class="col-right">${actionCell}</td>
        </tr>
    `;

    const errorRow = (hasError && isErrorExpanded) ? `
        <tr class="task-error-row">
            <td colspan="9">
                <div class="task-error-msg">
                    <i class="fas fa-exclamation-triangle" style="color:#fc8181;flex-shrink:0;margin-top:1px"></i>
                    <span>${escHtml(task.errorMessage)}</span>
                </div>
            </td>
        </tr>
    ` : '';

    return mainRow + errorRow;
}

function wireDetailHandlers(tenantId) {
    const detail = document.querySelector(`[data-detail-for="${tenantId}"]`);
    if (!detail) return;

    // Failures only toggle
    detail.addEventListener('click', e => {
        const btn = e.target.closest('[data-action="toggle-failures-only"]');
        if (btn) {
            const tid = btn.dataset.tenantId;
            if (state.failuresOnlyIds.has(tid)) {
                state.failuresOnlyIds.delete(tid);
            } else {
                state.failuresOnlyIds.add(tid);
            }
            refreshDetail(tid);
        }
    });

    // Error toggle
    detail.addEventListener('click', e => {
        const icon = e.target.closest('[data-action="toggle-error"]');
        if (icon) {
            const tid = icon.dataset.taskId;
            if (state.errorExpandedIds.has(tid)) {
                state.errorExpandedIds.delete(tid);
            } else {
                state.errorExpandedIds.add(tid);
            }
            refreshDetail(tenantId);
        }
    });

    // Retry actions
    detail.addEventListener('click', e => {
        const startBtn = e.target.closest('[data-action="start-retry"]');
        if (startBtn) {
            state.confirmingRetryId = startBtn.dataset.taskId;
            refreshDetail(tenantId);
            return;
        }
        const confirmBtn = e.target.closest('[data-action="confirm-retry"]');
        if (confirmBtn) {
            state.retriedTaskIds.add(confirmBtn.dataset.taskId);
            state.confirmingRetryId = null;
            refreshDetail(tenantId);
            return;
        }
        const cancelBtn = e.target.closest('[data-action="cancel-retry"]');
        if (cancelBtn) {
            state.confirmingRetryId = null;
            refreshDetail(tenantId);
        }
    });

    // Detail project search
    const searchInput = detail.querySelector('.detail-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', e => {
            if (!state.detailSearchQueries) state.detailSearchQueries = {};
            state.detailSearchQueries[tenantId] = e.target.value;
            refreshDetail(tenantId);
        });
        // Keep focus after re-render
        searchInput.focus();
    }
}

function refreshDetail(tenantId) {
    const detail = document.querySelector(`[data-detail-for="${tenantId}"]`);
    if (!detail) return;
    const tenant = state.allTenants.find(t => t.id === tenantId);
    if (!tenant) return;
    const newHtml = renderTenantDetailHtml(tenant);
    const temp = document.createElement('div');
    temp.innerHTML = newHtml;
    detail.replaceWith(temp.firstElementChild);
}

/* ─── Expand / collapse ──────────────────────────────────────────────────── */

function toggleExpand(tenantId) {
    if (state.expandedIds.has(tenantId)) {
        state.expandedIds.delete(tenantId);
        state.failuresOnlyIds.delete(tenantId);
        if (state.detailSearchQueries) delete state.detailSearchQueries[tenantId];
    } else {
        state.expandedIds.add(tenantId);
        // Auto-enable failures-only for tenants with failures
        const tenant = state.allTenants.find(t => t.id === tenantId);
        if (tenant && tenant.status === 'Has failures') {
            state.failuresOnlyIds.add(tenantId);
        }
    }
    renderTenantRows();
}

/* ─── Status and task badges ─────────────────────────────────────────────── */

function renderStatusBadge(status) {
    const cfg = {
        'All succeeded': { cls: 'status-badge--succeeded', icon: 'fa-check-circle', label: 'All succeeded' },
        'Has failures':  { cls: 'status-badge--failures',  icon: 'fa-times-circle', label: 'Has failures' },
        'In progress':   { cls: 'status-badge--inprogress', icon: 'fa-clock',        label: 'In progress' },
    };
    const { cls, icon, label } = cfg[status] || cfg['All succeeded'];
    return `<span class="status-badge ${cls}"><i class="fas ${icon}"></i> ${label}</span>`;
}

function renderTaskBadge(state) {
    const cfg = {
        Success:    { cls: 'task-badge--success',    icon: 'fa-check-circle',    label: 'Success' },
        Failed:     { cls: 'task-badge--failed',     icon: 'fa-times-circle',    label: 'Failed' },
        Executing:  { cls: 'task-badge--executing',  icon: 'fa-clock',           label: 'Executing' },
        Queued:     { cls: 'task-badge--queued',     icon: 'fa-circle',          label: 'Queued' },
        Canceled:   { cls: 'task-badge--canceled',   icon: 'fa-times-circle',    label: 'Canceled' },
        TimedOut:   { cls: 'task-badge--timedout',   icon: 'fa-clock',           label: 'Timed Out' },
        Cancelling: { cls: 'task-badge--cancelling', icon: 'fa-clock',           label: 'Cancelling' },
    };
    const c = cfg[state] || cfg.Queued;
    return `<span class="task-badge ${c.cls}"><i class="fas ${c.icon}"></i> ${c.label}</span>`;
}

/* ─── Polling ────────────────────────────────────────────────────────────── */

function startPolling() {
    if (state.countdownTimer) clearInterval(state.countdownTimer);

    state.countdownValue = 60;
    updateCountdown();

    state.countdownTimer = setInterval(() => {
        state.countdownValue--;
        updateCountdown();

        if (state.countdownValue <= 0) {
            state.countdownValue = 60;
            refreshData();
        }
    }, 1000);
}

function updateCountdown() {
    const el = document.getElementById('countdown');
    if (el) el.textContent = state.countdownValue;
}

function refreshData() {
    // TODO: In real implementation, re-fetch task states from API here.
    // For now, just re-render with existing data.
    applyFilters();
    render();
}

function startElapsedTimer() {
    if (state.elapsedTimer) clearInterval(state.elapsedTimer);
    state.elapsedTimer = setInterval(() => {
        const s = calculateStats(state.filteredTenants);
        if (s.inProgress > 0) {
            document.getElementById('time-elapsed').textContent = s.timeElapsed;
        }
    }, 30000);
}

/* ─── CSV export ─────────────────────────────────────────────────────────── */

function exportCSV() {
    const tenants = state.filteredTenants;
    if (tenants.length === 0) return;

    const headers = ['Tenant', 'Tenant Display ID', 'Environment', 'Project', 'Release Version', 'Task Type', 'Task State', 'Machine Count', 'Failed Machines', 'Last Updated'];

    const rows = [];
    tenants.forEach(tenant => {
        tenant.tasks.forEach(task => {
            const failedMachines = task.machines.filter(m => m.status === 'Failed').map(m => m.name).join('; ');
            rows.push([
                tenant.name,
                tenant.tenantDisplayId,
                tenant.environment,
                task.projectName,
                task.releaseVersion,
                task.taskType,
                task.taskState,
                task.machines.length,
                failedMachines || 'None',
                formatDateTime(tenant.lastUpdated),
            ]);
        });
    });

    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(v => {
            const s = String(v);
            return (s.includes(',') || s.includes('"') || s.includes('\n'))
                ? `"${s.replace(/"/g, '""')}"`
                : s;
        }).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tenant-deployments-${formatDateInput(new Date())}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/* ─── API helper ─────────────────────────────────────────────────────────── */

async function fetchFromOctopus(serverUrl, endpoint) {
    const response = await fetch(new URL(endpoint, serverUrl), {
        method: 'GET',
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
    });
    if (response.status === 401 || response.status === 403) {
        throw new Error('Authentication failed. Please sign in to Octopus Deploy.');
    }
    if (!response.ok) {
        throw new Error(`API call failed: ${response.status} ${response.statusText}`);
    }
    return response.json();
}

/* ─── Utilities ──────────────────────────────────────────────────────────── */

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatRelativeTime(date) {
    const diffMs = Date.now() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    if (diffSecs < 60) return `${diffSecs}s ago`;
    const diffMins = Math.floor(diffSecs / 60);
    if (diffMins < 60) return `${diffMins} min${diffMins !== 1 ? 's' : ''} ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs} hr${diffHrs !== 1 ? 's' : ''} ago`;
    return `${Math.floor(diffHrs / 24)}d ago`;
}

function formatDateTime(date) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    return `${months[date.getMonth()]} ${date.getDate()}, ${h}:${m}`;
}

function formatDateInput(date) {
    return date.toISOString().slice(0, 10);
}

function showError(msg) {
    const banner = document.getElementById('error-banner');
    banner.textContent = msg;
    banner.classList.remove('hidden');
}
