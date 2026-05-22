const reviewService = require('../services/reviewService');

exports.listForProduct = async (req, res) => {
  const reviews = await reviewService.listForProduct(req.params.productId);
  res.json({ success: true, reviews });
};

exports.create = async (req, res) => {
  const review = await reviewService.create(req.user._id, req.body);
  res.status(201).json({ success: true, review });
};
