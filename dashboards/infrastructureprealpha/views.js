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
  function renderOverview(ov, estate) {
    const typeRows = ov.byType.map(r =>
      '<tr><td>' + escHtml(r.name) + '</td><td>' + r.healthy + '</td><td>' + r.unhealthy + '</td></tr>').join('');
    const envRows = ov.byEnv.slice(0,5).map(r =>
      '<tr><td>' + escHtml(r.name) + '</td><td>' + r.total + '</td><td>' + r.healthy + '</td><td>'
      + r.unhealthy + '</td><td>' + r.disabled + '</td></tr>').join('');
    const pools = ov.workers.pools.map(p =>
      '<li><span>' + escHtml(p.name) + '</span><b>' + p.count + '</b></li>').join('');
    return ''
      + '<header class="ip-head"><h2>Infrastructure overview</h2>'
      + '<p class="ip-sub">A diagnostic snapshot of your deployment estate.</p></header>'
      + '<div class="ip-grid">'
      +   '<section class="ip-card"><h4>Deployment targets</h4>'
      +     '<div class="ip-big">' + ov.total + '</div>'
      +     '<div class="ip-pct">' + ov.healthyPct + '% healthy</div>'
      +     bar(ov.healthy, ov.unhealthy, ov.disabled)
      +     '<ul class="ip-legend"><li>Healthy ' + ov.healthy + '</li>'
      +       '<li>Unhealthy ' + ov.unhealthy + '</li><li>Disabled ' + ov.disabled + '</li></ul>'
      +     '<a class="ip-link" href="#targets">Open list →</a></section>'
      +   '<section class="ip-card"><h4>Health by target type</h4>'
      +     '<table class="ip-table"><thead><tr><th>Type</th><th>Healthy</th><th>Unhealthy</th></tr></thead>'
      +     '<tbody>' + (typeRows || '<tr><td colspan="3">No targets</td></tr>') + '</tbody></table></section>'
      +   '<section class="ip-card ip-card-wide"><h4>Health by environment</h4>'
      +     '<table class="ip-table"><thead><tr><th>Environment</th><th>Total</th><th>Healthy</th><th>Unhealthy</th><th>Disabled</th></tr></thead>'
      +     '<tbody>' + (envRows || '<tr><td colspan="5">No environments</td></tr>') + '</tbody></table>'
      +     '<a class="ip-link" href="#environments">View all environments →</a></section>'
      +   '<section class="ip-card"><h4>Workers</h4><div class="ip-big">' + ov.workers.total + '</div>'
      +     '<ul class="ip-legend"><li>' + ov.workers.healthy + ' Healthy</li><li>' + ov.workers.unhealthy + ' Unhealthy</li></ul>'
      +     '<ul class="ip-pools">' + pools + '</ul><a class="ip-link" href="#workers">Open →</a></section>'
      +   '<section class="ip-card"><h4>Argo CD <span class="ip-tag">Early access</span></h4>'
      +     '<p class="ip-sub">Wired in a later phase. Shows connections, gateway health, and managed apps when the instance exposes Argo CD.</p></section>'
      + '</div>';
  }
  const IP_PAGE_SIZE = 100;
  function chip(key, value, label) {
    return '<button class="ip-chip" data-key="' + escHtml(key) + '" data-value="' + escHtml(value) + '">'
      + escHtml(label) + ' ✕</button>';
  }
  function renderTargets(IP) {
    const all = IP.estate.targets;
    const facets = Data.buildFacets(all);
    const rows = Data.applyFilters(all, IP.filters, IP.search);
    const pages = Math.max(1, Math.ceil(rows.length / IP_PAGE_SIZE));
    const page = Math.min(IP.page || 1, pages);
    const slice = rows.slice((page-1)*IP_PAGE_SIZE, page*IP_PAGE_SIZE);

    const chips = [];
    Object.keys(IP.filters||{}).forEach(k => (IP.filters[k]||[]).forEach(v => {
      const f = facets.find(x=>x.key===k); const o = f && f.options.find(x=>x.value===v);
      chips.push(chip(k, v, (f?f.label:k) + ': ' + (o?o.label:v)));
    }));

    const facetHtml = facets.map(f => f.options.length ? '<div class="ip-facet"><div class="ip-facet-h">'
      + escHtml(f.label) + '</div>' + f.options.slice(0,12).map(o => {
        const on = (IP.filters[f.key]||[]).includes(o.value);
        return '<label class="ip-opt"><input type="checkbox" data-key="' + escHtml(f.key) + '" data-value="'
          + escHtml(o.value) + '"' + (on?' checked':'') + '> <span>' + escHtml(o.label)
          + '</span><b>' + o.count + '</b></label>';
      }).join('') + '</div>' : '').join('');

    const rowHtml = slice.map(t =>
      '<tr class="ip-row" data-id="' + escHtml(t.id) + '">'
      + '<td><b>' + escHtml(t.name) + '</b><div class="ip-row-sub">' + escHtml(t.kind) + '</div></td>'
      + '<td>' + escHtml(t.health) + '</td><td>' + escHtml(t.env) + '</td>'
      + '<td>' + escHtml(t.tag) + '</td><td>' + escHtml(t.tenant) + '</td>'
      + '<td>' + escHtml(t.policy) + '</td><td>' + escHtml(t.version) + '</td></tr>').join('');

    const body = rows.length
      ? '<table class="ip-table ip-targets"><thead><tr><th>Deployment target</th><th>Health</th><th>Environment</th><th>Target tag</th><th>Tenant</th><th>Machine policy</th><th>Agent version</th></tr></thead><tbody>' + rowHtml + '</tbody></table>'
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
  return { escHtml, stateView, renderOverview, renderTargets, bindTargets, renderTargetDetail, bindTargetDetail };
})();
if (typeof module !== 'undefined') { module.exports = Views; }
