const { Order, Cart } = require('../models');
const Product = require('../models/Product');

exports.countByUser = (userId)             => Order.countDocuments({ user: userId });

exports.findByUser  = (userId, { limit, skip }) =>
  Order.find({ user: userId })
    .sort('-createdAt')
    .populate('items.product', 'name images')
    .limit(limit)
    .skip(skip);

exports.findById    = (id) =>
  Order.findById(id).populate('items.product', 'name images brand');

exports.findRawById = (id) => Order.findById(id);
exports.create      = (data) => Order.create(data);
exports.deleteById  = (id) => Order.findByIdAndDelete(id);

exports.countAll    = (filter) => Order.countDocuments(filter);
exports.findAll     = (filter, { limit, skip }) =>
  Order.find(filter)
    .sort('-createdAt')
    .populate('user', 'name email phone')
    .limit(limit)
    .skip(skip);

exports.findCartWithProducts = (userId) =>
  Cart.findOne({ user: userId }).populate('items.product');

exports.clearCart = (userId) =>
  Cart.findOneAndUpdate({ user: userId }, { items: [], coupon: null });

// Atomic decrement — returns null when current stock is below requested qty
// so callers can detect contention and roll the order back.
exports.decrementStockIfAvailable = (productId, quantity) =>
  Product.findOneAndUpdate(
    { _id: productId, stock: { $gte: quantity } },
    { $inc: { stock: -quantity, soldCount: quantity } }
  );

exports.restoreStock = (productId, quantity) =>
  Product.findByIdAndUpdate(productId, {
    $inc: { stock: quantity, soldCount: -quantity }
  });
