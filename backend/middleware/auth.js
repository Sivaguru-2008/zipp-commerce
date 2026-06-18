const User = require('../models/User');
const { verifyAccessToken } = require('../utils/tokens');
const { ACCESS_COOKIE } = require('../utils/cookies');

// Pull the access token from (in order): HttpOnly cookie → Authorization
// header. Cookie is the new canonical source; Bearer header retained so
// older clients (and curl/test harnesses) still work.
function extractToken(req) {
  if (req.cookies && req.cookies[ACCESS_COOKIE]) {
    return req.cookies[ACCESS_COOKIE];
  }
  const h = req.headers.authorization;
  if (h && h.startsWith('Bearer ')) return h.slice(7);
  return null;
}

const protect = async (req, res, next) => {
  try {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ success: false, message: 'Not authorized, no token' });
    }
    const decoded = verifyAccessToken(token);
    req.user = await User.findById(decoded.id).select('-password');
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }
    if (!req.user.isActive) {
      return res.status(401).json({ success: false, message: 'Account deactivated' });
    }
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Not authorized, token failed' });
  }
};

const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'admin') return next();
  return res.status(403).json({ success: false, message: 'Admin access required' });
};

const optionalAuth = async (req, res, next) => {
  try {
    const token = extractToken(req);
    if (token) {
      const decoded = verifyAccessToken(token);
      req.user = await User.findById(decoded.id).select('-password');
    }
    next();
  } catch {
    next();
  }
};

module.exports = { protect, adminOnly, optionalAuth };
