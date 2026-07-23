'use strict';
// Estate data layer — populated in Tasks 1 & 2.

let _serverUrl = null;
function setServerUrl(url) { _serverUrl = url; }
function apiUrl(path) { return new URL(path, _serverUrl).toString(); }

async function fetchJson(path) {
  const res = await fetch(apiUrl(path), {
    method: 'GET', credentials: 'include', headers: { Accept: 'application/json' } });
  if (res.status === 401 || res.status === 403) { const e = new Error('auth'); e.auth = true; throw e; }
  if (!res.ok) { const e = new Error(res.status + ' ' + res.statusText); e.code = res.status + ' ' + res.statusText; throw e; }
  return res.json();
}

function readConfig() {
  return new Promise(resolve => {
    if (typeof dashboardGetConfig !== 'function') { resolve({ serverUrl: _serverUrl, context: {} }); return; }
    dashboardGetConfig(cfg => resolve({
      serverUrl: (cfg && cfg.lastServerUrl) || _serverUrl,
      context: (cfg && cfg.context) || {}
    }));
  });
}

async function loadEstate(serverUrl) {
  setServerUrl(serverUrl);
  let spaces;
  try { spaces = await fetchJson('/api/spaces/all'); }
  catch (e) { return { status: e && e.auth ? 'auth' : 'error', spaces: [], perSpace: [] }; }
  if (!spaces || !spaces.length) return { status: 'empty', spaces: [], perSpace: [] };

  let anyAuth = false;
  const perSpace = (await Promise.all(spaces.map(async sp => {
    try {
      const [envs, policies, tenants, machines, workerpools, workers] = await Promise.all([
        fetchJson('/api/' + sp.Id + '/environments/all').catch(() => []),
        fetchJson('/api/' + sp.Id + '/machinepolicies/all').catch(() => []),
        fetchJson('/api/' + sp.Id + '/tenants/all').catch(() => []),
        fetchJson('/api/' + sp.Id + '/machines/all'),
        fetchJson('/api/' + sp.Id + '/workerpools/all').catch(() => []),
        fetchJson('/api/' + sp.Id + '/workers/all').catch(() => [])
      ]);
      return { sp, envs, policies, tenants, machines, workerpools, workers };
    } catch (e) { if (e && e.auth) anyAuth = true; return null; }
  }))).filter(Boolean);

  if (!perSpace.length) return { status: anyAuth ? 'auth' : 'error', spaces, perSpace: [] };
  const anyMachines = perSpace.some(s => (s.machines || []).length);
  const anyWorkers = perSpace.some(s => (s.workers || []).length);
  return { status: (anyMachines || anyWorkers) ? 'ready' : 'empty', spaces, perSpace };
}

if (typeof module !== 'undefined') {
  module.exports = { setServerUrl, apiUrl, fetchJson, readConfig, loadEstate };
}
