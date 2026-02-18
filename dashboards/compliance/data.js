/* ==========================================================================
   Compliance Dashboard — Minimal Data Layer
   
   Provides a DashboardData-compatible shim that fetches only the data
   the compliance view needs: spaces, projects, environments, deployments,
   cross-space tasks, and runbook counts.
   
   This allows compliance.js to be used unmodified — it calls
   DashboardData.getAllSpaceData(), getCrossSpaceTasks(), and getSummary()
   exactly as it does inside the valuemetrics dashboard.
   ========================================================================== */

const DashboardData = (() => {

  let _spaces = [];
  let _spaceData = {};
  let _crossSpaceTasks = [];
  let _totalRunbooks = 0;

  const log = (...args) => (window._debug || console.log)(...args);

  async function safeGet(endpoint) {
    try {
      return await OctopusApi.get(endpoint);
    } catch (err) {
      if (err.status === 404 || err.status === 403) return null;
      if (err.message && err.message.includes('deprecated')) return null;
      throw err;
    }
  }

  /**
   * Fetch all data the compliance view requires.
   * Mirrors the subset of DashboardData.fetchAll() that compliance uses.
   */
  async function fetchAll(onProgress) {
    const report = (msg) => onProgress && onProgress(msg);

    // Phase 1: Global data
    report('Connecting to Octopus…');
    const [serverInfo, spacesResponse, licenseUsage] = await Promise.all([
      OctopusApi.get('/api'),
      OctopusApi.get('/api/spaces?take=100&partialName='),
      safeGet('/api/licenses/licenses-current-usage'),
    ]);

    _spaces = spacesResponse.Items || [];
    log(`Found ${_spaces.length} spaces`);

    // Build usage lookup and filter to active spaces
    let activeSpaces;
    if (licenseUsage?.SpacesUsage && licenseUsage.SpacesUsage.length > 0) {
      const usageByName = {};
      for (const su of licenseUsage.SpacesUsage) {
        usageByName[su.SpaceName] = su;
      }
      activeSpaces = _spaces.filter(s => {
        const usage = usageByName[s.Name];
        return usage && (usage.ProjectsCount > 0 || usage.MachinesCount > 0);
      });
    } else {
      activeSpaces = _spaces;
    }

    log(`Active spaces: ${activeSpaces.length}`, activeSpaces.map(s => s.Name));

    // Phase 2: Per-space data (only what compliance needs)
    _spaceData = {};
    _totalRunbooks = 0;
    report(`Loading data for ${activeSpaces.length} active spaces…`);

    await Promise.all(activeSpaces.map(async (space) => {
      const sid = space.Id;
      report(`Loading ${space.Name}…`);

      const [projects, environments, deployments, runbooksResp] = await Promise.all([
        safeGet(`/api/${sid}/projects?take=1000`),
        safeGet(`/api/${sid}/environments?take=100`),
        safeGet(`/api/${sid}/deployments?take=200`),
        safeGet(`/api/${sid}/runbooks?take=0`),
      ]);

      const projectNames = {};
      for (const p of (projects?.Items || [])) projectNames[p.Id] = p.Name;

      const envNames = {};
      for (const e of (environments?.Items || [])) envNames[e.Id] = e.Name;

      _totalRunbooks += (runbooksResp?.TotalResults || 0);

      _spaceData[space.Id] = {
        space,
        projects: projects?.Items || [],
        projectNames,
        environments: environments?.Items || [],
        envNames,
        deployments: deployments?.Items || [],
      };

      log(`  ${space.Name}: ${(projects?.Items || []).length} projects, ${(deployments?.Items || []).length} deployments`);
    }));

    // Phase 3: Cross-space deployment tasks (for MTTR calculation)
    report('Loading deployment task history…');
    const activeSpaceIds = activeSpaces.map(s => s.Id).join(',');
    if (activeSpaceIds) {
      const tasksResponse = await safeGet(`/api/tasks?spaces=${activeSpaceIds}&name=Deploy&states=Success,Failed&take=200`);
      _crossSpaceTasks = tasksResponse?.Items || [];
    } else {
      _crossSpaceTasks = [];
    }

    log(`Data loaded: ${activeSpaces.length} spaces, ${_crossSpaceTasks.length} cross-space tasks`);
  }

  return {
    fetchAll,
    getAllSpaceData: () => _spaceData,
    getCrossSpaceTasks: () => _crossSpaceTasks,
    getSummary: () => ({ kpi: { totalRunbooks: _totalRunbooks } }),
    getSpaces: () => _spaces,
  };

})();
