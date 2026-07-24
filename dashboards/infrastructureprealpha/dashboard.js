'use strict';
var IP = { estate:null, serverUrl:null, context:{}, filters:{}, search:'', page:1, detailId:null,
  wFilters:{}, wSearch:'', wPage:1 };

async function ipBoot() {
  const el = document.getElementById('main-content');
  el.innerHTML = Views.stateView('loading');
  try {
    const { serverUrl, context } = await Data.readConfig();
    IP.serverUrl = serverUrl; IP.context = context;
    if (!serverUrl) { el.innerHTML = Views.stateView('noconfig'); return; }
    const res = await Data.loadEstate(serverUrl);
    if (res.status === 'auth')  { el.innerHTML = Views.stateView('auth'); return; }
    if (res.status === 'error') { el.innerHTML = Views.stateView('error', 'Failed to reach the Octopus API'); return; }
    if (res.status === 'empty') { IP.estate = Data.buildEstate([]); Onboarding.renderFirstRun(IP); return; }
    IP.estate = Data.buildEstate(res.perSpace);
    Router.init();
  } catch (e) {
    // Never leave the loading spinner up: surface any unexpected failure.
    el.innerHTML = Views.stateView('error', (e && e.message) || 'Unexpected error');
  }
}

if (typeof module === 'undefined' || !module.exports) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ipBoot);
  else ipBoot();
}
