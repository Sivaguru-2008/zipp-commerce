/**
 * Lightweight latency tracker. Records request duration on `res.finish`
 * and forwards the route + ms to metrics.recordRequestDuration. Slow
 * requests (> SLOW_REQUEST_MS) get a structured warn log there.
 *
 * Designed to be cheap: zero work on the request path itself; the work
 * happens after the response has been flushed.
 */
const metrics = require('../utils/metrics');

module.exports = function latency(req, res, next) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    // Coarsen the route key so we don't blow up cardinality with ids.
    // /api/products/abc123 → /api/products/:id
    const route = (req.route && req.baseUrl ? req.baseUrl + req.route.path : req.path)
      .replace(/\/[0-9a-f]{24}(?=$|\/)/gi, '/:id')
      .replace(/\/\d+(?=$|\/)/g, '/:id')
      .slice(0, 100);
    metrics.recordRequestDuration(route, ms).catch(() => {});
  });
  next();
};
