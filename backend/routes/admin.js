const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const { Order, Coupon, Warehouse } = require('../models/index');
const User = require('../models/User');
const Product = require('../models/Product');
const Category = require('../models/Category');

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// GET /api/admin/stats
router.get('/stats', protect, adminOnly, async (req, res) => {
  try {
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
    const todayOrders = await Order.countDocuments({ createdAt: { $gte: todayStart } });
    const todayRevenue = await Order.aggregate([
      { $match: { createdAt: { $gte: todayStart }, status: { $ne: 'cancelled' } } },
      { $group: { _id: null, total: { $sum: '$pricing.total' } } }
    ]);

    const ordersByStatus = await Order.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    const last7Days = await Order.aggregate([
      { $match: { createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 }, revenue: { $sum: '$pricing.total' } } },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      success: true,
      stats: {
        totalOrders, totalUsers, totalProducts,
        totalRevenue: totalRevenue[0]?.total || 0,
        todayOrders,
        todayRevenue: todayRevenue[0]?.total || 0,
        ordersByStatus, last7Days, recentOrders
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/admin/users
router.get('/users', protect, adminOnly, async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const query = search
      ? { $or: [{ name: new RegExp(escapeRegex(search), 'i') }, { email: new RegExp(escapeRegex(search), 'i') }] }
      : {};
    const total = await User.countDocuments(query);
    const users = await User.find(query).select('-password').sort('-createdAt').limit(+limit).skip((+page - 1) * +limit);
    res.json({ success: true, users, total });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/admin/orders
router.get('/orders', protect, adminOnly, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    const query = {};
    if (status) query.status = status;
    if (search) query.orderNumber = new RegExp(escapeRegex(search), 'i');
    const total = await Order.countDocuments(query);
    const orders = await Order.find(query).sort('-createdAt').populate('user', 'name email phone').limit(+limit).skip((+page - 1) * +limit);
    res.json({ success: true, orders, total });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/admin/orders/:id/status
router.put('/orders/:id/status', protect, adminOnly, async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    order.status = status;
    order.statusHistory.push({ status, message: `Order ${status} by admin`, timestamp: new Date() });
    if (status === 'delivered') { order.deliveredAt = new Date(); order.payment.status = 'paid'; }
    await order.save();
    res.json({ success: true, order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/admin/products
router.get('/products', protect, adminOnly, async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const query = search ? { name: new RegExp(escapeRegex(search), 'i') } : {};
    const total = await Product.countDocuments(query);
    const products = await Product.find(query).sort('-createdAt').populate('category', 'name').limit(+limit).skip((+page - 1) * +limit);
    res.json({ success: true, products, total });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/admin/inventory
router.get('/inventory', protect, adminOnly, async (req, res) => {
  try {
    const lowStock = await Product.find({ stock: { $lte: 10 }, isActive: true }).populate('category', 'name').sort('stock');
    const outOfStock = await Product.find({ stock: 0, isActive: true }).populate('category', 'name');
    res.json({ success: true, lowStock, outOfStock, lowStockCount: lowStock.length, outOfStockCount: outOfStock.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/admin/inventory/:id
router.put('/inventory/:id', protect, adminOnly, async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, { stock: req.body.stock }, { new: true });
    res.json({ success: true, product });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/admin/warehouses
router.get('/warehouses', protect, adminOnly, async (req, res) => {
  try {
    const warehouses = await Warehouse.find().sort('-createdAt');
    res.json({ success: true, warehouses });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/admin/warehouses
router.post('/warehouses', protect, adminOnly, async (req, res) => {
  try {
    const warehouse = await Warehouse.create(req.body);
    res.status(201).json({ success: true, warehouse });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/admin/coupons
router.get('/coupons', protect, adminOnly, async (req, res) => {
  try {
    const coupons = await Coupon.find().sort('-createdAt');
    res.json({ success: true, coupons });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
