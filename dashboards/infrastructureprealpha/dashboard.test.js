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
