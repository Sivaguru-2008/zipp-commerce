const { Cart } = require('../models');

// Atomic upsert avoids the race where two parallel first-GETs each create a
// new cart for the same user.
exports.findOrCreate = (userId) =>
  Cart.findOneAndUpdate(
    { user: userId },
    { $setOnInsert: { user: userId, items: [] } },
    { upsert: true, new: true }
  ).populate('items.product', 'name price mrp images stock isActive deliveryTime');

exports.findRaw = (userId) => Cart.findOne({ user: userId });

exports.clear   = (userId) => Cart.findOneAndUpdate({ user: userId }, { items: [], coupon: null });
