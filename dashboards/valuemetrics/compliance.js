/* ==========================================================================
   Interventions

   Powers the "Interventions" tab. Two halves:

     1. Live "what's holding a deployment" — five independent surfaces, each
        soft-failing on its own so a missing permission/feature never breaks
        the page:
          • Awaiting Action — interruptions waiting on a human (manual
            interventions, guided failures, approvals).
          • Change Requests (ITSM) — deployments waiting on a ServiceNow /
            Jira Service Desk change request. Best-effort: Octopus has no list
            API for these (they poll inside the running task, not as an
            interruption), so we scan running deployment tasks' activity.
          • Blocked Releases — releases carrying an unresolved defect.
          • Compliance Blocks — deployments blocked by a compliance policy
            (read from CompliancePolicyEvaluatedNonCompliantBlocked events).
          • Deployment Freezes — active / upcoming freeze windows.
        Each row deep-links into Octopus.

     2. Approval Analytics (over time) — how long approvals actually take.
        Each interruption's wait starts when it's raised (interruption.Created)
        and ends when the deployment resumes (a DeploymentResumed /
        RunbookRunResumed audit event on the same task). Pairing the two gives
        the true wait duration, which we aggregate into avg/median/p90 KPIs,
        weekly trend charts, and per-environment / per-project breakdowns.

   Timing requires the EventView permission (to read the resume events). When
   it's unavailable we still show volume and breakdown-by-count, and flag that
   timing is unavailable rather than showing wrong numbers.
   ========================================================================== */


// ==========================================================================
// ComplianceData — fetch & compute
// ==========================================================================

const ComplianceData = (() => {

  let _data = null;
  let _loading = false;
  let _loaded = false;
  let _gen = 0; // bumped by reset(); an in-flight fetch from an older generation must not cache
  const LOOKBACK_DAYS = 90;
  const MAX_WAIT_MIN = 60 * 24 * 30; // ignore pairings longer than 30 days (mismatch guard)
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // ---- HTTP helpers ----

  async function safeGet(endpoint) {
    try {
      return await OctopusApi.get(endpoint);
    } catch (e) {
      const status = e && (e.status || e.statusCode || (e.response && e.response.status));
      if (status === 401 || status === 403) throw e;
      (window._debug || console.log)('Interventions safeGet: non-fatal error fetching ' + endpoint, e);
      return null;
    }
  }

  // Swallows ALL errors (incl. 401/403). Used for per-project/per-space calls
  // where one inaccessible resource must not fail the whole scan; returns a
  // { items, denied } shape so callers can tell "no data" from "no permission".
  async function softGetEvents(endpoint) {
    try {
      const r = await OctopusApi.get(endpoint);
      return { items: r?.Items || [], denied: false };
    } catch (e) {
      const status = e && (e.status || e.statusCode || (e.response && e.response.status));
      return { items: [], denied: status === 401 || status === 403 };
    }
  }

  async function softGet(endpoint) {
    try {
      return await OctopusApi.get(endpoint);
    } catch (e) {
      return null;
    }
  }

  // ---- Blocked releases (unresolved defects) ----
  //
  // There's no bulk "blocked releases" endpoint, so we ask each project's
  // progression view whether any of its releases carry an unresolved defect
  // (HasUnresolvedDefect). Calls are batched to bound concurrency, and the scan
  // is capped on very large instances (reported in the UI, not silently cut).
  const BLOCKED_PROJECT_CAP = 400;
  const BLOCKED_BATCH_SIZE = 20;

  async function fetchBlockedReleases(allSpaceData) {
    const root = OctopusApi.getInstanceUrl() || '';

    const jobs = [];
    for (const [sid, sd] of Object.entries(allSpaceData)) {
      const spaceName = sd.space?.Name || sid;
      for (const p of (sd.projects || [])) {
        jobs.push({ sid, spaceName, projId: p.Id, projName: p.Name });
      }
    }

    const truncated = jobs.length > BLOCKED_PROJECT_CAP;
    const scanList = truncated ? jobs.slice(0, BLOCKED_PROJECT_CAP) : jobs;

    const blocked = [];
    for (let i = 0; i < scanList.length; i += BLOCKED_BATCH_SIZE) {
      const batch = scanList.slice(i, i + BLOCKED_BATCH_SIZE);
      const results = await Promise.all(batch.map(async (j) => {
        const prog = await softGet(`/api/${j.sid}/projects/${j.projId}/progression`);
        const releases = prog?.Releases || [];
        return releases
          .filter(r => r.HasUnresolvedDefect)
          .map(r => {
            const version = r.Release?.Version || r.Release?.Id || '--';
            return {
              project: j.projName,
              projectId: j.projId,
              space: j.spaceName,
              spaceId: j.sid,
              version,
              releaseId: r.Release?.Id || null,
              channel: r.Channel?.Name || null,
              url: (root && version !== '--')
                ? `${root}/app#/${encodeURIComponent(j.sid)}/projects/${encodeURIComponent(j.projId)}/deployments/releases/${encodeURIComponent(version)}`
                : (root ? `${root}/app#/${encodeURIComponent(j.sid)}/projects/${encodeURIComponent(j.projId)}` : null),
            };
          });
      }));
      for (const arr of results) blocked.push(...arr);
    }

    blocked._truncated = truncated;
    blocked._projectsScanned = scanList.length;
    blocked._projectsTotal = jobs.length;
    return blocked;
  }

  // ---- Global id→name maps (ids are unique instance-wide in Octopus) ----
  //
  // Freezes, change requests and compliance blocks all reference project /
  // environment ids that can come from any space, so we flatten the per-space
  // name maps into one lookup plus a project→space map for deep links.
  function buildGlobalMaps(allSpaceData) {
    const proj = {}, env = {}, projSpace = {};
    for (const [sid, sd] of Object.entries(allSpaceData)) {
      Object.assign(proj, sd.projectNames || {});
      Object.assign(env, sd.envNames || {});
      for (const id of Object.keys(sd.projectNames || {})) projSpace[id] = sid;
    }
    return { proj, env, projSpace };
  }

  // ---- Deployment freezes (a release can't deploy during a freeze window) ----
  //
  // Instance-level endpoint. We ask for incomplete freezes only and classify
  // each as active-now vs upcoming from its Start/End rather than trusting the
  // server status enum, so the result is stable across versions. The scope
  // object is { projectId: [environmentId, ...] }; we resolve names best-effort.
  async function fetchDeploymentFreezes(maps) {
    const root = OctopusApi.getInstanceUrl() || '';
    const r = await softGet('/api/deploymentfreezes?includeComplete=false&take=1000');
    if (!r) { const empty = []; empty._supported = false; return empty; }

    const list = r.DeploymentFreezes || [];
    const nowMs = Date.now();
    const out = [];
    for (const f of list) {
      const start = Date.parse(f.Start);
      const end = Date.parse(f.End);
      let status = 'unknown';
      if (!isNaN(start) && !isNaN(end)) {
        if (nowMs >= start && nowMs < end) status = 'active';
        else if (start > nowMs) status = 'upcoming';
        else status = 'past';
      }
      if (status === 'past') continue; // incomplete-but-past (e.g. recurring gap) — not blocking now

      const scope = f.ProjectEnvironmentScope || {};
      const projIds = Object.keys(scope);
      const envIds = Array.from(new Set(projIds.flatMap(p => scope[p] || [])));
      const projNames = projIds.map(p => maps.proj[p] || p);
      const envNames = envIds.map(e => maps.env[e] || e);

      out.push({
        id: f.Id || null,
        name: f.Name || 'Deployment freeze',
        description: f.Description || null,
        start: f.Start || null,
        end: f.End || null,
        status,
        recurring: !!f.RecurringSchedule,
        projectCount: projIds.length,
        envCount: envIds.length,
        projNames,
        envNames,
        tenantScoped: Array.isArray(f.TenantProjectEnvironmentScope) && f.TenantProjectEnvironmentScope.length > 0,
        url: root ? `${root}/app#/configuration/deployment-freezes` : null,
      });
    }
    // active first, then earliest-starting upcoming
    out.sort((a, b) => (a.status === b.status)
      ? (Date.parse(a.start) || 0) - (Date.parse(b.start) || 0)
      : (a.status === 'active' ? -1 : 1));
    out._supported = true;
    out._activeCount = out.filter(f => f.status === 'active').length;
    return out;
  }

  // ---- ITSM change requests (ServiceNow / Jira Service Desk) ----
  //
  // A change-controlled deployment does NOT raise an interruption. Instead the
  // task is held on an *Approval precondition* and sits in the QUEUED state
  // while Octopus polls the change request — so `running=true` never lists it.
  // The reliable signal is on the task itself:
  //     State == "Queued" && HasPendingPreconditions == true
  //                       && PendingPreconditionTypes includes "Approval"
  // We then read the activity tree to lift the CR number and the ServiceNow /
  // Jira deep link. The awaiting node is named e.g. "ServiceNow approval check
  // creation" and logs (provider-agnostic wording emitted by Octopus):
  //     Awaiting approval of change request "<title>" with Change Number [CHG…](url)
  // Verified live against meanski Spaces-142 itsm-service-now release 0.0.5.
  const CR_PATTERN = /Awaiting approval of change request\s+"(?<title>.*?)"\s+with Change Number\s+\[?(?<cr>[A-Z]{2,4}\d{4,})\]?(?:\((?<url>[^)\s]+)\))?/i;
  const CR_PRECONDITION = 'Approval';
  const CR_TASK_SCAN_CAP = 60;       // max active tasks we fetch details for
  const CR_TASK_LIST_PER_SPACE = 60; // active tasks listed per space

  const hasApprovalPrecondition = (t) =>
    !!t && t.HasPendingPreconditions === true &&
    Array.isArray(t.PendingPreconditionTypes) &&
    t.PendingPreconditionTypes.includes(CR_PRECONDITION);

  // Pull CR metadata (number, title, ServiceNow/Jira url) out of a wait node's
  // log. Status-agnostic: when a CR is pending, the "…approval check creation"
  // node has Status "Success" (it *created* the check), so we match on the log
  // text, not the node state. Stale matches are avoided upstream by only
  // scanning tasks Octopus reports as actively waiting (see fetchChangeRequests).
  function extractCr(node) {
    if (!node) return null;
    const logText = (node.LogElements || []).map(e => e.MessageText || '').join('\n');
    const m = `${node.Name || ''}\n${node.ProgressMessage || ''}\n${logText}`.match(CR_PATTERN);
    if (!m) return null;
    return {
      node,
      crTitle: (m.groups && m.groups.title) || null,
      crNumber: (m.groups && m.groups.cr) || null,
      crUrl: (m.groups && m.groups.url) || null,
      message: logText || node.ProgressMessage || node.Name || null,
    };
  }

  function findCrWaitNode(node) {
    if (!node) return null;
    const hit = extractCr(node);
    if (hit) return hit;
    for (const c of (node.Children || [])) {
      const f = findCrWaitNode(c);
      if (f) return f;
    }
    return null;
  }

  async function fetchChangeRequests(allSpaceData, maps) {
    const root = OctopusApi.getInstanceUrl() || '';

    // 1. List ACTIVE tasks per space. A CR-gated deployment is QUEUED (held on
    //    an Approval precondition), so we must include Queued, not just Executing.
    const active = [];
    let listDenied = false;
    await Promise.all(Object.entries(allSpaceData).map(async ([sid, sd]) => {
      const spaceName = sd.space?.Name || sid;
      const res = await softGetEvents(`/api/${sid}/tasks?states=Queued,Executing&take=${CR_TASK_LIST_PER_SPACE}`);
      if (res.denied) { listDenied = true; return; }
      for (const t of res.items) {
        if (t.Name === 'Deploy' || t.Name === 'RunbookRun') active.push({ sid, spaceName, task: t });
      }
    }));

    const result = [];
    result._supported = true;
    result._scanned = 0;
    result._capped = false;
    result._denied = listDenied && active.length === 0;
    if (!active.length) return result;

    // 2. Fetch details for each (capped) to confirm the Approval precondition
    //    and lift the CR number / link from the activity tree.
    const scan = active.slice(0, CR_TASK_SCAN_CAP);
    result._capped = active.length > CR_TASK_SCAN_CAP;
    result._scanned = scan.length;

    // Keyed by TaskId only — the sole lookup below is deployByDoc[task.Id]. (A
    // Deployments-id key was previously built here but never read.)
    const deployByDoc = {};
    for (const [sid, sd] of Object.entries(allSpaceData)) {
      for (const d of (sd.deployments || [])) {
        if (d.TaskId) deployByDoc[d.TaskId] = { d, sid };
      }
    }

    for (let i = 0; i < scan.length; i += 10) {
      const batch = scan.slice(i, i + 10);
      const found = await Promise.all(batch.map(async ({ sid, spaceName, task }) => {
        const details = await softGet(`/api/${sid}/tasks/${encodeURIComponent(task.Id)}/details`);
        const detailTask = details?.Task || task;
        const state = detailTask.State || task.State;
        const approvalPending = hasApprovalPrecondition(task) || hasApprovalPrecondition(detailTask);

        let cr = null;
        for (const r of (details?.ActivityLogs || [])) { cr = findCrWaitNode(r); if (cr) break; }

        // It's a live CR wait when Octopus reports a pending Approval precondition,
        // or (fallback for servers that don't surface the flag in the summary) the
        // task is still Queued and its tree shows the awaiting-CR node. An Executing
        // task with no pending precondition has already been authorised — skip it so
        // we don't surface a stale "Awaiting…" log line from earlier in the run.
        const waiting = approvalPending || (cr && state === 'Queued');
        if (!waiting) return null;

        // Resolve project / environment / release. A freshly-queued task often
        // isn't in the cached space data yet, so the cache lookup misses — fall
        // back to the IDs the details payload always carries (Task.ProjectId and
        // Arguments.DeploymentId) and fetch the deployment doc directly. The
        // release VERSION lives on the release, not the deployment, so resolve it
        // too rather than showing a raw "Releases-1598" id.
        let dep = deployByDoc[task.Id]?.d || null;
        const depId = detailTask.Arguments?.DeploymentId || dep?.Id || null;
        if (!dep && depId) dep = await softGet(`/api/${sid}/deployments/${encodeURIComponent(depId)}`);

        const projId = dep?.ProjectId || detailTask.ProjectId || null;
        const project = projId ? (maps.proj[projId] || projId) : (task.Description || null);
        const environment = dep?.EnvironmentId ? (maps.env[dep.EnvironmentId] || dep.EnvironmentId) : null;
        let release = dep?.ReleaseVersion || null;
        if (!release && dep?.ReleaseId) {
          const rel = await softGet(`/api/${sid}/releases/${encodeURIComponent(dep.ReleaseId)}`);
          release = rel?.Version || dep.ReleaseId;
        }

        const crNumber = cr?.crNumber || null;
        // Tidy "What's waiting": name the ITSM provider (from the wait-node name)
        // instead of dumping the raw markdown log line — the CR number/link now
        // has its own column.
        const nodeName = cr?.node?.Name || '';
        const provider = /service\s*now/i.test(nodeName) ? 'ServiceNow'
          : /jira/i.test(nodeName) ? 'Jira Service Desk'
          : 'change request';
        const detail = `Awaiting ${provider} approval`;

        return {
          space: spaceName,
          taskId: task.Id,
          title: crNumber ? `Awaiting change request ${crNumber}` : (cr?.node?.Name || 'Awaiting change request'),
          detail,
          crNumber,
          crTitle: cr?.crTitle || null,
          crUrl: cr?.crUrl || null,
          provider,
          project, environment, release,
          since: task.QueueTime || task.StartTime || detailTask.QueueTime || null,
          url: root ? `${root}/app#/${encodeURIComponent(sid)}/tasks/${encodeURIComponent(task.Id)}` : null,
        };
      }));
      for (const f of found) if (f) result.push(f);
    }
    return result;
  }

  // ---- Compliance-policy blocks (governance gate, enterprise) ----
  //
  // A blocked compliance evaluation prevents a deployment. There's no live
  // "currently blocked" list, so we read the audit events in the lookback
  // window and dedupe to the most recent block per deployment/release.
  async function fetchComplianceBlocks(allSpaceData, maps, fromISO) {
    const root = OctopusApi.getInstanceUrl() || '';
    const out = [];
    out._denied = false;

    await Promise.all(Object.entries(allSpaceData).map(async ([sid, sd]) => {
      const spaceName = sd.space?.Name || sid;
      const res = await softGetEvents(`/api/${sid}/events?eventCategories=CompliancePolicyEvaluatedNonCompliantBlocked&from=${fromISO}&take=200`);
      if (res.denied) { out._denied = true; return; }
      for (const evt of res.items) {
        const docs = evt.RelatedDocumentIds || [];
        const projId = docs.find(d => d.startsWith('Projects-'));
        const relId = docs.find(d => d.startsWith('Releases-'));
        const depId = docs.find(d => d.startsWith('Deployments-'));
        const envId = docs.find(d => d.startsWith('Environments-'));
        out.push({
          space: spaceName, spaceId: sid,
          occurred: evt.Occurred,
          message: evt.Message || 'Blocked by compliance policy',
          project: projId ? (maps.proj[projId] || projId) : null,
          environment: envId ? (maps.env[envId] || envId) : null,
          // Collapse retries of the same deployment/release/project; when an event
          // carries none of those ids, fall back to its unique event Id so two
          // distinct blocks with the same timestamp don't merge into one row.
          dedupeKey: depId || relId || (projId ? projId + '|' + (evt.Occurred || '') : (evt.Id || sid + '|' + (evt.Occurred || '') + '|' + out.length)),
          url: (root && projId)
            ? `${root}/app#/${encodeURIComponent(sid)}/projects/${encodeURIComponent(projId)}`
            : null,
        });
      }
    }));

    // newest first, one row per deployment/release
    out.sort((a, b) => new Date(b.occurred) - new Date(a.occurred));
    const seen = new Set();
    const deduped = out.filter(b => { if (seen.has(b.dedupeKey)) return false; seen.add(b.dedupeKey); return true; });
    deduped._denied = out._denied;
    deduped._total = out.length;
    return deduped;
  }

  // ---- Main fetch ----

  async function fetch() {
    if (_loaded) return _data;
    if (_loading) return null;
    _loading = true;
    const myGen = _gen; // if reset() bumps _gen while we're awaiting, our result is stale

    const log = window._debug || console.log;

    try {
      const allSpaceData = DashboardData.getAllSpaceData();
      const activeSpaceIds = Object.keys(allSpaceData);
      const fromDate = new Date(Date.now() - LOOKBACK_DAYS * 86400000);
      const fromISO = fromDate.toISOString();

      // Space data isn't ready yet — a refresh clears DashboardData's per-space
      // map (data.js: `_spaceData = {}`) and repopulates it asynchronously, so a
      // fetch that lands in that window would otherwise compute an all-empty
      // result and cache it (every section turns "green"). Bail WITHOUT marking
      // loaded so the view retries once the reload finishes.
      if (activeSpaceIds.length === 0) {
        log('Interventions: space data not ready yet — deferring (will retry)');
        _loading = false;
        return null;
      }

      log('Interventions: fetching data for ' + activeSpaceIds.length + ' spaces...');

      // Per-space: interruptions (incl. resolved), the resume events that mark
      // when each interruption was answered, and teams (for responsible names).
      // safeGet rethrows 401/403 (by design, so a total lack of access surfaces a
      // permission error). But this runs per-space inside Promise.all, so a single
      // space the user can't read would reject the whole batch and break the entire
      // tab even when other spaces are accessible. softAuth catches 401/403 PER CALL
      // (so e.g. a TeamView denial can't also hide readable interruptions) and marks
      // the space denied; the render then shows a "couldn't read N spaces" banner
      // rather than a misleading all-clear. We only fail hard when interruptions are
      // unreadable in EVERY space (handled after the loop).
      const softAuth = (p) => p.then(v => ({ v, denied: false }), e => {
        const s = e && (e.status || e.statusCode || (e.response && e.response.status));
        if (s === 401 || s === 403) return { v: null, denied: true };
        throw e;
      });
      const perSpace = {};
      await Promise.all(activeSpaceIds.map(async (sid) => {
        const [intrR, eventsResult, teamsR] = await Promise.all([
          softAuth(safeGet(`/api/${sid}/interruptions?take=500&pendingOnly=false`)),
          softGetEvents(`/api/${sid}/events?eventCategories=DeploymentResumed,RunbookRunResumed&from=${fromISO}&take=500`),
          softAuth(safeGet(`/api/${sid}/teams/all`)),
        ]);
        perSpace[sid] = {
          interruptions: intrR.v?.Items || [],
          interruptionsOk: intrR.v != null,       // false => denied (401/403) or swallowed non-auth error
          interruptionsDenied: intrR.denied,      // true => specifically a permission denial
          resumeEvents: eventsResult.items,
          eventsDenied: eventsResult.denied,
          teams: teamsR.v || [],
        };
      }));

      // Only used to resolve responsible-user display names — a permission denial
      // here shouldn't break the tab, so tolerate auth errors and fall back to ids.
      const users = (await softAuth(safeGet('/api/users?take=500'))).v;

      // Diagnostics — surface exactly what the interruptions endpoint returned
      // per space, so an empty tab can be told apart from a fetch problem.
      let diagTotal = 0, diagPending = 0, diagDenied = false, diagErrored = 0, diagIntDenied = 0;
      for (const sid of activeSpaceIds) {
        const ps = perSpace[sid];
        const n = ps.interruptions.length;
        const p = ps.interruptions.filter(i => i.IsPending).length;
        diagTotal += n;
        diagPending += p;
        if (ps.eventsDenied) diagDenied = true;
        if (ps.interruptionsDenied) diagIntDenied++;
        if (!ps.interruptionsOk) diagErrored++;
        log(`Interventions: ${(allSpaceData[sid].space?.Name || sid)} → ${ps.interruptionsOk ? n + ' interruptions (' + p + ' pending)' : (ps.interruptionsDenied ? 'PERMISSION DENIED' : 'FETCH ERROR')}, ${ps.resumeEvents.length} resume events${ps.eventsDenied ? ' [events DENIED]' : ''}`);
      }
      log(`Interventions: scanned ${activeSpaceIds.length} spaces — ${diagTotal} interruptions total (${diagPending} pending)${diagErrored ? `, ${diagErrored} space(s) errored on interruptions fetch` : ''}`);

      log('Interventions: computing analytics...');
      const result = computeInterventions(allSpaceData, perSpace, users?.Items || [], fromDate);
      result.diag = {
        spacesScanned: activeSpaceIds.length,
        totalInterruptions: diagTotal, totalPending: diagPending,
        eventsDenied: diagDenied,
        erroredSpaces: diagErrored,
        // true when EVERY scanned space denied interruptions — render an explicit
        // permission message rather than a misleading "all clear".
        allInterruptionsDenied: diagIntDenied > 0 && diagIntDenied === activeSpaceIds.length,
      };

      // Other "deployment is held / gated" surfaces, fetched in parallel. Each
      // soft-fails independently so one missing permission or feature never
      // breaks the page.
      const maps = buildGlobalMaps(allSpaceData);
      log('Interventions: scanning for blocked releases, freezes, change requests & compliance blocks...');
      const [blockedReleases, freezes, changeRequests, complianceBlocks] = await Promise.all([
        fetchBlockedReleases(allSpaceData),
        fetchDeploymentFreezes(maps),
        fetchChangeRequests(allSpaceData, maps),
        fetchComplianceBlocks(allSpaceData, maps, fromISO),
      ]);
      result.blockedReleases = blockedReleases;
      result.freezes = freezes;
      result.changeRequests = changeRequests;
      result.complianceBlocks = complianceBlocks;

      // A Refresh (reset()) may have landed while we were awaiting; the snapshot
      // we built is from the pre-refresh space data. Discard it WITHOUT caching so
      // the view's retry loop re-fetches against the fresh data.
      if (myGen !== _gen) {
        log('Interventions: discarding stale fetch result (refreshed mid-flight)');
        return null;
      }

      _data = result;
      _loaded = true;
      log('Interventions: done', {
        pending: _data.pending.length,
        resolved: _data.kpis.totalResolved,
        measured: _data.kpis.measuredCount,
        blocked: _data.blockedReleases.length,
        freezesActive: freezes._activeCount || 0,
        changeRequests: changeRequests.length,
        complianceBlocks: complianceBlocks.length,
      });
      return _data;

    } catch (err) {
      log('Interventions fetch error: ' + err.message);
      _loading = false;
      throw err;
    } finally {
      _loading = false;
    }
  }

  // ---- Analytics computation ----

  function classifyType(t) {
    if (t === 'GuidedFailure') return 'guided';
    if (t === 'ManualIntervention') return 'manual';
    return 'other';
  }

  function weekStartUTC(ms) {
    const d = new Date(ms);
    const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow);
  }

  function quantile(sorted, q) {
    if (!sorted.length) return null;
    const pos = (sorted.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    return sorted[base + 1] !== undefined
      ? sorted[base] + rest * (sorted[base + 1] - sorted[base])
      : sorted[base];
  }

  function computeInterventions(allSpaceData, perSpace, users, fromDate) {
    const now = new Date();
    const nowMs = now.getTime();
    const fromMs = fromDate.getTime();
    const root = OctopusApi.getInstanceUrl() || '';

    const userMap = {};
    for (const u of users) userMap[u.Id] = u;
    const teamMap = {};
    for (const sd of Object.values(perSpace)) {
      for (const t of (sd.teams || [])) teamMap[t.Id] = t;
    }

    // resume timestamps keyed by every related document id (deployment/task/...)
    const resumeByDoc = {};
    let anyEventsDenied = false;
    let anyEventsLoaded = false;
    for (const sd of Object.values(perSpace)) {
      if (sd.eventsDenied) anyEventsDenied = true;
      if (sd.resumeEvents.length) anyEventsLoaded = true;
      for (const evt of sd.resumeEvents) {
        const ts = Date.parse(evt.Occurred);
        if (isNaN(ts)) continue;
        for (const docId of (evt.RelatedDocumentIds || [])) {
          (resumeByDoc[docId] || (resumeByDoc[docId] = [])).push(ts);
        }
      }
    }
    for (const k of Object.keys(resumeByDoc)) resumeByDoc[k].sort((a, b) => a - b);

    const resumeAfter = (docIds, createdMs) => {
      let best = null;
      for (const id of docIds) {
        const arr = resumeByDoc[id];
        if (!arr) continue;
        for (const ts of arr) {
          if (ts >= createdMs) { if (best === null || ts < best) best = ts; break; }
        }
      }
      return best;
    };

    const pending = [];
    const resolved = [];
    const durations = [];            // wait minutes for resolved+measured
    const weekMap = {};              // weekStartMs -> bucket
    const envMap = {};               // env name -> { count, waits[] }
    const projMap = {};              // project name -> { count, waits[] }

    const tally = (map, key, waitMins) => {
      if (!key) return;
      const e = map[key] || (map[key] = { count: 0, waits: [] });
      e.count++;
      if (waitMins != null) e.waits.push(waitMins);
    };

    const bucketFor = (createdMs) => {
      const ws = weekStartUTC(createdMs);
      return weekMap[ws] || (weekMap[ws] = { ws, count: 0, manual: 0, guided: 0, other: 0, waits: [] });
    };

    for (const [spaceId, sd] of Object.entries(allSpaceData)) {
      const spaceName = sd.space?.Name || spaceId;
      const envNames = sd.envNames || {};
      const projectNames = sd.projectNames || {};
      const deployments = sd.deployments || [];
      const interruptions = (perSpace[spaceId] || {}).interruptions || [];

      const deployByDoc = {};
      for (const d of deployments) {
        if (d.TaskId) deployByDoc[d.TaskId] = d;
        deployByDoc[d.Id] = d;
      }

      for (const intr of interruptions) {
        const createdMs = Date.parse(intr.Created);
        if (isNaN(createdMs)) continue;

        const docIds = Array.from(new Set([...(intr.RelatedDocumentIds || []), intr.TaskId].filter(Boolean)));
        const d = docIds.map(id => deployByDoc[id]).find(Boolean) || null;
        const project = d ? (projectNames[d.ProjectId] || d.ProjectId || null) : null;
        const release = d ? (d.ReleaseVersion || d.ReleaseId || null) : null;
        const environment = d ? (envNames[d.EnvironmentId] || d.EnvironmentId || null) : null;
        const kind = classifyType(intr.Type);

        if (intr.IsPending) {
          const teamNames = (intr.ResponsibleTeamIds || []).map(id => teamMap[id]?.Name || id).filter(Boolean);
          const respUser = intr.ResponsibleUserId
            ? (userMap[intr.ResponsibleUserId]?.DisplayName || userMap[intr.ResponsibleUserId]?.Username || intr.ResponsibleUserId)
            : null;
          pending.push({
            title: intr.Title || 'Manual intervention',
            type: intr.Type || 'ManualIntervention',
            created: intr.Created,
            waitMins: Math.max(0, (nowMs - createdMs) / 60000),
            space: spaceName,
            spaceId,
            taskId: intr.TaskId || null,
            project, release, environment,
            responsibleTeams: teamNames,
            responsibleUser: respUser,
            url: (root && intr.TaskId)
              ? `${root}/app#/${encodeURIComponent(spaceId)}/tasks/${encodeURIComponent(intr.TaskId)}`
              : (root ? `${root}/app#/${encodeURIComponent(spaceId)}/tasks` : null),
          });
          continue;
        }

        // Resolved — only count those raised within the lookback window.
        if (createdMs < fromMs) continue;

        const resumeMs = resumeAfter(docIds, createdMs);
        let waitMins = null;
        if (resumeMs != null) {
          const w = (resumeMs - createdMs) / 60000;
          if (w >= 0 && w <= MAX_WAIT_MIN) waitMins = w;
        }

        resolved.push({
          title: intr.Title || 'Manual intervention',
          type: intr.Type || 'ManualIntervention',
          kind,
          created: intr.Created,
          waitMins,
          space: spaceName,
          project, release, environment,
        });

        const bucket = bucketFor(createdMs);
        bucket.count++;
        bucket[kind]++;

        if (waitMins != null) {
          durations.push(waitMins);
          bucket.waits.push(waitMins);
        }
        tally(envMap, environment, waitMins);
        tally(projMap, project, waitMins);
      }
    }

    // Build a continuous weekly series so quiet weeks still appear.
    const weeks = [];
    for (let ws = weekStartUTC(fromMs); ws <= nowMs; ws += 7 * 86400000) {
      const b = weekMap[ws] || { ws, count: 0, manual: 0, guided: 0, other: 0, waits: [] };
      const avgWait = b.waits.length ? b.waits.reduce((a, c) => a + c, 0) / b.waits.length : 0;
      const d = new Date(ws);
      weeks.push({
        ws,
        label: d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()],
        rangeLabel: `Week of ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
        count: b.count, manual: b.manual, guided: b.guided, other: b.other,
        measured: b.waits.length,
        avgWait,
      });
    }

    const sortedDur = durations.slice().sort((a, b) => a - b);
    const mean = sortedDur.length ? sortedDur.reduce((a, c) => a + c, 0) / sortedDur.length : null;

    const toBreakdown = (map) => Object.entries(map)
      .map(([name, v]) => ({
        name,
        count: v.count,
        avgWait: v.waits.length ? v.waits.reduce((a, c) => a + c, 0) / v.waits.length : null,
      }))
      .sort((a, b) => b.count - a.count);

    const pendingSorted = pending.slice().sort((a, b) => new Date(a.created) - new Date(b.created));
    const longestPending = pendingSorted.length ? pendingSorted[0].waitMins : null;

    return {
      period: { from: fromDate, to: now, days: LOOKBACK_DAYS },
      timing: {
        available: anyEventsLoaded || !anyEventsDenied, // true unless permission blocked everywhere
        denied: anyEventsDenied && !anyEventsLoaded,
      },
      kpis: {
        avgWait: mean,
        medianWait: quantile(sortedDur, 0.5),
        p90Wait: quantile(sortedDur, 0.9),
        totalInterventions: resolved.length + pending.length,
        totalResolved: resolved.length,
        measuredCount: durations.length,
        pendingCount: pending.length,
        longestPendingMins: longestPending,
      },
      weeks,
      byEnvironment: toBreakdown(envMap),
      byProject: toBreakdown(projMap),
      pending: pendingSorted,
      resolved,
      blockedReleases: [],
      freezes: [],
      changeRequests: [],
      complianceBlocks: [],
    };
  }

  // ---- CSV export ----

  function fmtMinForCsv(mins) {
    return mins == null ? '' : Math.round(mins);
  }

  function generateHistoryCSV() {
    if (!_data) return null;
    const lines = [];
    const esc = (v) => {
      const s = String(v == null ? '' : v);
      return s.includes(',') || s.includes('"') || s.includes('\n') ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const row = (...vals) => lines.push(vals.map(esc).join(','));

    lines.push('# Interventions & Approvals');
    lines.push(`# Period: ${_data.period.from.toISOString().slice(0, 10)} to ${_data.period.to.toISOString().slice(0, 10)} (${_data.period.days} days)`);
    lines.push(`# Generated: ${new Date().toISOString()}`);
    lines.push(`# Server: ${OctopusApi.getInstanceUrl()}`);
    lines.push('');

    row('Raised', 'Status', 'Type', 'Project', 'Release', 'Environment', 'Space', 'Wait (minutes)');
    for (const p of _data.pending) {
      row(p.created, 'Pending', p.type, p.project, p.release, p.environment, p.space, fmtMinForCsv(p.waitMins));
    }
    for (const r of _data.resolved.slice().sort((a, b) => new Date(b.created) - new Date(a.created))) {
      row(r.created, 'Resolved', r.type, r.project, r.release, r.environment, r.space, fmtMinForCsv(r.waitMins));
    }

    const crs = _data.changeRequests || [];
    if (crs.length) {
      lines.push('');
      lines.push('# Change Requests (ITSM) — deployments waiting on a change request');
      row('Space', 'Project', 'Release', 'Environment', 'Waiting since', 'Change request', 'Detail');
      for (const c of crs) row(c.space, c.project, c.release, c.environment, c.since, c.crNumber || '--', c.detail || c.title);
    }

    const cb = _data.complianceBlocks || [];
    if (cb.length) {
      lines.push('');
      lines.push(`# Compliance Blocks — last ${_data.period.days} days`);
      row('Occurred', 'Space', 'Project', 'Environment', 'Reason');
      for (const b of cb) row(b.occurred, b.space, b.project, b.environment, b.message);
    }

    const fz = _data.freezes || [];
    if (fz.length) {
      lines.push('');
      lines.push('# Deployment Freezes — active & upcoming');
      row('Freeze', 'Status', 'Recurring', 'Start', 'End', 'Projects', 'Environments', 'Tenant-scoped');
      for (const f of fz) row(f.name, f.status, f.recurring ? 'yes' : 'no', f.start, f.end, f.projectCount, f.envCount, f.tenantScoped ? 'yes' : 'no');
    }

    return lines.join('\n');
  }

  function reset() {
    _data = null;
    _loaded = false;
    _loading = false;
    _gen++; // invalidate any fetch still in flight so it can't cache a pre-refresh snapshot
  }

  return {
    fetch,
    getData: () => _data,
    isLoaded: () => _loaded,
    generateHistoryCSV,
    reset,
  };

})();


// ==========================================================================
// ComplianceView — rendering
// ==========================================================================

const ComplianceView = (() => {

  const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // ---- shared formatting ----

  function ageString(iso) {
    if (!iso) return '--';
    const mins = (Date.now() - new Date(iso).getTime()) / 60000;
    if (mins < 1) return 'just now';
    if (mins < 60) return Math.round(mins) + 'm';
    const hrs = mins / 60;
    if (hrs < 24) return Math.round(hrs) + 'h';
    return Math.round(hrs / 24) + 'd';
  }

  function fmtDuration(mins) {
    if (mins == null) return '–';
    if (mins < 1) return '<1m';
    if (mins < 60) return Math.round(mins) + 'm';
    if (mins < 1440) return (mins / 60).toFixed(1) + 'h';
    return (mins / 1440).toFixed(1) + 'd';
  }

  function typeMeta(t) {
    if (t === 'GuidedFailure') return { label: 'Guided Failure', cls: 'danger' };
    if (t === 'ManualIntervention') return { label: 'Manual Intervention', cls: 'warning' };
    const label = String(t || 'Intervention').replace(/([a-z])([A-Z])/g, '$1 $2');
    return { label, cls: 'info' };
  }

  function escAttr(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ---- page shell ----

  function render(summary) {
    return `
    <div class="page-header">
      <div class="flex items-center justify-between" style="flex-wrap:wrap;gap:var(--space-sm);">
        <div>
          <h1 class="page-title">Interventions</h1>
          <p class="page-subtitle">Everything holding a deployment right now &mdash; approvals, change requests, defects, compliance &amp; freezes &mdash; and how long approvals take over time.</p>
        </div>
        <button class="btn btn-loud btn-sm" id="btn-interventions-export">
          <i class="fa-solid fa-file-csv"></i>
          Export CSV
        </button>
      </div>
    </div>

    <!-- Live operational section -->
    <div id="pending-now"></div>

    <!-- Approval analytics over time -->
    <div id="approval-analytics">
      <div class="compliance-loading">
        <div class="compliance-loading-spinner"><i class="fa-solid fa-stopwatch fa-spin"></i></div>
        <h3>Loading intervention data&hellip;</h3>
        <p class="text-secondary">Fetching interruptions and approval timing across all spaces.</p>
      </div>
    </div>`;
  }

  function wire(summary) {
    const exportBtn = document.getElementById('btn-interventions-export');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        if (!ComplianceData.isLoaded()) return;
        const csv = ComplianceData.generateHistoryCSV();
        if (csv) downloadFile(csv, `octopus-interventions-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv');
      });
    }

    // Token guards against a stale render: if the user navigates away and back
    // (or refreshes) while a retry is pending, only the latest wire() writes.
    const myToken = (wire._token = (wire._token || 0) + 1);
    const MAX_RETRIES = 40; // ~12s of 300ms polls — covers a slow reload

    const showError = (err) => {
      if (wire._token !== myToken) return;
      const analyticsEl = document.getElementById('approval-analytics');
      if (!analyticsEl) return;
      analyticsEl.innerHTML = `
        <div class="card"><div class="card-body" style="text-align:center;padding:var(--space-xl);">
          <i class="fa-solid fa-triangle-exclamation text-danger" style="font-size:2rem;margin-bottom:var(--space-md);display:block;"></i>
          <h3 style="font:var(--textHeadingSmall);color:var(--colorTextPrimary);">Failed to load intervention data</h3>
          <p class="text-secondary" style="margin-top:var(--space-xs);">${DOMPurify.sanitize(err.message)}</p>
          <p class="text-tertiary" style="font:var(--textBodyRegularXSmall);margin-top:var(--space-sm);">
            Reading interruptions requires the InterruptionView permission.
          </p>
        </div></div>`;
    };

    const pump = (attempt) => {
      if (wire._token !== myToken) return; // a newer wire() superseded us
      ComplianceData.fetch().then(data => {
        if (wire._token !== myToken) return;
        // fetch() returns null while another fetch is in flight, or when space
        // data isn't ready yet (cleared mid-refresh). Retry until it resolves
        // so the view never gets stuck on a spinner or a stale empty result.
        if (!data) {
          if (ComplianceData.isLoaded()) data = ComplianceData.getData();
          else if (attempt < MAX_RETRIES) { setTimeout(() => pump(attempt + 1), 300); return; }
        }
        if (!data) return;
        const pendingEl = document.getElementById('pending-now');
        if (pendingEl) { pendingEl.innerHTML = renderPendingSection(data); wireBlockerFilters(pendingEl); }
        const analyticsEl = document.getElementById('approval-analytics');
        if (analyticsEl) analyticsEl.innerHTML = renderAnalytics(data);
      }).catch(showError);
    };

    pump(0);
  }

  // ======================================================================
  // 1. Blockers (live) — one unified table across all five held surfaces
  // ======================================================================

  // The five "something is held" surfaces share one question — what's blocking a
  // deploy right now, and why — so they render as ONE table with a Type badge and
  // a filter/count strip. Each category keeps its availability state (ok / empty /
  // denied / unavailable) so the strip still shows the reassuring "0 ✓" and the
  // "needs permission" signals the old separate cards used to.
  const BLOCKER_CATS = [
    { key: 'action',     label: 'Awaiting action', icon: 'fa-hand' },
    { key: 'change',     label: 'Change request',  icon: 'fa-clipboard-check' },
    { key: 'blocked',    label: 'Blocked',         icon: 'fa-ban' },
    { key: 'compliance', label: 'Compliance',      icon: 'fa-scale-balanced' },
    { key: 'freeze',     label: 'Freeze',          icon: 'fa-snowflake' },
  ];
  const catIndex = (k) => BLOCKER_CATS.findIndex(c => c.key === k);

  function actionLink(url) {
    return url
      ? `<a class="btn btn-secondary btn-sm" href="${DOMPurify.sanitize(url)}" target="_blank" rel="noopener">Open <i class="fa-solid fa-arrow-up-right-from-square"></i></a>`
      : '';
  }
  function envCell(env) {
    return env ? `<span class="env-tag">${DOMPurify.sanitize(env)}</span>` : '<span class="text-tertiary">--</span>';
  }
  function crLinkHtml(crNumber, crUrl, crTitle) {
    if (!crNumber) return '';
    const num = DOMPurify.sanitize(crNumber);
    return crUrl
      ? `<a class="monospace" href="${DOMPurify.sanitize(crUrl)}" target="_blank" rel="noopener" title="${escAttr(crTitle || crNumber)}">${num} <i class="fa-solid fa-arrow-up-right-from-square" style="font-size:0.75em;"></i></a>`
      : `<span class="monospace" title="${escAttr(crTitle || '')}">${num}</span>`;
  }

  // Normalize every source into one row shape and tally per-category state.
  function buildBlockerRows(data) {
    const rows = [];
    const counts = {}; const states = {};
    BLOCKER_CATS.forEach(c => { counts[c.key] = 0; states[c.key] = 'ok'; });
    const footnotes = [];

    // 1. Awaiting action — interruptions
    for (const p of (data.pending || [])) {
      const tm = typeMeta(p.type);
      const responsible = p.responsibleTeams && p.responsibleTeams.length
        ? p.responsibleTeams.join(', ')
        : (p.responsibleUser || 'Anyone with access');
      const detailBits = [];
      if (p.title) detailBits.push(DOMPurify.sanitize(p.title));
      detailBits.push(`<span class="text-tertiary">${DOMPurify.sanitize(responsible)}</span>`);
      rows.push({
        cat: 'action', badge: tm,
        project: p.project || null, release: p.release || null,
        environment: p.environment || null, space: p.space || null,
        ageIso: p.created || null,
        detailHtml: detailBits.join(' · '),
        url: p.url || null,
      });
    }
    counts.action = (data.pending || []).length;

    // 2. Change requests (ITSM)
    const crs = data.changeRequests || [];
    if (crs._denied) states.change = 'unavailable';
    for (const c of crs) {
      const bits = [];
      if (c.crNumber) bits.push(crLinkHtml(c.crNumber, c.crUrl, c.crTitle));
      if (c.provider && c.provider !== 'change request') bits.push(`<span class="text-tertiary">${DOMPurify.sanitize(c.provider)}</span>`);
      if (!bits.length) bits.push(DOMPurify.sanitize(c.detail || 'Awaiting change request approval'));
      rows.push({
        cat: 'change', badge: { label: 'Change request', cls: 'warning' },
        project: c.project || null, release: c.release || null,
        environment: c.environment || null, space: c.space || null,
        ageIso: c.since || null,
        detailHtml: bits.join(' · '),
        url: c.url || null,
      });
    }
    counts.change = crs.length;
    if (crs._capped) footnotes.push(`Change-request scan capped at ${crs._scanned} active tasks — more are running.`);

    // 3. Blocked releases (unresolved defect)
    const blocked = data.blockedReleases || [];
    for (const b of blocked) {
      const bits = ['Unresolved defect'];
      if (b.channel) bits.push(`<span class="text-tertiary">${DOMPurify.sanitize(b.channel)}</span>`);
      rows.push({
        cat: 'blocked', badge: { label: 'Blocked', cls: 'danger' },
        project: b.project || null, release: b.version || null,
        environment: null, space: b.space || null,
        ageIso: null,
        detailHtml: bits.join(' · '),
        url: b.url || null,
      });
    }
    counts.blocked = blocked.length;
    if (blocked._truncated) footnotes.push(`Defect scan covered ${blocked._projectsScanned} of ${blocked._projectsTotal} projects (cap reached).`);

    // 4. Compliance blocks
    const cblocks = data.complianceBlocks || [];
    if (cblocks._denied && !cblocks.length) states.compliance = 'unavailable';
    for (const b of cblocks) {
      rows.push({
        cat: 'compliance', badge: { label: 'Compliance', cls: 'danger' },
        project: b.project || null, release: null,
        environment: b.environment || null, space: b.space || null,
        ageIso: b.occurred || null,
        detailHtml: DOMPurify.sanitize(b.message || 'Blocked by compliance policy'),
        url: b.url || null,
      });
    }
    counts.compliance = cblocks.length;

    // 5. Deployment freezes
    const freezes = data.freezes || [];
    if (freezes._supported === false) states.freeze = 'unavailable';
    for (const f of freezes) {
      const scopeParts = [];
      if (f.projectCount) scopeParts.push(`${f.projectCount} project${f.projectCount === 1 ? '' : 's'}`);
      if (f.envCount) scopeParts.push(`${f.envCount} environment${f.envCount === 1 ? '' : 's'}`);
      if (f.tenantScoped) scopeParts.push('tenant-scoped');
      const scopeTitle = escAttr([
        f.projNames && f.projNames.length ? 'Projects: ' + f.projNames.join(', ') : '',
        f.envNames && f.envNames.length ? 'Environments: ' + f.envNames.join(', ') : '',
      ].filter(Boolean).join(' — '));
      const freezeWindow = `${fmtDateTime(f.start)} &ndash; ${fmtDateTime(f.end)}`;
      const scope = scopeParts.length ? ` · <span class="text-tertiary" title="${scopeTitle}">${scopeParts.join(', ')}</span>` : '';
      rows.push({
        cat: 'freeze',
        badge: { label: f.status === 'active' ? 'Freeze · active' : 'Freeze · upcoming', cls: f.status === 'active' ? 'danger' : 'warning' },
        project: f.name || null, release: null,
        environment: null, space: null,
        ageIso: null,
        detailHtml: `<span class="text-secondary">${freezeWindow}</span>${scope}`,
        url: f.url || null,
      });
    }
    counts.freeze = freezes.length;

    // Oldest-waiting first (longest stuck = highest priority); ageless rows
    // (blocked/freeze) sort last, grouped by category order.
    const ageMs = (iso) => (iso ? (Date.now() - new Date(iso).getTime()) : -1);
    rows.sort((a, b) => {
      const am = ageMs(a.ageIso), bm = ageMs(b.ageIso);
      if (am !== bm) return bm - am;
      return catIndex(a.cat) - catIndex(b.cat);
    });

    const cats = BLOCKER_CATS.map(c => ({ ...c, count: counts[c.key], state: states[c.key] }));
    return { rows, cats, footnotes };
  }

  // buildBlockerRows is pure over `data` (one fetch snapshot) but both the table
  // and the analytics section need it — memoize on the snapshot so each render
  // normalizes + sanitizes + sorts the rows once, not twice.
  function getBlockerRows(data) {
    if (!data._blockers) data._blockers = buildBlockerRows(data);
    return data._blockers;
  }

  function renderPendingSection(data) {
    const { rows, cats, footnotes } = getBlockerRows(data);
    const total = rows.length;

    // ---- filter / count strip (one badge rule, used by the All chip and every category) ----
    const countBadge = (key, count, state) => {
      if (state === 'unavailable') return `<span class="badge neutral">n/a</span>`;
      if (count === 0) return `<span class="badge success">0</span>`;
      return `<span class="badge ${key === 'blocked' || key === 'compliance' ? 'danger' : 'warning'}">${count}</span>`;
    };
    const chip = (key, label, count, state, active, icon) =>
      `<button class="blocker-chip${active ? ' active' : ''}" data-filter="${key}" type="button" aria-pressed="${active ? 'true' : 'false'}">${
        icon ? `<i class="fa-solid ${icon}" style="opacity:.6;margin-right:.35em;"></i>` : ''
      }${label} ${countBadge(key, count, state)}</button>`;
    const strip = `<div class="blocker-filters" id="blocker-filters">
      ${chip('all', 'All', total, 'ok', true)}
      ${cats.map(c => chip(c.key, c.label, c.count, c.state, false, c.icon)).join('')}
    </div>`;

    const header = `
    <div class="section-header">
      <h2 class="section-title"><i class="fa-solid fa-hand"></i> Blockers</h2>
      <span class="badge ${total ? 'warning' : 'success'}">${total ? `${total} active` : 'all clear'}</span>
    </div>
    ${strip}`;

    // A space whose interruptions fetch errored contributes zero rows — without
    // this banner it would silently masquerade as "all clear" and hide a real
    // pending intervention. Surfaced in both the empty and populated branches.
    const errN = data.diag?.erroredSpaces || 0;
    const allDenied = data.diag?.allInterruptionsDenied;
    const errMsg = allDenied
      ? `Interruptions couldn't be read in <strong>any</strong> space &mdash; this needs the <strong>InterruptionView</strong> permission. Approvals &amp; manual interventions are <strong>not shown</strong>.`
      : `Couldn't read interruptions in <strong>${errN}</strong> space${errN === 1 ? '' : 's'} &mdash; any pending interventions there are <strong>not shown</strong> below.`;
    const errNote = errN
      ? `<div class="card" style="margin-bottom:var(--space-sm);"><div class="card-body" style="padding:var(--space-md);">
          <i class="fa-solid fa-triangle-exclamation text-warning"></i>
          <span class="text-secondary" style="margin-left:var(--space-xs);">${errMsg}</span>
        </div></div>`
      : '';

    if (!total) {
      const diag = data.diag;
      const scan = diag
        ? `<div class="text-tertiary" style="font:var(--textBodyRegularXSmall);margin-top:var(--space-xs);">Scanned ${diag.spacesScanned} space${diag.spacesScanned === 1 ? '' : 's'} · ${diag.totalInterruptions} interruption${diag.totalInterruptions === 1 ? '' : 's'} reviewed</div>`
        : '';
      return `${header}
      ${errNote}
      <div class="card"><div class="card-body" style="text-align:center;padding:var(--space-lg);">
        <i class="fa-solid fa-circle-check text-success" style="font-size:1.5rem;display:block;margin-bottom:var(--space-xs);"></i>
        <span class="text-secondary">${errN ? 'No blockers found in the spaces that loaded' : 'Nothing is holding a deployment right now'} &mdash; no approvals, change requests, defects, compliance blocks or freezes.</span>
        ${scan}
      </div></div>`;
    }

    const foot = footnotes.length
      ? `<div class="card-footer text-tertiary">${footnotes.map(f => DOMPurify.sanitize(f)).join(' ')}</div>`
      : '';

    return `${header}
    ${errNote}
    <div class="card"><div class="card-body" style="padding:0;">
      <div class="table-wrapper"><table>
        <thead><tr>
          <th>Type</th><th>Project</th><th>Release</th><th>Environment</th>
          <th>Space</th><th>Waiting</th><th>Detail</th><th></th>
        </tr></thead>
        <tbody>
          ${rows.map(r => `<tr data-cat="${r.cat}">
            <td><span class="badge ${r.badge.cls}">${DOMPurify.sanitize(r.badge.label)}</span></td>
            <td>${r.project ? DOMPurify.sanitize(r.project) : '<span class="text-tertiary">--</span>'}</td>
            <td class="monospace">${r.release ? DOMPurify.sanitize(r.release) : '<span class="text-tertiary">--</span>'}</td>
            <td>${envCell(r.environment)}</td>
            <td class="text-secondary">${r.space ? DOMPurify.sanitize(r.space) : '<span class="text-tertiary">--</span>'}</td>
            <td class="text-secondary" style="white-space:nowrap;">${r.ageIso ? ageString(r.ageIso) : '--'}</td>
            <td class="text-secondary">${r.detailHtml}</td>
            <td style="white-space:nowrap;">${actionLink(r.url)}</td>
          </tr>`).join('')}
        </tbody>
      </table></div>
    </div>${foot}</div>`;
  }

  // Wire the filter strip: clicking a chip shows only that category's rows.
  function wireBlockerFilters(container) {
    const strip = container.querySelector('#blocker-filters');
    if (!strip) return;
    const table = container.querySelector('table');
    strip.addEventListener('click', (e) => {
      const btn = e.target.closest('.blocker-chip');
      if (!btn) return;
      const filter = btn.getAttribute('data-filter');
      strip.querySelectorAll('.blocker-chip').forEach(c => {
        const active = c === btn;
        c.classList.toggle('active', active);
        c.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      if (!table) return;
      table.querySelectorAll('tbody tr').forEach(tr => {
        tr.style.display = (filter === 'all' || tr.getAttribute('data-cat') === filter) ? '' : 'none';
      });
    });
  }

  // Renders an absolute timestamp (freeze window start/end) in the viewer's LOCAL
  // time, matching the rest of the UI. Using getUTC* here showed freeze windows
  // several hours off for non-UTC viewers, who read them as local.
  function fmtDateTime(iso) {
    if (!iso) return '--';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '--';
    return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }


  // ======================================================================
  // 2. Approval Analytics (over time)
  // ======================================================================

  function kpiCard(label, value, sub) {
    return `<div class="kpi-card">
      <div class="kpi-label">${label}</div>
      <div class="kpi-value">${value}</div>
      ${sub ? `<div class="kpi-trend neutral">${sub}</div>` : ''}
    </div>`;
  }

  function renderAnalytics(data) {
    const k = data.kpis;
    const timingUnavailable = k.measuredCount === 0 && data.timing.denied;

    const waitVal = (v) => (timingUnavailable ? '–' : fmtDuration(v));

    // Headline metrics are framed around ALL blockers (every category in the
    // table above), not just interruptions. The COUNT spans all five categories;
    // resolution TIME can only be measured cheaply for interruptions today
    // (Created → DeploymentResumed), so categories we can't yet time are counted
    // but not timed, and called out in the scope note below.
    const { rows: liveRows, cats: liveCats } = getBlockerRows(data);
    const liveTotal = liveRows.length;
    const oldestRow = liveRows.find(r => r.ageIso); // rows are sorted oldest-first
    const oldestMins = oldestRow ? (Date.now() - new Date(oldestRow.ageIso).getTime()) / 60000 : null;
    const TIMED_CATS = new Set(['action']); // categories with a cheap resolution time
    const untimedActive = liveCats.filter(c => c.count > 0 && !TIMED_CATS.has(c.key)).map(c => c.label);

    const kpis = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:var(--space-md);margin-bottom:var(--space-md);">
      ${kpiCard('Blocked now', String(liveTotal), liveTotal
        ? `<span><i class="fa-solid fa-hourglass-half"></i> oldest ${oldestMins != null ? fmtDuration(oldestMins) : '--'}</span>`
        : '<span>all clear</span>')}
      ${kpiCard('Avg time to resolution', waitVal(k.avgWait), `<span><i class="fa-solid fa-stopwatch"></i> ${k.measuredCount} measured</span>`)}
      ${kpiCard('Median (p50)', waitVal(k.medianWait), '<span>typical resolution</span>')}
      ${kpiCard('Slowest (p90)', waitVal(k.p90Wait), '<span>9 in 10 faster than this</span>')}
      ${kpiCard('Resolved (90d)', String(k.totalResolved), `<span>${data.period.days}d window</span>`)}
    </div>`;

    const scopeNote = untimedActive.length
      ? `<div class="card" style="margin-bottom:var(--space-md);"><div class="card-body" style="padding:var(--space-md);">
          <i class="fa-solid fa-triangle-exclamation text-warning"></i>
          <span class="text-secondary" style="margin-left:var(--space-xs);">Resolution time is measured for manual interventions &amp; approvals only. Also blocking now but not timed: <strong>${DOMPurify.sanitize(untimedActive.join(', '))}</strong> &mdash; included in &ldquo;Blocked now&rdquo;, excluded from the timing stats above.</span>
        </div></div>`
      : '';

    const timingNote = timingUnavailable
      ? `<div class="card" style="margin-bottom:var(--space-md);"><div class="card-body" style="padding:var(--space-md);">
          <i class="fa-solid fa-circle-info text-secondary"></i>
          <span class="text-secondary" style="margin-left:var(--space-xs);">Approval timing needs the <strong>EventView</strong> permission (it's read from <code>DeploymentResumed</code> events). Volume and breakdowns below are by count only.</span>
        </div></div>`
      : '';

    // Partial denial: some spaces lacked EventView but others returned timing, so
    // the stats below are computed from an incomplete set. Without this the KPIs
    // would understate waits with no indication that data is missing.
    const partialTiming = !timingUnavailable && data.diag?.eventsDenied;
    const partialNote = partialTiming
      ? `<div class="card" style="margin-bottom:var(--space-md);"><div class="card-body" style="padding:var(--space-md);">
          <i class="fa-solid fa-triangle-exclamation text-warning"></i>
          <span class="text-secondary" style="margin-left:var(--space-xs);">Some spaces denied <strong>EventView</strong>, so the timing stats and charts below are computed from a <strong>partial</strong> set and may understate real waits.</span>
        </div></div>`
      : '';

    return `
    <div class="section-header" style="margin-top:var(--space-lg);">
      <h2 class="section-title"><i class="fa-solid fa-stopwatch"></i> Resolution Analytics</h2>
      <span class="text-tertiary" style="font:var(--textBodyRegularSmall);">Last ${data.period.days} days</span>
    </div>
    ${kpis}
    ${scopeNote}
    ${timingNote}
    ${partialNote}

    ${timingUnavailable ? '' : `
    <div class="card mb-lg"><div class="card-body">
      <h3 style="font:var(--textHeadingSmall);color:var(--colorTextPrimary);margin-bottom:var(--space-xs);">Manual approval time over time</h3>
      <p class="text-tertiary" style="font:var(--textBodyRegularXSmall);margin-bottom:var(--space-sm);">Average wait from when a manual intervention/approval is raised to when the deployment resumes, by week. (Change-request waits are not yet included.)</p>
      ${renderWaitChart(data.weeks)}
    </div></div>`}

    <div class="card mb-lg"><div class="card-body">
      <h3 style="font:var(--textHeadingSmall);color:var(--colorTextPrimary);margin-bottom:var(--space-xs);">Interventions raised over time</h3>
      <p class="text-tertiary" style="font:var(--textBodyRegularXSmall);margin-bottom:var(--space-sm);">
        <span class="legend-dot" style="background:var(--colorWarningAccent);"></span> Manual intervention
        <span class="legend-dot" style="background:var(--colorDanger);margin-left:var(--space-sm);"></span> Guided failure
        <span class="legend-dot" style="background:var(--colorBackgroundTertiary);margin-left:var(--space-sm);"></span> Other
      </p>
      ${renderVolumeChart(data.weeks)}
    </div></div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:var(--space-md);">
      ${renderBreakdownCard('Interventions by environment', 'fa-server', data.byEnvironment, timingUnavailable)}
      ${renderBreakdownCard('Interventions by project', 'fa-diagram-project', data.byProject, timingUnavailable)}
    </div>`;
  }

  function _emptyChart(msg) {
    return `<div class="text-tertiary" style="text-align:center;padding:var(--space-xl) var(--space-md);">${msg}</div>`;
  }

  function renderWaitChart(weeks) {
    if (!weeks.some(w => w.measured > 0)) {
      return _emptyChart('No approvals with measurable wait time in the last 90 days.');
    }
    const max = Math.max(...weeks.map(w => w.avgWait), 1);
    return `<div class="deployment-trend-chart"><div class="deployment-trend-bars" style="gap:8px;padding:var(--space-sm) 0;">
      ${weeks.map(w => {
        const hPx = w.avgWait > 0 ? DashboardData.trendBarPixelHeight(w.avgWait, max, 150) : 0;
        const tip = escAttr(`${w.rangeLabel}: ${w.measured} measured approval${w.measured === 1 ? '' : 's'}, avg ${w.measured ? fmtDuration(w.avgWait) : 'n/a'}`);
        return `<div class="deployment-trend-col" data-tooltip="${tip}">
          <div class="deployment-trend-value deployment-trend-value--emph">${w.measured ? fmtDuration(w.avgWait) : '–'}</div>
          <div class="deployment-trend-bar-area"><div class="deployment-trend-bar-stack" style="height:${hPx}px;">
            <div class="deployment-trend-seg" style="height:${hPx}px;background:var(--colorPrimary);border-radius:3px 3px 0 0;"></div>
          </div></div>
          <div class="deployment-trend-axis-label">${w.label}</div>
        </div>`;
      }).join('')}
    </div></div>`;
  }

  function renderVolumeChart(weeks) {
    if (!weeks.some(w => w.count > 0)) {
      return _emptyChart('No interventions recorded in the last 90 days.');
    }
    const max = Math.max(...weeks.map(w => w.count), 1);
    return `<div class="deployment-trend-chart"><div class="deployment-trend-bars" style="gap:8px;padding:var(--space-sm) 0;">
      ${weeks.map(w => {
        const hPx = w.count > 0 ? DashboardData.trendBarPixelHeight(w.count, max, 150) : 0;
        let manualH = 0, guidedH = 0, otherH = 0;
        if (w.count > 0 && hPx > 0) {
          manualH = Math.round((w.manual / w.count) * hPx);
          guidedH = Math.round((w.guided / w.count) * hPx);
          otherH = Math.max(0, hPx - manualH - guidedH);
        }
        const tip = escAttr(`${w.rangeLabel}: ${w.count} raised (${w.manual} manual, ${w.guided} guided${w.other ? ', ' + w.other + ' other' : ''})`);
        return `<div class="deployment-trend-col" data-tooltip="${tip}">
          <div class="deployment-trend-value deployment-trend-value--emph">${DashboardData.formatCompactCount(w.count)}</div>
          <div class="deployment-trend-bar-area"><div class="deployment-trend-bar-stack" style="height:${w.count > 0 ? hPx : 0}px;">
            ${guidedH > 0 ? `<div class="deployment-trend-seg" style="height:${guidedH}px;background:var(--colorDanger);border-radius:3px 3px 0 0;"></div>` : ''}
            ${otherH > 0 ? `<div class="deployment-trend-seg" style="height:${otherH}px;background:var(--colorBackgroundTertiary);"></div>` : ''}
            ${manualH > 0 ? `<div class="deployment-trend-seg" style="height:${manualH}px;background:var(--colorWarningAccent);border-radius:0 0 3px 3px;"></div>` : ''}
          </div></div>
          <div class="deployment-trend-axis-label">${w.label}</div>
        </div>`;
      }).join('')}
    </div></div>`;
  }

  function renderBreakdownCard(title, icon, items, timingUnavailable) {
    const top = items.slice(0, 8);
    const body = top.length
      ? `<div class="flex flex-col gap-sm" style="padding:var(--space-xs) 0;">
          ${(() => {
            const max = Math.max(...top.map(i => i.count), 1);
            return top.map(i => {
              const pct = Math.round(i.count / max * 100);
              const waitTxt = (!timingUnavailable && i.avgWait != null) ? ` · avg ${fmtDuration(i.avgWait)}` : '';
              return `<div>
                <div class="flex items-center justify-between" style="margin-bottom:2px;">
                  <span style="font:var(--textBodyRegularSmall);color:var(--colorTextSecondary);">${DOMPurify.sanitize(i.name)}</span>
                  <span class="monospace" style="font:var(--textBodyBoldXSmall);color:var(--colorTextPrimary);">${i.count}${waitTxt}</span>
                </div>
                <div class="progress-bar" style="width:100%;"><div class="progress-fill info" style="width:${pct}%;"></div></div>
              </div>`;
            }).join('');
          })()}
        </div>${items.length > 8 ? `<div class="text-tertiary" style="font:var(--textBodyRegularXSmall);margin-top:var(--space-xs);">+${items.length - 8} more</div>` : ''}`
      : '<div class="text-tertiary" style="text-align:center;padding:var(--space-md);">No interventions in the period</div>';

    return `<div class="card"><div class="card-body">
      <h3 style="font:var(--textHeadingSmall);color:var(--colorTextPrimary);margin-bottom:var(--space-sm);"><i class="fa-solid ${icon} text-tertiary"></i> ${title}</h3>
      ${body}
    </div></div>`;
  }

  // Uses the global downloadFile (defined in dashboard.js) — no local copy.

  return { render, wire };

})();
