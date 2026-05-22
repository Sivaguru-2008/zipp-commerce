const { Review } = require('../models');
const Product = require('../models/Product');

exports.listByProduct = (productId) =>
  Review.find({ product: productId }).populate('user', 'name avatar').sort('-createdAt');

exports.findOne = (filter)            => Review.findOne(filter);
exports.create  = (data)              => Review.create(data);
exports.allForProduct = (productId)   => Review.find({ product: productId });

exports.updateProductRating = (productId, rating, count) =>
  Product.findByIdAndUpdate(productId, { rating, reviewCount: count });
