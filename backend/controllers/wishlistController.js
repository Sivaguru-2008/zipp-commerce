const wishlistService = require('../services/wishlistService');

exports.get = async (req, res) => {
  const products = await wishlistService.get(req.user._id);
  res.json({ success: true, products });
};

exports.toggle = async (req, res) => {
  const { productId } = req.body;
  const { added } = await wishlistService.toggle(req.user._id, productId);
  res.json({
    success: true,
    added,
    message: added ? 'Added to wishlist' : 'Removed from wishlist'
  });
};

exports.remove = async (req, res) => {
  await wishlistService.remove(req.user._id, req.params.productId);
  res.json({ success: true, message: 'Removed from wishlist' });
};
