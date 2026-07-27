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

describe('_mapLimit', () => {
  const d = require('./data');
  test('preserves input order and caps concurrency', async () => {
    let inFlight = 0, maxInFlight = 0;
    const items = [1,2,3,4,5,6,7,8];
    const out = await d._mapLimit(items, 3, async (n) => {
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise(r => setTimeout(r, 5));
      inFlight--;
      return n * 10;
    });
    expect(out).toEqual([10,20,30,40,50,60,70,80]); // order preserved
    expect(maxInFlight).toBeLessThanOrEqual(3);      // concurrency capped
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
