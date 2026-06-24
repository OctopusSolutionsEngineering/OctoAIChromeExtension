/* Target agent versions — Octopus AI Assistant community dashboard.
 *
 * Instance-wide, read-only view of the deployment-target estate across ALL
 * spaces: Tentacle / Kubernetes agent versions, upgrade status, health,
 * environment, machine policy and the space each target lives in.
 *
 * Ported from the Claude Design component "Fleet version.dc.html".
 *
 * Data: real Octopus REST API across every space when a server is configured;
 * rich mock data (the design's generators) when it isn't, so the UI previews
 * and can be tested without a live instance.
 *
 * SECURITY / SCOPE NOTES (see also the repo dashboard rules):
 *  - This dashboard makes ONLY read (GET) requests to the Octopus API.
 *  - The "Upgrade now" action is NON-mutating: in mock mode it animates the
 *    row locally; against a real server it LINKS OUT to the deployment target's
 *    page in Octopus — it never POSTs an upgrade.
 *  - No external resources, no Chrome extension APIs, no cookie reads.
 *  - All API-derived strings are HTML-escaped before rendering.
 *
 * UNVERIFIED-AGAINST-LIVE flags (confirm before sharing widely):
 *  - policyMode(): the exact machine-policy field for the Tentacle/K8s update
 *    setting (Auto vs Manual) is inferred; verify field names on a live API.
 *  - "Last seen" has no confirmed per-target field; not shown in the table
 *    (CSV only), left as "—" for real data.
 *  - Kubernetes agent CommunicationStyle assumed to be "KubernetesTentacle".
 *  - Instance-wide load fans out 4 calls per space; fine for typical instances,
 *    but flag for very large space counts (consider paging machines).
 */

/* ─── Small helpers ──────────────────────────────────────────── */
function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function vkey(v) { return String(v || '').split('.').map(n => String(n).padStart(4, '0')).join('.'); }

/* ─── Visual metadata (mirrors the design's decorate()) ──────── */
const STATUS = {
  uptodate:  { label: 'Up to date',        bg: 'rgba(0,135,77,.16)',   fg: '#5ECD9E', dot: '#00C172', seg: '#00874D' },
  suggested: { label: 'Upgrade suggested', bg: 'rgba(229,178,3,.16)',  fg: '#FFDF62', dot: '#E5B203', seg: '#E5B203' },
  required:  { label: 'Upgrade required',  bg: 'rgba(255,149,0,.16)',  fg: '#FFC078', dot: '#ff9500', seg: '#ff9500' }
};
const HEALTH = {
  'Healthy':                { bg: 'rgba(0,135,77,.16)',  fg: '#5ECD9E', dot: '#00C172' },
  'Healthy with warnings':  { bg: 'rgba(229,178,3,.16)', fg: '#FFDF62', dot: '#E5B203' },
  'Unhealthy':              { bg: 'rgba(214,61,61,.16)', fg: '#FF9F9F', dot: '#D63D3D' },
  'Unavailable':            { bg: 'rgba(255,255,255,.07)', fg: '#A7B7C6', dot: '#6b7d8f' }
};
const ENVMETA = {
  production: { bg: 'rgba(0,135,77,.16)',  fg: '#5ECD9E' },
  staging:    { bg: 'rgba(229,178,3,.16)', fg: '#FFDF62' },
  dev:        { bg: 'rgba(26,119,202,.18)', fg: '#87BFEC' },
  other:      { bg: 'rgba(255,255,255,.06)', fg: '#A7B7C6' }
};

function decorate(r, latest) {
  r._latest = latest || '';
  const S = STATUS[r.statusKey] || STATUS.uptodate;
  const H = HEALTH[r.health] || HEALTH.Unavailable;
  const E = ENVMETA[r.envCat] || ENVMETA.other;
  const badge = 'display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:11px;font-size:12px;font-weight:600;white-space:nowrap;';
  const dot = 'width:7px;height:7px;border-radius:50%;flex:none;';
  r.statusLabel = S.label;
  r.statusStyle = badge + 'background:' + S.bg + ';color:' + S.fg + ';';
  r.statusDot = dot + 'background:' + S.dot + ';';
  r.healthStyle = badge + 'background:' + H.bg + ';color:' + H.fg + ';';
  r.healthDot = dot + 'background:' + H.dot + ';';
  r.envStyle = 'display:inline-flex;align-items:center;padding:4px 10px;border-radius:4px;font-size:12.5px;font-weight:600;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:' + E.bg + ';color:' + E.fg + ';';
  r.modeStyle = (r.mode === 'Auto')
    ? 'display:inline-flex;align-items:center;padding:2px 9px;border-radius:10px;font-size:10.5px;font-weight:700;letter-spacing:.03em;flex:none;background:rgba(26,119,202,.18);color:#87BFEC;'
    : 'display:inline-flex;align-items:center;padding:2px 9px;border-radius:10px;font-size:10.5px;font-weight:700;letter-spacing:.03em;flex:none;background:rgba(255,255,255,.08);color:#A7B7C6;';
  r._tint = r.statusKey === 'required' ? 'rgba(255,149,0,.05)' : (r.statusKey === 'suggested' ? 'rgba(229,178,3,.035)' : 'transparent');
  r.rowTint = r._tint;
  r.moreLabel = r.moreTags ? ('+' + r.moreTags + (r.moreTags > 1 ? ' tags' : ' tag')) : '';
  r.tenantColor = r.tenant === 'No tenants' ? '#6b7d8f' : '#cdd8e2';
  r.ttsColor = r.tenantTagSet === 'No tenant tags' ? '#6b7d8f' : '#cdd8e2';
  r.isSuggested = r.statusKey === 'suggested';
  r.isUpToDate = r.statusKey === 'uptodate';
  return r;
}

/* ─── Mock data generators (from the design) ─────────────────── */
const LATEST_T_MOCK = '8.5.1';
const LATEST_K_MOCK = '2.6.0';
const MOCK_SPACES = ['Default', 'Platform Engineering', 'Payments', 'Data Platform'];

function makeMockTentacles() {
  const envs = [
    { name: 'Production', cat: 'production' }, { name: 'Staging', cat: 'staging' },
    { name: 'Development', cat: 'dev' }, { name: 'Internal Infrastructure', cat: 'dev' },
    { name: 'PreProd', cat: 'staging' }
  ];
  const policies = [
    { name: 'Default Machine Policy', mode: 'Auto' }, { name: 'Cloud Auto', mode: 'Auto' },
    { name: 'Manual Updates', mode: 'Manual' }, { name: 'Hospital Nodes', mode: 'Manual' }
  ];
  const plan = [
    { v: '8.5.1', n: 18, st: 'uptodate' }, { v: '8.4.2', n: 9, st: 'suggested' },
    { v: '8.4.0', n: 5, st: 'suggested' }, { v: '8.3.1', n: 4, st: 'suggested' },
    { v: '8.2.4', n: 4, st: 'suggested' }, { v: '8.1.0', n: 2, st: 'suggested' },
    { v: '7.4.3', n: 2, st: 'suggested' }
  ];
  const pfx = ['web', 'api', 'worker', 'sql', 'cache', 'queue', 'app', 'build', 'search', 'gateway', 'ingest', 'report'];
  const comm = ['Listening Tentacle', 'Polling Tentacle'];
  const tagPool = ['web-server', 'db-node', 'windows', 'linux-host', 'api-tier', 'gateway', 'cache-node', 'build-agent'];
  const tenants = ['No tenants', 'No tenants', 'No tenants', 'No tenants', 'Acme Corp', 'Globex', 'Initech', 'Umbrella'];
  const ttsPool = ['Region / EU', 'Region / US', 'Tier / Gold'];
  const out = []; let i = 0;
  for (const p of plan) {
    for (let k = 0; k < p.n; k++) {
      const env = envs[i % envs.length];
      const pol = policies[(i + k) % policies.length];
      let health; const h = i % 7;
      if (h === 0) health = 'Unhealthy';
      else if (h === 3) health = 'Unavailable';
      else if (h === 1 || h === 5) health = 'Healthy with warnings';
      else health = 'Healthy';
      const envshort = env.cat === 'production' ? 'prod' : env.cat === 'staging' ? 'stg' : 'dev';
      const name = pfx[i % pfx.length] + '-' + envshort + '-' + String(i + 1).padStart(2, '0');
      const tenant = tenants[i % tenants.length];
      out.push(decorate({
        id: name, name, version: p.v, statusKey: p.st,
        space: MOCK_SPACES[i % MOCK_SPACES.length], spaceId: null,
        env: env.name, envCat: env.cat, policy: pol.name, mode: pol.mode,
        health, lastSeen: 'just now', comm: comm[i % 2],
        targetTag: tagPool[i % tagPool.length], moreTags: (i % 3 === 0) ? (1 + (i % 2)) : 0,
        tenant, tenantTagSet: tenant === 'No tenants' ? 'No tenant tags' : ttsPool[i % ttsPool.length]
      }, LATEST_T_MOCK));
      i++;
    }
  }
  return out;
}

function makeMockK8s() {
  const envs = [{ name: 'Production', cat: 'production' }, { name: 'Staging', cat: 'staging' }, { name: 'Development', cat: 'dev' }];
  const policies = [{ name: 'Default Machine Policy', mode: 'Auto' }, { name: 'Manual Updates', mode: 'Manual' }];
  const plan = [{ v: '2.6.0', n: 6, st: 'uptodate' }, { v: '2.5.2', n: 4, st: 'suggested' }, { v: '2.4.0', n: 3, st: 'suggested' }, { v: '2.2.1', n: 2, st: 'suggested' }];
  const pfx = ['eks', 'aks', 'gke', 'k3s', 'rancher'];
  const spaces = ['Default', 'Platform Engineering', 'Data Platform'];
  const tagPool = ['eks', 'aks', 'k8s-prod', 'linux-node'];
  const tenants = ['No tenants', 'No tenants', 'No tenants', 'Acme Corp', 'Globex'];
  const out = []; let i = 0;
  for (const p of plan) {
    for (let k = 0; k < p.n; k++) {
      const env = envs[i % envs.length];
      const pol = policies[(i + k) % policies.length];
      let health;
      if (p.st === 'uptodate') health = (i % 6 === 0) ? 'Healthy with warnings' : 'Healthy';
      else health = (k % 3 === 0) ? 'Unhealthy' : (k % 4 === 0 ? 'Unavailable' : 'Healthy');
      const envshort = env.cat === 'production' ? 'prod' : env.cat === 'staging' ? 'stg' : 'dev';
      const name = pfx[i % pfx.length] + '-' + envshort + '-' + String(i + 1).padStart(2, '0');
      const tenant = tenants[i % tenants.length];
      out.push(decorate({
        id: name, name, version: p.v, statusKey: p.st,
        space: spaces[i % spaces.length], spaceId: null,
        env: env.name, envCat: env.cat, policy: pol.name, mode: pol.mode,
        health, lastSeen: 'just now', comm: 'Kubernetes Agent',
        targetTag: tagPool[i % tagPool.length], moreTags: (i % 3 === 0) ? 1 : 0,
        tenant, tenantTagSet: tenant === 'No tenants' ? 'No tenant tags' : 'Region / EU'
      }, LATEST_K_MOCK));
      i++;
    }
  }
  return out;
}

/* ─── App state ──────────────────────────────────────────────── */
const state = {
  view: 'ready',        // ready | loading | auth | error | empty
  isMock: true,
  serverUrl: null,
  errorCode: '',
  tab: 'tentacles',
  tentacles: [], k8s: [],
  latestT: LATEST_T_MOCK, latestK: LATEST_K_MOCK,
  search: '', fSpace: 'all', fEnv: 'all', fPolicy: 'all', fVersion: 'all', fStatus: 'all', fHealth: 'all', fType: 'all',
  groupBy: 'health',
  _filtered: []
};

function activeTargets() { return state.tab === 'k8s' ? state.k8s : state.tentacles; }
function activeLatest() { return state.tab === 'k8s' ? state.latestK : state.latestT; }
function resetFilters() { Object.assign(state, { search: '', fSpace: 'all', fEnv: 'all', fPolicy: 'all', fVersion: 'all', fStatus: 'all', fHealth: 'all', fType: 'all' }); }

/* ─── Real Octopus API (instance-wide) ───────────────────────── */
function apiUrl(path) { return new URL(path, state.serverUrl).toString(); }

async function fetchJson(path) {
  const res = await fetch(apiUrl(path), { method: 'GET', credentials: 'include', headers: { 'Accept': 'application/json' } });
  if (res.status === 401 || res.status === 403) { const e = new Error('auth'); e.auth = true; throw e; }
  if (!res.ok) { const e = new Error(res.status + ' ' + res.statusText); e.code = res.status + ' ' + res.statusText; throw e; }
  return res.json();
}

function commLabel(style) {
  if (style === 'TentacleActive') return 'Polling Tentacle';
  if (style === 'TentaclePassive') return 'Listening Tentacle';
  if (style === 'KubernetesTentacle') return 'Kubernetes Agent';
  return style || '';
}
function healthLabel(api) {
  if (api === 'Healthy') return 'Healthy';
  if (api === 'HealthyWithWarnings') return 'Healthy with warnings';
  if (api === 'Unhealthy') return 'Unhealthy';
  if (api === 'Unavailable') return 'Unavailable';
  return 'Unavailable'; // Unknown / null
}
function envCat(name) {
  const n = (name || '').toLowerCase();
  if (/prod/.test(n)) return 'production';
  if (/stag|preprod|pre-prod|uat|qa|test/.test(n)) return 'staging';
  if (/dev|internal|sandbox|local/.test(n)) return 'dev';
  return 'other';
}
// FLAG: machine-policy update-setting field is inferred — verify on a live API.
function policyMode(policy, tab) {
  if (!policy) return 'Auto';
  const mup = policy.MachineUpdatePolicy || {};
  const val = (tab === 'k8s' ? mup.KubernetesAgentUpgradePolicy : mup.TentacleUpgradePolicy)
    || mup.TentacleUpgradePolicy || policy.TentacleUpgradePolicy || '';
  return /manual|never|nochange|donotupgrade/i.test(String(val)) ? 'Manual' : 'Auto';
}
function statusFromEndpoint(tvd) {
  if (!tvd) return 'uptodate';
  if (tvd.UpgradeRequired) return 'required';
  if (tvd.UpgradeSuggested) return 'suggested';
  return 'uptodate';
}
function deriveLatest(rows) {
  const up = rows.filter(r => r.statusKey === 'uptodate' && r.version && r.version !== '—').map(r => r.version);
  const pool = up.length ? up : rows.map(r => r.version).filter(v => v && v !== '—');
  let best = '';
  pool.forEach(v => { if (!best || vkey(v).localeCompare(vkey(best)) > 0) best = v; });
  return best || '—';
}

function machineToPlain(m, ctx) {
  const ep = m.Endpoint || {};
  const tvd = ep.TentacleVersionDetails || null;
  const envName = (m.EnvironmentIds || []).map(id => ctx.envMap[id]).filter(Boolean)[0] || '—';
  const pol = ctx.policyMap[m.MachinePolicyId];
  const roles = m.Roles || [];
  const tenantNames = (m.TenantIds || []).map(id => ctx.tenantMap[id]).filter(Boolean);
  const tenant = tenantNames.length === 0 ? 'No tenants' : (tenantNames.length === 1 ? tenantNames[0] : tenantNames.length + ' tenants');
  const ttags = m.TenantTags || [];
  let tts = 'No tenant tags';
  if (ttags.length) { const parts = String(ttags[0]).split('/'); tts = parts.length > 1 ? parts[0].trim() + ' / ' + parts.slice(1).join('/').trim() : ttags[0]; }
  return {
    id: m.Id, name: m.Name || m.Id,
    space: ctx.spaceName, spaceId: ctx.spaceId,
    version: (tvd && tvd.Version) || '—',
    statusKey: statusFromEndpoint(tvd),
    env: envName, envCat: envCat(envName),
    policy: (pol && pol.Name) || '—', mode: policyMode(pol, ctx.tab),
    health: healthLabel(m.HealthStatus),
    lastSeen: '—', // no confirmed per-target field; CSV only
    comm: commLabel(ep.CommunicationStyle),
    targetTag: roles[0] || '—', moreTags: Math.max(0, roles.length - 1),
    tenant, tenantTagSet: tts
  };
}

const TENTACLE_STYLES = ['TentacleActive', 'TentaclePassive'];
const K8S_STYLES = ['KubernetesTentacle'];

async function loadInstance(spaces) {
  state.view = 'loading'; renderApp();
  const tAll = [], kAll = [];
  let anyAuth = false;

  const results = await Promise.all(spaces.map(async sp => {
    try {
      const [envs, policies, tenants, machines] = await Promise.all([
        fetchJson('/api/' + sp.Id + '/environments/all'),
        fetchJson('/api/' + sp.Id + '/machinepolicies/all'),
        fetchJson('/api/' + sp.Id + '/tenants/all').catch(() => []),
        fetchJson('/api/' + sp.Id + '/machines/all')
      ]);
      return { sp, envs, policies, tenants, machines };
    } catch (e) { if (e && e.auth) anyAuth = true; return null; }
  }));

  const ok = results.filter(Boolean);
  if (!ok.length) {
    state.view = anyAuth ? 'auth' : 'error';
    if (state.view === 'error') state.errorCode = 'Failed to load any space';
    renderApp();
    return;
  }

  ok.forEach(({ sp, envs, policies, tenants, machines }) => {
    const envMap = {}; (envs || []).forEach(e => envMap[e.Id] = e.Name);
    const policyMap = {}; (policies || []).forEach(p => policyMap[p.Id] = p);
    const tenantMap = {}; (tenants || []).forEach(t => tenantMap[t.Id] = t.Name);
    const tCtx = { envMap, policyMap, tenantMap, tab: 'tentacles', spaceId: sp.Id, spaceName: sp.Name };
    const kCtx = { envMap, policyMap, tenantMap, tab: 'k8s', spaceId: sp.Id, spaceName: sp.Name };
    (machines || []).forEach(m => {
      const cs = (m.Endpoint || {}).CommunicationStyle;
      if (TENTACLE_STYLES.includes(cs)) tAll.push(machineToPlain(m, tCtx));
      else if (K8S_STYLES.includes(cs)) kAll.push(machineToPlain(m, kCtx));
    });
  });

  state.latestT = deriveLatest(tAll);
  state.latestK = deriveLatest(kAll);
  state.tentacles = tAll.map(r => decorate(r, state.latestT));
  state.k8s = kAll.map(r => decorate(r, state.latestK));
  state.view = (state.tentacles.length === 0 && state.k8s.length === 0) ? 'empty' : 'ready';
  renderApp();
}

async function bootReal() {
  state.isMock = false;
  state.view = 'loading'; renderApp();
  let spaces;
  try { spaces = await fetchJson('/api/spaces/all'); }
  catch (e) {
    state.view = (e && e.auth) ? 'auth' : 'error';
    if (state.view === 'error') state.errorCode = (e && e.code) || 'Unknown error';
    renderApp(); return;
  }
  if (!spaces || !spaces.length) { state.view = 'empty'; renderApp(); return; }
  await loadInstance(spaces);
}

function startMock() {
  state.isMock = true;
  state.tentacles = makeMockTentacles();
  state.k8s = makeMockK8s();
  state.latestT = LATEST_T_MOCK;
  state.latestK = LATEST_K_MOCK;
  state.view = 'ready';
  renderApp();
}

/* ─── Compute (KPIs, distribution) ───────────────────────────── */
function computeMetrics() {
  const t = activeTargets(), latest = activeLatest();
  const total = t.length;
  const up = t.filter(r => r.statusKey === 'uptodate').length;
  const sug = t.filter(r => r.statusKey === 'suggested').length;
  const att = t.filter(r => r.health === 'Unhealthy' || r.health === 'Unavailable').length;
  const pct = total ? Math.round(up / total * 100) : 0;

  const vmap = {};
  t.forEach(r => { if (!vmap[r.version]) vmap[r.version] = { v: r.version, count: 0, statusKey: r.statusKey }; vmap[r.version].count++; });
  let segs = Object.values(vmap).sort((a, b) => vkey(b.v).localeCompare(vkey(a.v))); // newest first
  const statusesPresent = {};
  segs = segs.map(s => {
    statusesPresent[s.statusKey] = true;
    return { v: s.v, count: s.count, statusKey: s.statusKey, color: (STATUS[s.statusKey] || STATUS.uptodate).seg };
  });
  const spaceCount = new Set(t.map(r => r.space)).size;
  return { total, up, sug, att, pct, latest, segs, statusesPresent, spaceCount };
}

/* ─── Filter + group ─────────────────────────────────────────── */
function filterRows() {
  let f = activeTargets().slice();
  const q = state.search.trim().toLowerCase();
  if (q) f = f.filter(r => r.name.toLowerCase().includes(q) || String(r.version).includes(q));
  if (state.fSpace !== 'all') f = f.filter(r => r.space === state.fSpace);
  if (state.fEnv !== 'all') f = f.filter(r => r.env === state.fEnv);
  if (state.fPolicy !== 'all') f = f.filter(r => r.policy === state.fPolicy);
  if (state.fVersion !== 'all') f = f.filter(r => r.version === state.fVersion);
  if (state.fStatus !== 'all') f = f.filter(r => r.statusKey === state.fStatus);
  if (state.fHealth !== 'all') f = f.filter(r => r.health === state.fHealth);
  if (state.fType !== 'all') f = f.filter(r => r.comm === state.fType);
  f.sort((a, b) => vkey(a.version).localeCompare(vkey(b.version)) || a.name.localeCompare(b.name));
  state._filtered = f;
  return f;
}

function groupRows(rows) {
  const gb = state.groupBy;
  if (gb === 'none') return [{ key: 'all', label: 'All deployment targets', dot: '#1A77CA', count: rows.length, rows }];
  let keyf, defs = null, order = null;
  if (gb === 'status') {
    keyf = r => r.statusKey;
    defs = { required: { label: 'Upgrade required', dot: '#ff9500' }, suggested: { label: 'Upgrade suggested', dot: '#E5B203' }, uptodate: { label: 'Up to date', dot: '#00874D' } };
    order = ['required', 'suggested', 'uptodate'];
  } else if (gb === 'health') {
    keyf = r => r.health;
    defs = { 'Unhealthy': { label: 'Unhealthy', dot: '#D63D3D' }, 'Unavailable': { label: 'Unavailable', dot: '#6b7d8f' }, 'Healthy with warnings': { label: 'Healthy with warnings', dot: '#E5B203' }, 'Healthy': { label: 'Healthy', dot: '#00874D' } };
    order = ['Unhealthy', 'Unavailable', 'Healthy with warnings', 'Healthy'];
  } else if (gb === 'space') { keyf = r => r.space; }
  else if (gb === 'environment') { keyf = r => r.env; }
  else if (gb === 'policy') { keyf = r => r.policy; }
  else if (gb === 'version') { keyf = r => r.version; order = 'ver'; }
  const map = {};
  rows.forEach(r => { const k = keyf(r); (map[k] = map[k] || []).push(r); });
  let keys = Object.keys(map);
  if (order === 'ver') keys.sort((a, b) => vkey(b).localeCompare(vkey(a)));
  else if (Array.isArray(order)) keys.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  else keys.sort();
  return keys.map(k => ({ key: k, label: defs && defs[k] ? defs[k].label : k, dot: defs && defs[k] ? defs[k].dot : '#1A77CA', count: map[k].length, rows: map[k] }));
}

/* ─── Icons (inline SVG, no external deps) ───────────────────── */
const SVG = {
  search: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7d90a1" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>',
  up: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>',
  tag: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#7d90a1" stroke-width="2" style="flex:none;"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>',
  space: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#7d90a1" stroke-width="2" style="flex:none;"><path d="M2 7l10-5 10 5-10 5L2 7z"></path><path d="M2 17l10 5 10-5"></path><path d="M2 12l10 5 10-5"></path></svg>',
  lock: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FF9F9F" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>',
  warn: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FF9F9F" stroke-width="2" style="flex:none;margin-top:1px;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>',
  empty: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8a9bab" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>'
};

/* ─── Render ─────────────────────────────────────────────────── */
const app = () => document.getElementById('fv-app');

function machineUrl(r) {
  const base = String(state.serverUrl || '').replace(/\/$/, '');
  if (!r.id) return base + '/app#/' + (r.spaceId || '') + '/infrastructure/machines';
  return base + '/app#/' + (r.spaceId || '') + '/infrastructure/machines/' + encodeURIComponent(r.id);
}

function headerHtml() {
  const isK = state.tab === 'k8s';
  const mock = state.isMock ? '<span class="fv-mockflag">Mock data</span>' : '';
  let subtitle = '';
  if (state.view === 'ready') {
    const total = activeTargets().length;
    const spaceCount = new Set(activeTargets().map(r => r.space)).size;
    const noun = isK ? 'Kubernetes agents' : 'Tentacle deployment targets';
    const spaceLabel = spaceCount === 1 ? '1 space' : spaceCount + ' spaces';
    subtitle = '<div class="fv-subtitle">' + total + ' ' + noun + ' across ' + spaceLabel +
      ' <span class="sep">·</span> latest available <span class="fv-mono">' + escHtml(activeLatest()) + '</span>' +
      ' <span class="sep">·</span> the whole instance</div>';
  }
  return '<div class="fv-header">' +
    '<div class="fv-title-row"><h1 class="fv-title">Target agent versions</h1>' + mock + '</div>' +
    '<div class="fv-tabs">' +
      '<button class="fv-tab ' + (isK ? '' : 'fv-tab--active') + '" data-tab="tentacles">Tentacles <span class="fv-tab-count">' + state.tentacles.length + '</span></button>' +
      '<button class="fv-tab ' + (isK ? 'fv-tab--active' : '') + '" data-tab="k8s">Kubernetes agents <span class="fv-tab-count">' + state.k8s.length + '</span></button>' +
    '</div>' + subtitle +
  '</div>';
}

function panelHtml() {
  if (state.view === 'auth') {
    return '<div class="fv-panel"><div class="fv-panel-icon fv-panel-icon--auth">' + SVG.lock + '</div>' +
      '<div class="fv-panel-title">Sign in to Octopus</div>' +
      '<div class="fv-panel-text">Your session has expired or you don\'t have access to this instance\'s infrastructure. Sign in to Octopus and retry to view the fleet.</div>' +
      '<button class="fv-retry" id="fv-retry">Retry</button></div>';
  }
  if (state.view === 'error') {
    return '<div class="fv-error">' + SVG.warn + '<div><div class="fv-error-title">Couldn\'t load deployment targets</div>' +
      '<div class="fv-error-text">The Octopus API returned an error: <span class="fv-error-code">' + escHtml(state.errorCode) + '</span>. Check the server is reachable and retry.</div></div></div>';
  }
  if (state.view === 'empty') {
    return '<div class="fv-panel"><div class="fv-panel-icon">' + SVG.empty + '</div>' +
      '<div class="fv-panel-title">No Tentacle deployment targets</div>' +
      '<div class="fv-panel-text">This instance has no Tentacle or Kubernetes agent deployment targets yet. Add one to start tracking its version.</div></div>';
  }
  if (state.view === 'loading') {
    return '<div>' +
      '<div class="fv-skel-kpis">' + [0, 1, 2, 3].map(i => '<div class="fv-skel-card" style="animation-delay:' + (i * 0.1) + 's"></div>').join('') + '</div>' +
      '<div class="fv-skel-bar"></div>' +
      '<div class="fv-skel-table">' + [0, 1, 2, 3, 4, 5, 6].map(() => '<div class="fv-skel-row"></div>').join('') + '</div>' +
    '</div>';
  }
  return '';
}

function kpisHtml(m) {
  const isK = state.tab === 'k8s';
  return '<div class="fv-kpis">' +
    '<div class="fv-kpi"><div class="fv-kpi-label">' + (isK ? 'Kubernetes agents' : 'Deployment targets') + '</div><div class="fv-kpi-value">' + m.total + '</div><div class="fv-kpi-sub">across ' + m.spaceCount + (m.spaceCount === 1 ? ' space' : ' spaces') + '</div></div>' +
    '<div class="fv-kpi fv-kpi--up"><div class="fv-kpi-label">Up to date</div><div class="fv-kpi-value">' + m.up + '</div><div class="fv-kpi-sub">' + m.pct + '% on the latest version</div></div>' +
    '<div class="fv-kpi fv-kpi--sug"><div class="fv-kpi-label">Upgrade suggested</div><div class="fv-kpi-value">' + m.sug + '</div><div class="fv-kpi-sub">recommended to upgrade</div></div>' +
    '<div class="fv-kpi fv-kpi--att"><div class="fv-kpi-label">Needs attention</div><div class="fv-kpi-value">' + m.att + '</div><div class="fv-kpi-sub">unhealthy or unavailable</div></div>' +
  '</div>';
}

function distHtml(m) {
  const isK = state.tab === 'k8s';
  const heading = isK ? 'How the estate spreads across Kubernetes agent versions' : 'How the estate spreads across Tentacle versions';
  const segs = m.segs.map(s => {
    const label = escHtml(s.v + ' · ' + s.count);
    const title = escHtml(s.v + ' — ' + s.count + ' targets');
    return '<div class="fv-dist-seg" title="' + title + '" style="flex:' + s.count + ' 1 0;background:' + s.color + ';"><span>' + label + '</span></div>';
  }).join('');
  const legendDefs = [['uptodate', 'Up to date'], ['suggested', 'Upgrade suggested'], ['required', 'Upgrade required']];
  const legend = legendDefs.filter(d => m.statusesPresent[d[0]]).map(d =>
    '<div class="fv-legend-item"><span class="fv-legend-dot" style="background:' + STATUS[d[0]].seg + '"></span>' + d[1] + '</div>'
  ).join('');
  return '<div class="fv-dist-card"><div class="fv-dist-heading">' + heading + '</div>' +
    '<div class="fv-dist-bar">' + segs + '</div><div class="fv-legend">' + legend + '</div></div>';
}

function optionList(items, current) {
  return items.map(o => '<option value="' + escHtml(o.value) + '"' + (o.value === current ? ' selected' : '') + '>' + escHtml(o.label) + '</option>').join('');
}

function toolbarHtml() {
  const isK = state.tab === 'k8s';
  const at = activeTargets();
  const uniq = arr => [...new Set(arr)];
  const spaceOpts = [{ value: 'all', label: 'All spaces' }, ...uniq(at.map(r => r.space)).sort().map(e => ({ value: e, label: e }))];
  const envOpts = [{ value: 'all', label: 'All environments' }, ...uniq(at.map(r => r.env)).map(e => ({ value: e, label: e }))];
  const polOpts = [{ value: 'all', label: 'All machine policies' }, ...uniq(at.map(r => r.policy)).map(e => ({ value: e, label: e }))];
  const verOpts = [{ value: 'all', label: 'All versions' }, ...uniq(at.map(r => r.version)).sort((a, b) => vkey(b).localeCompare(vkey(a))).map(e => ({ value: e, label: e }))];
  const statusesPresent = uniq(at.map(r => r.statusKey));
  const statusOpts = [{ value: 'all', label: 'All statuses' }]
    .concat(statusesPresent.includes('required') ? [{ value: 'required', label: 'Upgrade required' }] : [])
    .concat([{ value: 'suggested', label: 'Upgrade suggested' }, { value: 'uptodate', label: 'Up to date' }]);
  const healthOpts = [{ value: 'all', label: 'All health' }, { value: 'Healthy', label: 'Healthy' }, { value: 'Healthy with warnings', label: 'Healthy with warnings' }, { value: 'Unhealthy', label: 'Unhealthy' }, { value: 'Unavailable', label: 'Unavailable' }];
  const typeOpts = [{ value: 'all', label: 'All target types' }, { value: 'Listening Tentacle', label: 'Listening Tentacle' }, { value: 'Polling Tentacle', label: 'Polling Tentacle' }];
  const groupOpts = [{ value: 'status', label: 'Status' }, { value: 'health', label: 'Health' }, { value: 'space', label: 'Space' }, { value: 'environment', label: 'Environment' }, { value: 'policy', label: 'Machine policy' }, { value: 'version', label: 'Version' }, { value: 'none', label: 'None' }];

  const field = (label, id, opts, val) =>
    '<label class="fv-field"><span class="fv-field-label">' + label + '</span>' +
    '<select class="fv-select" id="' + id + '">' + optionList(opts, val) + '</select></label>';

  return '<div class="fv-toolbar"><div class="fv-toolbar-row">' +
    '<label class="fv-field fv-field--search"><span class="fv-field-label">Search</span>' +
      '<div class="fv-search-wrap">' + SVG.search +
      '<input class="fv-input" id="fv-search" placeholder="Search by name or version" value="' + escHtml(state.search) + '"></div></label>' +
    field('Space', 'fv-space', spaceOpts, state.fSpace) +
    field('Environment', 'fv-env', envOpts, state.fEnv) +
    field('Machine policy', 'fv-policy', polOpts, state.fPolicy) +
    (isK ? '' : field('Target type', 'fv-type', typeOpts, state.fType)) +
    field('Version', 'fv-version', verOpts, state.fVersion) +
    field('Status', 'fv-status', statusOpts, state.fStatus) +
    field('Health', 'fv-health', healthOpts, state.fHealth) +
    field('Group by', 'fv-group', groupOpts, state.groupBy) +
  '</div></div>';
}

function rowHtml(r) {
  let upgrade = '';
  if (r.isSuggested) {
    if (state.isMock) {
      upgrade = '<button class="fv-upgrade-btn" data-action="upgrade" data-id="' + escHtml(r.id) + '">' + SVG.up + ' Upgrade now</button>';
    } else {
      upgrade = '<a class="fv-upgrade-btn" href="' + escHtml(machineUrl(r)) + '" target="_blank" rel="noopener">' + SVG.up + ' Upgrade now</a>';
    }
  }
  const more = r.moreLabel ? '<span class="fv-more">' + escHtml(r.moreLabel) + '</span>' : '';
  return '<div class="fv-grid fv-row" style="background:' + r.rowTint + '">' +
    '<div class="fv-cell"><div class="fv-row-name">' + escHtml(r.name) + '</div><div class="fv-row-comm">' + escHtml(r.comm) + '</div></div>' +
    '<div class="fv-version-cell"><span class="fv-version">' + escHtml(r.version) + '</span>' + upgrade + '</div>' +
    '<div class="fv-cell fv-space-cell"><span class="fv-space-chip">' + SVG.space + '<span>' + escHtml(r.space) + '</span></span></div>' +
    '<div class="fv-cell fv-policy-cell"><span class="fv-policy">' + escHtml(r.policy) + '</span><span style="' + r.modeStyle + '">' + escHtml(r.mode) + '</span></div>' +
    '<div class="fv-cell"><span style="' + r.envStyle + '">' + escHtml(r.env) + '</span></div>' +
    '<div class="fv-cell" style="display:flex;align-items:center;gap:8px;"><span class="fv-tag">' + SVG.tag + '<span>' + escHtml(r.targetTag) + '</span></span>' + more + '</div>' +
    '<div class="fv-tenant" style="color:' + r.tenantColor + '">' + escHtml(r.tenant) + '</div>' +
    '<div class="fv-tts" style="color:' + r.ttsColor + '">' + escHtml(r.tenantTagSet) + '</div>' +
  '</div>';
}

function groupsHtml() {
  const rows = filterRows();
  const groups = groupRows(rows);
  if (!rows.length) return '<div class="fv-empty-rows">No targets match the current filters.</div>';
  return groups.map(g =>
    '<div><div class="fv-group-head"><span class="fv-group-dot" style="background:' + g.dot + '"></span>' +
    '<span class="fv-group-label">' + escHtml(g.label) + '</span><span class="fv-group-count">' + g.count + '</span></div>' +
    g.rows.map(rowHtml).join('') + '</div>'
  ).join('');
}

function tableCardHtml(m) {
  const isK = state.tab === 'k8s';
  const versionLabel = isK ? 'Agent version' : 'Tentacle version';
  const heading = isK ? 'Kubernetes agents' : 'Deployment targets';
  const resultCount = state._filtered.length;
  const colhead = '<div class="fv-grid fv-colhead"><div>Deployment target</div><div>' + versionLabel + '</div><div>Space</div><div>Machine policy</div><div>Environment</div><div>Target tag</div><div>Tenant</div><div>Tenant tag set</div></div>';
  return '<div class="fv-card">' + toolbarHtml() +
    '<div class="fv-table-head"><div class="fv-table-head-left"><span class="fv-table-title">' + heading + '</span>' +
      '<span class="fv-result-pill" id="fv-count">' + resultCount + '</span></div>' +
      '<div style="display:flex;align-items:center;gap:14px;"><span class="fv-result-note" id="fv-note">' + resultCount + ' of ' + m.total + ' shown · sorted by version, oldest first</span>' +
      '<button class="fv-export" id="fv-export">Export CSV</button></div></div>' +
    '<div class="fv-table-scroll"><div class="fv-table-inner">' + colhead +
      '<div id="fv-groups">' + groupsHtml() + '</div>' +
    '</div></div></div>';
}

function renderApp() {
  let body = '';
  if (state.view === 'ready') {
    const m = computeMetrics();
    body = kpisHtml(m) + distHtml(m) + tableCardHtml(m);
  } else {
    body = panelHtml();
  }
  app().innerHTML = '<div class="fv-wrap">' + headerHtml() + body + '</div>';
  wireEvents();
}

/* Re-render only the table body region on filter/group/search changes. */
function renderTableOnly() {
  const g = document.getElementById('fv-groups');
  if (!g) return;
  g.innerHTML = groupsHtml();
  const count = state._filtered.length;
  const total = activeTargets().length;
  const cEl = document.getElementById('fv-count'); if (cEl) cEl.textContent = count;
  const nEl = document.getElementById('fv-note'); if (nEl) nEl.textContent = count + ' of ' + total + ' shown · sorted by version, oldest first';
}

/* ─── Events ─────────────────────────────────────────────────── */
function wireEvents() {
  document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => {
    const tab = b.getAttribute('data-tab');
    if (tab === state.tab) return;
    state.tab = tab; resetFilters(); state.groupBy = 'health';
    renderApp();
  }));

  const retry = document.getElementById('fv-retry');
  if (retry) retry.addEventListener('click', () => { if (state.isMock) startMock(); else bootReal(); });

  if (state.view !== 'ready') return;

  const search = document.getElementById('fv-search');
  if (search) search.addEventListener('input', e => { state.search = e.target.value; renderTableOnly(); });

  const bind = (id, key) => { const el = document.getElementById(id); if (el) el.addEventListener('change', e => { state[key] = e.target.value; renderTableOnly(); }); };
  bind('fv-space', 'fSpace'); bind('fv-env', 'fEnv'); bind('fv-policy', 'fPolicy'); bind('fv-version', 'fVersion');
  bind('fv-status', 'fStatus'); bind('fv-health', 'fHealth'); bind('fv-type', 'fType');
  const grp = document.getElementById('fv-group');
  if (grp) grp.addEventListener('change', e => { state.groupBy = e.target.value; renderTableOnly(); });

  const exp = document.getElementById('fv-export');
  if (exp) exp.addEventListener('click', exportCsv);

  // Mock-mode upgrade animation (real mode uses an <a> link-out, no JS).
  document.querySelectorAll('[data-action="upgrade"]').forEach(btn => btn.addEventListener('click', () => {
    const id = btn.getAttribute('data-id');
    const r = activeTargets().find(x => x.id === id);
    if (!r) return;
    r.version = r._latest; r.statusKey = 'uptodate'; decorate(r, r._latest);
    renderApp();
  }));
}

/* ─── CSV export ─────────────────────────────────────────────── */
function exportCsv() {
  const rows = state._filtered || [];
  const cell = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const head = ['Deployment target', 'Version', 'Space', 'Environment', 'Machine policy', 'Update mode', 'Last seen', 'Health', 'Status', 'Target tag', 'Tenant', 'Tenant tag set'];
  const lines = [head.map(cell).join(',')];
  rows.forEach(r => lines.push([r.name, r.version, r.space, r.env, r.policy, r.mode, r.lastSeen, r.health, r.statusLabel, r.targetTag + (r.moreTags ? ' (+' + r.moreTags + ')' : ''), r.tenant, r.tenantTagSet].map(cell).join(',')));
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'target-agent-versions.csv';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

/* ─── Boot ───────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  if (typeof dashboardGetConfig === 'undefined' || typeof chrome === 'undefined') { startMock(); return; }
  dashboardGetConfig(cfg => {
    if (!cfg || !cfg.lastServerUrl) { startMock(); return; }
    state.serverUrl = cfg.lastServerUrl;
    bootReal();
  });
});
