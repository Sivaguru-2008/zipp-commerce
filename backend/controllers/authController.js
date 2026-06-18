const authService = require('../services/authService');
const analytics = require('../utils/analytics');
const { setAuthCookies, clearAuthCookies, REFRESH_COOKIE } = require('../utils/cookies');

function reqMeta(req) {
  return { userAgent: req.get('user-agent'), ip: req.ip };
}

exports.register = async (req, res) => {
  const { name, email, password, phone } = req.body;
  const { accessToken, refreshToken, user } = await authService.register(
    { name, email, password, phone },
    reqMeta(req)
  );
  setAuthCookies(res, { accessToken, refreshToken });
  // Body `token` retained for backwards-compat with clients still reading
  // localStorage. New clients ignore it and rely on the cookie.
  res.status(201).json({
    success: true,
    message: 'Account created successfully',
    token: accessToken,
    user
  });
};

exports.login = async (req, res) => {
  const { email, password } = req.body;
  const { accessToken, refreshToken, user } = await authService.login(
    { email, password },
    reqMeta(req)
  );
  setAuthCookies(res, { accessToken, refreshToken });
  // Best-effort analytics increment; never blocks the response.
  analytics.incrementLogin(user._id).catch(() => {});
  res.json({
    success: true,
    message: 'Login successful',
    token: accessToken,
    user
  });
};

exports.refresh = async (req, res) => {
  // Refresh cookie path is restricted to /api/auth so it should always be
  // present here; fall back to body for legacy / non-browser clients.
  const raw = (req.cookies && req.cookies[REFRESH_COOKIE]) || req.body.refreshToken;
  const { accessToken, refreshToken, user } = await authService.rotateRefresh(raw, reqMeta(req));
  setAuthCookies(res, { accessToken, refreshToken });
  res.json({ success: true, token: accessToken, user });
};

exports.logout = async (req, res) => {
  const raw = (req.cookies && req.cookies[REFRESH_COOKIE]) || req.body.refreshToken;
  await authService.logout(raw);
  clearAuthCookies(res);
  res.json({ success: true, message: 'Logged out' });
};

exports.logoutAll = async (req, res) => {
  await authService.logoutAll(req.user._id);
  clearAuthCookies(res);
  res.json({ success: true, message: 'All sessions ended' });
};

exports.me = async (req, res) => {
  const user = await authService.me(req.user._id);
  res.json({ success: true, user });
};

exports.changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  await authService.changePassword(req.user._id, currentPassword, newPassword);
  // Force re-login on this device too: clear cookies.
  clearAuthCookies(res);
  res.json({ success: true, message: 'Password changed successfully' });
};
