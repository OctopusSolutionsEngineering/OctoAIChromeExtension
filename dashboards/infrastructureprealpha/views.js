'use strict';
const Views = (function () {
  function escHtml(s) { return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
  function stateView(kind, detail) {
    if (kind === 'loading') return '<div class="ip-state"><div class="ip-spinner"></div><p>Loading your infrastructure…</p></div>';
    if (kind === 'auth') return '<div class="ip-state"><h3>Sign in to Octopus</h3>'
      + '<p>Your session isn\'t authenticated. Open your Octopus instance, sign in, then reopen this dashboard.</p></div>';
    if (kind === 'noconfig') return '<div class="ip-state"><h3>Open from the Octopus AI Assistant</h3>'
      + '<p>This dashboard reads its configuration from the extension, so it can\'t run when opened directly as a local file. '
      + 'Load the unpacked extension, then open it from the AI Assistant — or run '
      + '<code>showDashboard(&#123; dashboardFile: "infrastructureprealpha/index.html", serverUrl: "https://your-instance.octopus.app/", context: &#123;&#125; &#125;)</code> '
      + 'from the extension service worker console.</p></div>';
    return '<div class="ip-state"><h3>Couldn\'t load infrastructure</h3><p>' + escHtml(detail || 'Unknown error') + '</p></div>';
  }
  function bar(healthy, unhealthy, disabled) {
    const t = healthy + unhealthy + disabled || 1;
    const pc = n => (n / t * 100).toFixed(1) + '%';
    return '<div class="ip-bar">'
      + '<span style="width:' + pc(healthy) + ';background:var(--color-green-400)"></span>'
      + '<span style="width:' + pc(unhealthy) + ';background:var(--color-red-400)"></span>'
      + '<span style="width:' + pc(disabled) + ';background:var(--color-slate-300)"></span></div>';
  }
  // Shared render helpers (Task B1) — consumed by B2/B3/C1-C3.
  function healthBar(healthy, unhealthy, disabled) { return bar(healthy, unhealthy, disabled); }
  function pill(kind, text) {
    return '<span class="ip-pill ip-pill-' + escHtml(kind) + '">' + escHtml(text) + '</span>';
  }
  function chip(text, tone) {
    return '<span class="ip-chipx ip-chipx-' + escHtml(tone || 'neutral') + '">' + escHtml(text) + '</span>';
  }
  // The ring drew a single green arc against a grey remainder, which left unhealthy and
  // disabled targets sharing one undifferentiated track — next to health-by-type bars that
  // were already green/red/slate. It now segments on the same colours as bar(), so the ring,
  // the legend under it and the type bars read as one thing. Takes the overview counts;
  // still accepts a bare percentage for a healthy-only ring.
  function donut(counts) {
    const R = 52, C = 2 * Math.PI * R;
    const clampPct = v => Math.max(0, Math.min(100, Math.round(v || 0)));
    const num = v => Math.max(0, Math.round(Number(v) || 0));
    let p, segs;
    if (counts && typeof counts === 'object') {
      const h = num(counts.healthy), u = num(counts.unhealthy), d = num(counts.disabled);
      const total = h + u + d;
      p = counts.healthyPct == null ? (total ? clampPct(h / total * 100) : 0) : clampPct(counts.healthyPct);
      // Fractions come off the bucket total, not healthyPct, so the three arcs always close
      // the circle even where healthyPct has been rounded.
      segs = total ? [[h, 'var(--color-green-400)'], [u, 'var(--color-red-400)'], [d, 'var(--color-slate-300)']]
        .filter(s => s[0] > 0).map(s => [s[0] / total, s[1]]) : [];
    } else {
      p = clampPct(counts);
      segs = p > 0 ? [[p / 100, 'var(--color-green-400)']] : [];
    }
    // One dash run per segment, each shifted forward by the fraction already drawn (negative
    // dashoffset advances along the path). Butt caps, not round: round caps on adjacent
    // segments overlap, which overstates whichever segment is smaller.
    let drawn = 0;
    const arcs = segs.map(seg => {
      const len = C * seg[0], off = -C * drawn;
      drawn += seg[0];
      return '<circle cx="64" cy="64" r="' + R + '" fill="none" stroke="' + seg[1] + '" stroke-width="14"'
        + ' stroke-dasharray="' + len.toFixed(1) + ' ' + C.toFixed(1) + '"'
        + ' stroke-dashoffset="' + off.toFixed(1) + '" transform="rotate(-90 64 64)"/>';
    }).join('');
    return '<svg class="ip-donut" viewBox="0 0 128 128" width="128" height="128">'
      + '<circle cx="64" cy="64" r="' + R + '" fill="none" stroke="var(--muted)" stroke-width="14"/>'
      + arcs
      + '<text x="64" y="60" text-anchor="middle" class="ip-donut-pct">' + p + '%</text>'
      + '<text x="64" y="80" text-anchor="middle" class="ip-donut-sub">healthy</text></svg>';
  }
  function heatCell(value, max, tone) {
    if (value === 0) return '<td class="ip-heat">0</td>';
    const a = max > 0 ? (value / max) : 0;
    const base = tone === 'bad' ? '214,61,61' : '0,171,98'; // red / green rgb
    return '<td class="ip-heat" style="background:rgba(' + base + ',' + (0.12 + a * 0.7).toFixed(2) + ')">' + value + '</td>';
  }
  // Shared Environment/Total/Healthy/Unhealthy/Disabled header — single source of truth so the
  // Overview "Health by environment" heatmap and the Environments view heatmap always carry the
  // same <th> set, in the same order, and stay column-aligned (see .ip-heatmap CSS).
  function _envHeatHead() {
    return '<thead><tr><th>Environment</th><th>Total</th><th>Healthy</th><th>Unhealthy</th><th>Disabled</th></tr></thead>';
  }
  // The infrastructure machines page lives on the Octopus instance itself, whose base URL isn't
  // part of the overviewModel shape (ov, estate) this view is contracted to accept. dashboard.js
  // sets a global `IP.serverUrl` once config is read, well before any view renders, so this reads
  // it defensively rather than widening renderOverview's signature.
  function _octopusMachinesUrl() {
    let base = '';
    try { base = (typeof IP !== 'undefined' && IP && IP.serverUrl) || ''; } catch (e) { base = ''; }
    return String(base).replace(/\/$/, '') + '/app#/infrastructure/machines';
  }
  function renderOverview(ov, estate) {
    const ab = (ov.agents && ov.agents.behind) || 0;
    const agentsPillText = ab === 0 ? 'all up to date' : ab + ' behind';
    const typeRows = ov.byType.map(r =>
      '<div class="ip-type-row">'
      + '<div class="ip-type-name">' + escHtml(r.name) + '</div>'
      + '<div class="ip-type-bar">' + healthBar(r.healthy, r.unhealthy, r.disabled || 0) + '</div>'
      + '<div class="ip-type-counts"><span class="ip-num-healthy">' + r.healthy + '</span>'
      +   '<span class="ip-num-unhealthy">' + r.unhealthy + '</span>'
      +   (r.disabled ? '<span class="ip-num-disabled">' + r.disabled + '</span>' : '')
      + '</div></div>').join('');
    const envTop = ov.byEnv.slice(0,5);
    const maxHealthy = envTop.reduce((m,r)=>Math.max(m, r.healthy), 0);
    const maxUnhealthy = envTop.reduce((m,r)=>Math.max(m, r.unhealthy), 0);
    const envRows = envTop.map(r =>
      '<tr><td><a href="#environments">' + escHtml(r.name) + '</a></td><td>' + r.total + '</td>'
      + heatCell(r.healthy, maxHealthy, 'good')
      + heatCell(r.unhealthy, maxUnhealthy, 'bad')
      + '<td>' + r.disabled + '</td></tr>').join('');
    const pools = ov.workers.pools.map(p =>
      '<li><span>' + escHtml(p.name) + '</span><b>' + p.count + '</b></li>').join('');
    return ''
      + '<header class="ip-head ip-head-actions">'
      +   '<div class="ip-head-text"><h2>Infrastructure overview</h2>'
      +     '<p class="ip-sub">A diagnostic snapshot of your deployment estate.</p></div>'
      +   '<a class="ip-head-pill" href="#agents">Deployment agent versions (Tentacles &amp; K8s) · ' + agentsPillText + ' →</a>'
      + '</header>'
      + '<section class="ip-card ip-ov-panel">'
      +   '<div class="ip-card-head">'
      +     '<h4>Deployment targets <span class="ip-count-inline">' + ov.total + '</span></h4>'
      +     '<div class="ip-card-actions">'
      +       '<a class="ip-link" href="' + escHtml(_octopusMachinesUrl()) + '" target="_blank" rel="noopener">Re-run health checks</a>'
      +       '<a class="ip-link" href="#targets">Open list →</a>'
      +     '</div>'
      +   '</div>'
      +   '<div class="ip-panel-cols">'
      +     '<div class="ip-panel-left">'
      +       '<div class="ip-donut-wrap">' + donut(ov) + '</div>'
      +       '<div class="ip-legend-big">'
      +         '<div class="ip-legend-stat"><div class="ip-legend-label"><span class="ip-dot ip-dot-healthy"></span>Healthy</div>'
      +           '<div class="ip-legend-num ip-num-healthy">' + ov.healthy + '</div></div>'
      +         '<div class="ip-legend-stat"><div class="ip-legend-label"><span class="ip-dot ip-dot-unhealthy"></span>Unhealthy</div>'
      +           '<div class="ip-legend-num ip-num-unhealthy">' + ov.unhealthy + '</div></div>'
      +         '<div class="ip-legend-stat"><div class="ip-legend-label"><span class="ip-dot ip-dot-disabled"></span>Disabled</div>'
      +           '<div class="ip-legend-num ip-num-disabled">' + ov.disabled + '</div></div>'
      +       '</div>'
      +     '</div>'
      +     '<div class="ip-panel-right">'
      +       '<h5 class="ip-subhead">Health by target type</h5>'
      +       '<div class="ip-type-rows">' + (typeRows || '<p class="ip-sub">No targets</p>') + '</div>'
      +     '</div>'
      +   '</div>'
      +   '<div class="ip-heatmap-block">'
      +     '<div class="ip-heatmap-head"><h5 class="ip-subhead">Health by environment</h5>'
      +       '<span class="ip-caption">Cell intensity = share of estate</span></div>'
      +     '<table class="ip-table ip-heatmap">' + _envHeatHead()
      +     '<tbody>' + (envRows || '<tr><td colspan="5">No environments</td></tr>') + '</tbody></table>'
      +     '<a class="ip-link" href="#environments">View all environments →</a>'
      +   '</div>'
      + '</section>'
      + '<div class="ip-grid ip-grid-below">'
      +   '<section class="ip-card"><h4>Workers</h4><div class="ip-big">' + ov.workers.total + '</div>'
      +     '<ul class="ip-legend"><li>' + ov.workers.healthy + ' Healthy</li><li>' + ov.workers.unhealthy + ' Unhealthy</li></ul>'
      +     '<ul class="ip-pools">' + pools + '</ul><a class="ip-link" href="#workers">Open →</a></section>'
      +   '<section class="ip-card"><h4>Argo CD <span class="ip-tag">Early access</span></h4>'
      +     '<p class="ip-sub">Not available via the Octopus API yet. Shows connections, gateway health, and managed apps when the instance exposes Argo CD.</p></section>'
      + '</div>';
  }
  const IP_PAGE_SIZE = 100;
  // ─── Deployment Targets section (Paul Stovell's feedback, 28 Jul) ────────────
  // Machine policies and deployment agents used to be top-level nav items. Both are rare
  // destinations next to the targets list itself, so they're tabs within one Deployment
  // Targets section and the sidebar carries only the five places people actually navigate to.
  //
  // The routes stay flat — #agents and #machinepolicies, rendered inside this shell with
  // "Deployment Targets" active in the sidebar. #targets/agents would collide with the
  // #targets/<machine-id> detail route, which already has to reserve "new" for that reason,
  // and flat routes keep the overview's agent-versions pill working.
  const IP_TARGET_SECTIONS = [
    { key:'targets',  hash:'#targets',         label:'Deployment Targets' },
    { key:'agents',   hash:'#agents',          label:'Agents' },
    { key:'policies', hash:'#machinepolicies', label:'Policies' }
  ];
  function _sectionTabs(active) {
    return '<nav class="ip-tabs ip-section-tabs" aria-label="Deployment targets sections">'
      + IP_TARGET_SECTIONS.map(s => '<a class="ip-tab ip-section-tab'
        + (s.key === active ? ' ip-tab-active' : '') + '" href="' + s.hash + '"'
        + (s.key === active ? ' aria-current="page"' : '') + '>' + escHtml(s.label) + '</a>').join('')
      + '</nav>';
  }
  // The <h2> stays "Deployment targets" on all three tabs — a title that changed per tab
  // would make the tabs read as navigation. Each section's own framing moves to the subtitle.
  // `sub` is trusted markup: callers escape anything dynamic before passing it.
  function _sectionHead(sub, actionHtml) {
    const text = '<h2>Deployment targets</h2><p class="ip-sub">' + sub + '</p>';
    return actionHtml
      ? '<header class="ip-head ip-head-actions"><div class="ip-head-text">' + text + '</div>'
        + actionHtml + '</header>'
      : '<header class="ip-head">' + text + '</header>';
  }
  function filterChip(key, value, label) {
    return '<button class="ip-chip" data-key="' + escHtml(key) + '" data-value="' + escHtml(value) + '">'
      + escHtml(label) + ' ✕</button>';
  }
  const IP_TARGETS_COLS = 10;
  const IP_HEALTH_GROUP_ORDER = ['unhealthy', 'healthy', 'disabled'];
  // A target's name links to its detail page wherever it appears — the targets table, the
  // agent table, and the environments sub-list. Falls back to plain text without an id, so a
  // row from a model that doesn't carry one never renders a link to nowhere.
  function targetNameLink(id, name) {
    return id
      ? '<a class="ip-target-link" href="#targets/' + escHtml(encodeURIComponent(id)) + '">'
        + escHtml(name) + '</a>'
      : escHtml(name);
  }
  function _targetRow(t) {
    return '<tr class="ip-row" data-id="' + escHtml(t.id) + '">'
      + '<td>' + targetNameLink(t.id, t.name) + '</td>'
      + '<td>' + escHtml(t.type) + '</td>'
      + '<td>' + escHtml(t.os) + '</td>'
      + '<td>' + escHtml(t.osVersion) + '</td>'
      + '<td>' + pill(t.healthKey, t.health) + '</td>'
      + '<td>' + chip(t.env, 'env') + '</td>'
      + '<td>' + chip(t.tag, 'tag') + '</td>'
      + '<td>' + escHtml(t.tenant) + '</td>'
      + '<td>' + escHtml(t.policy) + '</td>'
      + '<td>' + escHtml(t.version) + '</td></tr>';
  }
  function renderTargets(IP) {
    const all = IP.estate.targets;
    // Nothing to filter, so the facet rail and toolbar would be furniture around a void.
    if (!all.length) return renderTargetsZero(IP);
    const facets = Data.buildFacets(all);
    const rows = Data.applyFilters(all, IP.filters, IP.search);

    // Group by health (Unhealthy → Healthy → Disabled), then paginate the
    // flattened, grouped sequence by DATA rows only — group header rows are
    // inserted per-page around whichever slice of a group lands there, and
    // don't count toward the 100/page budget. A group whose rows straddle a
    // page boundary contributes to both pages (its header repeats on the
    // continuation page) rather than ever dropping a target.
    const groups = IP_HEALTH_GROUP_ORDER
      .map(key => ({ key, items: rows.filter(t => t.healthKey === key) }))
      .filter(g => g.items.length);
    const groupedRows = groups.reduce((acc, g) => acc.concat(g.items), []);

    const pages = Math.max(1, Math.ceil(groupedRows.length / IP_PAGE_SIZE));
    const page = Math.min(IP.page || 1, pages);
    const pageStart = (page - 1) * IP_PAGE_SIZE, pageEnd = page * IP_PAGE_SIZE;

    const chips = [];
    Object.keys(IP.filters||{}).forEach(k => (IP.filters[k]||[]).forEach(v => {
      const f = facets.find(x=>x.key===k); const o = f && f.options.find(x=>x.value===v);
      chips.push(filterChip(k, v, (f?f.label:k) + ': ' + (o?o.label:v)));
    }));

    const facetHtml = facets.map(f => f.options.length ? '<div class="ip-facet"><div class="ip-facet-h">'
      + escHtml(f.label) + '</div>' + f.options.slice(0,12).map(o => {
        const on = (IP.filters[f.key]||[]).includes(o.value);
        return '<label class="ip-opt"><input type="checkbox" data-key="' + escHtml(f.key) + '" data-value="'
          + escHtml(o.value) + '"' + (on?' checked':'') + '> <span>' + escHtml(o.label)
          + '</span><b>' + o.count + '</b></label>';
      }).join('') + '</div>' : '').join('');

    let _offset = 0;
    const rowHtml = groups.map(g => {
      const groupStart = _offset, groupEnd = _offset + g.items.length;
      _offset = groupEnd;
      const visStart = Math.max(0, pageStart - groupStart);
      const visEnd = Math.min(g.items.length, pageEnd - groupStart);
      if (visEnd <= visStart) return '';
      const header = '<tr class="ip-group"><td colspan="' + IP_TARGETS_COLS + '">'
        + escHtml(g.key.toUpperCase()) + ' ' + g.items.length + '</td></tr>';
      return header + g.items.slice(visStart, visEnd).map(_targetRow).join('');
    }).join('');

    const body = rows.length
      ? '<div class="ip-targets-scroll"><table class="ip-table ip-targets"><thead><tr>'
        + '<th>Deployment target</th><th>Type</th><th>Operating system</th><th>OS version</th>'
        + '<th>Health</th><th>Environment</th><th>Target tag</th><th>Tenant</th><th>Machine policy</th><th>Agent version</th>'
        + '</tr></thead><tbody>' + rowHtml + '</tbody></table></div>'
        + (pages>1 ? '<div class="ip-pager" data-pages="'+pages+'" data-page="'+page+'">Page ' + page + ' of ' + pages
          + ' <button class="ip-page-prev"' + (page<=1?' disabled':'') + '>Prev</button>'
          + '<button class="ip-page-next"' + (page>=pages?' disabled':'') + '>Next</button></div>' : '')
      : Data.emptyKind(all.length, rows.length) === 'none'
        ? '<div class="ip-empty"><h3>No deployment targets in this space</h3>'
          + '<p>Targets are the machines and services Octopus deploys to. Add one to get started.</p>'
          + '<a class="ip-btn" href="#targets/new">Add deployment target</a></div>'
        : '<div class="ip-empty"><h3>No targets match these filters</h3><p>Try removing a filter or clearing your search.</p></div>';

    // Header and tabs sit above the facet rail: the rail filters within this list, the tabs
    // switch section. Side by side they'd read as another filter.
    return _sectionHead('Assess health across the estate and drill in with fast, faceted filters.')
      + _sectionTabs('targets')
      + '<div class="ip-targets-wrap">'
      + '<div class="ip-facets"><div class="ip-facet-title">Filters</div>'
      +   (chips.length ? '<div class="ip-chips">' + chips.join('') + '<button class="ip-clear">Clear all</button></div>' : '')
      +   facetHtml + '</div>'
      + '<div class="ip-targets-main">'
      +   '<div class="ip-toolbar"><input class="ip-search" type="search" placeholder="Search targets…" value="'
      +     escHtml(IP.search||'') + '"><span class="ip-count">' + rows.length + ' of ' + all.length + '</span>'
      +     '<a class="ip-btn" href="#targets/new">Add deployment target</a></div>'
      +   body + '</div></div>';
  }
  // A resource the API refused or failed to return is not an empty resource. Views call
  // this instead of their zero state so nobody is told a collection is empty when we
  // simply couldn't read it — most often a permissions boundary on the space.
  function _unreadable(label) {
    return '<div class="ip-empty"><h3>Couldn\'t load ' + escHtml(label) + '</h3>'
      + '<p>Octopus didn\'t return ' + escHtml(label) + ' for this space. That usually means '
      + 'your account can\'t read them here, rather than that there are none. '
      + 'Try another space, or open Octopus directly.</p></div>';
  }

  // ── Designed zero states ──────────────────────────────────────────────────────
  // A view with nothing in it gets the prototype's treatment: one centred card that
  // explains what the thing is and how to add one, then a dimmed PREVIEW of what the
  // populated view will look like. The preview is sample content, so it's labelled and
  // muted — it has to be impossible to read as this estate's real data.
  const ZERO_ICON = {
    target: '<svg width="28" height="28" viewBox="0 0 20 20" fill="none" stroke="var(--color-blue-600)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="16" height="11" rx="1.5"/><path d="M7 17h6M10 14v3"/></svg>',
    worker: '<svg width="28" height="28" viewBox="0 0 20 20" fill="var(--fg2)"><rect x="4" y="3" width="4" height="14" rx="1"/><rect x="12" y="3" width="4" height="14" rx="1"/></svg>'
  };
  function _zeroCard(icon, title, body, actionHref, actionLabel, learnHref, learnLabel) {
    return '<section class="ip-zero">'
      + '<div class="ip-zero-icon">' + icon + '</div>'
      + '<h3>' + escHtml(title) + '</h3>'
      + '<p class="ip-zero-body">' + escHtml(body) + '</p>'
      + '<a class="ip-btn" href="' + escHtml(actionHref) + '">+ ' + escHtml(actionLabel) + '</a>'
      + '<a class="ip-link ip-zero-learn" href="' + escHtml(learnHref) + '" target="_blank" rel="noopener">'
      +   escHtml(learnLabel) + ' →</a>'
      + '</section>';
  }
  function _previewBlock(caption, inner) {
    return '<div class="ip-preview" aria-hidden="true">'
      + '<div class="ip-preview-head"><span class="ip-preview-label">Preview</span></div>'
      + '<p class="ip-sub">' + escHtml(caption) + '</p>'
      + inner + '</div>';
  }
  function renderTargetsZero(IP) {
    const rows = [
      { name:'web-prod-public-api-01', sub:'Tentacle (Listening) · Windows Server 2022',
        env:'Production', policy:'Auto-upgrade', version:'8.3.0' },
      { name:'k8s-prod-worker-02', sub:'Kubernetes Agent · Linux',
        env:'Production', policy:'Default', version:'2.6.0' }
    ].map(r => '<tr><td><div class="ip-prev-name">' + escHtml(r.name) + '</div>'
      + '<div class="ip-prev-sub">' + escHtml(r.sub) + '</div></td>'
      + '<td>' + pill('healthy', 'Healthy') + '</td>'
      + '<td>' + chip(r.env, 'env') + '</td>'
      + '<td>' + escHtml(r.policy) + '</td>'
      + '<td><span class="ip-dot ip-dot-healthy"></span> ' + escHtml(r.version) + '</td></tr>').join('');
    // The tabs belong here too. Phase 4 established that an explicit nav click always
    // reaches its own view; an empty estate that couldn't reach Agents or Policies would
    // reintroduce the same dead end one level down.
    return ''
      + _sectionHead('Assess health across the estate and drill in with fast, faceted filters.',
          '<a class="ip-btn" href="#targets/new">+ Add deployment target</a>')
      + _sectionTabs('targets')
      + _zeroCard(ZERO_ICON.target, 'Add your first deployment target',
          'Deployment targets are the servers, clusters, and services your projects deploy to. '
          + 'Add one and Octopus starts tracking its health automatically.',
          '#targets/new', 'Add deployment target',
          'https://octopus.com/docs/infrastructure/deployment-targets', 'Learn about deployment targets')
      + _previewBlock('Once added, your targets appear here with health, environment, and agent version:',
          '<table class="ip-table ip-prev-table"><thead><tr><th>Deployment target</th><th>Health</th>'
          + '<th>Environment</th><th>Machine policy</th><th>Agent version</th></tr></thead>'
          + '<tbody><tr class="ip-prev-group"><td colspan="5">'
          + '<span class="ip-dot ip-dot-healthy"></span> Healthy</td></tr>'
          + rows + '</tbody></table>');
  }
  function renderWorkersZero(IP) {
    const pools = [{ name:'Default Pool', n:6 }, { name:'Hosted Ubuntu', n:4 }, { name:'DMZ Pool', n:2 }]
      .map(p => '<div class="ip-card ip-prev-pool"><div class="ip-prev-pool-name">'
        + ZERO_ICON.worker.replace('width="28" height="28"', 'width="14" height="14"')
        + ' ' + escHtml(p.name) + '</div>'
        + '<div class="ip-prev-pool-n">' + p.n + ' <span>workers</span></div>'
        + '<div class="ip-prev-pool-bar"></div></div>').join('');
    return ''
      + '<header class="ip-head ip-head-actions"><div class="ip-head-text"><h2>Workers</h2>'
      +   '<p class="ip-sub">A separate class of infrastructure — organised into shared pools, not tenant-scoped.</p></div>'
      +   '<a class="ip-btn" href="' + escHtml(_workerAddUrl()) + '" target="_blank" rel="noopener">+ Add worker</a></header>'
      + _zeroCard(ZERO_ICON.worker, 'Add your first worker',
          'Workers are shared infrastructure that run deployment steps outside your targets — '
          + 'ideal for tasks like Terraform, database migrations, or cloud API calls.',
          _workerAddUrl(), 'Add worker',
          'https://octopus.com/docs/infrastructure/workers', 'Learn about workers & worker pools')
      + _previewBlock('Once added, workers are grouped into pools with their own health and versions:',
          '<div class="ip-grid ip-prev-pools">' + pools + '</div>');
  }
  function _row(k,v){ return '<div class="ip-kv"><span>' + escHtml(k) + '</span><b>' + escHtml(v) + '</b></div>'; }
  function _when(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  }
  function _taskUrl(serverUrl, spaceId, taskId) {
    return String(serverUrl || '').replace(/\/$/, '')
      + '/app#/' + encodeURIComponent(spaceId || '') + '/tasks/' + encodeURIComponent(taskId || '');
  }
  // `raw` is the unnormalised fetch result: null means the request failed, [] means the
  // target genuinely has none. Collapsing those two into one message is the failure mode
  // this card exists to avoid.
  function _activityCard(title, rows, raw, t, serverUrl, emptyMsg) {
    const body = raw === null
      ? '<p class="ip-sub">Couldn\'t load this from the Octopus API. Try again, or open the '
        + '<a class="ip-link" href="' + escHtml(String(serverUrl||'').replace(/\/$/,'')
        + '/app#/infrastructure/machines/' + encodeURIComponent(t.id)) + '" target="_blank" rel="noopener">'
        + 'target page in Octopus</a>.</p>'
      : !rows.length
        ? '<p class="ip-sub">' + escHtml(emptyMsg) + '</p>'
        : '<table class="ip-table"><tbody>' + rows.map(r =>
            '<tr><td>' + pill(r.success ? 'healthy' : 'unhealthy', r.state) + '</td>'
            + '<td><a class="ip-link" href="' + escHtml(_taskUrl(serverUrl, t.spaceId, r.id))
            + '" target="_blank" rel="noopener">' + escHtml(r.description) + '</a></td>'
            + '<td class="ip-when">' + escHtml(_when(r.completed)) + '</td></tr>').join('')
          + '</tbody></table>';
    return '<section class="ip-card ip-card-wide"><h4>' + escHtml(title) + '</h4>' + body + '</section>';
  }
  function deploymentsCardHtml(t, activity, raw, serverUrl) {
    const last = activity.lastSuccessfulDeploy;
    const lead = raw === null || !activity.deployments.length ? ''
      : last
        ? '<p class="ip-sub">Last successful: ' + escHtml(last.description)
          + (last.completed ? ' (' + escHtml(_when(last.completed)) + ')' : '') + '</p>'
        : '<p class="ip-sub">No deployment to this target has succeeded yet.</p>';
    const card = _activityCard('Deployments', activity.deployments, raw, t, serverUrl,
      'No deployments to this target in the retained task history.');
    return card.replace('</h4>', '</h4>' + lead);
  }
  function runbooksCardHtml(t, activity, raw, serverUrl) {
    return _activityCard('Runbook runs', activity.runbooks, raw, t, serverUrl,
      'No runbook runs against this target in the retained task history.');
  }
  function eventsCardHtml(t, rows, raw, serverUrl) {
    const body = raw === null
      ? '<p class="ip-sub">Couldn\'t load events from the Octopus API. Try again, or open the '
        + '<a class="ip-link" href="' + escHtml(String(serverUrl||'').replace(/\/$/,'')
        + '/app#/infrastructure/machines/' + encodeURIComponent(t.id)) + '" target="_blank" rel="noopener">'
        + 'target page in Octopus</a>.</p>'
      : !rows.length
        // The query succeeded and matched nothing. Octopus prunes events, so an
        // untouched target legitimately has none — say that rather than implying
        // nothing has ever happened to it.
        ? '<p class="ip-sub">No events retained for this target. Octopus prunes its event '
          + 'history, so a target that has been quiet for a while will show none.</p>'
        : '<table class="ip-table"><tbody>' + rows.map(r =>
            '<tr><td class="ip-when">' + escHtml(_when(r.occurred)) + '</td>'
            + '<td>' + escHtml(r.message) + '</td>'
            + '<td class="ip-ev-who">' + escHtml(r.who) + '</td></tr>').join('')
          + '</tbody></table>';
    return '<section class="ip-card ip-card-wide"><h4>Events</h4>' + body + '</section>';
  }
  function connectivityCardHtml(t, connection) {
    const rows = connection
      ? _row('Status', connection.Status || '—')
        + _row('Communication', t.comm)
        + _row('Tentacle version', connection.CurrentTentacleVersion || t.version)
        + (connection.LastChecked ? _row('Last checked', _when(connection.LastChecked)) : '')
      : _row('Communication', t.comm) + _row('Health', t.health);
    return '<section class="ip-card"><h4>Connectivity</h4>' + rows + '</section>';
  }
  function renderTargetDetail(IP) {
    const t = (IP.estate.targets||[]).find(x => x.id === IP.detailId);
    if (!t) return '<div class="ip-state"><h3>Target not found</h3><a class="ip-link" href="#targets">← Back to targets</a></div>';
    const loading = '<p class="ip-sub">Loading…</p>';
    return ''
      + '<a class="ip-link" href="#targets">← Deployment targets</a>'
      + '<header class="ip-head"><h2>' + escHtml(t.name) + '</h2>'
      +   '<p class="ip-sub">' + escHtml(t.kind) + ' · ' + escHtml(t.health) + '</p></header>'
      + '<div class="ip-grid">'
      +   '<div id="ip-td-conn">' + connectivityCardHtml(t, null) + '</div>'
      +   '<section class="ip-card"><h4>Tentacle version</h4>' + _row('Installed', t.version)
      +     '<p class="ip-sub">Upgrades are governed by the ' + escHtml(t.policy) + ' machine policy.</p></section>'
      +   '<section class="ip-card"><h4>Settings</h4>' + _row('Environment', t.env) + _row('Target tag', t.tag)
      +     _row('Tenant', t.tenant) + _row('Machine policy', t.policy) + '</section>'
      +   '<div id="ip-td-deploys"><section class="ip-card ip-card-wide"><h4>Deployments</h4>' + loading + '</section></div>'
      +   '<div id="ip-td-runbooks"><section class="ip-card"><h4>Runbook runs</h4>' + loading + '</section></div>'
      +   '<div id="ip-td-events"><section class="ip-card ip-card-wide"><h4>Events</h4>' + loading + '</section></div>'
      + '</div>';
  }
  // Called once the per-target fetch resolves. The rest of the detail view is already on
  // screen by then, so a slow or failing tasks call never blocks it.
  function fillTargetDetail(IP, detail) {
    const t = (IP.estate.targets||[]).find(x => x.id === IP.detailId);
    if (!t || !detail) return;
    const activity = Data.machineActivityModel(detail.tasks);
    const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
    set('ip-td-conn', connectivityCardHtml(t, detail.connection));
    set('ip-td-deploys', deploymentsCardHtml(t, activity, detail.tasks, IP.serverUrl));
    set('ip-td-runbooks', runbooksCardHtml(t, activity, detail.tasks, IP.serverUrl));
    set('ip-td-events', eventsCardHtml(t, Data.eventsModel(detail.events), detail.events, IP.serverUrl));
  }
  function bindTargetDetail(IP) { /* back link is a plain hash anchor; nothing to wire yet */ }

  // Add-target walkthrough. PreAlpha is read-only, so this explains the choice and the
  // prerequisites, then hands off to Octopus to do the actual creation. The value is the
  // decision (which connection direction suits this machine?), which is the part the real
  // Octopus flow makes you resolve after you've already committed to a type.
  const ADD_TARGET_TYPES = [
    { key: 'listening', name: 'Listening Tentacle',
      when: 'Machines on a network the Octopus Server can reach directly.',
      direction: 'Octopus opens the connection to the machine.',
      needs: ['Tentacle installed on the machine',
              'Inbound TCP 10933 open from Octopus to the machine',
              'The machine’s thumbprint, to trust it'] },
    { key: 'polling', name: 'Polling Tentacle',
      when: 'Machines behind NAT, a firewall, or in someone else’s network — anywhere Octopus can’t dial in.',
      direction: 'The machine opens the connection to Octopus.',
      needs: ['Tentacle installed on the machine',
              'Outbound TCP 10943 from the machine to Octopus',
              'The Octopus Server thumbprint'] },
    { key: 'kubernetes', name: 'Kubernetes agent',
      when: 'Deploying into a Kubernetes cluster.',
      direction: 'The agent runs inside the cluster and polls Octopus.',
      needs: ['Helm access to the cluster',
              'Outbound access from the cluster to Octopus',
              'A namespace for the agent to live in'] },
    { key: 'ssh', name: 'SSH connection',
      when: 'Linux and Unix machines you reach over SSH.',
      direction: 'Octopus opens an SSH connection to the machine.',
      needs: ['An SSH account — key pair or username and password',
              'Inbound SSH (usually port 22) from Octopus',
              'A supported shell on the machine'] },
    { key: 'cloud', name: 'Azure, AWS or GCP service',
      when: 'Deploying to a managed cloud service rather than a machine you run.',
      direction: 'Octopus authenticates against the cloud provider’s API.',
      needs: ['An Octopus account for the provider',
              'Permissions on the target service',
              'Nothing to install — there’s no agent'] }
  ];
  function _newTargetUrl(IP) {
    return String((IP && IP.serverUrl) || '').replace(/\/$/, '') + '/app#/infrastructure/machines/new';
  }
  function _addTypeCard(t) {
    return '<button class="ip-card ip-type-card" data-type="' + escHtml(t.key) + '">'
      + '<h4>' + escHtml(t.name) + '</h4>'
      + '<p class="ip-sub">' + escHtml(t.when) + '</p>'
      + '<span class="ip-type-dir">' + escHtml(t.direction) + '</span></button>';
  }
  function renderAddTarget(IP) {
    const chosen = ADD_TARGET_TYPES.find(t => t.key === (IP && IP.addTargetType));
    const head = '<a class="ip-link" href="#targets">← Deployment targets</a>'
      + '<header class="ip-head"><h2>Add a deployment target</h2>';
    if (!chosen) {
      return head
        + '<p class="ip-sub">Step 1 of 2 — choose how Octopus should reach this machine.</p></header>'
        + '<div class="ip-grid ip-type-grid">' + ADD_TARGET_TYPES.map(_addTypeCard).join('') + '</div>';
    }
    return head
      + '<p class="ip-sub">Step 2 of 2 — ' + escHtml(chosen.name) + '</p></header>'
      + '<div class="ip-addtarget">'
      +   '<section class="ip-card">'
      +     '<h4>How the connection works</h4>'
      +     '<p class="ip-sub">' + escHtml(chosen.direction) + '</p>'
      +     '<h4>What you’ll need</h4><ul class="ip-needs">'
      +       chosen.needs.map(n => '<li>' + escHtml(n) + '</li>').join('')
      +     '</ul>'
      +     '<p class="ip-sub">This preview doesn’t create anything. Octopus does the setup — '
      +       'it’ll ask for these details as you go.</p>'
      +     '<a class="ip-btn" href="' + escHtml(_newTargetUrl(IP)) + '" target="_blank" rel="noopener">Continue in Octopus →</a>'
      +     ' <a class="ip-link" href="#targets/new">← Pick a different type</a>'
      +   '</section></div>';
  }
  function bindAddTarget(IP) {
    const root = document.getElementById('main-content');
    if (!root) return;
    root.querySelectorAll('.ip-type-card').forEach(card => card.addEventListener('click', () => {
      IP.addTargetType = card.getAttribute('data-type');
      root.innerHTML = renderAddTarget(IP);
      bindAddTarget(IP);
    }));
    // "Pick a different type" keeps the hash unchanged, so clear the state and re-render here.
    const back = root.querySelector('a[href="#targets/new"]');
    if (back) back.addEventListener('click', e => {
      e.preventDefault();
      IP.addTargetType = null;
      root.innerHTML = renderAddTarget(IP);
      bindAddTarget(IP);
    });
  }
  function _envAddUrl() {
    let base = '';
    try { base = (typeof IP !== 'undefined' && IP && IP.serverUrl) || ''; } catch (e) { base = ''; }
    return String(base).replace(/\/$/, '') + '/app#/infrastructure/environments/create';
  }
  function _envTargetRow(t) {
    return '<tr class="ip-row-static">'
      + '<td>' + targetNameLink(t.id, t.name) + '</td>'
      + '<td>' + escHtml(t.type) + '</td>'
      + '<td>' + pill(t.healthKey, t.health) + '</td>'
      + '<td>' + chip(t.tag, 'tag') + '</td>'
      + '<td>' + escHtml(t.tenant) + '</td></tr>';
  }
  // Pure filter used by the expanded sub-list: 'all' passes everything through,
  // any other key is a healthKey to match exactly. Missing targets → [].
  function filterEnvTargets(targets, key) {
    const list = targets || [];
    return key === 'all' ? list : list.filter(t => t.healthKey === key);
  }
  // Env heat cells carry data-env/data-health so a click can identify which environment and
  // which filter was clicked. This is a local twin of heatCell(), not a change to it — heatCell
  // is shared with Overview's read-only heatmap, which must stay non-interactive and unchanged.
  function _envCellAttrs(name, key, extraClass) {
    const what = key === 'all' ? 'all targets' : key + ' targets';
    return ' class="' + extraClass + '" role="button" tabindex="0"'
      + ' aria-label="Show ' + escHtml(what) + ' in ' + escHtml(name) + '"'
      + ' data-env="' + escHtml(name) + '" data-health="' + escHtml(key) + '"';
  }
  function _envHeatCell(value, max, tone, name, key) {
    const attrs = _envCellAttrs(name, key, 'ip-heat ip-env-cell');
    if (value === 0) return '<td' + attrs + '>0</td>';
    const a = max > 0 ? (value / max) : 0;
    const base = tone === 'bad' ? '214,61,61' : '0,171,98'; // red / green rgb
    return '<td' + attrs + ' style="background:rgba(' + base + ',' + (0.12 + a * 0.7).toFixed(2) + ')">' + value + '</td>';
  }
  const ENV_ICON = '<svg class="ip-env-icon" width="15" height="15" viewBox="0 0 20 20" fill="none"'
    + ' stroke="var(--color-blue-400)" stroke-width="1.5" stroke-linejoin="round">'
    + '<path d="M10 2l8 4-8 4-8-4 8-4z"/><path d="M2 10l8 4 8-4"/><path d="M2 14l8 4 8-4"/></svg>';
  function _envRow(r, maxHealthy, maxUnhealthy, expandedKey) {
    const open = !!expandedKey;
    const shown = open ? filterEnvTargets(r.targets, expandedKey) : [];
    const emptyMsg = expandedKey === 'healthy' ? 'No healthy targets in this environment'
      : expandedKey === 'unhealthy' ? 'No unhealthy targets in this environment'
      : expandedKey === 'disabled' ? 'No disabled targets in this environment'
      : 'No targets in this environment';
    const sub = open
      ? '<tr class="ip-env-sub"><td colspan="5"><table class="ip-table ip-env-targets"><thead><tr>'
        + '<th>Deployment target</th><th>Type</th><th>Health</th><th>Target tag</th><th>Tenant</th></tr></thead><tbody>'
        + (shown.length ? shown.map(_envTargetRow).join('') : '<tr><td colspan="5" class="ip-sub">' + escHtml(emptyMsg) + '</td></tr>')
        + '</tbody></table></td></tr>'
      : '';
    const envAttr = ' data-env="' + escHtml(r.name) + '"';
    return '<tr class="ip-row ip-env-row' + (open ? ' ip-env-row-open' : '') + '"' + envAttr + '>'
      + '<td' + _envCellAttrs(r.name, 'all', 'ip-env-cell') + ' aria-expanded="' + (open ? 'true' : 'false') + '">'
      +   '<span class="ip-env-toggle">' + (open ? '▾' : '▸') + '</span>'
      +   ENV_ICON + '<span class="ip-env-name">' + escHtml(r.name) + '</span></td>'
      + '<td' + _envCellAttrs(r.name, 'all', 'ip-env-cell') + '>' + r.total + '</td>'
      + _envHeatCell(r.healthy, maxHealthy, 'good', r.name, 'healthy')
      + _envHeatCell(r.unhealthy, maxUnhealthy, 'bad', r.name, 'unhealthy')
      + '<td' + _envCellAttrs(r.name, 'disabled', 'ip-env-cell') + '>' + r.disabled + '</td></tr>' + sub;
  }
  const ENV_MODES = [{ key:'all', label:'All' }, { key:'attention', label:'Needs attention' },
                     { key:'healthy', label:'All healthy' }];
  function renderEnvironments(IP) {
    const all = Data.environmentsModel(IP.estate.targets, IP.estate.environments);
    IP.envMode = IP.envMode || 'all';
    IP.envQuery = IP.envQuery || '';
    const rows = Data.filterEnvRows(all, IP.envQuery, IP.envMode);
    const maxHealthy = rows.reduce((m, r) => Math.max(m, r.healthy), 0);
    const maxUnhealthy = rows.reduce((m, r) => Math.max(m, r.unhealthy), 0);
    IP.envExpanded = IP.envExpanded || {};
    const body = rows.map(r => _envRow(r, maxHealthy, maxUnhealthy, IP.envExpanded[r.name])).join('');
    const modes = ENV_MODES.map(m => '<button class="ip-seg' + (IP.envMode === m.key ? ' active' : '')
      + '" data-mode="' + escHtml(m.key) + '">' + escHtml(m.label) + '</button>').join('');
    const count = all.length + (all.length === 1 ? ' environment' : ' environments');

    if (!all.length && IP.estate.failed && IP.estate.failed.environments) {
      return ''
        + '<header class="ip-head"><h2>Environments</h2>'
        + '<p class="ip-sub">Infrastructure through the lens of your deployment pipeline.</p></header>'
        + _unreadable('environments');
    }
    if (!all.length) {
      return ''
        + '<header class="ip-head ip-head-actions"><div class="ip-head-text"><h2>Environments</h2>'
        +   '<p class="ip-sub">Infrastructure through the lens of your deployment pipeline. '
        +   'Expand an environment to see its targets.</p></div>'
        +   '<a class="ip-btn ip-btn-secondary" href="' + escHtml(_envAddUrl()) + '" target="_blank" rel="noopener">+ Add environment</a></header>'
        + '<div class="ip-empty"><h3>No environments in this space</h3>'
        +   '<p>Environments are the stages a release moves through — Dev, Test, Production.</p>'
        +   '<a class="ip-btn" href="' + escHtml(_envAddUrl()) + '" target="_blank" rel="noopener">Add environment</a></div>';
    }
    return ''
      + '<header class="ip-head ip-head-actions"><div class="ip-head-text"><h2>Environments</h2>'
      +   '<p class="ip-sub">Infrastructure through the lens of your deployment pipeline. '
      +   'Expand an environment to see its targets.</p></div>'
      +   '<a class="ip-btn ip-btn-secondary" href="' + escHtml(_envAddUrl()) + '" target="_blank" rel="noopener">+ Add environment</a></header>'
      + '<div class="ip-env-toolbar">'
      +   '<input class="ip-search ip-env-search" type="search" placeholder="Search environments…" value="'
      +     escHtml(IP.envQuery) + '">'
      +   '<div class="ip-segs">' + modes + '</div>'
      +   '<span class="ip-count">' + escHtml(count) + '</span>'
      + '</div>'
      + '<div class="ip-heatmap-head ip-env-caption"><span class="ip-caption">Cell intensity = share of estate</span></div>'
      + (rows.length
          ? '<table class="ip-table ip-heatmap ip-env-heatmap">' + _envHeatHead()
            + '<tbody>' + body + '</tbody></table>'
          : '<div class="ip-empty"><h3>No environments match</h3>'
            + '<p>Try a different search or filter.</p></div>');
  }
  function bindEnvironments(IP) {
    const root = document.getElementById('main-content');
    // Each clickable cell (name, Total, Healthy, Unhealthy, Disabled) carries its own
    // data-env/data-health pair, so binding per-cell (not per-row) means a single click
    // fires exactly one handler — no row-level listener to double-fire alongside it.
    root.querySelectorAll('.ip-env-row [data-health]').forEach(cell => {
      const toggle = () => {
        const name = cell.getAttribute('data-env');
        const key = cell.getAttribute('data-health');
        IP.envExpanded = IP.envExpanded || {};
        if (IP.envExpanded[name] === key) delete IP.envExpanded[name];
        else IP.envExpanded[name] = key;
        root.innerHTML = renderEnvironments(IP);
        bindEnvironments(IP);
        // Re-render replaces the node, so put focus back where the user left it.
        const again = root.querySelector('.ip-env-row [data-env="' + (name || '').replace(/"/g, '\\"')
          + '"][data-health="' + key + '"]');
        if (again) again.focus();
      };
      cell.addEventListener('click', toggle);
      cell.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); toggle(); }
      });
    });
    const rerender = () => { root.innerHTML = renderEnvironments(IP); bindEnvironments(IP); };
    const search = root.querySelector('.ip-env-search');
    if (search) search.addEventListener('input', e => {
      IP.envQuery = e.target.value;
      rerender();
      // Re-focus and restore the caret; the input is replaced wholesale on each keystroke.
      const again = root.querySelector('.ip-env-search');
      if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
    });
    root.querySelectorAll('.ip-seg').forEach(b => b.addEventListener('click', () => {
      IP.envMode = b.getAttribute('data-mode');
      rerender();
    }));
  }
  function _policyCreateUrl() {
    let base = '';
    try { base = (typeof IP !== 'undefined' && IP && IP.serverUrl) || ''; } catch (e) { base = ''; }
    return String(base).replace(/\/$/, '') + '/app#/infrastructure/machinepolicies/create';
  }
  function _policyCard(p) {
    return '<section class="ip-card ip-policy-card">'
      + '<div class="ip-policy-head"><h4>' + escHtml(p.name) + '</h4>'
      +   (p.isDefault ? '<span class="ip-tag">Default</span>' : '') + '</div>'
      + (p.description ? '<p class="ip-sub">' + escHtml(p.description) + '</p>' : '')
      + '<p class="ip-policy-usage">' + p.usage + ' target' + (p.usage === 1 ? '' : 's') + '</p>'
      + '<div class="ip-policy-kv">'
      +   _row('Health check interval', p.interval)
      +   _row('Health check type', p.healthCheckType)
      +   _row('Tentacle updates', p.tentacle)
      +   _row('Calamari updates', p.calamari)
      +   _row('Kubernetes agent', p.k8s)
      +   _row('Connectivity', p.connectivity)
      +   _row('Clean up machines', p.cleanup)
      + '</div></section>';
  }
  function renderMachinePolicies(IP) {
    const rows = Data.policiesModel(IP.estate.policies, IP.estate.targets);
    const cards = rows.map(_policyCard).join('');
    return ''
      + _sectionHead('Govern targets collectively — health-check schedules and the tentacle upgrade '
          + 'behaviour that drives version state across the estate.')
      + _sectionTabs('policies')
      + '<div class="ip-card-head"><h4>Machine policies <span class="ip-count-inline">' + rows.length + '</span></h4>'
      +   '<div class="ip-card-actions"><a class="ip-link" href="' + escHtml(_policyCreateUrl())
      +     '" target="_blank" rel="noopener">Create machine policy</a></div></div>'
      + '<div class="ip-grid ip-policy-grid">' + (cards || '<p class="ip-sub">No machine policies</p>') + '</div>';
  }
  function _workerPoolCard(p) {
    return '<section class="ip-card ip-pool-card">'
      + '<div class="ip-card-head"><h4>' + escHtml(p.name) + '</h4>'
      +   '<span class="ip-count-inline">' + p.total + ' worker' + (p.total === 1 ? '' : 's') + '</span></div>'
      + '<ul class="ip-legend"><li class="ip-num-healthy">' + p.healthy + ' Healthy</li>'
      +   '<li class="ip-num-unhealthy">' + p.unhealthy + ' Unhealthy</li></ul></section>';
  }
  function _workerRow(w) {
    return '<tr class="ip-row-static">'
      + '<td>' + escHtml(w.name) + '</td>'
      + '<td>' + pill(w.healthKey, w.health) + '</td>'
      + '<td>' + chip(w.pool, 'pool') + '</td>'
      + '<td>' + escHtml(w.version) + '</td></tr>';
  }
  function _workerAddUrl() {
    let base = '';
    try { base = (typeof IP !== 'undefined' && IP && IP.serverUrl) || ''; } catch (e) { base = ''; }
    return String(base).replace(/\/$/, '') + '/app#/infrastructure/workers/new';
  }
  function renderWorkers(IP) {
    IP.wFilters = IP.wFilters || {}; IP.wSearch = IP.wSearch || ''; IP.wPage = IP.wPage || 1;
    const all = IP.estate.workers || [];
    const wFailed = IP.estate.failed && IP.estate.failed.workers;
    if (!all.length && wFailed) return ''
      + '<header class="ip-head"><h2>Workers</h2>'
      + '<p class="ip-sub">A separate class of infrastructure — organised into shared pools, not tenant-scoped.</p></header>'
      + _unreadable('workers');
    if (!all.length) return renderWorkersZero(IP);
    const model = Data.workersModel(all);
    const facets = Data.workerFacets(all);
    const rows = Data.applyWorkerFilters(all, IP.wFilters, IP.wSearch);

    const pages = Math.max(1, Math.ceil(rows.length / IP_PAGE_SIZE));
    const page = Math.min(IP.wPage || 1, pages);
    const pageStart = (page - 1) * IP_PAGE_SIZE, pageEnd = page * IP_PAGE_SIZE;
    const pageRows = rows.slice(pageStart, pageEnd);

    const chips = [];
    Object.keys(IP.wFilters || {}).forEach(k => (IP.wFilters[k] || []).forEach(v => {
      const f = facets.find(x => x.key === k); const o = f && f.options.find(x => x.value === v);
      chips.push(filterChip(k, v, (f ? f.label : k) + ': ' + (o ? o.label : v)));
    }));

    const facetHtml = facets.map(f => f.options.length ? '<div class="ip-facet"><div class="ip-facet-h">'
      + escHtml(f.label) + '</div>' + f.options.slice(0, 12).map(o => {
        const on = (IP.wFilters[f.key] || []).includes(o.value);
        return '<label class="ip-opt"><input type="checkbox" data-key="' + escHtml(f.key) + '" data-value="'
          + escHtml(o.value) + '"' + (on ? ' checked' : '') + '> <span>' + escHtml(o.label)
          + '</span><b>' + o.count + '</b></label>';
      }).join('') + '</div>' : '').join('');

    const poolCards = model.pools.map(_workerPoolCard).join('');

    const body = rows.length
      ? '<div class="ip-targets-scroll"><table class="ip-table ip-targets"><thead><tr>'
        + '<th>Worker</th><th>Health</th><th>Pool</th><th>Agent version</th>'
        + '</tr></thead><tbody>' + pageRows.map(_workerRow).join('') + '</tbody></table></div>'
        + (pages > 1 ? '<div class="ip-pager" data-pages="' + pages + '" data-page="' + page + '">Page ' + page + ' of ' + pages
          + ' <button class="ip-page-prev"' + (page <= 1 ? ' disabled' : '') + '>Prev</button>'
          + '<button class="ip-page-next"' + (page >= pages ? ' disabled' : '') + '>Next</button></div>' : '')
      : Data.emptyKind(all.length, rows.length) === 'none'
        ? '<div class="ip-empty"><h3>No workers in this space</h3>'
          + '<p>Workers run deployment steps that don\'t execute on a target — script steps, cloud API calls, package pushes.</p>'
          + '<a class="ip-btn" href="' + escHtml(_workerAddUrl()) + '" target="_blank" rel="noopener">Add worker</a></div>'
        : '<div class="ip-empty"><h3>No workers match these filters</h3><p>Try removing a filter or clearing your search.</p></div>';

    return '<header class="ip-head"><h2>Workers</h2>'
      +   '<p class="ip-sub">A separate class of infrastructure — organised into shared pools, not tenant-scoped.</p></header>'
      + '<div class="ip-grid ip-pool-grid">' + (poolCards || '<p class="ip-sub">No worker pools</p>') + '</div>'
      + '<div class="ip-targets-wrap">'
      +   '<div class="ip-facets"><div class="ip-facet-title">Filters</div>'
      +     (chips.length ? '<div class="ip-chips">' + chips.join('') + '<button class="ip-clear">Clear all</button></div>' : '')
      +     facetHtml + '</div>'
      +   '<div class="ip-targets-main">'
      +     '<div class="ip-toolbar"><input class="ip-search" type="search" placeholder="Search workers…" value="'
      +       escHtml(IP.wSearch || '') + '"><span class="ip-count">' + rows.length + ' of ' + all.length + '</span>'
      +       '<a class="ip-btn" href="' + escHtml(_workerAddUrl()) + '" target="_blank" rel="noopener">Add worker</a></div>'
      +     body + '</div></div>';
  }
  function bindWorkers(IP) {
    const root = document.getElementById('main-content');
    const rerender = () => { root.innerHTML = renderWorkers(IP); bindWorkers(IP); };
    const search = root.querySelector('.ip-search');
    if (search) search.addEventListener('input', e => { IP.wSearch = e.target.value; IP.wPage = 1;
      const val = e.target.value; rerender(); const s = document.querySelector('.ip-search');
      if (s) { s.focus(); s.value = val; s.setSelectionRange(val.length, val.length); } });
    root.querySelectorAll('.ip-opt input').forEach(cb => cb.addEventListener('change', e => {
      const k = e.target.getAttribute('data-key'), v = e.target.getAttribute('data-value');
      IP.wFilters[k] = IP.wFilters[k] || [];
      if (e.target.checked) IP.wFilters[k].push(v); else IP.wFilters[k] = IP.wFilters[k].filter(x => x !== v);
      IP.wPage = 1; rerender();
    }));
    root.querySelectorAll('.ip-chip').forEach(c => c.addEventListener('click', e => {
      const k = c.getAttribute('data-key'), v = c.getAttribute('data-value');
      IP.wFilters[k] = (IP.wFilters[k] || []).filter(x => x !== v); IP.wPage = 1; rerender();
    }));
    const clr = root.querySelector('.ip-clear');
    if (clr) clr.addEventListener('click', () => { IP.wFilters = {}; IP.wSearch = ''; IP.wPage = 1; rerender(); });
    const prev = root.querySelector('.ip-page-prev'), next = root.querySelector('.ip-page-next');
    if (prev) prev.addEventListener('click', () => { IP.wPage = Math.max(1, (IP.wPage || 1) - 1); rerender(); });
    if (next) next.addEventListener('click', () => { IP.wPage = (IP.wPage || 1) + 1; rerender(); });
  }
  function bindTargets(IP) {
    const root = document.getElementById('main-content');
    const rerender = () => { root.innerHTML = renderTargets(IP); bindTargets(IP); };
    const search = root.querySelector('.ip-search');
    if (search) search.addEventListener('input', e => { IP.search = e.target.value; IP.page = 1;
      const val = e.target.value; rerender(); const s = document.querySelector('.ip-search');
      if (s) { s.focus(); s.value = val; s.setSelectionRange(val.length, val.length); } });
    root.querySelectorAll('.ip-opt input').forEach(cb => cb.addEventListener('change', e => {
      const k = e.target.getAttribute('data-key'), v = e.target.getAttribute('data-value');
      IP.filters[k] = IP.filters[k] || [];
      if (e.target.checked) IP.filters[k].push(v); else IP.filters[k] = IP.filters[k].filter(x=>x!==v);
      IP.page = 1; rerender();
    }));
    root.querySelectorAll('.ip-chip').forEach(c => c.addEventListener('click', e => {
      const k = c.getAttribute('data-key'), v = c.getAttribute('data-value');
      IP.filters[k] = (IP.filters[k]||[]).filter(x=>x!==v); IP.page = 1; rerender();
    }));
    const clr = root.querySelector('.ip-clear');
    if (clr) clr.addEventListener('click', () => { IP.filters = {}; IP.search=''; IP.page=1; rerender(); });
    const prev = root.querySelector('.ip-page-prev'), next = root.querySelector('.ip-page-next');
    if (prev) prev.addEventListener('click', () => { IP.page = Math.max(1,(IP.page||1)-1); rerender(); });
    if (next) next.addEventListener('click', () => { IP.page = (IP.page||1)+1; rerender(); });
    root.querySelectorAll('.ip-row').forEach(r => r.addEventListener('click', () => {
      window.location.hash = '#targets/' + encodeURIComponent(r.getAttribute('data-id'));
    }));
  }
  // ─── Deployment agents (Task P3-2) ──────────────────────────────────────
  // A segmented control rather than a second tab bar: this sits under the section tabs, and
  // two rows in identical styling leaves the hierarchy ambiguous at a glance. The class name
  // is load-bearing — bindAgents binds these buttons, and .ip-tab now belongs to the section
  // tab anchors, which must route rather than re-render Agents in place.
  function _agentKindBar(tab) {
    return '<div class="ip-kind-seg" role="group" aria-label="Agent type">'
      + '<button type="button" class="ip-kind-btn' + (tab === 'tentacle' ? ' ip-kind-active' : '')
      +   '" data-tab="tentacle"' + (tab === 'tentacle' ? ' aria-pressed="true"' : '') + '>Tentacle</button>'
      + '<button type="button" class="ip-kind-btn' + (tab === 'kubernetes' ? ' ip-kind-active' : '')
      +   '" data-tab="kubernetes"' + (tab === 'kubernetes' ? ' aria-pressed="true"' : '') + '>Kubernetes</button>'
      + '</div>';
  }
  function _bandColor(band) {
    if (band === 'green') return 'var(--color-green-400)';
    if (band === 'yellow') return 'var(--color-yellow-300)';
    if (band === 'red') return 'var(--color-red-400)';
    return 'var(--color-slate-300)';
  }
  function _distRow(d, max) {
    const pct = max > 0 ? Math.max(2, Math.round(d.count / max * 100)) : 0;
    return '<div class="ip-dist-row">'
      + '<div class="ip-dist-label">' + escHtml(d.version) + '</div>'
      + '<div class="ip-dist-bar"><span style="width:' + pct + '%;background:' + _bandColor(d.band) + '"></span></div>'
      + '<div class="ip-dist-count">' + d.count + '</div></div>';
  }
  // "Upgrade" still links to the general Octopus machines list rather than to this machine.
  // The row model now carries the id, so a per-machine link is possible — it's left general
  // pending a decision, not for want of the id.
  //
  // OS cells render blank where the machine reports nothing, matching the targets table:
  // osLabel deliberately returns '' rather than 'Unknown' so a column of un-health-checked
  // machines doesn't read as a wall of "Unknown". Kubernetes agents commonly report no OS.
  function _agentRow(r) {
    const status = r.band === 'unknown'
      ? pill('disabled', 'Unknown')
      : pill(r.behind ? 'unhealthy' : 'healthy', r.behind ? 'Behind' : 'Up to date');
    return '<tr class="ip-row-static">'
      + '<td>' + targetNameLink(r.id, r.name) + '</td>'
      + '<td>' + chip(r.env, 'env') + '</td>'
      + '<td>' + escHtml(r.os) + '</td>'
      + '<td>' + escHtml(r.osVersion) + '</td>'
      + '<td>' + escHtml(r.version) + '</td>'
      + '<td>' + status + '</td>'
      + '<td>' + escHtml(r.policy) + '</td>'
      + '<td><a class="ip-link" href="' + escHtml(_octopusMachinesUrl()) + '" target="_blank" rel="noopener">Upgrade →</a></td></tr>';
  }
  function renderAgents(IP) {
    IP.agentTab = IP.agentTab === 'kubernetes' ? 'kubernetes' : 'tentacle';
    const agents = Data.agentsModel(IP.estate.targets);
    const G = agents[IP.agentTab];
    const maxDist = G.distribution.reduce((m, d) => Math.max(m, d.count), 0);
    const distHtml = G.distribution.map(d => _distRow(d, maxDist)).join('');
    const rowsHtml = G.rows.map(_agentRow).join('');
    const body = G.rows.length
      ? '<div class="ip-targets-scroll"><table class="ip-table ip-targets"><thead><tr>'
        + '<th>Machine name</th><th>Environment</th><th>Operating system</th><th>OS version</th>'
        + '<th>Agent version</th><th>Status</th><th>Machine policy</th><th></th>'
        + '</tr></thead><tbody>' + rowsHtml + '</tbody></table></div>'
      : '<div class="ip-empty"><h3>No ' + escHtml(IP.agentTab) + ' agents</h3>'
        + '<p>No matching deployment targets in this estate.</p></div>';
    return ''
      + _sectionHead('Review agent versions across the estate and upgrade what\'s fallen behind. '
          + 'Latest available ' + escHtml(G.latest) + '.')
      + _sectionTabs('agents')
      + _agentKindBar(IP.agentTab)
      + '<div class="ip-grid ip-kpi-grid">'
      +   '<section class="ip-card"><h4>Total</h4><div class="ip-big">' + G.total + '</div></section>'
      +   '<section class="ip-card"><h4>Up to date</h4><div class="ip-big ip-num-healthy">' + G.upToDate + '</div></section>'
      +   '<section class="ip-card"><h4>Behind</h4><div class="ip-big ip-num-unhealthy">' + G.behind + '</div></section>'
      +   '<section class="ip-card"><h4>Unknown</h4><div class="ip-big">' + G.unknown + '</div></section>'
      + '</div>'
      + '<section class="ip-card ip-dist-card"><h4>Version distribution</h4>'
      +   '<div class="ip-dist-rows">' + (distHtml || '<p class="ip-sub">No versions reported</p>') + '</div></section>'
      + '<section class="ip-card">'
      +   '<div class="ip-card-head"><h4>Agents <span class="ip-count-inline">' + G.total + '</span></h4></div>'
      +   body
      + '</section>';
  }
  function bindAgents(IP) {
    const root = document.getElementById('main-content');
    root.querySelectorAll('.ip-kind-btn').forEach(btn => btn.addEventListener('click', () => {
      IP.agentTab = btn.getAttribute('data-tab') === 'kubernetes' ? 'kubernetes' : 'tentacle';
      root.innerHTML = renderAgents(IP);
      bindAgents(IP);
    }));
  }
  function renderArgo(IP) {
    const base = String((IP && IP.serverUrl) || '').replace(/\/$/, '');
    const infraUrl = base + '/app#/infrastructure';
    return ''
      + '<header class="ip-head"><h2>Argo CD Instances <span class="ip-tag">Early access</span></h2>'
      +   '<p class="ip-sub">GitOps delivery alongside your Octopus-managed infrastructure.</p></header>'
      + '<section class="ip-card ip-state">'
      +   '<h3>Not available through the Octopus API yet</h3>'
      +   '<p>Argo CD connections aren\'t available through the Octopus API yet, so this view can\'t show live data. '
      +   'When Octopus exposes Argo CD over the API, this will list connections, gateway health, and managed applications.</p>'
      +   '<a class="ip-link" href="' + escHtml(infraUrl) + '" target="_blank" rel="noopener">Open Infrastructure in Octopus →</a>'
      + '</section>';
  }
  // Inline sun/moon glyphs — no icon fonts/external resources. The button always shows the icon
  // for the mode you'd switch TO (sun while dark, moon while light), matching common toggle UX.
  const _sunSvg = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" '
    + 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<circle cx="12" cy="12" r="4"></circle>'
    + '<path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2'
    + 'M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"></path></svg>';
  const _moonSvg = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" '
    + 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>';

  // ─── Projects ──────────────────────────────────────────────────────────────
  // Environments are fixed-width columns, left-aligned, identical on every row
  // of the page — collapsed rows, history rows, and every project group. Any
  // spare width goes to the right of the last column rather than stretching the
  // columns, so a node sits at the same x wherever it appears.
  const REL_STATE_TONE = { success:'healthy', failed:'unhealthy', timedout:'unhealthy', cancelled:'disabled', running:'running', unknown:'disabled' };

  function _relTrack(inner, cols) {
    // Columns are one page-wide width, set on the wrapper from the widest
    // group, so every group lines up. The width itself is a share of the
    // available space, so a wide window spreads and a narrow one tightens.
    return '<div class="ip-rel-track" style="grid-template-columns:repeat(' + cols
      + ',calc((100% - var(--ip-rel-endgutter)) / var(--ip-rel-cols)))">' + inner + '</div>';
  }

  function _relWhen(iso) {
    if (!iso) return '';
    const then = Date.parse(iso);
    if (isNaN(then)) return '';
    const mins = Math.round((Date.now() - then) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    const hours = Math.round(mins / 60);
    if (hours < 48) return hours + 'h ago';
    return Math.round(hours / 24) + 'd ago';
  }

  // An environment holding several releases is a tenant rollout part-way
  // through. Each entry carries a share bar so the split reads at a glance, and
  // the cell shows a few of them contracted and every one of them expanded —
  // the detail lives with the environment it describes rather than in a
  // separate panel that repeats the column headings.
  function _relEntry(e, cell, withBar) {
    const age = _relWhen(e.when);
    if (!withBar) {
      return '<span class="ip-rel-entry">'
        + '<span class="ip-rel-ver">' + escHtml(e.version) + '</span>'
        + '<span class="ip-rel-age">' + escHtml(age) + '</span>'
        + (e.tenantCount ? '<span class="ip-rel-tenants">' + escHtml('· ' + e.tenantCount
            + (e.tenantCount === 1 ? ' tenant' : ' tenants')) + '</span>' : '')
        + (e.stateKey !== 'success' ? '<span class="ip-rel-state ip-rel-state-' + escHtml(e.stateKey) + '">'
            + escHtml(e.stateLabel) + '</span>' : '')
        + '</span>';
    }
    // One line per release: version, the share as a small bar, then the count.
    // No status here — a rollout row is answering "how much of the estate", and
    // the node above already carries the environment's state.
    const share = cell.tenantTotal ? (e.tenantCount / cell.tenantTotal * 100) : 0;
    return '<span class="ip-rel-entry ip-rel-entry-share"'
      + ' title="' + escHtml(e.version + ' — ' + e.tenantCount.toLocaleString() + ' of '
          + cell.tenantTotal.toLocaleString() + ' tenants' + (age ? ', ' + age : '')) + '">'
      + '<span class="ip-rel-ver">' + escHtml(e.version) + '</span>'
      + '<span class="ip-rel-tsbar"><span style="width:' + share.toFixed(1) + '%"></span></span>'
      + '<span class="ip-rel-tscount">' + e.tenantCount.toLocaleString() + '</span>'
      + '</span>';
  }

  function _relCell(cell, link, expanded) {
    const seg = link && link !== 'none' ? '<span class="ip-rel-seg ip-rel-seg-' + escHtml(link) + '"></span>' : '';
    if (!cell.entries.length) {
      return '<div class="ip-rel-cell">' + seg
        + '<span class="ip-rel-node ip-rel-node-empty" title="Never deployed"></span>'
        + '<div class="ip-rel-labels"><span class="ip-rel-none">Never deployed</span></div></div>';
    }
    const head = cell.entries[0];
    const split = cell.entries.length > 1;
    const withBar = split && cell.tenantTotal > 0;
    const node = '<span class="ip-rel-node ip-rel-node-' + escHtml(REL_STATE_TONE[head.stateKey] || 'disabled')
      + (split ? ' ip-rel-node-split' : '') + '" title="' + escHtml(head.stateLabel + ' in ' + cell.envName) + '"></span>';

    // Contracted shows the leading few. Expanded shows the lot, capped only
    // where a list would stop being readable at all.
    const CAP = expanded ? 25 : 3;
    const shown = cell.entries.slice(0, CAP);
    const hidden = cell.entries.length - shown.length;
    const hiddenTenants = cell.entries.slice(CAP).reduce((n, e) => n + e.tenantCount, 0);

    const labels = shown.map(e => _relEntry(e, cell, withBar)).join('');
    const summary = withBar
      ? '<span class="ip-rel-tssum">' + cell.versionCount + ' releases · '
        + cell.tenantTotal.toLocaleString() + (cell.tenantTotal === 1 ? ' tenant' : ' tenants') + '</span>'
      : '';
    const more = hidden > 0
      ? '<span class="ip-rel-more">+' + hidden + ' more ' + (hidden === 1 ? 'release' : 'releases')
        + (hiddenTenants ? ' on ' + hiddenTenants.toLocaleString() + (hiddenTenants === 1 ? ' tenant' : ' tenants') : '')
        + '</span>'
      : '';
    return '<div class="ip-rel-cell' + (withBar ? ' has-split' : '') + '">' + seg + node
      + '<div class="ip-rel-labels">' + summary + labels + more + '</div></div>';
  }

  function _relRow(proj, cols, expanded, history, windowLabel, envOff, flags) {
    const cells = proj.cells.map((c, i) => _relCell(c, proj.links[i], expanded)).join('');
    const row = '<div class="ip-rel-row' + (expanded ? ' expanded' : '') + '" role="button" tabindex="0"'
      + ' aria-expanded="' + (expanded ? 'true' : 'false') + '" data-project="' + escHtml(proj.id) + '">'
      + '<div class="ip-rel-proj">'
      +   '<span class="ip-rel-caret" aria-hidden="true"></span>'
      +   '<span class="ip-rel-proj-name">' + escHtml(proj.name) + '</span>'
      + '</div>'
      + _relTrack(cells, cols)
      + '</div>';
    return row + (expanded ? _relHistory(proj, cols, history, windowLabel, envOff || {}, flags) : '');
  }

  // The version rides the line at the furthest environment the release reached.
  // The age beside it is when it ARRIVED there, not when the release was cut —
  // a release assembled weeks ago and promoted this morning is this morning's
  // event, and showing its birthday made the window look broken.
  function _relHistoryRow(r, cols, multiChannel, envOff) {
    const off = envOff || {};
    // The label rides the furthest environment still showing, so muting the
    // noisiest one doesn't strand a release's name in a blank column.
    let frontier = -1;
    r.cells.forEach((c, i) => { if (c.deployed && !off[c.envId]) frontier = i; });
    const headCell = frontier >= 0 ? r.cells[frontier] : null;
    const headAge = headCell && headCell.when ? headCell.when : r.assembled;
    const meta = '<span class="ip-rel-hlabel">'
      + '<span class="ip-rel-hver">' + escHtml(r.version) + '</span>'
      + (multiChannel && r.channelName ? '<span class="ip-rel-hchan">' + escHtml(r.channelName) + '</span>' : '')
      + '<span class="ip-rel-hage">' + escHtml(_relWhen(headAge)) + '</span>'
      + (r.lag > 0 ? '<span class="ip-rel-hlag">' + r.lag + ' behind'
          + (multiChannel ? ' in ' + escHtml(r.channelName) : '') + '</span>' : '')
      + (!r.everDeployed ? '<span class="ip-rel-hnever">created ' + escHtml(_relWhen(r.assembled)) + ', never deployed</span>' : '')
      + '</span>';

    const cells = r.cells.map((c, i) => {
      if (off[c.envId]) return '<div class="ip-rel-hcell is-off"></div>';
      const seg = (i > 0 && i <= frontier)
        ? '<span class="ip-rel-seg ip-rel-seg-' + (i === frontier ? 'strong' : 'pale') + '"></span>' : '';
      const atHead = (frontier === -1 && i === 0) || i === frontier;
      const node = c.deployed
        ? '<span class="ip-rel-hnode ip-rel-node-' + escHtml(REL_STATE_TONE[c.stateKey] || 'disabled')
          + '" title="' + escHtml(c.stateLabel + ' in ' + c.envName) + '"></span>'
        : (frontier === -1 && i === 0 ? '<span class="ip-rel-hnode ip-rel-node-empty"></span>' : '');
      const age = c.deployed && i !== frontier
        ? '<span class="ip-rel-hcellage">' + escHtml(_relWhen(c.when))
          + (c.tenantCount ? ' · ' + c.tenantCount + 't' : '') + '</span>' : '';
      return '<div class="ip-rel-hcell">' + seg + node + age + (atHead ? meta : '') + '</div>';
    }).join('');

    return '<div class="ip-rel-hrow' + (r.everDeployed ? '' : ' undeployed') + '">' + _relTrack(cells, cols) + '</div>';
  }

  // ─── Feature flags ─────────────────────────────────────────────────────────
  // Flags travel across environments the way a release does, so they get the
  // same line in the same columns — in purple, because a flag is not a
  // deployment and must not borrow the deployment palette. Only flags mid-
  // journey get a row; a flag on everywhere is not news, and there are 146 of
  // those on Octopus Server alone.
  function _relFlagRow(flag, cols, envOff) {
    const off = envOff || {};
    let frontier = -1;
    flag.cells.forEach((c, i) => { if ((c.state === 'on' || c.state === 'partial') && !off[c.envId]) frontier = i; });
    const first = flag.cells.reduce((f, c, i) =>
      (f === -1 && (c.state === 'on' || c.state === 'partial') && !off[c.envId] ? i : f), -1);

    const label = '<span class="ip-rel-hlabel">'
      + '<span class="ip-rel-flagname">' + escHtml(flag.name) + '</span>'
      + (frontier >= 0 && flag.cells[frontier].state === 'partial'
          ? '<span class="ip-rel-flagpct">' + flag.cells[frontier].percent + '%</span>' : '')
      + '</span>';

    const cells = flag.cells.map((c, i) => {
      if (off[c.envId]) return '<div class="ip-rel-hcell is-off"></div>';
      const within = first >= 0 && i > first && i <= frontier;
      const seg = within ? '<span class="ip-rel-seg ip-rel-seg-flag"></span>' : '';
      let node = '';
      if (c.state === 'on') node = '<span class="ip-rel-fnode is-on" title="' + escHtml('On in ' + c.envName) + '"></span>';
      else if (c.state === 'partial') node = '<span class="ip-rel-fnode is-partial" title="'
        + escHtml(c.percent + '% in ' + c.envName) + '"></span>';
      else if (c.state === 'off') node = '<span class="ip-rel-fnode is-off-state" title="' + escHtml('Off in ' + c.envName) + '"></span>';
      // A percentage gets a bar, the same instrument the tenant split uses.
      const bar = c.state === 'partial'
        ? '<span class="ip-rel-fbar" title="' + escHtml(c.percent + '% in ' + c.envName)
          + '"><span style="width:' + c.percent + '%"></span></span>' : '';
      return '<div class="ip-rel-hcell ip-rel-fcell">' + seg + node + bar + (i === frontier ? label : '') + '</div>';
    }).join('');

    return '<div class="ip-rel-hrow ip-rel-frow">' + _relTrack(cells, cols) + '</div>';
  }

  function _relFlags(proj, cols, flags, envOff) {
    const st = flags || { status: 'loading' };
    if (st.status === 'loading' || !st.status) {
      return '<div class="ip-rel-band"><p class="ip-rel-bandhead">Feature flags</p>'
        + '<div class="ip-rel-loading"><div class="ip-spinner"></div><span>Loading flags…</span></div></div>';
    }
    if (st.status === 'error') {
      return '<div class="ip-rel-band"><p class="ip-rel-bandhead">Feature flags</p>'
        + '<p class="ip-rel-hempty">' + escHtml(st.error) + '</p></div>';
    }
    const m = st.model;
    if (!m.total) return '';
    const settled = m.settled || {};
    const quiet = [];
    if (settled.onEverywhere) quiet.push(settled.onEverywhere + ' on everywhere');
    if (settled.offEverywhere) quiet.push(settled.offEverywhere + ' off everywhere');
    if (settled.noOverrides) quiet.push(settled.noOverrides + ' on their default');
    const note = quiet.length
      ? '<p class="ip-rel-hnote-inline">Not shown: ' + escHtml(quiet.join(', ')) + '.</p>' : '';
    const truncated = m.truncated
      ? '<p class="ip-rel-hnote-inline">More than ' + m.total + ' flags — this reads the first few pages only.</p>' : '';

    if (!m.flags.length) {
      return '<div class="ip-rel-band"><p class="ip-rel-bandhead">Feature flags</p>'
        + '<p class="ip-rel-hempty">All ' + m.total + ' flags are settled — none is part-way through a rollout.</p>'
        + note + '</div>';
    }
    return '<div class="ip-rel-band">'
      + '<p class="ip-rel-bandhead">Feature flags in flight'
      +   '<span class="ip-rel-bandcount">' + m.flags.length + ' of ' + m.total + '</span></p>'
      + m.flags.map(f => _relFlagRow(f, cols, envOff)).join('')
      + note + truncated
      + '</div>';
  }

  function _relHistory(proj, cols, history, windowLabel, envOff, flags) {
    const st = history || { status: 'loading' };
    // Mirrors the row structure — a label-width gutter, then the track — so an
    // expanded row starts on exactly the same x as the row it opened from.
    const wrap = body => '<div class="ip-rel-history">'
      + '<div class="ip-rel-proj ip-rel-history-gutter" aria-hidden="true"></div>'
      + '<div class="ip-rel-history-body">' + body + _relFlags(proj, cols, flags, envOff) + '</div></div>';

    if (st.status === 'loading' || !st.status) {
      return wrap('<div class="ip-rel-loading"><div class="ip-spinner"></div><span>Loading releases…</span></div>');
    }
    if (st.status === 'error') {
      return wrap('<p class="ip-rel-err">' + escHtml(st.error || 'Could not load this project\'s releases.') + '</p>');
    }
    const m = st.model;
    if (!m.totalReleases) {
      return wrap('<p class="ip-rel-hempty">No releases have been created for this project.</p>');
    }
    if (!m.releases.length) {
      return wrap('<p class="ip-rel-hempty">Nothing moved in the last ' + escHtml(String(windowLabel).toLowerCase())
        + '. ' + m.totalReleases + ' older ' + (m.totalReleases === 1 ? 'release' : 'releases')
        + ' — widen the window to see ' + (m.totalReleases === 1 ? 'it' : 'them') + '.</p>');
    }

    const off = envOff || {};
    const anyOff = Object.keys(off).some(k => off[k]);
    const visible = anyOff
      ? m.releases.filter(r => r.cells.some((c, i) => c.deployed && !off[c.envId]))
      : m.releases;
    const mutedOut = m.releases.length - visible.length;
    if (anyOff && !visible.length) {
      return wrap('<p class="ip-rel-hempty">Every release in this window only reached environments you have muted.</p>');
    }
    const multiChannel = m.channels.length > 1;
    const rows = visible.map(r => _relHistoryRow(r, cols, multiChannel, off)).join('');
    const notes = [];
    if (mutedOut) notes.push(mutedOut + ' ' + (mutedOut === 1 ? 'release' : 'releases')
      + ' only reached muted environments.');
    if (m.hiddenByWindow) notes.push(m.hiddenByWindow + ' older ' + (m.hiddenByWindow === 1 ? 'release is' : 'releases are') + ' outside this window.');
    if (m.windowed) notes.push('History reaches back ' + m.historyCount + ' releases per channel.');
    if (m.neverDeployedCount) notes.push(m.neverDeployedCount + ' of these were created and never deployed anywhere.');

    return wrap(rows + (notes.length
      ? '<div class="ip-rel-hnote">' + notes.map(n => '<p>' + escHtml(n) + '</p>').join('') + '</div>' : ''));
  }

  function renderProjects(IP) {
    const st = IP.releases || { status: 'idle' };
    const windows = (typeof Data !== 'undefined' && Data.HISTORY_WINDOWS) || [{ label: '24 hours' }, { label: '7 days' }, { label: 'All' }];
    const active = IP.historyWindow || windows[0].label;
    const segs = windows.map(w => '<button class="ip-seg' + (w.label === active ? ' active' : '')
      + '" data-window="' + escHtml(w.label) + '">' + escHtml(w.label) + '</button>').join('');
    const head = '<header class="ip-head ip-head-actions"><div class="ip-head-text"><h2>Projects</h2>'
      + '<p class="ip-sub">What each project is running in each environment, and where a release has stopped moving.</p></div>'
      + '<div class="ip-rel-window"><span class="ip-caption">History</span><div class="ip-segs">' + segs + '</div></div></header>';

    if (st.status === 'loading' || st.status === 'idle') {
      return head + '<div class="ip-state"><div class="ip-spinner"></div><p>Loading the project dashboard…</p></div>';
    }
    if (st.status === 'error') {
      return head + '<div class="ip-state"><h3>Couldn\'t load the project dashboard</h3><p>' + escHtml(st.error || 'Unknown error') + '</p></div>';
    }
    const m = st.model;
    if (!m.projects.length) {
      return head + '<div class="ip-empty"><h3>No projects in this space</h3>'
        + '<p>Releases move through environments once a space has a project to deploy.</p></div>';
    }
    if (!m.environments.length) {
      return head + '<div class="ip-empty"><h3>Nothing has been deployed in this space</h3>'
        + '<p>Projects exist, but no release has reached an environment yet.</p></div>';
    }

    const notes = [];
    if (m.truncated.capped) notes.push('Showing ' + m.truncated.shown + ' projects — the server caps the dashboard at ' + m.truncated.projectLimit + '. Projects beyond the cap are missing from this view.');
    if (m.truncated.isFiltered) notes.push('The dashboard is filtered on this instance, so this is a subset of its projects.');
    const note = notes.length ? '<div class="ip-rel-note">' + notes.map(n => '<p>' + escHtml(n) + '</p>').join('') + '</div>' : '';

    const open = IP.projectOpen || {};
    const hist = IP.projectHistory || {};

    const maxCols = (m.groups || []).reduce((n, g) => Math.max(n, g.environments.length), 1);
    const blocks = (m.groups || []).map(g => {
      const cols = g.environments.length;
      if (!cols) {
        return '<section class="ip-rel-group"><h3 class="ip-rel-group-name">' + escHtml(g.name) + '</h3>'
          + '<p class="ip-rel-hempty">Nothing in this group has been deployed yet.</p></section>';
      }
      const off = (IP.envOff && IP.envOff[g.id]) || {};
      const heads = g.environments.map(e => {
        const isOff = !!off[e.id];
        return '<div class="ip-rel-envhead' + (isOff ? ' is-off' : '') + '">'
          + '<span class="ip-rel-envname">' + escHtml(e.name) + '</span>'
          + '<button type="button" class="ip-rel-envtoggle" role="switch"'
          +   ' aria-checked="' + (isOff ? 'false' : 'true') + '"'
          +   ' data-envtoggle="' + escHtml(g.id) + '|' + escHtml(e.id) + '"'
          +   ' title="' + escHtml((isOff ? 'Show ' : 'Hide ') + e.name + ' in expanded history') + '">'
          +   '<span class="ip-rel-envtoggle-track"><span class="ip-rel-envtoggle-knob"></span></span>'
          + '</button></div>';
      }).join('');
      const flg = IP.projectFlags || {};
      const rows = g.projects.map(p => _relRow(p, cols, !!open[p.id], hist[p.id], active, off, flg[p.id])).join('');
      const hiddenNote = g.hiddenEnvironments.length
        ? '<p class="ip-rel-hidden">Not shown, because this group has never deployed to them: '
          + escHtml(g.hiddenEnvironments.map(e => e.name).join(', ')) + '.</p>' : '';
      return '<section class="ip-rel-group">'
        + '<h3 class="ip-rel-group-name">' + escHtml(g.name)
        +   '<span class="ip-rel-group-count">' + g.projects.length + (g.projects.length === 1 ? ' project' : ' projects') + '</span></h3>'
        + '<div class="ip-rel-grid">'
        +   '<div class="ip-rel-head"><div class="ip-rel-proj">Project</div>' + _relTrack(heads, cols) + '</div>'
        +   rows
        + '</div>' + hiddenNote + '</section>';
    }).join('');

    return head + note
      + '<div class="ip-rel-legend">'
      +   '<span><i class="ip-rel-key ip-rel-key-healthy"></i>Deployed</span>'
      +   '<span><i class="ip-rel-key ip-rel-key-running"></i>In progress</span>'
      +   '<span><i class="ip-rel-key ip-rel-key-unhealthy"></i>Failed or timed out</span>'
      +   '<span><i class="ip-rel-key ip-rel-key-split"></i>Split across tenants</span>'
      +   '<span><i class="ip-rel-key ip-rel-key-strong"></i>Same release both sides</span>'
      +   '<span><i class="ip-rel-key ip-rel-key-pale"></i>Drifted</span>'
      + '</div>'
      + '<div class="ip-rel-groups" style="--ip-rel-cols:' + maxCols + '">' + blocks + '</div>';
  }

  function bindProjects(IP) {
    const root = document.getElementById('main-content');
    if (!root) return;
    const redraw = () => { root.innerHTML = renderProjects(IP); bindProjects(IP); };
    const toggle = el => {
      const id = el.getAttribute('data-project');
      if (!id) return;
      IP.projectOpen = IP.projectOpen || {};
      if (IP.projectOpen[id]) delete IP.projectOpen[id]; else IP.projectOpen[id] = true;
      redraw();
      if (IP.projectOpen[id]) {
        if (IP.loadProjectHistory) IP.loadProjectHistory(id);
        if (IP.loadProjectFlags) IP.loadProjectFlags(id);
      }
    };
    root.querySelectorAll('.ip-rel-row[data-project]').forEach(el => {
      el.addEventListener('click', () => toggle(el));
      el.addEventListener('keydown', ev => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(el); }
      });
    });
    root.querySelectorAll('[data-envtoggle]').forEach(btn => {
      btn.addEventListener('click', ev => {
        ev.stopPropagation();
        const parts = String(btn.getAttribute('data-envtoggle')).split('|');
        const gid = parts[0], eid = parts[1];
        IP.envOff = IP.envOff || {};
        IP.envOff[gid] = IP.envOff[gid] || {};
        if (IP.envOff[gid][eid]) delete IP.envOff[gid][eid]; else IP.envOff[gid][eid] = true;
        redraw();
      });
    });
    // The window filters what was already fetched, so switching it never
    // re-requests — the 30-per-channel payload is the ceiling either way.
    root.querySelectorAll('.ip-rel-window [data-window]').forEach(btn => {
      btn.addEventListener('click', ev => {
        ev.stopPropagation();
        IP.historyWindow = btn.getAttribute('data-window');
        if (IP.rebuildHistories) IP.rebuildHistories();
        redraw();
      });
    });
  }

  function renderThemeToggle(IP) {
    const dark = IP.theme === 'dark';
    const icon = dark ? _sunSvg : _moonSvg;
    const label = dark ? 'Switch to light mode' : 'Switch to dark mode';
    return '<button type="button" id="ip-theme-btn" class="ip-theme-btn" aria-label="' + escHtml(label) + '">'
      + icon + '<span class="ip-theme-btn-label">' + escHtml(dark ? 'Light mode' : 'Dark mode') + '</span></button>';
  }
  function bindThemeToggle(IP) {
    const el = document.getElementById('ip-theme-btn');
    if (!el) return;
    el.addEventListener('click', () => {
      IP.theme = IP.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.classList.toggle('dark', IP.theme === 'dark');
      try { localStorage.setItem('iprealpha:theme', IP.theme); } catch (e) { /* ignore persistence failures */ }
      const container = document.getElementById('ip-theme-toggle');
      if (container) { container.innerHTML = renderThemeToggle(IP); bindThemeToggle(IP); }
    });
  }
  function renderSpaceSwitch(IP) {
    // One space at a time, matching the Octopus UI — there is no all-spaces view there,
    // and offering one would mean hydrating every space to populate it.
    const opts = (IP.spaces || []).map(s => '<option value="' + escHtml(s.Id) + '"'
      + (IP.spaceId === s.Id ? ' selected' : '') + '>' + escHtml(s.Name) + '</option>');
    return '<label class="ip-space-lbl">Space</label>'
      + '<select id="ip-space-select" class="ip-space-select">' + opts.join('') + '</select>';
  }
  function bindSpaceSwitch(IP) {
    const el = document.getElementById('ip-space-select');
    if (!el) return;
    el.addEventListener('change', async e => {
      IP.spaceId = e.target.value;
      IP.filters = {}; IP.search = ''; IP.page = 1;
      IP.wFilters = {}; IP.wSearch = ''; IP.wPage = 1;
      IP.envExpanded = {};
      // Spaces are hydrated on demand now, so switching to one not seen before hits the
      // network. Show the loading state rather than leaving the previous space's data on
      // screen under the new space's name.
      const main = document.getElementById('main-content');
      if (main) main.innerHTML = stateView('loading');
      el.disabled = true;
      try {
        if (typeof IP.rescope === 'function') await IP.rescope();
        Router.render();
      } catch (err) {
        if (main) main.innerHTML = stateView('error', (err && err.message) || 'Could not load that space');
      } finally {
        el.disabled = false;
      }
    });
  }
  return { escHtml, stateView, renderProjects, bindProjects, renderOverview, renderTargets, bindTargets, renderTargetDetail, bindTargetDetail, fillTargetDetail, renderTargetsZero, renderWorkersZero, deploymentsCardHtml, runbooksCardHtml, connectivityCardHtml, eventsCardHtml,
    renderEnvironments, bindEnvironments, filterEnvTargets, renderMachinePolicies, renderWorkers, bindWorkers,
    renderAgents, bindAgents, renderArgo, renderAddTarget, bindAddTarget,
    pill, chip, healthBar, donut, heatCell, renderSpaceSwitch, bindSpaceSwitch,
    renderThemeToggle, bindThemeToggle };
})();
if (typeof module !== 'undefined') { module.exports = Views; }
