// Sentry adapter — environment-aware, fully optional.
//
// If SENTRY_DSN is unset, every export is a no-op so the rest of the app
// behaves identically. When DSN is set we wire:
//   - global init() with environment + release tags
//   - request handler (must precede routes)
//   - error handler (must precede our errorHandler)
//   - captureException / captureMessage for ad-hoc reporting
//   - addBreadcrumb for auth/payment/order flows
//
// We deliberately scrub `password`, `refreshToken`, `token`, and full
// Authorization headers before sending events upstream.

const logger = require('./logger');

let Sentry = null;
let enabled = false;

const SENSITIVE_KEYS = new Set([
  'password', 'newpassword', 'currentpassword',
  'token', 'refreshtoken', 'accesstoken',
  'authorization', 'cookie', 'set-cookie',
  'razorpay_key_secret', 'jwt_secret'
]);

function scrub(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = Array.isArray(obj) ? [] : {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(k.toLowerCase())) {
      out[k] = '[Filtered]';
    } else if (v && typeof v === 'object') {
      out[k] = scrub(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function init() {
  if (!process.env.SENTRY_DSN) {
    logger.info('Sentry disabled (SENTRY_DSN not set)');
    return;
  }
  try {
    Sentry = require('@sentry/node');
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      release: process.env.SENTRY_RELEASE || undefined,
      // Conservative defaults — beta. Performance tracing at 10%.
      tracesSampleRate: +process.env.SENTRY_TRACES_RATE || 0.1,
      beforeSend(event) {
        if (event.request) {
          event.request.headers = scrub(event.request.headers);
          event.request.cookies = undefined;
          event.request.data    = scrub(event.request.data);
        }
        if (event.extra)  event.extra  = scrub(event.extra);
        if (event.contexts) event.contexts = scrub(event.contexts);
        return event;
      }
    });
    enabled = true;
    logger.info({ env: process.env.NODE_ENV }, 'Sentry initialised');
  } catch (err) {
    logger.warn({ err: err.message }, 'Sentry init failed — continuing without it');
    Sentry = null;
    enabled = false;
  }
}

function attachRequestHandler(app) {
  if (!enabled || !Sentry) return;
  // @sentry/node v7 exposes Handlers.requestHandler / tracingHandler.
  if (Sentry.Handlers && Sentry.Handlers.requestHandler) {
    app.use(Sentry.Handlers.requestHandler());
    if (Sentry.Handlers.tracingHandler) {
      app.use(Sentry.Handlers.tracingHandler());
    }
  }
}

function attachErrorHandler(app) {
  if (!enabled || !Sentry) return;
  if (Sentry.Handlers && Sentry.Handlers.errorHandler) {
    app.use(Sentry.Handlers.errorHandler({
      shouldHandleError(err) {
        // Report 5xx + uncategorised. 4xx are user errors, not platform bugs.
        const status = err.status || err.statusCode || 500;
        return status >= 500;
      }
    }));
  }
}

function captureException(err, ctx = {}) {
  if (!enabled || !Sentry) return;
  try {
    Sentry.withScope((scope) => {
      if (ctx.user)  scope.setUser({ id: String(ctx.user) });
      if (ctx.tags)  for (const [k, v] of Object.entries(ctx.tags)) scope.setTag(k, String(v));
      if (ctx.extra) scope.setExtras(scrub(ctx.extra));
      Sentry.captureException(err);
    });
  } catch (_) { /* never let Sentry break the request */ }
}

function captureMessage(msg, level = 'info', ctx = {}) {
  if (!enabled || !Sentry) return;
  try {
    Sentry.withScope((scope) => {
      scope.setLevel(level);
      if (ctx.tags)  for (const [k, v] of Object.entries(ctx.tags)) scope.setTag(k, String(v));
      if (ctx.extra) scope.setExtras(scrub(ctx.extra));
      Sentry.captureMessage(msg);
    });
  } catch (_) { /* swallow */ }
}

// Breadcrumb — short, structured trail leading up to the next captured event.
// Used in auth/payment/order flows so a single crash report carries the
// preceding business-event context.
function addBreadcrumb({ category, message, data, level = 'info' } = {}) {
  if (!enabled || !Sentry) return;
  try {
    Sentry.addBreadcrumb({ category, message, data: scrub(data || {}), level });
  } catch (_) { /* swallow */ }
}

module.exports = {
  init,
  attachRequestHandler,
  attachErrorHandler,
  captureException,
  captureMessage,
  addBreadcrumb,
  isEnabled: () => enabled
};
