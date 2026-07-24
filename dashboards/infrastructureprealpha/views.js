'use strict';
const Views = (function () {
  function escHtml(s) { return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
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
  function donut(pct) {
    const p = Math.max(0, Math.min(100, Math.round(pct || 0)));
    const R = 52, C = 2 * Math.PI * R, off = C * (1 - p / 100);
    return '<svg class="ip-donut" viewBox="0 0 128 128" width="128" height="128">'
      + '<circle cx="64" cy="64" r="' + R + '" fill="none" stroke="var(--muted)" stroke-width="14"/>'
      + '<circle cx="64" cy="64" r="' + R + '" fill="none" stroke="var(--color-green-400)" stroke-width="14"'
      + ' stroke-linecap="round" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '"'
      + ' transform="rotate(-90 64 64)"/>'
      + '<text x="64" y="60" text-anchor="middle" class="ip-donut-pct">' + p + '%</text>'
      + '<text x="64" y="80" text-anchor="middle" class="ip-donut-sub">healthy</text></svg>';
  }
  function heatCell(value, max, tone) {
    const a = max > 0 ? (value / max) : 0;
    const base = tone === 'bad' ? '214,61,61' : '0,171,98'; // red / green rgb
    return '<td class="ip-heat" style="background:rgba(' + base + ',' + (0.12 + a * 0.7).toFixed(2) + ')">' + value + '</td>';
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
    const typeRows = ov.byType.map(r =>
      '<div class="ip-type-row">'
      + '<div class="ip-type-name">' + escHtml(r.name) + '</div>'
      + '<div class="ip-type-bar">' + healthBar(r.healthy, r.unhealthy, 0) + '</div>'
      + '<div class="ip-type-counts"><span class="ip-num-healthy">' + r.healthy + '</span>'
      +   '<span class="ip-num-unhealthy">' + r.unhealthy + '</span></div></div>').join('');
    const envTop = ov.byEnv.slice(0,5);
    const maxHealthy = envTop.reduce((m,r)=>Math.max(m, r.healthy), 0);
    const maxUnhealthy = envTop.reduce((m,r)=>Math.max(m, r.unhealthy), 0);
    const envRows = envTop.map(r =>
      '<tr><td>' + escHtml(r.name) + '</td><td>' + r.total + '</td>'
      + heatCell(r.healthy, maxHealthy, 'good')
      + heatCell(r.unhealthy, maxUnhealthy, 'bad')
      + '<td>' + r.disabled + '</td></tr>').join('');
    const pools = ov.workers.pools.map(p =>
      '<li><span>' + escHtml(p.name) + '</span><b>' + p.count + '</b></li>').join('');
    return ''
      + '<header class="ip-head"><h2>Infrastructure overview</h2>'
      + '<p class="ip-sub">A diagnostic snapshot of your deployment estate.</p></header>'
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
      +       '<div class="ip-donut-wrap">' + donut(ov.healthyPct) + '</div>'
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
      +     '<table class="ip-table ip-heatmap"><thead><tr><th>Environment</th><th>Total</th><th>Healthy</th><th>Unhealthy</th><th>Disabled</th></tr></thead>'
      +     '<tbody>' + (envRows || '<tr><td colspan="5">No environments</td></tr>') + '</tbody></table>'
      +     '<a class="ip-link" href="#environments">View all environments →</a>'
      +   '</div>'
      + '</section>'
      + '<div class="ip-grid ip-grid-below">'
      +   '<section class="ip-card"><h4>Workers</h4><div class="ip-big">' + ov.workers.total + '</div>'
      +     '<ul class="ip-legend"><li>' + ov.workers.healthy + ' Healthy</li><li>' + ov.workers.unhealthy + ' Unhealthy</li></ul>'
      +     '<ul class="ip-pools">' + pools + '</ul><a class="ip-link" href="#workers">Open →</a></section>'
      +   '<section class="ip-card"><h4>Argo CD <span class="ip-tag">Early access</span></h4>'
      +     '<p class="ip-sub">Wired in a later phase. Shows connections, gateway health, and managed apps when the instance exposes Argo CD.</p></section>'
      + '</div>';
  }
  const IP_PAGE_SIZE = 100;
  function filterChip(key, value, label) {
    return '<button class="ip-chip" data-key="' + escHtml(key) + '" data-value="' + escHtml(value) + '">'
      + escHtml(label) + ' ✕</button>';
  }
  const IP_TARGETS_COLS = 10;
  const IP_HEALTH_GROUP_ORDER = ['unhealthy', 'healthy', 'disabled'];
  function _targetRow(t) {
    return '<tr class="ip-row" data-id="' + escHtml(t.id) + '">'
      + '<td><a class="ip-target-link" href="#targets/' + escHtml(encodeURIComponent(t.id)) + '">' + escHtml(t.name) + '</a></td>'
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
      : '<div class="ip-empty"><h3>No targets match these filters</h3><p>Try removing a filter or clearing your search.</p></div>';

    return '<div class="ip-targets-wrap">'
      + '<div class="ip-facets"><div class="ip-facet-title">Filters</div>'
      +   (chips.length ? '<div class="ip-chips">' + chips.join('') + '<button class="ip-clear">Clear all</button></div>' : '')
      +   facetHtml + '</div>'
      + '<div class="ip-targets-main">'
      +   '<header class="ip-head"><h2>Deployment targets</h2>'
      +     '<p class="ip-sub">Assess health across the estate and drill in with fast, faceted filters.</p></header>'
      +   '<div class="ip-toolbar"><input class="ip-search" type="search" placeholder="Search targets…" value="'
      +     escHtml(IP.search||'') + '"><span class="ip-count">' + rows.length + ' of ' + all.length + '</span>'
      +     '<a class="ip-btn" href="' + escHtml(String(IP.serverUrl||'').replace(/\/$/,'') + '/app#/infrastructure/machines/new') + '" target="_blank" rel="noopener">Add deployment target</a></div>'
      +   body + '</div></div>';
  }
  function _row(k,v){ return '<div class="ip-kv"><span>' + escHtml(k) + '</span><b>' + escHtml(v) + '</b></div>'; }
  function renderTargetDetail(IP) {
    const t = (IP.estate.targets||[]).find(x => x.id === IP.detailId);
    if (!t) return '<div class="ip-state"><h3>Target not found</h3><a class="ip-link" href="#targets">← Back to targets</a></div>';
    const machineUrl = String(IP.serverUrl||'').replace(/\/$/,'') + '/app#/infrastructure/machines/' + encodeURIComponent(t.id);
    const placeholder = title => '<section class="ip-card"><h4>' + title + '</h4>'
      + '<p class="ip-sub">Not available in PreAlpha — view on the <a class="ip-link" href="'
      + escHtml(machineUrl) + '" target="_blank" rel="noopener">target page in Octopus</a>.</p></section>';
    return ''
      + '<a class="ip-link" href="#targets">← Deployment targets</a>'
      + '<header class="ip-head"><h2>' + escHtml(t.name) + '</h2>'
      +   '<p class="ip-sub">' + escHtml(t.kind) + ' · ' + escHtml(t.health) + '</p></header>'
      + '<div class="ip-grid">'
      +   '<section class="ip-card"><h4>Connectivity</h4>' + _row('Communication', t.comm) + _row('Health', t.health) + '</section>'
      +   '<section class="ip-card"><h4>Tentacle version</h4>' + _row('Installed', t.version)
      +     '<p class="ip-sub">Upgrades are governed by the ' + escHtml(t.policy) + ' machine policy.</p></section>'
      +   '<section class="ip-card"><h4>Settings</h4>' + _row('Environment', t.env) + _row('Target tag', t.tag)
      +     _row('Tenant', t.tenant) + _row('Machine policy', t.policy) + '</section>'
      +   placeholder('Projects &amp; last release')
      +   placeholder('Recent deployments')
      +   '<section class="ip-card"><h4>Runbook runs</h4><p class="ip-sub">No runbook runs yet — this target hasn\'t been part of a runbook run.</p></section>'
      +   placeholder('Events')
      + '</div>';
  }
  function bindTargetDetail(IP) { /* back link is a plain hash anchor; nothing to wire yet */ }
  function _envAddUrl() {
    let base = '';
    try { base = (typeof IP !== 'undefined' && IP && IP.serverUrl) || ''; } catch (e) { base = ''; }
    return String(base).replace(/\/$/, '') + '/app#/infrastructure/environments/create';
  }
  function _envTargetRow(t) {
    return '<tr class="ip-row-static">'
      + '<td>' + escHtml(t.name) + '</td>'
      + '<td>' + escHtml(t.type) + '</td>'
      + '<td>' + pill(t.healthKey, t.health) + '</td>'
      + '<td>' + chip(t.tag, 'tag') + '</td>'
      + '<td>' + escHtml(t.tenant) + '</td></tr>';
  }
  function _envRow(r, maxHealthy, maxUnhealthy, expanded) {
    const sub = expanded
      ? '<tr class="ip-env-sub"><td colspan="5"><table class="ip-table ip-env-targets"><thead><tr>'
        + '<th>Deployment target</th><th>Type</th><th>Health</th><th>Target tag</th><th>Tenant</th></tr></thead><tbody>'
        + (r.targets.length ? r.targets.map(_envTargetRow).join('') : '<tr><td colspan="5" class="ip-sub">No targets in this environment</td></tr>')
        + '</tbody></table></td></tr>'
      : '';
    return '<tr class="ip-row ip-env-row' + (expanded ? ' ip-env-row-open' : '') + '" data-env="' + escHtml(r.name) + '">'
      + '<td><span class="ip-env-toggle">' + (expanded ? '▾' : '▸') + '</span>' + escHtml(r.name) + '</td>'
      + '<td>' + r.total + '</td>'
      + heatCell(r.healthy, maxHealthy, 'good')
      + heatCell(r.unhealthy, maxUnhealthy, 'bad')
      + '<td>' + r.disabled + '</td></tr>' + sub;
  }
  function renderEnvironments(IP) {
    const rows = Data.environmentsModel(IP.estate.targets, IP.estate.environments);
    const maxHealthy = rows.reduce((m, r) => Math.max(m, r.healthy), 0);
    const maxUnhealthy = rows.reduce((m, r) => Math.max(m, r.unhealthy), 0);
    IP.envExpanded = IP.envExpanded || {};
    const body = rows.map(r => _envRow(r, maxHealthy, maxUnhealthy, !!IP.envExpanded[r.name])).join('');
    return ''
      + '<header class="ip-head"><h2>Environments</h2>'
      +   '<p class="ip-sub">Infrastructure through the lens of your deployment pipeline. Expand an environment to see its targets.</p></header>'
      + '<section class="ip-card">'
      +   '<div class="ip-card-head"><h4>Environments <span class="ip-count-inline">' + rows.length + '</span></h4>'
      +     '<div class="ip-card-actions"><a class="ip-link" href="' + escHtml(_envAddUrl()) + '" target="_blank" rel="noopener">Add environment</a></div>'
      +   '</div>'
      +   '<table class="ip-table ip-heatmap ip-env-heatmap"><thead><tr>'
      +     '<th>Environment</th><th>Total</th><th>Healthy</th><th>Unhealthy</th><th>Disabled</th></tr></thead>'
      +   '<tbody>' + (body || '<tr><td colspan="5">No environments</td></tr>') + '</tbody></table>'
      + '</section>';
  }
  function bindEnvironments(IP) {
    const root = document.getElementById('main-content');
    root.querySelectorAll('.ip-env-row').forEach(r => r.addEventListener('click', () => {
      const name = r.getAttribute('data-env');
      IP.envExpanded = IP.envExpanded || {};
      IP.envExpanded[name] = !IP.envExpanded[name];
      root.innerHTML = renderEnvironments(IP);
      bindEnvironments(IP);
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
      + '<header class="ip-head"><h2>Machine policies</h2>'
      +   '<p class="ip-sub">Govern targets collectively — health-check schedules and the tentacle upgrade '
      +   'behaviour that drives version state across the estate.</p></header>'
      + '<div class="ip-card-head"><h4>Machine policies <span class="ip-count-inline">' + rows.length + '</span></h4>'
      +   '<div class="ip-card-actions"><a class="ip-link" href="' + escHtml(_policyCreateUrl())
      +     '" target="_blank" rel="noopener">Create machine policy</a></div></div>'
      + '<div class="ip-grid ip-policy-grid">' + (cards || '<p class="ip-sub">No machine policies</p>') + '</div>';
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
  return { escHtml, stateView, renderOverview, renderTargets, bindTargets, renderTargetDetail, bindTargetDetail,
    renderEnvironments, bindEnvironments, renderMachinePolicies,
    pill, chip, healthBar, donut, heatCell };
})();
if (typeof module !== 'undefined') { module.exports = Views; }
