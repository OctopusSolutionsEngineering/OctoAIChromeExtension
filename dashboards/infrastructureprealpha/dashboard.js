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
    const listed = await Data.loadSpaces(serverUrl);
    if (listed.status === 'auth')  { el.innerHTML = Views.stateView('auth'); return; }
    if (listed.status === 'error') { el.innerHTML = Views.stateView('error', 'Failed to reach the Octopus API'); return; }

    IP.spaces = (listed.spaces || []).map(s => ({ Id: s.Id, Name: s.Name }));
    IP.spaceCache = {};

    if (!IP.spaces.length) {
      // No spaces at all — nothing to switch between. Still go through Router.init():
      // rendering first-run directly and returning skips the hashchange listener
      // entirely, which leaves every nav item inert and strands the user on the
      // cold-start screen. The router's own empty-estate check draws first-run for each
      // route, and keeps #targets/new reachable.
      IP.estate = Data.buildEstate([]);
      IP.perSpace = [];
      IP.rescope = async () => { IP.estate = Data.buildEstate([]); };
      const themeOnly = document.getElementById('ip-theme-toggle');
      if (themeOnly) { themeOnly.innerHTML = Views.renderThemeToggle(IP); Views.bindThemeToggle(IP); }
      Router.init();
      return;
    }

    // Always a concrete space: the extension's context space when it matches, otherwise
    // the first one. There is no all-spaces view, so there is no null case to carry.
    const ctx = IP.context || {};
    const m = IP.spaces.find(s => s.Name === ctx.space);
    IP.spaceId = (m || IP.spaces[0]).Id;

    // Hydrate on demand and remember the result, so switching back to a space already
    // seen costs nothing. Only the selected space is ever loaded — one space's six
    // requests instead of the whole instance's.
    const hydrate = async (sp) => {
      if (!(sp.Id in IP.spaceCache)) IP.spaceCache[sp.Id] = await Data.hydrateSpace(sp);
      return IP.spaceCache[sp.Id];
    };
    IP.rescope = async () => {
      const sp = IP.spaces.find(s => s.Id === IP.spaceId) || IP.spaces[0];
      const hydrated = await hydrate(sp);
      IP.perSpace = hydrated ? [hydrated] : [];
      IP.estate = Data.buildEstate(IP.perSpace);
      // Octopus listed this space but its infrastructure wouldn't load. That is a read
      // failure, not an empty estate, and not an auth failure either since the space list
      // came back — usually a permissions boundary on that space. Held on IP so the
      // router renders it; setting innerHTML here would just be overwritten by the first
      // route render, and the switcher must stay live so another space is one click away.
      IP.spaceError = hydrated ? null
        : 'Octopus listed this space but its infrastructure could not be read. '
          + 'Your account may not have permission here — try another space.';
    };
    await IP.rescope();

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
