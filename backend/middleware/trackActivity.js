const jwt = require('jsonwebtoken');
const analytics = require('../utils/analytics');

// Fire-and-forget activity tap. If the request carries a valid Bearer token,
// we touch the online-user set so /api/analytics/summary reflects who is
// currently active. No DB hit, no failure path — token decode errors are
// silently ignored.
//
// Mounted globally in server.js after the rate limiters.

module.exports = function trackActivity(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return next();

  try {
    const token = auth.slice(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded && decoded.id) {
      analytics.trackOnline(decoded.id).catch(() => {});
    }
  } catch {
    // Bad/expired tokens are handled by protect — we just skip tracking.
  }
  next();
};
