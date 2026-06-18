/**
 * Admin write-action audit log. Mounted under /api/admin so every
 * non-GET request is logged with the admin user id, route, method, IP,
 * and status. Goes through the structured logger, so log aggregators
 * pick it up automatically.
 *
 * Read-only requests are skipped to keep log volume sane.
 */
const logger = require('../utils/logger');

module.exports = function auditLog(req, res, next) {
  if (req.method === 'GET' || req.method === 'OPTIONS') return next();
  res.on('finish', () => {
    logger.info({
      audit: true,
      userId: req.user && req.user._id ? String(req.user._id) : null,
      email:  req.user && req.user.email ? req.user.email : null,
      method: req.method,
      path:   req.originalUrl,
      ip:     req.ip,
      status: res.statusCode,
      reqId:  req.id
    }, 'admin action');
  });
  next();
};
