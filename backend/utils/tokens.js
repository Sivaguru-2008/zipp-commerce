// Access + refresh JWT helpers.
//
// Access token (short-lived, 15m) — carried in the `zipp_at` HttpOnly cookie.
// Refresh token (long-lived, 30d) — carried in `zipp_rt`, scoped to /api/auth.
//
// Refresh tokens are tracked in the RefreshToken collection by `jti`. We
// verify the JWT signature AND that the jti is still active; logout / rotate
// deletes the jti so a stolen refresh JWT becomes unusable.

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const ACCESS_EXPIRES = process.env.ACCESS_TOKEN_EXPIRES_IN || '15m';
const REFRESH_EXPIRES = process.env.REFRESH_TOKEN_EXPIRES_IN || '30d';

// Refresh tokens use a distinct secret when configured so a leaked access
// token signing key can't be used to mint refresh tokens, and vice versa.
function refreshSecret() {
  return process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
}

function signAccessToken(userId) {
  return jwt.sign({ id: String(userId), typ: 'access' }, process.env.JWT_SECRET, {
    expiresIn: ACCESS_EXPIRES
  });
}

function signRefreshToken(userId, jti) {
  return jwt.sign({ id: String(userId), jti, typ: 'refresh' }, refreshSecret(), {
    expiresIn: REFRESH_EXPIRES
  });
}

function verifyAccessToken(token) {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  // Reject refresh tokens being used as access tokens. Legacy tokens (issued
  // before the typ claim existed) have no `typ` and are still accepted.
  if (decoded.typ && decoded.typ !== 'access') {
    throw new Error('Wrong token type');
  }
  return decoded;
}

function verifyRefreshToken(token) {
  const decoded = jwt.verify(token, refreshSecret());
  if (decoded.typ !== 'refresh') {
    throw new Error('Wrong token type');
  }
  return decoded;
}

function newJti() {
  return crypto.randomUUID();
}

// Approximate refresh-token TTL in ms, for setting cookie maxAge and the
// RefreshToken doc's expiresAt. Express jwt expiresIn accepts a string like
// '30d', so we parse it here to keep both stores aligned.
function refreshTtlMs() {
  const v = REFRESH_EXPIRES;
  if (/^\d+$/.test(v)) return +v * 1000;            // raw seconds
  const m = /^(\d+)\s*([smhdw])$/.exec(v);
  if (!m) return 30 * 24 * 60 * 60 * 1000;          // safe default 30d
  const n = +m[1];
  const u = { s: 1e3, m: 60e3, h: 3600e3, d: 86400e3, w: 7 * 86400e3 }[m[2]];
  return n * u;
}

function accessTtlMs() {
  const v = ACCESS_EXPIRES;
  if (/^\d+$/.test(v)) return +v * 1000;
  const m = /^(\d+)\s*([smhdw])$/.exec(v);
  if (!m) return 15 * 60 * 1000;
  const n = +m[1];
  const u = { s: 1e3, m: 60e3, h: 3600e3, d: 86400e3, w: 7 * 86400e3 }[m[2]];
  return n * u;
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  newJti,
  refreshTtlMs,
  accessTtlMs,
  ACCESS_EXPIRES,
  REFRESH_EXPIRES
};
