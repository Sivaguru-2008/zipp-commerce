// Guards endpoints that require the caller to have completed OTP
// verification (e.g. placing an order, adding a payment method).
//
// Guest browsing → no req.user → 401 (treated as unauthenticated).
// Authenticated but unverified → 403 with a stable code the frontend uses
// to drive an "Enter the code we just texted" modal.

module.exports = function requireVerified(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Not authorized' });
  }
  if (req.user.isVerified) return next();

  // OTP gate is opt-in: setting OTP_REQUIRED=false disables enforcement so
  // we can roll it out gradually without blocking legacy accounts.
  if (process.env.OTP_REQUIRED === 'false') return next();

  return res.status(403).json({
    success: false,
    code: 'OTP_REQUIRED',
    message: 'Phone verification required to continue'
  });
};
