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
  return { escHtml, stateView };
})();
if (typeof module !== 'undefined') { module.exports = Views; }
