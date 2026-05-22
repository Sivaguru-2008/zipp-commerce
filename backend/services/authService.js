const jwt = require('jsonwebtoken');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const userRepo = require('../repositories/userRepository');

const generateToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });

const publicUser = (u) => ({
  _id: u._id, name: u.name, email: u.email, role: u.role, phone: u.phone, avatar: u.avatar
});

exports.register = async ({ name, email, password, phone }) => {
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

  return { token: generateToken(user._id), user: publicUser(user) };
};

exports.login = async ({ email, password }) => {
  const user = await userRepo.findByEmail(email);
  if (!user || !(await user.comparePassword(password))) {
    throw new ApiError(401, 'Invalid email or password');
  }
  await userRepo.touchLastLogin(user);
  return { token: generateToken(user._id), user: publicUser(user) };
};

exports.me = (userId) => userRepo.findByIdSafe(userId);

exports.changePassword = async (userId, currentPassword, newPassword) => {
  const user = await userRepo.findById(userId);
  if (!(await user.comparePassword(currentPassword))) {
    throw new ApiError(400, 'Current password incorrect');
  }
  user.password = newPassword;
  await userRepo.save(user);
};
