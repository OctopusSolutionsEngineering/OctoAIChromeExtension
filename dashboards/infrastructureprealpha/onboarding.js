'use strict';
const Onboarding = (function () {
  function card(title, body, cta, href) {
    return '<section class="ip-setup-card"><h4>' + Views.escHtml(title) + '</h4>'
      + '<p class="ip-sub">' + Views.escHtml(body) + '</p>'
      + '<a class="ip-btn" href="' + Views.escHtml(href) + '" target="_blank" rel="noopener">' + Views.escHtml(cta) + '</a></section>';
  }
  function renderFirstRun(IP) {
    const base = String(IP.serverUrl||'').replace(/\/$/,'') + '/app#/infrastructure';
    document.getElementById('main-content').innerHTML = ''
      + '<header class="ip-head"><h2>Set up your infrastructure</h2>'
      +   '<p class="ip-sub">You don\'t have any infrastructure yet. Add a deployment target to give Octopus somewhere to deploy — most teams start here.</p></header>'
      + '<div class="ip-grid">'
      +   card('Add a deployment target','Connect a server, Kubernetes cluster, or cloud service where your projects will deploy.','Add target', base + '/machines/new')
      +   card('Connect Argo CD','Link an externally-run Argo CD instance to track its connection and gateway health.','Connect instance', base)
      +   card('Add a worker','Set up shared worker infrastructure to run deployment steps outside your targets.','Add worker', base + '/workers/new')
      + '</div>'
      + '<section class="ip-card" style="margin-top:16px"><h4>One machine policy is ready to go</h4>'
      +   '<p class="ip-sub">Your Default Machine Policy runs a health check every day. New targets use it automatically — no setup needed.</p>'
      +   '<a class="ip-link" href="' + Views.escHtml(base + '/machinepolicies') + '" target="_blank" rel="noopener">View policy →</a></section>';
    document.querySelectorAll('.ip-nav-item').forEach(a => a.classList.remove('active'));
  }
  return { renderFirstRun };
})();
if (typeof module !== 'undefined') { module.exports = Onboarding; }
