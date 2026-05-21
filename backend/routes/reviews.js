const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { Review } = require('../models/index');
const Product = require('../models/Product');

// GET /api/reviews/:productId
router.get('/:productId', async (req, res) => {
  try {
    const reviews = await Review.find({ product: req.params.productId }).populate('user', 'name avatar').sort('-createdAt');
    res.json({ success: true, reviews });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/reviews
router.post('/', protect, async (req, res) => {
  try {
    const { productId, rating, title, comment, orderId } = req.body;
    const existing = await Review.findOne({ product: productId, user: req.user._id });
    if (existing) return res.status(400).json({ success: false, message: 'Already reviewed' });
    const review = await Review.create({ product: productId, user: req.user._id, order: orderId, rating, title, comment });
    
    // Update product rating
    const reviews = await Review.find({ product: productId });
    const avgRating = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
    await Product.findByIdAndUpdate(productId, { rating: avgRating.toFixed(1), reviewCount: reviews.length });
    
    res.status(201).json({ success: true, review });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
