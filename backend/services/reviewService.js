const ApiError = require('../utils/ApiError');
const productService = require('./productService');
const repo = require('../repositories/reviewRepository');

exports.listForProduct = (productId) => repo.listByProduct(productId);

exports.create = async (userId, { productId, rating, title, comment, orderId }) => {
  const existing = await repo.findOne({ product: productId, user: userId });
  if (existing) throw new ApiError(400, 'Already reviewed');

  const review = await repo.create({
    product: productId, user: userId, order: orderId, rating, title, comment
  });

  // Recompute aggregate so product cards stay accurate.
  const all = await repo.allForProduct(productId);
  const avg = all.reduce((s, r) => s + r.rating, 0) / all.length;
  await repo.updateProductRating(productId, avg.toFixed(1), all.length);

  // Bust product detail cache so the new rating is visible.
  await productService.invalidate();
  return review;
};
