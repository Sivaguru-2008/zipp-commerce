// Browser observability bootstrap.
//
// Loads Sentry browser SDK from CDN only when window.__ZIPP_SENTRY_DSN is
// set (injected by the server via /api/config or a meta tag). This keeps
// the no-build static frontend slim while still giving us runtime crash +
// failed-request + perf reporting in beta.
//
// Without the DSN, this file installs a tiny shim so callers can keep using
// `window.Zipp.observe.*` without checking for Sentry every time.

(function () {
  const noop = function () {};
  const shim = {
    captureException: noop,
    captureMessage: noop,
    addBreadcrumb: noop,
    setUser: noop
  };
  window.Zipp = window.Zipp || {};
  window.Zipp.observe = shim;

  function readDsn() {
    // 1) explicit global from server
    if (window.__ZIPP_SENTRY_DSN) return window.__ZIPP_SENTRY_DSN;
    // 2) meta tag <meta name="sentry-dsn" content="...">
    const meta = document.querySelector('meta[name="sentry-dsn"]');
    if (meta && meta.content) return meta.content;
    return null;
  }

  const dsn = readDsn();
  if (!dsn) return; // observability disabled — shim is fine

  // Load Sentry browser SDK (CDN). The pinned version stays in lockstep with
  // the backend @sentry/node major.
  const script = document.createElement('script');
  script.src = 'https://browser.sentry-cdn.com/7.119.0/bundle.tracing.min.js';
  script.crossOrigin = 'anonymous';
  script.async = true;
  script.onload = function () {
    if (!window.Sentry) return;
    try {
      window.Sentry.init({
        dsn,
        environment: (window.__ZIPP_ENV || 'development'),
        release: window.__ZIPP_RELEASE || undefined,
        integrations: [new window.Sentry.BrowserTracing()],
        tracesSampleRate: 0.1,
        // Strip query strings / tokens accidentally captured in URLs.
        beforeBreadcrumb(breadcrumb) {
          if (breadcrumb.category === 'fetch' && breadcrumb.data && breadcrumb.data.url) {
            breadcrumb.data.url = breadcrumb.data.url.split('?')[0];
          }
          return breadcrumb;
        }
      });
      // Replace shim with real implementations.
      window.Zipp.observe = {
        captureException: window.Sentry.captureException.bind(window.Sentry),
        captureMessage:   window.Sentry.captureMessage.bind(window.Sentry),
        addBreadcrumb:    window.Sentry.addBreadcrumb.bind(window.Sentry),
        setUser:          window.Sentry.setUser.bind(window.Sentry)
      };
      // Tag the active user from localStorage if we have one.
      try {
        const u = JSON.parse(localStorage.getItem('zipp_user') || 'null');
        if (u && u._id) window.Zipp.observe.setUser({ id: String(u._id) });
      } catch (_) { /* ignore */ }
    } catch (e) {
      // Sentry failed to init — keep shim in place, app stays functional.
    }
  };
  document.head.appendChild(script);

  // Global JS error + unhandled promise rejection — these fire even before
  // Sentry finishes loading, so we queue them and flush after init.
  const queue = [];
  function flushOrQueue(fn) {
    if (window.Sentry) fn(window.Sentry);
    else queue.push(fn);
  }
  window.addEventListener('error', function (ev) {
    flushOrQueue(function (S) {
      S.captureException(ev.error || new Error(ev.message));
    });
  });
  window.addEventListener('unhandledrejection', function (ev) {
    flushOrQueue(function (S) {
      S.captureException(ev.reason || new Error('Unhandled promise rejection'));
    });
  });
  // After Sentry loads, replay the queue.
  const flushInterval = setInterval(function () {
    if (window.Sentry && queue.length) {
      queue.splice(0).forEach(function (fn) { try { fn(window.Sentry); } catch (_) {} });
    }
    if (window.Sentry) clearInterval(flushInterval);
  }, 200);
})();
