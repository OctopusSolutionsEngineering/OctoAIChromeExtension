/* ==========================================================================
   Task Timeline — which projects deployed to which tenants, and when.

   Reads this instance's own Octopus API through ../api.js. One space per query,
   so the topology is a single band: projects stacked down the left, environment
   panels sized to their real tenant count, connectors carrying task counts by
   status, and a timeline underneath that the playhead scrubs.

   Three things are worth knowing before changing anything here:

     1. Blocks count COMPLETED tasks to the playhead. A task queued at the
        playhead has no outcome yet, so it is deliberately excluded from every
        failure count and shown only as queue depth.
     2. Tasks are two phases. QueueTime to StartTime is time spent waiting for
        a slot; StartTime to CompletedTime is execution. Work serialising
        behind a tenant that allows one task at a time shows as accumulating
        queue, which a single elapsed figure hides.
     3. Queue figures are peak concurrent depth and longest single wait. A sum
        of queue times is task-hours and says nothing about how deep the queue
        actually got.
   ========================================================================== */

(function () {
  'use strict';

  /* ---- palette ------------------------------------------------------------
     Every value validated against its own surface. Notes worth keeping:

     - Failure ramp climbs in lightness AND chroma so more failures reads as
       more red. Dark ends vivid, light ends deep; the anchor flips with the
       surface, which is why these are two selected sets and not an inversion.
     - Queued is a warm neutral, not amber. Amber against the failure red
       measures dE 3.5 under deuteranopia on white — below the floor that
       secondary encoding is allowed to rescue. Neutral also reads truer: a
       queued task is waiting, not warning. Measured dE 12.5 dark / 8.6 light
       against red, 15.7 / 17.4 normal-vision against blue.
     - Never green for success. Green/red measures dE 4.1 deutan. */
  var THEMES = {
    dark: {
      surface: '#111A23', card: '#1F303F', hair: '#2E475D',
      ink: '#F4F6F8', ink2: '#A9BBCB', ink3: '#7C98B4',
      sel: '#449BE1', succ: '#449BE1', fail: '#E64545', queue: '#A8A89E',
      neutral: '#2A3844', band: '#243141',
      ramp: ['#992E2E', '#C33C3C', '#E55050', '#FF6B6B']
    },
    light: {
      surface: '#FFFFFF', card: '#F4F6F8', hair: '#D7DEE5',
      ink: '#0B1620', ink2: '#4A5A6A', ink3: '#6B7C8C',
      sel: '#1A77CA', succ: '#1A77CA', fail: '#D63D3D', queue: '#89877F',
      neutral: '#D3DCE4', band: '#E4EAEF',
      ramp: ['#EE9494', '#D95050', '#B82C2C', '#851A1A']
    }
  };
  var PALETTE = {};

  var HOUR = 3600000;
  // band geometry lives here so the layout and the Spaces menu cannot disagree
  // about which spaces fit on screen
  var BAND = { min: 112, gap: 10, pad: 14 };
  function maxBandsFor(H) {
    return Math.max(1, Math.floor((H - BAND.pad * 2) / (BAND.min + BAND.gap)));
  }
  var FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Ubuntu, sans-serif';
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var LS = 'tasktimeline.';
  var MAX_ENVS_PER_SPACE = 8;

  /* Octopus task states, split by what the topology needs to know.

     Canceled is deliberately NOT a failure: someone stopped it, which is not
     the same signal as a deployment that broke. It still shows its real state
     in the tooltip and the task table, so nothing is hidden — it just does not
     redden a tenant block.

     Running states are tasks with no CompletedTime yet. They are placed at the
     end of the window and counted as not-failed, because they have no outcome.
     A run of them inflates the success side of a connector; the Task state
     control in the scope menu is how you exclude them. */
  var FAILED_STATES = { Failed: 1, TimedOut: 1 };
  var RUNNING_STATES = { Queued: 1, Executing: 1, Cancelling: 1, Canceling: 1 };

  /* One definition per column: its label, how to read a value out of a tenant
     row, and which direction a first click should use. Numeric columns open
     descending because "most failures" is the question you are asking. */
  var TABLE_COLS = [
    { key: 'tenant', label: 'Tenant',       get: function (v) { return tenantLabel(v.id).toLowerCase(); }, first: 'asc', desc: 'tenant name' },
    { key: 'envs',   label: 'Environments', get: function (v) { return v.envList.length; }, first: 'desc', desc: 'environment count' },
    { key: 'tasks',  label: 'Tasks',        get: function (v) { return v.tasks; },  first: 'desc', num: true, desc: 'task volume' },
    { key: 'fails',  label: 'Failed',       get: function (v) { return v.fails; },  first: 'desc', num: true, desc: 'failures' },
    { key: 'peakQ',  label: 'Peak queued',  get: function (v) { return v.peakQ; },  first: 'desc', num: true,
      desc: 'peak queue depth', title: 'Most tasks waiting at the same instant' },
    { key: 'maxQ',   label: 'Longest wait', get: function (v) { return v.maxQ; },   first: 'desc', num: true,
      desc: 'longest wait', title: 'Longest single wait' },
    { key: 'last',   label: 'Last activity', get: function (v) { return v.last; },  first: 'desc', desc: 'last activity' }
  ];

  /* Columns of the expanded per-task table. "Queue / exec" sorts on the queued
     share of total elapsed time, which is what its bar actually depicts —
     sorting it by absolute duration would not match what you see. */
  var SUB_COLS = [
    { key: 'project', label: 'Project',      get: function (t) { return projLabel(t.p).toLowerCase(); }, first: 'asc' },
    { key: 'env',     label: 'Env',          get: function (t) { return envLabel(t.e).toLowerCase(); }, first: 'asc' },
    { key: 'task',    label: 'Task',         get: function (t) { return idNum(t.id); }, first: 'desc' },
    { key: 'type',    label: 'Type',         get: function (t) { return t.ty; }, first: 'asc' },
    { key: 'state',   label: 'State',        get: function (t) { return t.state; }, first: 'asc' },
    { key: 'queued',  label: 'Queued',       get: function (t) { return t.q; }, first: 'desc', num: true },
    { key: 'exec',    label: 'Exec',         get: function (t) { return t.d; }, first: 'desc', num: true },
    { key: 'share',   label: 'Queue / exec', get: function (t) { return (t.q + t.d) ? t.q / (t.q + t.d) : 0; }, first: 'desc',
      title: 'Share of elapsed time spent queued' },
    { key: 'end',     label: 'Completed',    get: function (t) { return t.end; }, first: 'desc' }
  ];

  var BASE_SORTS = [
    { k: 'fail', label: 'Failure count', note: 'Blocks ordered by failed tasks, worst first.' },
    { k: 'queue', label: 'Peak queue depth', note: 'Ordered by the most tasks waiting at the same instant, then by longest single wait. A tenant holding a one-task lock serialises everything behind it, and that shows here as depth rather than as a large total.' },
    { k: 'volume', label: 'Task volume', note: 'Ordered by total tasks in scope.' },
    { k: 'projects', label: 'Projects deployed', note: 'Ordered by how many distinct projects deployed to the tenant.' },
    { k: 'last', label: 'Last activity', note: 'Most recent activity first.' },
    { k: 'id', label: 'Tenant ID', note: 'Numeric order, a rough proxy for creation order. Flagged as a proxy: nothing guarantees it.' }
  ];

  /* ---- helpers ----------------------------------------------------------- */

  function nf(n) { return Math.round(n).toLocaleString('en-US'); }
  function el(id) { return document.getElementById(id); }
  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); }
  function make(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function durLabel(s) {
    if (!isFinite(s) || s <= 0) return '—';
    if (s < 90) return Math.round(s) + 's';
    if (s < 3600) return Math.round(s / 60) + 'm';
    if (s < 86400) return Math.floor(s / 3600) + 'h ' + Math.round((s % 3600) / 60) + 'm';
    return Math.floor(s / 86400) + 'd ' + Math.round((s % 86400) / 3600) + 'h';
  }
  function hhmm(ms) {
    var d = new Date(ms);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function stamp(ms) {
    var d = new Date(ms);
    return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + hhmm(ms);
  }
  /* Peak concurrent queue depth: the most tasks waiting at the same instant.
     A sum of queue times answers "how much waiting happened in total", which
     is task-hours and says nothing about contention. This answers "how deep
     did the queue actually get", which is the lock-contention question.
     Intervals are clamped to the visible window so work that queued before it
     does not inflate the peak beyond what the view covers. */
  function peakOverlap(intervals, lo, hi) {
    if (!intervals || !intervals.length) return 0;
    var ev = [];
    for (var i = 0; i < intervals.length; i++) {
      var s = Math.max(intervals[i].s, lo), e = Math.min(intervals[i].e, hi);
      if (e <= s) continue;
      ev.push([s, 1]); ev.push([e, -1]);
    }
    if (!ev.length) return 0;
    // -1 before +1 at an identical timestamp: one task ending as another starts
    // is not an overlap
    ev.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    var cur = 0, peak = 0;
    for (var j = 0; j < ev.length; j++) {
      cur += ev[j][1];
      if (cur > peak) peak = cur;
    }
    return peak;
  }

  /* The timestamp where concurrent queueing is deepest. An instantaneous view
     of a transient state is only useful if you can get to the moment that
     matters — otherwise the queued series reads as broken when it is merely
     showing a quiet instant. */
  function peakQueueMoment(intervals, lo, hi) {
    if (!intervals || !intervals.length) return null;
    var ev = [];
    for (var i = 0; i < intervals.length; i++) {
      var a = Math.max(intervals[i].s, lo), b = Math.min(intervals[i].e, hi);
      if (b <= a) continue;
      ev.push([a, 1]); ev.push([b, -1]);
    }
    if (!ev.length) return null;
    ev.sort(function (x, y) { return x[0] - y[0] || x[1] - y[1]; });
    var cur = 0, peak = 0, at = null;
    for (var j = 0; j < ev.length; j++) {
      cur += ev[j][1];
      if (cur > peak) { peak = cur; at = ev[j][0]; }
    }
    return peak > 0 ? { peak: peak, at: at } : null;
  }

  function bucketOf(f) { return f === 0 ? 0 : f === 1 ? 1 : f <= 3 ? 2 : f <= 9 ? 3 : 4; }
  function lineWidth(base, n, ref) { return Math.max(base, Math.min(13, base * Math.sqrt(n) / Math.sqrt(ref))); }

  function applyTheme(name) {
    var next = THEMES[name] ? name : 'dark';
    S.theme = next;
    Object.keys(PALETTE).forEach(function (k) { delete PALETTE[k]; });
    Object.keys(THEMES[next]).forEach(function (k) { PALETTE[k] = THEMES[next][k]; });
    document.documentElement.setAttribute('data-theme', next);
    try { window.localStorage.setItem(LS + 'theme', next); } catch (e) { /* private mode */ }
  }

  /* ---- state ------------------------------------------------------------- */

  var S = {
    view: 'topology', theme: 'dark',
    spaceId: null, spaceName: '',
    fetchType: 'both', fetchState: '', fetchEnvs: [], take: 1000,
    windowHours: 24, anchor: 'now', endAt: '',
    type: 'All', status: 'All', phase: 'both',
    projInc: [], projExc: [], projSearch: '', projMenuOpen: false,
    scopeOpen: false,
    gran: 'env', sort: 'fail', projSort: 'fail',
    conn: { succ: true, fail: true, queue: true },
    playFrac: 1, playing: false, mode: 'cumulative',
    selProject: null, selTenant: null, selUntenanted: null,
    expanded: null, projScroll: {}, hoverHit: null, ready: false,
    tableSort: { key: 'fails', dir: 'desc' },
    subSort: { key: 'end', dir: 'desc' }
  };

  var D = {
    tasks: [], spaces: [], projects: [], allEnvs: [], fetchStats: null,
    tenantName: Object.create(null), tagSets: [],
    projName: Object.create(null), envName: Object.create(null),
    spaceNameById: Object.create(null), lookup: null,
    winStart: 0, winEnd: 0, earliestStart: 0, preCount: 0,
    truncated: false, worst: null
  };

  var view = null, viewKey = '', layoutCache = null;
  var canvas, wrap, strip, stripGeom = null, drawPending = 0, playTimer = 0;

  /* ---- labels ------------------------------------------------------------ */

  // Every render path carries IDs, so naming happens here at the point of
  // display. Falling back to the ID keeps a label present when a project,
  // environment or tenant was deleted after the task ran.
  function projLabel(id) { return D.projName[id] || id || 'Unknown project'; }
  function envLabel(id) { return D.envName[id] || id || 'Unknown environment'; }
  function tenantLabel(id) { return D.tenantName[id] || id || 'Unknown tenant'; }
  function spaceLabel(id) { return D.spaceNameById[id] || id || 'This space'; }

  // Octopus IDs read "ServerTasks-1042". Sorting them as strings puts 999 after
  // 1042, so the numeric tail is what a sort should compare.
  function idNum(id) {
    var m = /(\d+)\s*$/.exec(String(id || ''));
    return m ? parseInt(m[1], 10) : 0;
  }

  /* ---- load ------------------------------------------------------------ */

  function windowEndMs() {
    if (S.anchor === 'custom' && S.endAt) {
      var t = Date.parse(S.endAt);
      if (isFinite(t)) return t;
    }
    return Date.now();
  }

  function loadSpaces() {
    return Api.get('/api/spaces/all').then(function (res) {
      var spaces = Api.items(res);
      if (!Array.isArray(spaces) || !spaces.length) spaces = Array.isArray(res) ? res : [];
      var sel = el('tt-space');
      clear(sel);
      D.spaceNameById = Object.create(null);
      spaces.forEach(function (s) {
        var o = make('option', null, s.Name);
        o.value = s.Id;
        sel.appendChild(o);
        D.spaceNameById[s.Id] = s.Name;
      });
      var saved = null;
      try { saved = window.localStorage.getItem(LS + 'space'); } catch (e) { /* private mode */ }
      var pick = spaces.some(function (s) { return s.Id === saved; }) ? saved : (spaces[0] && spaces[0].Id);
      sel.value = pick || '';
      return pick;
    });
  }

  function loadSpace(spaceId) {
    S.spaceId = spaceId;
    S.spaceName = D.spaceNameById[spaceId] || spaceId;
    try { window.localStorage.setItem(LS + 'space', spaceId); } catch (e) { /* private mode */ }
    setLoading('Loading tasks for ' + S.spaceName + '…');
    hideBanner('tt-error');
    hideBanner('tt-warn');

    var hours = S.windowHours;
    var end = windowEndMs();
    // Reach back twice the window so tasks that began earlier but completed
    // inside it are captured. Those are what the overflow marker counts.
    var fromDate = new Date(end - hours * HOUR * 2).toISOString();
    var toDate = new Date(end).toISOString();
    var take = S.take;
    var sp = encodeURIComponent(spaceId);

    // Server-side narrowing. Each of these reduces what counts against the
    // per-call cap, which is the only way to stay under it on a busy instance.
    // toDate is sent as an optimisation: if the endpoint ignores it, the
    // client-side window check in ingest() still guarantees correctness.
    function activityQuery() {
      var q = '?fromDate=' + encodeURIComponent(fromDate) +
              '&toDate=' + encodeURIComponent(toDate) +
              '&take=' + take;
      if (S.fetchState) q += '&taskState=' + encodeURIComponent(S.fetchState);
      S.fetchEnvs.forEach(function (id) { q += '&environments=' + encodeURIComponent(id); });
      return q;
    }

    var wantDeploys = S.fetchType !== 'RunbookRun';
    var wantRunbooks = S.fetchType !== 'Deploy';

    return Promise.all([
      Api.get('/api/' + sp + '/environments/all'),
      Api.get('/api/' + sp + '/projects/all'),
      Api.get('/api/' + sp + '/tenants/all'),
      wantDeploys ? Api.get('/api/' + sp + '/deployments' + activityQuery()) : Promise.resolve(null),
      wantRunbooks ? Api.get('/api/' + sp + '/runbookRuns' + activityQuery()) : Promise.resolve(null)
    ]).then(function (res) {
      var envs = Api.items(res[0]);
      var projects = Api.items(res[1]);
      var tenants = Api.items(res[2]);
      var deployments = Api.items(res[3]);
      var runbookRuns = Api.items(res[4]);

      D.allEnvs = envs;
      D.fetchStats = {
        deployments: wantDeploys ? deployments.length : null,
        runbookRuns: wantRunbooks ? runbookRuns.length : null,
        take: take,
        deploymentsCapped: wantDeploys && deployments.length >= take,
        runbookRunsCapped: wantRunbooks && runbookRuns.length >= take
      };
      D.truncated = D.fetchStats.deploymentsCapped || D.fetchStats.runbookRunsCapped;

      var records = deployments.map(function (d) {
        return { TaskId: d.TaskId, TenantId: d.TenantId, EnvironmentId: d.EnvironmentId, ProjectId: d.ProjectId, Created: d.Created, type: 'Deploy' };
      }).concat(runbookRuns.map(function (r) {
        return { TaskId: r.TaskId, TenantId: r.TenantId, EnvironmentId: r.EnvironmentId, ProjectId: r.ProjectId, RunbookId: r.RunbookId, Created: r.Created, type: 'RunbookRun' };
      }));

      return Api.byIds('tasks', records.map(function (r) { return r.TaskId; }))
        .then(function (lookup) {
          var tasks = lookup.items;
          // A record whose task did not come back is dropped by ingest(). Record
          // why, so a short window is never reported as a quiet period.
          D.lookup = {
            requested: lookup.requested,
            returned: tasks.length,
            dropped: lookup.dropped,
            missing: Math.max(0, lookup.looked - tasks.length)
          };
          ingest({
            envs: envs, projects: projects, tenants: tenants,
            records: records, tasks: tasks, now: end, hours: hours,
            spaceId: spaceId, spaceName: S.spaceName
          });
        });
    });
  }

  function ingest(raw) {
    var envName = Object.create(null);
    raw.envs.forEach(function (e) { envName[e.Id] = e.Name; });
    var projName = Object.create(null);
    raw.projects.forEach(function (p) { projName[p.Id] = p.Name; });
    var spaceName = raw.spaceName || raw.spaceId || '';

    // The Octopus API returns names alongside IDs, so everything on screen is
    // named. Held as id-keyed maps because the render paths carry IDs only.
    D.projName = projName;
    D.envName = envName;

    D.tenantName = Object.create(null);
    var tagSetMap = Object.create(null);
    raw.tenants.forEach(function (t) {
      D.tenantName[t.Id] = t.Name;
      var tags = t.TenantTags || {};
      Object.keys(tags).forEach(function (setName) {
        if (!tagSetMap[setName]) tagSetMap[setName] = Object.create(null);
        var list = tags[setName] || [];
        // canonical form is "Tag Set/Tag"; the tag half is what reads in a UI
        if (list.length) tagSetMap[setName][t.Id] = String(list[0]).split('/').pop();
      });
    });
    D.tagSets = Object.keys(tagSetMap).sort().map(function (name) {
      return { name: name, byTenant: tagSetMap[name] };
    });

    var taskById = Object.create(null);
    raw.tasks.forEach(function (t) { taskById[t.Id] = t; });

    D.winEnd = raw.now;
    D.winStart = raw.now - raw.hours * HOUR;

    var out = [];
    raw.records.forEach(function (r) {
      var task = taskById[r.TaskId];
      if (!task) return;
      var state = task.State === 'Cancelled' ? 'Canceled' : (task.State || 'Unknown');
      var running = !!RUNNING_STATES[state];

      // Three timestamps, not two. QueueTime is when the task entered the
      // queue and StartTime is when it began executing, so the gap between
      // them is time spent waiting for a slot — which is what makes tasks
      // serialising behind a tenant lock visible at all.
      var queuedMs = Date.parse(task.QueueTime || r.QueueTime || r.Created || '');
      var execMs = Date.parse(task.StartTime || '');
      if (!isFinite(execMs)) execMs = isFinite(queuedMs) ? queuedMs : NaN;
      if (!isFinite(queuedMs) || queuedMs > execMs) queuedMs = execMs;
      if (!isFinite(execMs)) return;

      var endMs = Date.parse(task.CompletedTime || '');
      if (!isFinite(endMs)) endMs = running ? raw.now : execMs;
      if (endMs < execMs) endMs = execMs;

      // completion inside the window is what puts a task on screen
      if (endMs < D.winStart || endMs > D.winEnd) return;

      out.push({
        id: task.Id,
        p: r.ProjectId,
        pName: projName[r.ProjectId] || r.ProjectId || 'Unknown project',
        e: r.EnvironmentId,
        eName: envName[r.EnvironmentId] || r.EnvironmentId || 'Unknown environment',
        n: r.TenantId || null,
        nName: r.TenantId ? (D.tenantName[r.TenantId] || r.TenantId) : null,
        sp: raw.spaceId || '',
        rb: r.RunbookId || null,
        ty: r.type,
        state: state,
        failed: !!FAILED_STATES[state],
        running: running,
        d: Math.round((endMs - execMs) / 1000),
        q: Math.round((execMs - queuedMs) / 1000),
        v: '',
        queueStart: queuedMs,
        execStart: execMs,
        start: queuedMs,
        end: endMs
      });
    });

    D.tasks = out;
    D.earliestStart = out.length ? out.reduce(function (a, t) { return Math.min(a, t.queueStart); }, Infinity) : D.winStart;
    D.preCount = out.filter(function (t) { return t.queueStart < D.winStart; }).length;

    /* The Octopus API is queried one space at a time, so there is a single
       band. The band layout is kept for it: one band is the degenerate case of
       the same code, and the header usefully names the space. */
    var envMap = Object.create(null);
    var projMap = Object.create(null);
    out.forEach(function (t) {
      var E = envMap[t.e];
      if (!E) E = envMap[t.e] = { id: t.e, name: t.eName, sp: t.sp, tenants: Object.create(null), count: 0, tasks: 0, fails: 0, unTasks: 0, unFails: 0, unQueue: 0 };
      E.tasks++;
      if (t.failed) E.fails++;
      if (t.n) { if (!E.tenants[t.n]) { E.tenants[t.n] = 1; E.count++; } }
      else { E.unTasks++; if (t.failed) E.unFails++; E.unQueue += t.q; }

      var P = projMap[t.p];
      if (!P) P = projMap[t.p] = { id: t.p, name: t.pName, sp: t.sp, tasks: 0, fails: 0, queue: 0, tenants: Object.create(null), tenantCount: 0 };
      P.tasks++;
      if (t.failed) P.fails++;
      P.queue += t.q;
      if (t.n && !P.tenants[t.n]) { P.tenants[t.n] = 1; P.tenantCount++; }
    });

    var envs = Object.keys(envMap).map(function (k) {
      var E = envMap[k];
      E.roster = Object.keys(E.tenants);
      return E;
    });
    envs.sort(function (a, b) { return b.roster.length - a.roster.length || b.tasks - a.tasks; });
    var hiddenEnvs = Math.max(0, envs.length - MAX_ENVS_PER_SPACE);
    var shown = envs.slice(0, MAX_ENVS_PER_SPACE).sort(function (a, b) { return a.roster.length - b.roster.length; });

    var tenantSeen = Object.create(null), tenantTotal = 0;
    envs.forEach(function (E) { E.roster.forEach(function (id) { if (!tenantSeen[id]) { tenantSeen[id] = 1; tenantTotal++; } }); });

    D.spaces = [{
      id: raw.spaceId || '', name: spaceName,
      envs: shown, envCount: envs.length, hiddenEnvs: hiddenEnvs,
      tenantCount: tenantTotal,
      tasks: out.length,
      fails: out.filter(function (t) { return t.failed; }).length
    }];

    D.projects = Object.keys(projMap).map(function (k) { return projMap[k]; });
    D.worst = D.projects.slice().sort(function (a, b) { return b.fails - a.fails; })[0] || null;
    layoutCache = null;
    viewKey = '';
  }

  /* ---- compute ----------------------------------------------------------- */

  function playheadMs() { return D.winStart + (D.winEnd - D.winStart) * S.playFrac; }

  function passesStatic(t) {
    if (S.type !== 'All' && t.ty !== S.type) return false;
    if (S.projExc.indexOf(t.p) >= 0) return false;
    if (S.projInc.length && S.projInc.indexOf(t.p) < 0) return false;
    if (S.status === 'Failed' && !t.failed) return false;
    if (S.status === 'Success' && t.failed) return false;
    return true;
  }

  function visibleSpaces() {
    // the Octopus API is queried one space at a time, so there is always one
    return D.spaces;
  }

  function compute() {
    var ph = playheadMs();
    var lo = S.mode === 'rolling' ? ph - HOUR : -Infinity;

    var rows = [];
    // declared here, not with the aggregation counters below: the first pass
    // populates it and var-hoisting would otherwise leave it undefined
    var allQWindow = [];
    // Tasks in queue AT the playhead. These are deliberately not in `rows`:
    // they have not completed, so they carry no outcome yet and would corrupt
    // the failure counts. Queue depth is a state at an instant, not a total.
    var queueNow = Object.create(null);
    var tenantQueue = Object.create(null);
    var queueNowTotal = 0, queueNowMax = 0;

    D.tasks.forEach(function (t) {
      if (passesStatic(t)) {
        if (t.q > 0) allQWindow.push({ s: t.queueStart, e: t.execStart });
        if (t.q > 0 && t.queueStart <= ph && t.execStart > ph) {
          var qk = t.p + '|' + t.sp + '|' + t.e;
          var Q = queueNow[qk];
          if (!Q) Q = queueNow[qk] = { p: t.p, sp: t.sp, e: t.e, n: 0, unQ: 0, tenants: [], seen: Object.create(null), maxWait: 0 };
          Q.n++;
          if (!t.n) Q.unQ++;
          queueNowTotal++;
          var waited = Math.round((ph - t.queueStart) / 1000);
          if (waited > Q.maxWait) Q.maxWait = waited;
          if (waited > queueNowMax) queueNowMax = waited;
          if (t.n) {
            if (!Q.seen[t.n]) { Q.seen[t.n] = 1; Q.tenants.push(t.n); }
            var TQ = tenantQueue[t.n];
            if (!TQ) TQ = tenantQueue[t.n] = { n: 0, maxWait: 0, nextEnd: Infinity, projects: [], seenP: Object.create(null) };
            TQ.n++;
            if (waited > TQ.maxWait) TQ.maxWait = waited;
            if (t.end < TQ.nextEnd) TQ.nextEnd = t.end;
            if (!TQ.seenP[t.p]) { TQ.seenP[t.p] = 1; TQ.projects.push(t.p); }
          }
        }
      }
      if (t.end > ph || t.end < lo) return;
      if (!passesStatic(t)) return;
      rows.push(t);
    });

    var tenant = Object.create(null), projEnv = Object.create(null), proj = Object.create(null);
    var un = Object.create(null);
    var fails = 0, queued = 0, queueSec = 0, execSec = 0, untenanted = 0;
    var allQ = [], maxQAll = 0;

    rows.forEach(function (t) {
      if (t.failed) fails++;
      if (t.q > 0) { queued++; allQ.push({ s: t.queueStart, e: t.execStart }); }
      if (t.q > maxQAll) maxQAll = t.q;
      queueSec += t.q;
      execSec += t.d;

      if (t.n) {
        var V = tenant[t.n];
        if (!V) V = tenant[t.n] = { id: t.n, tasks: 0, fails: 0, queue: 0, exec: 0, maxQ: 0, qiv: [], peakQ: 0, last: 0, sp: t.sp, projects: Object.create(null), projectCount: 0, envs: Object.create(null), envList: [] };
        V.tasks++;
        if (t.failed) V.fails++;
        V.queue += t.q; V.exec += t.d;
        if (t.q > 0) { V.qiv.push({ s: t.queueStart, e: t.execStart }); if (t.q > V.maxQ) V.maxQ = t.q; }
        if (t.end > V.last) V.last = t.end;
        if (!V.projects[t.p]) { V.projects[t.p] = 1; V.projectCount++; }
        if (!V.envs[t.e]) { V.envs[t.e] = 1; V.envList.push(t.e); }
      } else {
        untenanted++;
        var uk = t.sp + '|' + t.e;
        var U = un[uk];
        if (!U) U = un[uk] = { sp: t.sp, e: t.e, tasks: 0, fails: 0, queue: 0, last: 0 };
        U.tasks++;
        if (t.failed) U.fails++;
        U.queue += t.q;
        if (t.end > U.last) U.last = t.end;
      }

      var pk = t.p + '|' + t.sp + '|' + t.e;
      var PE = projEnv[pk];
      if (!PE) PE = projEnv[pk] = { p: t.p, sp: t.sp, e: t.e, succ: 0, fail: 0, unS: 0, unF: 0, tenS: [], tenF: [], seenS: Object.create(null), seenF: Object.create(null) };
      if (t.failed) {
        PE.fail++;
        if (t.n) { if (!PE.seenF[t.n]) { PE.seenF[t.n] = 1; PE.tenF.push(t.n); } } else PE.unF++;
      } else {
        PE.succ++;
        if (t.n) { if (!PE.seenS[t.n]) { PE.seenS[t.n] = 1; PE.tenS.push(t.n); } } else PE.unS++;
      }

      var P = proj[t.p];
      if (!P) P = proj[t.p] = { id: t.p, sp: t.sp, tasks: 0, fails: 0, queue: 0, maxQ: 0, qiv: [], peakQ: 0, tenantCount: 0, seen: Object.create(null) };
      P.tasks++;
      if (t.failed) P.fails++;
      P.queue += t.q;
      if (t.q > 0) { P.qiv.push({ s: t.queueStart, e: t.execStart }); if (t.q > P.maxQ) P.maxQ = t.q; }
      if (t.n && !P.seen[t.n]) { P.seen[t.n] = 1; P.tenantCount++; }
    });

    // peaks resolve after the pass: a sweep needs every interval first
    var lo = D.winStart, hi = ph;
    Object.keys(proj).forEach(function (k) {
      proj[k].peakQ = peakOverlap(proj[k].qiv, lo, hi);
    });
    Object.keys(tenant).forEach(function (k) {
      tenant[k].peakQ = peakOverlap(tenant[k].qiv, lo, hi);
    });
    var peakQAll = peakOverlap(allQ, lo, hi);
    // computed over the whole window, not just up to the playhead, so the
    // jump target does not move as you scrub
    var peakMoment = peakQueueMoment(allQWindow, D.winStart, D.winEnd);

    function sortProjects(a, b) {
      if (S.projSort === 'volume') return b.tasks - a.tasks;
      if (S.projSort === 'queue') return (b.peakQ - a.peakQ) || (b.maxQ - a.maxQ);
      if (S.projSort === 'id') return (+a.id) - (+b.id);
      return (b.fails - a.fails) || (b.tasks - a.tasks);
    }
    var projList = Object.keys(proj).map(function (k) { return proj[k]; });
    projList.sort(sortProjects);

    // A project lives in exactly one space, so each space band gets its own
    // stack. A single global stack left most rows unable to reach most panels.
    var projBySpace = Object.create(null);
    projList.forEach(function (P) {
      (projBySpace[P.sp] || (projBySpace[P.sp] = [])).push(P);
    });

    var order = Object.create(null), index = Object.create(null);
    visibleSpaces().forEach(function (SP) {
      SP.envs.forEach(function (E) {
        var arr = E.roster.slice();
        arr.sort(function (a, b) {
          var A = tenant[a], B = tenant[b];
          var af = A ? A.fails : 0, bf = B ? B.fails : 0;
          if (S.sort === 'id') return (+a) - (+b);
          if (S.sort === 'queue') return (B ? B.peakQ : 0) - (A ? A.peakQ : 0) || (B ? B.maxQ : 0) - (A ? A.maxQ : 0) || bf - af;
          if (S.sort === 'volume') return (B ? B.tasks : 0) - (A ? A.tasks : 0) || bf - af;
          if (S.sort === 'projects') return (B ? B.projectCount : 0) - (A ? A.projectCount : 0) || bf - af;
          if (S.sort === 'last') return (B ? B.last : 0) - (A ? A.last : 0);
          return bf - af || (B ? B.tasks : 0) - (A ? A.tasks : 0);
        });
        var key = E.sp + '|' + E.id;
        order[key] = arr;
        var m = Object.create(null);
        arr.forEach(function (id, i) { m[id] = i; });
        index[key] = m;
      });
    });

    var withFails = 0;
    Object.keys(tenant).forEach(function (k) { if (tenant[k].fails > 0) withFails++; });

    return {
      rows: rows, tenant: tenant, un: un, projEnv: projEnv, projList: projList, projBySpace: projBySpace,
      order: order, index: index,
      fails: fails, queued: queued, queueSec: queueSec, execSec: execSec,
      peakQAll: peakQAll, maxQAll: maxQAll,
      queueNow: queueNow, tenantQueue: tenantQueue,
      queueNowTotal: queueNowTotal, queueNowMax: queueNowMax,
      peakMoment: peakMoment,
      untenanted: untenanted, tenantCount: Object.keys(tenant).length, withFails: withFails
    };
  }

  function getView() {
    var key = [S.type, S.status, S.projInc.join(','), S.projExc.join(','),
               S.sort, S.projSort, S.mode, Math.round(S.playFrac * 4000)].join('|');
    if (key !== viewKey) { viewKey = key; view = compute(); layoutCache = null; }
    return view;
  }

  /* ---- layout ------------------------------------------------------------
     Left to right: project stack, connector gutter, then the space band. The
     band names the space and frames what belongs to it; the code handles a list
     of bands so the geometry does not need special-casing for one. */

  function layout(W, H, V) {
    var pad = 14;
    var stackW = Math.round(Math.max(210, Math.min(360, W * 0.24)));
    var gutter = Math.round(Math.max(26, Math.min(70, W * 0.05)));
    var spaces = visibleSpaces();
    if (!spaces.length) return { bands: [], panels: [], stacks: [], pad: pad };

    // Vertical stacking, one band per space. Projects and environments both
    // live inside a space, so a band is self-contained: its own project stack,
    // its own environments, and connectors that never leave it.
    var labelH = 20, bandGap = BAND.gap, minBand = BAND.min;
    var avail = H - pad * 2 - bandGap * (spaces.length - 1);
    var maxBands = maxBandsFor(H);
    var hiddenSpaces = 0;
    if (spaces.length > maxBands) {
      hiddenSpaces = spaces.length - maxBands;
      spaces = spaces.slice(0, maxBands);
      avail = H - pad * 2 - bandGap * (spaces.length - 1);
    }

    // sqrt weighting so one huge space doesn't starve the small ones
    var weights = spaces.map(function (sp) { return Math.sqrt(Math.max(1, sp.tasks)); });
    var wTotal = weights.reduce(function (a, b) { return a + b; }, 0) || 1;
    var heights = weights.map(function (w) { return Math.max(minBand, Math.round(avail * w / wTotal)); });
    // rescale if the floors pushed us over
    var hTotal = heights.reduce(function (a, b) { return a + b; }, 0);
    if (hTotal > avail) {
      var scale = avail / hTotal;
      heights = heights.map(function (h) { return Math.max(60, Math.floor(h * scale)); });
    }

    var bands = [], panels = [], stacks = [];
    var y = pad;

    spaces.forEach(function (SP, si) {
      var bh = heights[si];
      var bodyTop = y + labelH;
      var bodyH = Math.max(40, bh - labelH);

      // ---- this space's project stack
      var rows = V.projBySpace[SP.id] || [];
      var rowH = Math.max(9, Math.min(14, bodyH / Math.max(1, rows.length)));
      var fit = Math.max(1, Math.floor(bodyH / rowH));
      var maxStart = Math.max(0, rows.length - fit);
      var scrollKey = SP.id;
      var start = Math.max(0, Math.min(maxStart, Math.round((S.projScroll && S.projScroll[scrollKey]) || 0)));
      var stack = {
        sp: SP.id, x: pad, y: bodyTop, w: stackW, rowH: rowH,
        rows: rows.slice(start, start + fit),
        start: start, total: rows.length, fit: fit, maxStart: maxStart
      };
      stacks.push(stack);

      // ---- this space's environment panels
      var areaX = pad + stackW + gutter;
      var areaW = Math.max(50, W - areaX - pad);
      var envs = SP.envs;
      var gap = 16, ppad = 5, header = 15, bandUn = 13;
      // the lane channel was being squeezed to ~16px for four panels, which
      // stacked every project's line on top of the next
      var channel = Math.max(22, 9 * Math.max(1, envs.length));
      var availH = Math.max(12, bodyH - channel - 14 - (ppad * 2 + header + bandUn));
      var totalEnvs = Math.max(1, envs.length);
      var availW = Math.max(24, areaW - gap * (totalEnvs - 1) - totalEnvs * (ppad * 2 + 2));

      function widthAt(c) {
        var rowsAt = Math.max(1, Math.floor(availH / c));
        return envs.reduce(function (a, E) { return a + Math.max(1, Math.ceil(E.roster.length / rowsAt)); }, 0) * c;
      }
      var loC = 1.5, hiC = 20, cell = loC;
      for (var it = 0; it < 22; it++) {
        var mid = (loC + hiC) / 2;
        if (widthAt(mid) <= availW) { cell = mid; loC = mid; } else { hiC = mid; }
      }
      var rowsMax = Math.max(1, Math.floor(availH / cell));
      var baseline = y + bh - 12;

      var x = areaX;
      envs.forEach(function (E) {
        var cols = Math.max(1, Math.ceil(E.roster.length / rowsMax));
        var rws = Math.max(1, Math.min(E.roster.length, rowsMax));
        var w = cols * cell + ppad * 2;
        var hasUn = E.unTasks > 0;
        var h = rws * cell + ppad * 2 + header + (hasUn ? bandUn : 0);
        panels.push({
          key: E.sp + '|' + E.id, id: E.id, sp: E.sp,
          x: x, y: baseline - h, w: w, h: h,
          cols: cols, rows: rws, cell: cell, ppad: ppad, header: header,
          bandH: hasUn ? bandUn : 0, hasUn: hasUn,
          roster: E.roster, count: E.roster.length,
          unTasks: E.unTasks, unFails: E.unFails, unQueue: E.unQueue
        });
        x += w + gap;
      });

      bands.push({
        id: SP.id, y: y, h: bh, top: y, bottom: y + bh,
        bodyTop: bodyTop, laneTop: bodyTop + 2,
        x: pad, w: W - pad * 2,
        envCount: SP.envCount, hidden: SP.hiddenEnvs,
        tasks: SP.tasks, fails: SP.fails,
        projTotal: rows.length,
        stack: stack,
        panels: panels.filter(function (pp) { return pp.sp === SP.id; })
      });

      y += bh + bandGap;
    });

    return { bands: bands, panels: panels, stacks: stacks, pad: pad, hiddenSpaces: hiddenSpaces };
  }

  function blockRect(p, idx) {
    var c = (idx / p.rows) | 0, r = idx % p.rows;
    return {
      x: p.x + p.ppad + c * p.cell,
      y: p.y + p.header + p.bandH + p.ppad + r * p.cell
    };
  }

  function untenantedRect(p) {
    return { x: p.x, y: p.y + p.header, w: p.w, h: p.bandH };
  }

  /* ---- draw -------------------------------------------------------------- */

  function draw() {
    if (!canvas || !wrap) return;
    var W = wrap.clientWidth, H = wrap.clientHeight;
    if (!W || !H) return;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    var g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    var t = PALETTE;
    g.fillStyle = t.surface; g.fillRect(0, 0, W, H);
    if (!S.ready || !D.tasks.length) return;

    var V = getView(), L = layout(W, H, V);
    layoutCache = L;

    var touch = null;
    if (S.selTenant) {
      touch = Object.create(null);
      V.rows.forEach(function (tk) {
        if (tk.n !== S.selTenant) return;
        var c = touch[tk.p] || (touch[tk.p] = { s: 0, f: 0 });
        if (tk.failed) c.f++; else c.s++;
      });
    }

    L.bands.forEach(function (band) {
      drawBand(g, t, L, V, band, touch, W);
    });

    if (L.hiddenSpaces) {
      g.font = '10px ' + FONT; g.fillStyle = t.ink3; g.textAlign = 'right';
      g.fillText(L.hiddenSpaces + ' more space' + (L.hiddenSpaces === 1 ? '' : 's') +
                 ' will not fit — open the Spaces dropdown to view one alone', W - L.pad, H - 3);
      g.textAlign = 'left';
    }
  }

  function drawBand(g, t, L, V, band, touch, W) {
    // band frame + label
    g.fillStyle = t.band; g.globalAlpha = 0.4;
    g.fillRect(band.x, band.top, band.w, band.h);
    g.globalAlpha = 1;
    g.strokeStyle = t.hair; g.lineWidth = 1;
    g.strokeRect(band.x + 0.5, band.top + 0.5, band.w - 1, band.h - 1);

    g.font = '600 11px ' + FONT; g.textBaseline = 'alphabetic';
    g.fillStyle = t.ink;
    var lab = spaceLabel(band.id);
    g.fillText(lab, band.x + 6, band.top + 12);
    g.font = '10px ' + FONT; g.fillStyle = t.ink3;
    var meta = nf(band.projTotal) + ' project' + (band.projTotal === 1 ? '' : 's') +
               ' · ' + band.envCount + ' env' + (band.envCount === 1 ? '' : 's') +
               (band.hidden ? ' (' + band.hidden + ' hidden)' : '') +
               ' · ' + nf(band.tasks) + ' tasks' +
               (band.fails ? ' · ' + nf(band.fails) + ' failed' : '');
    // right-aligned: the stack's own column headers occupy the left of this line
    g.textAlign = 'right';
    g.fillText(meta, band.x + band.w - 6, band.top + 12);
    g.textAlign = 'left';

    var panels = band.panels, st = band.stack;

    // panels: frame, untenanted band, tenant blocks
    var labels = [];
    panels.forEach(function (p, pi) {
      var nxt = panels[pi + 1];
      var room = (nxt ? nxt.x - 4 : p.x + p.w + 40) - p.x;
      labels.push({ p: p, lab: envLabel(p.id), cap: nf(p.count) + (p.count === 1 ? ' tenant' : ' tenants'), room: room });

      g.strokeStyle = t.hair; g.lineWidth = 1;
      g.strokeRect(p.x + 0.5, p.y + p.header + 0.5, p.w - 1, p.h - p.header - 1);

      if (p.hasUn) {
        var ur = untenantedRect(p);
        var ukey = p.sp + '|' + p.id;
        var U = V.un[ukey];
        var uFails = U ? U.fails : 0;
        g.fillStyle = U ? (bucketOf(uFails) === 0 ? t.neutral : t.ramp[bucketOf(uFails) - 1]) : t.surface;
        g.fillRect(ur.x + 1, ur.y + 1, ur.w - 2, ur.h - 2);
        g.setLineDash([3, 2]);
        g.strokeStyle = S.selUntenanted === ukey ? t.sel : t.ink3;
        g.lineWidth = S.selUntenanted === ukey ? 2 : 1;
        g.strokeRect(ur.x + 1.5, ur.y + 1.5, ur.w - 3, ur.h - 3);
        g.setLineDash([]);
        if (ur.w > 46) {
          g.font = '8px ' + FONT; g.fillStyle = t.ink;
          var ul = nf(U ? U.tasks : 0) + ' untenanted';
          if (g.measureText(ul).width > ur.w - 6) ul = nf(U ? U.tasks : 0);
          g.fillText(ul, ur.x + 3, ur.y + ur.h - 3);
        }
      }

      var cell = p.cell, ins = cell > 6 ? 1 : cell > 4 ? 0.5 : 0;
      var ord = V.order[p.key] || [];
      for (var i = 0; i < p.count; i++) {
        var id = ord[i], r = blockRect(p, i), tv = V.tenant[id];
        var tqNow = V.tenantQueue[id];
        if (!tv) {
          // dashed if something is queued on it: an empty-looking block with a
          // connector pointing at it reads as a contradiction
          if (tqNow) {
            g.setLineDash([2, 2]);
            g.strokeStyle = t.queue; g.lineWidth = 1;
            g.strokeRect(r.x + 0.5, r.y + 0.5, cell - 1 - ins, cell - 1 - ins);
            g.setLineDash([]);
          } else {
            g.strokeStyle = t.hair; g.lineWidth = 1;
            g.strokeRect(r.x + 0.5, r.y + 0.5, cell - 1 - ins, cell - 1 - ins);
          }
        } else {
          var b = bucketOf(tv.fails);
          g.fillStyle = b === 0 ? t.neutral : t.ramp[b - 1];
          g.fillRect(r.x, r.y, cell - ins, cell - ins);
          if (tv.queue > 0 && cell >= 7) {
            g.fillStyle = t.queue;
            g.fillRect(r.x, r.y + cell - ins - 2, Math.max(2, (cell - ins) * 0.55), 2);
          }
        }
        if (S.selTenant === id) {
          g.strokeStyle = t.sel; g.lineWidth = 2;
          g.strokeRect(r.x - 1, r.y - 1, cell + 1, cell + 1);
        } else if (S.hoverHit && S.hoverHit.kind === 'tenant' && S.hoverHit.id === id) {
          g.strokeStyle = t.ink; g.lineWidth = 1;
          g.strokeRect(r.x - 1.5, r.y - 1.5, cell + 2, cell + 2);
        }
      }
    });

    // connectors, confined to this band: a project cannot deploy outside its space
    var rowH = st.rowH, ox = st.x + st.w + 10;
    var peVals = Object.keys(V.projEnv).map(function (k) { return V.projEnv[k]; })
      .filter(function (x) { return x.sp === band.id; });
    var maxN = Math.max(1, peVals.reduce(function (a, x) { return Math.max(a, x.succ, x.fail); }, 1));
    var ref = Math.max(20, maxN / 40);
    var minTop = panels.length ? panels.reduce(function (a, p) { return Math.min(a, p.y); }, Infinity) : band.bottom;
    var laneTop = band.laneTop;
    var laneBot = Math.max(laneTop + 4, minTop - 8);
    var stepN = Math.max(1, panels.length - 1);
    var step = Math.max(3, (laneBot - laneTop) / stepN);

    var tgtBy = Object.create(null);
    panels.forEach(function (p, i) {
      tgtBy[p.key] = { p: p, lane: laneBot - Math.min(i, stepN) * step, gut: 8 };
    });

    function drawLink(x0, y0, tgt, port, w, color, alpha) {
      var lane = tgt.lane, p = tgt.p, drop = p.x - tgt.gut;
      g.strokeStyle = color; g.globalAlpha = alpha; g.lineWidth = w;
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath();
      g.moveTo(x0, y0);
      var mx = x0 + 10;
      g.lineTo(mx, y0);
      g.bezierCurveTo(mx + 16, y0, mx + 16, lane, mx + 32, lane);
      g.lineTo(drop - 6, lane);
      g.bezierCurveTo(drop, lane, drop, port, p.x - 1, port);
      g.stroke();
      g.globalAlpha = 1;
    }

    function direct(x0, y0, p, ids, color, w, alpha) {
      var idx = V.index[p.key] || {};
      g.strokeStyle = color; g.globalAlpha = alpha; g.lineWidth = w; g.lineCap = 'round';
      g.beginPath();
      ids.forEach(function (id) {
        var k = idx[id];
        if (k == null) return;
        var r = blockRect(p, k);
        var bx = r.x + p.cell / 2, by = r.y + p.cell / 2, dx = (bx - x0) * 0.45;
        g.moveTo(x0, y0);
        g.bezierCurveTo(x0 + dx, y0, bx - dx, by, bx, by);
      });
      g.stroke(); g.globalAlpha = 1;
    }

    function fanAlpha(n) { return Math.max(0.13, Math.min(0.5, 40 / Math.max(1, n))); }

    /* Untenanted work has no tenant block to reach. In tenant granularity the
       failure path fell back to an environment link and the success path fell
       back to nothing at all, so untenanted successes simply vanished — which
       is most of the workload on some spaces. Both now land on the
       untenanted band, which is where that work actually belongs. */
    function linkToUntenanted(x0, y0, p, color, w, alpha) {
      if (!p.hasUn) return false;
      var ur = untenantedRect(p);
      var bx = ur.x + ur.w / 2, by = ur.y + ur.h / 2, dx = (bx - x0) * 0.45;
      g.strokeStyle = color; g.globalAlpha = alpha; g.lineWidth = w; g.lineCap = 'round';
      g.beginPath();
      g.moveTo(x0, y0);
      g.bezierCurveTo(x0 + dx, y0, bx - dx, by, bx, by);
      g.stroke();
      g.globalAlpha = 1;
      return true;
    }
    // The status filter wins over the drawing toggles: with only successes in
    // scope, drawing the failure series would assert something false.
    var drawSucc = S.status === 'Success' ? true : S.status === 'Failed' ? false : S.conn.succ;
    var drawFail = S.status === 'Success' ? false : S.conn.fail;
    var drawQueue = S.conn.queue;

    /* Thirty projects routing into four lanes will always bundle — that is
       inherent to one-connector-per-project-per-environment. What was missing
       was a way to trace a single project's lines out of the bundle: hovering
       a row highlighted the row but left its connectors indistinguishable.
       Hover now acts as a soft selection for the connector layer. */
    var hoverProj = (S.hoverHit && S.hoverHit.kind === 'project') ? S.hoverHit.id : null;
    var focusSource = S.selProject || hoverProj;
    var dim = (focusSource || S.selTenant) ? 0.16 : 1;

    function midPort(p) { return p.y + p.header + p.bandH + (p.h - p.header - p.bandH) / 2; }

    /* Queued connectors reach the individual tenants that are waiting, not the
       environment. Aggregating them would hide the thing they exist to show:
       which tenant has work stacking up behind it. The count is instantaneous
       and therefore small, so a per-tenant fan is affordable here in a way it
       is not for the completed-task series.

       Dashed as well as neutral — a dash reads as "not yet resolved" without
       competing for a hue. */
    function drawQueueFan(x0, y0, p, Q, alpha) {
      var idx = V.index[p.key] || {};
      var reachable = Q.tenants.filter(function (id) { return idx[id] != null; });
      g.setLineDash([4, 3]);

      if (reachable.length > 60) {
        // too many to follow individually: outline them and bundle the line
        g.strokeStyle = t.queue; g.lineWidth = 1; g.globalAlpha = 0.45;
        reachable.forEach(function (id) {
          var r = blockRect(p, idx[id]);
          g.strokeRect(r.x - 0.5, r.y - 0.5, p.cell, p.cell);
        });
        g.globalAlpha = 1;
        drawLink(x0, y0, { p: p, lane: y0, gut: 8 }, midPort(p), lineWidth(1.6, reachable.length, 20), t.queue, alpha);
      } else if (reachable.length) {
        direct(x0, y0, p, reachable, t.queue, 1.1, Math.max(0.4, fanAlpha(reachable.length)));
      }

      // untenanted queued work terminates at the untenanted band
      if (Q.unQ) linkToUntenanted(x0, y0, p, t.queue, 1.4, Math.max(0.5, alpha));

      g.setLineDash([]);
    }

    st.rows.forEach(function (P, i) {
      var y = st.y + i * rowH + rowH / 2;
      var focus = S.selTenant ? !!(touch && touch[P.id]) : (!focusSource || focusSource === P.id);
      panels.forEach(function (p) {
        var pe = V.projEnv[P.id + '|' + p.sp + '|' + p.id];
        if (!pe) return;
        if (S.selProject === P.id) return;
        var tgt = tgtBy[p.key];
        var upper = p.y + p.header + p.bandH + 3, lower = p.y + p.h - 3;
        if (S.gran === 'tenant' && !S.selProject) {
          var fm = focus ? 1 : 0.22;
          if (drawSucc) {
            if (pe.tenS.length) direct(ox, y - 2, p, pe.tenS, t.succ, 1.0, Math.max(0.34, fanAlpha(pe.tenS.length)) * fm);
            if (pe.unS && !linkToUntenanted(ox, y - 2, p, t.succ, lineWidth(1.4, pe.unS, ref), 0.6 * fm)) {
              // no untenanted band on this panel: fall back to the port
              drawLink(ox, y - 2, tgt, upper, lineWidth(1.4, pe.unS, ref), t.succ, 0.6 * fm);
            }
          }
          if (drawFail) {
            if (pe.tenF.length) direct(ox, y + 2, p, pe.tenF, t.fail, 0.9, Math.max(0.34, fanAlpha(pe.tenF.length)) * fm);
            if (pe.unF && !linkToUntenanted(ox, y + 2, p, t.fail, lineWidth(1.9, pe.unF, ref), 0.85 * fm)) {
              drawLink(ox, y + 2, tgt, lower, lineWidth(1.9, pe.unF, ref), t.fail, 0.85 * fm);
            }
          }
          return;
        }
        var cfocus = S.selTenant ? false : focus;
        // Failure stays dominant, but success has to be legible rather than
        // merely present. Both use the same dim when out of focus: the success
        // series previously took dim * 0.5 and vanished at 0.06 alpha.
        var lift = (hoverProj === P.id) ? 1.6 : 1;
        if (pe.fail && drawFail) drawLink(ox, y + 2, tgt, lower, lineWidth(2 * lift, pe.fail, ref), t.fail, cfocus ? 0.9 : dim);
        if (pe.succ && drawSucc) drawLink(ox, y - 2, tgt, upper, lineWidth(1.5 * lift, pe.succ, ref), t.succ, cfocus ? (hoverProj === P.id ? 0.95 : 0.62) : dim);
      });

      // third series: whatever this project has queued at the playhead,
      // reaching the waiting tenants themselves
      if (drawQueue) {
        panels.forEach(function (p) {
          var Q = V.queueNow[P.id + '|' + p.sp + '|' + p.id];
          if (!Q || !Q.n) return;
          if (S.selProject === P.id) return;
          var cfocus = S.selTenant ? false : focus;
          drawQueueFan(ox, y, p, Q, cfocus ? 0.8 : dim);
        });
      }
    });

    if (S.selProject) {
      var si = -1;
      st.rows.forEach(function (p, i) { if (p.id === S.selProject) si = i; });
      if (si >= 0) {
        var sy = st.y + si * rowH + rowH / 2;
        panels.forEach(function (p) {
          var pe = V.projEnv[S.selProject + '|' + p.sp + '|' + p.id];
          if (!pe) return;
          var tgt = tgtBy[p.key], idx = V.index[p.key] || {};
          var sets = [];
          if (drawFail) sets.push({ ids: pe.tenF, color: t.fail, w: 1.1, up: false });
          if (drawSucc) sets.push({ ids: pe.tenS, color: t.succ, w: 0.8, up: true });
          var bundle = S.gran !== 'tenant';
          var labelRow = 0;
          sets.forEach(function (x2) {
            if (bundle && x2.ids.length > 60) {
              if (p.cell >= 7) {
                g.strokeStyle = x2.color; g.lineWidth = 1; g.globalAlpha = 0.5;
                x2.ids.forEach(function (id) {
                  var k2 = idx[id];
                  if (k2 == null) return;
                  var r2 = blockRect(p, k2);
                  g.strokeRect(r2.x - 0.5, r2.y - 0.5, p.cell, p.cell);
                });
                g.globalAlpha = 1;
              }
              drawLink(ox, x2.up ? sy - 2 : sy + 2, tgt, x2.up ? p.y + p.header + p.bandH + 3 : p.y + p.h - 3, 7, x2.color, 0.5);
              g.font = '600 10px ' + FONT;
              var txt = nf(x2.ids.length) + (x2.up ? ' ok' : ' failed');
              var tw = g.measureText(txt).width;
              var bx = p.x + p.w - tw - 6, by = p.y + p.header + p.bandH + 2 + labelRow * 14;
              g.fillStyle = t.surface; g.globalAlpha = 0.88;
              g.fillRect(bx - 3, by, tw + 6, 13); g.globalAlpha = 1;
              g.fillStyle = x2.color; g.fillText(txt, bx, by + 10);
              labelRow++;
            } else if (x2.ids.length) {
              direct(ox, x2.up ? sy - 2 : sy + 2, p, x2.ids, x2.color, x2.w, Math.max(x2.ids.length > 200 ? 0.12 : 0.3, fanAlpha(x2.ids.length)));
            }
          });

          // and its currently-queued tenants, same treatment
          if (drawQueue) {
            var Q = V.queueNow[S.selProject + '|' + p.sp + '|' + p.id];
            if (Q && Q.n) drawQueueFan(ox, sy, p, Q, 0.85);
          }
        });
      }
    }

    if (S.selTenant && drawQueue) {
      // the selected tenant's own waiting work, from each project queueing on it
      panels.forEach(function (p) {
        var idx = V.index[p.key] || {};
        if (idx[S.selTenant] == null) return;
        Object.keys(V.queueNow).forEach(function (qk) {
          var Q = V.queueNow[qk];
          if (Q.sp !== p.sp || Q.e !== p.id) return;
          if (Q.tenants.indexOf(S.selTenant) < 0) return;
          var ri = -1;
          st.rows.forEach(function (pr, i) { if (pr.id === Q.p) ri = i; });
          if (ri < 0) return;
          var qy = st.y + ri * rowH + rowH / 2;
          g.setLineDash([4, 3]);
          direct(ox, qy, p, [S.selTenant], t.queue, 1.4, 0.9);
          g.setLineDash([]);
        });
      });
    }

    if (S.selTenant && touch) {
      var home = null;
      panels.forEach(function (p) { if (!home && (V.index[p.key] || {})[S.selTenant] != null) home = p; });
      if (home) {
        Object.keys(touch).forEach(function (pid) {
          var c = touch[pid], ri = -1;
          st.rows.forEach(function (p, i) { if (p.id === pid) ri = i; });
          if (ri < 0) return;
          var y = st.y + ri * rowH + rowH / 2;
          // this branch drew red and blue regardless of the toggles
          if (c.f && !drawFail) return;
          if (!c.f && !drawSucc) return;
          direct(ox, c.f ? y + 2 : y - 2, home, [S.selTenant], c.f ? t.fail : t.succ, c.f ? 1.6 : 1.1, 0.85);
        });
      }
    }

    labels.forEach(function (L2) {
      var p = L2.p;
      g.font = '600 10px ' + FONT;
      var lw2 = g.measureText(L2.lab).width;
      g.fillStyle = t.surface; g.globalAlpha = 0.85;
      g.fillRect(p.x - 2, p.y - 1, lw2 + 4, 13); g.globalAlpha = 1;
      g.fillStyle = t.ink; g.fillText(L2.lab, p.x, p.y + 9);
      if (p.h > 40) {
        g.font = '9px ' + FONT;
        var cw2 = g.measureText(L2.cap).width;
        g.fillStyle = t.surface; g.globalAlpha = 0.85;
        g.fillRect(p.x - 2, p.y + p.h + 1, cw2 + 4, 11); g.globalAlpha = 1;
        g.fillStyle = t.ink3; g.fillText(L2.cap, p.x, p.y + p.h + 9);
      }
    });

    drawProjectStack(g, t, band, V, touch);
  }

  function drawProjectStack(g, t, band, V, touch) {
    var st = band.stack;
    if (!st.rows.length) {
      g.font = '10px ' + FONT; g.fillStyle = t.ink3;
      g.fillText('no projects in scope', st.x + 2, st.y + 12);
      return;
    }

    var numW = 42, waitW = 40;
    var failR = st.x + st.w - 2, succR = failR - numW - 4;
    var waitR = succR - numW - 4, peakR = waitR - waitW - 4;
    var wideEnough = (peakR - 40) > st.x + 60;

    g.font = '9px ' + FONT; g.textAlign = 'right';
    if (wideEnough) {
      g.fillStyle = t.queue; g.fillText('peak', peakR, st.y - 2);
      g.fillText('wait', waitR, st.y - 2);
    }
    g.fillStyle = t.succ; g.fillText('ok', succR, st.y - 2);
    g.fillStyle = t.fail; g.fillText('failed', failR, st.y - 2);
    g.textAlign = 'left';

    var maxTasks = Math.max(1, st.rows.reduce(function (a, p) { return Math.max(a, p.tasks); }, 1));
    st.rows.forEach(function (P, i) {
      var y = st.y + i * st.rowH, yc = y + st.rowH / 2;
      var focus = S.selTenant ? !!(touch && touch[P.id]) : (!S.selProject || S.selProject === P.id);
      var hov = S.hoverHit && S.hoverHit.kind === 'project' && S.hoverHit.id === P.id;
      g.globalAlpha = focus ? 1 : 0.3;
      if (S.selProject === P.id || hov) { g.fillStyle = t.card; g.fillRect(st.x - 3, y, st.w + 6, st.rowH); }
      if (hov && S.selProject !== P.id) {
        g.strokeStyle = t.sel; g.lineWidth = 1;
        g.strokeRect(st.x - 2.5, y + 0.5, st.w + 5, st.rowH - 1);
      }

      var nameAvail = (wideEnough ? peakR - 40 : succR - numW - 4) - st.x - 4;
      if (st.rowH >= 8) {
        g.font = (S.selProject === P.id ? '600 ' : '') + Math.min(11, Math.max(8, st.rowH - 1)) + 'px ' + FONT;
        g.fillStyle = S.selProject === P.id ? t.sel : t.ink2;
        var name = projLabel(P.id);
        if (g.measureText(name).width > nameAvail) {
          while (name.length > 1 && g.measureText(name + '…').width > nameAvail) name = name.slice(0, -1);
          name += '…';
        }
        g.fillText(name, st.x, yc + 3);
        var num = Math.min(10, Math.max(8, st.rowH - 1));
        g.font = num + 'px ' + FONT; g.textAlign = 'right';
        if (wideEnough) {
          // peak concurrent depth, then the longest single wait
          g.fillStyle = P.peakQ > 0 ? t.queue : t.ink3;
          g.fillText(P.peakQ > 0 ? String(P.peakQ) : '—', peakR, yc + 3);
          g.fillStyle = P.maxQ > 0 ? t.queue : t.ink3;
          g.fillText(P.maxQ > 0 ? durLabel(P.maxQ) : '—', waitR, yc + 3);
        }
        var ok = P.tasks - P.fails;
        g.fillStyle = ok ? t.succ : t.ink3;
        g.fillText(ok ? nf(ok) : '—', succR, yc + 3);
        g.fillStyle = P.fails ? t.fail : t.ink3;
        g.fillText(P.fails ? nf(P.fails) : '—', failR, yc + 3);
        g.textAlign = 'left';
      }
      g.globalAlpha = 1;
    });

    if (st.maxStart > 0) {
      var trackX = st.x + st.w + 2, trackH = st.fit * st.rowH;
      g.fillStyle = t.hair; g.fillRect(trackX, st.y, 2, trackH);
      var thumbH = Math.max(14, trackH * st.fit / st.total);
      g.fillStyle = t.ink3;
      g.fillRect(trackX, st.y + (trackH - thumbH) * (st.start / st.maxStart), 2, thumbH);
      g.font = '9px ' + FONT; g.fillStyle = t.ink3;
      g.fillText(nf(st.start + 1) + '–' + nf(st.start + st.rows.length) + ' of ' + nf(st.total), st.x, st.y + trackH + 9);
    }
  }

  /* ---- timeline ----------------------------------------------------------
     Three stacked series per bucket: queued, executing-ok, executing-failed.
     A task occupies its queue buckets and then its execution buckets, so work
     piling up behind a lock shows as a growing neutral base under a thin band
     of actual execution — which is the shape you cannot see from counts. */

  function drawStrip() {
    if (!strip) return;
    var W = strip.clientWidth, H = 104;
    if (!W) return;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    strip.width = Math.round(W * dpr); strip.height = Math.round(H * dpr);
    var g = strip.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    var t = PALETTE;
    g.fillStyle = t.surface; g.fillRect(0, 0, W, H);
    if (!S.ready || !D.tasks.length) return;

    var padL = 138, padR = 14;
    var plotW = Math.max(10, W - padL - padR);
    var top = 12, botH = 18, plotH = H - top - botH;
    var span = Math.max(HOUR, D.winEnd - D.winStart);
    var nb = Math.max(1, Math.min(400, Math.ceil(span / HOUR)));
    var bucketMs = span / nb;

    var q = new Float64Array(nb), ok = new Float64Array(nb), bad = new Float64Array(nb);
    var pre = 0;
    var showQ = S.phase !== 'exec', showX = S.phase !== 'queue';

    D.tasks.forEach(function (tk) {
      if (!passesStatic(tk)) return;
      if (tk.queueStart < D.winStart) pre++;
      if (showQ && tk.q > 0) {
        var qa = Math.max(0, Math.floor((tk.queueStart - D.winStart) / bucketMs));
        var qb = Math.min(nb - 1, Math.floor((tk.execStart - D.winStart) / bucketMs));
        for (var i = qa; i <= qb; i++) q[i]++;
      }
      if (showX) {
        var xa = Math.max(0, Math.floor((tk.execStart - D.winStart) / bucketMs));
        var xb = Math.min(nb - 1, Math.floor((tk.end - D.winStart) / bucketMs));
        var arr = tk.failed ? bad : ok;
        for (var j = xa; j <= xb; j++) arr[j]++;
      }
    });

    var max = 1;
    for (var k = 0; k < nb; k++) max = Math.max(max, q[k] + ok[k] + bad[k]);
    var bw = plotW / nb;
    for (var k2 = 0; k2 < nb; k2++) {
      var x = padL + k2 * bw, w = Math.max(1, bw - 1), yb = top + plotH;
      var hq = (q[k2] / max) * plotH, ho = (ok[k2] / max) * plotH, hf = (bad[k2] / max) * plotH;
      g.fillStyle = t.queue; g.globalAlpha = 0.55;
      g.fillRect(x, yb - hq, w, hq);
      g.globalAlpha = 0.6; g.fillStyle = t.succ;
      g.fillRect(x, yb - hq - ho, w, ho);
      g.globalAlpha = 0.92; g.fillStyle = t.fail;
      g.fillRect(x, yb - hq - ho - hf, w, hf);
      g.globalAlpha = 1;
    }

    g.strokeStyle = t.hair; g.beginPath();
    g.moveTo(padL, top + plotH + 0.5); g.lineTo(W - padR, top + plotH + 0.5); g.stroke();
    g.font = '10px ' + FONT; g.fillStyle = t.ink3;
    var tickEvery = Math.max(1, Math.round(nb / 8));
    for (var k3 = 0; k3 < nb; k3 += tickEvery) {
      var tx = padL + k3 * bw;
      g.fillText(hhmm(D.winStart + k3 * bucketMs), tx, H - 5);
      g.strokeStyle = t.hair; g.beginPath();
      g.moveTo(tx + 0.5, top + plotH); g.lineTo(tx + 0.5, top + plotH + 4); g.stroke();
    }
    g.fillStyle = t.ink3; g.fillText(stamp(D.winStart), padL, top - 2);

    g.textAlign = 'right';
    if (pre > 0) {
      g.fillStyle = t.queue; g.globalAlpha = 0.9;
      for (var y2 = top; y2 < top + plotH; y2 += 5) g.fillRect(padL - 10, y2, 6, 3);
      g.globalAlpha = 1;
      g.fillStyle = t.ink2; g.font = '10px ' + FONT;
      g.fillText(nf(pre) + ' began earlier', padL - 14, top + 14);
      g.fillText('from ' + stamp(D.earliestStart), padL - 14, top + 27);
    }
    g.font = '9px ' + FONT; g.fillStyle = t.ink3;
    g.fillText('tasks in flight/hour', padL - 14, top + plotH - 14);
    g.fillText('peak ' + nf(max), padL - 14, top + plotH - 3);
    g.textAlign = 'left';

    var px = padL + plotW * S.playFrac;
    if (S.mode === 'rolling') {
      var wx = Math.max(padL, px - plotW * (HOUR / span));
      g.fillStyle = t.sel; g.globalAlpha = 0.12;
      g.fillRect(wx, top, px - wx, plotH); g.globalAlpha = 1;
    }
    g.strokeStyle = t.sel; g.lineWidth = 2; g.beginPath();
    g.moveTo(px, top - 6); g.lineTo(px, top + plotH + 4); g.stroke();
    g.fillStyle = t.sel; g.beginPath();
    g.moveTo(px - 5, top - 10); g.lineTo(px + 5, top - 10); g.lineTo(px, top - 3);
    g.closePath(); g.fill();

    stripGeom = { padL: padL, plotW: plotW };
  }

  /* ---- scheduling & interaction ------------------------------------------ */

  function scheduleDraw() {
    if (drawPending) return;
    drawPending = setTimeout(function () {
      drawPending = 0;
      try { draw(); } catch (e) { console.error('topology draw failed', e); }
      try { drawStrip(); } catch (e2) { console.error('strip draw failed', e2); }
    }, 0);
  }

  function refresh() {
    renderChrome();
    if (S.view === 'table') renderTable();
    scheduleDraw();
  }

  function pick(mx, my) {
    var L = layoutCache, V = view;
    if (!L || !V || !L.bands) return null;
    for (var bi = 0; bi < L.bands.length; bi++) {
      var band = L.bands[bi];
      if (my < band.top || my > band.bottom) continue;
      var st = band.stack;
      if (mx >= st.x - 3 && mx <= st.x + st.w + 6 && my >= st.y) {
        var i = Math.floor((my - st.y) / st.rowH);
        if (i >= 0 && i < st.rows.length) return { kind: 'project', p: st.rows[i], sp: band.id };
      }
      for (var j = 0; j < band.panels.length; j++) {
        var p = band.panels[j];
        if (mx < p.x || mx > p.x + p.w || my < p.y + p.header || my > p.y + p.h) continue;
        if (p.hasUn) {
          var ur = untenantedRect(p);
          if (my >= ur.y && my <= ur.y + ur.h) return { kind: 'untenanted', key: p.sp + '|' + p.id, p: p };
        }
        var c = Math.floor((mx - p.x - p.ppad) / p.cell);
        var r = Math.floor((my - p.y - p.header - p.bandH - p.ppad) / p.cell);
        var idx = c * p.rows + r;
        if (c >= 0 && c < p.cols && r >= 0 && r < p.rows && idx >= 0 && idx < p.count) {
          return { kind: 'tenant', id: (V.order[p.key] || [])[idx], p: p };
        }
        return { kind: 'env', p: p };
      }
      return null;
    }
    return null;
  }

  function hitKey(h) {
    if (!h) return '';
    if (h.kind === 'project') return 'project:' + h.p.id;
    if (h.kind === 'tenant') return 'tenant:' + h.id;
    if (h.kind === 'untenanted') return 'un:' + h.key;
    return 'env:' + (h.p ? h.p.key : '');
  }

  function showTip(hit, x, y) {
    var tip = el('tt-tip');
    if (!hit) { tip.classList.add('hidden'); return; }
    var V = view, title = '', sub = '', body = '';
    if (hit.kind === 'project') {
      var P = hit.p;
      title = projLabel(P.id);
      sub = nf(P.tasks) + ' tasks · ' + nf(P.tenantCount) + ' tenants';
      body = nf(P.fails) + ' failed · ' + nf(P.tasks - P.fails) + ' ok\n' +
             'Peak ' + nf(P.peakQ) + ' queued at once · longest wait ' + durLabel(P.maxQ) + '\n' +
             'Click to isolate its connectors';
    } else if (hit.kind === 'tenant') {
      var v = V.tenant[hit.id];
      var tq = V.tenantQueue[hit.id];
      title = tenantLabel(hit.id);
      sub = envLabel(hit.p.id);
      body = v
        ? nf(v.tasks) + ' completed · ' + nf(v.fails) + ' failed\n' +
          'Peak ' + nf(v.peakQ) + ' queued at once · longest wait ' + durLabel(v.maxQ) + '\n' +
          nf(v.projectCount) + ' projects · last completion ' + stamp(v.last)
        : 'Nothing completed yet at this playhead';
      if (tq) body += '\n\nQueued now: ' + nf(tq.n) + ', waiting ' + durLabel(tq.maxWait) +
                      '\nFirst completes ' + stamp(tq.nextEnd);
    } else if (hit.kind === 'untenanted') {
      var U = V.un[hit.key];
      title = 'Untenanted work';
      sub = envLabel(hit.p.id);
      body = U
        ? nf(U.tasks) + ' tasks · ' + nf(U.fails) + ' failed\nQueued ' + durLabel(U.queue) + ' in total\nTasks with no tenant, run against the environment itself'
        : 'No untenanted tasks at this playhead position';
    } else {
      title = envLabel(hit.p.id);
      sub = spaceLabel(hit.p.sp);
      body = nf(hit.p.count) + ' tenants' + (hit.p.unTasks ? '\n' + nf(hit.p.unTasks) + ' untenanted tasks' : '');
    }
    clear(tip);
    tip.appendChild(make('div', 'tt-tip__t', title));
    tip.appendChild(make('div', 'tt-tip__s', sub));
    tip.appendChild(make('div', 'tt-tip__b', body));
    tip.classList.remove('hidden');
    var maxX = wrap.clientWidth - tip.offsetWidth - 8;
    var maxY = wrap.clientHeight - tip.offsetHeight - 8;
    tip.style.left = Math.max(4, Math.min(maxX, x + 14)) + 'px';
    tip.style.top = Math.max(4, Math.min(maxY, y + 14)) + 'px';
  }

  function wireCanvas() {
    canvas.addEventListener('mousemove', function (e) {
      var r = canvas.getBoundingClientRect();
      var mx = e.clientX - r.left, my = e.clientY - r.top;
      var hit = pick(mx, my);
      showTip(hit, mx, my);
      var key = hitKey(hit);
      var cur = S.hoverHit ? S.hoverHit.key : '';
      if (key !== cur) {
        S.hoverHit = hit ? { kind: hit.kind, id: hit.kind === 'project' ? hit.p.id : hit.id, key: key } : null;
        scheduleDraw();
      }
    });
    canvas.addEventListener('mouseleave', function () {
      el('tt-tip').classList.add('hidden');
      if (S.hoverHit) { S.hoverHit = null; scheduleDraw(); }
    });
    canvas.addEventListener('click', function (e) {
      var r = canvas.getBoundingClientRect();
      var hit = pick(e.clientX - r.left, e.clientY - r.top);
      if (!hit) { S.selProject = null; S.selTenant = null; S.selUntenanted = null; }
      else if (hit.kind === 'project') { S.selProject = S.selProject === hit.p.id ? null : hit.p.id; S.selTenant = null; S.selUntenanted = null; }
      else if (hit.kind === 'tenant') { S.selTenant = S.selTenant === hit.id ? null : hit.id; S.selProject = null; S.selUntenanted = null; }
      else if (hit.kind === 'untenanted') { S.selUntenanted = S.selUntenanted === hit.key ? null : hit.key; S.selProject = null; S.selTenant = null; }
      refresh();
    });
    // scroll the project stack of whichever space band the cursor is over
    canvas.addEventListener('wheel', function (e) {
      var L = layoutCache;
      if (!L || !L.bands) return;
      var r = canvas.getBoundingClientRect();
      var mx = e.clientX - r.left, my = e.clientY - r.top;
      var band = L.bands.filter(function (b) { return my >= b.top && my <= b.bottom; })[0];
      if (!band || !band.stack.maxStart) return;
      if (mx > band.stack.x + band.stack.w + 10) return;
      e.preventDefault();
      var cur = S.projScroll[band.id] || 0;
      var next = Math.max(0, Math.min(band.stack.maxStart, cur + (e.deltaY > 0 ? 2 : -2)));
      if (next !== cur) { S.projScroll[band.id] = next; scheduleDraw(); }
    }, { passive: false });
    canvas.style.cursor = 'pointer';
  }

  function wireStrip() {
    function scrub(e) {
      var r = strip.getBoundingClientRect();
      var gm = stripGeom || { padL: 138, plotW: Math.max(10, r.width - 152) };
      S.playFrac = Math.max(0, Math.min(1, (e.clientX - r.left - gm.padL) / gm.plotW));
      stopPlay();
      refresh();
    }
    strip.addEventListener('mousedown', function (e) {
      scrub(e);
      function mv(ev) { scrub(ev); }
      function up() { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); }
      window.addEventListener('mousemove', mv);
      window.addEventListener('mouseup', up);
    });
  }

  function stopPlay() { if (playTimer) { clearTimeout(playTimer); playTimer = 0; } S.playing = false; }
  function tickPlay() {
    if (!S.playing) { playTimer = 0; return; }
    S.playFrac += 0.0016;
    if (S.playFrac >= 1) { S.playFrac = 1; S.playing = false; }
    refresh();
    playTimer = S.playing ? setTimeout(tickPlay, 33) : 0;
  }

  /* ---- chrome ------------------------------------------------------------ */

  function segment(host, options, current, onPick) {
    clear(host);
    options.forEach(function (o) {
      var b = make('button', o.k === current ? 'is-on' : null);
      b.type = 'button';
      if (o.swatch) {
        var sw = make('span', 'tt-swatch');
        sw.style.background = o.swatch;
        b.appendChild(sw);
      }
      b.appendChild(document.createTextNode(o.label));
      b.addEventListener('click', function () {
        Array.prototype.forEach.call(host.children, function (sib) { sib.classList.remove('is-on'); });
        b.classList.add('is-on');
        onPick(o.k);
      });
      host.appendChild(b);
    });
  }

  /* Independent on/off buttons. The connector series are not mutually
     exclusive — you routinely want failures and queued together, without ok. */
  function toggles(host, options) {
    clear(host);
    options.forEach(function (o) {
      var b = make('button', o.on ? 'is-on' : null);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(!!o.on));
      if (o.swatch) {
        var sw = make('span', 'tt-swatch' + (o.dashed ? ' is-dashed' : ''));
        sw.style.background = o.dashed ? 'transparent' : o.swatch;
        if (o.dashed) sw.style.borderTop = '2px dashed ' + o.swatch;
        b.appendChild(sw);
      }
      b.appendChild(document.createTextNode(o.label));
      if (o.disabled) { b.disabled = true; b.title = o.title || ''; }
      else b.addEventListener('click', function () {
        var next = !b.classList.contains('is-on');
        b.classList.toggle('is-on', next);
        b.setAttribute('aria-pressed', String(next));
        o.onToggle();
      });
      host.appendChild(b);
    });
  }

  function renderChrome() {
    var V = S.ready ? getView() : null;

    segment(el('tt-type'), [
      { k: 'All', label: 'All' }, { k: 'Deploy', label: 'Deployments' }, { k: 'RunbookRun', label: 'Runbooks' }
    ], S.type, function (k) { S.type = k; S.selProject = null; S.selTenant = null; refresh(); });

    segment(el('tt-status'), [
      { k: 'All', label: 'All' }, { k: 'Failed', label: 'Failed' }, { k: 'Success', label: 'Succeeded' }
    ], S.status, function (k) { S.status = k; refresh(); });


    var forcedSucc = S.status === 'Success', forcedFail = S.status === 'Failed';
    toggles(el('tt-conn'), [
      { label: 'Ok', swatch: PALETTE.succ, on: forcedSucc || (!forcedFail && S.conn.succ),
        disabled: forcedSucc || forcedFail,
        title: 'Fixed by the Include filter',
        onToggle: function () { S.conn.succ = !S.conn.succ; refresh(); } },
      { label: 'Failed', swatch: PALETTE.fail, on: !forcedSucc && S.conn.fail,
        disabled: forcedSucc,
        title: 'Fixed by the Include filter',
        onToggle: function () { S.conn.fail = !S.conn.fail; refresh(); } },
      { label: 'Queued', swatch: PALETTE.queue, dashed: true, on: S.conn.queue,
        onToggle: function () { S.conn.queue = !S.conn.queue; refresh(); } }
    ]);

    segment(el('tt-mode'), [
      { k: 'cumulative', label: 'Cumulative' }, { k: 'rolling', label: 'Rolling hour' }
    ], S.mode, function (k) { S.mode = k; refresh(); });

    segment(el('tt-phase'), [
      { k: 'both', label: 'Queue + exec' },
      { k: 'queue', label: 'Queue only', swatch: PALETTE.queue },
      { k: 'exec', label: 'Exec only', swatch: PALETTE.succ }
    ], S.phase, function (k) { S.phase = k; refresh(); });

    segment(el('tt-gran'), [
      { k: 'env', label: 'Environment' }, { k: 'tenant', label: 'Tenant' }
    ], S.gran, function (k) { S.gran = k; refresh(); });

    segment(el('tt-projsort'), [
      { k: 'fail', label: 'Failures' }, { k: 'volume', label: 'Volume' },
      { k: 'queue', label: 'Queue depth' }, { k: 'id', label: 'ID' }
    ], S.projSort, function (k) { S.projSort = k; refresh(); });

    var host = el('tt-sort');
    clear(host);
    BASE_SORTS.forEach(function (o) {
      var b = make('button', o.k === S.sort ? 'is-on' : null, o.label);
      b.type = 'button';
      b.addEventListener('click', function () { S.sort = o.k; refresh(); });
      host.appendChild(b);
    });
    var cur = BASE_SORTS.filter(function (o) { return o.k === S.sort; })[0];
    el('tt-sort-note').textContent = cur ? cur.note : '';

    el('tt-gran-note').textContent = S.gran === 'env'
      ? 'One connector per project per status, arriving at the environment. Bounded at projects × statuses.'
      : 'Connectors reach individual tenant blocks for every project at once. Dense above a few hundred tasks.'; 

    el('tt-playhead').textContent = S.ready ? stamp(playheadMs()) : '';
    el('tt-play').textContent = S.playing ? 'Pause' : 'Play';
    var ov = [];
    if (S.ready && V && V.queueNowTotal) {
      ov.push(nf(V.queueNowTotal) + ' queued at the playhead' +
              (V.queueNowMax ? ', longest waiting ' + durLabel(V.queueNowMax) : ''));
    }
    if (S.ready && D.preCount) ov.push(nf(D.preCount) + ' began before this window');
    el('tt-overflow').textContent = ov.join(' · ');
    el('tt-scope-label').textContent = (S.anchor === 'now' ? 'Last ' : '') +
      (S.windowHours < 24 ? S.windowHours + 'h' : (S.windowHours / 24) + 'd') +
      (S.anchor === 'custom' && S.endAt ? ' to ' + stamp(Date.parse(S.endAt)) : '');

    var scope = el('tt-scope');
    scope.textContent = S.ready
      ? nf(D.tasks.length) + ' tasks · ' + nf(D.projects.length) + ' project' + (D.projects.length === 1 ? '' : 's')
      : '';

    renderTiles(V);
    renderChips();
    renderProjectMenu();
    renderEnvList();
    renderSelection(V);
    renderRamp();
    renderBudget();
  }

  /* Environment narrowing. Listed only after a first load, because the list
     comes from the space that was loaded — offering it empty would read as
     "this space has no environments". An empty selection means all of them. */
  function renderEnvList() {
    var host = el('tt-env-list');
    clear(host);
    if (!D.allEnvs.length) {
      host.appendChild(make('div', 'tt-hint', 'Loaded with the space.'));
      return;
    }
    D.allEnvs.forEach(function (e) {
      var on = S.fetchEnvs.indexOf(e.Id) >= 0;
      var row = make('button', 'tt-menu__row tt-menu__row--env');
      row.type = 'button';
      row.setAttribute('aria-pressed', String(on));
      row.appendChild(make('span', 'tt-menu__box' + (on ? ' is-inc' : ''), on ? '✓' : ''));
      row.appendChild(make('span', 'tt-menu__name', e.Name || e.Id));
      row.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var i = S.fetchEnvs.indexOf(e.Id);
        if (i < 0) S.fetchEnvs.push(e.Id); else S.fetchEnvs.splice(i, 1);
        renderEnvList();
        renderChrome();
      });
      host.appendChild(row);
    });
  }

  function renderBudget() {
    var b = el('tt-budget');
    if (!S.ready) { b.textContent = ''; b.className = 'tt-budget'; return; }
    var parts = [nf(D.tasks.length) + ' tasks fetched'];
    if (D.truncated) parts.push('per-call cap of ' + nf(S.take) + ' reached, so the oldest activity is missing');
    else if (S.fetchEnvs.length) parts.push(S.fetchEnvs.length + ' of ' + D.allEnvs.length + ' environments');
    b.textContent = parts.join(' · ');
    b.className = 'tt-budget' + (D.truncated ? ' is-capped' : '');
  }

  function renderRamp() {
    var host = el('tt-ramp');
    clear(host);
    var labels = ['0', '1', '2–3', '4–9', '10+'];
    var colors = [PALETTE.neutral].concat(PALETTE.ramp);
    labels.forEach(function (lab, i) {
      var col = make('div');
      var sw = make('span', 'tt-ramp__sw');
      sw.style.background = colors[i];
      col.appendChild(sw);
      col.appendChild(make('span', 'tt-ramp__l', lab));
      host.appendChild(col);
    });
  }

  function renderTiles(V) {
    var host = el('tt-tiles');
    clear(host);
    if (!V) return;
    [
      { label: 'Tenants', value: nf(V.tenantCount), color: PALETTE.ink },
      { label: 'With failures', value: nf(V.withFails), color: V.withFails ? PALETTE.fail : PALETTE.ink },
      { label: 'Failed tasks', value: nf(V.fails), color: V.fails ? PALETTE.fail : PALETTE.ink },
      { label: 'Untenanted', value: nf(V.untenanted), color: PALETTE.ink2 },
      { label: 'Peak queued', value: nf(V.peakQAll), color: V.peakQAll ? PALETTE.queue : PALETTE.ink },
      { label: 'Longest wait', value: durLabel(V.maxQAll), color: V.maxQAll ? PALETTE.queue : PALETTE.ink }
    ].forEach(function (tl) {
      var d = make('div', 'tt-tile');
      var v = make('div', 'tt-tile__v', tl.value);
      v.style.color = tl.color;
      d.appendChild(v);
      d.appendChild(make('div', 'tt-tile__l', tl.label));
      host.appendChild(d);
    });
  }

  function renderChips() {
    var host = el('tt-chips');
    clear(host);
    var chips = [];
    if (S.type !== 'All') chips.push({ label: 'Type: ' + (S.type === 'Deploy' ? 'Deployments' : 'Runbooks'), clear: function () { S.type = 'All'; } });
    if (S.status !== 'All') chips.push({ label: 'Only ' + S.status.toLowerCase(), clear: function () { S.status = 'All'; } });
    if (S.phase !== 'both') chips.push({ label: S.phase === 'queue' ? 'Queue phase only' : 'Execution phase only', clear: function () { S.phase = 'both'; } });
    S.projInc.forEach(function (id) { chips.push({ label: 'Only ' + projLabel(id), clear: function () { S.projInc = S.projInc.filter(function (x) { return x !== id; }); } }); });
    S.projExc.forEach(function (id) { chips.push({ label: 'Excluding ' + projLabel(id), clear: function () { S.projExc = S.projExc.filter(function (x) { return x !== id; }); } }); });
    if (S.mode === 'rolling') chips.push({ label: 'Rolling hour', clear: function () { S.mode = 'cumulative'; } });
    if (S.playFrac < 1) chips.push({ label: 'Playhead ' + stamp(playheadMs()), clear: function () { S.playFrac = 1; } });

    chips.forEach(function (c) {
      var d = make('span', 'tt-chip');
      d.appendChild(make('span', null, c.label));
      var b = make('button', null, '×');
      b.type = 'button';
      b.setAttribute('aria-label', 'Clear ' + c.label);
      b.addEventListener('click', function () { c.clear(); refresh(); });
      d.appendChild(b);
      host.appendChild(d);
    });
  }

  function renderProjectMenu() {
    var label = el('tt-proj-label');
    if (S.projInc.length) label.textContent = S.projInc.length === 1 ? '1 project only' : S.projInc.length + ' projects only';
    else if (S.projExc.length) label.textContent = S.projExc.length + ' excluded';
    else label.textContent = 'All projects';

    var hint = el('tt-proj-hint');
    if (D.worst && D.worst.fails > 0) {
      var total = D.projects.reduce(function (a, p) { return a + p.fails; }, 0);
      hint.textContent = 'Click once to isolate, twice to exclude. ' + projLabel(D.worst.id) +
        ' accounts for ' + (total ? Math.round(D.worst.fails / total * 100) : 0) + '% of failures.';
    } else {
      hint.textContent = 'Click once to isolate a project, twice to exclude it.';
    }
    var worstBtn = el('tt-proj-worst');
    worstBtn.textContent = D.worst && D.worst.fails > 0 ? 'Exclude ' + projLabel(D.worst.id) : 'Exclude worst offender';
    worstBtn.disabled = !(D.worst && D.worst.fails > 0);

    var list = el('tt-proj-list');
    clear(list);
    var q = S.projSearch.trim().toLowerCase();
    var rows = D.projects.slice().sort(function (a, b) { return (b.fails - a.fails) || (b.tasks - a.tasks); });
    var shown = 0;
    rows.forEach(function (p) {
      var name = projLabel(p.id);
      if (q && name.toLowerCase().indexOf(q) < 0) return;
      if (shown >= 300) return;
      shown++;
      var row = make('div', 'tt-menu__row');
      var mark = S.projInc.indexOf(p.id) >= 0 ? 'inc' : S.projExc.indexOf(p.id) >= 0 ? 'exc' : '';
      row.appendChild(make('span', 'tt-menu__box' + (mark ? ' is-' + mark : ''), mark === 'inc' ? '✓' : mark === 'exc' ? '✕' : ''));
      row.appendChild(make('span', 'tt-menu__name', name));
      row.appendChild(make('span', 'tt-menu__n', nf(p.tasks)));
      row.appendChild(make('span', 'tt-menu__n' + (p.fails ? ' is-fail' : ''), p.fails ? nf(p.fails) : '—'));
      row.addEventListener('click', function () {
        var inInc = S.projInc.indexOf(p.id) >= 0, inExc = S.projExc.indexOf(p.id) >= 0;
        S.projInc = S.projInc.filter(function (x) { return x !== p.id; });
        S.projExc = S.projExc.filter(function (x) { return x !== p.id; });
        if (!inInc && !inExc) S.projInc.push(p.id);
        else if (inInc) S.projExc.push(p.id);
        refresh();
      });
      list.appendChild(row);
    });
    if (!shown) list.appendChild(make('div', 'tt-hint', 'No projects match.'));
  }

  function renderSelection(V) {
    var titleEl = el('tt-sel-title'), subEl = el('tt-sel-sub'), bodyEl = el('tt-sel-body'), acts = el('tt-sel-acts');
    if (!V || (!S.selProject && !S.selTenant && !S.selUntenanted)) {
      titleEl.textContent = 'Nothing selected';
      subEl.textContent = '';
      bodyEl.textContent = 'Click a project row, a tenant block, or an untenanted band.';
      acts.classList.add('hidden');
      return;
    }
    acts.classList.remove('hidden');
    if (S.selProject) {
      var P = V.projList.filter(function (p) { return p.id === S.selProject; })[0];
      titleEl.textContent = projLabel(S.selProject);
      subEl.textContent = P ? nf(P.tenantCount) + ' tenants reached' : '';
      bodyEl.textContent = P
        ? nf(P.tasks) + ' tasks · ' + nf(P.fails) + ' failed\nPeak ' + nf(P.peakQ) +
          ' queued at once · longest wait ' + durLabel(P.maxQ)
        : 'No tasks in scope.';
    } else if (S.selTenant) {
      var v = V.tenant[S.selTenant];
      var TQ = V.tenantQueue[S.selTenant];
      titleEl.textContent = tenantLabel(S.selTenant);
      subEl.textContent = v ? nf(v.projectCount) + ' projects · ' + v.envList.length + ' environments' : '';
      // Two populations, and they answer different questions. Saying only "no
      // tasks" when work is visibly queued reads as a contradiction.
      var lines = [];
      if (v) {
        lines.push(nf(v.tasks) + ' completed · ' + nf(v.fails) + ' failed');
        lines.push('Peak ' + nf(v.peakQ) + ' queued at once · longest wait ' + durLabel(v.maxQ));
        lines.push(nf(v.projectCount) + ' projects across ' + v.envList.length + ' env');
        lines.push('Last completion ' + stamp(v.last));
      } else {
        lines.push('Nothing completed yet at this playhead.');
      }
      if (TQ) {
        lines.push('');
        lines.push('Queued right now: ' + nf(TQ.n) + ' task' + (TQ.n === 1 ? '' : 's') +
                   ' from ' + nf(TQ.projects.length) + ' project' + (TQ.projects.length === 1 ? '' : 's'));
        lines.push('Waiting ' + durLabel(TQ.maxWait) + ' · first completes ' + stamp(TQ.nextEnd));
      }
      bodyEl.textContent = lines.join('\n');
    } else {
      var U = V.un[S.selUntenanted];
      var parts = S.selUntenanted.split('|');
      titleEl.textContent = 'Untenanted work';
      subEl.textContent = envLabel(parts[1]);
      bodyEl.textContent = U
        ? nf(U.tasks) + ' tasks · ' + nf(U.fails) + ' failed\nQueued ' + durLabel(U.queue) + ' in total\nLast ' + stamp(U.last)
        : 'No untenanted tasks at this playhead position.';
    }
  }

  /* ---- table ------------------------------------------------------------- */

  /* Shared comparator: numeric when both sides are numbers, locale string
     compare otherwise, with a stable tiebreak so equal values hold their order
     across re-renders. */
  /* Looked up by key, not by index: the column lists get edited and an index
     fallback silently starts pointing at a different column. */
  function colByKey(cols, key, fallbackKey) {
    var hit = cols.filter(function (c) { return c.key === key; })[0];
    if (hit) return hit;
    return cols.filter(function (c) { return c.key === fallbackKey; })[0] || cols[0];
  }

  function compareBy(get, dir, tiebreak) {
    var sign = dir === 'asc' ? 1 : -1;
    return function (a, b) {
      var av = get(a), bv = get(b);
      if (typeof av === 'number' && typeof bv === 'number') {
        if (av !== bv) return (av - bv) * sign;
      } else {
        var c = String(av).localeCompare(String(bv));
        if (c !== 0) return c * sign;
      }
      return tiebreak(a, b);
    };
  }

  /* One sortable header cell, used by both the tenant table and the nested
     per-task table so their behaviour cannot drift. */
  function sortHeaderCell(col, state, onSort) {
    var th = make('th');
    th.scope = 'col';
    if (col.num) th.className = 'tt-num';
    var active = state.key === col.key;
    th.setAttribute('aria-sort', active ? (state.dir === 'asc' ? 'ascending' : 'descending') : 'none');
    var b = make('button', 'tt-sortbtn' + (active ? ' is-sorted' : ''));
    b.type = 'button';
    if (col.title) b.title = col.title;
    b.setAttribute('aria-label', 'Sort by ' + col.label);
    b.appendChild(document.createTextNode(col.label));
    b.appendChild(make('span', 'tt-sortbtn__arrow', active ? (state.dir === 'asc' ? '▲' : '▼') : '▼'));
    b.addEventListener('click', function (ev) {
      ev.stopPropagation();
      if (state.key === col.key) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
      else { state.key = col.key; state.dir = col.first; }
      onSort();
    });
    th.appendChild(b);
    return th;
  }

  function renderTableHead() {
    var head = el('tt-thead');
    clear(head);
    var tr = make('tr');
    TABLE_COLS.forEach(function (col) {
      tr.appendChild(sortHeaderCell(col, S.tableSort, function () {
        S.expanded = null;
        renderTable();
      }));
    });
    head.appendChild(tr);
  }

  function sortTableRows(rows) {
    var col = colByKey(TABLE_COLS, S.tableSort.key, 'fails');
    return rows.sort(compareBy(col.get, S.tableSort.dir, function (a, b) { return idNum(a.id) - idNum(b.id); }));
  }

  function renderTable() {
    if (!S.ready) { clear(el('tt-tbody')); return; }
    var V = getView();
    var body = el('tt-tbody');
    clear(body);

    var rows = Object.keys(V.tenant).map(function (k) { return V.tenant[k]; });
    sortTableRows(rows);
    renderTableHead();
    var limit = Math.min(rows.length, 400);

    for (var i = 0; i < limit; i++) {
      var v = rows[i];
      var tr = make('tr', 'tt-row');
      tr.appendChild(make('td', 'tt-t-name', tenantLabel(v.id)));
      tr.appendChild(make('td', null, v.envList.map(envLabel).join(', ')));
      tr.appendChild(make('td', 'tt-num', nf(v.tasks)));
      tr.appendChild(make('td', 'tt-num' + (v.fails ? ' is-fail' : ''), v.fails ? nf(v.fails) : '—'));
      tr.appendChild(make('td', 'tt-num' + (v.peakQ ? ' is-queue' : ''), v.peakQ ? nf(v.peakQ) : '—'));
      tr.appendChild(make('td', 'tt-num' + (v.maxQ ? ' is-queue' : ''), durLabel(v.maxQ)));
      tr.appendChild(make('td', null, stamp(v.last)));
      (function (tenantId) {
        tr.addEventListener('click', function () {
          S.expanded = S.expanded === tenantId ? null : tenantId;
          renderTable();
        });
      })(v.id);
      body.appendChild(tr);
      if (S.expanded === v.id) body.appendChild(subRow(v));
    }

    // description above the table rather than below it: it sets up what you are
    // about to read, and states what the table deliberately leaves out
    var head = el('tt-table-head');
    clear(head);

    var line = make('div', 'tt-table-head__line');
    line.appendChild(make('span', 'tt-table-head__n', nf(rows.length)));
    line.appendChild(document.createTextNode(' tenant' + (rows.length === 1 ? '' : 's') + ' with completed tasks at the playhead'));
    if (rows.length > limit) {
      var col = TABLE_COLS.filter(function (c) { return c.key === S.tableSort.key; })[0];
      line.appendChild(document.createTextNode(', showing the first '));
      line.appendChild(make('span', 'tt-table-head__n', nf(limit)));
      line.appendChild(document.createTextNode(' by ' + (col ? col.desc : 'failures') +
        ' ' + (S.tableSort.dir === 'asc' ? 'ascending' : 'descending')));
    }
    line.appendChild(document.createTextNode(' · '));
    line.appendChild(make('span', 'tt-table-head__n', nf(V.fails)));
    line.appendChild(document.createTextNode(' failed task' + (V.fails === 1 ? '' : 's') + ' · '));
    line.appendChild(make('span', 'tt-table-head__n', durLabel(V.maxQAll)));
    line.appendChild(document.createTextNode(' longest wait'));
    head.appendChild(line);

    head.appendChild(make('div', 'tt-table-head__note',
      nf(V.untenanted) + ' untenanted task' + (V.untenanted === 1 ? '' : 's') +
      ' are not tenant rows — they appear as the untenanted band on each environment in the topology.'));
    head.appendChild(make('div', 'tt-table-head__note',
      'Click a column header to sort, or a row to expand its most recent tasks. This table is the accessible rendering of the topology.'));
  }

  function subRow(v) {
    var tr = make('tr', 'tt-sub');
    var td = make('td');
    td.colSpan = TABLE_COLS.length;
    var box = make('div', 'tt-sub__wrap');

    var subCol = colByKey(SUB_COLS, S.subSort.key, 'end');
    var all = view.rows.filter(function (t) { return t.n === v.id; });
    // sort before capping, so the 60 shown are the top 60 by the chosen column
    all.sort(compareBy(subCol.get, S.subSort.dir, function (a, b) { return b.end - a.end; }));
    var tasks = all.slice(0, 60);

    var table = make('table');
    var thead = make('thead'), htr = make('tr');
    SUB_COLS.forEach(function (col) {
      htr.appendChild(sortHeaderCell(col, S.subSort, function () { renderTable(); }));
    });
    thead.appendChild(htr);
    table.appendChild(thead);

    var maxSpan = Math.max(1, tasks.reduce(function (a, t) { return Math.max(a, t.q + t.d); }, 1));
    var tb = make('tbody');
    tasks.forEach(function (t) {
      var r = make('tr');
      r.appendChild(make('td', null, projLabel(t.p)));
      r.appendChild(make('td', null, envLabel(t.e)));
      r.appendChild(make('td', 'tt-mono', t.id));
      r.appendChild(make('td', null, t.ty === 'Deploy' ? 'Deployment' : 'Runbook'));
      var st = make('td', null, t.state);
      st.style.color = t.failed ? PALETTE.fail : t.running ? PALETTE.succ : PALETTE.ink2;
      r.appendChild(st);
      r.appendChild(make('td', 'tt-num' + (t.q ? ' is-queue' : ''), durLabel(t.q)));
      r.appendChild(make('td', 'tt-num', durLabel(t.d)));

      // proportional queue-vs-exec bar: a long neutral head is a task that sat
      // waiting far longer than it ran
      var pd = make('td');
      var bar = make('div', 'tt-phase');
      var qs = make('span', 'q'), xs = make('span', 'x' + (t.failed ? ' is-fail' : ''));
      qs.style.width = Math.round(150 * (t.q / maxSpan)) + 'px';
      xs.style.width = Math.max(2, Math.round(150 * (t.d / maxSpan))) + 'px';
      bar.appendChild(qs); bar.appendChild(xs);
      pd.appendChild(bar);
      r.appendChild(pd);

      r.appendChild(make('td', 'tt-mono', stamp(t.end)));
      tb.appendChild(r);
    });
    table.appendChild(tb);
    box.appendChild(make('div', 'tt-legend__cap',
      nf(tasks.length) + ' of ' + nf(all.length) + ' task' + (all.length === 1 ? '' : 's') +
      ' in scope, by ' + subCol.label.toLowerCase() + ' ' +
      (S.subSort.dir === 'asc' ? 'ascending' : 'descending')));
    box.appendChild(table);
    td.appendChild(box);
    tr.appendChild(td);
    return tr;
  }

  /* ---- banners ----------------------------------------------------------- */

  function showBanner(id, text) { var b = el(id); b.textContent = text; b.classList.remove('hidden'); }
  function hideBanner(id) { el(id).classList.add('hidden'); }
  function setLoading(text) {
    var l = el('tt-loading');
    if (text == null) { l.classList.add('hidden'); return; }
    l.textContent = text;
    l.classList.remove('hidden');
  }

  function setView(v) {
    S.view = v;
    el('tt-tab-topology').classList.toggle('is-active', v === 'topology');
    el('tt-tab-table').classList.toggle('is-active', v === 'table');
    el('tt-view-topology').classList.toggle('hidden', v !== 'topology');
    el('tt-view-table').classList.toggle('hidden', v !== 'table');
    if (v === 'topology') scheduleDraw(); else renderTable();
  }

  function updateThemeButton() {
    var b = el('tt-theme');
    var toLight = S.theme === 'dark';
    b.textContent = toLight ? 'Light' : 'Dark';
    b.setAttribute('title', 'Switch to ' + (toLight ? 'light' : 'dark') + ' mode');
  }


  /* Diagnostic hook. Run __ttDiag() in the console to see why a connector is or
     is not drawing: it reports the band/stack/panel structure and checks that
     the projEnv keys the draw pass looks up actually exist. Returns ids and
     counts only — nothing that is not already on screen. */
  window.__ttDiag = function () {
    if (!S.ready) return { ready: false, note: 'no space loaded yet' };
    var V = getView();
    var L = layoutCache;
    var out = {
      space: S.spaceId,
      window: { from: new Date(D.winStart).toISOString(), to: new Date(D.winEnd).toISOString() },
      playhead: new Date(playheadMs()).toISOString(),
      atEndOfWindow: S.playFrac >= 1,
      filters: {
        include: S.status, type: S.type,
        projIsolated: S.projInc.length, projExcluded: S.projExc.length,
        conn: JSON.parse(JSON.stringify(S.conn)), gran: S.gran, mode: S.mode
      },
      totals: {
        tasksFetched: D.tasks.length,
        tasksInScope: V.rows.length,
        failedInScope: V.fails,
        spaces: D.spaces.length,
        projectsInScope: V.projList.length,
        projEnvPairs: Object.keys(V.projEnv).length
      },
      bands: [],
      unreachable: []
    };
    if (!L || !L.bands) { out.note = 'no layout yet — resize or interact once, then re-run'; return out; }

    L.bands.forEach(function (band) {
      var st = band.stack;
      var panelIds = band.panels.map(function (p) { return p.id; });
      var hitSucc = 0, hitFail = 0, missing = 0, unSucc = 0, unFail = 0;
      st.rows.forEach(function (P) {
        band.panels.forEach(function (p) {
          var pe = V.projEnv[P.id + '|' + p.sp + '|' + p.id];
          if (!pe) { missing++; return; }
          if (pe.succ) hitSucc++;
          if (pe.fail) hitFail++;
          if (pe.unS) unSucc++;
          if (pe.unF) unFail++;
        });
      });
      out.bands.push({
        space: band.id,
        projectsTotal: st.total, projectsShown: st.rows.length, scrolledPast: st.start,
        rowHeightPx: Math.round(st.rowH * 10) / 10,
        envsTotal: band.envCount, envsShown: band.panels.length, envsHidden: band.hidden,
        panelIds: panelIds,
        pairsWithSuccess: hitSucc, pairsWithFailure: hitFail, pairsAbsent: missing,
        pairsUntenantedSuccess: unSucc, pairsUntenantedFailure: unFail,
        panelsWithUntenantedBand: band.panels.filter(function (p) { return p.hasUn; }).length,
        bandHeightPx: Math.round(band.h)
      });
    });

    // projects whose only environments are ones the layout could not show
    var shownKeys = {};
    L.panels.forEach(function (p) { shownKeys[p.sp + '|' + p.id] = 1; });
    var byProj = {};
    Object.keys(V.projEnv).forEach(function (k) {
      var pe = V.projEnv[k];
      byProj[pe.p] = byProj[pe.p] || { reachable: 0, hidden: 0 };
      if (shownKeys[pe.sp + '|' + pe.e]) byProj[pe.p].reachable++;
      else byProj[pe.p].hidden++;
    });
    Object.keys(byProj).forEach(function (pid) {
      if (byProj[pid].reachable === 0) out.unreachable.push({ project: pid, hiddenEnvPairs: byProj[pid].hidden });
    });
    out.unreachableCount = out.unreachable.length;
    out.unreachable = out.unreachable.slice(0, 20);
    return out;
  };

  /* ---- boot -------------------------------------------------------------- */

  function wire() {
    el('tt-tab-topology').addEventListener('click', function () { setView('topology'); });
    el('tt-tab-table').addEventListener('click', function () { setView('table'); });

    el('tt-proj-trigger').addEventListener('click', function (e) {
      e.stopPropagation();
      S.projMenuOpen = !S.projMenuOpen;
      el('tt-proj-panel').classList.toggle('hidden', !S.projMenuOpen);
      el('tt-proj-trigger').setAttribute('aria-expanded', String(S.projMenuOpen));
    });
    el('tt-proj-panel').addEventListener('click', function (e) { e.stopPropagation(); });
    el('tt-proj-search').addEventListener('input', function (e) { S.projSearch = e.target.value; renderProjectMenu(); });
    el('tt-proj-reset').addEventListener('click', function () { S.projInc = []; S.projExc = []; refresh(); });
    el('tt-proj-worst').addEventListener('click', function () {
      if (!D.worst) return;
      S.projInc = [];
      if (S.projExc.indexOf(D.worst.id) < 0) S.projExc.push(D.worst.id);
      refresh();
    });

    el('tt-scope-trigger').addEventListener('click', function (e) {
      e.stopPropagation();
      S.scopeOpen = !S.scopeOpen;
      el('tt-scope-panel').classList.toggle('hidden', !S.scopeOpen);
      el('tt-scope-trigger').setAttribute('aria-expanded', String(S.scopeOpen));
    });
    el('tt-scope-panel').addEventListener('click', function (e) { e.stopPropagation(); });
    el('tt-scope-close').addEventListener('click', function () {
      S.scopeOpen = false;
      el('tt-scope-panel').classList.add('hidden');
    });

    document.addEventListener('click', function () {
      ['proj', 'scope'].forEach(function (n) {
        var open = n === 'proj' ? S.projMenuOpen : S.scopeOpen;
        if (!open) return;
        if (n === 'proj') S.projMenuOpen = false;
        if (n === 'scope') S.scopeOpen = false;
        el('tt-' + n + '-panel').classList.add('hidden');
        el('tt-' + n + '-trigger').setAttribute('aria-expanded', 'false');
      });
    });

    var winSel = el('tt-window');
    var savedWin = null;
    try { savedWin = window.localStorage.getItem(LS + 'window'); } catch (e) { /* private mode */ }
    if (savedWin && Array.prototype.some.call(winSel.options, function (o) { return o.value === savedWin; })) winSel.value = savedWin;
    S.windowHours = parseFloat(winSel.value) || 24;
    winSel.addEventListener('change', function (e) {
      S.windowHours = parseFloat(e.target.value) || 24;
      try { window.localStorage.setItem(LS + 'window', e.target.value); } catch (er) { /* private mode */ }
      renderChrome();
    });

    el('tt-anchor').addEventListener('change', function (e) {
      S.anchor = e.target.value;
      el('tt-endat-row').classList.toggle('hidden', S.anchor !== 'custom');
      if (S.anchor === 'custom' && !S.endAt) {
        var d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
        el('tt-endat').value = d.toISOString().slice(0, 16);
        S.endAt = el('tt-endat').value;
      }
      renderChrome();
    });
    el('tt-endat').addEventListener('change', function (e) { S.endAt = e.target.value; renderChrome(); });

    /* Four server-side narrowing controls. Each one reduces what counts against
       the per-call cap, and on a busy instance that cap is the binding
       constraint — a wide window silently drops the oldest activity. */
    el('tt-fetch-type').addEventListener('change', function (e) {
      S.fetchType = e.target.value;
      renderChrome();
    });
    el('tt-fetch-state').addEventListener('change', function (e) {
      S.fetchState = e.target.value;
      renderChrome();
    });
    el('tt-take').addEventListener('change', function (e) {
      S.take = parseInt(e.target.value, 10) || 1000;
      renderChrome();
    });
    el('tt-env-all').addEventListener('click', function (e) {
      e.preventDefault();
      S.fetchEnvs = [];
      renderEnvList();
      renderChrome();
    });

    el('tt-space').addEventListener('change', function (e) {
      var id = e.target.value;
      if (!id || id === S.spaceId) return;
      // a different space has different environments, so the environment
      // narrowing from the previous one cannot carry over
      S.fetchEnvs = [];
      S.selProject = null; S.selTenant = null; S.selUntenanted = null;
      S.expanded = null;
      S.ready = false;
      viewKey = '';
      hideBanner('tt-error'); hideBanner('tt-warn');
      scheduleDraw();
      loadSpace(id).then(afterLoad, onLoadError);
    });

    el('tt-apply').addEventListener('click', function () {
      S.scopeOpen = false;
      el('tt-scope-panel').classList.add('hidden');
      reloadAll();
    });
    el('tt-reload').addEventListener('click', reloadAll);

    el('tt-theme').addEventListener('click', function () {
      applyTheme(S.theme === 'dark' ? 'light' : 'dark');
      updateThemeButton();
      refresh();
    });

    el('tt-play').addEventListener('click', function () {
      if (S.playing) { stopPlay(); refresh(); return; }
      if (S.playFrac >= 1) S.playFrac = 0;
      S.playing = true;
      refresh();
      playTimer = setTimeout(tickPlay, 33);
    });
    el('tt-now').addEventListener('click', function () { stopPlay(); S.playFrac = 1; refresh(); });
    el('tt-peakq').addEventListener('click', function () {
      if (!S.ready) return;
      var V = getView();
      if (!V.peakMoment) { showBanner('tt-warn', 'No task queued at any point in this window.'); return; }
      hideBanner('tt-warn');
      stopPlay();
      var span = Math.max(1, D.winEnd - D.winStart);
      // nudge just inside the interval so the task is mid-queue, not starting
      S.playFrac = Math.max(0, Math.min(1, (V.peakMoment.at + 1000 - D.winStart) / span));
      refresh();
    });
    el('tt-sel-clear').addEventListener('click', function () {
      S.selProject = null; S.selTenant = null; S.selUntenanted = null; refresh();
    });
    el('tt-sel-table').addEventListener('click', function () { setView('table'); });

    window.addEventListener('resize', scheduleDraw);
    if (typeof ResizeObserver === 'function') {
      var ro = new ResizeObserver(scheduleDraw);
      ro.observe(wrap);
      ro.observe(strip.parentElement);
    }
  }

  function reloadAll() {
    S.ready = false;
    viewKey = '';
    hideBanner('tt-error'); hideBanner('tt-warn');
    scheduleDraw();
    if (!S.spaceId) {
      loadSpaces().then(function (id) {
        if (!id) { setLoading(null); showBanner('tt-error', 'No spaces are visible to this account.'); return; }
        return loadSpace(id).then(afterLoad, onLoadError);
      }, onLoadError);
      return;
    }
    loadSpace(S.spaceId).then(afterLoad, onLoadError);
  }

  /* Every reason the picture might be incomplete, stated together. These used
     to be separate showBanner() calls, where the last one silently overwrote
     the ones before it — so a window that hit the cap AND came back empty
     reported only the emptiness, which reads as a quiet period. */
  function afterLoad() {
    S.ready = true;
    setLoading(null);

    var notes = [];
    if (D.truncated) {
      notes.push('The API returned the full per-call cap of ' + nf(S.take) +
        ', so the oldest activity in this window is missing. Narrow the fetch in the scope menu.');
    }
    if (D.lookup && D.lookup.dropped) {
      notes.push(nf(D.lookup.dropped) + ' of ' + nf(D.lookup.requested) +
        ' tasks were past this dashboard\'s lookup ceiling and were not read at all.');
    }
    if (D.lookup && D.lookup.missing) {
      notes.push(nf(D.lookup.missing) + ' tasks returned no detail and are not shown — they may have been deleted since they ran.');
    }
    if (!D.tasks.length) {
      notes.push('No Deploy or RunbookRun task completed in this window for ' + S.spaceName + '.');
    }

    if (notes.length) showBanner('tt-warn', notes.join(' '));
    else hideBanner('tt-warn');
    refresh();
  }

  function onLoadError(err) {
    S.ready = false;
    setLoading(null);
    showBanner('tt-error', (err && err.message) ? err.message : String(err));
  }

  function boot() {
    canvas = el('tt-canvas');
    wrap = el('tt-canvas-wrap');
    strip = el('tt-stripcanvas');

    var savedTheme = null;
    try { savedTheme = window.localStorage.getItem(LS + 'theme'); } catch (e) { /* private mode */ }
    applyTheme(savedTheme || 'dark');
    updateThemeButton();

    wireCanvas();
    wireStrip();
    wire();
    renderChrome();

    reloadAll();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

})();
