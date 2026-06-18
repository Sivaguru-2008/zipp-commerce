// Cookie helpers for the auth flow.
//
// Two cookies:
//   zipp_at — access JWT, HttpOnly, path=/, ~15 min
//   zipp_rt — refresh JWT, HttpOnly, path=/api/auth (scope-restricted), ~30 d
//
// SameSite=Lax is sufficient CSRF protection for our flows (no cross-site
// POSTs need cookies). In production with HTTPS we set Secure=true; on
// localhost dev we don't (browsers reject Secure on http). The frontend
// always sends credentials: 'include' on fetch.

const { accessTtlMs, refreshTtlMs } = require('./tokens');

const ACCESS_COOKIE  = 'zipp_at';
const REFRESH_COOKIE = 'zipp_rt';

function isProd() {
  return process.env.NODE_ENV === 'production';
}

function baseOpts() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    // `secure: true` requires HTTPS — browsers silently drop the cookie on
    // http://localhost otherwise. Only enable in production.
    secure: isProd(),
    // Render / proxies set the host; let the browser scope to current host.
    domain: process.env.COOKIE_DOMAIN || undefined
  };
}

function setAccessCookie(res, token) {
  res.cookie(ACCESS_COOKIE, token, {
    ...baseOpts(),
    path: '/',
    maxAge: accessTtlMs()
  });
}

function setRefreshCookie(res, token) {
  res.cookie(REFRESH_COOKIE, token, {
    ...baseOpts(),
    // Limit refresh-cookie scope: only /api/auth endpoints ever see it. This
    // means XHR to /api/products etc. never carries it, lowering exposure.
    path: '/api/auth',
    maxAge: refreshTtlMs()
  });
}

function setAuthCookies(res, { accessToken, refreshToken }) {
  if (accessToken)  setAccessCookie(res, accessToken);
  if (refreshToken) setRefreshCookie(res, refreshToken);
}

function clearAuthCookies(res) {
  // Mirror the same Path/Domain/sameSite so the browser actually deletes them.
  const access  = { ...baseOpts(), path: '/' };
  const refresh = { ...baseOpts(), path: '/api/auth' };
  res.clearCookie(ACCESS_COOKIE,  access);
  res.clearCookie(REFRESH_COOKIE, refresh);
}

module.exports = {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  setAccessCookie,
  setRefreshCookie,
  setAuthCookies,
  clearAuthCookies
};
