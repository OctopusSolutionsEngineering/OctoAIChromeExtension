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

function healthLabel(api) {
  if (api === 'Healthy') return 'Healthy';
  if (api === 'HealthyWithWarnings') return 'Healthy with warnings';
  if (api === 'Unhealthy') return 'Unhealthy';
  if (api === 'Unavailable') return 'Unavailable';
  return 'Unavailable';
}
function healthKey(api, isDisabled) {
  if (isDisabled) return 'disabled';
  if (api === 'Healthy' || api === 'HealthyWithWarnings') return 'healthy';
  if (api === 'Unhealthy') return 'unhealthy';
  return 'unavailable';
}
function commLabel(style) {
  if (style === 'TentacleActive') return 'Polling Tentacle';
  if (style === 'TentaclePassive') return 'Listening Tentacle';
  if (style === 'KubernetesTentacle') return 'Kubernetes Agent';
  return style || '';
}
function kindLabel(style) {
  if (style === 'TentacleActive') return 'Tentacle (Polling)';
  if (style === 'TentaclePassive') return 'Tentacle (Listening)';
  if (style === 'KubernetesTentacle') return 'Kubernetes Agent';
  if (style === 'None') return 'SSH / Cloud';
  return style || 'Unknown';
}
function envCat(name) {
  const n = (name || '').toLowerCase();
  if (/prod/.test(n)) return 'production';
  if (/stag|preprod|pre-prod|uat|qa|test/.test(n)) return 'staging';
  if (/dev|internal|sandbox|local/.test(n)) return 'dev';
  return 'other';
}
function looksLikeVersion(s) { return typeof s === 'string' && /^\d+\.\d+/.test(s); }
function extractVersion(ep) {
  if (!ep) return '—';
  if (ep.TentacleVersionDetails && ep.TentacleVersionDetails.Version) return ep.TentacleVersionDetails.Version;
  const kad = ep.KubernetesAgentDetails || {};
  const cands = [kad.AgentVersion, kad.Version, kad.HelmChartVersion, ep.AgentVersion, ep.HelmChartVersion, ep.Version].filter(looksLikeVersion);
  if (cands.length) return cands[0];
  for (const k in ep) { if (/version/i.test(k) && looksLikeVersion(ep[k])) return ep[k]; }
  return '—';
}
function osLabel(ep) {
  // FLAG: verify OS fields on a live instance; fall back to '—'.
  return (ep && (ep.OperatingSystem || (ep.TentacleVersionDetails && ep.TentacleVersionDetails.OperatingSystem))) || '—';
}
function machineToTarget(m, ctx) {
  const ep = m.Endpoint || {};
  const env = (m.EnvironmentIds || []).map(id => ctx.envMap[id]).filter(Boolean)[0] || '—';
  const pol = ctx.policyMap[m.MachinePolicyId];
  const roles = m.Roles || [];
  const tNames = (m.TenantIds || []).map(id => ctx.tenantMap[id]).filter(Boolean);
  const tenant = tNames.length === 0 ? 'No tenants' : (tNames.length === 1 ? tNames[0] : tNames.length + ' tenants');
  return {
    id: m.Id, name: m.Name || m.Id, spaceId: ctx.spaceId,
    kind: kindLabel(ep.CommunicationStyle),
    comm: commLabel(ep.CommunicationStyle),
    os: osLabel(ep), osVersion: '—',
    health: healthLabel(m.HealthStatus), healthKey: healthKey(m.HealthStatus, m.IsDisabled),
    env, envCat: envCat(env),
    tag: roles[0] || '—', moreTags: Math.max(0, roles.length - 1),
    tenant, policy: (pol && pol.Name) || '—',
    version: extractVersion(ep)
  };
}

function buildEstate(perSpace) {
  const targets = [], workers = [], environments = [], policies = [];
  perSpace.forEach(s => {
    const envMap = {}; (s.envs || []).forEach(e => { envMap[e.Id] = e.Name; environments.push({ id:e.Id, name:e.Name, spaceId:s.sp.Id }); });
    const policyMap = {}; (s.policies || []).forEach(p => { policyMap[p.Id] = p; policies.push(p); });
    const tenantMap = {}; (s.tenants || []).forEach(t => { tenantMap[t.Id] = t.Name; });
    const ctx = { envMap, policyMap, tenantMap, spaceId: s.sp.Id, spaceName: s.sp.Name };
    (s.machines || []).forEach(m => targets.push(machineToTarget(m, ctx)));
    const poolMap = {}; (s.workerpools || []).forEach(p => poolMap[p.Id] = p.Name);
    (s.workers || []).forEach(w => {
      const ep = w.Endpoint || {};
      workers.push({ id:w.Id, name:w.Name, health:healthLabel(w.HealthStatus),
        healthKey:healthKey(w.HealthStatus, w.IsDisabled),
        pool:(w.WorkerPoolIds||[]).map(id=>poolMap[id]).filter(Boolean)[0]||'—',
        version:extractVersion(ep), kind:kindLabel(ep.CommunicationStyle) });
    });
  });
  return { targets, workers, environments, policies, overview: overviewModel(targets, workers) };
}

function _count(arr, pred) { return arr.reduce((n,x)=>n+(pred(x)?1:0),0); }
function overviewModel(targets, workers) {
  const healthy = _count(targets, t=>t.healthKey==='healthy');
  const unhealthy = _count(targets, t=>t.healthKey==='unhealthy'||t.healthKey==='unavailable');
  const disabled = _count(targets, t=>t.healthKey==='disabled');
  const total = targets.length;
  const byTypeMap = {};
  targets.forEach(t => { const k=t.kind; (byTypeMap[k]=byTypeMap[k]||{name:k,healthy:0,unhealthy:0});
    if (t.healthKey==='healthy') byTypeMap[k].healthy++; else if (t.healthKey!=='disabled') byTypeMap[k].unhealthy++; });
  const byEnvMap = {};
  targets.forEach(t => { const k=t.env; const e=(byEnvMap[k]=byEnvMap[k]||{name:k,total:0,healthy:0,unhealthy:0,disabled:0});
    e.total++; if (t.healthKey==='healthy') e.healthy++; else if (t.healthKey==='disabled') e.disabled++; else e.unhealthy++; });
  const wHealthy = _count(workers, w=>w.healthKey==='healthy');
  const poolMap = {}; workers.forEach(w=>{ poolMap[w.pool]=(poolMap[w.pool]||0)+1; });
  return {
    total, healthy, unhealthy, disabled,
    healthyPct: total ? Math.round(healthy/total*100) : 0,
    byType: Object.values(byTypeMap),
    byEnv: Object.values(byEnvMap).sort((a,b)=>b.total-a.total),
    workers: { total: workers.length, healthy: wHealthy, unhealthy: workers.length-wHealthy,
      pools: Object.entries(poolMap).map(([name,count])=>({name,count})) }
  };
}

function _facet(key, label, values) {
  const counts = {};
  values.forEach(v => { counts[v.value] = (counts[v.value]||0)+1; if (!counts['_lbl_'+v.value]) counts['_lbl_'+v.value]=v.label; });
  const options = Object.keys(counts).filter(k=>!k.startsWith('_lbl_'))
    .map(value => ({ value, label: counts['_lbl_'+value], count: counts[value] }))
    .sort((a,b)=>b.count-a.count);
  return { key, label, options };
}
function buildFacets(targets) {
  return [
    _facet('kind','Type', targets.map(t=>({value:t.kind,label:t.kind}))),
    _facet('os','Operating system', targets.map(t=>({value:t.os,label:t.os}))),
    _facet('osVersion','OS version', targets.map(t=>({value:t.osVersion,label:t.osVersion}))),
    _facet('health','Health', targets.map(t=>({value:t.healthKey,label:t.health}))),
    _facet('env','Environment', targets.map(t=>({value:t.env,label:t.env}))),
    _facet('tag','Target tag', targets.map(t=>({value:t.tag,label:t.tag}))),
    _facet('tenant','Tenant', targets.map(t=>({value:t.tenant,label:t.tenant}))),
    _facet('policy','Machine policy', targets.map(t=>({value:t.policy,label:t.policy}))),
    _facet('version','Agent version', targets.map(t=>({value:t.version,label:t.version})))
  ];
}
function applyFilters(targets, filters, search) {
  const q = (search||'').trim().toLowerCase();
  // 'health' facet options carry healthKey values (see buildFacets), so the
  // filter must match against t.healthKey rather than the t.health label.
  const fieldMap = { health: 'healthKey' };
  return targets.filter(t => {
    for (const key in (filters||{})) {
      const sel = filters[key]; if (!sel || !sel.length) continue;
      const field = fieldMap[key] || key;
      if (!sel.includes(t[field])) return false;
    }
    if (q && !String(t.name).toLowerCase().includes(q)) return false;
    return true;
  });
}

if (typeof module !== 'undefined') {
  module.exports = { setServerUrl, apiUrl, fetchJson, readConfig, loadEstate,
    healthLabel, healthKey, commLabel, kindLabel, envCat, extractVersion, osLabel,
    machineToTarget, buildEstate, overviewModel, buildFacets, applyFilters };
}
