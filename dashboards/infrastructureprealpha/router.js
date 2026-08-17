'use strict';
const Router = (function () {
  const VIEWS = ['overview','targets','environments','machinepolicies','workers','agents','argocd','projects','tenants'];
  // Views that render inside the Deployment Targets section shell.
  const IP_TARGET_SECTION_VIEWS = ['targets','agents','machinepolicies'];
  function setActive(view) {
    document.querySelectorAll('.ip-nav-item').forEach(a =>
      a.classList.toggle('active', a.getAttribute('data-view') === view));
  }
  function render() {
    const el = document.getElementById('main-content');
    const hash = (window.location.hash || '#overview').slice(1);
    // A space that failed to hydrate has no estate to route over, and rendering
    // infrastructure views against it would show zeros as though the space were
    // empty. Projects is not one of those views: it reads the project dashboard
    // directly, so being unable to read machines does not cost you the projects.
    const needsEstate = typeof Data !== 'undefined' && Data.viewNeedsEstate
      ? Data.viewNeedsEstate(hash) : true;
    if (IP.spaceError && needsEstate) { el.innerHTML = Views.stateView('error', IP.spaceError); return; }
    // Cold-start greets you on the landing view when there's no infrastructure; it never
    // intercepts an explicit nav click. Every other view renders itself and shows its own
    // empty state, so a space with no targets can still reach its environments, its
    // machine policies, and the add-target walkthrough.
    if (needsEstate && typeof Data !== 'undefined' && Data.coldStartApplies && Data.coldStartApplies(hash, IP.estate)) {
      Onboarding.renderFirstRun(IP);
      return;
    }
    // add-target walkthrough: #targets/new — must be tested before the detail route below,
    // which would otherwise treat "new" as a machine id and render "target not found".
    if (hash === 'targets/new') {
      setActive('targets');
      el.innerHTML = Views.renderAddTarget(IP);
      Views.bindAddTarget && Views.bindAddTarget(IP);
      return;
    }
    // target detail route: #targets/<id>
    if (hash.indexOf('targets/') === 0) {
      let raw = hash.slice('targets/'.length);
      try { IP.detailId = decodeURIComponent(raw); } catch (e) { IP.detailId = raw; }
      setActive('targets');
      el.innerHTML = Views.renderTargetDetail(IP);
      Views.bindTargetDetail && Views.bindTargetDetail(IP);
      // Per-target tasks and connection aren't in the boot payload, so fetch them now and
      // fill the cards when they land. The id is re-checked on resolve — by then the user
      // may have navigated to a different target, or away entirely.
      const wanted = IP.detailId;
      const target = (IP.estate.targets || []).find(x => x.id === wanted);
      if (target && Data.fetchMachineDetail) {
        Data.fetchMachineDetail(target.spaceId, target.id)
          .then(detail => { if (IP.detailId === wanted) Views.fillTargetDetail(IP, detail); })
          .catch(() => { if (IP.detailId === wanted) Views.fillTargetDetail(IP, { tasks: null, connection: null }); });
      }
      return;
    }
    if (hash.indexOf('projects/') === 0) {
      setActive('projects');
      let rawP = hash.slice('projects/'.length);
      let projectId; try { projectId = decodeURIComponent(rawP); } catch (e) { projectId = rawP; }
      const staleP = !IP.projectMap || IP.projectMap.projectId !== projectId
        || IP.projectMap.spaceId !== IP.spaceId;
      if (staleP) IP.projectMap = { status: 'loading', projectId: projectId, spaceId: IP.spaceId };
      el.innerHTML = Views.renderProjectMap(IP);
      if (staleP) {
        const wantedSpace = IP.spaceId;
        Data.fetchProjectMap(wantedSpace, projectId)
          .then(payload => {
            if (IP.spaceId !== wantedSpace || !IP.projectMap || IP.projectMap.projectId !== projectId) return;
            IP.projectMap = { status: 'ready', projectId: projectId, spaceId: wantedSpace,
              model: Data.projectMapModel(payload) };
            render();
          })
          .catch(e => {
            if (IP.spaceId !== wantedSpace || !IP.projectMap || IP.projectMap.projectId !== projectId) return;
            IP.projectMap = { status: 'error', projectId: projectId, spaceId: wantedSpace,
              error: e && e.auth ? 'Your session isn\'t authenticated.' : (e && e.code) || 'The project request failed.' };
            render();
          });
      }
      return;
    }
    if (hash.indexOf('tenants/') === 0) {
      setActive('tenants');
      let raw = hash.slice('tenants/'.length);
      let tenantId; try { tenantId = decodeURIComponent(raw); } catch (e) { tenantId = raw; }
      const stale = !IP.tenantDetail || IP.tenantDetail.tenantId !== tenantId || IP.tenantDetail.spaceId !== IP.spaceId;
      if (stale) IP.tenantDetail = { status: 'loading', tenantId: tenantId, spaceId: IP.spaceId };
      el.innerHTML = Views.renderTenantDetail(IP);
      Views.bindTenantDetail && Views.bindTenantDetail(IP);
      if (stale) { IP.tenantTab = 'Overview'; IP.flags = null; }
      if (stale) {
        const wantedSpace = IP.spaceId;
        const stillWanted = () => IP.spaceId === wantedSpace
          && IP.tenantDetail && IP.tenantDetail.tenantId === tenantId;
        // The tenant page reuses the dashboard the list already fetched when it
        // is there, and asks for one when it is not. Variables and machines are
        // separate: either can fail without costing the page.
        const dashboard = (IP.tenants && IP.tenants.status === 'ready' && IP.tenants.raw)
          ? Promise.resolve(IP.tenants.raw) : Data.fetchDashboard(wantedSpace);
        Promise.all([
          Data.fetchTenant(wantedSpace, tenantId),
          dashboard,
          Data.fetchTenantVariables(wantedSpace, tenantId).then(v => ({ v: v }))
            .catch(() => ({ err: 'Tenant variables could not be read, so readiness is unknown.' })),
          Data.fetchTenantMachines(wantedSpace).then(mach => ({ mach: mach }))
            .catch(() => ({ err: 'Deployment targets cannot be read in this space, so the targets behind this tenant are unknown.' }))
        ])
          .then(res => {
            if (!stillWanted()) return;
            IP.tenantDetail = { status: 'ready', tenantId: tenantId, spaceId: wantedSpace,
              model: Data.tenantDetailModel({ tenant: res[0], dashboard: res[1],
                variables: res[2].v, variablesError: res[2].err,
                machines: res[3].mach, machinesError: res[3].err }) };
            render();

            // Flags are one request per connected project, so they follow the
            // page rather than holding it up. Failing leaves the rest intact.
            const tenantDoc = res[0] || {};
            const projectIds = Object.keys(tenantDoc.ProjectEnvironments || {});
            const envNames = {}; ((res[1] || {}).Environments || []).forEach(e => { envNames[e.Id] = e.Name; });
            const projNames = {}; ((res[1] || {}).Projects || []).forEach(pr => { projNames[pr.Id] = pr.Name; });
            const connected = {}; projectIds.forEach(pid => { connected[pid] = tenantDoc.ProjectEnvironments[pid] || []; });
            if (projectIds.length) {
              IP.flags = { status: 'loading' };
              Data.fetchTenantFlags(wantedSpace, projectIds)
                .then(payload => {
                  if (!stillWanted()) return;
                  IP.flags = { status: 'ready',
                    model: Data.tenantFlagModel(payload, tenantDoc, connected, envNames, projNames) };
                  render();
                })
                .catch(() => {
                  if (!stillWanted()) return;
                  IP.flags = { status: 'error', error: 'Feature flags could not be read for this tenant\'s projects.' };
                  render();
                });
            }
          })
          .catch(e => {
            if (!stillWanted()) return;
            IP.tenantDetail = { status: 'error', tenantId: tenantId, spaceId: wantedSpace,
              error: e && e.auth ? 'Your session isn\'t authenticated.' : (e && e.code) || 'The tenant request failed.' };
            render();
          });
      }
      return;
    }
    const view = VIEWS.includes(hash) ? hash : 'overview';
    // Agents and machine policies are tabs inside the Deployment Targets section rather than
    // nav items of their own, so the sidebar highlights the section they live in. Their
    // routes are unchanged: the tabs are anchors, and the overview's agent-versions pill
    // still links straight to #agents.
    setActive(IP_TARGET_SECTION_VIEWS.includes(view) ? 'targets' : view);
    if (view === 'overview')  { el.innerHTML = Views.renderOverview(IP.estate.overview, IP.estate); }
    else if (view === 'targets') { el.innerHTML = Views.renderTargets(IP); Views.bindTargets && Views.bindTargets(IP); }
    else if (view === 'environments') { el.innerHTML = Views.renderEnvironments(IP); Views.bindEnvironments && Views.bindEnvironments(IP); }
    else if (view === 'machinepolicies') { el.innerHTML = Views.renderMachinePolicies(IP); }
    else if (view === 'workers') { el.innerHTML = Views.renderWorkers(IP); Views.bindWorkers && Views.bindWorkers(IP); }
    else if (view === 'agents') { el.innerHTML = Views.renderAgents(IP); Views.bindAgents && Views.bindAgents(IP); }
    else if (view === 'argocd') { el.innerHTML = Views.renderArgo(IP); }
    else if (view === 'tenants') {
      // Three requests regardless of tenant count: the tenant pages, one
      // dashboard (which already carries every tenant's current deployments)
      // and the tag sets that drive the facet groups.
      const needed = !IP.tenants || IP.tenants.spaceId !== IP.spaceId;
      if (needed) { IP.tenants = { status: 'loading', spaceId: IP.spaceId }; IP.tenantSel = {}; IP.tenantPage = 0; }
      el.innerHTML = Views.renderTenants(IP);
      Views.bindTenants && Views.bindTenants(IP);
      if (needed && Data.fetchTenants) {
        const wanted = IP.spaceId;
        Promise.all([
          Data.fetchTenants(wanted),
          Data.fetchDashboard(wanted),
          Data.fetchTagSets(wanted).catch(() => [])
        ])
          .then(res => {
            if (IP.spaceId !== wanted) return;
            IP.tenants = { status: 'ready', spaceId: wanted, raw: res[1],
              model: Data.tenantsModel({ tenants: res[0], dashboard: res[1], tagSets: res[2] }) };
            render();
          })
          .catch(e => {
            if (IP.spaceId !== wanted) return;
            IP.tenants = { status: 'error', spaceId: wanted,
              error: e && e.auth ? 'Your session isn\'t authenticated. Sign in to Octopus and reopen this dashboard.'
                : (e && e.code) || 'The tenant request failed.' };
            render();
          });
      }
    }
    else if (view === 'projects') {
      // The project dashboard isn't in the boot payload — it's one request, made
      // the first time someone opens this section, and re-made when they switch
      // space. Keyed on spaceId so a switch can't leave the previous space's
      // releases on screen.
      const needed = !IP.releases || IP.releases.spaceId !== IP.spaceId;
      if (needed) { IP.releases = { status: 'loading', spaceId: IP.spaceId }; IP.projectHistory = {}; IP.progressionRaw = {}; IP.projectFlags = {}; IP.flagEventsRaw = {}; IP.varEventsRaw = {}; IP.projectOpen = {}; }
      el.innerHTML = Views.renderProjects(IP);
      Views.bindProjects && Views.bindProjects(IP);
      // Expanding a project fetches its release history once and keeps it for
      // the session. Re-render is driven from here so the view stays a pure
      // string builder.
      // Columns come from the group the project sits in, not the estate-wide
      // set, or an expanded row would not line up with the grid it opened from.
      const gridFor = projectId => {
        const model = IP.releases && IP.releases.model;
        const group = model && (model.groups || []).find(g => g.projects.some(p => p.id === projectId));
        return group ? group.environments : (model ? model.environments : []);
      };
      const windowHours = () => {
        const label = IP.historyWindow || (Data.HISTORY_WINDOWS[0] && Data.HISTORY_WINDOWS[0].label);
        const w = Data.HISTORY_WINDOWS.find(x => x.label === label);
        return w ? w.hours : null;
      };
      // The raw payload is kept so changing the window re-filters what we
      // already have instead of asking the server again.
      IP.rebuildHistories = function () {
        IP.progressionRaw = IP.progressionRaw || {};
        IP.projectHistory = IP.projectHistory || {};
        Object.keys(IP.progressionRaw).forEach(pid => {
          IP.projectHistory[pid] = { status: 'ready',
            model: Data.progressionModel(IP.progressionRaw[pid], gridFor(pid), windowHours()) };
        });
        IP.flagEventsRaw = IP.flagEventsRaw || {};
        Object.keys(IP.flagEventsRaw).forEach(pid => {
          const cur = IP.projectFlags && IP.projectFlags[pid];
          if (cur && cur.status === 'ready') {
            cur.changes = Data.flagChangeModel(IP.flagEventsRaw[pid], gridFor(pid), windowHours());
          }
        });
        IP.varEventsRaw = IP.varEventsRaw || {};
        Object.keys(IP.varEventsRaw).forEach(pid => {
          const cur = IP.projectFlags && IP.projectFlags[pid];
          if (cur && cur.status === 'ready') {
            cur.variables = Data.variableChangeModel(IP.varEventsRaw[pid], gridFor(pid), windowHours());
          }
        });
      };
      // Flags are a second, independent request on expand. It failing must not
      // take the release history with it, so they are tracked separately.
      IP.loadProjectFlags = function (projectId) {
        IP.projectFlags = IP.projectFlags || {};
        if (IP.projectFlags[projectId]) return;
        IP.projectFlags[projectId] = { status: 'loading' };
        const wantedSpace = IP.spaceId;
        // Two requests: current state, and the audit trail that gives the
        // changes timestamps. Events failing leaves the current state usable.
        // Three requests: current flag state, plus the two audit trails that
        // give flag and variable changes their timestamps. Either trail may
        // fail on its own without taking the others down.
        Promise.all([
          Data.fetchFeatureToggles(wantedSpace, projectId),
          Data.fetchFlagEvents(wantedSpace, projectId).catch(() => ({ Items: [] })),
          Data.fetchVariableEvents(wantedSpace, projectId).catch(() => ({ Items: [] }))
        ])
          .then(res => {
            if (IP.spaceId !== wantedSpace) return;
            IP.flagEventsRaw = IP.flagEventsRaw || {};
            IP.varEventsRaw = IP.varEventsRaw || {};
            IP.flagEventsRaw[projectId] = res[1];
            IP.varEventsRaw[projectId] = res[2];
            IP.projectFlags[projectId] = { status: 'ready',
              model: Data.featureFlagModel(res[0], gridFor(projectId)),
              changes: Data.flagChangeModel(res[1], gridFor(projectId), windowHours()),
              variables: Data.variableChangeModel(res[2], gridFor(projectId), windowHours()) };
            render();
          })
          .catch(e => {
            if (IP.spaceId !== wantedSpace) return;
            // A space without the feature-flag preview simply has no endpoint;
            // that is a blank section, not an error worth shouting about.
            const missing = e && (e.code === '404 Not Found' || String(e.code || '').indexOf('404') === 0);
            IP.projectFlags[projectId] = missing
              ? { status: 'ready', model: { flags: [], total: 0, settled: {}, truncated: false } }
              : { status: 'error', error: e && e.auth ? 'Your session isn\'t authenticated.'
                  : 'Feature flags could not be read for this project.' };
            render();
          });
      };
      IP.loadProjectHistory = function (projectId) {
        IP.projectHistory = IP.projectHistory || {};
        IP.progressionRaw = IP.progressionRaw || {};
        if (IP.projectHistory[projectId]) return;
        IP.projectHistory[projectId] = { status: 'loading' };
        const wantedSpace = IP.spaceId;
        Data.fetchProgression(wantedSpace, projectId)
          .then(prog => {
            if (IP.spaceId !== wantedSpace) return;
            IP.progressionRaw[projectId] = prog;
            IP.projectHistory[projectId] = { status: 'ready',
              model: Data.progressionModel(prog, gridFor(projectId), windowHours()) };
            render();
          })
          .catch(e => {
            if (IP.spaceId !== wantedSpace) return;
            IP.projectHistory[projectId] = { status: 'error',
              error: e && e.auth ? 'Your session isn\'t authenticated.' : (e && e.code) || 'The release history request failed.' };
            render();
          });
      };
      if (needed && Data.fetchDashboard) {
        const wanted = IP.spaceId;
        Data.fetchDashboard(wanted)
          .then(d => {
            if (IP.spaceId !== wanted) return;
            IP.releases = { status: 'ready', spaceId: wanted, model: Data.releasesModel(d) };
            render();
          })
          .catch(e => {
            if (IP.spaceId !== wanted) return;
            const msg = e && e.auth ? 'Your session isn\'t authenticated. Sign in to Octopus and reopen this dashboard.'
              : (e && e.code) || 'The dashboard request failed.';
            IP.releases = { status: 'error', spaceId: wanted, error: msg };
            render();
          });
      }
    }
    else { el.innerHTML = '<div class="ip-state"><h3>' + view + '</h3><p>Coming in a later phase.</p></div>'; }
  }
  function init() { window.addEventListener('hashchange', render); render(); }
  return { init, render };
})();
if (typeof module !== 'undefined') { module.exports = Router; }
