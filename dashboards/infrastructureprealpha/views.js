'use strict';
const Views = (function () {
  function escHtml(s) { return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function stateView(kind, detail) {
    if (kind === 'loading') return '<div class="ip-state"><div class="ip-spinner"></div><p>Loading your infrastructure…</p></div>';
    if (kind === 'auth') return '<div class="ip-state"><h3>Sign in to Octopus</h3>'
      + '<p>Your session isn\'t authenticated. Open your Octopus instance, sign in, then reopen this dashboard.</p></div>';
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
  return { escHtml, stateView, renderOverview };
})();
if (typeof module !== 'undefined') { module.exports = Views; }
