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

  // Projects are grouped the way the instance groups them, and each group gets
  // its own columns. An environment is hidden per group rather than estate-wide,
  // because a group that never touches Preprod shouldn't carry an empty column
  // for it just because another group does. The cost is that two groups can show
  // different columns, which is why each group renders its own header row.
  const groupOf = {};
  (d.ProjectGroups || []).forEach(g => { groupOf[g.Id] = g.Name; });

  const buildProject = (p, envList) => {
    const envMap = byProject[p.Id] || {};
    const cells = envList.map(env => {
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
      const tenantTotal = entries.reduce((n, e) => n + e.tenantCount, 0);
      return {
        envId: env.id, envName: env.name, entries: entries,
        versionCount: entries.length, tenantTotal: tenantTotal
      };
    });
    // A release sitting in four environments does not need naming four times —
    // the line and the nodes already say it is the same one. Mark the furthest
    // environment each version reaches; that is the only place worth a label.
    const furthest = {};
    cells.forEach((c, i) => c.entries.forEach(e => { furthest[e.version] = i; }));
    cells.forEach((c, i) => c.entries.forEach(e => { e.isFurthest = furthest[e.version] === i; }));

    const links = cells.map((c, i) =>
      i === 0 ? null : linkTone(cells[i - 1].entries.map(e => e.version), c.entries.map(e => e.version)));
    return {
      id: p.Id, name: p.Name, slug: p.Slug,
      groupId: p.ProjectGroupId, groupName: groupOf[p.ProjectGroupId] || '',
      cells: cells, links: links,
      deployedCount: cells.reduce((n, c) => n + (c.entries.length ? 1 : 0), 0)
    };
  };

  const byGroup = {};
  (d.Projects || []).forEach(p => {
    const gid = p.ProjectGroupId || '';
    (byGroup[gid] || (byGroup[gid] = [])).push(p);
  });

  const groups = Object.keys(byGroup).map(gid => {
    const members = byGroup[gid];
    const used = {};
    members.forEach(p => Object.keys(byProject[p.Id] || {}).forEach(eid => { used[eid] = true; }));
    const envs = allEnvironments.filter(e => used[e.id]);
    const hidden = allEnvironments.filter(e => !used[e.id]);
    return {
      id: gid,
      name: groupOf[gid] || 'Ungrouped',
      environments: envs,
      hiddenEnvironments: hidden,
      projects: members.map(p => buildProject(p, envs)).sort((a, b) => String(a.name).localeCompare(String(b.name)))
    };
  }).sort((a, b) => String(a.name).localeCompare(String(b.name)));

  // Kept flat as well, so callers that only want a count or a lookup don't have
  // to walk the groups.
  const projects = groups.reduce((all, g) => all.concat(g.projects), []);
  const usedEnvIds = {};
  Object.keys(byProject).forEach(pid => Object.keys(byProject[pid]).forEach(eid => { usedEnvIds[eid] = true; }));
  const environments = allEnvironments.filter(e => usedEnvIds[e.id]);
  const hiddenEnvironments = allEnvironments.filter(e => !usedEnvIds[e.id]);

  // The server caps how many projects the dashboard returns. Reporting the cap
  // matters more here than elsewhere: a capped list looks exactly like a small
  // instance, and someone reading "3 projects" has no way to tell which it is.
  return {
    environments: environments,
    hiddenEnvironments: hiddenEnvironments,
    groups: groups,
    projects: projects,
    truncated: {
      projectLimit: typeof d.ProjectLimit === 'number' ? d.ProjectLimit : null,
      isFiltered: !!d.IsFiltered,
      shown: projects.length,
      capped: typeof d.ProjectLimit === 'number' && projects.length >= d.ProjectLimit
    }
  };
}


// ─── Project history (expanded row) ──────────────────────────────────────────
// /progression returns the recent releases for one project, newest first, with
// a Deployments map keyed by environment. Two things about it shape the model:
//
//   Releases from every channel arrive in one list. Lag is therefore counted
//   within a channel — a Main release is not "two behind" because two
//   Pre-Release builds were cut after it.
//
//   Plenty of releases were never deployed anywhere. They are kept, because a
//   release that got created and went nowhere is a fact about the project, and
//   dropping it would make the history look tidier than the project is.
//
// releaseHistoryCount is capped at 100 by the server and counts per channel.

const PROGRESSION_HISTORY = 30;

async function fetchProgression(spaceId, projectId) {
  return fetchJson('/api/' + spaceId + '/progression/' + encodeURIComponent(projectId)
    + '?releaseHistoryCount=' + PROGRESSION_HISTORY);
}

const GROUPINGS = ['Time', 'Type'];

const HISTORY_WINDOWS = [
  { label: '24 hours', hours: 24 },
  { label: '7 days', hours: 24 * 7 },
  { label: 'All', hours: null }
];

function progressionModel(prog, gridEnvironments, windowHours, now) {
  const p = prog || {};
  // Columns come from the grid, not from this payload, so an expanded row lines
  // up with the collapsed one above it.
  const envs = (gridEnvironments || []).map(e => ({ id: e.id, name: e.name }));
  const seenPerChannel = {};

  const releases = (p.Releases || []).map(entry => {
    const rel = entry.Release || {};
    const channelName = (entry.Channel && entry.Channel.Name) || '';
    const channelId = rel.ChannelId || (entry.Channel && entry.Channel.Id) || '';
    // The list is newest first, so the count already seen in this channel is
    // how many newer releases sit in front of this one.
    const lag = seenPerChannel[channelId] || 0;
    seenPerChannel[channelId] = lag + 1;

    const deployments = entry.Deployments || {};
    const cells = envs.map(env => {
      const items = deployments[env.id] || [];
      let stateKey = null, when = null, tenants = 0;
      items.forEach(it => {
        const at = it.CompletedTime || it.StartTime || it.QueueTime || it.Created || null;
        if (!when || (at && at > when)) { when = at; stateKey = releaseStateKey(it.State); }
        if (it.TenantId) tenants++;
      });
      return {
        envId: env.id, envName: env.name,
        deployed: items.length > 0,
        stateKey: stateKey || null,
        stateLabel: stateKey ? releaseStateLabel(stateKey) : '',
        when: when, tenantCount: tenants, count: items.length
      };
    });

    const reachedIdx = cells.reduce((last, c, i) => (c.deployed ? i : last), -1);
    return {
      version: rel.Version,
      releaseId: rel.Id,
      channelId: channelId,
      channelName: channelName,
      assembled: rel.Assembled || null,
      lag: lag,
      cells: cells,
      frontier: reachedIdx,
      everDeployed: reachedIdx >= 0
    };
  });

  // A release is in the window if it was created in it or moved in it. A release
  // cut a month ago and promoted to Production this morning is this morning's
  // news, and filtering on creation alone would hide it.
  const cutoff = windowHours ? (now || Date.now()) - windowHours * 3600 * 1000 : null;
  const latestTouch = r => {
    let t = r.assembled ? Date.parse(r.assembled) : 0;
    r.cells.forEach(c => { if (c.when) { const w = Date.parse(c.when); if (w > t) t = w; } });
    return t;
  };
  const all = releases;
  const shown = cutoff == null ? all : all.filter(r => latestTouch(r) >= cutoff);

  const channels = [];
  shown.forEach(r => { if (r.channelName && channels.indexOf(r.channelName) === -1) channels.push(r.channelName); });

  return {
    environments: envs,
    releases: shown,
    totalReleases: all.length,
    hiddenByWindow: all.length - shown.length,
    channels: channels,
    neverDeployedCount: shown.filter(r => !r.everDeployed).length,
    // The server caps history. Say when we are probably looking at a window
    // rather than the whole story.
    windowed: all.length >= PROGRESSION_HISTORY,
    historyCount: PROGRESSION_HISTORY
  };
}


// ─── Feature flags ───────────────────────────────────────────────────────────
// Flags are project-scoped, so they join the expanded row alongside its release
// history. skip and take are REQUIRED — the endpoint 400s without them — and
// the list is long: Octopus Server carries 191 flags.
//
// Almost none of them are news. Of those 191, 146 are on in every environment
// they are set in and 24 have no environment override at all. What is worth a
// row is a flag mid-journey: partially rolled out, or on in some environments
// and off in others. The rest are counted, not drawn.

const FLAG_PAGE = 100;
const FLAG_MAX_PAGES = 4;

async function fetchFeatureToggles(spaceId, projectId) {
  const base = '/api/' + spaceId + '/projects/' + encodeURIComponent(projectId) + '/featuretoggles';
  let items = [], total = null, page = 0;
  // Bounded: four pages, then we stop and say so. An unbounded loop over a
  // paged endpoint is exactly what the dashboard guidelines warn against.
  while (page < FLAG_MAX_PAGES) {
    const res = await fetchJson(base + '?skip=' + (page * FLAG_PAGE) + '&take=' + FLAG_PAGE);
    const batch = (res && res.Items) || [];
    if (total == null) total = res && typeof res.TotalResults === 'number' ? res.TotalResults : batch.length;
    items = items.concat(batch);
    if (!batch.length || items.length >= total) break;
    page++;
  }
  return { items: items, total: total == null ? items.length : total, truncated: items.length < (total || 0) };
}

function flagEnvState(env) {
  if (!env) return { key: 'inherit', percent: null };
  if (!env.IsEnabled) return { key: 'off', percent: null };
  const pct = env.RolloutPercentage != null ? env.RolloutPercentage : env.ClientRolloutPercentage;
  if (pct != null && pct > 0 && pct < 100) return { key: 'partial', percent: pct };
  return { key: 'on', percent: pct == null ? 100 : pct };
}

/** A flag is in flight when it is part-way somewhere: a percentage between 0
 *  and 100, or on in one environment and off in another. */
function flagIsInFlight(flag) {
  const envs = flag.Environments || [];
  if (!envs.length) return false;
  if (envs.some(e => flagEnvState(e).key === 'partial')) return true;
  const states = {};
  envs.forEach(e => { states[flagEnvState(e).key] = true; });
  return !!(states.on && states.off);
}

function featureFlagModel(payload, gridEnvironments) {
  const src = payload || {};
  const all = src.items || [];
  const envs = (gridEnvironments || []).map(e => ({ id: e.id, name: e.name }));

  const inFlight = all.filter(flagIsInFlight).map(f => {
    const byEnv = {};
    (f.Environments || []).forEach(e => { byEnv[e.DeploymentEnvironmentId] = e; });
    const cells = envs.map(env => {
      const e = byEnv[env.id];
      const st = flagEnvState(e);
      const tenantCount = e ? ((e.TenantIds || []).length + (e.TenantTags || []).length) : 0;
      return { envId: env.id, envName: env.name, state: st.key, percent: st.percent, tenantCount: tenantCount };
    });
    return {
      id: f.Id, name: f.Name, slug: f.Slug,
      defaultOn: !!f.DefaultIsEnabled,
      cells: cells,
      // Furthest environment it is live in at all, so the label can ride the
      // line the way a release does.
      frontier: cells.reduce((last, c, i) => (c.state === 'on' || c.state === 'partial' ? i : last), -1)
    };
  }).sort((a, b) => String(a.name).localeCompare(String(b.name)));

  const settled = { onEverywhere: 0, offEverywhere: 0, noOverrides: 0 };
  all.forEach(f => {
    if (flagIsInFlight(f)) return;
    const envs2 = f.Environments || [];
    if (!envs2.length) settled.noOverrides++;
    else if (envs2.every(e => e.IsEnabled)) settled.onEverywhere++;
    else settled.offEverywhere++;
  });

  return { flags: inFlight, total: src.total || all.length, settled: settled, truncated: !!src.truncated };
}


// ─── Feature flag changes ────────────────────────────────────────────────────
// Current state has no timestamp, so seeing a flag flip next to the release it
// shipped with means reading the audit trail. Each event carries DocumentContext
// (the document BEFORE the change) and Differences (a JSON patch describing the
// change), which together give both ends of the arrow.
//
// Environment overrides arrive as a whole-object add or replace at
// /Environments/N. An `add` has no before-state at that index, which is a real
// distinction: no override existed, which is not the same as the flag being off.

const FLAG_EVENT_TAKE = 100;

async function fetchFlagEvents(spaceId, projectId) {
  return fetchJson('/api/' + spaceId + '/events?documentTypes=FeatureToggles&projects='
    + encodeURIComponent(projectId) + '&take=' + FLAG_EVENT_TAKE);
}

function flagChangeModel(events, gridEnvironments, windowHours, now) {
  const items = (events && events.Items) || [];
  const envName = {};
  (gridEnvironments || []).forEach(e => { envName[e.id] = e.name; });
  const cutoff = windowHours ? (now || Date.now()) - windowHours * 3600 * 1000 : null;

  const changes = [];
  items.forEach((ev, evIndex) => {
    const cd = ev.ChangeDetails || {};
    const ctx = cd.DocumentContext || {};
    const name = ctx.Name || '';
    const at = ev.Occurred ? Date.parse(ev.Occurred) : null;
    if (at == null || isNaN(at)) return;
    if (cutoff != null && at < cutoff) return;

    (cd.Differences || []).forEach((d, dIndex) => {
      const path = String(d.path || '');
      const envMatch = /^\/Environments\/(\d+)$/.exec(path);
      if (envMatch) {
        const idx = Number(envMatch[1]);
        const after = d.value || null;
        const before = (ctx.Environments || [])[idx] || null;
        const envId = (after && after.DeploymentEnvironmentId)
          || (before && before.DeploymentEnvironmentId) || null;
        // Only environments the grid is showing; an override for an environment
        // this project never deploys to has no column to sit in.
        if (!envId || !(envId in envName)) return;
        changes.push({
          id: ev.Id + ':' + dIndex, flagName: name, scope: 'environment',
          envId: envId, envName: envName[envId], occurred: at,
          before: before ? flagEnvState(before) : null,
          after: after ? flagEnvState(after) : null,
          username: ev.Username || ''
        });
        return;
      }
      if (path === '/DefaultIsEnabled') {
        changes.push({
          id: ev.Id + ':' + dIndex, flagName: name, scope: 'default',
          envId: null, envName: '', occurred: at,
          before: { key: ctx.DefaultIsEnabled ? 'on' : 'off', percent: null },
          after: { key: d.value ? 'on' : 'off', percent: null },
          username: ev.Username || ''
        });
      }
    });
  });

  return changes.sort((a, b) => b.occurred - a.occurred);
}

/** "Off → 10%" — the arrow the whole audit reconstruction exists to produce. */
function flagChangeLabel(change) {
  const side = st => {
    if (!st) return 'no override';
    if (st.key === 'off') return 'Off';
    if (st.key === 'partial') return st.percent + '%';
    if (st.key === 'on') return st.percent != null && st.percent < 100 ? st.percent + '%' : 'On';
    return 'default';
  };
  return side(change.before) + ' → ' + side(change.after);
}


// ─── Variable changes ────────────────────────────────────────────────────────
// Same reconstruction as flags: DocumentContext holds the variables before the
// change, Differences the patch. Three things are particular to variables.
//
//   Scope.Environment places a change in columns. A variable scoped to two
//   environments changed once, so it is one row marking two columns rather than
//   two rows. Variables with no environment scope apply everywhere.
//
//   Sensitive values are never shown. The audit returns a fixed-width
//   placeholder for them — identical on both sides of the change — so there is
//   no before and after to render even if we wanted one. The row says a secret
//   changed, which is the whole truth available.
//
//   A variable change alters nothing already deployed. Variables are snapshotted
//   into a release when it is created, so the change lands with the next one.

const VARIABLE_EVENT_TAKE = 100;
const VALUE_MAX = 40;

async function fetchVariableEvents(spaceId, projectId) {
  return fetchJson('/api/' + spaceId + '/events?documentTypes=variableset&projects='
    + encodeURIComponent(projectId) + '&take=' + VARIABLE_EVENT_TAKE);
}

function isSensitiveVariable(v) {
  return !!(v && (v.Type === 'Sensitive' || v.IsSensitive));
}

function shortValue(v) {
  if (v == null) return '';
  const str = String(v);
  if (!str.length) return 'empty';
  return str.length > VALUE_MAX ? str.slice(0, VALUE_MAX - 1) + '…' : str;
}

function variableChangeModel(events, gridEnvironments, windowHours, now) {
  const items = (events && events.Items) || [];
  const envName = {};
  (gridEnvironments || []).forEach(e => { envName[e.id] = e.name; });
  const cutoff = windowHours ? (now || Date.now()) - windowHours * 3600 * 1000 : null;

  const changes = [];
  items.forEach(ev => {
    const cd = ev.ChangeDetails || {};
    const ctx = cd.DocumentContext || {};
    const at = ev.Occurred ? Date.parse(ev.Occurred) : null;
    if (at == null || isNaN(at)) return;
    if (cutoff != null && at < cutoff) return;
    const vars = ctx.Variables || [];

    (cd.Differences || []).forEach((d, dIndex) => {
      const path = String(d.path || '');
      const valueMatch = /^\/Variables\/(\d+)\/Value$/.exec(path);
      const wholeMatch = /^\/Variables\/(\d+)$/.exec(path);
      if (!valueMatch && !wholeMatch) return;

      const idx = Number((valueMatch || wholeMatch)[1]);
      const before = vars[idx] || null;
      const after = wholeMatch ? (d.value || null) : null;
      const subject = before || after;
      if (!subject) return;

      const sensitive = isSensitiveVariable(before) || isSensitiveVariable(after);
      const scopeEnvs = ((subject.Scope && subject.Scope.Environment) || [])
        .filter(id => id in envName);
      const hasEnvScope = !!((subject.Scope && subject.Scope.Environment) || []).length;

      changes.push({
        id: ev.Id + ':' + dIndex,
        name: subject.Name || '(unnamed)',
        kind: wholeMatch ? 'added' : 'value',
        sensitive: sensitive,
        // Never carry a sensitive value through, placeholder or not.
        before: sensitive || !valueMatch ? null : shortValue(before ? before.Value : null),
        after: sensitive || !valueMatch ? null : shortValue(d.value),
        envIds: scopeEnvs,
        // Scoped somewhere this grid does not show, versus scoped nowhere.
        scopedElsewhere: hasEnvScope && !scopeEnvs.length,
        occurred: at,
        username: ev.Username || ''
      });
    });
  });

  return changes.sort((a, b) => b.occurred - a.occurred);
}

function variableChangeLabel(change) {
  if (!change) return '';
  if (change.sensitive) return 'secret changed';
  if (change.kind === 'added') return 'added';
  const before = change.before === '' ? 'empty' : change.before;
  const after = change.after === '' ? 'empty' : change.after;
  if (before == null && after == null) return 'changed';
  return before + ' → ' + after;
}


// Which views depend on the infrastructure estate. Projects reads the project
// dashboard directly, so a space whose machines we are not permitted to read
// still has a working Projects tab — /machines/all can 403 while /dashboard
// returns 200, which is exactly the case on Cloud Platform.
const ESTATE_FREE_VIEWS = ['projects', 'tenants'];

function viewNeedsEstate(view) {
  return ESTATE_FREE_VIEWS.indexOf(view) === -1;
}


// ─── Tenants ─────────────────────────────────────────────────────────────────
// A tenant has no health status of its own, so its state has to be composed
// from facts that are independent of each other and must stay that way:
//
//   Connection    can it be deployed to at all
//   Last outcome  did the last attempt work
//   Currency      is what runs on it current (needs a project scope — see below)
//   Readiness     would a deployment succeed on config
//
// Merging those into one badge would hide which of four different problems a
// tenant has. Readiness is absent here on purpose: it needs a request per
// tenant, which is fine on a detail page and impossible across a list.
//
// The list costs three requests regardless of tenant count — the tenant pages,
// one dashboard, and the tag sets — because the dashboard already carries every
// tenant's current deployments.

const TENANT_PAGE = 100;
const TENANT_MAX_PAGES = 20;
const STUCK_DAYS = 7;

async function fetchTenants(spaceId) {
  let items = [], total = null, page = 0;
  while (page < TENANT_MAX_PAGES) {
    const res = await fetchJson('/api/' + spaceId + '/tenants?skip=' + (page * TENANT_PAGE) + '&take=' + TENANT_PAGE);
    const batch = (res && res.Items) || [];
    if (total == null) total = res && typeof res.TotalResults === 'number' ? res.TotalResults : batch.length;
    items = items.concat(batch);
    if (!batch.length || items.length >= total) break;
    page++;
  }
  return { items: items, total: total == null ? items.length : total, truncated: items.length < (total || 0) };
}

async function fetchTagSets(spaceId) {
  return fetchJson('/api/' + spaceId + '/tagsets/all');
}

/** Tenant tags arrive as "SetName/TagName". The sets are whatever the instance
 *  defines, so the facet groups are read from the data rather than assumed. */
function parseTenantTag(raw) {
  const str = String(raw || '');
  const slash = str.indexOf('/');
  if (slash === -1) return { set: '', name: str, raw: str };
  return { set: str.slice(0, slash), name: str.slice(slash + 1), raw: str };
}

function tenantOutcomeKey(state, at, now) {
  const key = releaseStateKey(state);
  // A task still running after a week is not "in progress" in any useful sense.
  if (key === 'running' && at && ((now || Date.now()) - at) > STUCK_DAYS * 86400000) return 'stuck';
  return key;
}

function tenantsModel(payload) {
  const src = payload || {};
  const tenants = (src.tenants && src.tenants.items) || [];
  const dash = src.dashboard || {};
  const now = src.now || Date.now();

  const projectName = {};
  (dash.Projects || []).forEach(p => { projectName[p.Id] = p.Name; });
  const envName = {};
  (dash.Environments || []).forEach(e => { envName[e.Id] = e.Name; });

  // One pass over the dashboard: every tenant's current deployments.
  const byTenant = {};
  (dash.Items || []).forEach(i => {
    if (!i || !i.TenantId || !i.IsCurrent) return;
    (byTenant[i.TenantId] || (byTenant[i.TenantId] = [])).push(i);
  });

  const rows = tenants.map(t => {
    const items = byTenant[t.Id] || [];
    const pairs = t.ProjectEnvironments || {};
    const connectedProjects = Object.keys(pairs);
    const pairCount = connectedProjects.reduce((n, pid) => n + ((pairs[pid] || []).length), 0);

    let last = null;
    items.forEach(i => {
      const at = Date.parse(i.CompletedTime || i.StartTime || i.QueueTime || i.Created || 0) || 0;
      if (!last || at > last.at) last = { at: at, state: i.State, projectId: i.ProjectId };
    });

    const projectsOn = {}; const envsOn = {};
    items.forEach(i => { projectsOn[i.ProjectId] = true; envsOn[i.EnvironmentId] = true; });

    const outcome = last ? tenantOutcomeKey(last.state, last.at, now) : null;
    return {
      id: t.Id, name: t.Name, slug: t.Slug, disabled: !!t.IsDisabled,
      description: t.Description || '',
      tags: (t.TenantTags || []).map(parseTenantTag),
      connected: pairCount > 0,
      pairCount: pairCount,
      connectedProjectIds: connectedProjects,
      projectsOn: Object.keys(projectsOn),
      environmentsOn: Object.keys(envsOn).map(id => envName[id] || id),
      deployed: items.length > 0,
      outcome: outcome,
      outcomeLabel: outcome ? (outcome === 'stuck' ? 'Stuck' : releaseStateLabel(outcome)) : '',
      outcomeAt: last ? last.at : null,
      outcomeProject: last ? (projectName[last.projectId] || '') : '',
      // Four independent facts, never merged into one score.
      needsAttention: outcome === 'failed' || outcome === 'timedout' || outcome === 'stuck',
      neverDeployed: pairCount > 0 && items.length === 0,
      notConnected: pairCount === 0
    };
  });

  return {
    tenants: rows,
    total: (src.tenants && src.tenants.total) || rows.length,
    truncated: !!(src.tenants && src.tenants.truncated),
    tagSets: (src.tagSets || []).map(ts => ({
      name: ts.Name,
      tags: (ts.Tags || []).map(tag => ({ name: tag.Name, colour: tag.Color || '' }))
    })),
    projects: (dash.Projects || []).map(p => ({ id: p.Id, name: p.Name })),
    environments: (dash.Environments || []).map(e => ({ id: e.Id, name: e.Name })),
    counts: {
      needsAttention: rows.filter(r => r.needsAttention).length,
      neverDeployed: rows.filter(r => r.neverDeployed).length,
      notConnected: rows.filter(r => r.notConnected).length
    }
  };
}

/** Actionability, not alphabet: what is broken, then what has never run, then
 *  what is not wired up, then name. Sorting 1,228 tenants by name puts the ones
 *  that need someone on page nine. */
const TENANT_SORTS = ['Actionability', 'Name', 'Last activity'];

function sortTenants(rows, sort) {
  const copy = rows.slice();
  if (sort === 'Name') return copy.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  if (sort === 'Last activity') return copy.sort((a, b) => (b.outcomeAt || 0) - (a.outcomeAt || 0));
  const rank = r => r.needsAttention ? 0 : (r.neverDeployed ? 1 : (r.notConnected ? 2 : 3));
  return copy.sort((a, b) => (rank(a) - rank(b))
    || ((b.outcomeAt || 0) - (a.outcomeAt || 0))
    || String(a.name).localeCompare(String(b.name)));
}

function filterTenants(rows, query, selected) {
  const q = String(query || '').trim().toLowerCase();
  const sel = selected || {};
  const tagsWanted = Object.keys(sel.tags || {}).filter(k => sel.tags[k]);
  const envsWanted = Object.keys(sel.environments || {}).filter(k => sel.environments[k]);
  const projWanted = Object.keys(sel.projects || {}).filter(k => sel.projects[k]);
  const stateWanted = Object.keys(sel.state || {}).filter(k => sel.state[k]);

  return rows.filter(r => {
    if (q && String(r.name).toLowerCase().indexOf(q) === -1
        && String(r.id).toLowerCase().indexOf(q) === -1) return false;
    if (tagsWanted.length && !tagsWanted.every(t => r.tags.some(x => x.raw === t))) return false;
    if (envsWanted.length && !envsWanted.some(e => r.environmentsOn.indexOf(e) !== -1)) return false;
    if (projWanted.length && !projWanted.some(p => r.connectedProjectIds.indexOf(p) !== -1)) return false;
    if (stateWanted.length) {
      const has = stateWanted.some(st =>
        (st === 'needs-attention' && r.needsAttention) ||
        (st === 'never-deployed' && r.neverDeployed) ||
        (st === 'not-connected' && r.notConnected));
      if (!has) return false;
    }
    return true;
  });
}

/** Facet counts are computed against everything else that is selected, so a
 *  count never promises rows that clicking it would not produce. */
function tenantFacets(rows, query, selected) {
  const count = (key, value) => {
    const probe = JSON.parse(JSON.stringify(selected || {}));
    probe[key] = probe[key] || {};
    probe[key][value] = true;
    return filterTenants(rows, query, probe).length;
  };
  return { count: count };
}

if (typeof window !== 'undefined') { window.Data = { setServerUrl, apiUrl, fetchJson, readConfig, loadSpaces, hydrateSpace,
  buildEstate, isEmptyEstate, coldStartApplies, filterEnvRows, emptyKind, taskKind, machineActivityModel, eventsModel, fetchMachineDetail, overviewModel, environmentsModel, policiesModel, buildFacets, applyFilters,
  workersModel, workerFacets, applyWorkerFilters, machineToTarget, typeGroup, healthKeyLabel, osVersionLabel,
  vkey, majorVersion, versionBand, deriveLatest, agentsModel,
  fetchDashboard, releasesModel, releaseStateKey, releaseStateLabel, linkTone,
  fetchProgression, progressionModel, HISTORY_WINDOWS,
  fetchFeatureToggles, featureFlagModel, flagEnvState, flagIsInFlight,
  fetchFlagEvents, flagChangeModel, flagChangeLabel, GROUPINGS,
  fetchVariableEvents, variableChangeModel, variableChangeLabel, isSensitiveVariable,
  viewNeedsEstate,
  fetchTenants, fetchTagSets, tenantsModel, sortTenants, filterTenants, tenantFacets,
  parseTenantTag, tenantOutcomeKey, TENANT_SORTS }; }

if (typeof module !== 'undefined') {
  module.exports = { setServerUrl, apiUrl, fetchJson, readConfig, loadSpaces, hydrateSpace,
    healthLabel, healthKey, healthKeyLabel, commLabel, kindLabel, typeGroup, envCat, extractVersion, osLabel, osVersionLabel,
    machineToTarget, buildEstate, isEmptyEstate, coldStartApplies, filterEnvRows, emptyKind, taskKind, machineActivityModel, eventsModel, fetchMachineDetail, overviewModel, environmentsModel, policiesModel, buildFacets, applyFilters,
    workersModel, workerFacets, applyWorkerFilters,
    vkey, majorVersion, versionBand, deriveLatest, agentsModel,
    fetchDashboard, releasesModel, releaseStateKey, releaseStateLabel, linkTone,
    fetchProgression, progressionModel, HISTORY_WINDOWS,
    fetchFeatureToggles, featureFlagModel, flagEnvState, flagIsInFlight,
    fetchFlagEvents, flagChangeModel, flagChangeLabel, GROUPINGS,
    fetchVariableEvents, variableChangeModel, variableChangeLabel, isSensitiveVariable, shortValue,
    viewNeedsEstate,
    fetchTenants, fetchTagSets, tenantsModel, sortTenants, filterTenants, tenantFacets,
    parseTenantTag, tenantOutcomeKey, TENANT_SORTS };
}
