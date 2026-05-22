/**
 * Operational metrics — payment failures, error counts, slow requests.
 *
 * Backed by Redis when available, no-op otherwise. Designed to be safe to
 * import in any hot path; every public method swallows errors so a metrics
 * outage never affects user requests.
 */
const logger  = require('./logger');
const cache   = require('./cache');

const todayKey = (d = new Date()) => d.toISOString().slice(0, 10);

const DAILY_TTL = 60 * 60 * 24 * 35; // ~5 weeks of history

const KEY = {
  paymentFailures: (date) => `metrics:payment_failures:${date}`,
  paymentFailureReasons:    'metrics:payment_failure_reasons',
  errors5xx:       (date) => `metrics:errors_5xx:${date}`,
  errors4xx:       (date) => `metrics:errors_4xx:${date}`,
  slowRequests:    (date) => `metrics:slow_requests:${date}`,
  latencyBuckets:  (route) => `metrics:latency:${route}`
};

const SLOW_REQUEST_MS = +process.env.SLOW_REQUEST_MS || 1500;

async function safeIncr(key) {
  const c = cache.getRawClient();
  if (!c) return;
  try { await c.incr(key); await c.expire(key, DAILY_TTL); }
  catch (err) { logger.warn({ err: err.message, key }, 'metrics incr failed'); }
}

async function safeZincr(key, member) {
  const c = cache.getRawClient();
  if (!c) return;
  try { await c.zincrby(key, 1, member); await c.expire(key, DAILY_TTL); }
  catch (err) { logger.warn({ err: err.message, key }, 'metrics zincr failed'); }
}

exports.recordPaymentFailure = async (reason) => {
  await safeIncr(KEY.paymentFailures(todayKey()));
  if (reason) await safeZincr(KEY.paymentFailureReasons, String(reason).slice(0, 80));
};

exports.recordError = async (status) => {
  if (status >= 500) await safeIncr(KEY.errors5xx(todayKey()));
  else if (status >= 400) await safeIncr(KEY.errors4xx(todayKey()));
};

exports.recordRequestDuration = async (route, ms) => {
  if (ms < SLOW_REQUEST_MS) return;
  await safeIncr(KEY.slowRequests(todayKey()));
  logger.warn({ route, durationMs: ms }, 'slow request');
};

exports.getOpsSummary = async () => {
  const c = cache.getRawClient();
  const safe = async (k) => {
    if (!c) return 0;
    try { return +(await c.get(k)) || 0; } catch { return 0; }
  };
  const date = todayKey();
  const [paymentFailures, errors5xx, errors4xx, slowRequests] = await Promise.all([
    safe(KEY.paymentFailures(date)),
    safe(KEY.errors5xx(date)),
    safe(KEY.errors4xx(date)),
    safe(KEY.slowRequests(date))
  ]);
  let topFailureReasons = [];
  if (c) {
    try {
      const raw = await c.zrevrange(KEY.paymentFailureReasons, 0, 4, 'WITHSCORES');
      for (let i = 0; i < raw.length; i += 2) {
        topFailureReasons.push({ reason: raw[i], count: +raw[i + 1] });
      }
    } catch (_) {}
  }
  return {
    today: { paymentFailures, errors5xx, errors4xx, slowRequests },
    topPaymentFailureReasons: topFailureReasons,
    uptimeSeconds: Math.round(process.uptime()),
    memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024)
  };
};

exports.SLOW_REQUEST_MS = SLOW_REQUEST_MS;
