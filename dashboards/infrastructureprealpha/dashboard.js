'use strict';
var IP = { estate:null, serverUrl:null, context:{}, filters:{}, search:'', page:1, detailId:null,
  wFilters:{}, wSearch:'', wPage:1 };

async function ipBoot() {
  // Theme init — applied before anything else renders so there's no light/dark flash.
  try {
    const stored = localStorage.getItem('iprealpha:theme');
    const dark = stored ? stored === 'dark'
      : (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', !!dark);
    IP.theme = dark ? 'dark' : 'light';
  } catch (e) { IP.theme = 'light'; }

  const el = document.getElementById('main-content');
  el.innerHTML = Views.stateView('loading');
  try {
    const { serverUrl, context } = await Data.readConfig();
    IP.serverUrl = serverUrl; IP.context = context;
    if (!serverUrl) { el.innerHTML = Views.stateView('noconfig'); return; }
    const res = await Data.loadEstate(serverUrl);
    if (res.status === 'auth')  { el.innerHTML = Views.stateView('auth'); return; }
    if (res.status === 'error') { el.innerHTML = Views.stateView('error', 'Failed to reach the Octopus API'); return; }
    if (!res.perSpace || !res.perSpace.length) {
      // No spaces at all (or nothing loadable) — nothing to switch between.
      IP.estate = Data.buildEstate([]);
      Onboarding.renderFirstRun(IP);
      return;
    }
    IP.perSpace = res.perSpace;
    IP.spaces = (res.spaces || []).map(s => ({ Id: s.Id, Name: s.Name }));
    const ctx = IP.context || {};
    const m = (IP.spaces || []).find(s => s.Name === ctx.space);
    IP.spaceId = m ? m.Id : null;
    IP.rescope = () => {
      IP.estate = Data.buildEstate(IP.spaceId ? IP.perSpace.filter(s => s.sp.Id === IP.spaceId) : IP.perSpace);
    };
    IP.rescope();
    const switchEl = document.getElementById('ip-space-switch');
    if (switchEl) { switchEl.innerHTML = Views.renderSpaceSwitch(IP); Views.bindSpaceSwitch(IP); }
    const themeEl = document.getElementById('ip-theme-toggle');
    if (themeEl) { themeEl.innerHTML = Views.renderThemeToggle(IP); Views.bindThemeToggle(IP); }
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
