'use strict';
var IP = { estate:null, serverUrl:null, context:{}, filters:{}, search:'', page:1, detailId:null };

async function ipBoot() {
  const el = document.getElementById('main-content');
  el.innerHTML = Views.stateView('loading');
  const { serverUrl, context } = await Data.readConfig();
  IP.serverUrl = serverUrl; IP.context = context;
  const res = await Data.loadEstate(serverUrl);
  if (res.status === 'auth')  { el.innerHTML = Views.stateView('auth'); return; }
  if (res.status === 'error') { el.innerHTML = Views.stateView('error', 'Failed to reach the Octopus API'); return; }
  if (res.status === 'empty') { IP.estate = Data.buildEstate([]); Onboarding.renderFirstRun(IP); return; }
  IP.estate = Data.buildEstate(res.perSpace);
  Router.init();
}

if (typeof module === 'undefined' || !module.exports) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ipBoot);
  else ipBoot();
}
