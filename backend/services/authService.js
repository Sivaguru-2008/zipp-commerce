const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const sentry = require('../utils/sentry');
const userRepo = require('../repositories/userRepository');
const RefreshToken = require('../models/RefreshToken');
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  newJti,
  refreshTtlMs
} = require('../utils/tokens');

const publicUser = (u) => ({
  _id: u._id, name: u.name, email: u.email, role: u.role, phone: u.phone, avatar: u.avatar,
  isVerified: u.isVerified
});

// Issues an access + refresh pair and persists the refresh jti so it can be
// rotated / revoked later. `meta` lets the controller record UA + IP.
async function issueTokens(userId, meta = {}) {
  const jti = newJti();
  await RefreshToken.create({
    jti,
    user: userId,
    userAgent: meta.userAgent,
    ip: meta.ip,
    expiresAt: new Date(Date.now() + refreshTtlMs())
  });
  return {
    accessToken: signAccessToken(userId),
    refreshToken: signRefreshToken(userId, jti),
    jti
  };
}

exports.issueTokens = issueTokens;
exports.publicUser = publicUser;

exports.register = async ({ name, email, password, phone }, meta = {}) => {
  if (await userRepo.findByEmail(email)) {
    throw new ApiError(400, 'Email already registered');
  }
  const user = await userRepo.create({ name, email, password, phone });

  // Best-effort; cart/wishlist routes also lazy-init on first access.
  try {
    await userRepo.preCreateUserData(user._id);
  } catch (e) {
    logger.warn({ userId: user._id, err: e.message }, 'Failed to pre-create cart/wishlist; will lazy-init');
  }

  const tokens = await issueTokens(user._id, meta);
  return { ...tokens, user: publicUser(user) };
};

exports.login = async ({ email, password }, meta = {}) => {
  const user = await userRepo.findByEmail(email);
  if (!user || !(await user.comparePassword(password))) {
    throw new ApiError(401, 'Invalid email or password');
  }
  await userRepo.touchLastLogin(user);
  const tokens = await issueTokens(user._id, meta);
  return { ...tokens, user: publicUser(user) };
};

// Refresh-token rotation: delete the old jti as soon as we mint a new one.
// If the same refresh token shows up twice (replay), the second call finds
// no row and is rejected — strong protection against stolen refresh tokens.
exports.rotateRefresh = async (rawRefresh, meta = {}) => {
  if (!rawRefresh) throw new ApiError(401, 'Missing refresh token');
  let decoded;
  try {
    decoded = verifyRefreshToken(rawRefresh);
  } catch {
    throw new ApiError(401, 'Invalid refresh token');
  }
  const existing = await RefreshToken.findOneAndDelete({ jti: decoded.jti });
  if (!existing) {
    // jti not found → already rotated or revoked. Treat as replay attack and
    // kill all sessions for this user to be safe.
    await RefreshToken.deleteMany({ user: decoded.id }).catch(() => {});
    sentry.captureMessage('Refresh token replay detected', 'warning', {
      tags: { stage: 'auth.refresh' },
      extra: { userId: String(decoded.id), jti: decoded.jti }
    });
    throw new ApiError(401, 'Refresh token revoked');
  }
  if (existing.expiresAt && existing.expiresAt < new Date()) {
    throw new ApiError(401, 'Refresh token expired');
  }

  const user = await userRepo.findByIdSafe(decoded.id);
  if (!user || user.isActive === false) {
    throw new ApiError(401, 'User unavailable');
  }

  const tokens = await issueTokens(user._id, meta);
  return { ...tokens, user: publicUser(user) };
};

exports.logout = async (rawRefresh) => {
  if (!rawRefresh) return;
  try {
    const decoded = verifyRefreshToken(rawRefresh);
    await RefreshToken.deleteOne({ jti: decoded.jti });
  } catch {
    // Bad / expired refresh token — nothing to revoke. Logout still succeeds
    // from the client's perspective.
  }
};

exports.logoutAll = async (userId) => {
  await RefreshToken.deleteMany({ user: userId });
};

exports.me = (userId) => userRepo.findByIdSafe(userId);

exports.changePassword = async (userId, currentPassword, newPassword) => {
  const user = await userRepo.findById(userId);
  if (!(await user.comparePassword(currentPassword))) {
    throw new ApiError(400, 'Current password incorrect');
  }
  user.password = newPassword;
  await userRepo.save(user);
  // Password change → invalidate every existing refresh session.
  await RefreshToken.deleteMany({ user: userId }).catch(() => {});
};
