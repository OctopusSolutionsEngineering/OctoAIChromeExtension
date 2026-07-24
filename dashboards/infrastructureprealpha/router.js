'use strict';
const Router = (function () {
  const VIEWS = ['overview','targets','environments','machinepolicies','workers','agents','argocd'];
  function setActive(view) {
    document.querySelectorAll('.ip-nav-item').forEach(a =>
      a.classList.toggle('active', a.getAttribute('data-view') === view));
  }
  function render() {
    const el = document.getElementById('main-content');
    const hash = (window.location.hash || '#overview').slice(1);
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
    else { el.innerHTML = '<div class="ip-state"><h3>' + view + '</h3><p>Coming in a later phase.</p></div>'; }
  }
  function init() { window.addEventListener('hashchange', render); render(); }
  return { init, render };
})();
if (typeof module !== 'undefined') { module.exports = Router; }
