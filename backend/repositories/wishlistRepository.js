const { Wishlist } = require('../models');

exports.findOrCreate = (userId) =>
  Wishlist.findOneAndUpdate(
    { user: userId },
    { $setOnInsert: { user: userId, products: [] } },
    { upsert: true, new: true }
  ).populate('products');

exports.findRaw = (userId) => Wishlist.findOne({ user: userId });

exports.removeProduct = (userId, productId) =>
  Wishlist.findOneAndUpdate({ user: userId }, { $pull: { products: productId } });
