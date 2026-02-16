/* ==========================================================================
   Octopus Deploy API Client — Chrome Extension Mode
   
   Uses the bearer token + serverUrl provided by the parent Chrome extension
   via getDashboardConfig() (from ../api.js).
   
   All API calls use:  Authorization: Bearer <accessToken>
   ========================================================================== */

const OctopusApi = (() => {

  // Populated by init() from chrome.storage.local
  let _serverUrl = '';
  let _accessToken = '';
  let _ready = false;
  let _readyPromise = null;

  // ---- Timeouts (ms) ----
  const INIT_TIMEOUT   = 10000;  // 10s to load config from extension storage
  const REQUEST_TIMEOUT = 15000; // 15s per API request

  /**
   * Initialise from the Chrome extension's stored dashboard config.
   * Returns a promise that resolves when config is loaded, or rejects after timeout.
   */
  function init() {
    if (_readyPromise) return _readyPromise;

    _readyPromise = new Promise((resolve, reject) => {
      if (typeof getDashboardConfig !== 'function') {
        reject(new Error('getDashboardConfig not found — is ../api.js loaded?'));
        return;
      }

      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error('Timed out loading extension config (' + (INIT_TIMEOUT / 1000) + 's). Make sure the Octopus Deploy extension is configured.'));
        }
      }, INIT_TIMEOUT);

      getDashboardConfig(config => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);

        if (!config || !config.serverUrl || !config.accessToken) {
          reject(new Error('Dashboard config missing serverUrl or accessToken.'));
          return;
        }
        _serverUrl = config.serverUrl.replace(/\/+$/, '');
        _accessToken = config.accessToken;
        _ready = true;
        resolve();
      });
    });

    return _readyPromise;
  }

  function getInstanceUrl() { return _serverUrl; }
  function getAccessToken() { return _accessToken; }
  function isConfigured()   { return _ready && !!_serverUrl && !!_accessToken; }

  // ---- Fetch wrapper ----

  async function request(endpoint, options = {}) {
    const log = window._debug || console.log;

    if (!_ready) await init();

    const url = _serverUrl + (endpoint.startsWith('/') ? endpoint : '/' + endpoint);

    const headers = {
      'Accept': 'application/json',
      'Authorization': 'Bearer ' + _accessToken,
      ...(options.headers || {}),
    };

    if (options.body && typeof options.body === 'object') {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }

    const timeout = options.timeout || REQUEST_TIMEOUT;
    delete options.timeout;

    log(`→ ${options.method || 'GET'} ${endpoint}`);

    // Set up abort controller for timeout
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timer);

      log(`← ${response.status} ${response.statusText} — ${endpoint}`);

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        log(`ERROR body: ${text.slice(0, 200)}`);
        throw new ApiError(response.status, response.statusText, text, url);
      }

      if (response.status === 204) return null;

      const json = await response.json();
      log(`✓ ${endpoint} — ${json?.Items?.length ?? 'obj'} items`);
      return json;

    } catch (err) {
      clearTimeout(timer);
      if (err instanceof ApiError) throw err;
      if (err.name === 'AbortError') {
        const msg = `Request timed out after ${timeout / 1000}s — ${endpoint}`;
        log(`TIMEOUT: ${msg}`);
        throw new Error(msg);
      }
      log(`FETCH FAILED: ${err.message}`);
      throw err;
    }
  }

  // ---- Convenience methods ----

  function get(endpoint)        { return request(endpoint, { method: 'GET' }); }
  function post(endpoint, body) { return request(endpoint, { method: 'POST', body }); }
  function put(endpoint, body)  { return request(endpoint, { method: 'PUT', body }); }
  function del(endpoint)        { return request(endpoint, { method: 'DELETE' }); }

  // ---- Test connectivity ----

  async function testConnection() {
    try {
      const data = await get('/api');
      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  }

  // ---- Custom error class ----

  class ApiError extends Error {
    constructor(status, statusText, body, url) {
      super(`Octopus API ${status} ${statusText} — ${url}`);
      this.name = 'ApiError';
      this.status = status;
      this.statusText = statusText;
      this.body = body;
      this.url = url;
    }
  }

  // ---- Public API ----

  return {
    init,
    getInstanceUrl,
    getAccessToken,
    isConfigured,
    request,
    get,
    post,
    put,
    del,
    testConnection,
    ApiError,
  };

})();
