const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { Wishlist } = require('../models/index');

// GET /api/wishlist
router.get('/', protect, async (req, res) => {
  try {
    let wishlist = await Wishlist.findOne({ user: req.user._id }).populate('products');
    if (!wishlist) wishlist = { products: [] };
    res.json({ success: true, products: wishlist.products });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/wishlist/toggle
router.post('/toggle', protect, async (req, res) => {
  try {
    const { productId } = req.body;
    let wishlist = await Wishlist.findOne({ user: req.user._id });
    if (!wishlist) wishlist = new Wishlist({ user: req.user._id, products: [] });

    const idx = wishlist.products.findIndex(p => p.toString() === productId);
    let added = false;
    if (idx === -1) {
      wishlist.products.push(productId);
      added = true;
    } else {
      wishlist.products.splice(idx, 1);
    }
    await wishlist.save();
    res.json({ success: true, added, message: added ? 'Added to wishlist' : 'Removed from wishlist' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/wishlist/:productId
router.delete('/:productId', protect, async (req, res) => {
  try {
    await Wishlist.findOneAndUpdate(
      { user: req.user._id },
      { $pull: { products: req.params.productId } }
    );
    res.json({ success: true, message: 'Removed from wishlist' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
