'use strict';
const Onboarding = (function () {
  var ICONS = {
    target: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--color-blue-600)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="16" height="11" rx="1.5"/><path d="M7 17h6M10 14v3"/></svg>',
    argo: '<svg width="20" height="20" viewBox="0 0 20 20" fill="var(--color-purple-600)"><path d="M10 2l7 4.5v7L10 18l-7-4.5v-7L10 2z"/></svg>',
    worker: '<svg width="20" height="20" viewBox="0 0 20 20" fill="var(--fg2)"><rect x="4" y="3" width="4" height="14" rx="1"/><rect x="12" y="3" width="4" height="14" rx="1"/></svg>',
    doc: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--fg2)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2h9l5 5v15H6V2z"/><path d="M15 2v5h5"/><path d="M9 8h3M9 12h6M9 16h6"/></svg>',
    octopus: '<svg viewBox="0 0 40 40" width="44" height="44" fill="var(--ring)"><path d="M32.3 25.9c-2.8-2.4-2.3-4.9-1-8 2.2-5.5-1.5-11.7-6.8-13.3C18.8 2.8 12.5 5.5 10.3 11.3c-.6 1.5-.7 3-.7 4.6.2 1.9 1 3.3 1.5 5 1 3.2-1.8 5.8-4.1 7.4-2.9 1.9-2.3 2.5-.6 2.6 1.5.1 2.8-.3 4-1 .6-.3 2.5-1.2 2.9-1.8-.8 1.7-2.3 4.6-1.4 6.4 1.2 2.3 4.2-2 4.8-2.8.5-.8 2.7-5.1 3.9-2.9 1.2 1.9.6 4.7 2.3 6.5 2 2.1 3.1-1.2 3.2-2.8 0-1-.4-6 1.9-3.8 1.3 1.3 3.2 4.4 5.4 4.2 2.4-.3-1.3-4.3-1.7-5 .3.3 3.3 2.2 3.4.6 0-1.2-1.9-2.2-2.7-2.8Z"/></svg>'
  };

  function csCard(opts) {
    var classes = 'ip-cs-card' + (opts.primary ? ' ip-cs-card-primary' : '');
    var badge = opts.primary ? '<span class="ip-cs-badge">START HERE</span>' : '';
    var btnClass = opts.primary ? 'ip-btn' : 'ip-btn-secondary';
    return '<section class="' + classes + '">' + badge
      + '<div class="ip-cs-icon ip-cs-icon-' + opts.tone + '">' + ICONS[opts.icon] + '</div>'
      + '<h4>' + Views.escHtml(opts.title) + '</h4>'
      + '<p class="ip-sub">' + Views.escHtml(opts.body) + '</p>'
      + '<a class="' + btnClass + '" href="' + Views.escHtml(opts.href) + '" target="_blank" rel="noopener">' + Views.escHtml(opts.cta) + '</a></section>';
  }

  function renderFirstRun(IP) {
    const base = String(IP.serverUrl||'').replace(/\/$/,'') + '/app#/infrastructure';
    document.getElementById('main-content').innerHTML = ''
      + '<div class="ip-cs">'
      +   '<div class="ip-cs-header">' + ICONS.octopus
      +     '<h2>Set up your infrastructure</h2>'
      +     '<p class="ip-sub">You don\'t have any infrastructure yet. Add a deployment target to give Octopus somewhere to deploy — most teams start here.</p>'
      +   '</div>'
      +   '<div class="ip-cs-cards">'
      +     csCard({primary:true, tone:'blue', icon:'target', title:'Add a deployment target', body:'Connect a server, Kubernetes cluster, or cloud service where your projects will deploy.', cta:'Add target', href: base + '/machines/new'})
      +     csCard({tone:'purple', icon:'argo', title:'Connect Argo CD', body:'Link an externally-run Argo CD instance to track its connection and gateway health.', cta:'Connect instance', href: base})
      +     csCard({tone:'slate', icon:'worker', title:'Add a worker', body:'Set up shared worker infrastructure to run deployment steps outside your targets.', cta:'Add worker', href: base + '/workers/new'})
      +   '</div>'
      +   '<section class="ip-cs-policy">'
      +     '<div class="ip-cs-policy-left">' + ICONS.doc
      +       '<div><h4>One machine policy is ready to go</h4>'
      +       '<p class="ip-sub">Your Default Machine Policy runs a health check every day. New targets use it automatically — no setup needed.</p></div>'
      +     '</div>'
      +     '<a class="ip-link" href="' + Views.escHtml(base + '/machinepolicies') + '" target="_blank" rel="noopener">View policy →</a>'
      +   '</section>'
      +   '<a class="ip-link ip-cs-learn" href="' + Views.escHtml(base + '/machines') + '" target="_blank" rel="noopener">New to deployment targets? Learn how targets work →</a>'
      + '</div>';
    document.querySelectorAll('.ip-nav-item').forEach(a => a.classList.remove('active'));
  }
  return { renderFirstRun };
})();
if (typeof module !== 'undefined') { module.exports = Onboarding; }
