'use strict';
// Estate data layer — populated in Tasks 1 & 2.

let _serverUrl = null;
function setServerUrl(url) { _serverUrl = url; }
function apiUrl(path) { return new URL(path, _serverUrl).toString(); }

/* Rate-limit API access to 200 requests / minute via p-throttle, and back off
 * and retry when the server responds with 429 (Too Many Requests).
 * pThrottle comes from ../api.js, which is only loaded in the browser — under
 * Node (the unit tests) requests pass straight through. */
const octopusRequestThrottle = typeof pThrottle === 'function'
  ? pThrottle({ limit: 200, interval: 60000 })
  : (fn => fn);

const max429Retries = 3;
const baseRetryDelayMs = 1000;
// Dashboards are a low priority. If there is API contention (as indicted by a 429 response), wait the
// required amount of time, and then wait some more. This will allow other, higher priority clients
// to make their requests.
const retryPadding = 5;

function sleep(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function getRetryDelayMs(response, retryAttempt) {
  const retryAfterHeader = response.headers && response.headers.get('Retry-After');
  const retryAfterSeconds = Number.parseInt(retryAfterHeader, 10);
  if (!Number.isNaN(retryAfterSeconds) && retryAfterSeconds >= 0) {
    return (retryAfterSeconds + retryPadding) * 1000;
  }

  return baseRetryDelayMs * retryAttempt;
}

async function fetchJson(path) {
  for (let retryAttempt = 1; retryAttempt <= max429Retries + 1; retryAttempt += 1) {
    const res = await octopusRequestThrottle(() => fetch(apiUrl(path), {
      method: 'GET', credentials: 'include', headers: { Accept: 'application/json' } }))();

    if (res.status === 429 && retryAttempt <= max429Retries) {
      await sleep(getRetryDelayMs(res, retryAttempt));
      continue;
    }

    if (res.status === 401 || res.status === 403) { const e = new Error('auth'); e.auth = true; throw e; }
    if (!res.ok) { const e = new Error(res.status + ' ' + res.statusText); e.code = res.status + ' ' + res.statusText; throw e; }
    return res.json();
  }

  const e = new Error('429 Too Many Requests'); e.code = '429 Too Many Requests'; throw e;
}

function readConfig() {
  return new Promise(resolve => {
    if (typeof dashboardGetConfig !== 'function') { resolve({ serverUrl: _serverUrl, context: {} }); return; }
    try {
      dashboardGetConfig(cfg => resolve({
        serverUrl: (cfg && cfg.lastServerUrl) || _serverUrl,
        context: (cfg && cfg.context) || {}
      }));
    } catch (e) {
      // dashboardGetConfig reaches chrome.storage, which is absent when the page
      // is opened outside the extension (e.g. directly as a file:// URL). Degrade
      // instead of leaving the caller's promise unresolved.
      resolve({ serverUrl: _serverUrl, context: {} });
    }
  });
}

// Boot in two steps. The space list is one cheap request; hydrating a space is six.
// Loading every space up front to display one is the dominant boot cost on a
// many-space instance, so callers hydrate only what they're about to show.
async function loadSpaces(serverUrl) {
  setServerUrl(serverUrl);
  let spaces;
  try { spaces = await fetchJson('/api/spaces/all'); }
  catch (e) { return { status: e && e.auth ? 'auth' : 'error', spaces: [] }; }
  if (!spaces || !spaces.length) return { status: 'empty', spaces: [] };
  return { status: 'ready', spaces };
}

// One space's payload. A resource that fails still yields [] so the rest of the space
// renders, but the failure is recorded — without that record an unreadable endpoint is
// indistinguishable from an empty one. Machines are the exception: if they can't be read
// there is no estate to show, so the space is dropped entirely (null).
async function hydrateSpace(sp) {
  const failed = [];
  let auth = false;
  const soft = (name, path) => fetchJson(path).catch(e => {
    failed.push(name);
    if (e && e.auth) auth = true;
    return [];
  });
  try {
    const [envs, policies, tenants, machines, workerpools, workers] = await Promise.all([
      soft('environments', '/api/' + sp.Id + '/environments/all'),
      soft('policies',     '/api/' + sp.Id + '/machinepolicies/all'),
      soft('tenants',      '/api/' + sp.Id + '/tenants/all'),
      fetchJson('/api/' + sp.Id + '/machines/all'),
      soft('workerpools',  '/api/' + sp.Id + '/workerpools/all'),
      soft('workers',      '/api/' + sp.Id + '/workers/all')
    ]);
    return { sp, envs, policies, tenants, machines, workerpools, workers, failed, auth };
  } catch (e) { return null; }
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
  return 'unhealthy'; // Unhealthy, Unavailable, Unknown, null all fold in
}
function healthKeyLabel(key) {
  if (key === 'healthy') return 'Healthy';
  if (key === 'disabled') return 'Disabled';
  return 'Unhealthy';
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
function typeGroup(style) {
  switch (style) {
    case 'TentacleActive':
    case 'TentaclePassive': return 'Tentacle';
    case 'Ssh': return 'SSH';
    case 'Kubernetes':
    case 'KubernetesTentacle': return 'Kubernetes';
    case 'AzureWebApp': return 'Azure Web App';
    case 'AzureCloudService':
    case 'AzureServiceFabricCluster': return 'Cloud Region';
    case 'OfflineDrop': return 'Offline Drop';
    case 'None': return 'Cloud Region';
    default: return style || 'Unknown';
  }
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
// An OS / OS-version candidate is only usable if it's a non-empty string that isn't a
// placeholder. The Octopus API sometimes reports a literal "Unknown" for un-health-checked
// machines; treat that (and blanks) as no value so the cell renders blank, not "Unknown".
function _knownOsStr(s) {
  return typeof s === 'string' && s.trim() && !/^(unknown|n\/?a|none|-|—)$/i.test(s.trim());
}
function osLabel(ep, m) {
  // FLAG: exact Octopus OS field is unconfirmed; verify on a live instance.
  // Defensive candidate scan across likely locations, falling back to '' (blank cell —
  // not '—', to avoid "unknown, unknown, unknown" repetition across the Targets table).
  ep = ep || {}; m = m || {};
  const cands = [
    ep.TentacleVersionDetails && ep.TentacleVersionDetails.OperatingSystem,
    m.OperatingSystem, ep.OperatingSystem,
    m.HealthStatus && m.OperatingSystem
  ].filter(_knownOsStr);
  return cands[0] || '';
}
function osVersionLabel(ep, m) {
  // FLAG: exact Octopus OS version field is unconfirmed; verify on a live instance.
  // Falls back to '' (blank cell), not '—' — see osLabel.
  ep = ep || {}; m = m || {};
  const cands = [
    ep.TentacleVersionDetails && ep.TentacleVersionDetails.OperatingSystemVersion,
    m.OperatingSystemVersion, ep.OperatingSystemVersion
  ].filter(_knownOsStr);
  return cands[0] || '';
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
    type: typeGroup(ep.CommunicationStyle),
    comm: commLabel(ep.CommunicationStyle),
    os: osLabel(ep, m), osVersion: osVersionLabel(ep, m),
    health: healthLabel(m.HealthStatus), healthKey: healthKey(m.HealthStatus, m.IsDisabled),
    env, envCat: envCat(env),
    tag: roles[0] || '—', moreTags: Math.max(0, roles.length - 1),
    tenant, policy: (pol && pol.Name) || '—',
    version: extractVersion(ep)
  };
}

function isEmptyEstate(estate) {
  return !estate || ((estate.targets||[]).length === 0 && (estate.workers||[]).length === 0);
}

// Environments toolbar: free-text search plus one of three mutually exclusive views.
// "All healthy" includes environments holding nothing at all — an environment with no
// targets has nothing unhealthy in it, which is what the filter asks.
function filterEnvRows(rows, query, mode) {
  const q = String(query || '').trim().toLowerCase();
  return (rows || []).filter(r => {
    if (q && String(r.name || '').toLowerCase().indexOf(q) === -1) return false;
    if (mode === 'attention') return r.unhealthy > 0;
    if (mode === 'healthy') return !r.unhealthy;
    return true;
  });
}

// Cold-start is a landing screen, not a wall. Overview gets it when there's no
// infrastructure — that's the "set this up" moment. Every other view renders itself and
// uses its own empty state, because clicking a nav item and landing on the screen you
// were already on is a dead end, and a space with no targets can still hold environments,
// machine policies and a route out via the add-target walkthrough.
function coldStartApplies(view, estate) {
  return view === 'overview' && isEmptyEstate(estate);
}

// Per-target activity comes from /api/{space}/machines/{id}/tasks — verified against a live
// instance. Note /api/{space}/tasks?regarding={id} silently IGNORES the filter and returns the
// whole task list; don't reach for it.
function taskKind(name) {
  switch (String(name || '')) {
    case 'Deploy': return 'deploy';
    case 'Health': return 'health';
    case 'Upgrade': return 'upgrade';
    case 'RunbookRun': return 'runbook';
    default: return 'other';
  }
}
function machineTaskRow(t) {
  return {
    id: t.Id,
    kind: taskKind(t.Name),
    name: t.Name || '',
    // The API's Description already reads as a sentence ("Deploy X release 1.2.3 to Production"),
    // so we show it rather than parsing project and version back out of it.
    description: t.Description || t.Name || '',
    state: t.State || '',
    success: t.FinishedSuccessfully === true,
    completed: t.CompletedTime || null,
    projectId: t.ProjectId || null,
    deploymentId: (t.Arguments && t.Arguments.DeploymentId) || null
  };
}
// Fetched lazily when the detail route opens — this is the only data the boot payload
// doesn't already carry. Each half degrades on its own: null means "we couldn't load it",
// which the view must not render as "there is none".
async function fetchMachineDetail(spaceId, machineId) {
  const sp = encodeURIComponent(spaceId);
  const base = '/api/' + sp + '/machines/' + encodeURIComponent(machineId);
  // events?regarding= IS honoured, unlike tasks?regarding= — verified on a live instance:
  // a space holding 159,294 events returns 22 for a machine-scoped query. A zero here is a
  // real "nothing retained for this target", not a filter that quietly matches nothing.
  const [tasks, connection, events] = await Promise.all([
    fetchJson(base + '/tasks?take=30').then(r => (r && r.Items) || []).catch(() => null),
    fetchJson(base + '/connection').catch(() => null),
    fetchJson('/api/' + sp + '/events?regarding=' + encodeURIComponent(machineId) + '&take=20')
      .then(r => (r && r.Items) || []).catch(() => null)
  ]);
  return { tasks, connection, events };
}

// Octopus also returns MessageHtml, which carries anchors. We take the plain Message and
// escape it at render time rather than injecting markup we didn't build.
function eventsModel(events) {
  return (events || []).map(e => ({
    id: e.Id,
    category: e.Category || '',
    who: e.Username || (e.IsService ? 'system' : ''),
    message: e.Message || '',
    occurred: e.Occurred || null
  })).sort((a, b) => String(b.occurred || '').localeCompare(String(a.occurred || '')));
}
function machineActivityModel(tasks) {
  const rows = (tasks || []).map(machineTaskRow)
    .sort((a, b) => String(b.completed || '').localeCompare(String(a.completed || '')));
  const of = kind => rows.filter(r => r.kind === kind);
  const deployments = of('deploy');
  return {
    all: rows,
    deployments,
    runbooks: of('runbook'),
    health: of('health'),
    lastSuccessfulDeploy: deployments.find(r => r.success) || null
  };
}

// Which empty state a list view should show. "No workers here" and "no workers match your
// filters" are different facts and want different advice — telling someone to clear filters
// they never set is the wrong help.
function emptyKind(total, shown) {
  if ((shown || 0) > 0) return 'rows';
  return (total || 0) === 0 ? 'none' : 'nomatch';
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
  // Which resources couldn't be read for the spaces in scope. A view consults this before
  // telling the user a collection is empty.
  const failed = { environments:false, policies:false, tenants:false, workerpools:false, workers:false };
  perSpace.forEach(s => (s.failed || []).forEach(k => { if (k in failed) failed[k] = true; }));
  return { targets, workers, environments, policies, failed,
    overview: overviewModel(targets, workers) };
}

/* ─── Agent version model (latest, behind, bands) ────────────────────────
 * Ported from dashboards/targetagentversions/dashboard.js (vkey, versionBand,
 * deriveLatest). "Behind" is a MAJOR-version rule, not a full vkey compare:
 * an agent is behind only if its major version is one or more below the
 * latest major version for its type — minor/patch lag does not count. */
function vkey(v) { return String(v || '').split('.').map(n => String(n).padStart(4, '0')).join('.'); }
function majorVersion(v) {
  if (!v || v === '—') return NaN;
  return parseInt(String(v).split('.')[0], 10);
}
function versionBand(v) {
  if (!v || v === '—' || v === '0.0.0') return 'unknown';
  const major = majorVersion(v);
  if (isNaN(major)) return 'unknown';
  if (major <= 4) return 'red';
  if (major <= 6) return 'yellow';
  return 'green';
}
function deriveLatest(versions) {
  const pool = (versions || []).filter(v => v && v !== '—');
  let best = '';
  pool.forEach(v => { if (!best || vkey(v).localeCompare(vkey(best)) > 0) best = v; });
  return best || '—';
}
function _agentGroup(rows) {
  const latest = deriveLatest(rows.map(t => t.version));
  const latestMajor = majorVersion(latest);
  let upToDate = 0, behind = 0, unknown = 0;
  const outRows = rows.map(t => {
    const isUnknown = !t.version || t.version === '—';
    const isBehind = !isUnknown && majorVersion(t.version) < latestMajor;
    if (isUnknown) unknown++; else if (isBehind) behind++; else upToDate++;
    // Carries the machine id and OS through from machineToTarget: the agent table names the
    // machine, links to its detail page, and reports the OS it's running on.
    return { id: t.id, name: t.name, env: t.env, os: t.os, osVersion: t.osVersion,
      version: t.version, band: versionBand(t.version), behind: isBehind, policy: t.policy };
  });
  const distMap = {};
  outRows.forEach(r => { const d = (distMap[r.version] = distMap[r.version] || { version: r.version, count: 0, band: r.band }); d.count++; });
  const distribution = Object.values(distMap).sort((a, b) => vkey(b.version).localeCompare(vkey(a.version)));
  return { latest, total: rows.length, upToDate, behind, unknown, rows: outRows, distribution };
}
function agentsModel(targets) {
  const list = targets || [];
  return {
    tentacle: _agentGroup(list.filter(t => t.type === 'Tentacle')),
    kubernetes: _agentGroup(list.filter(t => t.type === 'Kubernetes'))
  };
}

function _count(arr, pred) { return arr.reduce((n,x)=>n+(pred(x)?1:0),0); }
function overviewModel(targets, workers) {
  const healthy = _count(targets, t=>t.healthKey==='healthy');
  const unhealthy = _count(targets, t=>t.healthKey==='unhealthy');
  const disabled = _count(targets, t=>t.healthKey==='disabled');
  const total = targets.length;
  // Every target lands in exactly one bucket, so the per-type rows reconcile with the
  // estate totals above. Counting only healthy/unhealthy silently dropped disabled
  // targets out of their type row altogether.
  const byTypeMap = {};
  targets.forEach(t => { const k=t.type || t.kind;
    const e = (byTypeMap[k]=byTypeMap[k]||{name:k,healthy:0,unhealthy:0,disabled:0,total:0});
    e.total++;
    if (t.healthKey==='healthy') e.healthy++;
    else if (t.healthKey==='disabled') e.disabled++;
    else e.unhealthy++; });
  const byEnvMap = {};
  targets.forEach(t => { const k=t.env; const e=(byEnvMap[k]=byEnvMap[k]||{name:k,total:0,healthy:0,unhealthy:0,disabled:0});
    e.total++; if (t.healthKey==='healthy') e.healthy++; else if (t.healthKey==='disabled') e.disabled++; else e.unhealthy++; });
  const wHealthy = _count(workers, w=>w.healthKey==='healthy');
  const poolMap = {}; workers.forEach(w=>{ poolMap[w.pool]=(poolMap[w.pool]||0)+1; });
  const agents = agentsModel(targets);
  return {
    total, healthy, unhealthy, disabled,
    healthyPct: total ? Math.round(healthy/total*100) : 0,
    byType: Object.values(byTypeMap),
    byEnv: Object.values(byEnvMap).sort((a,b)=>b.total-a.total),
    workers: { total: workers.length, healthy: wHealthy, unhealthy: workers.length-wHealthy,
      pools: Object.entries(poolMap).map(([name,count])=>({name,count})) },
    agents: { latest: agents.tentacle.total ? agents.tentacle.latest : agents.kubernetes.latest,
      behind: agents.tentacle.behind + agents.kubernetes.behind }
  };
}

// FLAG: exact Octopus machine-policy field names are unconfirmed; verify on a live instance.
// Defensive scan of the candidate locations the Octopus API is believed to use, falling
// back to '—' when a field is absent, renamed, or shaped differently than expected.
function _policyFallback(v) {
  if (typeof v === 'string' && v.trim()) return v;
  if (typeof v === 'number') return v;
  return '—';
}
function policiesModel(policies, targets) {
  const list = targets || [];
  return (policies || []).map(p => {
    const name = p.Name;
    const isDefault = p.IsDefault === true || p.Name === 'Default Machine Policy';
    const description = p.Description || '';
    const usage = _count(list, t => t.policy === name);
    const mhcp = p.MachineHealthCheckPolicy || {};
    const mup = p.MachineUpdatePolicy || {};
    const mcp = p.MachineConnectivityPolicy || {};
    const mclp = p.MachineCleanupPolicy || {};
    return {
      name, isDefault, description, usage,
      interval: _policyFallback(mhcp.HealthCheckInterval),
      healthCheckType: _policyFallback(mhcp.HealthCheckType),
      tentacle: _policyFallback(mup.TentacleUpgradePolicy),
      calamari: _policyFallback(mup.CalamariUpdatePolicy),
      k8s: _policyFallback(mup.KubernetesAgentUpgradePolicy),
      connectivity: _policyFallback(mcp.MachineConnectivityBehavior),
      cleanup: _policyFallback(mclp.DeleteMachinesBehavior)
    };
  });
}

function environmentsModel(targets, environments) {
  const map = {};
  (targets || []).forEach(t => {
    const name = t.env;
    const e = (map[name] = map[name] || { name, total: 0, healthy: 0, unhealthy: 0, disabled: 0, targets: [] });
    e.total++;
    if (t.healthKey === 'healthy') e.healthy++;
    else if (t.healthKey === 'disabled') e.disabled++;
    else e.unhealthy++;
    // id comes through so the expanded sub-list can link each target to its detail page,
    // the same way the targets table and the agent table do.
    e.targets.push({ id: t.id, name: t.name, type: t.type, healthKey: t.healthKey,
      health: t.health, tag: t.tag, tenant: t.tenant });
  });
  (environments || []).forEach(env => {
    if (!map[env.name]) map[env.name] = { name: env.name, total: 0, healthy: 0, unhealthy: 0, disabled: 0, targets: [] };
  });
  return Object.values(map).sort((a, b) => b.total - a.total);
}

function _facet(key, label, values) {
  const counts = {};
  values.forEach(v => { counts[v.value] = (counts[v.value]||0)+1; if (!counts['_lbl_'+v.value]) counts['_lbl_'+v.value]=v.label; });
  const options = Object.keys(counts).filter(k=>!k.startsWith('_lbl_'))
    .filter(value => value !== '') // an empty facet value (e.g. unknown OS) isn't a useful filter option
    .map(value => ({ value, label: counts['_lbl_'+value], count: counts[value] }))
    .sort((a,b)=>b.count-a.count);
  return { key, label, options };
}
function _isDeadFacet(f) { return f.options.length <= 1 && (!f.options[0] || f.options[0].value === '—' || f.options[0].value === ''); }
function buildFacets(targets) {
  return [
    _facet('type','Type', targets.map(t=>({value:t.type,label:t.type}))),
    _facet('os','Operating system', targets.map(t=>({value:t.os,label:t.os}))),
    _facet('osVersion','OS version', targets.map(t=>({value:t.osVersion,label:t.osVersion}))),
    _facet('health','Health', targets.map(t=>({value:t.healthKey,label:healthKeyLabel(t.healthKey)}))),
    _facet('env','Environment', targets.map(t=>({value:t.env,label:t.env}))),
    _facet('tag','Target tag', targets.map(t=>({value:t.tag,label:t.tag}))),
    _facet('tenant','Tenant', targets.map(t=>({value:t.tenant,label:t.tenant}))),
    _facet('policy','Machine policy', targets.map(t=>({value:t.policy,label:t.policy}))),
    _facet('version','Agent version', targets.map(t=>({value:t.version,label:t.version})))
  ].filter(f => !_isDeadFacet(f));
}
function workersModel(workers) {
  const list = workers || [];
  const poolMap = {};
  list.forEach(w => {
    const p = (poolMap[w.pool] = poolMap[w.pool] || { name: w.pool, total: 0, healthy: 0, unhealthy: 0 });
    p.total++;
    if (w.healthKey === 'healthy') p.healthy++;
    else if (w.healthKey === 'unhealthy') p.unhealthy++;
  });
  const pools = Object.values(poolMap).sort((a, b) => b.total - a.total);
  return { pools, rows: list };
}
function workerFacets(workers) {
  const list = workers || [];
  return [
    _facet('health', 'Health', list.map(w => ({ value: w.healthKey, label: healthKeyLabel(w.healthKey) }))),
    _facet('pool', 'Pool', list.map(w => ({ value: w.pool, label: w.pool }))),
    _facet('version', 'Agent version', list.map(w => ({ value: w.version, label: w.version })))
  ].filter(f => !_isDeadFacet(f));
}
function applyWorkerFilters(workers, filters, search) {
  const q = (search || '').trim().toLowerCase();
  const fieldMap = { health: 'healthKey' };
  return (workers || []).filter(w => {
    for (const key in (filters || {})) {
      const sel = filters[key]; if (!sel || !sel.length) continue;
      const field = fieldMap[key] || key;
      if (!sel.includes(w[field])) return false;
    }
    if (q && !String(w.name).toLowerCase().includes(q)) return false;
    return true;
  });
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


// ─── Releases ────────────────────────────────────────────────────────────────
// "What is running in each environment" is one request. The project dashboard
// returns every deployment the server considers current, one item per
// project/environment/tenant — so an untenanted project yields a single item in
// an environment and a tenanted one yields several, which is how a part-way
// rollout shows two releases living in Production at once.
//
// It is fetched on first visit to the section rather than during boot. Boot
// already costs six requests per space, and someone who never opens Releases
// should not pay for it.

async function fetchDashboard(spaceId) {
  return fetchJson('/api/' + spaceId + '/dashboard');
}

// Task states collapse to the four outcomes worth drawing differently. Queued
// and Executing are both "in flight" to a reader; Canceled and TimedOut are
// their own thing and are deliberately not folded into failed, because a
// deployment someone stopped is a different fact from one that broke.
function releaseStateKey(state) {
  if (state === 'Success') return 'success';
  if (state === 'Executing' || state === 'Queued') return 'running';
  if (state === 'Failed') return 'failed';
  if (state === 'TimedOut') return 'timedout';
  if (state === 'Canceled' || state === 'Cancelled') return 'cancelled';
  return 'unknown';
}
function releaseStateLabel(key) {
  if (key === 'success') return 'Succeeded';
  if (key === 'running') return 'In progress';
  if (key === 'failed') return 'Failed';
  if (key === 'timedout') return 'Timed out';
  if (key === 'cancelled') return 'Cancelled';
  return 'Unknown';
}

// A boundary between two environments is strong when they hold a release in
// common — the change has flowed through — and pale when they hold different
// ones. Either side being empty means there is nothing to compare, so no line
// is drawn at all rather than a line implying a relationship.
function linkTone(prevVersions, versions) {
  if (!prevVersions.length || !versions.length) return 'none';
  return prevVersions.some(v => versions.indexOf(v) !== -1) ? 'strong' : 'pale';
}

function releasesModel(dash) {
  const d = dash || {};
  const allEnvironments = (d.Environments || []).map(e => ({ id: e.Id, name: e.Name }));
  const tenantNames = {};
  (d.Tenants || []).forEach(t => { tenantNames[t.Id] = t.Name; });
  const groupNames = {};
  (d.ProjectGroups || []).forEach(g => { groupNames[g.Id] = g.Name; });

  // project id -> env id -> version -> aggregate
  const byProject = {};
  (d.Items || []).forEach(item => {
    if (!item || !item.IsCurrent) return;
    const pid = item.ProjectId, eid = item.EnvironmentId, ver = item.ReleaseVersion;
    if (!pid || !eid || ver == null) return;
    const envs = byProject[pid] || (byProject[pid] = {});
    const vers = envs[eid] || (envs[eid] = {});
    const when = item.CompletedTime || item.StartTime || item.QueueTime || item.Created || null;
    const agg = vers[ver] || (vers[ver] = { version: ver, stateKey: null, when: null, tenants: [] });
    // Most recent item wins the state, so an environment mid-redeploy reads as
    // in progress rather than showing whichever item happened to come first.
    if (!agg.when || (when && when > agg.when)) { agg.when = when; agg.stateKey = releaseStateKey(item.State); }
    if (!agg.stateKey) agg.stateKey = releaseStateKey(item.State);
    if (item.TenantId) agg.tenants.push(item.TenantId);
  });

  // An environment nothing has ever been deployed to costs a column and tells
  // you nothing. Dropped from the grid and named underneath instead, so the
  // remaining columns get the width — and so a space with a dormant environment
  // doesn't read as though the environment were missing.
  const usedEnvIds = {};
  Object.keys(byProject).forEach(pid => Object.keys(byProject[pid]).forEach(eid => { usedEnvIds[eid] = true; }));
  const environments = allEnvironments.filter(e => usedEnvIds[e.id]);
  const hiddenEnvironments = allEnvironments.filter(e => !usedEnvIds[e.id]);

  const projects = (d.Projects || []).map(p => {
    const envMap = byProject[p.Id] || {};
    const cells = environments.map(env => {
      const vers = envMap[env.id] || {};
      const entries = Object.keys(vers).map(v => {
        const a = vers[v];
        return {
          version: a.version,
          stateKey: a.stateKey || 'unknown',
          stateLabel: releaseStateLabel(a.stateKey || 'unknown'),
          when: a.when,
          tenantCount: a.tenants.length,
          tenantNames: a.tenants.map(id => tenantNames[id] || id)
        };
      }).sort((x, y) => String(y.when || '').localeCompare(String(x.when || '')));
      // A tenanted project can have dozens of releases live in one environment at
      // once — 41 in one cell on Cloud Platform. The cell reports the spread so
      // the view can name the newest and summarise the rest instead of stacking
      // forty labels into a column.
      const tenantTotal = entries.reduce((n, e) => n + e.tenantCount, 0);
      return {
        envId: env.id, envName: env.name, entries: entries,
        versionCount: entries.length, tenantTotal: tenantTotal
      };
    });
    const links = cells.map((c, i) =>
      i === 0 ? null : linkTone(cells[i - 1].entries.map(e => e.version), c.entries.map(e => e.version)));
    const deployed = cells.reduce((n, c) => n + (c.entries.length ? 1 : 0), 0);
    return {
      id: p.Id, name: p.Name, slug: p.Slug,
      groupId: p.ProjectGroupId, groupName: groupNames[p.ProjectGroupId] || '',
      cells: cells, links: links, deployedCount: deployed
    };
  }).sort((a, b) => String(a.name).localeCompare(String(b.name)));

  // The server caps how many projects the dashboard returns. Reporting the cap
  // matters more here than elsewhere: a capped list looks exactly like a small
  // instance, and someone reading "3 projects" has no way to tell which it is.
  return {
    environments: environments,
    hiddenEnvironments: hiddenEnvironments,
    projects: projects,
    truncated: {
      projectLimit: typeof d.ProjectLimit === 'number' ? d.ProjectLimit : null,
      isFiltered: !!d.IsFiltered,
      shown: projects.length,
      capped: typeof d.ProjectLimit === 'number' && projects.length >= d.ProjectLimit
    }
  };
}

if (typeof window !== 'undefined') { window.Data = { setServerUrl, apiUrl, fetchJson, readConfig, loadSpaces, hydrateSpace,
  buildEstate, isEmptyEstate, coldStartApplies, filterEnvRows, emptyKind, taskKind, machineActivityModel, eventsModel, fetchMachineDetail, overviewModel, environmentsModel, policiesModel, buildFacets, applyFilters,
  workersModel, workerFacets, applyWorkerFilters, machineToTarget, typeGroup, healthKeyLabel, osVersionLabel,
  vkey, majorVersion, versionBand, deriveLatest, agentsModel,
  fetchDashboard, releasesModel, releaseStateKey, releaseStateLabel, linkTone }; }

if (typeof module !== 'undefined') {
  module.exports = { setServerUrl, apiUrl, fetchJson, readConfig, loadSpaces, hydrateSpace,
    healthLabel, healthKey, healthKeyLabel, commLabel, kindLabel, typeGroup, envCat, extractVersion, osLabel, osVersionLabel,
    machineToTarget, buildEstate, isEmptyEstate, coldStartApplies, filterEnvRows, emptyKind, taskKind, machineActivityModel, eventsModel, fetchMachineDetail, overviewModel, environmentsModel, policiesModel, buildFacets, applyFilters,
    workersModel, workerFacets, applyWorkerFilters,
    vkey, majorVersion, versionBand, deriveLatest, agentsModel,
    fetchDashboard, releasesModel, releaseStateKey, releaseStateLabel, linkTone };
}
