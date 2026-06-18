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

exports.findCartWithProducts = (userId, session) =>
  Cart.findOne({ user: userId }).session(session || null).populate('items.product');

exports.clearCart = (userId, session) =>
  Cart.findOneAndUpdate(
    { user: userId },
    { items: [], coupon: null },
    { session: session || null }
  );

// Atomic decrement — returns null when current stock is below requested qty
// so callers can detect contention and roll the order back. When a session
// is passed the decrement participates in the surrounding transaction.
exports.decrementStockIfAvailable = (productId, quantity, session) =>
  Product.findOneAndUpdate(
    { _id: productId, stock: { $gte: quantity } },
    { $inc: { stock: -quantity, soldCount: quantity } },
    { session: session || null }
  );

exports.restoreStock = (productId, quantity, session) =>
  Product.findByIdAndUpdate(productId, {
    $inc: { stock: quantity, soldCount: -quantity }
  }, { session: session || null });

// Transactional create — `create([doc], { session })` is the Mongoose
// idiom for participating in a transaction (the single-arg form bypasses it).
exports.createInSession = async (data, session) => {
  if (!session) return Order.create(data);
  const [doc] = await Order.create([data], { session });
  return doc;
};
