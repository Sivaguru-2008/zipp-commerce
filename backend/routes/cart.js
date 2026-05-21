const express = require('express');
const router = express.Router();
const { Cart } = require('../models/index');
const Product = require('../models/Product');
const { protect } = require('../middleware/auth');

// GET /api/cart
router.get('/', protect, async (req, res) => {
  try {
    let cart = await Cart.findOne({ user: req.user._id }).populate('items.product', 'name price mrp images stock isActive deliveryTime');
    if (!cart) cart = await Cart.create({ user: req.user._id, items: [] });
    // Filter out inactive products
    cart.items = cart.items.filter(item => item.product && item.product.isActive);
    const subtotal = cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    res.json({ success: true, cart, subtotal, itemCount: cart.items.reduce((s, i) => s + i.quantity, 0) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/cart/add
router.post('/add', protect, async (req, res) => {
  try {
    const { productId, quantity = 1 } = req.body;
    const product = await Product.findById(productId);
    if (!product || !product.isActive) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    if (product.stock < quantity) {
      return res.status(400).json({ success: false, message: 'Insufficient stock' });
    }
    let cart = await Cart.findOne({ user: req.user._id });
    if (!cart) cart = new Cart({ user: req.user._id, items: [] });
    const existingItem = cart.items.find(i => i.product.toString() === productId);
    if (existingItem) {
      const newQty = existingItem.quantity + quantity;
      if (newQty > product.maxOrderQty) {
        return res.status(400).json({ success: false, message: `Max ${product.maxOrderQty} items allowed` });
      }
      existingItem.quantity = newQty;
    } else {
      cart.items.push({ product: productId, quantity, price: product.price, name: product.name, image: product.images[0] || '' });
    }
    await cart.save();
    const itemCount = cart.items.reduce((s, i) => s + i.quantity, 0);
    res.json({ success: true, message: 'Added to cart', itemCount, cart });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/cart/update
router.put('/update', protect, async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) return res.status(404).json({ success: false, message: 'Cart not found' });
    if (quantity <= 0) {
      cart.items = cart.items.filter(i => i.product.toString() !== productId);
    } else {
      const item = cart.items.find(i => i.product.toString() === productId);
      if (item) item.quantity = quantity;
    }
    await cart.save();
    const subtotal = cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    res.json({ success: true, cart, subtotal, itemCount: cart.items.reduce((s, i) => s + i.quantity, 0) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/cart/remove/:productId
router.delete('/remove/:productId', protect, async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) return res.status(404).json({ success: false, message: 'Cart not found' });
    cart.items = cart.items.filter(i => i.product.toString() !== req.params.productId);
    await cart.save();
    res.json({ success: true, message: 'Item removed', itemCount: cart.items.reduce((s, i) => s + i.quantity, 0) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/cart/clear
router.delete('/clear', protect, async (req, res) => {
  try {
    await Cart.findOneAndUpdate({ user: req.user._id }, { items: [], coupon: null });
    res.json({ success: true, message: 'Cart cleared' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
