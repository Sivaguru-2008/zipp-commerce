const express = require('express');
const router = express.Router();

const { protect, adminOnly } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { Order, Coupon, Warehouse } = require('../models');
const User = require('../models/User');
const Product = require('../models/Product');
const { escapeRegex } = require('../utils/regex');
const productService = require('../services/productService');

router.use(protect, adminOnly);

// GET /api/admin/stats — dashboard rollup
router.get('/stats', asyncHandler(async (req, res) => {
  const [totalOrders, totalUsers, totalProducts, totalRevenue, recentOrders] = await Promise.all([
    Order.countDocuments(),
    User.countDocuments({ role: 'user' }),
    Product.countDocuments({ isActive: true }),
    Order.aggregate([
      { $match: { status: { $ne: 'cancelled' } } },
      { $group: { _id: null, total: { $sum: '$pricing.total' } } }
    ]),
    Order.find().sort('-createdAt').limit(5).populate('user', 'name email')
  ]);

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const [todayOrders, todayRevenueRes, ordersByStatus, last7Days] = await Promise.all([
    Order.countDocuments({ createdAt: { $gte: todayStart } }),
    Order.aggregate([
      { $match: { createdAt: { $gte: todayStart }, status: { $ne: 'cancelled' } } },
      { $group: { _id: null, total: { $sum: '$pricing.total' } } }
    ]),
    Order.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Order.aggregate([
      { $match: { createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } },
      { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
          revenue: { $sum: '$pricing.total' }
      } },
      { $sort: { _id: 1 } }
    ])
  ]);

  res.json({
    success: true,
    stats: {
      totalOrders, totalUsers, totalProducts,
      totalRevenue: totalRevenue[0]?.total || 0,
      todayOrders,
      todayRevenue: todayRevenueRes[0]?.total || 0,
      ordersByStatus, last7Days, recentOrders
    }
  });
}));

router.get('/users', asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, search } = req.query;
  const query = search
    ? { $or: [{ name: new RegExp(escapeRegex(search), 'i') }, { email: new RegExp(escapeRegex(search), 'i') }] }
    : {};
  const [total, users] = await Promise.all([
    User.countDocuments(query),
    User.find(query).select('-password').sort('-createdAt').limit(+limit).skip((+page - 1) * +limit)
  ]);
  res.json({ success: true, users, total });
}));

router.get('/orders', asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status, search } = req.query;
  const query = {};
  if (status) query.status = status;
  if (search) query.orderNumber = new RegExp(escapeRegex(search), 'i');
  const [total, orders] = await Promise.all([
    Order.countDocuments(query),
    Order.find(query).sort('-createdAt').populate('user', 'name email phone').limit(+limit).skip((+page - 1) * +limit)
  ]);
  res.json({ success: true, orders, total });
}));

router.put('/orders/:id/status', asyncHandler(async (req, res) => {
  const { status } = req.body;
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
  order.status = status;
  order.statusHistory.push({ status, message: `Order ${status} by admin`, timestamp: new Date() });
  if (status === 'delivered') { order.deliveredAt = new Date(); order.payment.status = 'paid'; }
  await order.save();
  res.json({ success: true, order });
}));

router.get('/products', asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, search } = req.query;
  const query = search ? { name: new RegExp(escapeRegex(search), 'i') } : {};
  const [total, products] = await Promise.all([
    Product.countDocuments(query),
    Product.find(query).sort('-createdAt').populate('category', 'name').limit(+limit).skip((+page - 1) * +limit)
  ]);
  res.json({ success: true, products, total });
}));

router.get('/inventory', asyncHandler(async (req, res) => {
  const [lowStock, outOfStock] = await Promise.all([
    Product.find({ stock: { $lte: 10 }, isActive: true }).populate('category', 'name').sort('stock'),
    Product.find({ stock: 0, isActive: true }).populate('category', 'name')
  ]);
  res.json({ success: true, lowStock, outOfStock, lowStockCount: lowStock.length, outOfStockCount: outOfStock.length });
}));

router.put('/inventory/:id', asyncHandler(async (req, res) => {
  const product = await Product.findByIdAndUpdate(req.params.id, { stock: req.body.stock }, { new: true });
  await productService.invalidate();
  res.json({ success: true, product });
}));

router.get('/warehouses', asyncHandler(async (req, res) => {
  const warehouses = await Warehouse.find().sort('-createdAt');
  res.json({ success: true, warehouses });
}));

router.post('/warehouses', asyncHandler(async (req, res) => {
  const warehouse = await Warehouse.create(req.body);
  res.status(201).json({ success: true, warehouse });
}));

router.get('/coupons', asyncHandler(async (req, res) => {
  const coupons = await Coupon.find().sort('-createdAt');
  res.json({ success: true, coupons });
}));

module.exports = router;
