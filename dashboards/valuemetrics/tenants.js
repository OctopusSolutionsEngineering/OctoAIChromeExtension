/* ==========================================================================
   TenantView — Multi-Tenanted Deployment Dashboard
   ========================================================================== */

const TenantView = (() => {
    'use strict';

    /* ─── State ──────────────────────────────────────────────────────────── */

    let _docListenersAttached = false;
    const _wireTimeouts = {};

    const tenantsState = {
        allTenants: [],
        filteredTenants: [],
        preTabFilteredTenants: [],
        activeTab: 'all',
        searchQuery: '',
        expandedIds: new Set(),
        failuresOnlyIds: new Set(),
        errorExpandedIds: new Set(),
        detailSearchQueries: {},
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
        tenantsState.detailSearchQueries = {};
        tenantsState.showFilters = false;
        tenantsState.sortBy = 'lastUpdated';
        tenantsState.sortDir = 'desc';
        tenantsState.tagFilter = [];
        tenantsState.viewMode = 'status';
        tenantsState.filters = { environment: '', projects: [], taskTypes: ['Deployment', 'Runbook Run'], dateFrom: null, dateTo: null };
        const spacesSelect = document.getElementById('tv-spaces-select');

        try {
            const spaces = await OctopusApi.get('/api/spaces/all');

            tenantsState.spaces = spaces;
            spacesSelect.replaceChildren();
            spaces.forEach(s => {
                const option = document.createElement('option');
                option.value = s.Id;
                option.textContent = s.Name;
                spacesSelect.appendChild(option);
            });

            if (spaces.length > 0) {
                await onSpaceChange(spaces[0].Id);
            }
        } catch (err) {
            showError('Failed to load spaces: ' + (err.body || err.message));
        }

        spacesSelect.addEventListener('change', () => {
            if (spacesSelect.value) onSpaceChange(spacesSelect.value);
        });

        wireUpControls();
    }

    function ensureLoadingStateElement() {
        const loadingHost = document.getElementById('tv-dashboard-content');

        if (!loadingHost) return null;

        let el = document.getElementById('tv-loading-state');

        if (el && el.parentElement !== loadingHost) {
            el.remove();
            el = null;
        }

        if (!el) {
            el = document.createElement('div');
            el.id = 'tv-loading-state';
            el.className = 'tv-loading-state';
            el.setAttribute('role', 'status');
            el.setAttribute('aria-live', 'polite');
            el.style.display = 'none';

            const spinner = document.createElement('div');
            spinner.className = 'tv-loading-state__spinner';
            spinner.setAttribute('aria-hidden', 'true');
            spinner.style.width = '24px';
            spinner.style.height = '24px';
            spinner.style.margin = '0 auto 8px';
            spinner.style.border = '3px solid rgba(0, 0, 0, 0.15)';
            spinner.style.borderTopColor = 'currentColor';
            spinner.style.borderRadius = '50%';
            spinner.style.animation = 'tv-loading-spin 0.8s linear infinite';

            const message = document.createElement('div');
            message.className = 'tv-loading-state__message';
            message.textContent = 'Loading...';

            if (!document.getElementById('tv-loading-state-style')) {
                const style = document.createElement('style');
                style.id = 'tv-loading-state-style';
                style.textContent = '@keyframes tv-loading-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }';
                document.head.appendChild(style);
            }

            el.appendChild(spinner);
            el.appendChild(message);
            loadingHost.prepend(el);
        }

        return el;
    }

    function showLoading(visible) {
        const el = ensureLoadingStateElement();

        if (!el) return;

        el.style.display = visible ? 'block' : 'none';
    }

    async function onSpaceChange(spaceId) {
        tenantsState.spaceId = spaceId;
        document.getElementById('tv-dashboard-content').classList.remove('hidden');
        showLoading(true);

        try {
            let envs, rawProjects, tenants;

            const lookbackMonths = parseInt(document.getElementById('lookback-select')?.value || '3', 10);
            const fromDate = new Date();
            if (lookbackMonths > 0) fromDate.setMonth(fromDate.getMonth() - lookbackMonths);
            else fromDate.setFullYear(fromDate.getFullYear() - 10);
            const fromDateStr = encodeURIComponent(fromDate.toISOString());
            const deployTake  = lookbackMonths <= 3 ? 500 : lookbackMonths <= 6 ? 1000 : lookbackMonths <= 12 ? 2000 : 5000;

            const chunkArray = (items, size) => {
                const chunks = [];
                for (let i = 0; i < items.length; i += size) {
                    chunks.push(items.slice(i, i + size));
                }
                return chunks;
            };

            // Fetch resources in bulk using ?ids= — one request per 100 IDs instead of one per ID.
            // Auth errors (401/403) are re-thrown so the outer catch can surface them to the user.
            const fetchResourcesByIds = async (resourceName, ids) => {
                const uniqueIds = [...new Set((ids || []).filter(Boolean))];
                if (!uniqueIds.length) return [];

                const BULK_BATCH = 100;
                const MAX_CONCURRENT_BATCHES = 4;
                const batches = chunkArray(uniqueIds, BULK_BATCH);
                const batchResults = new Array(batches.length);
                let nextBatchIndex = 0;

                const fetchBatch = async (idBatch) => {
                    const idParam = idBatch.join(',');
                    const path = resourceName === 'tasks'
                        ? `/api/tasks?ids=${idParam}&take=${BULK_BATCH}`
                        : `/api/${spaceId}/${resourceName}?ids=${idParam}&take=${BULK_BATCH}`;
                    const result = await OctopusApi.get(path);
                    return result?.Items || (Array.isArray(result) ? result : []);
                };

                const worker = async () => {
                    while (nextBatchIndex < batches.length) {
                        const currentIndex = nextBatchIndex++;
                        try {
                            batchResults[currentIndex] = await fetchBatch(batches[currentIndex]);
                        } catch (err) {
                            if (err?.status === 401 || err?.status === 403) throw err;
                            // non-auth errors: skip batch, continue with partial data
                            batchResults[currentIndex] = [];
                        }
                    }
                };

                const workerCount = Math.min(MAX_CONCURRENT_BATCHES, batches.length);
                await Promise.all(Array.from({ length: workerCount }, () => worker()));

                return batchResults.flat();
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
                                releaseVersion: releaseMap[dep.ReleaseId] || '–',
                                taskType: dep.RunbookId ? 'Runbook Run' : 'Deployment',
                                taskState: 'Unknown',
                                environmentName: envMap[dep.EnvironmentId] || dep.EnvironmentId || '',
                                startedAt: dep.Created ? new Date(dep.Created) : new Date(),
                                duration: '–',
                                machines: [],
                            };
                        }
                        return {
                            id: dep.Id,
                            serverTaskId: dep.TaskId,
                            projectName: projectMap[dep.ProjectId] || dep.ProjectId || 'Unknown project',
                            releaseVersion: releaseMap[dep.ReleaseId] || '–',
                            taskType: dep.RunbookId ? 'Runbook Run' : 'Deployment',
                            taskState: (task.State === 'Cancelled' ? 'Canceled' : task.State) || 'Unknown',
                            environmentName: envMap[dep.EnvironmentId] || dep.EnvironmentId || '',
                            startedAt: task.StartTime ? new Date(task.StartTime) : dep.Created ? new Date(dep.Created) : dep.QueueTime ? new Date(dep.QueueTime) : null,
                            duration: task.Duration || '–',
                            machines: [],
                            errorMessage: task.ErrorMessage || undefined,
                        };
                    }).filter(Boolean);

                    const status = tasks.length > 0 ? deriveTenantStatus(tasks) : 'Inactive';
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
                        lastUpdated: (() => { const times = tasks.map(t => t.startedAt ? t.startedAt.getTime() : 0).filter(t => t > 0); return new Date(times.length ? Math.max(...times) : 0); })(),
                    };
                })
                .filter(Boolean);

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
            showError('Failed to load data: ' + (err.body || err.message));
            showLoading(false);
        }
    }

    function deriveTenantStatus(tasks) {
        const taskStates = tasks.map(t => (t.taskState || '').toLowerCase());

        if (taskStates.some(taskState =>
            taskState === 'failed'
            || taskState === 'timedout'
            || taskState === 'canceled'
            || taskState === 'cancelled'
        )) {
            return 'Has failures';
        }

        if (taskStates.some(taskState =>
            taskState === 'executing'
            || taskState === 'queued'
            || taskState === 'cancelling'
        )) {
            return 'In progress';
        }

        if (taskStates.length > 0 && taskStates.every(taskState =>
            taskState === 'success'
            || taskState === 'succeeded'
        )) {
            return 'All succeeded';
        }

        return 'Unknown';
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
            document.getElementById('tv-filter-toggle-btn').setAttribute('aria-expanded', String(tenantsState.showFilters));
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

        const projectsTrigger = document.getElementById('tv-projects-trigger');
        const projectsMenu = document.getElementById('tv-projects-menu');

        function setProjectsMenuOpen(isOpen) {
            projectsMenu.classList.toggle('hidden', !isOpen);
            projectsTrigger.setAttribute('aria-expanded', String(isOpen));
            projectsMenu.setAttribute('aria-hidden', String(!isOpen));
        }

        projectsTrigger.setAttribute('aria-controls', 'tv-projects-menu');
        projectsTrigger.setAttribute('aria-haspopup', 'listbox');
        projectsTrigger.setAttribute('aria-expanded', String(!projectsMenu.classList.contains('hidden')));
        projectsMenu.setAttribute('role', 'listbox');
        projectsMenu.setAttribute('aria-multiselectable', 'true');
        projectsMenu.setAttribute('aria-labelledby', 'tv-projects-trigger');
        projectsMenu.setAttribute('aria-hidden', String(projectsMenu.classList.contains('hidden')));

        projectsTrigger.addEventListener('click', () => {
            setProjectsMenuOpen(projectsMenu.classList.contains('hidden'));
        });

        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && !projectsMenu.classList.contains('hidden')) {
                setProjectsMenuOpen(false);
                projectsTrigger.focus();
            }
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
        select.textContent = '';

        const allOption = document.createElement('option');
        allOption.value = '';
        allOption.textContent = 'All environments';
        select.appendChild(allOption);

        envs.forEach(e => {
            const option = document.createElement('option');
            option.value = e.Name;
            option.textContent = e.Name;
            select.appendChild(option);
        });
    }

    function populateProjectsFilter(projects) {
        const container = document.getElementById('tv-projects-options');
        container.textContent = '';

        const allButton = document.createElement('button');
        allButton.className = 'tv-multiselect__all-option';
        allButton.id = 'tv-projects-all-option';

        const allCheck = document.createElement('span');
        allCheck.id = 'tv-all-projects-check';
        allCheck.textContent = '☑';
        allButton.appendChild(allCheck);
        allButton.appendChild(document.createTextNode(' All projects'));
        container.appendChild(allButton);

        projects.forEach(p => {
            const button = document.createElement('button');
            button.className = 'tv-multiselect__option';
            button.dataset.project = p;

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = true;
            checkbox.className = 'tv-projects-checkbox';
            checkbox.dataset.project = p;
            checkbox.style.pointerEvents = 'none';

            button.appendChild(checkbox);
            button.appendChild(document.createTextNode(` ${p}`));
            container.appendChild(button);
        });
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

        const allCheck = document.getElementById('tv-all-projects-check');
        if (allCheck) allCheck.textContent = allSelected ? '☑' : '☐';

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
            if (!task.startedAt) return false;
            const taskTime = task.startedAt.getTime();
            if (from && taskTime < from.getTime()) return false;
            if (to   && taskTime > to.getTime())   return false;
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
                    const da = a.tasks.filter(t => t.taskType === 'Deployment').length;
                    const db = b.tasks.filter(t => t.taskType === 'Deployment').length;
                    if (da !== db) return dir * (da - db);
                    return dir * (a.tasks.length - b.tasks.length);
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
        const root = safeInstanceUrl();
        const tenantHref = root && tenantsState.spaceId
            ? `${root}/app#/${encodeURIComponent(tenantsState.spaceId)}/tenants/${encodeURIComponent(tenant.id)}/overview`
            : null;

        const nameCell = tenantHref
            ? `<a class="tv-tenant-link" href="${escHtml(tenantHref)}" title="Open in Octopus"
                  style="font:var(--textBodyBoldMedium);color:var(--colorTextPrimary);text-decoration:none">${escHtml(tenant.name)}<i class="fa-solid fa-arrow-up-right-from-square" style="font-size:0.65rem;margin-left:5px;color:var(--colorTextTertiary)"></i></a>`
            : `<span style="font:var(--textBodyBoldMedium);color:var(--colorTextPrimary)">${escHtml(tenant.name)}</span>`;

        // Tags — active filter chips are highlighted
        const tags = tenant.tags.map(tag => {
            const isFiltered = tenantsState.tagFilter.includes(tag);
            return `<span class="tv-tag-chip${isFiltered ? ' tv-tag-chip--active' : ''}">${escHtml(tag)}</span>`;
        }).join('');

        // Deployments + frequency
        const deploymentCount = tenant.tasks.filter(t => t.taskType === 'Deployment').length;
        const parsedLookbackMonths = parseInt(document.getElementById('lookback-select')?.value || '3', 10);
        const lookbackMonths  = Number.isNaN(parsedLookbackMonths) ? 3 : parsedLookbackMonths;
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

        clearTimeout(_wireTimeouts[tenant.id]);
        _wireTimeouts[tenant.id] = setTimeout(() => {
            delete _wireTimeouts[tenant.id];
            wireDetailHandlers(tenant.id);
        }, 0);
        return detail;
    }

    function renderTaskRowHtml(tenant, task) {
        const isProblematic = ['Failed', 'TimedOut', 'Canceled'].includes(task.taskState);
        const hasError    = isProblematic && !!task.errorMessage;
        const isErrorExpanded = tenantsState.errorExpandedIds.has(task.id);
        const errorIcon = hasError
            ? `<i class="fa-solid fa-triangle-exclamation" style="color:var(--colorDangerLight);cursor:pointer;margin-right:4px" data-action="toggle-error" data-task-id="${escHtml(task.id)}"></i>`
            : '';

        const actionCell = '';

        const isFailedRow    = task.taskState === 'Failed' || task.taskState === 'TimedOut';
        const isExecutingRow = task.taskState === 'Executing' || task.taskState === 'Cancelling';
        const rowBg = isFailedRow
            ? 'background:rgba(214,61,61,0.06)'
            : isExecutingRow
            ? 'background:rgba(26,119,202,0.06)'
            : '';

        const root     = safeInstanceUrl();
        const taskHref = root && tenantsState.spaceId
            ? `${root}/app#/${encodeURIComponent(tenantsState.spaceId)}/tasks/${encodeURIComponent(task.serverTaskId)}`
            : null;
        const taskIdCell = taskHref
            ? `<a href="${escHtml(taskHref)}" target="_blank" rel="noopener noreferrer" style="font-family:var(--fontFamilyCode);font-size:0.75rem;color:var(--colorPrimaryLight)">${escHtml(task.serverTaskId)}</a>`
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
            Unknown:    { cls: 'neutral', icon: 'fa-circle-question', label: 'Unknown' },
        };
        const c = cfg[taskState] || cfg.Unknown;
        return `<span class="badge ${c.cls}"><i class="fa-solid ${c.icon}"></i> ${c.label}</span>`;
    }

    /* ─── Version adoption matrix ───────────────────────────────────────── */

    function buildVersionAdoption() {
        const tenants = tenantsState.filteredTenants;

        const isVersionedDeployment = task =>
            task.taskType !== 'Runbook Run' &&
            task.releaseVersion &&
            task.releaseVersion !== '–' &&
            task.environmentName;

        // Environments in server-defined order, restricted to those that appear in versioned deployment data
        const usedEnvs = new Set();
        tenants.forEach(t => t.tasks.forEach(task => {
            if (isVersionedDeployment(task)) usedEnvs.add(task.environmentName);
        }));
        const allEnvs = tenantsState.environments
            .map(e => e.Name)
            .filter(name => usedEnvs.has(name));
        usedEnvs.forEach(e => { if (!allEnvs.includes(e)) allEnvs.push(e); });

        // Projects sorted alphabetically (only those with versioned deployments)
        const projectSet = new Set();
        tenants.forEach(t => t.tasks.forEach(task => {
            if (isVersionedDeployment(task)) projectSet.add(task.projectName);
        }));
        const allProjects = [...projectSet].sort();

        // data[project][env][version] = { tenants: [{id, name}], latestDate }
        const data = {};
        allProjects.forEach(p => {
            data[p] = {};
            allEnvs.forEach(e => { data[p][e] = {}; });
        });

        // For each tenant, take their latest versioned deployment per project×env pair
        tenants.forEach(tenant => {
            const latestByKey = {};
            tenant.tasks.forEach(task => {
                if (!isVersionedDeployment(task)) return;
                const key = `${task.projectName}|${task.environmentName}`;
                if (!latestByKey[key] || task.startedAt > latestByKey[key].startedAt) {
                    latestByKey[key] = task;
                }
            });

            Object.values(latestByKey).forEach(task => {
                const p = task.projectName;
                const e = task.environmentName;
                const v = task.releaseVersion;
                if (!data[p] || !data[p][e]) return;
                if (!data[p][e][v]) data[p][e][v] = { tenants: [], latestDate: task.startedAt };
                data[p][e][v].tenants.push({ id: tenant.id, name: tenant.name });
                if (task.startedAt > data[p][e][v].latestDate) data[p][e][v].latestDate = task.startedAt;
            });
        });

        // Sort versions newest-first per project×env
        const versionOrder = {};
        allProjects.forEach(p => {
            versionOrder[p] = {};
            allEnvs.forEach(e => {
                versionOrder[p][e] = Object.entries(data[p][e])
                    .sort(([, a], [, b]) => b.latestDate - a.latestDate)
                    .map(([v]) => v);
            });
        });

        return { allProjects, allEnvs, data, versionOrder };
    }

    function renderVersionMatrix() {
        const container = document.getElementById('tv-matrix-container');
        if (!container) return;

        const tenants = tenantsState.filteredTenants;
        if (tenants.length === 0) {
            container.innerHTML = '<div class="tv-empty-state">No tenants match the current filters.</div>';
            return;
        }

        const { allProjects, allEnvs, data, versionOrder } = buildVersionAdoption();

        if (allProjects.length === 0) {
            container.innerHTML = '<div class="tv-empty-state">No versioned deployments found for the current filters. Runbook runs are excluded from this view.</div>';
            return;
        }

        const root = safeInstanceUrl();

        const theadCells = allEnvs.map(env =>
            `<th class="tv-matrix-col-head">
                <div class="tv-matrix-project-name" title="${escHtml(env)}">${escHtml(env)}</div>
            </th>`
        ).join('');

        const tbodyRows = allProjects.map(project => {
            const envCells = allEnvs.map(env => {
                const versions = versionOrder[project][env];
                if (!versions || versions.length === 0) {
                    return `<td class="tv-matrix-cell tv-ma-cell tv-mc--none">—</td>`;
                }

                const rows = versions.map((version, idx) => {
                    const { tenants: vTenants } = data[project][env][version];
                    const count = vTenants.length;
                    const cls   = idx === 0 ? 'tv-mc--current' : idx === 1 ? 'tv-mc--behind-1' : 'tv-mc--behind-many';
                    const label = version.length > 18 ? version.slice(0, 18) + '…' : version;

                    const versionBar = `<div class="tv-ma-version-row ${cls}">
                        <span class="tv-ma-version" title="${escHtml(version)}">${escHtml(label)}</span>
                        <span class="tv-ma-count">${count} tenant${count !== 1 ? 's' : ''}</span>
                    </div>`;

                    if (idx === 0) return versionBar;

                    // Behind versions: list the actual tenant names so they're actionable
                    const tenantLinks = vTenants
                        .slice()
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map(t => {
                            const href = root && tenantsState.spaceId
                                ? `${root}/app#/${encodeURIComponent(tenantsState.spaceId)}/tenants/${encodeURIComponent(t.id)}/overview`
                                : null;
                            return href
                                ? `<a class="tv-ma-tenant-name" href="${escHtml(href)}" target="_blank" rel="noopener noreferrer">${escHtml(t.name)}</a>`
                                : `<span class="tv-ma-tenant-name">${escHtml(t.name)}</span>`;
                        }).join('');

                    return `${versionBar}<div class="tv-ma-tenant-list">${tenantLinks}</div>`;
                }).join('');

                return `<td class="tv-matrix-cell tv-ma-cell">${rows}</td>`;
            }).join('');

            return `<tr>
                <td class="tv-matrix-tenant-cell tv-ma-project-cell">
                    <div style="font:var(--textBodyBoldSmall)">${escHtml(project)}</div>
                </td>
                ${envCells}
            </tr>`;
        }).join('');

        container.innerHTML = `
            <div class="tv-matrix-legend">
                <span class="tv-matrix-legend-item"><span class="tv-ma-legend-dot tv-mc--current"></span> Latest version</span>
                <span class="tv-matrix-legend-item"><span class="tv-ma-legend-dot tv-mc--behind-1"></span> 1 version behind</span>
                <span class="tv-matrix-legend-item"><span class="tv-ma-legend-dot tv-mc--behind-many"></span> 2+ versions behind</span>
            </div>
            <div class="tv-matrix-wrap">
                <table class="tv-matrix">
                    <thead>
                        <tr>
                            <th class="tv-matrix-tenant-col">Project</th>
                            ${theadCells}
                        </tr>
                    </thead>
                    <tbody>${tbodyRows}</tbody>
                </table>
            </div>`;
    }

    /* ─── CSV export ─────────────────────────────────────────────────────── */



    /* ─── Utilities ──────────────────────────────────────────────────────── */

    function escHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatRelativeTime(date) {
        if (!date) return '–';
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
        if (!date) return '–';
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const h = String(date.getHours()).padStart(2, '0');
        const m = String(date.getMinutes()).padStart(2, '0');
        return `${months[date.getMonth()]} ${date.getDate()}, ${h}:${m}`;
    }

    function formatDateInput(date) {
        return date.toISOString().slice(0, 10);
    }

    function safeInstanceUrl() {
        const url = OctopusApi.getInstanceUrl();
        if (!url) return null;
        try {
            const { protocol } = new URL(url);
            return (protocol === 'http:' || protocol === 'https:') ? url : null;
        } catch {
            return null;
        }
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
