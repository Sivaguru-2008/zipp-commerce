const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const { Order, Cart } = require('../models/index');
const Product = require('../models/Product');

// GET /api/orders - user orders
router.get('/', protect, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id }).sort('-createdAt').populate('items.product', 'name images');
    res.json({ success: true, orders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/orders/:id
router.get('/:id', protect, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate('items.product', 'name images brand');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (order.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }
    res.json({ success: true, order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/orders - place order
router.post('/', protect, async (req, res) => {
  try {
    const { deliveryAddress, paymentMethod = 'cod', deliveryInstructions, coupon } = req.body;
    
    const cart = await Cart.findOne({ user: req.user._id }).populate('items.product');
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart is empty' });
    }

    const items = cart.items.map(item => ({
      product: item.product._id,
      name: item.product.name,
      image: item.product.images[0] || '',
      price: item.price || item.product.price,
      quantity: item.quantity,
      subtotal: (item.price || item.product.price) * item.quantity
    }));

    const subtotal = items.reduce((sum, i) => sum + i.subtotal, 0);
    const deliveryFee = subtotal >= 499 ? 0 : 40;
    const tax = Math.round(subtotal * 0.05);
    const couponDiscount = cart.coupon ? cart.coupon.discount : 0;
    const total = subtotal + deliveryFee + tax - couponDiscount;

    const order = await Order.create({
      user: req.user._id,
      items,
      deliveryAddress,
      pricing: { subtotal, deliveryFee, tax, discount: 0, couponDiscount, total },
      payment: { method: paymentMethod, status: paymentMethod === 'cod' ? 'pending' : 'pending' },
      coupon: cart.coupon,
      deliveryInstructions,
      estimatedDelivery: new Date(Date.now() + 30 * 60 * 1000),
      statusHistory: [{ status: 'placed', message: 'Order placed successfully', timestamp: new Date() }]
    });

    // Update stock
    for (const item of cart.items) {
      await Product.findByIdAndUpdate(item.product._id, {
        $inc: { stock: -item.quantity, soldCount: item.quantity }
      });
    }

    // Clear cart
    await Cart.findOneAndUpdate({ user: req.user._id }, { items: [], coupon: null });

    res.status(201).json({ success: true, message: 'Order placed successfully', order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/orders/:id/cancel
router.put('/:id/cancel', protect, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (order.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }
    if (['delivered', 'cancelled'].includes(order.status)) {
      return res.status(400).json({ success: false, message: 'Cannot cancel this order' });
    }
    order.status = 'cancelled';
    order.cancelledAt = new Date();
    order.cancellationReason = req.body.reason || 'Cancelled by customer';
    order.statusHistory.push({ status: 'cancelled', message: 'Order cancelled', timestamp: new Date() });
    await order.save();
    res.json({ success: true, message: 'Order cancelled', order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/orders/:id/status (admin)
router.put('/:id/status', protect, adminOnly, async (req, res) => {
  try {
    const { status, message } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    order.status = status;
    order.statusHistory.push({ status, message: message || `Order ${status}`, timestamp: new Date() });
    if (status === 'delivered') {
      order.deliveredAt = new Date();
      order.payment.status = 'paid';
    }
    await order.save();
    res.json({ success: true, message: 'Status updated', order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/orders/admin/all (admin)
router.get('/admin/all', protect, adminOnly, async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const query = status ? { status } : {};
    const total = await Order.countDocuments(query);
    const orders = await Order.find(query)
      .sort('-createdAt')
      .populate('user', 'name email phone')
      .limit(+limit)
      .skip((+page - 1) * +limit);
    res.json({ success: true, orders, total });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
