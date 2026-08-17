'use strict';
global.window = { location: { hash: '' } };
global.document = { getElementById: () => ({ innerHTML: '' }), addEventListener: () => {} };

describe('Infrastructure PreAlpha — data layer', () => {
  const data = require('./data');
  test('module loads and exports an object', () => {
    expect(typeof data).toBe('object');
  });
});

describe('fetchJson', () => {
  const data = require('./data');
  test('401 throws an error flagged auth', async () => {
    global.fetch = async () => ({ status: 401, ok: false, statusText: 'Unauthorized' });
    data.setServerUrl('https://x.octopus.app/');
    await expect(data.fetchJson('/api/spaces/all')).rejects.toMatchObject({ auth: true });
  });
  test('500 throws an error with code, not auth', async () => {
    global.fetch = async () => ({ status: 500, ok: false, statusText: 'Server Error' });
    data.setServerUrl('https://x.octopus.app/');
    await expect(data.fetchJson('/api/spaces/all')).rejects.toMatchObject({ code: '500 Server Error' });
  });
  test('200 returns parsed json', async () => {
    global.fetch = async () => ({ status: 200, ok: true, json: async () => [{ Id: 'Spaces-1' }] });
    data.setServerUrl('https://x.octopus.app/');
    await expect(data.fetchJson('/api/spaces/all')).resolves.toEqual([{ Id: 'Spaces-1' }]);
  });
});

// The retries wait between attempts. Run the timers through immediately so the suite
// doesn't sit out the real backoff.
describe('fetchJson backs off on 429', () => {
  const data = require('./data');
  let timeouts;
  beforeEach(() => {
    timeouts = [];
    jest.spyOn(global, 'setTimeout').mockImplementation((fn, delayMs) => { timeouts.push(delayMs); fn(); return 0; });
    data.setServerUrl('https://x.octopus.app/');
  });
  afterEach(() => { global.setTimeout.mockRestore(); });

  const res429 = (retryAfter) => ({
    status: 429, ok: false, statusText: 'Too Many Requests',
    headers: { get: (name) => (name === 'Retry-After' ? retryAfter : null) }
  });

  test('a 429 is retried and the eventual success is returned', async () => {
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      return calls === 1 ? res429(null) : { status: 200, ok: true, json: async () => [{ Id: 'Spaces-1' }] };
    };
    await expect(data.fetchJson('/api/spaces/all')).resolves.toEqual([{ Id: 'Spaces-1' }]);
    expect(calls).toBe(2);
  });

  test('Retry-After is honoured, plus the padding that yields to higher-priority clients', async () => {
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      return calls === 1 ? res429('2') : { status: 200, ok: true, json: async () => [] };
    };
    await data.fetchJson('/api/spaces/all');
    expect(timeouts).toEqual([7000]); // (2 + 5) seconds
  });

  test('without Retry-After the delay grows with each attempt', async () => {
    global.fetch = async () => res429(null);
    await expect(data.fetchJson('/api/spaces/all')).rejects.toMatchObject({ code: '429 Too Many Requests' });
    expect(timeouts).toEqual([1000, 2000, 3000]);
  });

  test('retries are capped, so a permanently throttled server does not loop forever', async () => {
    let calls = 0;
    global.fetch = async () => { calls += 1; return res429(null); };
    await expect(data.fetchJson('/api/spaces/all')).rejects.toMatchObject({ code: '429 Too Many Requests' });
    expect(calls).toBe(4); // the first attempt plus three retries
  });
});

describe('normalisation', () => {
  const d = require('./data');
  test('healthLabel maps API values', () => {
    expect(d.healthLabel('Healthy')).toBe('Healthy');
    expect(d.healthLabel('HealthyWithWarnings')).toBe('Healthy with warnings');
    expect(d.healthLabel('Unhealthy')).toBe('Unhealthy');
    expect(d.healthLabel(null)).toBe('Unavailable');
  });
  test('kindLabel maps communication styles', () => {
    expect(d.kindLabel('TentaclePassive')).toBe('Tentacle (Listening)');
    expect(d.kindLabel('TentacleActive')).toBe('Tentacle (Polling)');
    expect(d.kindLabel('KubernetesTentacle')).toBe('Kubernetes Agent');
  });
  test('extractVersion reads TentacleVersionDetails.Version', () => {
    expect(d.extractVersion({ TentacleVersionDetails: { Version: '8.3.0' } })).toBe('8.3.0');
    expect(d.extractVersion({})).toBe('—');
  });
});

describe('machineToTarget', () => {
  const d = require('./data');
  const ctx = { envMap:{'Environments-1':'Production'}, policyMap:{'MachinePolicies-1':{Name:'Default'}},
    tenantMap:{}, spaceId:'Spaces-1', spaceName:'Default' };
  const m = { Id:'Machines-1', Name:'web-01', HealthStatus:'Healthy', IsDisabled:false,
    EnvironmentIds:['Environments-1'], MachinePolicyId:'MachinePolicies-1', Roles:['web'], TenantIds:[],
    Endpoint:{ CommunicationStyle:'TentaclePassive', TentacleVersionDetails:{ Version:'8.3.0' } } };
  test('maps a machine to a target view model', () => {
    const t = d.machineToTarget(m, ctx);
    expect(t).toMatchObject({ id:'Machines-1', name:'web-01', kind:'Tentacle (Listening)',
      health:'Healthy', healthKey:'healthy', env:'Production', tag:'web', policy:'Default', version:'8.3.0' });
  });
});

describe('overview + facets + filters', () => {
  const d = require('./data');
  const targets = [
    { name:'a', kind:'Tentacle (Listening)', health:'Healthy', healthKey:'healthy', env:'Production',
      tag:'web', tenant:'No tenants', policy:'Default', version:'8.3.0', os:'Windows', osVersion:'2022' },
    { name:'b', kind:'Kubernetes Agent', health:'Unhealthy', healthKey:'unhealthy', env:'Production',
      tag:'api', tenant:'No tenants', policy:'Default', version:'2.6.0', os:'Linux', osVersion:'—' },
    { name:'c', kind:'Tentacle (Listening)', health:'Disabled', healthKey:'disabled', env:'Dev',
      tag:'web', tenant:'No tenants', policy:'Default', version:'8.1.0', os:'Windows', osVersion:'2019' }
  ];
  test('overviewModel counts health correctly', () => {
    const ov = d.overviewModel(targets, []);
    expect(ov).toMatchObject({ total:3, healthy:1, unhealthy:1, disabled:1, healthyPct:33 });
    expect(ov.byEnv.find(e => e.name==='Production')).toMatchObject({ total:2, healthy:1, unhealthy:1 });
  });
  test('buildFacets produces counted options for Health and Environment', () => {
    const facets = d.buildFacets(targets);
    const health = facets.find(f => f.key==='health');
    expect(health.options).toEqual(expect.arrayContaining([
      { value:'healthy', label:'Healthy', count:1 },
      { value:'unhealthy', label:'Unhealthy', count:1 }
    ]));
  });
  test('applyFilters filters by facet and search', () => {
    expect(d.applyFilters(targets, { health:['healthy'] }, '').map(t=>t.name)).toEqual(['a']);
    expect(d.applyFilters(targets, {}, 'b').map(t=>t.name)).toEqual(['b']);
    expect(d.applyFilters(targets, { env:['Dev'] }, '').map(t=>t.name)).toEqual(['c']);
  });
});

describe('environmentsModel', () => {
  const d = require('./data');
  const targets = [
    { name:'web-01', type:'Tentacle', healthKey:'healthy', health:'Healthy', env:'Production', tag:'web', tenant:'No tenants' },
    { name:'api-01', type:'Kubernetes', healthKey:'unhealthy', health:'Unhealthy', env:'Production', tag:'api', tenant:'No tenants' },
    { name:'web-02', type:'Tentacle', healthKey:'disabled', health:'Disabled', env:'Dev', tag:'web', tenant:'No tenants' }
  ];
  const environments = [
    { id:'Environments-1', name:'Production', spaceId:'Spaces-1' },
    { id:'Environments-2', name:'Dev', spaceId:'Spaces-1' },
    { id:'Environments-3', name:'Staging', spaceId:'Spaces-1' }
  ];
  test('groups targets by environment with health counts, sorted by total descending', () => {
    const rows = d.environmentsModel(targets, environments);
    expect(rows.map(r => r.name)).toEqual(['Production', 'Dev', 'Staging']);
    const prod = rows.find(r => r.name === 'Production');
    expect(prod).toMatchObject({ total: 2, healthy: 1, unhealthy: 1, disabled: 0 });
    expect(prod.targets).toEqual([
      { name:'web-01', type:'Tentacle', healthKey:'healthy', health:'Healthy', tag:'web', tenant:'No tenants' },
      { name:'api-01', type:'Kubernetes', healthKey:'unhealthy', health:'Unhealthy', tag:'api', tenant:'No tenants' }
    ]);
    const dev = rows.find(r => r.name === 'Dev');
    expect(dev).toMatchObject({ total: 1, healthy: 0, unhealthy: 0, disabled: 1 });
    const staging = rows.find(r => r.name === 'Staging');
    expect(staging).toMatchObject({ total: 0, healthy: 0, unhealthy: 0, disabled: 0, targets: [] });
  });
});

describe('policiesModel', () => {
  const d = require('./data');
  const policies = [
    { Id:'MachinePolicies-1', Name:'Default Machine Policy', IsDefault:true, Description:'The default policy.',
      MachineHealthCheckPolicy: { HealthCheckInterval:'00:10:00', HealthCheckType:'RunScript' },
      MachineUpdatePolicy: { TentacleUpgradePolicy:'Manual', CalamariUpdatePolicy:'Automatic', KubernetesAgentUpgradePolicy:'Automatic' },
      MachineConnectivityPolicy: { MachineConnectivityBehavior:'ExpectedToBeOnline' },
      MachineCleanupPolicy: { DeleteMachinesBehavior:'DoNotDelete' } },
    { Id:'MachinePolicies-2', Name:'Kubernetes agents', IsDefault:false, Description:'' }
  ];
  const targets = [
    { name:'a', policy:'Default Machine Policy' },
    { name:'b', policy:'Default Machine Policy' },
    { name:'c', policy:'Kubernetes agents' }
  ];
  test('maps name, isDefault, description and counts usage from targets', () => {
    const rows = d.policiesModel(policies, targets);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ name:'Default Machine Policy', isDefault:true, description:'The default policy.', usage:2 });
    expect(rows[1]).toMatchObject({ name:'Kubernetes agents', isDefault:false, description:'', usage:1 });
  });
  test('falls back to Name-based default detection when IsDefault is absent', () => {
    const rows = d.policiesModel([{ Name:'Default Machine Policy' }], []);
    expect(rows[0].isDefault).toBe(true);
  });
  test('extracts governance fields from the policy resource', () => {
    const rows = d.policiesModel(policies, targets);
    expect(rows[0]).toMatchObject({
      interval:'00:10:00', healthCheckType:'RunScript',
      tentacle:'Manual', calamari:'Automatic', k8s:'Automatic',
      connectivity:'ExpectedToBeOnline', cleanup:'DoNotDelete'
    });
  });
  test('falls back to — for missing/unrecognised governance fields', () => {
    const rows = d.policiesModel([{ Name:'Empty policy' }], []);
    expect(rows[0]).toMatchObject({
      interval:'—', healthCheckType:'—', tentacle:'—', calamari:'—', k8s:'—', connectivity:'—', cleanup:'—'
    });
  });
});

describe('typeGroup', () => {
  const d = require('./data');
  test('collapses and cleans communication styles', () => {
    expect(d.typeGroup('TentacleActive')).toBe('Tentacle');
    expect(d.typeGroup('TentaclePassive')).toBe('Tentacle');
    expect(d.typeGroup('Ssh')).toBe('SSH');
    expect(d.typeGroup('KubernetesTentacle')).toBe('Kubernetes');
    expect(d.typeGroup('Kubernetes')).toBe('Kubernetes');
    expect(d.typeGroup('AzureWebApp')).toBe('Azure Web App');
    expect(d.typeGroup('OfflineDrop')).toBe('Offline Drop');
    expect(d.typeGroup('None')).toBe('Cloud Region');
    expect(d.typeGroup('AzureCloudService')).toBe('Cloud Region');
    expect(d.typeGroup('SomethingNew')).toBe('SomethingNew');
  });
});

describe('health categorisation', () => {
  const d = require('./data');
  test('healthKey folds unavailable/unknown into unhealthy; disabled wins', () => {
    expect(d.healthKey('Healthy', false)).toBe('healthy');
    expect(d.healthKey('HealthyWithWarnings', false)).toBe('healthy');
    expect(d.healthKey('Unhealthy', false)).toBe('unhealthy');
    expect(d.healthKey('Unavailable', false)).toBe('unhealthy');
    expect(d.healthKey(null, false)).toBe('unhealthy');
    expect(d.healthKey('Unavailable', true)).toBe('disabled');
  });
  test('healthKeyLabel is canonical per key', () => {
    expect(d.healthKeyLabel('healthy')).toBe('Healthy');
    expect(d.healthKeyLabel('unhealthy')).toBe('Unhealthy');
    expect(d.healthKeyLabel('disabled')).toBe('Disabled');
  });
  test('health facet has clean 3-way options with canonical labels', () => {
    const targets = [
      { type:'Tentacle', healthKey:'healthy', health:'Healthy', env:'P', tag:'a', tenant:'No tenants', policy:'D', version:'8.3.0', os:'—', osVersion:'—' },
      { type:'Tentacle', healthKey:'disabled', health:'Unavailable', env:'P', tag:'a', tenant:'No tenants', policy:'D', version:'8.3.0', os:'—', osVersion:'—' }
    ];
    const health = d.buildFacets(targets).find(f => f.key==='health');
    expect(health.options).toEqual(expect.arrayContaining([
      { value:'healthy', label:'Healthy', count:1 },
      { value:'disabled', label:'Disabled', count:1 }
    ]));
  });
});

describe('os + dead-facet suppression', () => {
  const d = require('./data');
  test('osLabel reads common candidate fields, else blank', () => {
    expect(d.osLabel({ TentacleVersionDetails:{ OperatingSystem:'Windows Server 2022' } })).toBe('Windows Server 2022');
    expect(d.osLabel({}, { OperatingSystem:'Ubuntu 22.04 LTS' })).toBe('Ubuntu 22.04 LTS');
    expect(d.osLabel({}, {})).toBe('');
  });
  test('osVersionLabel reads common candidate fields, else blank', () => {
    expect(d.osVersionLabel({ TentacleVersionDetails:{ OperatingSystemVersion:'10.0.20348' } })).toBe('10.0.20348');
    expect(d.osVersionLabel({}, { OperatingSystemVersion:'22.04' })).toBe('22.04');
    expect(d.osVersionLabel({}, {})).toBe('');
  });
  test('buildFacets omits a facet whose only option is —', () => {
    const targets = [{ type:'Tentacle', healthKey:'healthy', health:'Healthy', env:'P', tag:'a',
      tenant:'No tenants', policy:'D', version:'8.3.0', os:'—', osVersion:'—' }];
    const keys = d.buildFacets(targets).map(f => f.key);
    expect(keys).not.toContain('os');
    expect(keys).not.toContain('osVersion');
    expect(keys).toContain('type'); // real facets still present (Type facet keyed 'type' since A2)
  });
});

describe('OS blank behaviour', () => {
  const d = require('./data');
  test('osLabel/osVersionLabel return empty string when unknown', () => {
    expect(d.osLabel({}, {})).toBe('');
    expect(d.osVersionLabel({}, {})).toBe('');
  });
  test('a facet whose only option is empty string is suppressed', () => {
    const targets = [{ type:'Tentacle', healthKey:'healthy', health:'Healthy', env:'P', tag:'a',
      tenant:'No tenants', policy:'D', version:'8.3.0', os:'', osVersion:'' }];
    const keys = d.buildFacets(targets).map(f=>f.key);
    expect(keys).not.toContain('os');
    expect(keys).not.toContain('osVersion');
  });
});

describe('workersModel + workerFacets + applyWorkerFilters', () => {
  const d = require('./data');
  const workers = [
    { id:'Workers-1', name:'worker-a', health:'Healthy', healthKey:'healthy', pool:'Default Worker Pool', version:'8.3.0', kind:'Tentacle (Listening)' },
    { id:'Workers-2', name:'worker-b', health:'Unhealthy', healthKey:'unhealthy', pool:'Default Worker Pool', version:'8.1.0', kind:'Tentacle (Polling)' },
    { id:'Workers-3', name:'worker-c', health:'Healthy', healthKey:'healthy', pool:'Docker Pool', version:'8.3.0', kind:'Kubernetes Agent' }
  ];
  test('workersModel aggregates pools by total descending with healthy/unhealthy counts, and passes through rows', () => {
    const m = d.workersModel(workers);
    expect(m.pools).toEqual([
      { name:'Default Worker Pool', total:2, healthy:1, unhealthy:1 },
      { name:'Docker Pool', total:1, healthy:1, unhealthy:0 }
    ]);
    expect(m.rows).toEqual(workers);
  });
  test('workerFacets produces counted options for Health, Pool and Agent version', () => {
    const facets = d.workerFacets(workers);
    const health = facets.find(f => f.key==='health');
    expect(health.options).toEqual(expect.arrayContaining([
      { value:'healthy', label:'Healthy', count:2 },
      { value:'unhealthy', label:'Unhealthy', count:1 }
    ]));
    const pool = facets.find(f => f.key==='pool');
    expect(pool.options).toEqual(expect.arrayContaining([
      { value:'Default Worker Pool', label:'Default Worker Pool', count:2 },
      { value:'Docker Pool', label:'Docker Pool', count:1 }
    ]));
    const version = facets.find(f => f.key==='version');
    expect(version.options).toEqual(expect.arrayContaining([
      { value:'8.3.0', label:'8.3.0', count:2 },
      { value:'8.1.0', label:'8.1.0', count:1 }
    ]));
  });
  test('workerFacets omits a facet whose only option is —', () => {
    const single = [{ id:'Workers-1', name:'w', health:'Healthy', healthKey:'healthy', pool:'—', version:'—', kind:'Tentacle (Listening)' }];
    const keys = d.workerFacets(single).map(f => f.key);
    expect(keys).not.toContain('pool');
    expect(keys).not.toContain('version');
    expect(keys).toContain('health');
  });
  test('applyWorkerFilters filters by health/pool facet and by name search', () => {
    expect(d.applyWorkerFilters(workers, { health:['healthy'] }, '').map(w=>w.name)).toEqual(['worker-a','worker-c']);
    expect(d.applyWorkerFilters(workers, {}, 'worker-b').map(w=>w.name)).toEqual(['worker-b']);
    expect(d.applyWorkerFilters(workers, { pool:['Docker Pool'] }, '').map(w=>w.name)).toEqual(['worker-c']);
  });
});

describe('buildEstate scoping (space switcher)', () => {
  const d = require('./data');
  test('buildEstate scopes to the given perSpace slice', () => {
    const perSpace = [
      { sp:{Id:'Spaces-1',Name:'A'}, envs:[], policies:[], tenants:[], workerpools:[], workers:[],
        machines:[{Id:'m1',Name:'a1',Endpoint:{CommunicationStyle:'TentaclePassive'},EnvironmentIds:[],Roles:[],TenantIds:[]}] },
      { sp:{Id:'Spaces-2',Name:'B'}, envs:[], policies:[], tenants:[], workerpools:[], workers:[],
        machines:[{Id:'m2',Name:'b1',Endpoint:{CommunicationStyle:'TentaclePassive'},EnvironmentIds:[],Roles:[],TenantIds:[]}] }
    ];
    expect(d.buildEstate(perSpace).targets.map(t=>t.name).sort()).toEqual(['a1','b1']);
    expect(d.buildEstate(perSpace.filter(s=>s.sp.Id==='Spaces-1')).targets.map(t=>t.name)).toEqual(['a1']);
  });
});

describe('filterEnvTargets', () => {
  const v = require('./views');
  const targets = [
    { name:'a', type:'Tentacle', healthKey:'healthy', health:'Healthy', tag:'web', tenant:'No tenants' },
    { name:'b', type:'Kubernetes', healthKey:'unhealthy', health:'Unhealthy', tag:'api', tenant:'No tenants' },
    { name:'c', type:'Tentacle', healthKey:'disabled', health:'Disabled', tag:'web', tenant:'No tenants' }
  ];
  test('key "all" returns every target unchanged', () => {
    expect(v.filterEnvTargets(targets, 'all')).toEqual(targets);
  });
  test('filters targets by healthKey when key is not "all"', () => {
    expect(v.filterEnvTargets(targets, 'healthy').map(t => t.name)).toEqual(['a']);
    expect(v.filterEnvTargets(targets, 'unhealthy').map(t => t.name)).toEqual(['b']);
    expect(v.filterEnvTargets(targets, 'disabled').map(t => t.name)).toEqual(['c']);
  });
  test('treats a missing targets array as empty, for any key', () => {
    expect(v.filterEnvTargets(undefined, 'all')).toEqual([]);
    expect(v.filterEnvTargets(undefined, 'healthy')).toEqual([]);
  });
});

describe('readConfig robustness', () => {
  const d = require('./data');
  afterEach(() => { delete global.dashboardGetConfig; });

  test('resolves (never rejects) when dashboardGetConfig throws — e.g. no chrome.storage on file://', async () => {
    global.dashboardGetConfig = () => { throw new TypeError("Cannot read properties of undefined (reading 'local')"); };
    d.setServerUrl(null);
    await expect(d.readConfig()).resolves.toEqual({ serverUrl: null, context: {} });
  });

  test('uses lastServerUrl and context from a valid config', async () => {
    global.dashboardGetConfig = (cb) => cb({ lastServerUrl: 'https://x.octopus.app/', context: { space: 'S' } });
    await expect(d.readConfig()).resolves.toEqual({ serverUrl: 'https://x.octopus.app/', context: { space: 'S' } });
  });
});

describe('agentsModel', () => {
  const d = require('./data');
  const targets = [
    { name:'t1', type:'Tentacle', env:'P', version:'8.5.1', policy:'D', healthKey:'healthy' },
    { name:'t2', type:'Tentacle', env:'P', version:'8.4.0', policy:'D', healthKey:'healthy' }, // same major as latest → NOT behind
    { name:'t3', type:'Tentacle', env:'S', version:'7.4.3', policy:'D', healthKey:'healthy' }, // one major behind → behind
    { name:'t4', type:'Tentacle', env:'D', version:'—',     policy:'D', healthKey:'unhealthy' }, // unknown
    { name:'k1', type:'Kubernetes', env:'P', version:'2.6.0', policy:'D', healthKey:'healthy' }
  ];
  test('derives latest; behind = one or more MAJOR versions behind', () => {
    const m = d.agentsModel(targets);
    expect(m.tentacle.latest).toBe('8.5.1');
    expect(m.tentacle.total).toBe(4);
    expect(m.tentacle.behind).toBe(1);     // only 7.4.3 (major 7 < 8); 8.4.0 is same major, not behind
    expect(m.tentacle.upToDate).toBe(2);   // 8.5.1 and 8.4.0 (known, same major as latest)
    expect(m.tentacle.unknown).toBe(1);    // '—'
    expect(m.tentacle.rows.find(r=>r.name==='t2').behind).toBe(false);
    expect(m.tentacle.rows.find(r=>r.name==='t3').behind).toBe(true);
    expect(m.kubernetes.latest).toBe('2.6.0');
  });
  test('majorVersion + versionBand', () => {
    expect(d.majorVersion('8.4.0')).toBe(8);
    expect(d.majorVersion('—')).toBeNaN();
    expect(d.versionBand('4.0.0')).toBe('red');
    expect(d.versionBand('6.3.417')).toBe('yellow');
    expect(d.versionBand('8.5.1')).toBe('green');
    expect(d.versionBand('—')).toBe('unknown');
  });
});
describe('overview agents-behind', () => {
  const d = require('./data');
  test('overviewModel exposes agents.latest and agents.behind (major-version rule)', () => {
    const targets = [
      { name:'a', type:'Tentacle', env:'P', version:'8.5.1', policy:'D', healthKey:'healthy' },
      { name:'b', type:'Tentacle', env:'P', version:'7.4.0', policy:'D', healthKey:'healthy' }, // major behind
      { name:'c', type:'Tentacle', env:'P', version:'8.2.0', policy:'D', healthKey:'healthy' }  // same major, not behind
    ];
    const ov = d.overviewModel(targets, []);
    expect(ov.agents.latest).toBe('8.5.1');
    expect(ov.agents.behind).toBe(1);
  });
});

describe('facets drop blank-value options', () => {
  const d = require('./data');
  test('os facet omits the empty-string option on a mixed estate', () => {
    const targets = [
      { type:'Tentacle', healthKey:'healthy', health:'Healthy', env:'P', tag:'a', tenant:'No tenants', policy:'D', version:'8.3.0', os:'Windows Server 2022', osVersion:'10.0' },
      { type:'Kubernetes', healthKey:'healthy', health:'Healthy', env:'P', tag:'a', tenant:'No tenants', policy:'D', version:'2.6.0', os:'', osVersion:'' }
    ];
    const os = d.buildFacets(targets).find(f => f.key === 'os');
    expect(os).toBeDefined();
    expect(os.options.map(o => o.value)).toEqual(['Windows Server 2022']);
    expect(os.options.some(o => o.value === '')).toBe(false);
  });
});

describe('isEmptyEstate', () => {
  const d = require('./data');
  test('true when no targets and no workers; false otherwise', () => {
    expect(d.isEmptyEstate(null)).toBe(true);
    expect(d.isEmptyEstate({ targets:[], workers:[] })).toBe(true);
    expect(d.isEmptyEstate({ targets:[{name:'a'}], workers:[] })).toBe(false);
    expect(d.isEmptyEstate({ targets:[], workers:[{name:'w'}] })).toBe(false);
  });
});

describe('OS "Unknown" literal treated as blank', () => {
  const d = require('./data');
  test('osLabel/osVersionLabel return blank for a literal Unknown value', () => {
    expect(d.osLabel({ OperatingSystem: 'Unknown' }, {})).toBe('');
    expect(d.osLabel({ OperatingSystem: 'unknown' }, {})).toBe('');
    expect(d.osVersionLabel({ OperatingSystemVersion: 'Unknown' }, {})).toBe('');
    // a real OS value is still returned
    expect(d.osLabel({ OperatingSystem: 'Windows Server 2022' }, {})).toBe('Windows Server 2022');
  });
});

describe('escHtml escapes the single quote', () => {
  const Views = require('./views');
  test('single quote becomes &#39; (attribute-safe) and other entities still escape', () => {
    expect(Views.escHtml("O'Brien")).toBe('O&#39;Brien');
    expect(Views.escHtml(`<a href='x' title="y">&`)).toBe('&lt;a href=&#39;x&#39; title=&quot;y&quot;&gt;&amp;');
  });
});



describe('emptyKind', () => {
  const d = require('./data');
  test('rows when anything is shown', () => {
    expect(d.emptyKind(10, 3)).toBe('rows');
    expect(d.emptyKind(1, 1)).toBe('rows');
  });
  test('none when the collection itself is empty', () => {
    expect(d.emptyKind(0, 0)).toBe('none');
  });
  test('nomatch when items exist but filters hide them all', () => {
    expect(d.emptyKind(10, 0)).toBe('nomatch');
  });
  test('tolerates missing/garbage counts as empty', () => {
    expect(d.emptyKind(undefined, undefined)).toBe('none');
    expect(d.emptyKind(null, 0)).toBe('none');
  });
});

describe('renderAddTarget', () => {
  const Views = require('./views');
  const IP = { serverUrl: 'https://x.octopus.app/' };

  test('step 1 lists every target type and creates nothing', () => {
    const html = Views.renderAddTarget(IP);
    expect(html).toContain('Step 1 of 2');
    ['Listening Tentacle','Polling Tentacle','Kubernetes agent','SSH connection'].forEach(n =>
      expect(html).toContain(n));
    expect(html).not.toMatch(/<form|method="post"/i); // read-only walkthrough
  });

  test('step 2 shows the chosen type, what it needs, and a link-out', () => {
    const html = Views.renderAddTarget({ ...IP, addTargetType: 'polling' });
    expect(html).toContain('Step 2 of 2');
    expect(html).toContain('Polling Tentacle');
    expect(html).toContain('10943');
    expect(html).toContain('rel="noopener"');
    expect(html).toContain('#targets/new');   // back to the chooser
  });

  test('an unknown type falls back to the chooser rather than a blank page', () => {
    expect(Views.renderAddTarget({ ...IP, addTargetType: 'nonsense' })).toContain('Step 1 of 2');
  });

  test('escapes the server url into hrefs', () => {
    const html = Views.renderAddTarget({ serverUrl: 'https://x.octopus.app/"><script>', addTargetType: 'ssh' });
    expect(html).not.toContain('<script>');
  });
});

describe('machine activity (per-target tasks)', () => {
  const d = require('./data');
  // Shapes taken from a live probe of /api/{space}/machines/{id}/tasks.
  const tasks = [
    { Id:'ServerTasks-1', Name:'Deploy', Description:'Deploy TelemetryProxy release 0.0.998 to Production',
      State:'Success', FinishedSuccessfully:true, CompletedTime:'2025-04-30T03:51:24.000+00:00',
      ProjectId:'Projects-3225', Arguments:{ DeploymentId:'Deployments-1526356' } },
    { Id:'ServerTasks-2', Name:'Deploy', Description:'Deploy TelemetryProxy release 0.0.997 to Production',
      State:'Failed', FinishedSuccessfully:false, CompletedTime:'2025-04-29T01:00:00.000+00:00',
      ProjectId:'Projects-3225', Arguments:{ DeploymentId:'Deployments-1526000' } },
    { Id:'ServerTasks-3', Name:'Health', Description:'Check target health',
      State:'Success', FinishedSuccessfully:true, CompletedTime:'2026-07-27T01:00:00.000+00:00', Arguments:{} }
  ];

  test('taskKind maps the task names the API actually returns', () => {
    expect(d.taskKind('Deploy')).toBe('deploy');
    expect(d.taskKind('Health')).toBe('health');
    expect(d.taskKind('Upgrade')).toBe('upgrade');
    expect(d.taskKind('SomethingElse')).toBe('other');
    expect(d.taskKind(undefined)).toBe('other');
  });

  test('splits deployments from health checks and keeps newest first', () => {
    const m = d.machineActivityModel(tasks);
    expect(m.deployments.map(r => r.id)).toEqual(['ServerTasks-1','ServerTasks-2']);
    expect(m.health).toHaveLength(1);
    expect(m.deployments[0].description).toContain('0.0.998');
    expect(m.deployments[1].success).toBe(false);
  });

  test('lastSuccessfulDeploy is the newest deploy that actually succeeded', () => {
    const m = d.machineActivityModel(tasks);
    expect(m.lastSuccessfulDeploy.id).toBe('ServerTasks-1');
    // a target whose only deploy failed has no last successful release to show
    const failedOnly = d.machineActivityModel([tasks[1]]);
    expect(failedOnly.lastSuccessfulDeploy).toBe(null);
  });

  test('empty or missing task list yields empty groups, not a crash', () => {
    const m = d.machineActivityModel(null);
    expect(m.deployments).toEqual([]);
    expect(m.lastSuccessfulDeploy).toBe(null);
  });
});

describe('fetchMachineDetail', () => {
  const d = require('./data');
  beforeEach(() => d.setServerUrl('https://x.octopus.app/'));

  test('returns tasks and connection when both succeed', async () => {
    global.fetch = async (url) => ({
      status: 200, ok: true, statusText: 'OK',
      json: async () => String(url).includes('/tasks')
        ? { Items: [{ Id:'ServerTasks-1', Name:'Deploy' }] }
        : { Status: 'Online', CurrentTentacleVersion: '8.5.1' }
    });
    const r = await d.fetchMachineDetail('Spaces-1', 'Machines-1');
    expect(r.tasks).toHaveLength(1);
    expect(r.connection.CurrentTentacleVersion).toBe('8.5.1');
  });

  test('a failed half comes back null, not an empty list — "unknown" must not read as "none"', async () => {
    global.fetch = async (url) => String(url).includes('/tasks')
      ? { status: 500, ok: false, statusText: 'Server Error' }
      : { status: 200, ok: true, json: async () => ({ Status: 'Online' }) };
    const r = await d.fetchMachineDetail('Spaces-1', 'Machines-1');
    expect(r.tasks).toBe(null);
    expect(r.connection.Status).toBe('Online');
  });

  test('no tasks for a target is an empty list, which is a real answer', async () => {
    global.fetch = async () => ({ status: 200, ok: true, json: async () => ({ Items: [] }) });
    const r = await d.fetchMachineDetail('Spaces-1', 'Machines-1');
    expect(r.tasks).toEqual([]);
  });
});

describe('target detail cards (async-filled)', () => {
  const Views = require('./views');
  const d = require('./data');
  const t = { id:'Machines-1', spaceId:'Spaces-1', comm:'Polling Tentacle', health:'Healthy', version:'8.5.1' };
  const tasks = [
    { Id:'ServerTasks-1', Name:'Deploy', Description:'Deploy Web release 1.2.3 to Production',
      State:'Success', FinishedSuccessfully:true, CompletedTime:'2026-04-30T03:51:24.000+00:00' }
  ];

  test('a failed load says so; it does not claim the target has no deployments', () => {
    const html = Views.deploymentsCardHtml(t, d.machineActivityModel(null), null, 'https://x.octopus.app/');
    expect(html).toMatch(/couldn.t load/i);
    expect(html).not.toMatch(/no deployments/i);
  });

  test('an empty-but-successful load says there are none', () => {
    const html = Views.deploymentsCardHtml(t, d.machineActivityModel([]), [], 'https://x.octopus.app/');
    expect(html).toMatch(/no deployments/i);
  });

  test('renders real rows and names the last successful release', () => {
    const html = Views.deploymentsCardHtml(t, d.machineActivityModel(tasks), tasks, 'https://x.octopus.app/');
    expect(html).toContain('Deploy Web release 1.2.3 to Production');
    expect(html).toContain('Spaces-1/tasks/ServerTasks-1');   // links out to the task
    expect(html).toMatch(/last successful/i);
  });

  test('connectivity uses live connection data when present, target fields otherwise', () => {
    const withConn = Views.connectivityCardHtml(t, { Status:'Online', CurrentTentacleVersion:'8.5.1',
      LastChecked:'2026-07-27T01:00:00.000+00:00' });
    expect(withConn).toContain('Online');
    const without = Views.connectivityCardHtml(t, null);
    expect(without).toContain('Polling Tentacle');
    expect(without).not.toContain('Online');
  });

  test('escapes hostile task descriptions', () => {
    const nasty = [{ Id:'ServerTasks-2', Name:'Deploy', Description:'<img src=x onerror=alert(1)>',
      State:'Success', FinishedSuccessfully:true, CompletedTime:'2026-01-01T00:00:00.000+00:00' }];
    const html = Views.deploymentsCardHtml(t, d.machineActivityModel(nasty), nasty, 'https://x.octopus.app/');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });
});

describe('coldStartApplies — cold-start is a landing screen, not a wall', () => {
  const d = require('./data');
  const bare    = { targets:[], workers:[], environments:[],        policies:[] };
  const noInfra = { targets:[], workers:[], environments:[{id:'e'}], policies:[{Id:'p'}] };
  const full    = { targets:[{id:'t'}], workers:[], environments:[], policies:[] };

  test('overview is the welcome moment when there is no infrastructure', () => {
    expect(d.coldStartApplies('overview', bare)).toBe(true);
    expect(d.coldStartApplies('overview', noInfra)).toBe(true);
  });

  test('an explicit nav click always reaches its own view, empty or not', () => {
    // clicking a nav item and getting the screen you were already on is a dead end
    ['targets','workers','agents','environments','machinepolicies','argocd']
      .forEach(v => {
        expect(d.coldStartApplies(v, bare)).toBe(false);
        expect(d.coldStartApplies(v, noInfra)).toBe(false);
      });
  });

  test('the add-target walkthrough is never gated', () => {
    expect(d.coldStartApplies('targets/new', bare)).toBe(false);
  });

  test('a populated estate never shows cold-start', () => {
    ['overview','targets','environments'].forEach(v => expect(d.coldStartApplies(v, full)).toBe(false));
  });
});

describe('designed zero states (Targets / Workers)', () => {
  const Views = require('./views');
  // views.js reaches for `Data` as a browser global; the populated path needs it here.
  global.Data = require('./data');
  const IP = { serverUrl:'https://x.octopus.app/', estate:{ targets:[], workers:[], environments:[], policies:[] },
               filters:{}, search:'', page:1, wFilters:{}, wSearch:'', wPage:1 };

  test('targets zero state matches the design: heading, add action, learn link, no filter panel', () => {
    const html = Views.renderTargets(IP);
    expect(html).toContain('Add your first deployment target');
    expect(html).toContain('#targets/new');
    expect(html).toMatch(/Learn about deployment targets/);
    expect(html).not.toContain('ip-facets');           // filters are hidden when there is nothing to filter
    expect(html).not.toMatch(/clearing your search/i); // and never the wrong-filter advice
  });

  test('targets zero state carries a labelled preview, not data pretending to be real', () => {
    const html = Views.renderTargets(IP);
    expect(html).toMatch(/Preview/i);
    expect(html).toContain('Once added, your targets appear here');
    expect(html).toContain('web-prod-public-api-01');
    expect(html).toContain('ip-preview');              // the dimmed wrapper carries the visual signal
  });

  test('workers zero state matches the design, previewing pools', () => {
    const html = Views.renderWorkers(IP);
    expect(html).toContain('Add your first worker');
    expect(html).toMatch(/Learn about workers/);
    expect(html).toContain('Once added, workers are grouped into pools');
    expect(html).toContain('Default Pool');
    expect(html).not.toContain('ip-facets');
  });

  test('a populated estate still renders the real list, not the preview', () => {
    const live = { ...IP, estate: { ...IP.estate, targets: [
      { id:'t1', name:'real-target', type:'Tentacle', kind:'Tentacle (Polling)', os:'', osVersion:'',
        health:'Healthy', healthKey:'healthy', env:'Production', envCat:'production', tag:'web',
        moreTags:0, tenant:'No tenants', policy:'Default', version:'8.5.1' } ] } };
    const html = Views.renderTargets(live);
    expect(html).toContain('real-target');
    expect(html).not.toContain('web-prod-public-api-01');
    expect(html).toContain('ip-facets');
  });
});

describe('filterEnvRows', () => {
  const d = require('./data');
  const rows = [
    { name:'Production',  total:5, healthy:3, unhealthy:2, disabled:0 },
    { name:'Staging',     total:4, healthy:4, unhealthy:0, disabled:0 },
    { name:'Development', total:0, healthy:0, unhealthy:0, disabled:0 }
  ];
  test('all passes everything through', () => {
    expect(d.filterEnvRows(rows, '', 'all')).toHaveLength(3);
  });
  test('needs attention keeps only environments with something unhealthy', () => {
    expect(d.filterEnvRows(rows, '', 'attention').map(r => r.name)).toEqual(['Production']);
  });
  test('all healthy keeps environments with nothing unhealthy', () => {
    expect(d.filterEnvRows(rows, '', 'healthy').map(r => r.name)).toEqual(['Staging','Development']);
  });
  test('search is case-insensitive and combines with the mode', () => {
    expect(d.filterEnvRows(rows, 'prod', 'all').map(r => r.name)).toEqual(['Production']);
    expect(d.filterEnvRows(rows, 'prod', 'healthy')).toEqual([]);
  });
  test('missing arguments degrade to everything', () => {
    expect(d.filterEnvRows(rows)).toHaveLength(3);
    expect(d.filterEnvRows(null, '', 'all')).toEqual([]);
  });
});

describe('overviewModel byType — disabled targets (Copilot review)', () => {
  const d = require('./data');
  const targets = [
    { type:'Tentacle', healthKey:'healthy' },
    { type:'Tentacle', healthKey:'unhealthy' },
    { type:'Tentacle', healthKey:'disabled' },
    { type:'Kubernetes', healthKey:'disabled' }
  ];
  test('a disabled target is counted in its type row, not dropped', () => {
    const ov = d.overviewModel(targets, []);
    const tent = ov.byType.find(r => r.name === 'Tentacle');
    expect(tent).toMatchObject({ healthy:1, unhealthy:1, disabled:1, total:3 });
  });
  test('a type whose targets are all disabled still appears with a real count', () => {
    const ov = d.overviewModel(targets, []);
    const k8s = ov.byType.find(r => r.name === 'Kubernetes');
    expect(k8s).toMatchObject({ healthy:0, unhealthy:0, disabled:1, total:1 });
  });
  test('per-type totals reconcile with the estate totals', () => {
    const ov = d.overviewModel(targets, []);
    const sum = k => ov.byType.reduce((n, r) => n + r[k], 0);
    expect(sum('healthy')).toBe(ov.healthy);
    expect(sum('unhealthy')).toBe(ov.unhealthy);
    expect(sum('disabled')).toBe(ov.disabled);
    expect(sum('total')).toBe(ov.total);
  });
});

describe('per-space partial failures (Copilot review)', () => {
  const d = require('./data');
  const page = items => ({ status:200, ok:true, json: async () => items });

  test('a resource that fails to load is recorded, not silently emptied', async () => {
    global.fetch = async (url) => String(url).includes('/environments/all')
      ? { status:403, ok:false, statusText:'Forbidden' } : page([]);
    d.setServerUrl('https://x.octopus.app/');
    const hydrated = await d.hydrateSpace({ Id:'Spaces-1', Name:'Default' });
    expect(hydrated.failed).toContain('environments');
    // and the estate carries it through, so a view can say "couldn't load" not "there are none"
    const estate = d.buildEstate([hydrated]);
    expect(estate.failed.environments).toBe(true);
    expect(estate.failed.policies).toBe(false);
  });

  test('everything loading cleanly leaves no failure flags', async () => {
    global.fetch = async () => page([]);
    d.setServerUrl('https://x.octopus.app/');
    const hydrated = await d.hydrateSpace({ Id:'Spaces-1', Name:'Default' });
    expect(hydrated.failed).toEqual([]);
    expect(d.buildEstate([hydrated]).failed.environments).toBe(false);
  });
});


describe('unreadable resources are not reported as empty (Copilot review)', () => {
  const Views = require('./views');
  global.Data = require('./data');
  const base = { serverUrl:'https://x.octopus.app/', envQuery:'', envMode:'all',
    wFilters:{}, wSearch:'', wPage:1, filters:{}, search:'', page:1 };
  const estate = (failed) => ({ targets:[], workers:[], environments:[], policies:[],
    failed: Object.assign({ environments:false, policies:false, tenants:false,
      workerpools:false, workers:false }, failed) });

  test('environments that failed to load say so, and do not offer to add one', () => {
    const html = Views.renderEnvironments({ ...base, estate: estate({ environments:true }) });
    expect(html).toMatch(/couldn.t load/i);
    expect(html).not.toMatch(/No environments in this space/);
  });

  test('environments that genuinely are empty still say so', () => {
    const html = Views.renderEnvironments({ ...base, estate: estate() });
    expect(html).toMatch(/No environments in this space/);
    expect(html).not.toMatch(/couldn.t load/i);
  });

  test('workers that failed to load do not render the add-your-first zero state', () => {
    const html = Views.renderWorkers({ ...base, estate: estate({ workers:true }) });
    expect(html).toMatch(/couldn.t load/i);
    expect(html).not.toContain('Add your first worker');
  });

  test('workers that genuinely are empty get the designed zero state', () => {
    const html = Views.renderWorkers({ ...base, estate: estate() });
    expect(html).toContain('Add your first worker');
  });
});

describe('environment heat cells are operable by keyboard (Copilot review)', () => {
  const Views = require('./views');
  global.Data = require('./data');
  const IP = { serverUrl:'https://x.octopus.app/', envQuery:'', envMode:'all', envExpanded:{},
    estate:{ failed:{}, environments:[{ id:'e1', name:'Production', spaceId:'s1' }],
      targets:[{ name:'a', type:'Tentacle', healthKey:'healthy', health:'Healthy',
                 env:'Production', tag:'web', tenant:'No tenants' }] } };

  test('clickable cells expose a role, are focusable, and are labelled', () => {
    const html = Views.renderEnvironments(IP);
    expect(html).toContain('role="button"');
    expect(html).toContain('tabindex="0"');
    expect(html).toMatch(/aria-label="[^"]+"/);
  });
});

describe('per-target events', () => {
  const d = require('./data');
  // Shape from a live probe of /api/{space}/events?regarding={machineId}
  const raw = [
    { Id:'Events-1', Category:'MachineHealthy', Username:'system', IsService:false,
      Occurred:'2026-07-27T03:49:42.220+00:00', Message:'Machine web-01 is now healthy',
      MessageHtml:'<a href="#">Machine</a> web-01 is now healthy' },
    { Id:'Events-2', Category:'Modified', Username:'lucy.spence',
      Occurred:'2026-07-26T01:00:00.000+00:00', Message:'Machine web-01 was modified' }
  ];
  test('normalises to id, category, who, when and plain message', () => {
    const rows = d.eventsModel(raw);
    expect(rows[0]).toMatchObject({ id:'Events-1', category:'MachineHealthy',
      who:'system', message:'Machine web-01 is now healthy' });
    expect(rows[0].occurred).toBe('2026-07-27T03:49:42.220+00:00');
  });
  test('takes the plain Message, never MessageHtml', () => {
    const rows = d.eventsModel(raw);
    expect(rows[0].message).not.toContain('<a');
  });
  test('newest first', () => {
    expect(d.eventsModel(raw).map(r => r.id)).toEqual(['Events-1','Events-2']);
  });
  test('null and empty degrade without throwing', () => {
    expect(d.eventsModel(null)).toEqual([]);
    expect(d.eventsModel([])).toEqual([]);
  });
});

describe('events card rendering', () => {
  const Views = require('./views');
  const d = require('./data');
  const t = { id:'Machines-1', spaceId:'Spaces-1' };
  test('a failed events fetch is not reported as no events', () => {
    const html = Views.eventsCardHtml(t, d.eventsModel(null), null, 'https://x.octopus.app/');
    expect(html).toMatch(/couldn.t load/i);
    expect(html).not.toMatch(/no events/i);
  });
  test('an empty result says none are retained, and says why that can happen', () => {
    const html = Views.eventsCardHtml(t, d.eventsModel([]), [], 'https://x.octopus.app/');
    expect(html).toMatch(/no events/i);
    // must explain why an empty result is possible, not just assert emptiness
    expect(html).toMatch(/prune|retention|retained/i);
  });
  test('renders rows and escapes the message', () => {
    const nasty = [{ Id:'Events-9', Category:'Modified', Username:'x',
      Occurred:'2026-01-01T00:00:00.000+00:00', Message:'<img src=x onerror=alert(1)>' }];
    const html = Views.eventsCardHtml(t, d.eventsModel(nasty), nasty, 'https://x.octopus.app/');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });
});

describe('lazy space hydration', () => {
  const d = require('./data');
  const page = items => ({ status:200, ok:true, json: async () => items });
  const spaces = [{ Id:'Spaces-1', Name:'One' }, { Id:'Spaces-2', Name:'Two' }];
  let calls;
  const mock = () => { calls = []; global.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes('/spaces/all')) return page(spaces);
    return page([]);
  }; };
  beforeEach(() => { mock(); d.setServerUrl('https://x.octopus.app/'); });

  test('loadSpaces lists spaces without hydrating any of them', async () => {
    const res = await d.loadSpaces('https://x.octopus.app/');
    expect(res.spaces).toHaveLength(2);
    expect(calls).toHaveLength(1);                       // one request, not 1 + 2*6
    expect(calls[0]).toContain('/spaces/all');
  });

  test('hydrateSpace loads exactly one space and records its failures', async () => {
    global.fetch = async (url) => String(url).includes('/environments/all')
      ? { status:403, ok:false, statusText:'Forbidden' } : page([]);
    const s = await d.hydrateSpace({ Id:'Spaces-1', Name:'One' });
    expect(s.sp.Id).toBe('Spaces-1');
    expect(s.failed).toContain('environments');
  });

  test('a space whose machines cannot be read yields null, not a half-empty space', async () => {
    global.fetch = async (url) => String(url).includes('/machines/all')
      ? { status:500, ok:false, statusText:'Server Error' } : page([]);
    expect(await d.hydrateSpace({ Id:'Spaces-1', Name:'One' })).toBe(null);
  });

  test('auth failure on the space list is still distinguishable from an empty instance', async () => {
    global.fetch = async () => ({ status:401, ok:false, statusText:'Unauthorized' });
    expect((await d.loadSpaces('https://x.octopus.app/')).status).toBe('auth');
    global.fetch = async () => page([]);
    expect((await d.loadSpaces('https://x.octopus.app/')).status).toBe('empty');
  });

});

// Paul Stovell's feedback on the walkthrough (28 Jul 2026): Machine Policies is a rare
// destination and belongs inside Deployment Targets; the sidebar should carry five items,
// with Deployment Targets | Agents | Policies as horizontal tabs within one section.
describe('Deployment Targets section tabs (Paul Stovell feedback)', () => {
  const Views = require('./views');
  global.Data = require('./data');
  const target = { id:'t1', name:'real-target', type:'Tentacle', kind:'Tentacle (Polling)', os:'', osVersion:'',
    health:'Healthy', healthKey:'healthy', env:'Production', envCat:'production', tag:'web',
    moreTags:0, tenant:'No tenants', policy:'Default', version:'8.5.1' };
  const base = { serverUrl:'https://x.octopus.app/', filters:{}, search:'', page:1,
                 wFilters:{}, wSearch:'', wPage:1 };
  const empty = { ...base, estate:{ targets:[], workers:[], environments:[], policies:[] } };
  const full  = { ...base, estate:{ targets:[target], workers:[], environments:[], policies:[] } };
  const activeLabels = html => (html.match(/ip-section-tab ip-tab-active"[^>]*>([^<]+)</g) || [])
    .map(m => m.replace(/^.*>/, '').replace(/<$/, ''));

  test('every section renders all three tabs, so none is a dead end', () => {
    [Views.renderTargets(full), Views.renderTargets(empty),
     Views.renderAgents(full), Views.renderMachinePolicies(full)].forEach(html => {
      expect(html).toContain('href="#targets"');
      expect(html).toContain('href="#agents"');
      expect(html).toContain('href="#machinepolicies"');
    });
  });

  test('exactly one tab is active, and it is the section being rendered', () => {
    expect(activeLabels(Views.renderTargets(full))).toEqual(['Deployment Targets']);
    expect(activeLabels(Views.renderTargets(empty))).toEqual(['Deployment Targets']);
    expect(activeLabels(Views.renderAgents(full))).toEqual(['Agents']);
    expect(activeLabels(Views.renderMachinePolicies(full))).toEqual(['Policies']);
  });

  test('the page title is stable across tabs, so the tabs read as tabs', () => {
    [Views.renderTargets(full), Views.renderTargets(empty),
     Views.renderAgents(full), Views.renderMachinePolicies(full)].forEach(html => {
      expect(html).toContain('<h2>Deployment targets</h2>');
    });
    // the old top-level headings are gone; the tab label names the sub-view now
    expect(Views.renderAgents(full)).not.toContain('<h2>Deployment agents</h2>');
    expect(Views.renderMachinePolicies(full)).not.toContain('<h2>Machine policies</h2>');
  });

  test('each tab keeps its own framing in the subtitle', () => {
    expect(Views.renderTargets(full)).toMatch(/faceted filters/);
    expect(Views.renderAgents(full)).toMatch(/Latest available/);
    expect(Views.renderMachinePolicies(full)).toMatch(/health-check schedules/);
  });

  test('the tab bar sits above the facet rail, not inside the targets column', () => {
    const html = Views.renderTargets(full);
    expect(html.indexOf('ip-section-tabs')).toBeLessThan(html.indexOf('ip-targets-wrap'));
    expect(html.indexOf('ip-section-tabs')).toBeGreaterThan(html.indexOf('<h2>Deployment targets</h2>'));
  });

  test('Tentacle/Kubernetes is a segmented control, subordinate to the section tabs', () => {
    const html = Views.renderAgents(full);
    expect(html).toContain('ip-kind-btn');
    expect(html).toMatch(/ip-kind-btn[^>]*data-tab="tentacle"/);
    expect(html).toMatch(/ip-kind-btn[^>]*data-tab="kubernetes"/);
    // bindAgents binds .ip-kind-btn; a leftover .ip-tab button here would swallow tab
    // navigation clicks and re-render Agents in place instead of routing.
    expect(html).not.toMatch(/<button[^>]*class="ip-tab/);
  });

  test('the agent-kind choice still switches which group is shown', () => {
    const t = Views.renderAgents({ ...full, agentTab:'tentacle' });
    const k = Views.renderAgents({ ...full, agentTab:'kubernetes' });
    expect(t).toMatch(/ip-kind-btn ip-kind-active"[^>]*data-tab="tentacle"/);
    expect(k).toMatch(/ip-kind-btn ip-kind-active"[^>]*data-tab="kubernetes"/);
  });

  // .ip-seg is the Environments mode button. The agent-kind control briefly reused it as a
  // container class, which left the two CSS rules overwriting each other's background and
  // border. Keep the two vocabularies disjoint.
  test('the agent-kind control does not reuse the Environments .ip-seg class', () => {
    expect(Views.renderAgents(full)).not.toMatch(/class="ip-seg[ "]/);
  });

  test('each segmented-control class is defined exactly once in the stylesheet', () => {
    const fs = require('fs');
    const css = fs.readFileSync(require('path').join(__dirname, 'styles.css'), 'utf8');
    const defs = sel => (css.match(new RegExp('^\\' + sel + '\\{', 'gm')) || []).length;
    expect(defs('.ip-seg')).toBe(1);
    expect(defs('.ip-kind-seg')).toBe(1);
  });
});

// The Environments view expands into a per-environment target sub-list. The target name was
// plain text there, while the same name in the Targets table linked to its detail page.
describe('environments sub-list links its targets', () => {
  const Views = require('./views');
  const d = require('./data');
  global.Data = d;
  const t = (id, name, healthKey) => ({ id, name, spaceId:'Spaces-1', type:'Tentacle',
    kind:'Tentacle (Polling)', os:'Ubuntu', osVersion:'22.04', health:healthKey,
    healthKey, env:'Production', envCat:'production', tag:'web', moreTags:0,
    tenant:'No tenants', policy:'Default', version:'8.5.1' });
  const targets = [t('Machines-1','web-prod-01','healthy'), t('Machines-2','db-prod-01','unhealthy')];
  const IP = () => ({ serverUrl:'https://x.octopus.app/', envMode:'all', envQuery:'',
    envExpanded:{ Production:'all' },
    estate:{ targets, workers:[], environments:[{ id:'Environments-1', name:'Production' }], policies:[] } });

  test('an expanded environment links each target to its detail page', () => {
    const html = Views.renderEnvironments(IP());
    expect(html).toContain('href="#targets/Machines-1"');
    expect(html).toContain('href="#targets/Machines-2"');
    expect(html).toContain('ip-target-link');
  });

  test('the link is inside the sub-list row, not the environment row', () => {
    const html = Views.renderEnvironments(IP());
    const sub = /<tr class="ip-env-sub">([\s\S]*?)<\/tr>\s*<\/tbody>|<tr class="ip-env-sub">([\s\S]*)/
      .exec(html);
    expect((sub[1] || sub[2])).toContain('href="#targets/Machines-1"');
  });

  test('a collapsed environment renders no target links', () => {
    const collapsed = { ...IP(), envExpanded:{} };
    expect(Views.renderEnvironments(collapsed)).not.toContain('href="#targets/');
  });

  test('an id needing escaping is encoded', () => {
    const odd = { ...IP(), estate: { ...IP().estate, targets:[t('Machines-a b','odd','healthy')] } };
    expect(Views.renderEnvironments(odd)).toContain('href="#targets/Machines-a%20b"');
  });

  // The sub-list table is nested inside a .ip-heatmap cell, so the heatmap's link-neutralising
  // rule reached it as a descendant and rendered the linked names as plain label text.
  test('the heatmap link reset cannot reach the nested sub-list', () => {
    const fs = require('fs');
    const css = fs.readFileSync(require('path').join(__dirname, 'styles.css'), 'utf8');
    const resets = css.match(/^\.ip-heatmap[^{]*td:first-child[^{]*a[^{]*\{[^}]*\}/gm) || [];
    expect(resets.length).toBeGreaterThan(0);
    resets.forEach(rule => expect(rule).toMatch(/td:first-child\s*>\s*a/));
  });

  test('a target with no id stays plain text rather than linking nowhere', () => {
    const noId = { ...IP(), estate: { ...IP().estate, targets:[t('','no-id','healthy')] } };
    const html = Views.renderEnvironments(noId);
    expect(html).toContain('no-id');
    expect(html).not.toContain('href="#targets/"');
  });
});

// The agent table identified a machine by name only, and the name wasn't clickable — the row
// model dropped the machine id and OS fields that machineToTarget already carries.
describe('agent table carries machine identity', () => {
  const d = require('./data');
  const Views = require('./views');
  global.Data = d;
  const t = (over) => Object.assign({
    id:'Machines-1', name:'web-prod-01', spaceId:'Spaces-1', type:'Tentacle',
    kind:'Tentacle (Listening)', os:'Microsoft Windows Server 2022', osVersion:'10.0.20348',
    health:'Healthy', healthKey:'healthy', env:'Production', envCat:'production', tag:'web',
    moreTags:0, tenant:'No tenants', policy:'Auto-upgrade', version:'8.5.1' }, over || {});

  test('the row model keeps the machine id and OS fields', () => {
    const row = d.agentsModel([t()]).tentacle.rows[0];
    expect(row).toMatchObject({ id:'Machines-1', name:'web-prod-01',
      os:'Microsoft Windows Server 2022', osVersion:'10.0.20348' });
  });

  test('the machine name links to its detail page, the way the targets table does', () => {
    const html = Views.renderAgents({ serverUrl:'https://x.octopus.app/', agentTab:'tentacle',
      estate:{ targets:[t()], workers:[], environments:[], policies:[] } });
    expect(html).toContain('href="#targets/Machines-1"');
    expect(html).toContain('ip-target-link');
  });

  test('an id needing escaping is encoded in the href', () => {
    const html = Views.renderAgents({ serverUrl:'https://x.octopus.app/', agentTab:'tentacle',
      estate:{ targets:[t({ id:'Machines-a b' })], workers:[], environments:[], policies:[] } });
    expect(html).toContain('href="#targets/Machines-a%20b"');
  });

  test('the OS and OS version reach the rendered row', () => {
    const html = Views.renderAgents({ serverUrl:'https://x.octopus.app/', agentTab:'tentacle',
      estate:{ targets:[t()], workers:[], environments:[], policies:[] } });
    expect(html).toContain('Microsoft Windows Server 2022');
    expect(html).toContain('10.0.20348');
  });

  test('columns are headed to match the targets table vocabulary', () => {
    const html = Views.renderAgents({ serverUrl:'https://x.octopus.app/', agentTab:'tentacle',
      estate:{ targets:[t()], workers:[], environments:[], policies:[] } });
    ['<th>Machine name</th>','<th>Environment</th>','<th>Operating system</th>',
     '<th>OS version</th>','<th>Agent version</th>','<th>Status</th>','<th>Machine policy</th>']
      .forEach(th => expect(html).toContain(th));
    // "Version" alone is ambiguous once OS version is in the table
    expect(html).not.toContain('<th>Version</th>');
  });

  test('a machine with no reported OS leaves the cells blank, not "Unknown"', () => {
    const html = Views.renderAgents({ serverUrl:'https://x.octopus.app/', agentTab:'kubernetes',
      estate:{ targets:[t({ type:'Kubernetes', kind:'Kubernetes Agent', os:'', osVersion:'',
        version:'2.6.0' })], workers:[], environments:[], policies:[] } });
    // scoped to the row: "Unknown" is also a KPI card heading (the unknown-version bucket)
    const row = /<tr class="ip-row-static">([\s\S]*?)<\/tr>/.exec(html)[1];
    expect(row).not.toMatch(/Unknown/);
    expect(row).toContain('<td></td><td></td>');       // OS and OS version, both empty
    expect(row).toContain('href="#targets/Machines-1"');
  });
});

// The overview ring drew one green arc against a grey remainder, so unhealthy and disabled
// targets shared an undifferentiated track — while the health-by-type bars beside it were
// already green/red/slate. The ring now segments the same way.
describe('overview ring segments unhealthy in red', () => {
  const Views = require('./views');
  const arcs = svg => [...svg.matchAll(/stroke="(var\(--color-[a-z]+-\d+\))"/g)].map(m => m[1]);

  test('unhealthy targets get their own red arc', () => {
    const svg = Views.donut({ healthy:10, unhealthy:3, disabled:1, healthyPct:71 });
    expect(arcs(svg)).toEqual([
      'var(--color-green-400)', 'var(--color-red-400)', 'var(--color-slate-300)']);
  });

  test('the ring uses the same colours as the health bar', () => {
    const ring = arcs(Views.donut({ healthy:7, unhealthy:2, disabled:1 }));
    const bar = [...Views.healthBar(7, 2, 1).matchAll(/background:(var\(--color-[a-z]+-\d+\))/g)].map(m => m[1]);
    expect(ring).toEqual(bar);
  });

  test('arc lengths are proportional to the counts, and fill the ring exactly', () => {
    const svg = Views.donut({ healthy:10, unhealthy:3, disabled:1 });
    const lens = [...svg.matchAll(/stroke-dasharray="([\d.]+) ([\d.]+)"/g)]
      .map(m => ({ len: parseFloat(m[1]), circ: parseFloat(m[2]) }));
    const C = lens[0].circ;
    expect(lens.map(l => Math.round(l.len / C * 100))).toEqual([71, 21, 7]);
    expect(lens.reduce((s, l) => s + l.len, 0)).toBeCloseTo(C, 1);
  });

  test('segments are laid end to end, each offset by what precedes it', () => {
    const svg = Views.donut({ healthy:10, unhealthy:3, disabled:1 });
    const offs = [...svg.matchAll(/stroke-dashoffset="(-?[\d.]+)"/g)].map(m => parseFloat(m[1]));
    const lens = [...svg.matchAll(/stroke-dasharray="([\d.]+) /g)].map(m => parseFloat(m[1]));
    expect(offs[0]).toBe(0);
    expect(offs[1]).toBeCloseTo(-lens[0], 1);
    expect(offs[2]).toBeCloseTo(-(lens[0] + lens[1]), 1);
  });

  test('a bucket with nothing in it draws no arc', () => {
    expect(arcs(Views.donut({ healthy:12, unhealthy:0, disabled:0 })))
      .toEqual(['var(--color-green-400)']);
    expect(arcs(Views.donut({ healthy:0, unhealthy:4, disabled:0 })))
      .toEqual(['var(--color-red-400)']);
  });

  test('an empty estate draws the bare track and reads 0%', () => {
    const svg = Views.donut({ healthy:0, unhealthy:0, disabled:0 });
    expect(arcs(svg)).toEqual([]);
    expect(svg).toContain('>0%<');
    expect(svg).toContain('var(--muted)');            // the track is still there
  });

  test('healthyPct is honoured when given, derived when not', () => {
    expect(Views.donut({ healthy:10, unhealthy:3, disabled:1, healthyPct:71 })).toContain('>71%<');
    expect(Views.donut({ healthy:1, unhealthy:1, disabled:0 })).toContain('>50%<');
  });

  test('the overview passes the counts through, not just the percentage', () => {
    global.Data = require('./data');
    const d = require('./data');
    const t = (name, healthKey) => ({ id:name, name, type:'Tentacle', kind:'Tentacle (Polling)', os:'', osVersion:'',
      health:healthKey, healthKey, env:'Production', envCat:'production', tag:'web', moreTags:0,
      tenant:'No tenants', policy:'Default', version:'8.5.1' });
    const targets = [t('a','healthy'), t('b','unhealthy'), t('c','disabled')];
    const ov = d.overviewModel(targets, []);
    const html = Views.renderOverview(ov, { targets, workers:[], environments:[], policies:[] });
    expect(html).toContain('var(--color-red-400)');   // the ring, not only the type bars
    expect(html.match(/var\(--color-red-400\)/g).length).toBeGreaterThan(1);
  });
});

// Paul's five-item sidebar (28 Jul walkthrough) gained a sixth on 14 Aug when
// Releases was added. That reopens a decision Paul made, so the count is
// asserted explicitly rather than loosely — if someone adds a seventh without
// a conversation, this fails and the conversation happens.
describe('sidebar composition', () => {
  const fs = require('fs');
  const html = fs.readFileSync(require('path').join(__dirname, 'index.html'), 'utf8');
  const items = [...html.matchAll(/class="ip-nav-item" data-view="([^"]+)">([^<]+)</g)]
    .map(m => ({ view:m[1], label:m[2] }));

  test('Projects leads, then Paul\'s five in his order, then Tenants', () => {
    expect(items.map(i => i.view)).toEqual(
      ['projects','overview','targets','environments','workers','argocd','tenants']);
  });
  test('Projects sits above the Infrastructure heading', () => {
    expect(html.indexOf('data-view="projects"')).toBeLessThan(html.indexOf('ip-sidebar-title'));
  });

  test('Machine Policies and Deployment Agents are no longer nav destinations', () => {
    expect(items.map(i => i.view)).not.toContain('machinepolicies');
    expect(items.map(i => i.view)).not.toContain('agents');
    expect(html).not.toContain('>Machine Policies<');
    expect(html).not.toContain('>Deployment Agents<');
  });

  test('every nav item still has a route to render it', () => {
    const router = fs.readFileSync(require('path').join(__dirname, 'router.js'), 'utf8');
    const views = /const VIEWS = \[([^\]]+)\]/.exec(router)[1];
    items.forEach(i => expect(views).toContain("'" + i.view + "'"));
    // the demoted views keep their routes — they're reached by tab now, and the overview's
    // agent-versions pill still links straight to #agents
    expect(views).toContain("'agents'");
    expect(views).toContain("'machinepolicies'");
  });
});

describe('Releases — state mapping', () => {
  const data = require('./data');
  test('queued and executing both read as in flight', () => {
    expect(data.releaseStateKey('Queued')).toBe('running');
    expect(data.releaseStateKey('Executing')).toBe('running');
  });
  test('cancelled and timed out stay distinct from failed', () => {
    expect(data.releaseStateKey('Failed')).toBe('failed');
    expect(data.releaseStateKey('TimedOut')).toBe('timedout');
    expect(data.releaseStateKey('Canceled')).toBe('cancelled');
  });
  test('an unrecognised state degrades to unknown rather than success', () => {
    expect(data.releaseStateKey('Something')).toBe('unknown');
    expect(data.releaseStateKey(undefined)).toBe('unknown');
  });
});

describe('Releases — link tone between environments', () => {
  const data = require('./data');
  test('a shared release reads as strong', () => {
    expect(data.linkTone(['9.1'], ['9.1'])).toBe('strong');
    expect(data.linkTone(['9.1', '9.0'], ['9.0'])).toBe('strong');
  });
  test('different releases read as drifted', () => {
    expect(data.linkTone(['9.3'], ['9.1'])).toBe('pale');
  });
  test('an empty side draws no line at all', () => {
    expect(data.linkTone([], ['9.1'])).toBe('none');
    expect(data.linkTone(['9.1'], [])).toBe('none');
  });
});

describe('Releases — model', () => {
  const data = require('./data');
  const base = {
    Environments: [{ Id: 'E1', Name: 'Dev' }, { Id: 'E2', Name: 'Test' }, { Id: 'E3', Name: 'Prod' }],
    Projects: [{ Id: 'P1', Name: 'Portal', Slug: 'portal', ProjectGroupId: 'G1' }],
    ProjectGroups: [{ Id: 'G1', Name: 'Cloud Platform' }],
    Tenants: [{ Id: 'T1', Name: 'Acme' }, { Id: 'T2', Name: 'Globex' }],
    ProjectLimit: 200,
    IsFiltered: false,
    Items: []
  };
  const withItems = items => Object.assign({}, base, { Items: items });

  test('an empty payload yields no projects and does not throw', () => {
    const m = data.releasesModel({});
    expect(m.projects).toEqual([]);
    expect(m.environments).toEqual([]);
  });

  test('only current deployments are counted', () => {
    const m = data.releasesModel(withItems([
      { IsCurrent: true, ProjectId: 'P1', EnvironmentId: 'E1', ReleaseVersion: '9.3', State: 'Success' },
      { IsCurrent: false, ProjectId: 'P1', EnvironmentId: 'E1', ReleaseVersion: '8.0', State: 'Success' }
    ]));
    expect(m.projects[0].cells[0].entries.map(e => e.version)).toEqual(['9.3']);
  });

  test('a tenant split leaves two releases live in one environment', () => {
    const m = data.releasesModel(withItems([
      { IsCurrent: true, ProjectId: 'P1', EnvironmentId: 'E3', ReleaseVersion: '9.1', State: 'Success', TenantId: 'T1', CompletedTime: '2026-08-14T02:00:00Z' },
      { IsCurrent: true, ProjectId: 'P1', EnvironmentId: 'E3', ReleaseVersion: '9.0', State: 'Success', TenantId: 'T2', CompletedTime: '2026-08-12T02:00:00Z' }
    ]));
    const prod = m.projects[0].cells.find(c => c.envName === 'Prod').entries;
    expect(prod.map(e => e.version)).toEqual(['9.1', '9.0']);
    expect(prod[0].tenantCount).toBe(1);
    expect(prod[0].tenantNames).toEqual(['Acme']);
  });

  test('the most recent deployment decides the environment state', () => {
    const m = data.releasesModel(withItems([
      { IsCurrent: true, ProjectId: 'P1', EnvironmentId: 'E1', ReleaseVersion: '9.3', State: 'Success', CompletedTime: '2026-08-14T01:00:00Z' },
      { IsCurrent: true, ProjectId: 'P1', EnvironmentId: 'E1', ReleaseVersion: '9.3', State: 'Executing', CompletedTime: '2026-08-14T03:00:00Z' }
    ]));
    expect(m.projects[0].cells[0].entries[0].stateKey).toBe('running');
  });

  test('links describe drift across the row', () => {
    const m = data.releasesModel(withItems([
      { IsCurrent: true, ProjectId: 'P1', EnvironmentId: 'E1', ReleaseVersion: '9.3', State: 'Success' },
      { IsCurrent: true, ProjectId: 'P1', EnvironmentId: 'E2', ReleaseVersion: '9.1', State: 'Success' },
      { IsCurrent: true, ProjectId: 'P1', EnvironmentId: 'E3', ReleaseVersion: '9.1', State: 'Success' }
    ]));
    expect(m.projects[0].links).toEqual([null, 'pale', 'strong']);
  });

  test('an environment nothing has reached is dropped from the group, and named', () => {
    const m = data.releasesModel(withItems([
      { IsCurrent: true, ProjectId: 'P1', EnvironmentId: 'E1', ReleaseVersion: '9.3', State: 'Success' }
    ]));
    const g = m.groups[0];
    expect(g.environments.map(e => e.name)).toEqual(['Dev']);
    expect(g.hiddenEnvironments.map(e => e.name)).toEqual(['Test', 'Prod']);
  });

  test('a gap for one project still shows while another project uses that environment', () => {
    const two = Object.assign({}, base, {
      Projects: [{ Id: 'P1', Name: 'Alpha' }, { Id: 'P2', Name: 'Beta' }],
      Items: [
        { IsCurrent: true, ProjectId: 'P1', EnvironmentId: 'E1', ReleaseVersion: '9.3', State: 'Success' },
        { IsCurrent: true, ProjectId: 'P2', EnvironmentId: 'E3', ReleaseVersion: '2.0', State: 'Success' }
      ]
    });
    const m = data.releasesModel(two);
    // E2 is used by nobody and goes; E1 and E3 stay, so Alpha keeps an empty Prod cell.
    expect(m.environments.map(e => e.name)).toEqual(['Dev', 'Prod']);
    expect(m.projects[0].cells[1].entries).toEqual([]);
    expect(m.projects[0].links[1]).toBe('none');
  });

  test('the hidden environments are reported in the view', () => {
    const Views = require('./views');
    const m = data.releasesModel(withItems([
      { IsCurrent: true, ProjectId: 'P1', EnvironmentId: 'E1', ReleaseVersion: '9.3', State: 'Success' }
    ]));
    const html = Views.renderProjects({ releases: { status: 'ready', model: m } });
    expect(html).toContain('this group has never deployed to them');
    expect(html).toContain('Test, Prod');
  });

  test('a capped project list is reported, not silently truncated', () => {
    const capped = Object.assign({}, base, {
      ProjectLimit: 1,
      Projects: [{ Id: 'P1', Name: 'Portal' }],
      Items: []
    });
    expect(data.releasesModel(capped).truncated.capped).toBe(true);
    expect(data.releasesModel(base).truncated.capped).toBe(false);
  });

  test('a filtered dashboard is reported', () => {
    const filtered = Object.assign({}, base, { IsFiltered: true });
    expect(data.releasesModel(filtered).truncated.isFiltered).toBe(true);
  });

  test('projects are ordered by name', () => {
    const two = Object.assign({}, base, {
      Projects: [{ Id: 'P2', Name: 'Zebra' }, { Id: 'P1', Name: 'Alpha' }]
    });
    expect(data.releasesModel(two).projects.map(p => p.name)).toEqual(['Alpha', 'Zebra']);
  });
});

describe('Releases — many releases live in one environment', () => {
  const data = require('./data');
  const Views = require('./views');
  // Cloud Platform has a cell holding 41 distinct versions across its tenants.
  const many = {
    Environments: [{ Id: 'E1', Name: 'Production' }],
    Projects: [{ Id: 'P1', Name: 'Tenanted' }],
    Tenants: Array.from({ length: 41 }, (_, i) => ({ Id: 'T' + i, Name: 'Tenant ' + i })),
    Items: Array.from({ length: 41 }, (_, i) => ({
      IsCurrent: true, ProjectId: 'P1', EnvironmentId: 'E1',
      ReleaseVersion: '1.' + i, State: 'Success', TenantId: 'T' + i,
      CompletedTime: '2026-08-' + String(10 + (i % 4)).padStart(2, '0') + 'T00:00:00Z'
    }))
  };
  test('the model keeps every version and reports the spread', () => {
    const cell = data.releasesModel(many).projects[0].cells[0];
    expect(cell.versionCount).toBe(41);
    expect(cell.tenantTotal).toBe(41);
  });
  test('the view names a few and summarises the rest', () => {
    const html = Views.renderProjects({ releases: { status: 'ready', model: data.releasesModel(many) } });
    // The tail reports the tenants it covers, which is the actionable half.
    expect(html).toContain('+38 more releases on 38 tenants');
    // Three named, not forty-one.
    expect((html.match(/ip-rel-ver/g) || []).length).toBe(3);
  });
  test('a single release needs no summary line', () => {
    const one = Object.assign({}, many, { Items: many.Items.slice(0, 1) });
    const html = Views.renderProjects({ releases: { status: 'ready', model: data.releasesModel(one) } });
    expect(html).not.toContain('ip-rel-more');
  });
});

describe('Releases — project groups', () => {
  const data = require('./data');
  const Views = require('./views');
  const payload = {
    Environments: [{ Id: 'E1', Name: 'Dev' }, { Id: 'E2', Name: 'Preprod' }, { Id: 'E3', Name: 'Prod' }],
    ProjectGroups: [{ Id: 'G1', Name: 'Cloud' }, { Id: 'G2', Name: 'Tools' }],
    Projects: [
      { Id: 'P1', Name: 'Portal', ProjectGroupId: 'G1' },
      { Id: 'P2', Name: 'Hub', ProjectGroupId: 'G1' },
      { Id: 'P3', Name: 'Script', ProjectGroupId: 'G2' }
    ],
    Items: [
      { IsCurrent: true, ProjectId: 'P1', EnvironmentId: 'E1', ReleaseVersion: '9.3', State: 'Success' },
      { IsCurrent: true, ProjectId: 'P2', EnvironmentId: 'E3', ReleaseVersion: '4.1', State: 'Success' },
      { IsCurrent: true, ProjectId: 'P3', EnvironmentId: 'E1', ReleaseVersion: '1.0', State: 'Success' }
    ]
  };

  test('projects are grouped, groups and members ordered by name', () => {
    const m = data.releasesModel(payload);
    expect(m.groups.map(g => g.name)).toEqual(['Cloud', 'Tools']);
    expect(m.groups[0].projects.map(p => p.name)).toEqual(['Hub', 'Portal']);
  });

  test('each group hides the environments it has never deployed to', () => {
    const m = data.releasesModel(payload);
    expect(m.groups[0].environments.map(e => e.name)).toEqual(['Dev', 'Prod']);
    expect(m.groups[0].hiddenEnvironments.map(e => e.name)).toEqual(['Preprod']);
    // Tools only ever touched Dev, so it carries one column, not Cloud's two.
    expect(m.groups[1].environments.map(e => e.name)).toEqual(['Dev']);
  });

  test('a project keeps a gap for an environment its group uses but it does not', () => {
    const m = data.releasesModel(payload);
    const hub = m.groups[0].projects.find(p => p.name === 'Hub');
    expect(hub.cells.map(c => c.envName)).toEqual(['Dev', 'Prod']);
    expect(hub.cells[0].entries).toEqual([]);
  });

  test('a project with no group falls under Ungrouped rather than vanishing', () => {
    const orphan = Object.assign({}, payload, {
      Projects: [{ Id: 'P9', Name: 'Loose' }],
      Items: [{ IsCurrent: true, ProjectId: 'P9', EnvironmentId: 'E1', ReleaseVersion: '1.0', State: 'Success' }]
    });
    const m = data.releasesModel(orphan);
    expect(m.groups.map(g => g.name)).toEqual(['Ungrouped']);
    expect(m.projects.map(p => p.name)).toEqual(['Loose']);
  });

  test('the view renders a grid per group and names each hidden environment', () => {
    const html = Views.renderProjects({ releases: { status: 'ready', model: data.releasesModel(payload) } });
    expect((html.match(/ip-rel-grid/g) || []).length).toBe(2);
    expect(html).toContain('Cloud');
    expect(html).toContain('this group has never deployed to them: Preprod');
  });
});

describe('Project history — progression model', () => {
  const data = require('./data');
  const grid = [{ id: 'E1', name: 'Dev' }, { id: 'E2', name: 'Prod' }];
  const prog = {
    Releases: [
      { Release: { Id: 'R4', Version: '2.4', ChannelId: 'C1', Assembled: '2026-08-14T00:00:00Z' },
        Channel: { Id: 'C1', Name: 'Main' }, Deployments: {} },
      { Release: { Id: 'R3', Version: '9.9-pre', ChannelId: 'C2', Assembled: '2026-08-13T00:00:00Z' },
        Channel: { Id: 'C2', Name: 'Pre-Release' }, Deployments: {
          E1: [{ State: 'Success', CompletedTime: '2026-08-13T01:00:00Z' }] } },
      { Release: { Id: 'R2', Version: '2.3', ChannelId: 'C1', Assembled: '2026-08-12T00:00:00Z' },
        Channel: { Id: 'C1', Name: 'Main' }, Deployments: {
          E1: [{ State: 'Success', CompletedTime: '2026-08-12T01:00:00Z' }],
          E2: [{ State: 'Failed', CompletedTime: '2026-08-12T02:00:00Z' }] } }
    ]
  };

  test('lag counts within a channel, not across the whole list', () => {
    const m = data.progressionModel(prog, grid);
    const byVer = Object.fromEntries(m.releases.map(r => [r.version, r]));
    expect(byVer['2.4'].lag).toBe(0);          // newest in Main
    expect(byVer['9.9-pre'].lag).toBe(0);      // newest in Pre-Release, not "1 behind"
    expect(byVer['2.3'].lag).toBe(1);          // one Main release ahead of it
  });

  test('cells follow the grid columns so an expanded row lines up', () => {
    const m = data.progressionModel(prog, grid);
    expect(m.releases[0].cells.map(c => c.envName)).toEqual(['Dev', 'Prod']);
  });

  test('a release created and never deployed is kept and marked', () => {
    const m = data.progressionModel(prog, grid);
    const never = m.releases.find(r => r.version === '2.4');
    expect(never.everDeployed).toBe(false);
    expect(never.frontier).toBe(-1);
    expect(m.neverDeployedCount).toBe(1);
  });

  test('the furthest environment reached becomes the frontier', () => {
    const m = data.progressionModel(prog, grid);
    const full = m.releases.find(r => r.version === '2.3');
    expect(full.frontier).toBe(1);
    expect(full.cells[1].stateKey).toBe('failed');
  });

  test('channels present are listed', () => {
    expect(data.progressionModel(prog, grid).channels.sort()).toEqual(['Main', 'Pre-Release']);
  });

  test('an empty payload yields no releases and does not throw', () => {
    expect(data.progressionModel({}, grid).releases).toEqual([]);
  });
});

describe('Project history — window', () => {
  const data = require('./data');
  const grid = [{ id: 'E1', name: 'Dev' }, { id: 'E2', name: 'Prod' }];
  const NOW = Date.parse('2026-08-14T12:00:00Z');
  const hoursAgo = h => new Date(NOW - h * 3600000).toISOString();
  const prog = {
    Releases: [
      { Release: { Id: 'R3', Version: '3.0', ChannelId: 'C1', Assembled: hoursAgo(2) },
        Channel: { Id: 'C1', Name: 'Main' }, Deployments: {} },
      { Release: { Id: 'R2', Version: '2.0', ChannelId: 'C1', Assembled: hoursAgo(72) },
        Channel: { Id: 'C1', Name: 'Main' }, Deployments: {} },
      // Cut long ago, promoted an hour ago — recent news despite an old birthday.
      { Release: { Id: 'R1', Version: '1.0', ChannelId: 'C1', Assembled: hoursAgo(800) },
        Channel: { Id: 'C1', Name: 'Main' },
        Deployments: { E2: [{ State: 'Success', CompletedTime: hoursAgo(1) }] } }
    ]
  };

  test('24 hours keeps what was created or moved inside it', () => {
    const m = data.progressionModel(prog, grid, 24, NOW);
    expect(m.releases.map(r => r.version).sort()).toEqual(['1.0', '3.0']);
    expect(m.hiddenByWindow).toBe(1);
  });

  test('7 days widens to everything created inside it', () => {
    const m = data.progressionModel(prog, grid, 24 * 7, NOW);
    expect(m.releases).toHaveLength(3);
    expect(m.hiddenByWindow).toBe(0);
  });

  test('no window keeps the lot', () => {
    const m = data.progressionModel(prog, grid, null, NOW);
    expect(m.releases).toHaveLength(3);
  });

  test('totalReleases reports the unfiltered count so an empty window can explain itself', () => {
    // Half an hour excludes even the deployment made an hour ago.
    const m = data.progressionModel(prog, grid, 0.5, NOW);
    expect(m.releases).toHaveLength(0);
    expect(m.totalReleases).toBe(3);
  });

  test('lag is counted before the window filter, so it stays true', () => {
    const m = data.progressionModel(prog, grid, 24, NOW);
    expect(m.releases.find(r => r.version === '1.0').lag).toBe(2);
  });

  test('the window options are 24 hours, 7 days and All', () => {
    expect(data.HISTORY_WINDOWS.map(w => w.label)).toEqual(['24 hours', '7 days', 'All']);
  });
});

describe('Projects — column geometry', () => {
  const data = require('./data');
  const Views = require('./views');
  const payload = {
    Environments: [{ Id: 'E1', Name: 'Dev' }, { Id: 'E2', Name: 'Prod' }],
    ProjectGroups: [{ Id: 'G1', Name: 'Cloud' }, { Id: 'G2', Name: 'Tools' }],
    Projects: [{ Id: 'P1', Name: 'Portal', ProjectGroupId: 'G1' }, { Id: 'P2', Name: 'Script', ProjectGroupId: 'G2' }],
    Items: [
      { IsCurrent: true, ProjectId: 'P1', EnvironmentId: 'E1', ReleaseVersion: '9.3', State: 'Success' },
      { IsCurrent: true, ProjectId: 'P1', EnvironmentId: 'E2', ReleaseVersion: '9.3', State: 'Success' },
      { IsCurrent: true, ProjectId: 'P2', EnvironmentId: 'E1', ReleaseVersion: '1.0', State: 'Success' }
    ]
  };
  test('columns are a share of the page, never a stretching fraction per group', () => {
    const html = Views.renderProjects({ releases: { status: 'ready', model: data.releasesModel(payload) } });
    expect(html).toContain('var(--ip-rel-cols)');
    expect(html).not.toContain('minmax(0,1fr)');
  });
  test('the widest group sets the column count for the whole page', () => {
    const html = Views.renderProjects({ releases: { status: 'ready', model: data.releasesModel(payload) } });
    // Cloud has two environments, Tools one — both size against 2.
    expect(html).toContain('--ip-rel-cols:2');
    expect(html).toContain('repeat(2,calc((100% - var(--ip-rel-endgutter)) / var(--ip-rel-cols)))');
    expect(html).toContain('repeat(1,calc((100% - var(--ip-rel-endgutter)) / var(--ip-rel-cols)))');
  });
});

describe('Project history — the age on the line', () => {
  const data = require('./data');
  const Views = require('./views');
  const grid = [{ id: 'E1', name: 'Dev' }, { id: 'E2', name: 'Prod' }];
  // _relWhen reads the real clock, so this fixture is anchored to it rather than
  // to a fixed instant — otherwise the timestamps land in the future.
  const NOW = Date.now();
  const hoursAgo = h => new Date(NOW - h * 3600000).toISOString();

  test('the label shows when the release arrived, not when it was cut', () => {
    // Assembled a month ago, promoted to Production two hours ago. Inside a
    // 24-hour window because it moved; the label must say so.
    const prog = { Releases: [{
      Release: { Id: 'R1', Version: '1.0', ChannelId: 'C1', Assembled: hoursAgo(720) },
      Channel: { Id: 'C1', Name: 'Main' },
      Deployments: { E2: [{ State: 'Success', CompletedTime: hoursAgo(2) }] } }] };
    const m = data.progressionModel(prog, grid, 24, NOW);
    expect(m.releases).toHaveLength(1);
    const html = Views.renderProjects({
      projectOpen: { P1: true },
      projectHistory: { P1: { status: 'ready', model: m } },
      releases: { status: 'ready', model: { environments: grid, groups: [{ id: 'G', name: 'G',
        environments: grid, hiddenEnvironments: [],
        projects: [{ id: 'P1', name: 'P', cells: [{ envId:'E1', envName:'Dev', entries: [] },
          { envId:'E2', envName:'Prod', entries: [] }], links: [null, 'none'] }] }],
        projects: [{ id: 'P1' }], truncated: {} } }
    });
    expect(html).toContain('2h ago');
    expect(html).not.toContain('30d ago');
  });

  test('a release that never deployed still says when it was created', () => {
    const prog = { Releases: [{
      Release: { Id: 'R1', Version: '1.0', ChannelId: 'C1', Assembled: hoursAgo(3) },
      Channel: { Id: 'C1', Name: 'Main' }, Deployments: {} }] };
    const m = data.progressionModel(prog, grid, 24, NOW);
    expect(m.releases[0].everDeployed).toBe(false);
  });
});

describe('Projects — tenant split lives in the environment cell', () => {
  const data = require('./data');
  const Views = require('./views');
  const tenants = Array.from({ length: 20 }, (_, i) => ({ Id: 'T' + i, Name: 'Tenant ' + i }));
  const payload = {
    Environments: [{ Id: 'E1', Name: 'Production' }],
    ProjectGroups: [{ Id: 'G1', Name: 'Cloud' }],
    Projects: [{ Id: 'P1', Name: 'Octopus Server', ProjectGroupId: 'G1' }],
    Tenants: tenants,
    // 11 tenants on 9.3, 6 on 9.2, 3 on 9.0 — a rollout part-way through.
    Items: tenants.map((t, i) => ({
      IsCurrent: true, ProjectId: 'P1', EnvironmentId: 'E1',
      ReleaseVersion: i < 11 ? '9.3' : (i < 17 ? '9.2' : '9.0'),
      State: 'Success', TenantId: t.Id, CompletedTime: '2026-08-14T0' + (i % 5) + ':00:00Z'
    }))
  };
  const model = data.releasesModel(payload);
  const render = open => Views.renderProjects({
    projectOpen: open ? { P1: true } : {},
    projectHistory: { P1: { status: 'ready', model: { releases: [], totalReleases: 0, channels: [], environments: [] } } },
    releases: { status: 'ready', model }
  });

  test('the model keeps every version and its tenant count', () => {
    const cell = model.groups[0].projects[0].cells[0];
    expect(cell.versionCount).toBe(3);
    expect(cell.tenantTotal).toBe(20);
    expect(cell.entries.map(e => e.tenantCount).sort((a, b) => a - b)).toEqual([3, 6, 11]);
  });

  test('the contracted row carries a share bar per release', () => {
    const html = render(false);
    expect(html).toContain('ip-rel-entry-share');
    expect(html).toContain('ip-rel-tsbar');
    expect(html).toContain('width:55.0%');   // 11 of 20
  });

  test('a share row is one line: version, bar, count — and no status', () => {
    const failing = Object.assign({}, payload, {
      Items: payload.Items.map((it, i) => i === 0 ? Object.assign({}, it, { State: 'Failed' }) : it)
    });
    const html = Views.renderProjects({ projectOpen: {},
      releases: { status: 'ready', model: data.releasesModel(failing) } });
    // The node above carries the environment's state; the rollout rows answer
    // "how much of the estate", so they stay free of status chips.
    const cell = /<div class="ip-rel-cell has-split">[\s\S]*?<\/div><\/div>/.exec(html)[0];
    expect(cell).not.toContain('ip-rel-state');
    expect(cell).not.toContain('ip-rel-entry-head');
  });

  test('there is no separate tenant panel above the history', () => {
    expect(render(true)).not.toContain('ip-rel-tsblock');
  });

  test('expanding shows every release in the cell, contracted caps at three', () => {
    const many = Object.assign({}, payload, {
      Items: tenants.map((t, i) => ({
        IsCurrent: true, ProjectId: 'P1', EnvironmentId: 'E1',
        ReleaseVersion: 'v' + i, State: 'Success', TenantId: t.Id
      }))
    });
    const m2 = data.releasesModel(many);
    const shut = Views.renderProjects({ projectOpen: {}, releases: { status: 'ready', model: m2 } });
    const open = Views.renderProjects({ projectOpen: { P1: true },
      projectHistory: { P1: { status: 'ready', model: { releases: [], totalReleases: 0, channels: [], environments: [] } } },
      releases: { status: 'ready', model: m2 } });
    expect((shut.match(/ip-rel-entry-share/g) || []).length).toBe(3);
    expect((open.match(/ip-rel-entry-share/g) || []).length).toBe(20);
    expect(shut).toContain('+17 more releases on 17 tenants');
  });

  test('an environment on a single release draws no bar', () => {
    const single = Object.assign({}, payload, {
      Items: [{ IsCurrent: true, ProjectId: 'P1', EnvironmentId: 'E1', ReleaseVersion: '9.3', State: 'Success', TenantId: 'T0' }]
    });
    const html = Views.renderProjects({ projectOpen: {}, releases: { status: 'ready', model: data.releasesModel(single) } });
    expect(html).not.toContain('ip-rel-entry-share');
  });
});

describe('Projects — muting an environment', () => {
  const data = require('./data');
  const Views = require('./views');
  const grid = [{ id: 'E1', name: 'Branch Instances' }, { id: 'E2', name: 'Production' }];
  const model = {
    environments: grid,
    groups: [{ id: 'G1', name: 'Cloud', environments: grid, hiddenEnvironments: [],
      projects: [{ id: 'P1', name: 'Portal',
        cells: [{ envId: 'E1', envName: 'Branch Instances', entries: [], versionCount: 0, tenantTotal: 0 },
                { envId: 'E2', envName: 'Production', entries: [], versionCount: 0, tenantTotal: 0 }],
        links: [null, 'none'] }] }],
    projects: [{ id: 'P1' }], truncated: {}
  };
  // One release that only ever reached the noisy environment, one that reached Production.
  const history = { status: 'ready', model: {
    environments: grid, channels: ['Main'], totalReleases: 2, hiddenByWindow: 0, neverDeployedCount: 0,
    releases: [
      { version: 'noise.1', channelName: 'Main', assembled: null, lag: 0, everDeployed: true, frontier: 0,
        cells: [{ envId: 'E1', envName: 'Branch Instances', deployed: true, stateKey: 'success', stateLabel: 'Succeeded', when: null, tenantCount: 0, count: 1 },
                { envId: 'E2', envName: 'Production', deployed: false, stateKey: null, stateLabel: '', when: null, tenantCount: 0, count: 0 }] },
      { version: 'real.1', channelName: 'Main', assembled: null, lag: 0, everDeployed: true, frontier: 1,
        cells: [{ envId: 'E1', envName: 'Branch Instances', deployed: true, stateKey: 'success', stateLabel: 'Succeeded', when: null, tenantCount: 0, count: 1 },
                { envId: 'E2', envName: 'Production', deployed: true, stateKey: 'success', stateLabel: 'Succeeded', when: null, tenantCount: 0, count: 1 }] }
    ] } };
  const render = envOff => Views.renderProjects({
    projectOpen: { P1: true }, projectHistory: { P1: history },
    envOff: envOff, releases: { status: 'ready', model }
  });

  test('every environment has a switch, on by default', () => {
    const html = render(undefined);
    expect((html.match(/data-envtoggle=/g) || []).length).toBe(2);
    expect(html).not.toContain('aria-checked="false"');
  });

  test('muting drops releases that only reached the muted environment', () => {
    const html = render({ G1: { E1: true } });
    expect(html).toContain('real.1');
    expect(html).not.toContain('noise.1');
    expect(html).toContain('1 release only reached muted environments');
  });

  test('the muted column stays in place so nothing shifts', () => {
    const html = render({ G1: { E1: true } });
    expect(html).toContain('repeat(2,calc((100% - var(--ip-rel-endgutter)) / var(--ip-rel-cols)))');
    expect(html).toContain('ip-rel-hcell is-off');
  });

  test('the collapsed row still reports the muted environment', () => {
    const html = render({ G1: { E1: true } });
    // The grid answers "what is running where"; muting is a history filter.
    expect(html).toContain('Branch Instances');
    expect(html).toContain('aria-checked="false"');
  });

  test('muting everything says so rather than showing a blank panel', () => {
    const html = render({ G1: { E1: true, E2: true } });
    expect(html).toContain('only reached environments you have muted');
  });
});

describe('Feature flags — model', () => {
  const data = require('./data');
  const grid = [{ id: 'E1', name: 'Dev' }, { id: 'E2', name: 'Test' }, { id: 'E3', name: 'Prod' }];
  const payload = { total: 5, truncated: false, items: [
    { Id: 'F1', Name: 'on-everywhere', Environments: [
      { DeploymentEnvironmentId: 'E1', IsEnabled: true, RolloutPercentage: 100 },
      { DeploymentEnvironmentId: 'E3', IsEnabled: true, RolloutPercentage: 100 }] },
    { Id: 'F2', Name: 'partial', Environments: [
      { DeploymentEnvironmentId: 'E1', IsEnabled: true, RolloutPercentage: 100 },
      { DeploymentEnvironmentId: 'E3', IsEnabled: true, RolloutPercentage: 10 }] },
    { Id: 'F3', Name: 'mixed', Environments: [
      { DeploymentEnvironmentId: 'E1', IsEnabled: true, RolloutPercentage: 100 },
      { DeploymentEnvironmentId: 'E3', IsEnabled: false }] },
    { Id: 'F4', Name: 'no-overrides', Environments: [] },
    { Id: 'F5', Name: 'off-everywhere', Environments: [
      { DeploymentEnvironmentId: 'E1', IsEnabled: false }] }
  ] };

  test('only flags mid-journey get a row', () => {
    const m = data.featureFlagModel(payload, grid);
    expect(m.flags.map(f => f.name)).toEqual(['mixed', 'partial']);
  });

  test('the settled majority is counted, not drawn', () => {
    const m = data.featureFlagModel(payload, grid);
    expect(m.settled).toEqual({ onEverywhere: 1, offEverywhere: 1, noOverrides: 1 });
    expect(m.total).toBe(5);
  });

  test('a percentage between 0 and 100 is a partial rollout, 100 is not', () => {
    expect(data.flagEnvState({ IsEnabled: true, RolloutPercentage: 10 }).key).toBe('partial');
    expect(data.flagEnvState({ IsEnabled: true, RolloutPercentage: 100 }).key).toBe('on');
    expect(data.flagEnvState({ IsEnabled: false }).key).toBe('off');
    expect(data.flagEnvState(undefined).key).toBe('inherit');
  });

  test('an environment with no override inherits rather than reading as off', () => {
    const m = data.featureFlagModel(payload, grid);
    const partial = m.flags.find(f => f.name === 'partial');
    expect(partial.cells.map(c => c.state)).toEqual(['on', 'inherit', 'partial']);
  });

  test('cells follow the grid columns so a flag row lines up with the releases', () => {
    const m = data.featureFlagModel(payload, grid);
    expect(m.flags[0].cells.map(c => c.envName)).toEqual(['Dev', 'Test', 'Prod']);
  });

  test('an empty payload yields nothing and does not throw', () => {
    expect(data.featureFlagModel(undefined, grid).flags).toEqual([]);
  });
});

describe('Feature flags — view', () => {
  const data = require('./data');
  const Views = require('./views');
  const grid = [{ id: 'E1', name: 'Dev' }, { id: 'E3', name: 'Prod' }];
  const model = {
    environments: grid,
    groups: [{ id: 'G1', name: 'Cloud', environments: grid, hiddenEnvironments: [],
      projects: [{ id: 'P1', name: 'Portal',
        cells: grid.map(e => ({ envId: e.id, envName: e.name, entries: [], versionCount: 0, tenantTotal: 0 })),
        links: [null, 'none'] }] }],
    projects: [{ id: 'P1' }], truncated: {}
  };
  const flagPayload = { total: 3, truncated: false, items: [
    { Id: 'F2', Name: 'new-checkout', Environments: [
      { DeploymentEnvironmentId: 'E1', IsEnabled: true, RolloutPercentage: 100 },
      { DeploymentEnvironmentId: 'E3', IsEnabled: true, RolloutPercentage: 10 }] },
    { Id: 'F1', Name: 'settled', Environments: [
      { DeploymentEnvironmentId: 'E1', IsEnabled: true, RolloutPercentage: 100 }] },
    { Id: 'F3', Name: 'also-settled', Environments: [] }
  ] };
  const render = (flags, envOff) => Views.renderProjects({
    projectOpen: { P1: true },
    projectHistory: { P1: { status: 'ready', model: { releases: [], totalReleases: 0, channels: [], environments: grid } } },
    projectFlags: { P1: flags },
    envOff: envOff,
    releases: { status: 'ready', model }
  });

  test('an in-flight flag draws a row with its percentage', () => {
    const html = render({ status: 'ready', model: data.featureFlagModel(flagPayload, grid) });
    expect(html).toContain('Feature flags in flight');
    expect(html).toContain('new-checkout');
    expect(html).toContain('10%');
    expect(html).toContain('1 of 3');
  });

  test('the settled majority is reported as a count', () => {
    const html = render({ status: 'ready', model: data.featureFlagModel(flagPayload, grid) });
    expect(html).toContain('Not shown:');
    expect(html).toContain('1 on everywhere');
    expect(html).toContain('1 on their default');
  });

  test('flags do not borrow the deployment palette', () => {
    const html = render({ status: 'ready', model: data.featureFlagModel(flagPayload, grid) });
    const band = /<div class="ip-rel-band">[\s\S]*$/.exec(html)[0];
    expect(band).toContain('ip-rel-fnode');
    expect(band).not.toContain('ip-rel-node-healthy');
  });

  test('a project with no flags at all renders no band', () => {
    const html = render({ status: 'ready', model: { flags: [], total: 0, settled: {}, truncated: false } });
    expect(html).not.toContain('ip-rel-band');
  });

  test('muting an environment hides that column for flags too', () => {
    const html = render({ status: 'ready', model: data.featureFlagModel(flagPayload, grid) }, { G1: { E3: true } });
    const band = /<div class="ip-rel-band">[\s\S]*$/.exec(html)[0];
    expect(band).toContain('ip-rel-hcell is-off');
  });

  test('a flag read failure does not take the release history with it', () => {
    const html = render({ status: 'error', error: 'Feature flags could not be read for this project.' });
    expect(html).toContain('Feature flags could not be read');
    expect(html).toContain('ip-rel-history');
  });
});

describe('Flag changes — reconstructed from the audit trail', () => {
  const data = require('./data');
  const grid = [{ id: 'E1', name: 'Dev' }, { id: 'E3', name: 'Prod' }];
  const events = { Items: [
    { Id: 'Ev1', Occurred: '2026-08-14T03:00:00Z', ChangeDetails: {
      DocumentContext: { Name: 'new-checkout', Environments: [{ DeploymentEnvironmentId: 'E3', IsEnabled: true, RolloutPercentage: 0 }] },
      Differences: [{ op: 'replace', path: '/Environments/0', value: { DeploymentEnvironmentId: 'E3', IsEnabled: true, RolloutPercentage: 10 } }] } },
    { Id: 'Ev2', Occurred: '2026-08-14T01:00:00Z', ChangeDetails: {
      DocumentContext: { Name: 'new-checkout', Environments: [] },
      Differences: [{ op: 'add', path: '/Environments/0', value: { DeploymentEnvironmentId: 'E1', IsEnabled: true, RolloutPercentage: 100 } }] } },
    { Id: 'Ev3', Occurred: '2026-08-13T01:00:00Z', ChangeDetails: {
      DocumentContext: { Name: 'legacy', DefaultIsEnabled: false },
      Differences: [{ op: 'replace', path: '/DefaultIsEnabled', value: true }] } },
    // An override for an environment this project's grid does not show.
    { Id: 'Ev4', Occurred: '2026-08-14T02:00:00Z', ChangeDetails: {
      DocumentContext: { Name: 'elsewhere', Environments: [] },
      Differences: [{ op: 'add', path: '/Environments/0', value: { DeploymentEnvironmentId: 'E9', IsEnabled: true } }] } }
  ] };

  test('both ends of the arrow come out of context plus patch', () => {
    const c = data.flagChangeModel(events, grid, null, Date.now());
    const first = c.find(x => x.id.indexOf('Ev1') === 0);
    expect(data.flagChangeLabel(first)).toBe('0% → 10%');
  });

  test('an added override reads as "no override", not as off', () => {
    const c = data.flagChangeModel(events, grid, null, Date.now());
    const added = c.find(x => x.id.indexOf('Ev2') === 0);
    expect(added.before).toBeNull();
    expect(data.flagChangeLabel(added)).toBe('no override → On');
  });

  test('a default-level change is kept and marked as such', () => {
    const c = data.flagChangeModel(events, grid, null, Date.now());
    const def = c.find(x => x.scope === 'default');
    expect(def.flagName).toBe('legacy');
    expect(data.flagChangeLabel(def)).toBe('Off → On');
  });

  test('a change in an environment the grid does not show is dropped', () => {
    const c = data.flagChangeModel(events, grid, null, Date.now());
    expect(c.some(x => x.flagName === 'elsewhere')).toBe(false);
  });

  test('changes come back newest first', () => {
    const c = data.flagChangeModel(events, grid, null, Date.now());
    const times = c.map(x => x.occurred);
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  test('the window filters changes', () => {
    const now = Date.parse('2026-08-14T04:00:00Z');
    expect(data.flagChangeModel(events, grid, 2, now)).toHaveLength(1);   // only Ev1
    expect(data.flagChangeModel(events, grid, null, now).length).toBe(3); // Ev4 excluded by grid
  });

  test('an empty payload yields nothing and does not throw', () => {
    expect(data.flagChangeModel(undefined, grid, null, Date.now())).toEqual([]);
    expect(data.flagChangeModel({ Items: [] }, grid, null, Date.now())).toEqual([]);
  });
});

describe('Projects — grouping by time or type', () => {
  const data = require('./data');
  const Views = require('./views');
  const grid = [{ id: 'E1', name: 'Dev' }, { id: 'E3', name: 'Prod' }];
  const model = {
    environments: grid,
    groups: [{ id: 'G1', name: 'Cloud', environments: grid, hiddenEnvironments: [],
      projects: [{ id: 'P1', name: 'Portal',
        cells: grid.map(e => ({ envId: e.id, envName: e.name, entries: [], versionCount: 0, tenantTotal: 0 })),
        links: [null, 'none'] }] }],
    projects: [{ id: 'P1' }], truncated: {}
  };
  const history = { status: 'ready', model: {
    environments: grid, channels: ['Main'], totalReleases: 1, hiddenByWindow: 0, neverDeployedCount: 0,
    releases: [{ version: '9.3', channelName: 'Main', assembled: '2026-08-14T02:00:00Z', lag: 0,
      everDeployed: true, frontier: 1,
      cells: [{ envId: 'E1', envName: 'Dev', deployed: true, stateKey: 'success', stateLabel: 'Succeeded', when: '2026-08-14T02:00:00Z', tenantCount: 0, count: 1 },
              { envId: 'E3', envName: 'Prod', deployed: true, stateKey: 'success', stateLabel: 'Succeeded', when: '2026-08-14T02:30:00Z', tenantCount: 0, count: 1 }] }] } };
  const flags = { status: 'ready',
    model: { flags: [], total: 2, settled: { onEverywhere: 2 }, truncated: false },
    changes: [{ id: 'c1', flagName: 'new-checkout', scope: 'environment', envId: 'E3', envName: 'Prod',
      occurred: Date.parse('2026-08-14T02:45:00Z'), before: { key: 'partial', percent: 0 }, after: { key: 'partial', percent: 10 } }] };
  const render = grouping => Views.renderProjects({
    projectOpen: { P1: true }, projectHistory: { P1: history }, projectFlags: { P1: flags },
    grouping: grouping, releases: { status: 'ready', model }
  });

  test('the control offers Time and Type, defaulting to Time', () => {
    const html = Views.renderProjects({ releases: { status: 'ready', model } });
    expect(html).toContain('data-grouping="Time"');
    expect(html).toContain('data-grouping="Type"');
    expect(html).toContain('class="ip-seg active" data-grouping="Time"');
  });

  test('grouped by time, a flag change sits among the releases', () => {
    const html = render('Time');
    const body = /ip-rel-history-body[\s\S]*$/.exec(html)[0];
    // The change is more recent than the release, so it comes first.
    expect(body.indexOf('new-checkout')).toBeLessThan(body.indexOf('9.3'));
    expect(html).not.toContain('Flag changes');
  });

  test('grouped by type, changes get their own band instead', () => {
    const html = render('Type');
    expect(html).toContain('Flag changes');
    const body = /ip-rel-history-body[\s\S]*$/.exec(html)[0];
    expect(body.indexOf('9.3')).toBeLessThan(body.indexOf('new-checkout'));
  });

  test('current flag state survives both groupings', () => {
    expect(render('Time')).toContain('Not shown:');
    expect(render('Type')).toContain('Not shown:');
  });
});

describe('Flag rows are visually separated', () => {
  const data = require('./data');
  const Views = require('./views');
  const grid = [{ id: 'E1', name: 'Dev' }, { id: 'E3', name: 'Prod' }];
  const model = {
    environments: grid,
    groups: [{ id: 'G1', name: 'Cloud', environments: grid, hiddenEnvironments: [],
      projects: [{ id: 'P1', name: 'Portal',
        cells: grid.map(e => ({ envId: e.id, envName: e.name, entries: [], versionCount: 0, tenantTotal: 0 })),
        links: [null, 'none'] }] }],
    projects: [{ id: 'P1' }], truncated: {}
  };
  const flagPayload = { total: 1, truncated: false, items: [
    { Id: 'F1', Name: 'new-checkout', Environments: [
      { DeploymentEnvironmentId: 'E1', IsEnabled: true, RolloutPercentage: 100 },
      { DeploymentEnvironmentId: 'E3', IsEnabled: true, RolloutPercentage: 10 }] } ] };
  const html = Views.renderProjects({
    projectOpen: { P1: true },
    projectHistory: { P1: { status: 'ready', model: { releases: [], totalReleases: 0, channels: [], environments: grid } } },
    projectFlags: { P1: { status: 'ready', model: data.featureFlagModel(flagPayload, grid),
      changes: [{ id: 'c1', flagName: 'x', scope: 'environment', envId: 'E3', envName: 'Prod',
        occurred: Date.now(), before: { key: 'off', percent: null }, after: { key: 'on', percent: 100 } }] } },
    grouping: 'Type', releases: { status: 'ready', model }
  });

  test('flag rows carry the class the wash is attached to', () => {
    expect(html).toContain('ip-rel-hrow ip-rel-frow');
  });

  test('release rows do not', () => {
    // A release row is an ip-rel-hrow that is not an ip-rel-frow.
    expect(html).not.toContain('ip-rel-hrow ip-rel-hrow');
  });

  test('the wash is not the only signal a row is a flag', () => {
    // Square node, purple line and the flag name each survive without colour.
    expect(html).toContain('ip-rel-fnode');
    expect(html).toContain('ip-rel-flagname');
  });
});

describe('Variable changes — model', () => {
  const data = require('./data');
  const grid = [{ id: 'E1', name: 'Dev' }, { id: 'E3', name: 'Prod' }];
  const PLACEHOLDER = 'x'.repeat(45);
  const events = { Items: [
    { Id: 'V1', Occurred: '2026-08-14T03:00:00Z', ChangeDetails: {
      DocumentContext: { Variables: [{ Name: 'ApiTimeout', Value: '30s', Scope: { Environment: ['E3'] } }] },
      Differences: [{ op: 'replace', path: '/Variables/0/Value', value: '60s' }] } },
    { Id: 'V2', Occurred: '2026-08-14T02:00:00Z', ChangeDetails: {
      DocumentContext: { Variables: [{ Name: 'DbPassword', Type: 'Sensitive', Value: PLACEHOLDER, Scope: { Environment: ['E1', 'E3'] } }] },
      Differences: [{ op: 'replace', path: '/Variables/0/Value', value: 'y'.repeat(45) }] } },
    { Id: 'V3', Occurred: '2026-08-14T01:00:00Z', ChangeDetails: {
      DocumentContext: { Variables: [{ Name: 'Global', Value: 'a' }] },
      Differences: [{ op: 'replace', path: '/Variables/0/Value', value: 'b' }] } },
    { Id: 'V4', Occurred: '2026-08-14T00:30:00Z', ChangeDetails: {
      DocumentContext: { Variables: [{ Name: 'Elsewhere', Value: 'a', Scope: { Environment: ['E9'] } }] },
      Differences: [{ op: 'replace', path: '/Variables/0/Value', value: 'b' }] } },
    // Renames and description edits are not value changes and are ignored.
    { Id: 'V5', Occurred: '2026-08-14T00:15:00Z', ChangeDetails: {
      DocumentContext: { Variables: [{ Name: 'Renamed', Value: 'a' }] },
      Differences: [{ op: 'replace', path: '/Variables/0/Name', value: 'NewName' }] } }
  ] };
  const model = () => data.variableChangeModel(events, grid, null, Date.now());

  test('both ends of the arrow come from context plus patch', () => {
    const c = model().find(x => x.name === 'ApiTimeout');
    expect(data.variableChangeLabel(c)).toBe('30s → 60s');
  });

  test('a sensitive value never reaches the model, placeholder or not', () => {
    const c = model().find(x => x.name === 'DbPassword');
    expect(c.sensitive).toBe(true);
    expect(c.before).toBeNull();
    expect(c.after).toBeNull();
    expect(data.variableChangeLabel(c)).toBe('secret changed');
    expect(JSON.stringify(c)).not.toContain(PLACEHOLDER);
  });

  test('one edit scoped to two environments is one change marking both', () => {
    const c = model().find(x => x.name === 'DbPassword');
    expect(c.envIds).toEqual(['E1', 'E3']);
  });

  test('a variable with no environment scope applies everywhere', () => {
    const c = model().find(x => x.name === 'Global');
    expect(c.envIds).toEqual([]);
    expect(c.scopedElsewhere).toBe(false);
  });

  test('scoped to an environment this grid does not show is flagged, not silently dropped', () => {
    const c = model().find(x => x.name === 'Elsewhere');
    expect(c.envIds).toEqual([]);
    expect(c.scopedElsewhere).toBe(true);
  });

  test('a rename is not a value change', () => {
    expect(model().some(x => x.name === 'Renamed')).toBe(false);
  });

  test('long values are truncated for display', () => {
    const long = { Items: [{ Id: 'L', Occurred: '2026-08-14T03:00:00Z', ChangeDetails: {
      DocumentContext: { Variables: [{ Name: 'Long', Value: 'a'.repeat(200) }] },
      Differences: [{ op: 'replace', path: '/Variables/0/Value', value: 'b'.repeat(200) }] } }] };
    const c = data.variableChangeModel(long, grid, null, Date.now())[0];
    expect(c.before.length).toBeLessThanOrEqual(40);
    expect(c.after.length).toBeLessThanOrEqual(40);
  });

  test('the window filters changes', () => {
    const now = Date.parse('2026-08-14T04:00:00Z');
    // 90 minutes excludes the 02:00 edit; a 2-hour window would include it,
    // since a change exactly on the boundary is inside the window.
    expect(data.variableChangeModel(events, grid, 1.5, now)).toHaveLength(1);
    expect(data.variableChangeModel(events, grid, 2, now)).toHaveLength(2);
  });

  test('an empty payload yields nothing and does not throw', () => {
    expect(data.variableChangeModel(undefined, grid, null, Date.now())).toEqual([]);
  });
});

describe('Variable changes — view', () => {
  const data = require('./data');
  const Views = require('./views');
  const grid = [{ id: 'E1', name: 'Dev' }, { id: 'E3', name: 'Prod' }];
  const model = {
    environments: grid,
    groups: [{ id: 'G1', name: 'Cloud', environments: grid, hiddenEnvironments: [],
      projects: [{ id: 'P1', name: 'Portal',
        cells: grid.map(e => ({ envId: e.id, envName: e.name, entries: [], versionCount: 0, tenantTotal: 0 })),
        links: [null, 'none'] }] }],
    projects: [{ id: 'P1' }], truncated: {}
  };
  const vars = [
    { id: 'v1', name: 'ApiTimeout', kind: 'value', sensitive: false, before: '30s', after: '60s',
      envIds: ['E3'], scopedElsewhere: false, occurred: Date.now() - 3600000 },
    { id: 'v2', name: 'DbPassword', kind: 'value', sensitive: true, before: null, after: null,
      envIds: ['E1', 'E3'], scopedElsewhere: false, occurred: Date.now() - 7200000 },
    { id: 'v3', name: 'Global', kind: 'value', sensitive: false, before: 'a', after: 'b',
      envIds: [], scopedElsewhere: false, occurred: Date.now() - 10800000 },
    { id: 'v4', name: 'Elsewhere', kind: 'value', sensitive: false, before: 'a', after: 'b',
      envIds: [], scopedElsewhere: true, occurred: Date.now() - 14400000 }
  ];
  const render = grouping => Views.renderProjects({
    projectOpen: { P1: true },
    projectHistory: { P1: { status: 'ready', model: { releases: [], totalReleases: 1, channels: [], environments: grid,
      hiddenByWindow: 0, neverDeployedCount: 0 } } },
    projectFlags: { P1: { status: 'ready', model: { flags: [], total: 0, settled: {}, truncated: false },
      changes: [], variables: vars } },
    grouping: grouping, releases: { status: 'ready', model }
  });

  test('grouped by type, variables get their own band', () => {
    const html = render('Type');
    expect(html).toContain('Variable changes');
    expect(html).toContain('ApiTimeout');
    expect(html).toContain('30s → 60s');
  });

  test('a secret says it changed and never shows a value', () => {
    const html = render('Type');
    expect(html).toContain('secret changed');
    expect(html).toContain('DbPassword');
  });

  test('an unscoped variable is labelled as applying everywhere', () => {
    expect(render('Type')).toContain('all environments');
  });

  test('the snapshot caveat is stated, since a change alters nothing deployed', () => {
    expect(render('Type')).toContain('snapshotted into a release');
  });

  test('a change scoped outside the grid is counted, not drawn', () => {
    const html = render('Type');
    expect(html).toContain('1 change is scoped to environments this project does not deploy to');
    expect(html).not.toContain('Elsewhere');
  });

  test('grouped by time, variables interleave with everything else', () => {
    const html = render('Time');
    expect(html).toContain('ip-rel-vrow');
    expect(html).not.toContain('Variable changes');
  });

  test('variable rows are amber, distinct from flags and releases', () => {
    const html = render('Type');
    expect(html).toContain('ip-rel-vnode');
    expect(html).not.toContain('ip-rel-fnode');
  });
});

describe('An empty release window still shows what changed', () => {
  const Views = require('./views');
  const grid = [{ id: 'E1', name: 'Dev' }];
  const model = {
    environments: grid,
    groups: [{ id: 'G1', name: 'Cloud', environments: grid, hiddenEnvironments: [],
      projects: [{ id: 'P1', name: 'Portal',
        cells: [{ envId: 'E1', envName: 'Dev', entries: [], versionCount: 0, tenantTotal: 0 }], links: [null] }] }],
    projects: [{ id: 'P1' }], truncated: {}
  };
  // Nothing released in the window, but a flag flipped and a variable changed.
  const html = Views.renderProjects({
    projectOpen: { P1: true },
    projectHistory: { P1: { status: 'ready', model: { releases: [], totalReleases: 4, channels: [],
      environments: grid, hiddenByWindow: 4, neverDeployedCount: 0 } } },
    projectFlags: { P1: { status: 'ready', model: { flags: [], total: 0, settled: {}, truncated: false },
      changes: [{ id: 'c1', flagName: 'new-checkout', scope: 'environment', envId: 'E1', envName: 'Dev',
        occurred: Date.now(), before: { key: 'off', percent: null }, after: { key: 'on', percent: 100 } }],
      variables: [{ id: 'v1', name: 'ApiTimeout', kind: 'value', sensitive: false, before: '30s', after: '60s',
        envIds: ['E1'], scopedElsewhere: false, occurred: Date.now() }] } },
    grouping: 'Type', releases: { status: 'ready', model }
  });

  test('the empty release state is stated', () => {
    expect(html).toContain('Nothing moved in the last');
  });

  test('but the flag change still shows', () => {
    expect(html).toContain('new-checkout');
  });

  test('and so does the variable change', () => {
    expect(html).toContain('ApiTimeout');
    expect(html).toContain('30s → 60s');
  });
});

describe('A space we cannot read infrastructure in still has Projects', () => {
  const data = require('./data');
  const Views = require('./views');
  const fs = require('fs');
  const path = require('path');

  test('only Projects is exempt from needing the estate', () => {
    expect(data.viewNeedsEstate('projects')).toBe(false);
    ['overview', 'targets', 'environments', 'workers', 'argocd', 'machinepolicies', 'agents']
      .forEach(v => expect(data.viewNeedsEstate(v)).toBe(true));
  });

  test('the router gates the error view on that, not on spaceError alone', () => {
    const router = fs.readFileSync(path.join(__dirname, 'router.js'), 'utf8');
    expect(router).toContain('IP.spaceError && needsEstate');
    // The old unconditional guard must be gone.
    expect(router).not.toContain('if (IP.spaceError) {');
  });

  test('cold start cannot intercept Projects either', () => {
    const router = fs.readFileSync(path.join(__dirname, 'router.js'), 'utf8');
    expect(router).toContain('needsEstate && typeof Data !== \'undefined\' && Data.coldStartApplies');
  });

  test('the Projects view explains why the other sections are missing', () => {
    const grid = [{ id: 'E1', name: 'Dev' }];
    const model = {
      environments: grid,
      groups: [{ id: 'G1', name: 'Cloud', environments: grid, hiddenEnvironments: [],
        projects: [{ id: 'P1', name: 'Portal',
          cells: [{ envId: 'E1', envName: 'Dev', entries: [], versionCount: 0, tenantTotal: 0 }], links: [null] }] }],
      projects: [{ id: 'P1' }], truncated: {}
    };
    const html = Views.renderProjects({ spaceError: 'Machines could not be read.',
      releases: { status: 'ready', model } });
    expect(html).toContain('Infrastructure cannot be read in this space');
    // And it still renders the grid rather than an error.
    expect(html).toContain('Portal');
  });
});

describe('A release is named where it stops, not everywhere it went', () => {
  const data = require('./data');
  const Views = require('./views');
  const envs = [{ Id: 'E1', Name: 'Dev' }, { Id: 'E2', Name: 'Test' },
                { Id: 'E3', Name: 'Preprod' }, { Id: 'E4', Name: 'Prod' }];
  const build = items => data.releasesModel({
    Environments: envs, ProjectGroups: [{ Id: 'G1', Name: 'Cloud' }],
    Projects: [{ Id: 'P1', Name: 'Portal', ProjectGroupId: 'G1' }],
    Tenants: [{ Id: 'T1', Name: 'A' }, { Id: 'T2', Name: 'B' }], Items: items
  });
  const item = (env, ver, extra) => Object.assign({ IsCurrent: true, ProjectId: 'P1',
    EnvironmentId: env, ReleaseVersion: ver, State: 'Success' }, extra || {});

  test('only the furthest environment a version reaches is marked', () => {
    const m = build([item('E1', '9.3'), item('E2', '9.3'), item('E3', '9.3'), item('E4', '9.1')]);
    const cells = m.groups[0].projects[0].cells;
    expect(cells.map(c => c.entries[0] && c.entries[0].isFurthest)).toEqual([false, false, true, true]);
  });

  test('the version is printed once, not once per environment', () => {
    const m = build([item('E1', '9.3'), item('E2', '9.3'), item('E3', '9.3'), item('E4', '9.1')]);
    const html = Views.renderProjects({ releases: { status: 'ready', model: m } });
    expect((html.match(/9\.3</g) || []).length).toBe(1);
    expect((html.match(/9\.1</g) || []).length).toBe(1);
  });

  test('the nodes still appear in every environment the release is in', () => {
    const m = build([item('E1', '9.3'), item('E2', '9.3'), item('E3', '9.3'), item('E4', '9.1')]);
    const html = Views.renderProjects({ releases: { status: 'ready', model: m } });
    // Four environments hold something, so four head nodes.
    expect((html.match(/ip-rel-node ip-rel-node-healthy/g) || []).length).toBe(4);
  });

  test('a failure is named where it happened, even mid-journey', () => {
    const m = build([item('E1', '9.3'), item('E2', '9.3', { State: 'Failed' }), item('E3', '9.3')]);
    const html = Views.renderProjects({ releases: { status: 'ready', model: m } });
    // Named at Test because it failed there, and at Preprod because it stops there.
    expect((html.match(/9\.3</g) || []).length).toBe(2);
    expect(html).toContain('Failed');
  });

  test('a tenant split names every entry, since its counts are per environment', () => {
    // Both environments are mid-rollout, so both need their own counts named.
    const m = build([
      item('E3', '9.3', { TenantId: 'T1' }), item('E3', '9.1', { TenantId: 'T2' }),
      item('E4', '9.3', { TenantId: 'T1' }), item('E4', '9.1', { TenantId: 'T2' })
    ]);
    const html = Views.renderProjects({ releases: { status: 'ready', model: m } });
    expect((html.match(/9\.3</g) || []).length).toBe(2);
    expect((html.match(/9\.1</g) || []).length).toBe(2);
  });

  test('a single release passing through a split environment is still suppressed', () => {
    // Preprod holds one release and is not a rollout, so it stays a bare node.
    const m = build([
      item('E3', '9.3', { TenantId: 'T1' }),
      item('E4', '9.3', { TenantId: 'T1' }), item('E4', '9.1', { TenantId: 'T2' })
    ]);
    const html = Views.renderProjects({ releases: { status: 'ready', model: m } });
    expect((html.match(/9\.3</g) || []).length).toBe(1);
  });
});

describe('Tenants — the four independent facts', () => {
  const data = require('./data');
  const NOW = Date.parse('2026-08-17T12:00:00Z');
  const ago = d => new Date(NOW - d * 86400000).toISOString();
  const payload = {
    now: NOW,
    tenants: { total: 4, truncated: false, items: [
      { Id: 'T1', Name: 'Mercy Polyclinic', TenantTags: ['Hosted/Reef', 'Ring/Stable'], ProjectEnvironments: { P1: ['E1'] } },
      { Id: 'T2', Name: 'Riverside General', TenantTags: ['Hosted/Cluster'], ProjectEnvironments: { P1: ['E1'], P2: ['E1'] } },
      { Id: 'T3', Name: 'Never Ran', TenantTags: [], ProjectEnvironments: { P1: ['E1'] } },
      { Id: 'T4', Name: 'Unwired', TenantTags: [], ProjectEnvironments: {} }
    ] },
    dashboard: {
      Projects: [{ Id: 'P1', Name: 'Patient Records' }, { Id: 'P2', Name: 'Billing' }],
      Environments: [{ Id: 'E1', Name: 'Production' }],
      Items: [
        { IsCurrent: true, TenantId: 'T1', ProjectId: 'P1', EnvironmentId: 'E1', State: 'Failed', CompletedTime: ago(2) },
        { IsCurrent: true, TenantId: 'T2', ProjectId: 'P1', EnvironmentId: 'E1', State: 'Success', CompletedTime: ago(1) }
      ]
    },
    tagSets: [{ Name: 'Hosted', Tags: [{ Name: 'Reef' }, { Name: 'Cluster' }] }]
  };
  const m = data.tenantsModel(payload);
  const by = name => m.tenants.find(t => t.name === name);

  test('connection, last outcome, never-deployed and not-connected stay separate', () => {
    expect(by('Mercy Polyclinic').needsAttention).toBe(true);
    expect(by('Never Ran').neverDeployed).toBe(true);
    expect(by('Never Ran').needsAttention).toBe(false);
    expect(by('Unwired').notConnected).toBe(true);
    expect(by('Unwired').neverDeployed).toBe(false);
  });

  test('a task running past a week is stuck, not in progress', () => {
    expect(data.tenantOutcomeKey('Executing', NOW - 8 * 86400000, NOW)).toBe('stuck');
    expect(data.tenantOutcomeKey('Executing', NOW - 3600000, NOW)).toBe('running');
  });

  test('tags are split into their set and value', () => {
    expect(data.parseTenantTag('Hosted/Reef')).toEqual({ set: 'Hosted', name: 'Reef', raw: 'Hosted/Reef' });
    expect(data.parseTenantTag('Loose').set).toBe('');
  });

  test('the default sort is actionability, not alphabet', () => {
    expect(data.sortTenants(m.tenants, 'Actionability').map(t => t.name))
      .toEqual(['Mercy Polyclinic', 'Never Ran', 'Unwired', 'Riverside General']);
    expect(data.sortTenants(m.tenants, 'Name').map(t => t.name)[0]).toBe('Mercy Polyclinic');
  });

  test('filters combine, and a tag filter needs every selected tag', () => {
    expect(data.filterTenants(m.tenants, '', { tags: { 'Hosted/Reef': true } }).map(t => t.name)).toEqual(['Mercy Polyclinic']);
    expect(data.filterTenants(m.tenants, '', { tags: { 'Hosted/Reef': true, 'Ring/Stable': true } })).toHaveLength(1);
    expect(data.filterTenants(m.tenants, '', { tags: { 'Hosted/Reef': true, 'Hosted/Cluster': true } })).toHaveLength(0);
  });

  test('search matches name or id', () => {
    expect(data.filterTenants(m.tenants, 'riverside', {})).toHaveLength(1);
    expect(data.filterTenants(m.tenants, 'T4', {})).toHaveLength(1);
  });

  test('state filters use the independent facts', () => {
    expect(data.filterTenants(m.tenants, '', { state: { 'needs-attention': true } }).map(t => t.name)).toEqual(['Mercy Polyclinic']);
    expect(data.filterTenants(m.tenants, '', { state: { 'not-connected': true } }).map(t => t.name)).toEqual(['Unwired']);
  });

  test('facet counts are computed against the other active filters', () => {
    const facets = data.tenantFacets(m.tenants, '', { state: { 'needs-attention': true } });
    // Only Mercy needs attention, and it is the only Reef tenant.
    expect(facets.count('tags', 'Hosted/Reef')).toBe(1);
    expect(facets.count('tags', 'Hosted/Cluster')).toBe(0);
  });

  test('counts report the three list-scale facts', () => {
    expect(m.counts).toEqual({ needsAttention: 1, neverDeployed: 1, notConnected: 1 });
  });

  test('an empty payload yields nothing and does not throw', () => {
    expect(data.tenantsModel({}).tenants).toEqual([]);
    expect(data.tenantsModel(undefined).tenants).toEqual([]);
  });
});

describe('Tenants — view', () => {
  const data = require('./data');
  const Views = require('./views');
  const NOW = Date.parse('2026-08-17T12:00:00Z');
  const model = data.tenantsModel({
    now: NOW,
    tenants: { total: 2, truncated: false, items: [
      { Id: 'T1', Name: 'Mercy Polyclinic', TenantTags: ['Hosted/Reef'], ProjectEnvironments: { P1: ['E1'] } },
      { Id: 'T2', Name: 'Unwired', TenantTags: [], ProjectEnvironments: {} }
    ] },
    dashboard: { Projects: [{ Id: 'P1', Name: 'Patient Records' }], Environments: [{ Id: 'E1', Name: 'Production' }],
      Items: [{ IsCurrent: true, TenantId: 'T1', ProjectId: 'P1', EnvironmentId: 'E1', State: 'Failed',
        CompletedTime: new Date(NOW - 2 * 86400000).toISOString() }] },
    tagSets: [{ Name: 'Hosted', Tags: [{ Name: 'Reef' }] }]
  });
  const html = Views.renderTenants({ tenants: { status: 'ready', model } });

  test('a tenant links to its own page', () => {
    expect(html).toContain('href="#tenants/T1"');
  });

  test('the unscoped currency prompt is shown rather than a faked figure', () => {
    expect(html).toContain('Pick a release scope to see currency');
  });

  test('readiness says where it lives rather than pretending to be absent', () => {
    expect(html).toContain('Readiness needs a request per tenant');
  });

  test('a not-connected tenant says so instead of showing a zero', () => {
    expect(html).toContain('Not connected');
  });

  test('facet groups come from the instance tag sets', () => {
    expect(html).toContain('Hosted');
    expect(html).toContain('Reef');
  });

  test('an empty space explains what a tenant is', () => {
    const empty = Views.renderTenants({ tenants: { status: 'ready', model: data.tenantsModel({}) } });
    expect(empty).toContain('No tenants in this space');
  });
});

describe('Tenants — sortable column headers', () => {
  const data = require('./data');
  const Views = require('./views');
  const NOW = Date.parse('2026-08-17T12:00:00Z');
  const model = data.tenantsModel({
    now: NOW,
    tenants: { total: 3, truncated: false, items: [
      { Id: 'T1', Name: 'Alpha', TenantTags: [], ProjectEnvironments: { P1: ['E1'] } },
      { Id: 'T2', Name: 'Bravo', TenantTags: [], ProjectEnvironments: { P1: ['E1'], P2: ['E1'], P3: ['E1'] } },
      { Id: 'T3', Name: 'Charlie', TenantTags: [], ProjectEnvironments: { P1: ['E1'], P2: ['E1'] } }
    ] },
    dashboard: { Projects: [{ Id: 'P1', Name: 'One' }], Environments: [{ Id: 'E1', Name: 'Production' }], Items: [] },
    tagSets: []
  });
  const render = (sort, dir) => Views.renderTenants({
    tenants: { status: 'ready', model }, tenantSort: sort, tenantDir: dir });

  test('every sortable column offers a control; Tags does not', () => {
    const html = render();
    ['Name', 'Projects', 'Environments', 'Last outcome'].forEach(k =>
      expect(html).toContain('data-sort="' + k + '"'));
    expect(html).not.toContain('data-sort="Tags"');
  });

  test('the active column reports its direction to assistive tech', () => {
    const asc = render('Name', 'asc');
    expect(asc).toContain('aria-sort="ascending"');
    expect(render('Name', 'desc')).toContain('aria-sort="descending"');
    // Only one column is ever the sorted one.
    expect((asc.match(/aria-sort="(ascending|descending)"/g) || []).length).toBe(1);
  });

  test('each sort has a natural first direction', () => {
    expect(data.tenantSortDir('Name')).toBe('asc');
    expect(data.tenantSortDir('Projects')).toBe('desc');
    expect(data.tenantSortDir('Last outcome')).toBe('desc');
  });

  test('sorting by a column orders by that column', () => {
    expect(data.sortTenants(model.tenants, 'Projects').map(t => t.name)).toEqual(['Bravo', 'Charlie', 'Alpha']);
    expect(data.sortTenants(model.tenants, 'Name').map(t => t.name)).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  test('reversing a column reverses it', () => {
    expect(data.sortTenants(model.tenants, 'Projects', 'asc').map(t => t.name)).toEqual(['Alpha', 'Charlie', 'Bravo']);
  });

  test('ties fall back to name so the order is stable', () => {
    const tied = data.tenantsModel({
      now: NOW,
      tenants: { total: 2, items: [
        { Id: 'B', Name: 'Beta', TenantTags: [], ProjectEnvironments: { P1: ['E1'] } },
        { Id: 'A', Name: 'Aardvark', TenantTags: [], ProjectEnvironments: { P1: ['E1'] } }
      ] },
      dashboard: { Projects: [], Environments: [], Items: [] }, tagSets: []
    });
    expect(data.sortTenants(tied.tenants, 'Projects').map(t => t.name)).toEqual(['Aardvark', 'Beta']);
  });

  test('the dropdown and the headers offer the same set', () => {
    const html = render();
    data.TENANT_SORTS.forEach(s => expect(html).toContain(s));
  });
});

describe('Tenant detail — model', () => {
  const data = require('./data');
  const NOW = Date.parse('2026-08-17T12:00:00Z');
  const ago = d => new Date(NOW - d * 86400000).toISOString();
  const tenant = { Id: 'T1', Name: 'Mercy Polyclinic', TenantTags: ['Hosted/Reef', 'Ring/Stable'],
    Description: 'A hospital group', ProjectEnvironments: { P1: ['E1', 'E2'], P2: ['E2'] } };
  const dashboard = {
    Projects: [{ Id: 'P1', Name: 'Patient Records' }, { Id: 'P2', Name: 'Billing' }],
    Environments: [{ Id: 'E1', Name: 'Staging' }, { Id: 'E2', Name: 'Production' }, { Id: 'E3', Name: 'Unused' }],
    Items: [
      { IsCurrent: true, TenantId: 'T1', ProjectId: 'P1', EnvironmentId: 'E2', ReleaseVersion: '5.9.0',
        State: 'Failed', CompletedTime: ago(2), TaskId: 'ServerTasks-1' },
      { IsCurrent: true, TenantId: 'T1', ProjectId: 'P1', EnvironmentId: 'E1', ReleaseVersion: '5.10.0',
        State: 'Success', CompletedTime: ago(8), TaskId: 'ServerTasks-2' },
      { IsCurrent: true, TenantId: 'OTHER', ProjectId: 'P1', EnvironmentId: 'E2', ReleaseVersion: '9.9', State: 'Success' }
    ]
  };
  const build = extra => data.tenantDetailModel(Object.assign({ tenant, dashboard, now: NOW }, extra || {}));

  test('the four facts are reported separately', () => {
    const m = build();
    expect(m.connection).toEqual({ connected: true, pairCount: 3, projectCount: 2 });
    expect(m.lastOutcome.key).toBe('failed');
    expect(m.readiness).toBeNull();          // not fetched in this call
    expect(m.infrastructure).toBeNull();
  });

  test('columns are only the environments this tenant is connected to', () => {
    expect(build().environments.map(e => e.name)).toEqual(['Staging', 'Production']);
  });

  test('another tenant\'s deployments are not counted', () => {
    const m = build();
    const prod = m.matrix.find(r => r.projectName === 'Patient Records').cells.find(c => c.envName === 'Production');
    expect(prod.version).toBe('5.9.0');
  });

  test('not connected and never deployed are different cells', () => {
    const m = build();
    const billing = m.matrix.find(r => r.projectName === 'Billing');
    const staging = billing.cells.find(c => c.envName === 'Staging');
    const prod = billing.cells.find(c => c.envName === 'Production');
    expect(staging.connected).toBe(false);   // structural: the pair does not exist
    expect(prod.connected).toBe(true);
    expect(prod.deployed).toBe(false);       // it does exist, nothing has gone to it
  });

  test('activity is newest first and only this tenant', () => {
    const a = build().activity;
    expect(a).toHaveLength(2);
    expect(a[0].version).toBe('5.9.0');
  });
});

describe('Tenant detail — readiness', () => {
  const data = require('./data');
  const envName = { E1: 'Staging', E2: 'Production' };
  const vars = { ProjectVariables: { P1: { ProjectId: 'P1', ProjectName: 'Patient Records',
    Templates: [{ Id: 'tpl-1', Name: 'ApiKey', Label: 'API key' }, { Id: 'tpl-2', Name: 'Region', DefaultValue: 'eu' }],
    Variables: { E1: { 'tpl-1': 'abc' }, E2: {} } } } };

  test('a template with no value and no default is unset', () => {
    const r = data.tenantReadiness(vars, { P1: ['E1', 'E2'] }, envName, {});
    expect(r.ready).toBe(false);
    expect(r.count).toBe(1);
    expect(r.missing[0]).toMatchObject({ name: 'API key', environments: ['Production'] });
  });

  test('a default value satisfies a template', () => {
    const r = data.tenantReadiness(vars, { P1: ['E1', 'E2'] }, envName, {});
    expect(r.missing.some(x => x.name === 'Region')).toBe(false);
  });

  test('only connected environments can be missing anything', () => {
    const r = data.tenantReadiness(vars, { P1: ['E1'] }, envName, {});
    expect(r.ready).toBe(true);
  });

  test('an empty value counts as missing, not as supplied', () => {
    const blank = { ProjectVariables: { P1: { ProjectId: 'P1', Templates: [{ Id: 't', Name: 'X' }],
      Variables: { E1: { t: '' } } } } };
    expect(data.tenantReadiness(blank, { P1: ['E1'] }, envName, {}).count).toBe(1);
  });
});

describe('Tenant detail — target matching', () => {
  const data = require('./data');
  const tenant = { Id: 'T1', TenantTags: ['Hosted/Reef'] };
  const machines = { items: [
    { Id: 'M1', Name: 'dedicated-01', TenantIds: ['T1'], TenantTags: [], HealthStatus: 'Healthy' },
    { Id: 'M2', Name: 'shared-01', TenantIds: [], TenantTags: ['Hosted/Reef'], HealthStatus: 'Unhealthy' },
    { Id: 'M3', Name: 'unrelated', TenantIds: ['T9'], TenantTags: ['Hosted/Other'], HealthStatus: 'Healthy' }
  ] };

  test('dedicated names the tenant, shared matches a tag', () => {
    const r = data.matchTenantTargets(machines, tenant);
    expect(r.dedicated.map(t => t.name)).toEqual(['dedicated-01']);
    expect(r.shared.map(t => t.name)).toEqual(['shared-01']);
    expect(r.shared[0].via).toBe('Hosted/Reef');
  });

  test('health rolls up as a count without hiding the unhealthy one', () => {
    const r = data.matchTenantTargets(machines, tenant);
    expect(r.total).toBe(2);
    expect(r.healthy).toBe(1);
  });

  test('a tenant nothing matches is flagged, because its deployments resolve to nothing', () => {
    expect(data.matchTenantTargets(machines, { Id: 'T404', TenantTags: [] }).orphaned).toBe(true);
  });
});

describe('Tenant detail — view', () => {
  const data = require('./data');
  const Views = require('./views');
  const NOW = Date.parse('2026-08-17T12:00:00Z');
  const base = {
    tenant: { Id: 'T1', Name: 'Mercy Polyclinic', TenantTags: ['Hosted/Reef'], ProjectEnvironments: { P1: ['E1'] } },
    dashboard: { Projects: [{ Id: 'P1', Name: 'Patient Records' }], Environments: [{ Id: 'E1', Name: 'Production' }],
      Items: [{ IsCurrent: true, TenantId: 'T1', ProjectId: 'P1', EnvironmentId: 'E1', ReleaseVersion: '5.9.0',
        State: 'Success', CompletedTime: new Date(NOW - 86400000).toISOString() }] },
    now: NOW
  };
  const render = extra => Views.renderTenantDetail({ spaceId: 'Spaces-1', serverUrl: 'https://x.octopus.app/',
    tenantDetail: { status: 'ready', model: data.tenantDetailModel(Object.assign({}, base, extra || {})) } });

  test('the four facts are three separate cards, never one badge', () => {
    const html = render();
    expect(html).toContain('Connection');
    expect(html).toContain('Readiness');
    expect(html).toContain('Last outcome');
  });

  test('unreadable machines degrade to a sentence, not a broken page', () => {
    const html = render({ machinesError: 'Deployment targets cannot be read in this space.' });
    expect(html).toContain('Deployment targets cannot be read');
    expect(html).toContain('Deployment matrix');
  });

  test('unreadable variables leave readiness unknown rather than claiming ready', () => {
    const html = render({ variablesError: 'Tenant variables could not be read.' });
    expect(html).toContain('Unknown');
    expect(html).not.toContain('>Ready<');
  });

  test('a tenant with no matching target says its deployments resolve to nothing', () => {
    const html = render({ machines: { items: [] } });
    expect(html).toContain('resolve to nothing');
  });

  test('the matrix legend explains the two kinds of absence', () => {
    expect(render()).toContain('is structural');
  });

  test('what is not built yet is named rather than silently missing', () => {
    expect(render()).toContain('need a request per connected project');
  });

  test('it links back to the list', () => {
    expect(render()).toContain('href="#tenants"');
  });
});

describe('A tenant page is still the tenants view', () => {
  const data = require('./data');
  const fs = require('fs');
  const path = require('path');

  test('a detail route is matched by its base, not the whole hash', () => {
    expect(data.viewNeedsEstate('tenants/Tenants-1')).toBe(false);
    expect(data.viewNeedsEstate('tenants')).toBe(false);
    expect(data.viewNeedsEstate('projects')).toBe(false);
  });

  test('an infrastructure detail route still needs the estate', () => {
    // Target detail reads IP.estate.targets, so it must stay gated.
    expect(data.viewNeedsEstate('targets/Machines-1')).toBe(true);
    expect(data.viewNeedsEstate('overview')).toBe(true);
  });

  test('the tenant route is checked before the view falls back to overview', () => {
    const router = fs.readFileSync(path.join(__dirname, 'router.js'), 'utf8');
    const detail = router.indexOf("hash.indexOf('tenants/') === 0");
    const fallback = router.indexOf("const view = VIEWS.includes(hash)");
    expect(detail).toBeGreaterThan(-1);
    expect(detail).toBeLessThan(fallback);
  });

  test('cold start cannot intercept a tenant page', () => {
    const router = fs.readFileSync(path.join(__dirname, 'router.js'), 'utf8');
    // Cold start is gated on needsEstate, which a tenant route now fails.
    expect(router).toContain('needsEstate && typeof Data !== \'undefined\' && Data.coldStartApplies');
  });
});

describe('Readiness is triangulated against what has deployed', () => {
  const data = require('./data');
  const envName = { E1: 'Dev', E2: 'Test', E3: 'Production' };
  const conn = { P1: ['E1', 'E2', 'E3'] };
  const vars = { ProjectVariables: { P1: { ProjectId: 'P1', ProjectName: 'Patient Records',
    Templates: [{ Id: 't1', Name: 'ApiKey' }, { Id: 't2', Name: 'Region', DefaultValue: 'eu' }, { Id: 't3', Name: 'Secret' }],
    Variables: { E1: {}, E2: {}, E3: {} } } } };

  test('the count is distinct templates, not template times environment', () => {
    const r = data.tenantReadiness(vars, conn, envName, {});
    // Two templates unset across three environments is two, not six.
    expect(r.count).toBe(2);
    expect(r.pairCount).toBe(6);
  });

  test('each unset template names the environments it is unset in', () => {
    const r = data.tenantReadiness(vars, conn, envName, {});
    expect(r.missing[0].environments).toEqual(['Dev', 'Test', 'Production']);
  });

  test('a pair that has deployed successfully marks the template proven', () => {
    const r = data.tenantReadiness(vars, conn, envName, { 'P1|E3': true });
    expect(r.missing.every(m => m.proven)).toBe(true);
    expect(r.unprovenCount).toBe(0);
    expect(r.proven).toBe(true);
  });

  test('nothing deployed leaves them unproven', () => {
    const r = data.tenantReadiness(vars, conn, envName, {});
    expect(r.unprovenCount).toBe(2);
    expect(r.proven).toBe(false);
  });

  test('a default value still satisfies a template outright', () => {
    expect(data.tenantReadiness(vars, conn, envName, {}).missing.some(m => m.name === 'Region')).toBe(false);
  });

  test('the card stops asserting a deployment would fail', () => {
    const Views = require('./views');
    const NOW = Date.now();
    const model = data.tenantDetailModel({
      tenant: { Id: 'T1', Name: 'T', TenantTags: [], ProjectEnvironments: { P1: ['E3'] } },
      dashboard: { Projects: [{ Id: 'P1', Name: 'Patient Records' }], Environments: [{ Id: 'E3', Name: 'Production' }],
        Items: [{ IsCurrent: true, TenantId: 'T1', ProjectId: 'P1', EnvironmentId: 'E3', ReleaseVersion: '1.0',
          State: 'Success', CompletedTime: new Date(NOW - 3 * 86400000).toISOString() }] },
      variables: { ProjectVariables: { P1: { ProjectId: 'P1', ProjectName: 'Patient Records',
        Templates: [{ Id: 't1', Name: 'ApiKey' }], Variables: { E3: {} } } } },
      now: NOW
    });
    const overview = Views.renderTenantDetail({ spaceId: 'S', tenantDetail: { status: 'ready', model } });
    // It deployed three days ago with the value unset, so the page says so.
    expect(overview).not.toContain('would fail on configuration');
    expect(overview).toContain('Deployments have succeeded with these unset');
    // The detail sits behind a tab rather than in the flow.
    expect(overview).not.toContain('deployed without it');
    const variables = Views.renderTenantDetail({ spaceId: 'S', tenantTab: 'Variables',
      tenantDetail: { status: 'ready', model } });
    expect(variables).toContain('deployed without it');
  });
});

describe('Unset variables live behind a tab, in amber', () => {
  const data = require('./data');
  const Views = require('./views');
  const NOW = Date.now();
  const build = (items, templates) => data.tenantDetailModel({
    tenant: { Id: 'T1', Name: 'T', TenantTags: [], ProjectEnvironments: { P1: ['E3'] } },
    dashboard: { Projects: [{ Id: 'P1', Name: 'Patient Records' }], Environments: [{ Id: 'E3', Name: 'Production' }],
      Items: items },
    variables: { ProjectVariables: { P1: { ProjectId: 'P1', ProjectName: 'Patient Records',
      Templates: templates, Variables: { E3: {} } } } },
    now: NOW
  });
  const deployed = [{ IsCurrent: true, TenantId: 'T1', ProjectId: 'P1', EnvironmentId: 'E3',
    ReleaseVersion: '1.0', State: 'Success', CompletedTime: new Date(NOW - 3 * 86400000).toISOString() }];
  const render = (model, tab) => Views.renderTenantDetail({ spaceId: 'S', tenantTab: tab,
    tenantDetail: { status: 'ready', model } });

  test('a tab appears only when something is unset', () => {
    const none = build(deployed, [{ Id: 't1', Name: 'ApiKey', DefaultValue: 'x' }]);
    expect(render(none)).not.toContain('data-tenanttab');
    const some = build(deployed, [{ Id: 't1', Name: 'ApiKey' }]);
    expect(render(some)).toContain('data-tenanttab="Variables"');
  });

  test('the tab carries the count', () => {
    const html = render(build(deployed, [{ Id: 't1', Name: 'ApiKey' }, { Id: 't2', Name: 'Secret' }]));
    expect(html).toContain('ip-tn-tabcount');
    expect(html).toContain('Unset variables');
  });

  test('the overview keeps the matrix rather than the variable list', () => {
    const html = render(build(deployed, [{ Id: 't1', Name: 'ApiKey' }]));
    expect(html).toContain('Deployment matrix');
    expect(html).not.toContain('ip-tn-legend">A template is a request');
  });

  test('the variables tab shows the list and not the matrix', () => {
    const html = render(build(deployed, [{ Id: 't1', Name: 'ApiKey' }]), 'Variables');
    expect(html).toContain('A template is a request for a value');
    expect(html).not.toContain('Deployment matrix');
  });

  test('unproven reads amber, never red', () => {
    // Nothing has deployed, so the template is unproven — the strongest case.
    const html = render(build([], [{ Id: 't1', Name: 'ApiKey' }]), 'Variables');
    expect(html).toContain('ip-pill-warning');
    expect(html).not.toContain('ip-pill-unhealthy');
  });

  test('the readiness card is amber too, not the failure tone', () => {
    const html = render(build([], [{ Id: 't1', Name: 'ApiKey' }]));
    expect(html).toContain('ip-rel-node-warning');
  });
});
