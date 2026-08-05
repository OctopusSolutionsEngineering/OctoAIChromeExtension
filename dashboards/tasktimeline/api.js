/* ==========================================================================
   Octopus API client for the Task Timeline dashboard.

   Read-only by construction: every request is a GET, and there is no post/put/
   delete to reach for. The server URL comes from the extension's own config via
   dashboardGetConfig() in ../api.js, and cookies carry the session, so this
   file never reads a cookie, mints a token, or holds a credential.

   Requests are paced at 200 a minute and back off on 429, because the batched
   task lookup is a fan-out and a busy instance will throttle it.

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

  // Throttling. A task-detail fan-out is the heaviest thing this dashboard does,
  // and a busy instance answers that with 429. Two defences, because they cover
  // different cases: MIN_INTERVAL_MS paces every request so the fan-out is
  // unlikely to trip the limit in the first place, and the 429 handler recovers
  // when something else on the instance has already used the budget.
  //
  // 300ms is 200 requests a minute. Bounded retries mean a throttled instance
  // slows the dashboard down; it does not turn into an unbounded retry loop.
  var MIN_INTERVAL_MS = 300;
  var MAX_RETRIES = 3;
  var RETRY_FLOOR_MS = 1000;
  var RETRY_CEILING_MS = 30000;

  var serverUrl = '';
  var ready = null;
  var nextSlotAt = 0;

  /* Global pacing. Every request waits for its slot, so CONCURRENCY controls how
     many are in flight while this controls how fast they are issued. */
  function slot() {
    var now = Date.now();
    var at = Math.max(now, nextSlotAt);
    nextSlotAt = at + MIN_INTERVAL_MS;
    var wait = at - now;
    return wait > 0 ? new Promise(function (r) { setTimeout(r, wait); }) : Promise.resolve();
  }

  /* How long to wait after a 429. Retry-After is preferred, but the dashboard
     calls the Octopus server cross-origin, so the header is only readable if the
     server lists it in Access-Control-Expose-Headers. Exponential backoff is the
     fallback for when it is not, which is the common case. */
  function retryDelay(res, attempt) {
    var header = null;
    try { header = res.headers && res.headers.get('Retry-After'); } catch (e) { /* not exposed */ }
    if (header) {
      var secs = parseInt(header, 10);
      if (isFinite(secs) && secs > 0) {
        return Math.min(RETRY_CEILING_MS, Math.max(RETRY_FLOOR_MS, secs * 1000));
      }
      var when = Date.parse(header);
      if (isFinite(when)) {
        return Math.min(RETRY_CEILING_MS, Math.max(RETRY_FLOOR_MS, when - Date.now()));
      }
    }
    return Math.min(RETRY_CEILING_MS, RETRY_FLOOR_MS * Math.pow(2, attempt));
  }

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
    return init().then(function () { return send(endpoint, 0); });
  }

  function send(endpoint, attempt) {
    return slot().then(function () {
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

        if (res.status === 429) {
          if (attempt >= MAX_RETRIES) {
            throw new Error('Octopus is rate-limiting this dashboard (HTTP 429) and did not recover after ' +
              MAX_RETRIES + ' retries. Narrow the window or the per-call cap in the scope menu, then try again.');
          }
          var wait = retryDelay(res, attempt);
          // push the whole queue back, so the other in-flight workers back off too
          nextSlotAt = Math.max(nextSlotAt, Date.now() + wait);
          return new Promise(function (r) { setTimeout(r, wait); })
            .then(function () { return send(endpoint, attempt + 1); });
        }

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
     batches at a fixed concurrency: sequential is slow on a busy instance, and
     unbounded parallelism floods the API.

     Resolves to {items, requested, looked, dropped}. The counts are part of the
     result because the MAX_BATCHES ceiling can drop IDs, and a caller that only
     received an array would report the shortfall as "those tasks don't exist". */
  function byIds(resource, ids) {
    var seen = Object.create(null);
    var unique = [];
    (ids || []).forEach(function (id) {
      if (!id || seen[id]) return;
      seen[id] = 1;
      unique.push(id);
    });
    if (!unique.length) return Promise.resolve({ items: [], requested: 0, looked: 0, dropped: 0 });

    var batches = [];
    for (var i = 0; i < unique.length && batches.length < MAX_BATCHES; i += IDS_PER_BATCH) {
      batches.push(unique.slice(i, i + IDS_PER_BATCH));
    }
    var looked = batches.reduce(function (a, b) { return a + b.length; }, 0);

    var out = [];
    var next = 0;
    // First terminal failure stops the run. Without this the other workers keep
    // issuing requests after Promise.all has already rejected, so a throttled
    // instance carries on being hammered by a load the dashboard has given up
    // on. At most CONCURRENCY - 1 requests are still in flight when it trips.
    var failure = null;

    function worker() {
      if (failure) return Promise.reject(failure);
      if (next >= batches.length) return Promise.resolve();
      var batch = batches[next++];
      var q = '/api/' + resource + '?take=' + batch.length +
              '&ids=' + batch.map(encodeURIComponent).join('&ids=');
      return get(q).then(function (res) {
        items(res).forEach(function (r) { out.push(r); });
        return worker();
      }, function (err) {
        if (!failure) failure = err;
        throw err;
      });
    }

    var workers = [];
    for (var w = 0; w < Math.min(CONCURRENCY, batches.length); w++) workers.push(worker());
    return Promise.all(workers).then(function () {
      return { items: out, requested: unique.length, looked: looked, dropped: unique.length - looked };
    });
  }

  return { init: init, get: get, items: items, byIds: byIds, serverUrl: function () { return serverUrl; } };
})();
