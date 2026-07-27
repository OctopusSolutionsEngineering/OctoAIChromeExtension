'use strict';
const Router = (function () {
  const VIEWS = ['overview','targets','environments','machinepolicies','workers','agents','argocd'];
  function setActive(view) {
    document.querySelectorAll('.ip-nav-item').forEach(a =>
      a.classList.toggle('active', a.getAttribute('data-view') === view));
  }
  function render() {
    const el = document.getElementById('main-content');
    // An empty scope shows cold-start for every route except the add-target walkthrough —
    // an empty estate is precisely when someone wants that, so it must not bounce back.
    const rawHash = (window.location.hash || '#overview').slice(1);
    if (rawHash !== 'targets/new'
        && typeof Data !== 'undefined' && Data.isEmptyEstate && Data.isEmptyEstate(IP.estate)) {
      Onboarding.renderFirstRun(IP);
      return;
    }
    const hash = (window.location.hash || '#overview').slice(1);
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
      return;
    }
    const view = VIEWS.includes(hash) ? hash : 'overview';
    setActive(view);
    if (view === 'overview')  { el.innerHTML = Views.renderOverview(IP.estate.overview, IP.estate); }
    else if (view === 'targets') { el.innerHTML = Views.renderTargets(IP); Views.bindTargets && Views.bindTargets(IP); }
    else if (view === 'environments') { el.innerHTML = Views.renderEnvironments(IP); Views.bindEnvironments && Views.bindEnvironments(IP); }
    else if (view === 'machinepolicies') { el.innerHTML = Views.renderMachinePolicies(IP); }
    else if (view === 'workers') { el.innerHTML = Views.renderWorkers(IP); Views.bindWorkers && Views.bindWorkers(IP); }
    else if (view === 'agents') { el.innerHTML = Views.renderAgents(IP); Views.bindAgents && Views.bindAgents(IP); }
    else if (view === 'argocd') { el.innerHTML = Views.renderArgo(IP); }
    else { el.innerHTML = '<div class="ip-state"><h3>' + view + '</h3><p>Coming in a later phase.</p></div>'; }
  }
  function init() { window.addEventListener('hashchange', render); render(); }
  return { init, render };
})();
if (typeof module !== 'undefined') { module.exports = Router; }
