/* ==========================================================================
   SPA Router — Lightweight hash-based view switching
   
   Manages navigation between dashboard views. The sidebar, header, and
   footer stay fixed; only <div id="main-content"> is swapped.
   ========================================================================== */

const Router = (() => {

  const VIEWS = {
    overview:     { title: 'Platform Dashboard',  icon: 'fa-solid fa-gauge-high' },
    trends:       { title: 'Deployment Trends',   icon: 'fa-solid fa-chart-line' },
    velocity:     { title: 'Release Velocity',    icon: 'fa-solid fa-rocket' },
    reliability:  { title: 'Reliability',         icon: 'fa-solid fa-shield-halved' },
    spaces:       { title: 'Spaces',              icon: 'fa-solid fa-cubes' },
    projects:     { title: 'Projects',            icon: 'fa-solid fa-diagram-project' },
    environments: { title: 'Environments',        icon: 'fa-solid fa-server' },
    teams:        { title: 'Teams',               icon: 'fa-solid fa-users' },
    tenants:      { title: 'Tenants',             icon: 'fa-solid fa-building-user' },
  };

  let _current = 'overview';

  function navigate(viewName, { force = false } = {}) {
    if (!VIEWS[viewName]) return;
    const prevView = _current;
    _current = viewName;

    // Update hash (overview = no hash)
    const newHash = viewName === 'overview' ? '' : viewName;
    if (window.location.hash.slice(1) !== newHash) {
      history.pushState(null, '', newHash ? '#' + newHash : window.location.pathname);
    }

    // Update sidebar active state
    document.querySelectorAll('.nav-item[data-view]').forEach(el => {
      el.classList.toggle('active', el.dataset.view === viewName);
    });

    // Update header title + icon
    const view = VIEWS[viewName];
    const headerIcon = document.getElementById('header-icon');
    const headerText = document.getElementById('header-text');
    if (headerIcon) headerIcon.className = view.icon + ' text-tertiary';
    if (headerText) headerText.textContent = view.title;

    // Render view into main-content
    const main = document.getElementById('main-content');
    const summary = DashboardData.getSummary();

    if (viewName === 'overview') {
      main.innerHTML = Views.getOverviewHTML();
      if (summary) {
        DashboardUI.renderOverview(summary);
        if (typeof renderValueImpact === 'function') renderValueImpact(summary);
      }
      Views.wireOverviewEvents();
    } else {
      // Views that fetch their own data don't need the main dashboard summary
      const SELF_LOADING = new Set(['tenants']);
      // Don't re-init a self-loading view that's already showing unless forced.
      // User navigation away and back triggers re-init; background refresh() uses force=true.
      if (SELF_LOADING.has(viewName) && viewName === prevView && !force) return;
      if (!summary && !SELF_LOADING.has(viewName)) {
        main.innerHTML = `<div style="text-align:center;padding:var(--space-xl);color:var(--colorTextTertiary);">
          <i class="fa-solid fa-spinner fa-spin" style="font-size:2rem;display:block;margin-bottom:var(--space-md);"></i>
          Loading data&hellip;
        </div>`;
        return;
      }
      // Call the matching render function from Views
      const fnName = 'render' + viewName.charAt(0).toUpperCase() + viewName.slice(1);
      if (Views[fnName]) {
        main.innerHTML = Views[fnName](summary);
        // Wire view-specific events
        const wireFn = 'wire' + viewName.charAt(0).toUpperCase() + viewName.slice(1) + 'Events';
        if (Views[wireFn]) Views[wireFn](summary);
      }
    }

    // Scroll to top
    document.querySelector('.main').scrollTop = 0;

    Analytics.trackPageView(viewName);
  }

  function refresh() {
    navigate(_current, { force: true });
  }

  function getCurrentView() {
    return _current;
  }

  function init() {
    // Wire up nav clicks for items with data-view
    document.querySelectorAll('.nav-item[data-view]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        navigate(el.dataset.view);
      });
    });

    // Listen for popstate (back/forward)
    window.addEventListener('popstate', () => {
      const hash = window.location.hash.slice(1) || 'overview';
      if (VIEWS[hash] && hash !== _current) navigate(hash);
    });

    // Navigate to initial view from hash
    const initial = window.location.hash.slice(1) || 'overview';
    navigate(VIEWS[initial] ? initial : 'overview');
  }

  return { init, navigate, refresh, getCurrentView };

})();
