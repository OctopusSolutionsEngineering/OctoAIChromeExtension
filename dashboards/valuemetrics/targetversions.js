/* ==========================================================================
   Target agent versions

   Powers the "Target Agent Versions" tab. Instance-wide, read-only view of the
   deployment-target estate across ALL spaces: Tentacle / Kubernetes agent
   versions, upgrade status, health, environment, machine policy and the space
   each target lives in.

   Ported from the standalone community dashboard (dashboards/targetagentversions)
   and adapted to run inside the Value Metrics SPA:
     - data now flows through the shared OctopusApi / DashboardData layer
       instead of the dashboard's own credentialed fetch + chrome config;
     - the UI renders into the router's #main-content via render()/wire(),
       exposed as the TargetVersionsView module (mirrors ComplianceView).

   SECURITY / SCOPE NOTES (see also the repo dashboard rules):
    - This view makes ONLY read (GET) requests to the Octopus API.
    - The "Upgrade now" action is NON-mutating: in mock mode it animates the
      row locally; against a real server it LINKS OUT to the deployment target's
      page in Octopus — it never POSTs an upgrade.
    - All API-derived strings are HTML-escaped before rendering.

   UNVERIFIED-AGAINST-LIVE flags (confirm before sharing widely):
    - policyMode(): the exact machine-policy field for the Tentacle/K8s update
      setting (Auto vs Manual) is inferred; verify field names on a live API.
    - Kubernetes agent CommunicationStyle assumed to be "KubernetesTentacle".
   ========================================================================== */

const TargetVersionsView = (() => {

  /* ─── Small helpers ──────────────────────────────────────────── */
  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  // Compare dotted version strings numerically, segment by segment. Returns <0 if
  // a<b, >0 if a>b, 0 if equal. Numeric segments compare as numbers (so 10.0.20348
  // correctly sorts above 10.0.9999 — a fixed-width pad got this wrong for 5+ digit
  // build numbers); non-numeric segments fall back to lexical compare.
  function cmpVer(a, b) {
    const pa = String(a || '').split('.'), pb = String(b || '').split('.');
    const n = Math.max(pa.length, pb.length);
    for (let i = 0; i < n; i++) {
      const x = pa[i] || '0', y = pb[i] || '0';
      const numeric = /^\d+$/.test(x) && /^\d+$/.test(y);
      const c = numeric ? (parseInt(x, 10) - parseInt(y, 10)) : x.localeCompare(y);
      if (c) return c;
    }
    return 0;
  }

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

  /* Version-band colouring for the distribution bar (Tentacle tab).
   * Coloured by Tentacle MAJOR version, not upgrade status:
   *   0.0.0 / unknown -> grey, major <=4 -> red, major 5-6 -> yellow, major >=7 -> green. */
  const BAND = {
    unknown: { color: '#6b7d8f', label: 'Unknown (0.0.0)' },
    red:     { color: '#D63D3D', label: 'Version 4 and below' },
    yellow:  { color: '#E5B203', label: 'Version 5–6' },
    green:   { color: '#00874D', label: 'Version 7 and above' }
  };
  const BAND_ORDER = ['unknown', 'red', 'yellow', 'green'];
  function versionBand(v) {
    if (!v || v === '—' || v === '0.0.0') return 'unknown';
    const major = parseInt(String(v).split('.')[0], 10);
    if (isNaN(major)) return 'unknown';
    if (major <= 4) return 'red';
    if (major <= 6) return 'yellow';
    return 'green';
  }

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
    r.osVersion = osVer(r.osFull || '');   // numeric OS version pulled from the full string
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
      { v: '8.5.1', n: 64, st: 'uptodate' }, { v: '8.4.2', n: 22, st: 'suggested' },
      { v: '8.4.0', n: 14, st: 'suggested' }, { v: '8.3.1', n: 9, st: 'suggested' },
      { v: '8.2.4', n: 9, st: 'suggested' }, { v: '8.1.0', n: 5, st: 'suggested' },
      { v: '7.4.3', n: 5, st: 'suggested' },
      { v: '6.3.417', n: 8, st: 'suggested' }, { v: '4.0.0', n: 4, st: 'suggested' },
      { v: '0.0.0', n: 2, st: 'suggested' }
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
        const win = i % 5 < 2;
        out.push(decorate({
          id: name, name, version: p.v, statusKey: p.st,
          space: MOCK_SPACES[i % MOCK_SPACES.length], spaceId: null,
          env: env.name, envCat: env.cat, policy: pol.name, mode: pol.mode,
          health, lastSeen: 'just now', comm: comm[i % 2],
          idKey: (i % 19 === 0) ? 'shared-tentacle' : 'tp-' + i,
          os: win ? 'Windows' : 'Linux', osFull: win ? 'Microsoft Windows NT 10.0.20348.0' : 'Unix 5.15.0.1079',
          arch: (i % 4 === 0) ? 'arm64' : 'x64',
          shellName: win ? 'PowerShell' : 'bash', shellVersion: win ? '5.1.20348.2700' : '5.1.16',
          container: (i % 6 === 0), certAlg: (i % 11 === 0) ? 'sha1RSA' : 'sha256RSA',
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
          idKey: (i === 0 || i === 7) ? 'shared-agent' : 'k-' + i,
          os: 'Linux', osFull: 'Unix 5.15.0.1079',
          arch: (i % 3 === 0) ? 'arm64' : 'x64',
          shellName: 'bash', shellVersion: '5.1.16',
          container: true, certAlg: 'sha256RSA',
          targetTag: tagPool[i % tagPool.length], moreTags: (i % 3 === 0) ? 1 : 0,
          tenant, tenantTagSet: tenant === 'No tenants' ? 'No tenant tags' : 'Region / EU'
        }, LATEST_K_MOCK));
        i++;
      }
    }
    return out;
  }

  // Agentless targets for mock mode: Azure / SSH / cloud regions / offline drops.
  function makeMockOthers() {
    const envs = [{ name: 'Production', cat: 'production' }, { name: 'Staging', cat: 'staging' }, { name: 'Development', cat: 'dev' }];
    const policies = [{ name: 'Default Machine Policy', mode: 'Auto' }, { name: 'Cloud Auto', mode: 'Auto' }];
    const plan = [
      { type: 'Azure Web App', n: 14, pfx: 'azwebapp' }, { type: 'SSH', n: 10, pfx: 'ssh' },
      { type: 'Cloud region', n: 6, pfx: 'region' }, { type: 'Azure Service Fabric', n: 4, pfx: 'sf' },
      { type: 'Offline package drop', n: 3, pfx: 'offline' }, { type: 'Kubernetes cluster (API)', n: 5, pfx: 'k8sapi' }
    ];
    const spaces = ['Default', 'Platform Engineering', 'Payments', 'Data Platform'];
    const tagPool = ['paas', 'linux-host', 'web-tier', 'edge', 'batch'];
    const tenants = ['No tenants', 'No tenants', 'No tenants', 'Acme Corp', 'Globex'];
    const out = []; let i = 0;
    for (const p of plan) {
      for (let k = 0; k < p.n; k++) {
        const env = envs[i % envs.length];
        const pol = policies[(i + k) % policies.length];
        const h = i % 8;
        const health = h === 0 ? 'Unhealthy' : h === 4 ? 'Unavailable' : (h === 1 ? 'Healthy with warnings' : 'Healthy');
        const envshort = env.cat === 'production' ? 'prod' : env.cat === 'staging' ? 'stg' : 'dev';
        const name = p.pfx + '-' + envshort + '-' + String(i + 1).padStart(2, '0');
        const tenant = tenants[i % tenants.length];
        out.push(decorate({
          id: name, name, version: '—', statusKey: 'uptodate',
          space: spaces[i % spaces.length], spaceId: null,
          env: env.name, envCat: env.cat, policy: pol.name, mode: pol.mode,
          health, lastSeen: 'just now', comm: '', type: p.type,
          os: p.type === 'SSH' ? 'Linux' : 'Unknown', osFull: p.type === 'SSH' ? 'Unix 6.1.0' : '',
          arch: p.type === 'SSH' ? 'x64' : '',
          shellName: p.type === 'SSH' ? 'bash' : '', shellVersion: p.type === 'SSH' ? '5.2.15' : '',
          container: null, certAlg: '',
          targetTag: tagPool[i % tagPool.length], moreTags: (i % 4 === 0) ? 1 : 0,
          tenant, tenantTagSet: tenant === 'No tenants' ? 'No tenant tags' : 'Region / EU'
        }, ''));
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
    tentacles: [], k8s: [], others: [],
    latestT: LATEST_T_MOCK, latestK: LATEST_K_MOCK,
    search: '', fSpace: 'all', fEnv: 'all', fPolicy: 'all', fVersion: 'all', fStatus: 'all', fHealth: 'all', fType: 'all', fKind: 'all', fOs: 'all', fArch: 'all', fCross: 'all',
    groupBy: 'health',
    page: 1,
    _filtered: []
  };
  let _loaded = false;   // true once a real/mock load has populated state

  function isOther() { return state.tab === 'others'; }
  function activeTargets() {
    if (state.tab === 'k8s') return state.k8s;
    if (state.tab === 'others') return state.others;
    return state.tentacles;
  }
  function activeLatest() { return state.tab === 'k8s' ? state.latestK : state.tab === 'others' ? '' : state.latestT; }
  function resetFilters() { Object.assign(state, { search: '', fSpace: 'all', fEnv: 'all', fPolicy: 'all', fVersion: 'all', fStatus: 'all', fHealth: 'all', fType: 'all', fKind: 'all', fOs: 'all', fArch: 'all', fCross: 'all', page: 1 }); }

  /* ─── Real Octopus API (instance-wide) ───────────────────────── */
  // Thin wrapper over the shared OctopusApi.get that preserves the auth/error
  // shape the original loader expects (e.auth on 401/403, e.code for display).
  async function fetchJson(path) {
    try {
      return await OctopusApi.get(path);
    } catch (e) {
      const status = e && (e.status || e.statusCode || (e.response && e.response.status));
      if (status === 401 || status === 403) { const err = new Error('auth'); err.auth = true; throw err; }
      const err = new Error((e && e.message) || 'error');
      err.code = status ? (status + ' ' + ((e && e.statusText) || '')).trim() : ((e && e.message) || 'Unknown error');
      throw err;
    }
  }

  function commLabel(style) {
    if (style === 'TentacleActive') return 'Polling Tentacle';
    if (style === 'TentaclePassive') return 'Listening Tentacle';
    if (style === 'KubernetesTentacle') return 'Kubernetes Agent';
    return style || '';
  }

  // Friendly label for the target's type. Agent targets keep their Tentacle/agent
  // names; agentless targets (Azure, SSH, cloud regions, offline drops, dynamic
  // step-package targets) get a readable label derived from CommunicationStyle.
  const TYPE_LABELS = {
    TentaclePassive: 'Listening Tentacle', TentacleActive: 'Polling Tentacle',
    KubernetesTentacle: 'Kubernetes agent', Kubernetes: 'Kubernetes cluster (API)',
    AzureWebApp: 'Azure Web App', AzureCloudService: 'Azure Cloud Service',
    AzureServiceFabricCluster: 'Azure Service Fabric', Ssh: 'SSH',
    OfflineDrop: 'Offline package drop', Ftp: 'FTP', None: 'Cloud region'
  };
  function prettifyTypeId(id) {
    return String(id || '').replace(/-target$/i, '').replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase()).trim();
  }
  function targetTypeLabel(ep) {
    const cs = (ep && ep.CommunicationStyle) || '';
    if (TYPE_LABELS[cs]) return TYPE_LABELS[cs];
    if (cs === 'StepPackage') {
      const id = ep.DeploymentTargetTypeId || ep.StepPackageId || '';
      return id ? prettifyTypeId(id) : 'Step package target';
    }
    return cs || 'Unknown';
  }

  // Operating system. Octopus stores the OS string the agent reports at health
  // check on machine.OperatingSystem (the /machines?operatingSystemNames filter
  // and /machines/operatingsystem/names/all endpoint are backed by it). ShellName
  // (Bash / PowerShell / Cmd) is a secondary signal when OS isn't populated.
  // FLAG: confirm field names against a live instance if OS shows "Unknown".
  function rawOs(m) {
    const cands = [m && m.OperatingSystem, m && m.OperatingSystemName, ((m && m.Endpoint) || {}).OperatingSystem];
    for (const v of cands) if (typeof v === 'string' && v.trim() && !/^unknown$/i.test(v.trim())) return v.trim();
    return '';
  }
  function osShort(raw, shell) {
    const s = String(raw || '').toLowerCase();
    if (/windows|microsoft/.test(s)) return 'Windows';
    if (/darwin|mac ?os|osx/.test(s)) return 'macOS';
    if (/linux|unix|ubuntu|debian|cent ?os|rhel|red ?hat|alpine|suse|fedora|amazon|nixos/.test(s)) return 'Linux';
    if (raw && raw.trim()) return raw.trim();              // unrecognised but present — show it verbatim
    const sh = String(shell || '').toLowerCase();           // fall back to the shell family
    if (/bash|^sh$|zsh|ksh/.test(sh)) return 'Linux';
    if (/cmd|powershell|pwsh/.test(sh)) return 'Windows';
    return 'Unknown';
  }
  const OS_COLORS = { Windows: '#87BFEC', Linux: '#5ECD9E', macOS: '#C9B6E4' };
  function osColor(label) { return OS_COLORS[label] || '#6b7d8f'; }
  // The numeric version from the OS string. On Windows this is the build
  // (10.0.20348 = Server 2022); on Linux it's the kernel version, not the distro.
  function osVer(raw) { const m = String(raw || '').match(/(\d+(?:\.\d+){1,3})/); return m ? m[1] : ''; }

  // CPU architecture, normalised to x64 / x86 / arm64 / arm. FLAG: the exact
  // field is inferred — verify against a live machine if Architecture shows blank.
  function normArch(a) {
    const s = String(a).toLowerCase();
    if (/arm64|aarch64/.test(s)) return 'arm64';
    if (/amd64|x86[_-]?64|x64/.test(s)) return 'x64';
    if (/i[3-6]86|x86|win32|32-?bit/.test(s)) return 'x86';
    if (/arm/.test(s)) return 'arm';
    return String(a).trim();
  }
  function extractArch(m, ep) {
    const tvd = ep.TentacleVersionDetails || {};
    const cands = [m.Architecture, ep.Architecture, tvd.Architecture, m.OperatingSystemArchitecture];
    for (const v of cands) if (typeof v === 'string' && v.trim()) return normArch(v);
    return '';
  }
  // Whether the agent runs inside a container (true/false, or null if not reported).
  function extractContainer(m, ep) {
    const tvd = ep.TentacleVersionDetails || {};
    const cands = [tvd.IsRunningInContainer, m.IsRunningInContainer, ep.IsRunningInContainer];
    for (const v of cands) if (typeof v === 'boolean') return v;
    return null;
  }
  function healthLabel(api) {
    if (api === 'Healthy') return 'Healthy';
    if (api === 'HealthyWithWarnings') return 'Healthy with warnings';
    if (api === 'Unhealthy') return 'Unhealthy';
    if (api === 'Unavailable') return 'Unavailable';
    return 'Unavailable'; // Unknown / null
  }
  // Classification is kept consistent with the dashboard-wide guessEnvClass
  // (views.js) / _guessEnvClass (data.js): pre-prod & non-prod are NOT production,
  // and qa classifies as dev (their catch-all) — otherwise the same environment
  // would be coloured/grouped differently here than on the rest of the dashboard.
  // 'other' is this tab's extra bucket for names none of the rules match.
  function envCat(name) {
    const n = (name || '').toLowerCase();
    if (/prod/.test(n) && !/pre-?prod|non-?prod/.test(n)) return 'production';
    if (/stag|pre-?prod|uat|test/.test(n)) return 'staging';
    if (/dev|internal|sandbox|local|qa/.test(n)) return 'dev';
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

  function looksLikeVersion(s) { return typeof s === 'string' && /^\d+\.\d+/.test(s); }

  // Pull the version from a machine endpoint. Tentacles report it under
  // TentacleVersionDetails.Version; the Kubernetes agent reports its Helm-chart
  // version elsewhere, so we try known-shaped candidates and then scan any
  // "*version*" key for a version-like value.
  // FLAG: confirm the real K8s agent version field against a live instance.
  function extractVersion(ep) {
    if (!ep) return '—';
    if (ep.TentacleVersionDetails && ep.TentacleVersionDetails.Version) return ep.TentacleVersionDetails.Version;
    const kad = ep.KubernetesAgentDetails || {};
    const candidates = [
      kad.AgentVersion, kad.Version, kad.HelmChartVersion, kad.AgentTentacleVersion,
      ep.AgentVersion, ep.HelmChartVersion, ep.Version
    ].filter(looksLikeVersion);
    if (candidates.length) return candidates[0];
    for (const k in ep) { if (/version/i.test(k) && looksLikeVersion(ep[k])) return ep[k]; }
    for (const k in ep) {
      const o = ep[k];
      if (o && typeof o === 'object') { for (const j in o) { if (/version/i.test(j) && looksLikeVersion(o[j])) return o[j]; } }
    }
    return '—';
  }
  // Flag agents whose identity (thumbprint/URI) appears in more than one space.
  // `lists` is an array of plain-row arrays (tentacles, k8s, agentless) — a
  // thumbprint is matched across ALL target types, not just within one tab.
  function annotateCrossSpace(lists) {
    const all = [].concat(...lists);
    const spacesByKey = {};
    all.forEach(r => {
      if (!r.idKey) return;
      (spacesByKey[r.idKey] = spacesByKey[r.idKey] || new Set()).add(r.space);
    });
    all.forEach(r => {
      const set = r.idKey ? spacesByKey[r.idKey] : null;
      if (set && set.size > 1) {
        r.multiSpace = true;
        r.spaceCountForId = set.size;
        r.otherSpaces = [...set].filter(s => s !== r.space);
      } else {
        r.multiSpace = false; r.spaceCountForId = 1; r.otherSpaces = [];
      }
    });
  }

  function deriveLatest(rows) {
    const up = rows.filter(r => r.statusKey === 'uptodate' && r.version && r.version !== '—').map(r => r.version);
    const pool = up.length ? up : rows.map(r => r.version).filter(v => v && v !== '—');
    let best = '';
    pool.forEach(v => { if (!best || cmpVer(v, best) > 0) best = v; });
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
    const osFull = rawOs(m);
    return {
      id: m.Id, name: m.Name || m.Id,
      // Cross-space identity: the same physical agent registered in multiple
      // spaces shares a certificate thumbprint (or endpoint URI for URI-based ones).
      idKey: ep.Thumbprint || ep.Uri || ep.Host || '',
      space: ctx.spaceName, spaceId: ctx.spaceId,
      version: extractVersion(ep),
      os: osShort(osFull, m.ShellName), osFull,
      arch: extractArch(m, ep),
      shellName: m.ShellName || '', shellVersion: m.ShellVersion || '',
      container: extractContainer(m, ep),
      certAlg: ep.CertificateSignatureAlgorithm || m.CertificateSignatureAlgorithm || '',
      statusKey: statusFromEndpoint(tvd),
      env: envName, envCat: envCat(envName),
      policy: (pol && pol.Name) || '—', mode: policyMode(pol, ctx.tab),
      health: healthLabel(m.HealthStatus),
      lastSeen: '—', // no confirmed per-target field; CSV only
      comm: commLabel(ep.CommunicationStyle),
      type: targetTypeLabel(ep),
      targetTag: roles[0] || '—', moreTags: Math.max(0, roles.length - 1),
      tenant, tenantTagSet: tts
    };
  }

  const TENTACLE_STYLES = ['TentacleActive', 'TentaclePassive'];
  const K8S_STYLES = ['KubernetesTentacle'];

  async function loadInstance(spaces) {
    state.view = 'loading'; renderApp();
    const tAll = [], kAll = [], oAll = [];
    let anyAuth = false;

    const results = await Promise.all(spaces.map(async sp => {
      try {
        // Only `machines` is essential — if it fails the space has no data and is
        // correctly dropped (outer catch). The env/policy/tenant lookups are just
        // Id→Name maps, so guard them: a failed lookup degrades to Id-fallback
        // names rather than discarding the whole space's targets.
        const [envs, policies, tenants, machines] = await Promise.all([
          fetchJson('/api/' + sp.Id + '/environments/all').catch(() => []),
          fetchJson('/api/' + sp.Id + '/machinepolicies/all').catch(() => []),
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
      const oCtx = { envMap, policyMap, tenantMap, tab: 'others', spaceId: sp.Id, spaceName: sp.Name };
      (machines || []).forEach(m => {
        const cs = (m.Endpoint || {}).CommunicationStyle;
        if (TENTACLE_STYLES.includes(cs)) tAll.push(machineToPlain(m, tCtx));
        else if (K8S_STYLES.includes(cs)) kAll.push(machineToPlain(m, kCtx));
        else oAll.push(machineToPlain(m, oCtx)); // agentless: Azure, SSH, cloud regions, offline drops, …
      });
    });

    annotateCrossSpace([tAll, kAll, oAll]);
    state.latestT = deriveLatest(tAll);
    state.latestK = deriveLatest(kAll);
    state.tentacles = tAll.map(r => decorate(r, state.latestT));
    state.k8s = kAll.map(r => decorate(r, state.latestK));
    state.others = oAll.map(r => decorate(r, ''));
    state.view = (state.tentacles.length === 0 && state.k8s.length === 0 && state.others.length === 0) ? 'empty' : 'ready';
    if (state.view === 'ready') _loaded = true;
    renderApp();
  }

  async function bootReal(attempt = 0) {
    state.isMock = false;
    state.view = 'loading'; renderApp();
    // Reuse the spaces the dashboard already loaded rather than re-listing.
    const allSpaceData = (typeof DashboardData !== 'undefined' && DashboardData.getAllSpaceData) ? DashboardData.getAllSpaceData() : {};
    const spaces = Object.values(allSpaceData).map(sd => sd && sd.space).filter(s => s && s.Id);
    if (!spaces.length) {
      // A global Refresh clears DashboardData's per-space map and repopulates it
      // asynchronously; landing in that window must NOT commit to the terminal
      // "empty" view (which has no retry control). Poll briefly first — matches
      // ComplianceData's deferral (~12s of 300ms retries) — then give up.
      const MAX_BOOT_RETRIES = 40;
      if (attempt < MAX_BOOT_RETRIES) { setTimeout(() => bootReal(attempt + 1), 300); return; }
      state.view = 'empty'; renderApp(); return;
    }
    await loadInstance(spaces);
  }

  function startMock() {
    state.isMock = true;
    state.tentacles = makeMockTentacles();
    state.k8s = makeMockK8s();
    state.others = makeMockOthers();
    annotateCrossSpace([state.tentacles, state.k8s, state.others]);
    state.latestT = LATEST_T_MOCK;
    state.latestK = LATEST_K_MOCK;
    state.view = 'ready';
    _loaded = true;
    renderApp();
  }

  /* ─── Compute (KPIs, distribution) ───────────────────────────── */
  // Palette for the agentless "by type" distribution bar / legend.
  const TYPE_PALETTE = ['#1A77CA', '#5ECD9E', '#E5B203', '#A36BD4', '#3AAFA9', '#D6743D', '#87BFEC', '#FF9F9F', '#6b7d8f'];

  function computeMetrics() {
    const t = activeTargets(), latest = activeLatest();
    const total = t.length;
    const att = t.filter(r => r.health === 'Unhealthy' || r.health === 'Unavailable').length;
    const spaceCount = new Set(t.map(r => r.space)).size;

    // Agentless tab: there is no version/upgrade status, so metrics are
    // count / health / target-type based and the bar is split by type.
    if (isOther()) {
      const healthy = t.filter(r => r.health === 'Healthy').length;
      const hpct = total ? Math.round(healthy / total * 100) : 0;
      const tmap = {};
      t.forEach(r => { tmap[r.type] = (tmap[r.type] || 0) + 1; });
      const types = Object.keys(tmap).sort((a, b) => tmap[b] - tmap[a] || a.localeCompare(b));
      const segs = types.map((ty, i) => ({ v: ty, count: tmap[ty], color: TYPE_PALETTE[i % TYPE_PALETTE.length] }));
      return { byType: true, total, healthy, hpct, att, spaceCount, typeCount: types.length, segs };
    }

    const up = t.filter(r => r.statusKey === 'uptodate').length;
    const sug = t.filter(r => r.statusKey === 'suggested').length;
    const pct = total ? Math.round(up / total * 100) : 0;

    const vmap = {};
    t.forEach(r => { if (!vmap[r.version]) vmap[r.version] = { v: r.version, count: 0, statusKey: r.statusKey }; vmap[r.version].count++; });
    let segs = Object.values(vmap).sort((a, b) => cmpVer(b.v, a.v)); // newest first
    // Tentacle bar is coloured by version band; K8s bar keeps status colouring
    // (its v2.x versions don't map onto the 4/6/7 Tentacle thresholds).
    const legendMode = state.tab === 'k8s' ? 'status' : 'band';
    const present = {};
    segs = segs.map(s => {
      if (legendMode === 'band') {
        const band = versionBand(s.v);
        present[band] = true;
        return { v: s.v, count: s.count, color: BAND[band].color };
      }
      present[s.statusKey] = true;
      return { v: s.v, count: s.count, color: (STATUS[s.statusKey] || STATUS.uptodate).seg };
    });
    return { total, up, sug, att, pct, latest, segs, legendMode, present, spaceCount };
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
    if (state.fKind !== 'all') f = f.filter(r => r.type === state.fKind);
    if (state.fOs !== 'all') f = f.filter(r => r.os === state.fOs);
    if (state.fArch !== 'all') f = f.filter(r => r.arch === state.fArch);
    if (state.fCross === 'multi') f = f.filter(r => r.multiSpace);
    else if (state.fCross === 'single') f = f.filter(r => !r.multiSpace);
    if (isOther()) f.sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
    else f.sort((a, b) => cmpVer(a.version, b.version) || a.name.localeCompare(b.name));
    state._filtered = f;
    return f;
  }

  function groupRows(rows) {
    const gb = state.groupBy;
    if (gb === 'none') return [{ key: 'all', label: 'All deployment targets', dot: '#1A77CA', count: rows.length, rows }];
    // Group-header label/dot come from the canonical STATUS/HEALTH maps so they
    // never drift from the badges, distribution bar and legend (which also read
    // those maps). HEALTH keys are already the human label, so label falls back
    // to the key for that grouping.
    let keyf, defs = null, order = null;
    if (gb === 'status') {
      keyf = r => r.statusKey;
      defs = STATUS;
      order = ['required', 'suggested', 'uptodate'];
    } else if (gb === 'health') {
      keyf = r => r.health;
      defs = HEALTH;
      order = ['Unhealthy', 'Unavailable', 'Healthy with warnings', 'Healthy'];
    } else if (gb === 'space') { keyf = r => r.space; }
    else if (gb === 'environment') { keyf = r => r.env; }
    else if (gb === 'policy') { keyf = r => r.policy; }
    else if (gb === 'type') { keyf = r => r.type; }
    else if (gb === 'os') { keyf = r => r.os; }
    else if (gb === 'architecture') { keyf = r => r.arch || 'Unknown'; }
    else if (gb === 'version') { keyf = r => r.version; order = 'ver'; }
    const map = {};
    rows.forEach(r => { const k = keyf(r); (map[k] = map[k] || []).push(r); });
    let keys = Object.keys(map);
    if (order === 'ver') keys.sort((a, b) => cmpVer(b, a));
    else if (Array.isArray(order)) keys.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    else keys.sort();
    return keys.map(k => ({ key: k, label: (defs && defs[k] && defs[k].label) ? defs[k].label : k, dot: gb === 'os' ? osColor(k) : (defs && defs[k] ? defs[k].dot : '#1A77CA'), count: map[k].length, rows: map[k] }));
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

  // The Octopus web-portal route for a single deployment target is
  // /app#/{spaceId}/infrastructure/machines/{machineId}/settings — the bare
  // route (no /settings leaf) 404s in the portal.
  function machineUrl(r) {
    const base = String(state.serverUrl || '').replace(/\/$/, '');
    const sid = encodeURIComponent(r.spaceId || '');
    if (!r.id) return base + '/app#/' + sid + '/infrastructure/machines';
    return base + '/app#/' + sid + '/infrastructure/machines/' + encodeURIComponent(r.id) + '/settings';
  }

  // Has a working deep link? (real server data with a known target id)
  function hasLink(r) { return !state.isMock && !!state.serverUrl && !!r.id; }

  function headerHtml() {
    const isK = state.tab === 'k8s';
    const mock = state.isMock ? '<span class="fv-mockflag">Mock data</span>' : '';
    let subtitle = '';
    if (state.view === 'ready') {
      const total = activeTargets().length;
      const spaceCount = new Set(activeTargets().map(r => r.space)).size;
      const spaceLabel = spaceCount === 1 ? '1 space' : spaceCount + ' spaces';
      if (isOther()) {
        subtitle = '<div class="fv-subtitle">' + total + ' agentless deployment targets across ' + spaceLabel +
          ' <span class="sep">·</span> no agent to version <span class="sep">·</span> the whole instance</div>';
      } else {
        const noun = isK ? 'Kubernetes agents' : 'Tentacle deployment targets';
        subtitle = '<div class="fv-subtitle">' + total + ' ' + noun + ' across ' + spaceLabel +
          ' <span class="sep">·</span> latest available <span class="fv-mono">' + escHtml(activeLatest()) + '</span>' +
          ' <span class="sep">·</span> the whole instance</div>';
      }
    }
    const tabBtn = (key, label, count) =>
      '<button class="fv-tab ' + (state.tab === key ? 'fv-tab--active' : '') + '" data-tab="' + key + '">' +
      label + ' <span class="fv-tab-count">' + count + '</span></button>';
    return '<div class="fv-header">' +
      '<div class="fv-title-row"><h1 class="fv-title">Targets</h1>' + mock + '</div>' +
      '<div class="fv-tabs">' +
        tabBtn('tentacles', 'Tentacles', state.tentacles.length) +
        tabBtn('k8s', 'Kubernetes agents', state.k8s.length) +
        tabBtn('others', 'Agentless', state.others.length) +
      '</div>' + subtitle +
    '</div>';
  }

  function panelHtml() {
    const isK = state.tab === 'k8s';
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
      const noun = isOther() ? 'agentless deployment targets' : isK ? 'Kubernetes agent deployment targets' : 'Tentacle deployment targets';
      return '<div class="fv-panel"><div class="fv-panel-icon">' + SVG.empty + '</div>' +
        '<div class="fv-panel-title">No ' + noun + '</div>' +
        '<div class="fv-panel-text">This instance has no Tentacle, Kubernetes agent or other deployment targets yet. Add one to start tracking it.</div></div>';
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
    if (m.byType) {
      return '<div class="fv-kpis">' +
        '<div class="fv-kpi"><div class="fv-kpi-label">Deployment targets</div><div class="fv-kpi-value">' + m.total + '</div><div class="fv-kpi-sub">across ' + m.spaceCount + (m.spaceCount === 1 ? ' space' : ' spaces') + '</div></div>' +
        '<div class="fv-kpi fv-kpi--up"><div class="fv-kpi-label">Healthy</div><div class="fv-kpi-value">' + m.healthy + '</div><div class="fv-kpi-sub">' + m.hpct + '% of targets</div></div>' +
        '<div class="fv-kpi fv-kpi--att"><div class="fv-kpi-label">Needs attention</div><div class="fv-kpi-value">' + m.att + '</div><div class="fv-kpi-sub">unhealthy or unavailable</div></div>' +
        '<div class="fv-kpi"><div class="fv-kpi-label">Target types</div><div class="fv-kpi-value">' + m.typeCount + '</div><div class="fv-kpi-sub">distinct target types</div></div>' +
      '</div>';
    }
    return '<div class="fv-kpis">' +
      '<div class="fv-kpi"><div class="fv-kpi-label">' + (isK ? 'Kubernetes agents' : 'Deployment targets') + '</div><div class="fv-kpi-value">' + m.total + '</div><div class="fv-kpi-sub">across ' + m.spaceCount + (m.spaceCount === 1 ? ' space' : ' spaces') + '</div></div>' +
      '<div class="fv-kpi fv-kpi--up"><div class="fv-kpi-label">Up to date</div><div class="fv-kpi-value">' + m.up + '</div><div class="fv-kpi-sub">' + m.pct + '% on the latest version</div></div>' +
      '<div class="fv-kpi fv-kpi--sug"><div class="fv-kpi-label">Upgrade suggested</div><div class="fv-kpi-value">' + m.sug + '</div><div class="fv-kpi-sub">recommended to upgrade</div></div>' +
      '<div class="fv-kpi fv-kpi--att"><div class="fv-kpi-label">Needs attention</div><div class="fv-kpi-value">' + m.att + '</div><div class="fv-kpi-sub">unhealthy or unavailable</div></div>' +
    '</div>';
  }

  function distHtml(m) {
    const isK = state.tab === 'k8s';
    const heading = m.byType ? 'How the agentless estate spreads across target types'
      : isK ? 'How the estate spreads across Kubernetes agent versions'
      : 'How the estate spreads across Tentacle versions';
    const segs = m.segs.map(s => {
      const label = escHtml(s.v + ' · ' + s.count);
      const title = escHtml(s.v + ' — ' + s.count + ' targets');
      return '<div class="fv-dist-seg" title="' + title + '" style="flex:' + s.count + ' 1 0;background:' + s.color + ';"><span>' + label + '</span></div>';
    }).join('');
    let legend;
    if (m.byType) {
      legend = m.segs.map(s =>
        '<div class="fv-legend-item"><span class="fv-legend-dot" style="background:' + s.color + '"></span>' + escHtml(s.v) + '</div>'
      ).join('');
    } else if (m.legendMode === 'band') {
      legend = BAND_ORDER.filter(b => m.present[b]).map(b =>
        '<div class="fv-legend-item"><span class="fv-legend-dot" style="background:' + BAND[b].color + '"></span>' + BAND[b].label + '</div>'
      ).join('');
    } else {
      const legendDefs = [['uptodate', 'Up to date'], ['suggested', 'Upgrade suggested'], ['required', 'Upgrade required']];
      legend = legendDefs.filter(d => m.present[d[0]]).map(d =>
        '<div class="fv-legend-item"><span class="fv-legend-dot" style="background:' + STATUS[d[0]].seg + '"></span>' + d[1] + '</div>'
      ).join('');
    }
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
    const verOpts = [{ value: 'all', label: 'All versions' }, ...uniq(at.map(r => r.version)).sort((a, b) => cmpVer(b, a)).map(e => ({ value: e, label: e }))];
    const statusesPresent = uniq(at.map(r => r.statusKey));
    const statusOpts = [{ value: 'all', label: 'All statuses' }]
      .concat(statusesPresent.includes('required') ? [{ value: 'required', label: 'Upgrade required' }] : [])
      .concat([{ value: 'suggested', label: 'Upgrade suggested' }, { value: 'uptodate', label: 'Up to date' }]);
    const healthOpts = [{ value: 'all', label: 'All health' }, { value: 'Healthy', label: 'Healthy' }, { value: 'Healthy with warnings', label: 'Healthy with warnings' }, { value: 'Unhealthy', label: 'Unhealthy' }, { value: 'Unavailable', label: 'Unavailable' }];
    const typeOpts = [{ value: 'all', label: 'All target types' }, { value: 'Listening Tentacle', label: 'Listening Tentacle' }, { value: 'Polling Tentacle', label: 'Polling Tentacle' }];
    const kindOpts = [{ value: 'all', label: 'All target types' }, ...uniq(at.map(r => r.type)).sort().map(e => ({ value: e, label: e }))];
    // OS options: known families first (Windows/Linux/macOS), then any others, "Unknown" last.
    const osRank = { Windows: 0, Linux: 1, macOS: 2, Unknown: 9 };
    const osVals = uniq(at.map(r => r.os)).sort((a, b) => (osRank[a] ?? 5) - (osRank[b] ?? 5) || a.localeCompare(b));
    const osOpts = [{ value: 'all', label: 'All operating systems' }, ...osVals.map(e => ({ value: e, label: e }))];
    const archRank = { x64: 0, arm64: 1, arm: 2, x86: 3 };
    const archVals = uniq(at.map(r => r.arch).filter(Boolean)).sort((a, b) => (archRank[a] ?? 5) - (archRank[b] ?? 5) || a.localeCompare(b));
    const archOpts = [{ value: 'all', label: 'All architectures' }, ...archVals.map(e => ({ value: e, label: e }))];
    const crossOpts = [{ value: 'all', label: 'Any registration' }, { value: 'multi', label: 'In multiple spaces' }, { value: 'single', label: 'In one space only' }];
    const groupOpts = isOther()
      ? [{ value: 'type', label: 'Type' }, { value: 'os', label: 'Operating system' }, { value: 'architecture', label: 'Architecture' }, { value: 'health', label: 'Health' }, { value: 'space', label: 'Space' }, { value: 'environment', label: 'Environment' }, { value: 'policy', label: 'Machine policy' }, { value: 'none', label: 'None' }]
      : [{ value: 'status', label: 'Status' }, { value: 'health', label: 'Health' }, { value: 'os', label: 'Operating system' }, { value: 'architecture', label: 'Architecture' }, { value: 'space', label: 'Space' }, { value: 'environment', label: 'Environment' }, { value: 'policy', label: 'Machine policy' }, { value: 'version', label: 'Version' }, { value: 'none', label: 'None' }];

    const field = (label, id, opts, val) =>
      '<label class="fv-field"><span class="fv-field-label">' + label + '</span>' +
      '<select class="fv-select" id="' + id + '">' + optionList(opts, val) + '</select></label>';

    // Agentless tab: no version/upgrade status — filter by target Type instead.
    const versionStatusType = isOther()
      ? field('Type', 'fv-kind', kindOpts, state.fKind)
      : (isK ? '' : field('Target type', 'fv-type', typeOpts, state.fType)) +
        field('Version', 'fv-version', verOpts, state.fVersion) +
        field('Status', 'fv-status', statusOpts, state.fStatus);

    return '<div class="fv-toolbar"><div class="fv-toolbar-row">' +
      '<label class="fv-field fv-field--search"><span class="fv-field-label">Search</span>' +
        '<div class="fv-search-wrap">' + SVG.search +
        '<input class="fv-input" id="fv-search" placeholder="' + (isOther() ? 'Search by name' : 'Search by name or version') + '" value="' + escHtml(state.search) + '"></div></label>' +
      field('Space', 'fv-space', spaceOpts, state.fSpace) +
      field('Environment', 'fv-env', envOpts, state.fEnv) +
      field('Machine policy', 'fv-policy', polOpts, state.fPolicy) +
      versionStatusType +
      field('OS', 'fv-os', osOpts, state.fOs) +
      (archVals.length ? field('Architecture', 'fv-arch', archOpts, state.fArch) : '') +
      field('Health', 'fv-health', healthOpts, state.fHealth) +
      field('Registration', 'fv-cross', crossOpts, state.fCross) +
      field('Group by', 'fv-group', groupOpts, state.groupBy) +
    '</div></div>';
  }

  // Consolidated hover details for a row (native tooltip — newline-separated).
  function rowDetails(r) {
    const lines = [];
    if (r.osFull) lines.push('Operating system: ' + r.osFull);
    if (r.arch) lines.push('Architecture: ' + r.arch);
    const shell = [r.shellName, r.shellVersion].filter(Boolean).join(' ');
    if (shell) lines.push('Shell: ' + shell);
    if (r.container != null) lines.push('Running in container: ' + (r.container ? 'Yes' : 'No'));
    if (r.certAlg) lines.push('Certificate signature: ' + r.certAlg + (/sha1/i.test(r.certAlg) ? ' (legacy — consider rotating)' : ''));
    if (r.multiSpace && r.otherSpaces && r.otherSpaces.length) lines.push('Also registered in: ' + r.otherSpaces.join(', '));
    return lines.join('\n');
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
    const name = hasLink(r)
      ? '<a class="fv-row-name fv-row-name--link" href="' + escHtml(machineUrl(r)) + '" target="_blank" rel="noopener" title="Open ' + escHtml(r.name) + ' in Octopus">' + escHtml(r.name) + '</a>'
      : '<div class="fv-row-name">' + escHtml(r.name) + '</div>';
    // Agentless rows have no version/upgrade — the second column shows the type.
    const sub = isOther() ? '' : '<div class="fv-row-comm">' + escHtml(r.comm) + '</div>';
    const multi = r.multiSpace
      ? '<span class="fv-multi" title="Same agent also registered in: ' + escHtml((r.otherSpaces || []).join(', ')) + '">' + SVG.space + 'In ' + r.spaceCountForId + ' spaces</span>'
      : '';
    const valueCell = isOther()
      ? '<div class="fv-version-cell"><span class="fv-type-chip">' + escHtml(r.type) + '</span></div>'
      : '<div class="fv-version-cell"><span class="fv-version">' + escHtml(r.version) + '</span>' + upgrade + '</div>';
    // OS sub-line shows version and architecture together (e.g. "10.0.20348 · x64").
    const osSub = [r.osVersion, r.arch].filter(Boolean).join(' · ');
    const details = rowDetails(r);
    return '<div class="fv-grid fv-row"' + (details ? ' title="' + escHtml(details) + '"' : '') + ' style="background:' + r.rowTint + '">' +
      '<div class="fv-cell">' + name + sub + multi + '</div>' +
      valueCell +
      '<div class="fv-cell fv-space-cell"><span class="fv-space-chip">' + SVG.space + '<span>' + escHtml(r.space) + '</span></span></div>' +
      '<div class="fv-cell fv-policy-cell"><span class="fv-policy">' + escHtml(r.policy) + '</span><span style="' + r.modeStyle + '">' + escHtml(r.mode) + '</span></div>' +
      '<div class="fv-cell"><span style="' + r.envStyle + '">' + escHtml(r.env) + '</span></div>' +
      '<div class="fv-cell"><span class="fv-os"><span class="fv-os-dot" style="background:' + osColor(r.os) + '"></span>' + escHtml(r.os) + '</span>' + (osSub ? '<div class="fv-os-ver">' + escHtml(osSub) + '</div>' : '') + '</div>' +
      '<div class="fv-cell" style="display:flex;align-items:center;gap:8px;"><span class="fv-tag">' + SVG.tag + '<span>' + escHtml(r.targetTag) + '</span></span>' + more + '</div>' +
      '<div class="fv-tenant" style="color:' + r.tenantColor + '">' + escHtml(r.tenant) + '</div>' +
      '<div class="fv-tts" style="color:' + r.ttsColor + '">' + escHtml(r.tenantTagSet) + '</div>' +
    '</div>';
  }

  const PAGE_SIZE = 100;

  /* Page the full filtered+sorted list; group only the current page's rows so
   * group headers still render. CSV export uses the full set, not the page. */
  function paginate() {
    const filtered = filterRows();            // sets state._filtered (full filtered set)
    const total = filtered.length;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (state.page > pages) state.page = pages;
    if (state.page < 1) state.page = 1;
    const start = (state.page - 1) * PAGE_SIZE;
    const slice = filtered.slice(start, start + PAGE_SIZE);
    return { total, pages, start, slice, groups: groupRows(slice) };
  }

  function groupsBodyHtml(groups, total) {
    if (!total) return '<div class="fv-empty-rows">No targets match the current filters.</div>';
    return groups.map(g =>
      '<div><div class="fv-group-head"><span class="fv-group-dot" style="background:' + g.dot + '"></span>' +
      '<span class="fv-group-label">' + escHtml(g.label) + '</span><span class="fv-group-count">' + g.count + '</span></div>' +
      g.rows.map(rowHtml).join('') + '</div>'
    ).join('');
  }

  function rangeNote(p) {
    if (!p.total) return '0 of ' + activeTargets().length + ' shown';
    const sortNote = isOther() ? 'sorted by type, then name' : 'sorted by version, oldest first';
    return 'Showing ' + (p.start + 1) + '–' + (p.start + p.slice.length) + ' of ' + p.total + ' · ' + sortNote;
  }

  function pageWindow(cur, pages) {
    const s = new Set([1, pages, cur, cur - 1, cur + 1, cur - 2, cur + 2]);
    const list = [...s].filter(n => n >= 1 && n <= pages).sort((a, b) => a - b);
    const res = []; let prev = 0;
    list.forEach(n => { if (prev && n - prev > 1) res.push('…'); res.push(n); prev = n; });
    return res;
  }

  function pagerHtml(p) {
    if (p.total <= PAGE_SIZE) return '';
    const cur = state.page;
    const nums = pageWindow(cur, p.pages).map(n =>
      n === '…' ? '<span class="fv-page-ellipsis">…</span>'
        : '<button class="fv-page-btn' + (n === cur ? ' fv-page-btn--active' : '') + '" data-page="' + n + '">' + n + '</button>'
    ).join('');
    return '<div class="fv-pager">' +
      '<button class="fv-page-btn" data-page="' + (cur - 1) + '"' + (cur <= 1 ? ' disabled' : '') + '>‹ Prev</button>' +
      nums +
      '<button class="fv-page-btn" data-page="' + (cur + 1) + '"' + (cur >= p.pages ? ' disabled' : '') + '>Next ›</button>' +
    '</div>';
  }

  function tableCardHtml() {
    const isK = state.tab === 'k8s';
    const versionLabel = isOther() ? 'Type' : isK ? 'Agent version' : 'Tentacle version';
    const heading = isOther() ? 'Agentless targets' : isK ? 'Kubernetes agents' : 'Deployment targets';
    const p = paginate();
    const colhead = '<div class="fv-grid fv-colhead"><div>Deployment target</div><div>' + versionLabel + '</div><div>Space</div><div>Machine policy</div><div>Environment</div><div>OS / Arch</div><div>Target tag</div><div>Tenant</div><div>Tenant tag set</div></div>';
    return '<div class="fv-card">' + toolbarHtml() +
      '<div class="fv-table-head"><div class="fv-table-head-left"><span class="fv-table-title">' + heading + '</span>' +
        '<span class="fv-result-pill" id="fv-count">' + p.total + '</span></div>' +
        '<div style="display:flex;align-items:center;gap:14px;"><span class="fv-result-note" id="fv-note">' + rangeNote(p) + '</span>' +
        '<button class="fv-export" id="fv-export">Export CSV</button></div></div>' +
      '<div class="fv-table-scroll"><div class="fv-table-inner">' + colhead +
        '<div id="fv-groups">' + groupsBodyHtml(p.groups, p.total) + '</div>' +
      '</div></div>' +
      '<div id="fv-pager">' + pagerHtml(p) + '</div>' +
    '</div>';
  }

  function renderApp() {
    const root = app();
    if (!root) return; // view navigated away before an async load finished
    let body = '';
    if (state.view === 'ready') {
      const m = computeMetrics();
      body = kpisHtml(m) + distHtml(m) + tableCardHtml();
    } else {
      body = panelHtml();
    }
    root.innerHTML = '<div class="fv-wrap">' + headerHtml() + body + '</div>';
    wireEvents();
  }

  /* Re-render only the table body + pager on filter/group/search/page changes. */
  function renderTableRegion() {
    const p = paginate();
    const g = document.getElementById('fv-groups'); if (g) g.innerHTML = groupsBodyHtml(p.groups, p.total);
    const pg = document.getElementById('fv-pager'); if (pg) pg.innerHTML = pagerHtml(p);
    const cEl = document.getElementById('fv-count'); if (cEl) cEl.textContent = p.total;
    const nEl = document.getElementById('fv-note'); if (nEl) nEl.textContent = rangeNote(p);
    wirePager();
    wireUpgradeButtons(); // rows were just regenerated — re-bind their (mock) upgrade handlers
  }

  function setPage(n) { state.page = n; renderTableRegion(); }

  function wirePager() {
    document.querySelectorAll('#fv-pager [data-page]').forEach(b => {
      if (b.disabled) return;
      b.addEventListener('click', () => { const n = parseInt(b.getAttribute('data-page'), 10); if (!isNaN(n)) setPage(n); });
    });
  }

  // Mock-mode upgrade animation (real mode renders an <a> link-out, no JS). Lives
  // in its own helper because the table region is re-rendered (and these buttons
  // recreated) on every filter/group/search/page change, not just full render.
  function wireUpgradeButtons() {
    document.querySelectorAll('#fv-app [data-action="upgrade"]').forEach(btn => btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const r = activeTargets().find(x => x.id === id);
      if (!r) return;
      r.version = r._latest; r.statusKey = 'uptodate'; decorate(r, r._latest);
      renderApp();
    }));
  }

  /* ─── Events ─────────────────────────────────────────────────── */
  function wireEvents() {
    document.querySelectorAll('#fv-app [data-tab]').forEach(b => b.addEventListener('click', () => {
      const tab = b.getAttribute('data-tab');
      if (tab === state.tab) return;
      state.tab = tab; resetFilters();
      state.groupBy = (tab === 'others') ? 'type' : 'health';
      renderApp();
    }));

    const retry = document.getElementById('fv-retry');
    if (retry) retry.addEventListener('click', () => { if (state.isMock) startMock(); else bootReal(); });

    if (state.view !== 'ready') return;

    const search = document.getElementById('fv-search');
    if (search) search.addEventListener('input', e => { state.search = e.target.value; state.page = 1; renderTableRegion(); });

    const bind = (id, key) => { const el = document.getElementById(id); if (el) el.addEventListener('change', e => { state[key] = e.target.value; state.page = 1; renderTableRegion(); }); };
    bind('fv-space', 'fSpace'); bind('fv-env', 'fEnv'); bind('fv-policy', 'fPolicy'); bind('fv-version', 'fVersion');
    bind('fv-status', 'fStatus'); bind('fv-health', 'fHealth'); bind('fv-type', 'fType'); bind('fv-kind', 'fKind'); bind('fv-os', 'fOs'); bind('fv-arch', 'fArch'); bind('fv-cross', 'fCross');
    const grp = document.getElementById('fv-group');
    if (grp) grp.addEventListener('change', e => { state.groupBy = e.target.value; state.page = 1; renderTableRegion(); });

    const exp = document.getElementById('fv-export');
    if (exp) exp.addEventListener('click', exportCsv);

    wirePager();
    wireUpgradeButtons();
  }

  /* ─── CSV export ─────────────────────────────────────────────── */
  function exportCsv() {
    const rows = state._filtered || [];
    const cell = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const head = ['Deployment target', 'Type', 'Version', 'OS', 'Architecture', 'Shell', 'Container', 'Cert signature', 'Space', 'Also registered in', 'Environment', 'Machine policy', 'Update mode', 'Last seen', 'Health', 'Status', 'Target tag', 'Tenant', 'Tenant tag set'];
    const lines = [head.map(cell).join(',')];
    rows.forEach(r => lines.push([r.name, r.type, r.version, r.osFull || r.os, r.arch, [r.shellName, r.shellVersion].filter(Boolean).join(' '), r.container == null ? '' : (r.container ? 'Yes' : 'No'), r.certAlg, r.space, (r.otherSpaces || []).join('; '), r.env, r.policy, r.mode, r.lastSeen, r.health, r.statusLabel, r.targetTag + (r.moreTags ? ' (+' + r.moreTags + ')' : ''), r.tenant, r.tenantTagSet].map(cell).join(',')));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'octopus-targets.csv';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  /* ─── Boot / SPA integration ─────────────────────────────────── */
  function boot() {
    state.serverUrl = (typeof OctopusApi !== 'undefined' && OctopusApi.getInstanceUrl) ? OctopusApi.getInstanceUrl() : null;
    if (_loaded) { renderApp(); return; }        // already loaded — re-show cached estate
    if (state.serverUrl) bootReal();
    else startMock();
  }

  // render(): returns the container the router drops into #main-content.
  // wire(): kicks off the (cached) load and fills #fv-app.
  function render(summary) { return '<div id="fv-app"></div>'; }
  function wire(summary) { boot(); }

  // Called by the global Refresh button so the next visit refetches the estate.
  function reset() { _loaded = false; }

  return { render, wire, reset };

})();
