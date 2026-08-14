'use strict';
const Router = (function () {
  const VIEWS = ['overview','targets','environments','machinepolicies','workers','agents','argocd','projects'];
  // Views that render inside the Deployment Targets section shell.
  const IP_TARGET_SECTION_VIEWS = ['targets','agents','machinepolicies'];
  function setActive(view) {
    document.querySelectorAll('.ip-nav-item').forEach(a =>
      a.classList.toggle('active', a.getAttribute('data-view') === view));
  }
  function render() {
    const el = document.getElementById('main-content');
    // A space that failed to hydrate has no estate to route over, and rendering views
    // against it would show zeros as though the space were empty.
    if (IP.spaceError) { el.innerHTML = Views.stateView('error', IP.spaceError); return; }
    const hash = (window.location.hash || '#overview').slice(1);
    // Cold-start greets you on the landing view when there's no infrastructure; it never
    // intercepts an explicit nav click. Every other view renders itself and shows its own
    // empty state, so a space with no targets can still reach its environments, its
    // machine policies, and the add-target walkthrough.
    if (typeof Data !== 'undefined' && Data.coldStartApplies && Data.coldStartApplies(hash, IP.estate)) {
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
    else if (view === 'projects') {
      // The project dashboard isn't in the boot payload — it's one request, made
      // the first time someone opens this section, and re-made when they switch
      // space. Keyed on spaceId so a switch can't leave the previous space's
      // releases on screen.
      const needed = !IP.releases || IP.releases.spaceId !== IP.spaceId;
      if (needed) IP.releases = { status: 'loading', spaceId: IP.spaceId };
      el.innerHTML = Views.renderProjects(IP);
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
