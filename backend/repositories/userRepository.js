const User = require('../models/User');
const { Cart, Wishlist } = require('../models');
const { escapeRegex } = require('../utils/regex');

// Encapsulates all User-collection access. Services never touch the model
// directly — they go through these methods so query shape is one place.

exports.findByEmail        = (email)             => User.findOne({ email });
exports.findById           = (id)                => User.findById(id);
exports.findByIdSafe       = (id)                => User.findById(id).select('-password');

exports.create             = (data)              => User.create(data);
exports.touchLastLogin     = (user)              => { user.lastLogin = new Date(); return user.save(); };
exports.save               = (user)              => user.save();

// Pre-seed empty cart + wishlist so the new user has a complete data
// footprint. Failures are tolerated; routes lazy-init on first access.
exports.preCreateUserData  = (userId)            => Promise.all([
  Cart.create({ user: userId, items: [] }),
  Wishlist.create({ user: userId, products: [] })
]);

exports.updateProfile = (userId, fields) =>
  User.findByIdAndUpdate(userId, fields, { new: true, runValidators: true }).select('-password');

// Admin list with optional escaped-regex search across name + email.
exports.search = async ({ page, limit, search }) => {
  const p = +page || 1;
  const l = +limit || 20;
  let query = {};
  if (search) {
    const escaped = escapeRegex(search);
    query = { $or: [{ name: new RegExp(escaped, 'i') }, { email: new RegExp(escaped, 'i') }] };
  }
  const [total, users] = await Promise.all([
    User.countDocuments(query),
    User.find(query).select('-password').sort('-createdAt').limit(l).skip((p - 1) * l)
  ]);
  return { users, total, page: p, pages: Math.ceil(total / l) };
};
