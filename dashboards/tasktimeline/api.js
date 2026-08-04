/* ==========================================================================
   Octopus API client for the Task Timeline dashboard.

   Read-only by construction: every request is a GET, and there is no post/put/
   delete to reach for. The server URL comes from the extension's own config via
   dashboardGetConfig() in ../api.js, and cookies carry the session, so this
   file never reads a cookie, mints a token, or holds a credential.

   Isolated on purpose — nothing here is shared with another dashboard, per the
   community-dashboard guidelines.
   ========================================================================== */

var Api = (function () {
  'use strict';

  var CONFIG_TIMEOUT = 10000;
  var REQUEST_TIMEOUT = 20000;

  // The Octopus tasks endpoint takes a batch of IDs at a time. Both numbers are
  // ceilings, not targets: MAX_BATCHES bounds the fan-out so a wide fetch can
  // never turn into an unbounded loop over the API. 60 × 100 covers the largest
  // per-call cap the UI offers (2,000 deployments + 2,000 runbook runs).
  var IDS_PER_BATCH = 100;
  var MAX_BATCHES = 60;
  var CONCURRENCY = 4;

  var serverUrl = '';
  var ready = null;

  function init() {
    if (ready) return ready;
    ready = new Promise(function (resolve, reject) {
      if (typeof dashboardGetConfig !== 'function') {
        reject(new Error('dashboardGetConfig is not available — is ../api.js loaded?'));
        return;
      }
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        reject(new Error('Timed out reading the extension config. Open a dashboard from an Octopus tab first.'));
      }, CONFIG_TIMEOUT);

      dashboardGetConfig(function (config) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (!config || !config.lastServerUrl) {
          reject(new Error('The extension config has no Octopus server URL. Open a dashboard from an Octopus tab first.'));
          return;
        }
        serverUrl = String(config.lastServerUrl).replace(/\/+$/, '');
        resolve(serverUrl);
      });
    });
    return ready;
  }

  function get(endpoint) {
    return init().then(function () {
      var url = serverUrl + (endpoint.charAt(0) === '/' ? endpoint : '/' + endpoint);
      var controller = typeof AbortController === 'function' ? new AbortController() : null;
      var timer = setTimeout(function () { if (controller) controller.abort(); }, REQUEST_TIMEOUT);

      var opts = {
        method: 'GET',
        headers: { Accept: 'application/json' },
        credentials: 'include'
      };
      if (controller) opts.signal = controller.signal;

      return fetch(url, opts).then(function (res) {
        clearTimeout(timer);
        if (res.status === 401 || res.status === 403) {
          throw new Error('Octopus rejected the request (HTTP ' + res.status + '). Your session may have expired — sign in again in the Octopus tab, then reload this dashboard.');
        }
        if (!res.ok) {
          throw new Error('Octopus API ' + res.status + ' ' + res.statusText + ' for ' + endpoint);
        }
        if (res.status === 204) return null;
        return res.json();
      }, function (err) {
        clearTimeout(timer);
        if (err && err.name === 'AbortError') {
          throw new Error('Request timed out after ' + (REQUEST_TIMEOUT / 1000) + 's — ' + endpoint + '. Narrow the fetch and try again.');
        }
        throw err;
      });
    });
  }

  /* Octopus returns either a bare array or a paged {Items:[…]} envelope
     depending on the endpoint, and a failed optional call arrives here as null.
     Callers should not have to know which. */
  function items(res) {
    if (!res) return [];
    if (Array.isArray(res)) return res;
    if (Array.isArray(res.Items)) return res.Items;
    return [];
  }

  /* Batched ID lookup. Deduplicates first, then runs a bounded number of
     batches at a fixed concurrency — sequential would be slow on a busy
     instance and unbounded parallelism would flood the API. */
  function byIds(resource, ids) {
    var seen = Object.create(null);
    var unique = [];
    (ids || []).forEach(function (id) {
      if (!id || seen[id]) return;
      seen[id] = 1;
      unique.push(id);
    });
    if (!unique.length) return Promise.resolve([]);

    var batches = [];
    for (var i = 0; i < unique.length && batches.length < MAX_BATCHES; i += IDS_PER_BATCH) {
      batches.push(unique.slice(i, i + IDS_PER_BATCH));
    }

    var out = [];
    var next = 0;

    function worker() {
      if (next >= batches.length) return Promise.resolve();
      var batch = batches[next++];
      var q = '/api/' + resource + '?take=' + batch.length +
              '&ids=' + batch.map(encodeURIComponent).join('&ids=');
      return get(q).then(function (res) {
        items(res).forEach(function (r) { out.push(r); });
        return worker();
      });
    }

    var workers = [];
    for (var w = 0; w < Math.min(CONCURRENCY, batches.length); w++) workers.push(worker());
    return Promise.all(workers).then(function () { return out; });
  }

  return { init: init, get: get, items: items, byIds: byIds, serverUrl: function () { return serverUrl; } };
})();
