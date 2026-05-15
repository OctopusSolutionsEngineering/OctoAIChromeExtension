/* ==========================================================================
   Value Dashboard — Analytics (Amplitude)

   Thin wrapper around the Amplitude Browser SDK. Every event is auto-tagged
   with { dashboard: DASHBOARD_NAME } so events from different dashboards
   are distinguishable in Amplitude without any extra work per-call.

   Usage:
     Analytics.trackPageView('overview')
     Analytics.trackEvent('export_clicked', { format: 'csv' })

   When adding analytics to a new dashboard, copy this file and change
   DASHBOARD_NAME to match the dashboard folder name.
   ========================================================================== */

const Analytics = (() => {

  const API_KEY = 'c3b038cc40009f891d02fb668ff6d247';
  const DASHBOARD_NAME = 'valuemetrics';

  let _initialised = false;

  function _withSource(properties) {
    return { dashboard: DASHBOARD_NAME, ...(properties || {}) };
  }

  function init() {
    if (_initialised) return;

    if (!API_KEY || API_KEY === 'YOUR_AMPLITUDE_API_KEY') {
      console.log('[Analytics] No Amplitude key configured — analytics disabled.');
      return;
    }

    try {
      amplitude.init(API_KEY, {
        autocapture: false,
        defaultTracking: false,
      });

      _initialised = true;
      console.log('[Analytics] Amplitude initialised.');

      _installOutboundLinkTracker();
    } catch (err) {
      console.warn('[Analytics] Failed to initialise Amplitude:', err);
    }
  }

  function trackPageView(viewName, properties) {
    if (!_initialised) return;
    try {
      amplitude.track('page_viewed', _withSource({
        page: viewName,
        ...properties,
      }));
    } catch (err) {
      console.warn('[Analytics] Failed to track page view:', err);
    }
  }

  function trackEvent(eventName, properties) {
    if (!_initialised) return;
    try {
      amplitude.track(eventName, _withSource(properties));
    } catch (err) {
      console.warn('[Analytics] Failed to track event:', err);
    }
  }

  function setUserProperties(properties) {
    if (!_initialised) return;
    try {
      const identify = new amplitude.Identify();
      for (const [key, value] of Object.entries(properties)) {
        if (value !== undefined && value !== null) {
          identify.set(key, value);
        }
      }
      amplitude.identify(identify);
    } catch (err) {
      console.warn('[Analytics] Failed to set user properties:', err);
    }
  }

  /**
   * Delegated click handler that catches outbound link clicks (target="_blank")
   */
  function _installOutboundLinkTracker() {
    document.addEventListener('click', (e) => {
      const anchor = e.target.closest('a[target="_blank"]');
      if (!anchor) return;

      const url = anchor.href || '';
      let destination = 'external';
      if (url.includes('octopus.com/docs')) destination = 'octopus_docs';
      else if (url.includes('/app#/')) destination = 'octopus_instance';

      trackEvent('outbound_link_clicked', {
        destination,
        link_text: (anchor.textContent || '').trim().substring(0, 80),
      });
    });
  }

  return { init, trackPageView, trackEvent, setUserProperties };

})();
