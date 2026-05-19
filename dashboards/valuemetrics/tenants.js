/* ==========================================================================
   TenantView — Multi-Tenanted Deployment Dashboard
   Ported from lucy.spence@octopus.com's tenantsdashboard prototype (PR #17).
   Adapted to run inside the valuemetrics SPA using OctopusApi for data access.
   ========================================================================== */

const TenantView = (() => {
    'use strict';

    /* ─── Mock data ──────────────────────────────────────────────────────── */

    function _minsAgo(n) { return new Date(Date.now() - n * 60 * 1000); }
    function _hoursAgo(n) { return new Date(Date.now() - n * 60 * 60 * 1000); }

    const MOCK_TENANTS = [
        {
            id: 'tenant-1', tenantDisplayId: 'Tenants-1001',
            name: 'Acme Corp', environment: 'Production',
            status: 'All succeeded', tags: ['Enterprise', 'Americas'],
            lastUpdated: _minsAgo(2),
            tasks: [
                { id: 't1-1', serverTaskId: 'ServerTasks-8841', projectName: 'Web API', releaseVersion: '2.4.1', taskType: 'Deployment', taskState: 'Success', startedAt: _minsAgo(14), duration: '6m 22s', machines: [{ id: 'm1', name: 'web-prod-01', status: 'Success' }, { id: 'm2', name: 'web-prod-02', status: 'Success' }] },
                { id: 't1-2', serverTaskId: 'ServerTasks-8842', projectName: 'Database Migrator', releaseVersion: '2.4.0', taskType: 'Deployment', taskState: 'Success', startedAt: _minsAgo(22), duration: '4m 07s', machines: [{ id: 'm3', name: 'db-prod-01', status: 'Success' }] },
                { id: 't1-3', serverTaskId: 'ServerTasks-8843', projectName: 'Background Worker', releaseVersion: '2.4.1', taskType: 'Deployment', taskState: 'Success', startedAt: _minsAgo(18), duration: '8m 21s', machines: [{ id: 'm4', name: 'worker-prod-01', status: 'Success' }, { id: 'm5', name: 'worker-prod-02', status: 'Success' }, { id: 'm6', name: 'worker-prod-03', status: 'Success' }] },
            ],
        },
        {
            id: 'tenant-2', tenantDisplayId: 'Tenants-1002',
            name: 'Globex Corp', environment: 'Production',
            status: 'All succeeded', tags: ['Enterprise', 'EMEA'],
            lastUpdated: _minsAgo(8),
            tasks: [
                { id: 't2-1', serverTaskId: 'ServerTasks-8850', projectName: 'Web API', releaseVersion: '2.4.1', taskType: 'Deployment', taskState: 'Success', startedAt: _minsAgo(35), duration: '7m 14s', machines: [{ id: 'm10', name: 'web-prod-01', status: 'Success' }, { id: 'm11', name: 'web-prod-02', status: 'Success' }] },
                { id: 't2-2', serverTaskId: 'ServerTasks-8851', projectName: 'Auth Service', releaseVersion: '1.9.3', taskType: 'Deployment', taskState: 'Success', startedAt: _minsAgo(40), duration: '3m 52s', machines: [{ id: 'm12', name: 'auth-prod-01', status: 'Success' }] },
                { id: 't2-3', serverTaskId: 'ServerTasks-8852', projectName: 'Database Migrator', releaseVersion: '2.4.0', taskType: 'Deployment', taskState: 'Success', startedAt: _minsAgo(45), duration: '5m 01s', machines: [{ id: 'm13', name: 'db-prod-01', status: 'Success' }] },
            ],
        },
        {
            id: 'tenant-3', tenantDisplayId: 'Tenants-1003',
            name: 'Initech Solutions', environment: 'Production',
            status: 'All succeeded', tags: ['Enterprise', 'APAC'],
            lastUpdated: _minsAgo(22),
            tasks: [
                { id: 't3-1', serverTaskId: 'ServerTasks-8860', projectName: 'Web API', releaseVersion: '2.4.1', taskType: 'Deployment', taskState: 'Success', startedAt: _minsAgo(55), duration: '9m 43s', machines: [{ id: 'm20', name: 'web-prod-01', status: 'Success' }] },
                { id: 't3-2', serverTaskId: 'ServerTasks-8861', projectName: 'Notification Service', releaseVersion: '3.1.0', taskType: 'Deployment', taskState: 'Success', startedAt: _minsAgo(60), duration: '2m 18s', machines: [{ id: 'm21', name: 'notify-prod-01', status: 'Success' }] },
            ],
        },
        {
            id: 'tenant-4', tenantDisplayId: 'Tenants-1004',
            name: 'Umbrella Ltd', environment: 'Production',
            status: 'All succeeded', tags: ['Enterprise', 'EMEA', 'Regulated'],
            lastUpdated: _hoursAgo(1),
            tasks: [
                { id: 't4-1', serverTaskId: 'ServerTasks-8870', projectName: 'Web API', releaseVersion: '2.3.9', taskType: 'Deployment', taskState: 'Success', startedAt: _hoursAgo(1.5), duration: '11m 05s', machines: [{ id: 'm30', name: 'web-prod-01', status: 'Success' }, { id: 'm31', name: 'web-prod-02', status: 'Success' }] },
                { id: 't4-2', serverTaskId: 'ServerTasks-8871', projectName: 'Compliance Reporter', releaseVersion: '1.2.0', taskType: 'Runbook Run', taskState: 'Success', startedAt: _hoursAgo(1.4), duration: '1m 44s', machines: [{ id: 'm32', name: 'compliance-prod-01', status: 'Success' }] },
            ],
        },
        {
            id: 'tenant-5', tenantDisplayId: 'Tenants-1005',
            name: 'Soylent Corp', environment: 'Staging',
            status: 'All succeeded', tags: ['Starter', 'Americas'],
            lastUpdated: _minsAgo(5),
            tasks: [
                { id: 't5-1', serverTaskId: 'ServerTasks-8880', projectName: 'Web API', releaseVersion: '2.5.0', taskType: 'Deployment', taskState: 'Success', startedAt: _minsAgo(12), duration: '5m 30s', machines: [{ id: 'm40', name: 'web-staging-01', status: 'Success' }] },
            ],
        },
        {
            id: 'tenant-6', tenantDisplayId: 'Tenants-1006',
            name: 'Stark Industries', environment: 'Production',
            status: 'Has failures', tags: ['Enterprise', 'Americas', 'High Priority'],
            lastUpdated: _minsAgo(14),
            tasks: [
                { id: 't6-1', serverTaskId: 'ServerTasks-8891', projectName: 'Web API', releaseVersion: '2.4.1', taskType: 'Deployment', taskState: 'Failed', startedAt: _minsAgo(26), duration: '12m 34s', errorMessage: 'Step "Deploy Web API" failed on 2 of 4 machines — connection timeout on web-prod-03 and web-prod-04', machines: [{ id: 'm50', name: 'web-prod-01', status: 'Success' }, { id: 'm51', name: 'web-prod-02', status: 'Success' }, { id: 'm52', name: 'web-prod-03', status: 'Failed' }, { id: 'm53', name: 'web-prod-04', status: 'Failed' }] },
                { id: 't6-2', serverTaskId: 'ServerTasks-8892', projectName: 'Database Migrator', releaseVersion: '2.4.0', taskType: 'Deployment', taskState: 'Success', startedAt: _minsAgo(38), duration: '4m 07s', machines: [{ id: 'm54', name: 'db-prod-01', status: 'Success' }] },
                { id: 't6-3', serverTaskId: 'ServerTasks-8893', projectName: 'Background Worker', releaseVersion: '2.4.1', taskType: 'Deployment', taskState: 'Success', startedAt: _minsAgo(32), duration: '8m 21s', machines: [{ id: 'm55', name: 'worker-prod-01', status: 'Success' }, { id: 'm56', name: 'worker-prod-02', status: 'Success' }, { id: 'm57', name: 'worker-prod-03', status: 'Success' }] },
            ],
        },
        {
            id: 'tenant-7', tenantDisplayId: 'Tenants-1007',
            name: 'Contoso Ltd', environment: 'Production',
            status: 'Has failures', tags: ['Enterprise', 'EMEA'],
            lastUpdated: _minsAgo(31),
            tasks: [
                { id: 't7-1', serverTaskId: 'ServerTasks-8900', projectName: 'Auth Service', releaseVersion: '1.9.3', taskType: 'Deployment', taskState: 'Failed', startedAt: _minsAgo(50), duration: '8m 02s', errorMessage: 'Health check endpoint returned 503 after deployment', machines: [{ id: 'm60', name: 'auth-prod-01', status: 'Failed' }, { id: 'm61', name: 'auth-prod-02', status: 'Success' }] },
                { id: 't7-2', serverTaskId: 'ServerTasks-8901', projectName: 'Web API', releaseVersion: '2.4.1', taskType: 'Deployment', taskState: 'Success', startedAt: _minsAgo(55), duration: '6m 15s', machines: [{ id: 'm62', name: 'web-prod-01', status: 'Success' }] },
                { id: 't7-3', serverTaskId: 'ServerTasks-8902', projectName: 'Email Service', releaseVersion: '2.0.1', taskType: 'Deployment', taskState: 'TimedOut', startedAt: _minsAgo(65), duration: '30m 00s', errorMessage: 'Deployment timed out after 30 minutes waiting for health check', machines: [{ id: 'm63', name: 'email-prod-01', status: 'Failed' }] },
            ],
        },
        {
            id: 'tenant-8', tenantDisplayId: 'Tenants-1008',
            name: 'Wonka Industries', environment: 'Production',
            status: 'Has failures', tags: ['SMB', 'EMEA'],
            lastUpdated: _minsAgo(47),
            tasks: [
                { id: 't8-1', serverTaskId: 'ServerTasks-8910', projectName: 'Web API', releaseVersion: '2.4.1', taskType: 'Deployment', taskState: 'Canceled', startedAt: _minsAgo(60), duration: '2m 11s', errorMessage: 'Deployment was canceled by operator', machines: [{ id: 'm70', name: 'web-prod-01', status: 'Failed' }] },
            ],
        },
        {
            id: 'tenant-9', tenantDisplayId: 'Tenants-1009',
            name: 'Weyland Corp', environment: 'Staging',
            status: 'Has failures', tags: ['Enterprise', 'Beta'],
            lastUpdated: _minsAgo(19),
            tasks: [
                { id: 't9-1', serverTaskId: 'ServerTasks-8920', projectName: 'Data Pipeline', releaseVersion: '4.0.1', taskType: 'Deployment', taskState: 'Failed', startedAt: _minsAgo(30), duration: '15m 44s', errorMessage: 'Database migration step failed: constraint violation on table users', machines: [{ id: 'm80', name: 'pipeline-staging-01', status: 'Failed' }, { id: 'm81', name: 'pipeline-staging-02', status: 'Failed' }] },
                { id: 't9-2', serverTaskId: 'ServerTasks-8921', projectName: 'Web API', releaseVersion: '4.0.1', taskType: 'Deployment', taskState: 'Success', startedAt: _minsAgo(35), duration: '7m 02s', machines: [{ id: 'm82', name: 'web-staging-01', status: 'Success' }] },
            ],
        },
        {
            id: 'tenant-10', tenantDisplayId: 'Tenants-1010',
            name: 'Cyberdyne Systems', environment: 'Production',
            status: 'In progress', tags: ['Enterprise', 'Americas', 'Managed'],
            lastUpdated: new Date(Date.now() - 12 * 1000),
            tasks: [
                { id: 't10-1', serverTaskId: 'ServerTasks-8930', projectName: 'Web API', releaseVersion: '2.4.2', taskType: 'Deployment', taskState: 'Executing', startedAt: _minsAgo(4), duration: '4m 12s', machines: [{ id: 'm90', name: 'web-prod-01', status: 'Executing' }, { id: 'm91', name: 'web-prod-02', status: 'Queued' }] },
                { id: 't10-2', serverTaskId: 'ServerTasks-8931', projectName: 'Database Migrator', releaseVersion: '2.4.1', taskType: 'Deployment', taskState: 'Queued', startedAt: _minsAgo(1), duration: '–', machines: [{ id: 'm92', name: 'db-prod-01', status: 'Queued' }] },
                { id: 't10-3', serverTaskId: 'ServerTasks-8932', projectName: 'Background Worker', releaseVersion: '2.4.2', taskType: 'Deployment', taskState: 'Success', startedAt: _minsAgo(18), duration: '8m 55s', machines: [{ id: 'm93', name: 'worker-prod-01', status: 'Success' }, { id: 'm94', name: 'worker-prod-02', status: 'Success' }] },
            ],
        },
        {
            id: 'tenant-11', tenantDisplayId: 'Tenants-1011',
            name: 'Initrode Global', environment: 'Production',
            status: 'In progress', tags: ['SMB', 'APAC'],
            lastUpdated: new Date(Date.now() - 8 * 1000),
            tasks: [
                { id: 't11-1', serverTaskId: 'ServerTasks-8940', projectName: 'Auth Service', releaseVersion: '1.9.4', taskType: 'Deployment', taskState: 'Executing', startedAt: _minsAgo(6), duration: '6m 03s', machines: [{ id: 'm100', name: 'auth-prod-01', status: 'Executing' }] },
                { id: 't11-2', serverTaskId: 'ServerTasks-8941', projectName: 'Web API', releaseVersion: '2.4.2', taskType: 'Deployment', taskState: 'Queued', startedAt: _minsAgo(2), duration: '–', machines: [{ id: 'm101', name: 'web-prod-01', status: 'Queued' }, { id: 'm102', name: 'web-prod-02', status: 'Queued' }] },
            ],
        },
        {
            id: 'tenant-12', tenantDisplayId: 'Tenants-1012',
            name: 'Delos Incorporated', environment: 'Staging',
            status: 'In progress', tags: ['Enterprise', 'Americas', 'Beta'],
            lastUpdated: new Date(Date.now() - 3 * 1000),
            tasks: [
                { id: 't12-1', serverTaskId: 'ServerTasks-8950', projectName: 'Web API', releaseVersion: '3.0.0', taskType: 'Deployment', taskState: 'Cancelling', startedAt: _minsAgo(8), duration: '8m 14s', machines: [{ id: 'm110', name: 'web-staging-01', status: 'Executing' }] },
                { id: 't12-2', serverTaskId: 'ServerTasks-8951', projectName: 'ML Inference', releaseVersion: '1.0.0', taskType: 'Deployment', taskState: 'Queued', startedAt: _minsAgo(1), duration: '–', machines: [{ id: 'm111', name: 'ml-staging-01', status: 'Queued' }] },
            ],
        },
    ];

    /* ─── State ──────────────────────────────────────────────────────────── */

    let _docListenersAttached = false;

    const tenantsState = {
        allTenants: [],
        filteredTenants: [],
        preTabFilteredTenants: [],
        activeTab: 'all',
        searchQuery: '',
        expandedIds: new Set(),
        failuresOnlyIds: new Set(),
        errorExpandedIds: new Set(),
        retriedTaskIds: new Set(),
        detailSearchQueries: {},
        confirmingRetryId: null,
        showFilters: false,
        filters: {
            environment: '',
            projects: [],
            taskTypes: ['Deployment', 'Runbook Run'],
            dateFrom: null,
            dateTo: null,
        },
        spaces: [],
        environments: [],
        projects: [],
        sortBy: 'lastUpdated',
        sortDir: 'desc',
        tagFilter: [],
        viewMode: 'status',
        spaceId: null,
        serverConfigured: false,
    };

    /* ─── Init ───────────────────────────────────────────────────────────── */

    async function init() {
        // Reset mutable state
        tenantsState.allTenants = [];
        tenantsState.filteredTenants = [];
        tenantsState.preTabFilteredTenants = [];
        tenantsState.activeTab = 'all';
        tenantsState.searchQuery = '';
        tenantsState.expandedIds = new Set();
        tenantsState.failuresOnlyIds = new Set();
        tenantsState.errorExpandedIds = new Set();
        tenantsState.retriedTaskIds = new Set();
        tenantsState.detailSearchQueries = {};
        tenantsState.confirmingRetryId = null;
        tenantsState.showFilters = false;
        tenantsState.sortBy = 'lastUpdated';
        tenantsState.sortDir = 'desc';
        tenantsState.tagFilter = [];
        tenantsState.viewMode = 'status';
        tenantsState.filters = { environment: '', projects: [], taskTypes: ['Deployment', 'Runbook Run'], dateFrom: null, dateTo: null };
        tenantsState.serverConfigured = OctopusApi.isConfigured();

        const spacesSelect = document.getElementById('tv-spaces-select');

        try {
            let spaces;
            if (tenantsState.serverConfigured) {
                spaces = await OctopusApi.get('/api/spaces/all');
            } else {
                spaces = [{ Id: 'mock-space', Name: 'Mock Data Preview' }];
            }

            tenantsState.spaces = spaces;
            spacesSelect.innerHTML = spaces.map(s =>
                `<option value="${escHtml(s.Id)}">${escHtml(s.Name)}</option>`
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
        let el = document.getElementById('tv-loading-state');

        if (visible && !el) {
            const loadingHost =
                document.getElementById('tv-tenant-rows') ||
                document.getElementById('tv-dashboard-content');

            if (!loadingHost) return;

            el = document.createElement('div');
            el.id = 'tv-loading-state';
            el.textContent = 'Loading...';
            loadingHost.prepend(el);
        }

        if (el) el.style.display = visible ? 'block' : 'none';
    }

    async function onSpaceChange(spaceId) {
        tenantsState.spaceId = spaceId;
        document.getElementById('tv-dashboard-content').classList.remove('hidden');
        showLoading(true);

        try {
            let envs, rawProjects, tenants;

            if (!tenantsState.serverConfigured) {
                envs = [
                    { Id: 'Environments-1', Name: 'Production' },
                    { Id: 'Environments-2', Name: 'Staging' },
                    { Id: 'Environments-3', Name: 'UAT' },
                ];
                rawProjects = [...new Set(MOCK_TENANTS.flatMap(t => t.tasks.map(tk => tk.projectName)))]
                    .sort().map(n => ({ Id: n, Name: n }));
                tenants = MOCK_TENANTS;
            } else {
                const lookbackMonths = parseInt(document.getElementById('lookback-select')?.value || '3', 10);
                const fromDate = new Date();
                if (lookbackMonths > 0) fromDate.setMonth(fromDate.getMonth() - lookbackMonths);
                else fromDate.setFullYear(fromDate.getFullYear() - 10);
                const fromDateStr = encodeURIComponent(fromDate.toISOString());
                const deployTake  = lookbackMonths <= 3 ? 500 : lookbackMonths <= 6 ? 1000 : lookbackMonths <= 12 ? 2000 : 5000;
                const relatedResourceBatchSize = 50;

                const chunkArray = (items, size) => {
                    const chunks = [];
                    for (let i = 0; i < items.length; i += size) {
                        chunks.push(items.slice(i, i + size));
                    }
                    return chunks;
                };

                const fetchResourcesByIds = async (resourceName, ids) => {
                    const uniqueIds = [...new Set((ids || []).filter(Boolean))];
                    if (!uniqueIds.length) return [];

                    const cache = new Map();
                    const results = [];

                    for (const idBatch of chunkArray(uniqueIds, relatedResourceBatchSize)) {
                        const batchResults = await Promise.all(idBatch.map(async (id) => {
                            if (cache.has(id)) return cache.get(id);
                            try {
                                const item = await OctopusApi.get(`/api/${spaceId}/${resourceName}/${encodeURIComponent(id)}`);
                                cache.set(id, item || null);
                                return item || null;
                            } catch (fetchErr) {
                                cache.set(id, null);
                                return null;
                            }
                        }));
                        results.push(...batchResults.filter(Boolean));
                    }

                    return results;
                };

                const [rawEnvs, projectList, tenantList, rawDeploymentsData, runbookRunsData] = await Promise.all([
                    OctopusApi.get(`/api/${spaceId}/environments/all`),
                    OctopusApi.get(`/api/${spaceId}/projects/all`),
                    OctopusApi.get(`/api/${spaceId}/tenants/all`),
                    OctopusApi.get(`/api/${spaceId}/deployments?fromDate=${fromDateStr}&take=${deployTake}`),
                    OctopusApi.get(`/api/${spaceId}/runbookRuns?fromDate=${fromDateStr}&take=${deployTake}`),
                ]);

                const deploymentItems = rawDeploymentsData.Items || rawDeploymentsData || [];
                const runbookRunItems = runbookRunsData.Items || runbookRunsData || [];
                const combinedDeploymentItems = deploymentItems.concat(runbookRunItems.map(rr => ({
                    Id: rr.Id,
                    TaskId: rr.TaskId,
                    TenantId: rr.TenantId,
                    EnvironmentId: rr.EnvironmentId,
                    ProjectId: rr.ProjectId,
                    ReleaseId: rr.ReleaseId || null,
                    RunbookId: rr.RunbookId || null,
                    RunbookSnapshotId: rr.RunbookSnapshotId || null,
                    Created: rr.Created,
                    QueueTime: rr.QueueTime,
                    TaskType: 'RunbookRun',
                })));

                const [tasksData, releasesData] = await Promise.all([
                    fetchResourcesByIds('tasks', combinedDeploymentItems.map(item => item.TaskId)),
                    fetchResourcesByIds('releases', combinedDeploymentItems.map(item => item.ReleaseId)),
                ]);

                const deploymentsData = {
                    ...(rawDeploymentsData && !Array.isArray(rawDeploymentsData) ? rawDeploymentsData : {}),
                    Items: combinedDeploymentItems,
                };

                envs = rawEnvs;
                rawProjects = projectList;

                const envMap = {};
                rawEnvs.forEach(e => { envMap[e.Id] = e.Name; });

                const projectMap = {};
                projectList.forEach(p => { projectMap[p.Id] = p.Name; });

                const taskMap = {};
                (tasksData.Items || tasksData).forEach(t => { taskMap[t.Id] = t; });

                // Releases: map ReleaseId → version string (e.g. "Releases-123" → "2.4.1")
                const releaseMap = {};
                (releasesData.Items || releasesData).forEach(r => { releaseMap[r.Id] = r.Version; });

                const tenantDeployments = {};
                (deploymentsData.Items || deploymentsData).forEach(dep => {
                    const tenantId = dep.TenantId || dep.tenantId;
                    if (!tenantId) return;
                    dep.TenantId = tenantId;
                    if (!tenantDeployments[dep.TenantId]) tenantDeployments[dep.TenantId] = [];
                    tenantDeployments[dep.TenantId].push(dep);
                });

                tenants = tenantList
                    .map(apiTenant => {
                        const deps = tenantDeployments[apiTenant.Id] || [];
                        const tasks = deps.map(dep => {
                            const task = taskMap[dep.TaskId];
                            if (!task) {
                                return {
                                    id: dep.Id,
                                    serverTaskId: dep.TaskId || '–',
                                    projectName: projectMap[dep.ProjectId] || dep.ProjectId || 'Unknown project',
                                    releaseVersion: releaseMap[dep.ReleaseId] || dep.ReleaseId || '–',
                                    taskType: dep.RunbookId ? 'Runbook Run' : 'Deployment',
                                    taskState: 'Unknown',
                                    startedAt: dep.Created ? new Date(dep.Created) : new Date(),
                                    duration: '–',
                                    machines: [],
                                };
                            }
                            return {
                                id: dep.Id,
                                serverTaskId: dep.TaskId,
                                projectName: projectMap[dep.ProjectId] || dep.ProjectId || 'Unknown project',
                                releaseVersion: releaseMap[dep.ReleaseId] || dep.ReleaseId || '–',
                                taskType: dep.RunbookId ? 'Runbook Run' : 'Deployment',
                                taskState: task.State || 'Unknown',
                                startedAt: task.StartTime ? new Date(task.StartTime) : new Date(),
                                duration: task.Duration || '–',
                                machines: [],
                                errorMessage: task.ErrorMessage || undefined,
                            };
                        }).filter(Boolean);

                        if (tasks.length === 0) return null;

                        const status = deriveTenantStatus(tasks);
                        const tags = Object.values(apiTenant.TenantTags || {})
                            .flat()
                            .map(t => t.split('/').pop());

                        const envNames = [...new Set(deps.map(dep => envMap[dep.EnvironmentId] || dep.EnvironmentId).filter(Boolean))];
                        const envName = envNames.join(', ');

                        return {
                            id: apiTenant.Id,
                            tenantDisplayId: apiTenant.Id,
                            name: apiTenant.Name,
                            environment: envName,
                            status,
                            tags,
                            tasks,
                            lastUpdated: new Date(Math.max(...tasks.map(t => t.startedAt.getTime()))),
                        };
                    })
                    .filter(Boolean);
            }

            tenantsState.environments = envs;
            tenantsState.projects = rawProjects.map(p => p.Name || p);
            tenantsState.allTenants = tenants;

            // Clear any error left from a previous load attempt
            const errBanner = document.getElementById('tv-error-banner');
            if (errBanner) errBanner.classList.add('hidden');

            const allTags = [...new Set(tenants.flatMap(t => t.tags))].sort();
            tenantsState.allTags = allTags;

            populateEnvironmentFilter(envs);
            populateProjectsFilter(tenantsState.projects);
            populateTagFilter(allTags);

            applyFilters();
            render();
            showLoading(false);

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

    /* ─── Controls wiring ────────────────────────────────────────────────── */

    function wireUpControls() {
        document.getElementById('tv-tenant-search').addEventListener('input', e => {
            tenantsState.searchQuery = e.target.value;
            applyFilters();
            renderTenantRows();
            renderStats();
        });

        document.getElementById('tv-filter-toggle-btn').addEventListener('click', () => {
            tenantsState.showFilters = !tenantsState.showFilters;
            document.getElementById('tv-advanced-filters').classList.toggle('hidden', !tenantsState.showFilters);
            document.getElementById('tv-filter-toggle-label').textContent =
                tenantsState.showFilters ? 'Hide filters' : 'Show advanced filters';
        });

        document.getElementById('tv-status-tabs').addEventListener('click', e => {
            const tab = e.target.closest('[data-filter]');
            if (!tab) return;
            tenantsState.activeTab = tab.dataset.filter;
            tenantsState.expandedIds.clear();
            document.querySelectorAll('.tv-status-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            applyFilters();
            renderTenantRows();
        });

        document.getElementById('tv-environment-select').addEventListener('change', e => {
            tenantsState.filters.environment = e.target.value;
            applyFilters();
            renderTenantRows();
            renderStats();
        });

        document.getElementById('tv-type-deployment').addEventListener('change', updateTaskTypeFilter);
        document.getElementById('tv-type-runbook').addEventListener('change', updateTaskTypeFilter);

        document.getElementById('tv-date-from').addEventListener('change', updateDateFilter);
        document.getElementById('tv-date-to').addEventListener('change', updateDateFilter);

        document.getElementById('tv-projects-trigger').addEventListener('click', () => {
            document.getElementById('tv-projects-menu').classList.toggle('hidden');
        });

        // Delegated handler for the projects multi-select options
        document.getElementById('tv-projects-options').addEventListener('click', e => {
            const allBtn = e.target.closest('#tv-projects-all-option');
            const optBtn = e.target.closest('.tv-multiselect__option');
            if (allBtn) {
                tenantsState.filters.projects = [];
                updateProjectCheckboxes();
                applyFilters();
                renderTenantRows();
                renderStats();
            } else if (optBtn) {
                const proj = optBtn.dataset.project;
                const idx  = tenantsState.filters.projects.indexOf(proj);
                if (idx === -1) tenantsState.filters.projects.push(proj);
                else tenantsState.filters.projects.splice(idx, 1);
                if (tenantsState.filters.projects.length === tenantsState.projects.length) {
                    tenantsState.filters.projects = [];
                }
                updateProjectCheckboxes();
                applyFilters();
                renderTenantRows();
                renderStats();
            }
        });

        // Delegated handler for tag filter chips
        document.getElementById('tv-tag-filter-chips').addEventListener('click', e => {
            const chip = e.target.closest('.tv-tag-filter-chip');
            if (!chip) return;
            const tag = chip.dataset.tag;
            const idx = tenantsState.tagFilter.indexOf(tag);
            if (idx === -1) tenantsState.tagFilter.push(tag);
            else tenantsState.tagFilter.splice(idx, 1);
            chip.classList.toggle('active', tenantsState.tagFilter.includes(tag));
            applyFilters();
            renderTenantRows();
            renderStats();
        });

        // Capture phase fires before any element's stopPropagation, so outside-clicks reliably close the menu.
        // Guard prevents stacking listeners across repeated navigations.
        if (!_docListenersAttached) {
            document.addEventListener('click', e => {
                const multiselect = document.getElementById('tv-projects-multiselect');
                if (!multiselect) return;
                if (!multiselect.contains(e.target)) {
                    document.getElementById('tv-projects-menu').classList.add('hidden');
                }
            }, true);
            _docListenersAttached = true;
        }

        // View toggle: Tenant Status ↔ Version Adoption
        document.getElementById('tv-view-toggle').addEventListener('click', e => {
            const btn = e.target.closest('[data-view]');
            if (!btn || btn.dataset.view === tenantsState.viewMode) return;
            tenantsState.viewMode = btn.dataset.view;
            document.querySelectorAll('.tv-view-btn').forEach(b =>
                b.classList.toggle('active', b.dataset.view === tenantsState.viewMode)
            );
            document.getElementById('tv-status-pane').classList.toggle('hidden', tenantsState.viewMode === 'matrix');
            document.getElementById('tv-matrix-container').classList.toggle('hidden', tenantsState.viewMode === 'status');
            if (tenantsState.viewMode === 'matrix') renderVersionMatrix();
        });

        // Sortable column headers
        document.getElementById('tv-tenant-grid-header').addEventListener('click', e => {
            const th = e.target.closest('[data-sort]');
            if (!th) return;
            const col = th.dataset.sort;
            if (tenantsState.sortBy === col) {
                tenantsState.sortDir = tenantsState.sortDir === 'asc' ? 'desc' : 'asc';
            } else {
                tenantsState.sortBy = col;
                tenantsState.sortDir = col === 'lastUpdated' ? 'desc' : 'asc';
            }
            updateSortHeaders();
            applyFilters();
            renderTenantRows();
        });
    }

    function updateSortHeaders() {
        document.querySelectorAll('#tv-tenant-grid-header [data-sort]').forEach(th => {
            const isActive = th.dataset.sort === tenantsState.sortBy;
            th.classList.toggle('is-sorted', isActive);
            const icon = th.querySelector('.tv-sort-icon');
            if (icon) icon.className = 'tv-sort-icon fa-solid ' + (isActive
                ? (tenantsState.sortDir === 'asc' ? 'fa-sort-up' : 'fa-sort-down')
                : 'fa-sort');
        });
    }

    function updateTaskTypeFilter() {
        const types = [];
        if (document.getElementById('tv-type-deployment').checked) types.push('Deployment');
        if (document.getElementById('tv-type-runbook').checked) types.push('Runbook Run');
        tenantsState.filters.taskTypes = types;
        applyFilters();
        renderTenantRows();
        renderStats();
    }

    function updateDateFilter() {
        const from = document.getElementById('tv-date-from').value;
        const to   = document.getElementById('tv-date-to').value;
        tenantsState.filters.dateFrom = from ? new Date(from) : null;
        tenantsState.filters.dateTo   = to   ? new Date(to + 'T23:59:59') : null;
        applyFilters();
        renderTenantRows();
        renderStats();
    }

    /* ─── Filter population ──────────────────────────────────────────────── */

    function populateEnvironmentFilter(envs) {
        const select = document.getElementById('tv-environment-select');
        select.innerHTML = '<option value="">All environments</option>' +
            envs.map(e => `<option value="${escHtml(e.Name)}">${escHtml(e.Name)}</option>`).join('');
    }

    function populateProjectsFilter(projects) {
        const container = document.getElementById('tv-projects-options');
        container.innerHTML = `
            <button class="tv-multiselect__all-option" id="tv-projects-all-option">
                <span id="tv-all-projects-check">☑</span> All projects
            </button>
            ${projects.map(p => `
                <button class="tv-multiselect__option" data-project="${escHtml(p)}">
                    <input type="checkbox" checked class="tv-projects-checkbox" data-project="${escHtml(p)}" style="pointer-events:none"> ${escHtml(p)}
                </button>
            `).join('')}
        `;
    }

    function updateProjectCheckboxes() {
        const allSelected = tenantsState.filters.projects.length === 0;
        const trigger = document.getElementById('tv-projects-trigger');

        if (allSelected) {
            trigger.innerHTML = 'All projects <i class="fa-solid fa-chevron-down tv-multiselect__caret"></i>';
        } else if (tenantsState.filters.projects.length === 1) {
            trigger.innerHTML = `${escHtml(tenantsState.filters.projects[0])} <i class="fa-solid fa-chevron-down tv-multiselect__caret"></i>`;
        } else {
            trigger.innerHTML = `${tenantsState.filters.projects.length} projects <i class="fa-solid fa-chevron-down tv-multiselect__caret"></i>`;
        }

        document.querySelectorAll('.tv-projects-checkbox').forEach(cb => {
            cb.checked = allSelected || tenantsState.filters.projects.includes(cb.dataset.project);
        });
    }

    function populateTagFilter(tags) {
        const container = document.getElementById('tv-tag-filter-chips');
        if (!container) return;
        if (tags.length === 0) {
            container.closest('.tv-filter-group').style.display = 'none';
            return;
        }
        container.closest('.tv-filter-group').style.display = '';
        container.innerHTML = tags.map(tag =>
            `<button class="tv-tag-filter-chip${tenantsState.tagFilter.includes(tag) ? ' active' : ''}" data-tag="${escHtml(tag)}">${escHtml(tag)}</button>`
        ).join('');
    }

    /* ─── Filtering ──────────────────────────────────────────────────────── */

    function taskMatchesFilters(task, filters, from, to) {
        if (filters.taskTypes.length > 0 && !filters.taskTypes.includes(task.taskType)) return false;
        if (filters.projects.length > 0 && !filters.projects.includes(task.projectName)) return false;

        if (from || to) {
            const d = task.startedAt;
            if (from && d < from) return false;
            if (to   && d > to)   return false;
        }

        return true;
    }

    function getFilteredLastUpdated(tenant, visibleTasks) {
        if (!visibleTasks.length) return tenant.lastUpdated;

        return visibleTasks.reduce((latest, task) => {
            const taskDate = task.startedAt || task.completedAt || tenant.lastUpdated;
            return taskDate > latest ? taskDate : latest;
        }, visibleTasks[0].startedAt || visibleTasks[0].completedAt || tenant.lastUpdated);
    }

    function normalizeTenantStatus(status) {
        if (status === 'In progress') return 'In progress';
        if (status === 'All succeeded') return 'All succeeded';
        if (status === 'Has failures' || status === 'All failed' || status === 'Some failed') return 'Has failures';
        return 'All succeeded';
    }

    function getFilteredStatus(tenant, visibleTasks, hasTaskScopedFilters) {
        if (!hasTaskScopedFilters) return normalizeTenantStatus(tenant.status);
        if (!visibleTasks.length) return normalizeTenantStatus(tenant.status);

        const states = visibleTasks.map(task => task.taskState);
        if (states.some(state => ['Executing', 'Queued', 'Canceling', 'Cancelling'].includes(state))) return 'In progress';
        if (states.every(state => state === 'Success')) return 'All succeeded';
        if (states.every(state => state === 'Failed')) return 'Has failures';
        if (states.some(state => state === 'Failed')) return 'Has failures';

        return normalizeTenantStatus(tenant.status);
    }

    function applyFilters() {
        const from = tenantsState.filters.dateFrom;
        const to   = tenantsState.filters.dateTo;
        const hasTaskScopedFilters =
            tenantsState.filters.taskTypes.length > 0 ||
            tenantsState.filters.projects.length > 0 ||
            Boolean(from || to);

        let list = tenantsState.allTenants
            .map(tenant => {
                const allTasks = tenant.tasks || [];
                const visibleTasks = allTasks.filter(task =>
                    taskMatchesFilters(task, tenantsState.filters, from, to)
                );

                return {
                    ...tenant,
                    allTasks,
                    visibleTasks,
                    tasks: visibleTasks,
                    lastUpdated: getFilteredLastUpdated(tenant, visibleTasks),
                    status: getFilteredStatus(tenant, visibleTasks, hasTaskScopedFilters)
                };
            })
            .filter(tenant => {
                if (tenantsState.filters.environment) {
                    const selectedEnvironment = tenantsState.filters.environment;
                    const tenantEnvironments = Array.isArray(tenant.environment)
                        ? tenant.environment
                        : typeof tenant.environment === 'string'
                            ? tenant.environment.split(',').map(env => env.trim()).filter(Boolean)
                            : [tenant.environment].filter(Boolean);

                    if (!tenantEnvironments.includes(selectedEnvironment)) return false;
                }
                if (tenantsState.tagFilter.length > 0) {
                    if (!tenantsState.tagFilter.every(tag => tenant.tags.includes(tag))) return false;
                }
                if (hasTaskScopedFilters && tenant.visibleTasks.length === 0) return false;
                return true;
            });

        if (tenantsState.searchQuery.trim()) {
            const q = tenantsState.searchQuery.toLowerCase();
            list = list.filter(t =>
                t.name.toLowerCase().includes(q) ||
                t.tenantDisplayId.toLowerCase().includes(q) ||
                t.tags.some(tag => tag.toLowerCase().includes(q))
            );
        }

        // Snapshot pre-tab list so renderStats uses the same computed statuses as the rows
        tenantsState.preTabFilteredTenants = list;

        if (tenantsState.activeTab !== 'all') {
            list = list.filter(t => t.status === tenantsState.activeTab);
        }

        // Sort
        const dir = tenantsState.sortDir === 'asc' ? 1 : -1;
        list.sort((a, b) => {
            switch (tenantsState.sortBy) {
                case 'name':
                    return dir * a.name.localeCompare(b.name);
                case 'deployments': {
                    const da = a.tasks.filter(t => t.taskType === 'Deployment').length || a.tasks.length;
                    const db = b.tasks.filter(t => t.taskType === 'Deployment').length || b.tasks.length;
                    return dir * (da - db);
                }
                case 'successRate': {
                    const ra = a.tasks.length > 0 ? a.tasks.filter(t => t.taskState === 'Success').length / a.tasks.length : -1;
                    const rb = b.tasks.length > 0 ? b.tasks.filter(t => t.taskState === 'Success').length / b.tasks.length : -1;
                    return dir * (ra - rb);
                }
                case 'lastUpdated':
                    return dir * (a.lastUpdated.getTime() - b.lastUpdated.getTime());
                default:
                    return 0;
            }
        });

        tenantsState.filteredTenants = list;
    }

    /* ─── Stats ──────────────────────────────────────────────────────────── */

    function calculateStats(tenants) {
        const total      = tenants.length;
        const succeeded  = tenants.filter(t => t.status === 'All succeeded').length;
        const failures   = tenants.filter(t => t.status === 'Has failures').length;
        const inProgress = tenants.filter(t => t.status === 'In progress').length;
        const resolved   = succeeded + failures;
        const pct        = total > 0 ? Math.round((resolved / total) * 100) : 0;
        return { total, succeeded, failures, inProgress, resolved, pct };
    }

    /* ─── Render ─────────────────────────────────────────────────────────── */

    function render() {
        renderStats();
        if (tenantsState.viewMode === 'matrix') {
            renderVersionMatrix();
        } else {
            renderTenantRows();
        }
    }

    function renderStats() {
        const allFiltered = tenantsState.preTabFilteredTenants;
        const s = calculateStats(allFiltered);

        document.getElementById('tv-stat-total').textContent      = s.total;
        document.getElementById('tv-stat-succeeded').textContent  = s.succeeded;
        document.getElementById('tv-stat-failures').textContent   = s.failures;
        document.getElementById('tv-stat-inprogress').textContent = s.inProgress;

        document.getElementById('tv-tab-all').textContent       = allFiltered.length;
        document.getElementById('tv-tab-succeeded').textContent = allFiltered.filter(t => t.status === 'All succeeded').length;
        document.getElementById('tv-tab-failures').textContent  = allFiltered.filter(t => t.status === 'Has failures').length;
        document.getElementById('tv-tab-inprogress').textContent = allFiltered.filter(t => t.status === 'In progress').length;
    }

    function getTenantEnvironments(tenant) {
        return String(tenant.environment || '')
            .split(',')
            .map(environment => environment.trim())
            .filter(Boolean);
    }


    function renderTenantRows() {
        const container  = document.getElementById('tv-tenant-rows');
        const emptyState = document.getElementById('tv-empty-state');
        if (!container) return;

        if (tenantsState.filteredTenants.length === 0) {
            container.innerHTML = '';
            emptyState.classList.remove('hidden');
            return;
        }

        emptyState.classList.add('hidden');
        container.innerHTML = tenantsState.filteredTenants.map(renderTenantRowHtml).join('');

        container.querySelectorAll('.tv-tenant-row-header').forEach(row => {
            row.addEventListener('click', () => toggleExpand(row.dataset.tenantId));
            row.addEventListener('keydown', e => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleExpand(row.dataset.tenantId);
                }
            });
        });
    }

    function renderTenantRowHtml(tenant) {
        const isExpanded = tenantsState.expandedIds.has(tenant.id);
        const chevron    = isExpanded
            ? '<i class="fa-solid fa-chevron-down"></i>'
            : '<i class="fa-solid fa-chevron-right"></i>';

        // Octopus deep link
        const root = tenantsState.serverConfigured ? OctopusApi.getInstanceUrl() : null;
        const tenantHref = root && tenantsState.spaceId
            ? `${root}/app#/${encodeURIComponent(tenantsState.spaceId)}/tenants/${encodeURIComponent(tenant.id)}/overview`
            : null;

        const nameCell = tenantHref
            ? `<span style="font:var(--textBodyBoldMedium);color:var(--colorTextPrimary)"
                  title="Open in Octopus">${escHtml(tenant.name)}<i class="fa-solid fa-arrow-up-right-from-square" style="font-size:0.65rem;margin-left:5px;color:var(--colorTextTertiary)"></i></span>`
            : `<span style="font:var(--textBodyBoldMedium);color:var(--colorTextPrimary)">${escHtml(tenant.name)}</span>`;

        // Tags — active filter chips are highlighted
        const tags = tenant.tags.map(tag => {
            const isFiltered = tenantsState.tagFilter.includes(tag);
            return `<span class="tv-tag-chip${isFiltered ? ' tv-tag-chip--active' : ''}">${escHtml(tag)}</span>`;
        }).join('');

        // Deployments + frequency
        const deploymentCount = tenant.tasks.filter(t => t.taskType === 'Deployment').length || tenant.tasks.length;
        const lookbackMonths  = parseInt(document.getElementById('lookback-select')?.value || '3', 10) || 3;
        const lookbackWeeks   = lookbackMonths * 4.33;
        const freqPerWeek     = lookbackWeeks > 0 ? (deploymentCount / lookbackWeeks) : 0;
        const freqLabel       = freqPerWeek >= 1
            ? `${freqPerWeek.toFixed(1)}<span style="font:var(--textBodyRegularXSmall);color:var(--colorTextTertiary)">/wk</span>`
            : freqPerWeek > 0
            ? `${(freqPerWeek * lookbackWeeks).toFixed(0)}<span style="font:var(--textBodyRegularXSmall);color:var(--colorTextTertiary)"> total</span>`
            : '0';

        // Success rate + health tooltip
        const successCount = tenant.tasks.filter(t => t.taskState === 'Success').length;
        const totalTasks   = tenant.tasks.length;
        const successRate  = totalTasks > 0 ? Math.round(successCount / totalTasks * 100) : null;
        const rateColor    = successRate === null ? '' : successRate >= 90 ? 'success' : successRate >= 70 ? 'warning' : 'danger';
        const rateTooltip  = successRate === null ? 'No deployments in this period'
            : successRate >= 90 ? `Healthy — ${successRate}% success rate`
            : successRate >= 70 ? `Attention — ${successRate}% success rate`
            : `Warning — ${successRate}% success rate`;
        const successRateCell = successRate !== null
            ? `<div class="flex items-center gap-xs" title="${escHtml(rateTooltip)}">
                 <div class="progress-bar" style="width:55px;"><div class="progress-fill ${rateColor}" style="width:${successRate}%;"></div></div>
                 <span class="text-secondary" style="font:var(--textBodyRegularSmall)">${successRate}%</span>
               </div>`
            : `<span class="text-tertiary" style="font:var(--textBodyRegularSmall)" title="No data">--</span>`;

        // Stale indicator — no deployment in 14+ days
        const daysSince   = Math.floor((Date.now() - tenant.lastUpdated.getTime()) / 86400000);
        const staleIcon   = daysSince >= 14
            ? `<i class="fa-solid fa-triangle-exclamation" style="color:var(--colorWarningLight);margin-right:4px;font-size:0.7rem" title="${daysSince} days since last deployment"></i>`
            : '';

        const header = `
            <div class="tv-tenant-row-header tv-tenant-grid${isExpanded ? ' is-expanded' : ''}" role="button" tabindex="0" data-tenant-id="${escHtml(tenant.id)}">
                <div style="color:var(--colorTextTertiary);display:flex;justify-content:center">${chevron}</div>
                <div>
                    ${nameCell}
                    <span style="font:var(--textBodyRegularXSmall);font-family:var(--fontFamilyCode);color:var(--colorTextTertiary);margin-left:6px">(${escHtml(tenant.tenantDisplayId)})</span>
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:4px">${tags}</div>
                <div>${renderStatusBadge(tenant.status)}</div>
                <div style="text-align:center;font:var(--textBodyRegularMedium);color:var(--colorTextSecondary)">${freqLabel}</div>
                <div>${successRateCell}</div>
                <div style="font:var(--textBodyRegularSmall);color:var(--colorTextTertiary);white-space:nowrap">${staleIcon}${formatRelativeTime(tenant.lastUpdated)}</div>
            </div>
        `;

        const detail = isExpanded ? renderTenantDetailHtml(tenant) : '';
        return header + detail;
    }

    /* ─── Tenant detail ──────────────────────────────────────────────────── */

    function renderTenantDetailHtml(tenant) {
        const failureCount  = tenant.tasks.filter(t =>
            t.taskState === 'Failed' || t.taskState === 'TimedOut' || t.taskState === 'Canceled'
        ).length;
        const uniqueProjectCount = new Set(tenant.tasks.map(t => t.projectName)).size;

        const failuresOnly  = tenantsState.failuresOnlyIds.has(tenant.id);
        const detailSearch  = tenantsState.detailSearchQueries[tenant.id] || '';

        let visibleTasks = tenant.tasks;
        if (failuresOnly) {
            visibleTasks = visibleTasks.filter(t =>
                t.taskState === 'Failed' || t.taskState === 'TimedOut' || t.taskState === 'Canceled'
            );
        }
        if (detailSearch.trim()) {
            visibleTasks = visibleTasks.filter(t => t.projectName.toLowerCase().includes(detailSearch.toLowerCase()));
        }

        const failuresOnlyBtn = failureCount > 0 ? `
            <button class="btn btn-secondary btn-sm${failuresOnly ? ' tv-active-filter' : ''}" data-action="toggle-failures-only" data-tenant-id="${escHtml(tenant.id)}">
                <i class="fa-solid fa-filter"></i> Failures only
            </button>
        ` : '';

        const rows = visibleTasks.length === 0
            ? `<tr><td colspan="8" style="padding:var(--space-lg);text-align:center;color:var(--colorTextTertiary)">No projects match the current filter.</td></tr>`
            : visibleTasks.map(task => renderTaskRowHtml(tenant, task)).join('');

        const detail = `
            <div class="tv-tenant-detail" data-detail-for="${escHtml(tenant.id)}">
                <div class="tv-detail-toolbar">
                    <span style="font:var(--textBodyBoldMedium);color:var(--colorTextPrimary)">${escHtml(tenant.name)}</span>
                    <span class="text-tertiary" style="font:var(--textBodyRegularSmall)">(${escHtml(tenant.tenantDisplayId)})</span>
                    <span class="text-tertiary" style="font:var(--textBodyRegularSmall)">— ${escHtml(tenant.environment)}</span>
                    <span class="text-tertiary" style="font:var(--textBodyRegularSmall)">${uniqueProjectCount} project${uniqueProjectCount !== 1 ? 's' : ''}</span>
                    ${failureCount > 0 ? `<span style="font:var(--textBodyBoldSmall);color:var(--colorTextDanger)">(${failureCount} failed)</span>` : ''}
                    <div style="margin-left:auto;display:flex;align-items:center;gap:var(--space-sm)">
                        ${failuresOnlyBtn}
                        <div style="position:relative">
                            <i class="fa-solid fa-magnifying-glass" style="position:absolute;left:8px;top:50%;transform:translateY(-50%);color:var(--colorTextTertiary);font-size:11px;pointer-events:none"></i>
                            <input type="text" class="tv-detail-search" placeholder="Filter projects…"
                                data-tenant-id="${escHtml(tenant.id)}" value="${escHtml(detailSearch)}"
                                style="height:28px;width:180px;padding:0 8px 0 26px;background:var(--colorBackgroundPrimaryDefault);border:1px solid var(--colorBorderDefault);border-radius:var(--radiusMedium);font:var(--textBodyRegularSmall);color:var(--colorTextPrimary)">
                        </div>
                    </div>
                </div>
                <div class="table-wrapper">
                    <table>
                        <thead>
                            <tr>
                                <th>Project</th>
                                <th>Server Task</th>
                                <th>Release</th>
                                <th>Type</th>
                                <th>State</th>
                                <th>Started</th>
                                <th>Duration</th>
                                <th style="text-align:right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>
        `;

        setTimeout(() => wireDetailHandlers(tenant.id), 0);
        return detail;
    }

    function renderTaskRowHtml(tenant, task) {
        const hasError    = !!task.errorMessage;
        const isErrorExpanded = tenantsState.errorExpandedIds.has(task.id);
        const isRetried   = tenantsState.retriedTaskIds.has(task.id);
        const canRetry    = !isRetried && (task.taskState === 'Failed' || task.taskState === 'Canceled' || task.taskState === 'TimedOut');
        const confirming  = tenantsState.confirmingRetryId === task.id;

        const errorIcon = hasError
            ? `<i class="fa-solid fa-triangle-exclamation" style="color:var(--colorDangerLight);cursor:pointer;margin-right:4px" data-action="toggle-error" data-task-id="${escHtml(task.id)}"></i>`
            : '';

        let actionCell;
        if (isRetried) {
            actionCell = `<span style="font:var(--textBodyRegularSmall);color:var(--colorTextTertiary)"><i class="fa-solid fa-spinner fa-spin"></i> Queued</span>`;
        } else if (confirming) {
            actionCell = `
                <span style="display:inline-flex;align-items:center;gap:var(--space-xs)">
                    <span style="font:var(--textBodyRegularSmall);color:var(--colorTextSecondary)">Retry?</span>
                    <button class="btn btn-primary btn-sm" data-action="confirm-retry" data-task-id="${escHtml(task.id)}" data-tenant-id="${escHtml(tenant.id)}">Confirm</button>
                    <button class="btn btn-secondary btn-sm" data-action="cancel-retry" data-task-id="${escHtml(task.id)}">Cancel</button>
                </span>`;
        } else if (canRetry) {
            actionCell = `
                <button class="btn btn-secondary btn-sm" data-action="start-retry" data-task-id="${escHtml(task.id)}">
                    <i class="fa-solid fa-rotate-right"></i> Retry
                </button>`;
        } else {
            actionCell = '';
        }

        const isFailedRow    = task.taskState === 'Failed' || task.taskState === 'TimedOut';
        const isExecutingRow = task.taskState === 'Executing' || task.taskState === 'Cancelling';
        const rowBg = isFailedRow
            ? 'background:rgba(214,61,61,0.06)'
            : isExecutingRow
            ? 'background:rgba(26,119,202,0.06)'
            : '';

        const root     = tenantsState.serverConfigured ? OctopusApi.getInstanceUrl() : null;
        const taskHref = root && tenantsState.spaceId
            ? `${root}/app#/${encodeURIComponent(tenantsState.spaceId)}/tasks/${encodeURIComponent(task.serverTaskId)}`
            : null;
        const taskIdCell = taskHref
            ? `<a href="${escHtml(taskHref)}" target="_blank" rel="noopener" style="font-family:var(--fontFamilyCode);font-size:0.75rem;color:var(--colorPrimaryLight)">${escHtml(task.serverTaskId)}</a>`
            : `<span style="font-family:var(--fontFamilyCode);font-size:0.75rem;color:var(--colorTextTertiary)">${escHtml(task.serverTaskId)}</span>`;

        const mainRow = `
            <tr style="${rowBg}" data-task-id="${escHtml(task.id)}">
                <td>${errorIcon}<strong>${escHtml(task.projectName)}</strong></td>
                <td>${taskIdCell}</td>
                <td style="font-family:var(--fontFamilyCode);font-size:0.75rem;color:var(--colorTextTertiary)">${escHtml(task.releaseVersion)}</td>
                <td style="color:var(--colorTextTertiary)">${escHtml(task.taskType)}</td>
                <td>${renderTaskBadge(task.taskState)}</td>
                <td style="color:var(--colorTextTertiary);white-space:nowrap;font:var(--textBodyRegularSmall)">${formatDateTime(task.startedAt)}</td>
                <td style="font-family:var(--fontFamilyCode);font-size:0.75rem;color:var(--colorTextTertiary)">${escHtml(task.duration)}</td>
                <td style="text-align:right">${actionCell}</td>
            </tr>
        `;

        const errorRow = (hasError && isErrorExpanded) ? `
            <tr>
                <td colspan="8" style="background:rgba(214,61,61,0.08);padding:6px 12px 8px 36px">
                    <div style="display:flex;align-items:flex-start;gap:6px;font:var(--textBodyRegularSmall);color:var(--colorTextDanger)">
                        <i class="fa-solid fa-triangle-exclamation" style="color:var(--colorDangerLight);flex-shrink:0;margin-top:1px"></i>
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

        detail.addEventListener('click', e => {
            const btn = e.target.closest('[data-action="toggle-failures-only"]');
            if (btn) {
                const tid = btn.dataset.tenantId;
                tenantsState.failuresOnlyIds.has(tid)
                    ? tenantsState.failuresOnlyIds.delete(tid)
                    : tenantsState.failuresOnlyIds.add(tid);
                refreshDetail(tid);
            }
        });

        detail.addEventListener('click', e => {
            const icon = e.target.closest('[data-action="toggle-error"]');
            if (icon) {
                const tid = icon.dataset.taskId;
                tenantsState.errorExpandedIds.has(tid)
                    ? tenantsState.errorExpandedIds.delete(tid)
                    : tenantsState.errorExpandedIds.add(tid);
                refreshDetail(tenantId);
            }
        });

        detail.addEventListener('click', e => {
            const startBtn   = e.target.closest('[data-action="start-retry"]');
            const confirmBtn = e.target.closest('[data-action="confirm-retry"]');
            const cancelBtn  = e.target.closest('[data-action="cancel-retry"]');
            if (startBtn) {
                tenantsState.confirmingRetryId = startBtn.dataset.taskId;
                refreshDetail(tenantId);
            } else if (confirmBtn) {
                tenantsState.retriedTaskIds.add(confirmBtn.dataset.taskId);
                tenantsState.confirmingRetryId = null;
                refreshDetail(tenantId);
            } else if (cancelBtn) {
                tenantsState.confirmingRetryId = null;
                refreshDetail(tenantId);
            }
        });

        const searchInput = detail.querySelector('.tv-detail-search');
        if (searchInput) {
            searchInput.addEventListener('input', e => {
                tenantsState.detailSearchQueries[tenantId] = e.target.value;
                refreshDetail(tenantId);
            });
            searchInput.focus();
        }
    }

    function refreshDetail(tenantId) {
        const detail = document.querySelector(`[data-detail-for="${tenantId}"]`);
        if (!detail) return;
        const tenant = tenantsState.filteredTenants.find(t => t.id === tenantId);
        if (!tenant) return;
        const temp = document.createElement('div');
        temp.innerHTML = renderTenantDetailHtml(tenant);
        detail.replaceWith(temp.firstElementChild);
    }

    /* ─── Expand / collapse ──────────────────────────────────────────────── */

    function toggleExpand(tenantId) {
        if (tenantsState.expandedIds.has(tenantId)) {
            tenantsState.expandedIds.delete(tenantId);
            tenantsState.failuresOnlyIds.delete(tenantId);
            delete tenantsState.detailSearchQueries[tenantId];
        } else {
            tenantsState.expandedIds.add(tenantId);
            // Auto-enable failures-only for tenants with failures (use filteredTenants for computed status)
            const tenant = tenantsState.filteredTenants.find(t => t.id === tenantId);
            if (tenant && tenant.status === 'Has failures') {
                tenantsState.failuresOnlyIds.add(tenantId);
            }
        }
        renderTenantRows();
    }

    /* ─── Badges ─────────────────────────────────────────────────────────── */

    function renderStatusBadge(status) {
        const cfg = {
            'All succeeded': { cls: 'success', icon: 'fa-circle-check',  label: 'All succeeded' },
            'Has failures':  { cls: 'danger',  icon: 'fa-circle-xmark',  label: 'Has failures' },
            'In progress':   { cls: 'info',    icon: 'fa-clock',         label: 'In progress' },
        };
        const { cls, icon, label } = cfg[status] || cfg['All succeeded'];
        return `<span class="badge ${cls}"><i class="fa-solid ${icon}"></i> ${label}</span>`;
    }

    function renderTaskBadge(taskState) {
        const cfg = {
            Success:    { cls: 'success', icon: 'fa-circle-check',    label: 'Success' },
            Failed:     { cls: 'danger',  icon: 'fa-circle-xmark',    label: 'Failed' },
            Executing:  { cls: 'info',    icon: 'fa-clock',           label: 'Executing' },
            Queued:     { cls: 'neutral', icon: 'fa-circle',          label: 'Queued' },
            Canceled:   { cls: 'warning', icon: 'fa-circle-xmark',    label: 'Canceled' },
            TimedOut:   { cls: 'warning', icon: 'fa-clock',           label: 'Timed Out' },
            Cancelling: { cls: 'warning', icon: 'fa-clock',           label: 'Cancelling' },
        };
        const c = cfg[taskState] || cfg.Queued;
        return `<span class="badge ${c.cls}"><i class="fa-solid ${c.icon}"></i> ${c.label}</span>`;
    }

    /* ─── Version adoption matrix ───────────────────────────────────────── */

    function buildVersionMatrix() {
        const tenants = tenantsState.filteredTenants;

        // Collect unique projects across all visible tenants
        const projectSet = new Set();
        tenants.forEach(t => t.tasks.forEach(task => projectSet.add(task.projectName)));
        const allProjects = [...projectSet].sort();

        // Rank versions per project by most-recently-seen deploy date across all tenants.
        // Index 0 = latest released version, 1 = one behind, etc.
        const projectVersionOrder = {};
        allProjects.forEach(project => {
            const versionDates = {};
            tenants.forEach(tenant => {
                tenant.tasks.filter(t => t.projectName === project).forEach(task => {
                    if (!versionDates[task.releaseVersion] || task.startedAt > versionDates[task.releaseVersion]) {
                        versionDates[task.releaseVersion] = task.startedAt;
                    }
                });
            });
            projectVersionOrder[project] = Object.entries(versionDates)
                .sort(([, a], [, b]) => b - a)
                .map(([v]) => v);
        });

        // Per-tenant per-project: latest task state + last-known-good version.
        // Pre-index tasks by project to avoid O(n²) filter+sort inside the nested forEach.
        const cells = {};
        tenants.forEach(tenant => {
            const tasksByProject = {};
            tenant.tasks.forEach(t => {
                if (!tasksByProject[t.projectName]) tasksByProject[t.projectName] = [];
                tasksByProject[t.projectName].push(t);
            });
            Object.values(tasksByProject).forEach(arr => arr.sort((a, b) => b.startedAt - a.startedAt));

            cells[tenant.id] = {};
            allProjects.forEach(project => {
                const tasks = tasksByProject[project];
                if (!tasks || tasks.length === 0) { cells[tenant.id][project] = null; return; }
                const latest   = tasks[0];
                const lastGood = tasks.find(t => t.taskState === 'Success');
                cells[tenant.id][project] = {
                    version:        latest.releaseVersion,
                    taskState:      latest.taskState,
                    runningVersion: lastGood ? lastGood.releaseVersion : null,
                };
            });
        });

        // Per-project adoption summary: how many tenants are on the latest version
        const adoption = {};
        allProjects.forEach(project => {
            const latest = projectVersionOrder[project][0];
            let onLatest = 0, total = 0;
            if (latest) {
                tenants.forEach(tenant => {
                    const cell = cells[tenant.id][project];
                    if (!cell) return;
                    total++;
                    if ((cell.runningVersion || cell.version) === latest) onLatest++;
                });
            }
            adoption[project] = { onLatest, total, latest };
        });

        return { allProjects, projectVersionOrder, cells, adoption };
    }

    function renderVersionMatrix() {
        const container = document.getElementById('tv-matrix-container');
        if (!container) return;

        const tenants = tenantsState.filteredTenants;
        if (tenants.length === 0) {
            container.innerHTML = '<div class="tv-empty-state">No tenants match the current filters.</div>';
            return;
        }

        const { allProjects, projectVersionOrder, cells, adoption } = buildVersionMatrix();
        if (allProjects.length === 0) {
            container.innerHTML = '<div class="tv-empty-state">No deployment data found for these tenants.</div>';
            return;
        }

        const legend = `
            <div class="tv-matrix-legend">
                <span class="tv-matrix-legend-item"><span class="tv-matrix-badge tv-mc--current">v1.0</span> Current</span>
                <span class="tv-matrix-legend-item"><span class="tv-matrix-badge tv-mc--behind-1">v0.9</span> 1 behind</span>
                <span class="tv-matrix-legend-item"><span class="tv-matrix-badge tv-mc--behind-many">v0.8</span> 2+ behind</span>
                <span class="tv-matrix-legend-item"><span class="tv-matrix-badge tv-mc--progress">…</span> Deploying</span>
                <span class="tv-matrix-legend-item"><span class="tv-matrix-badge tv-mc--failed">vX</span> Failed</span>
                <span class="tv-matrix-legend-item"><span class="tv-matrix-badge tv-mc--none">—</span> Never deployed</span>
            </div>`;

        const theadCells = allProjects.map(project => {
            const { onLatest, total } = adoption[project];
            const pct = total > 0 ? Math.round(onLatest / total * 100) : 0;
            const barCls = pct === 100 ? 'success' : pct >= 70 ? 'warning' : 'danger';
            return `
                <th class="tv-matrix-col-head">
                    <div class="tv-matrix-project-name" title="${escHtml(project)}">${escHtml(project)}</div>
                    <div class="tv-matrix-adoption-row">
                        <div class="progress-bar tv-matrix-adoption-bar">
                            <div class="progress-fill ${barCls}" style="width:${pct}%"></div>
                        </div>
                        <span class="tv-matrix-adoption-label">${onLatest}/${total}</span>
                    </div>
                </th>`;
        }).join('');

        const root = tenantsState.serverConfigured ? OctopusApi.getInstanceUrl() : null;

        const tbodyRows = tenants.map(tenant => {
            const tenantCells = allProjects.map(project => {
                const cell = cells[tenant.id][project];
                if (!cell) return `<td class="tv-matrix-cell tv-mc--none" title="Never deployed to this project">—</td>`;

                const order    = projectVersionOrder[project];
                const running  = cell.runningVersion || cell.version;
                const vIdx     = order.indexOf(running);
                const isLive   = ['Executing','Queued','Cancelling'].includes(cell.taskState);
                const isFailed = ['Failed','TimedOut','Canceled'].includes(cell.taskState);

                let cls, icon = '', tip;
                if (isLive) {
                    cls  = 'tv-mc--progress';
                    icon = '<i class="fa-solid fa-spinner fa-spin" style="font-size:0.55rem;margin-right:2px"></i>';
                    tip  = `Deploying ${cell.version}${cell.runningVersion ? ` — currently running ${cell.runningVersion}` : ''}`;
                } else if (vIdx === 0) {
                    cls = isFailed ? 'tv-mc--failed' : 'tv-mc--current';
                    tip = isFailed ? `Failed on latest (${cell.version})` : `Up to date — ${running}`;
                } else if (vIdx === 1) {
                    cls = isFailed ? 'tv-mc--failed' : 'tv-mc--behind-1';
                    tip = `1 version behind — on ${running}, latest is ${order[0]}${isFailed ? ' (last deploy failed)' : ''}`;
                } else if (vIdx > 1) {
                    cls = isFailed ? 'tv-mc--failed' : 'tv-mc--behind-many';
                    tip = `${vIdx} versions behind — on ${running}, latest is ${order[0]}${isFailed ? ' (last deploy failed)' : ''}`;
                } else {
                    cls = 'tv-mc--unknown';
                    tip = running;
                }

                const label = running.length > 9 ? running.slice(0, 9) + '…' : running;
                return `<td class="tv-matrix-cell ${cls}" title="${escHtml(tip)}">${icon}${escHtml(label)}</td>`;
            }).join('');

            const href = root && tenantsState.spaceId
                ? `${root}/app#/${tenantsState.spaceId}/tenants/${tenant.id}/overview`
                : null;
            const nameEl = href
                ? `<a href="${escHtml(href)}" target="_blank" rel="noopener" style="color:var(--colorTextPrimary);text-decoration:none">${escHtml(tenant.name)}</a>`
                : escHtml(tenant.name);

            return `
                <tr>
                    <td class="tv-matrix-tenant-cell">
                        <div style="font:var(--textBodyBoldSmall);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${nameEl}</div>
                        <div style="font:var(--textBodyRegularXSmall);color:var(--colorTextTertiary)">${escHtml(tenant.environment)}</div>
                    </td>
                    ${tenantCells}
                </tr>`;
        }).join('');

        container.innerHTML = `
            ${legend}
            <div class="tv-matrix-wrap">
                <table class="tv-matrix">
                    <thead>
                        <tr>
                            <th class="tv-matrix-tenant-col">Tenant</th>
                            ${theadCells}
                        </tr>
                    </thead>
                    <tbody>${tbodyRows}</tbody>
                </table>
            </div>`;
    }

    /* ─── CSV export ─────────────────────────────────────────────────────── */

    function exportCSV() {
        const tenants = tenantsState.filteredTenants;
        if (tenants.length === 0) return;

        const headers = ['Tenant', 'Tenant Display ID', 'Environment', 'Deployments', 'Success Rate', 'Project', 'Release Version', 'Task Type', 'Task State', 'Started', 'Duration'];

        const rows = [];
        tenants.forEach(tenant => {
            const successCount = tenant.tasks.filter(t => t.taskState === 'Success').length;
            const successRate  = tenant.tasks.length > 0 ? Math.round(successCount / tenant.tasks.length * 100) + '%' : '--';
            tenant.tasks.forEach(task => {
                rows.push([
                    tenant.name,
                    tenant.tenantDisplayId,
                    tenant.environment,
                    tenant.tasks.filter(t => t.taskType === 'Deployment').length || tenant.tasks.length,
                    successRate,
                    task.projectName,
                    task.releaseVersion,
                    task.taskType,
                    task.taskState,
                    formatDateTime(task.startedAt),
                    task.duration,
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
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `tenant-deployments-${formatDateInput(new Date())}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /* ─── Utilities ──────────────────────────────────────────────────────── */

    function escHtml(str) {
        return DOMPurify.sanitize(String(str));
    }

    function escAttr(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatRelativeTime(date) {
        const diff = Date.now() - date.getTime();
        const secs = Math.floor(diff / 1000);
        if (secs < 60) return `${secs}s ago`;
        const mins = Math.floor(secs / 60);
        if (mins < 60) return `${mins} min${mins !== 1 ? 's' : ''} ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs} hr${hrs !== 1 ? 's' : ''} ago`;
        return `${Math.floor(hrs / 24)}d ago`;
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
        const banner = document.getElementById('tv-error-banner');
        if (banner) {
            banner.textContent = msg;
            banner.classList.remove('hidden');
        }
    }

    return { init };

})();
