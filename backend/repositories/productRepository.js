const mongoose = require('mongoose');
const Product = require('../models/Product');

const isObjectId = (s) => mongoose.Types.ObjectId.isValid(s) && /^[a-f\d]{24}$/i.test(String(s));

// Fields the listing UI actually renders. Skipping description/nutrition cuts
// payload size by 30-60% on the products list — meaningful on slow networks.
const LIST_FIELDS =
  'name slug brand category subcategory price mrp discount unit stock images '
  + 'badges deliveryTime rating reviewCount isFeatured soldCount';

exports.findList = async ({ filter, sort, limit, skip }) => {
  const [total, products] = await Promise.all([
    Product.countDocuments(filter),
    Product.find(filter)
      .select(LIST_FIELDS)
      .populate('category', 'name slug')
      .sort(sort)
      .limit(limit)
      .skip(skip)
      .lean()
  ]);
  return { total, products };
};

exports.search = (filter, limit) =>
  Product.find(filter)
    .limit(limit)
    .select('name slug price mrp images brand discount deliveryTime stock')
    .lean();

exports.findFeatured = () =>
  Product.find({ isActive: true, isFeatured: true })
    .select(LIST_FIELDS)
    .populate('category', 'name')
    .limit(12)
    .lean();

exports.findTrending = () =>
  Product.find({ isActive: true, stock: { $gt: 0 } })
    .select(LIST_FIELDS)
    .sort('-soldCount')
    .limit(12)
    .populate('category', 'name')
    .lean();

// Accepts either a Mongo ObjectId or a slug — single endpoint handles both
// so the existing frontend (uses :id) keeps working while we can also call
// /products/<slug>.
exports.findByIdOrSlug = (idOrSlug) => {
  const query = isObjectId(idOrSlug) ? { _id: idOrSlug } : { slug: idOrSlug };
  return Product.findOne(query)
    .populate('category', 'name slug')
    .populate('warehouse', 'name coordinates');
};

exports.create   = (data)        => Product.create(data);
exports.update   = (id, data)    => Product.findByIdAndUpdate(id, data, { new: true });
exports.softDelete = (id)        => Product.findByIdAndUpdate(id, { isActive: false });
exports.findRawById = (id)       => Product.findById(id);

exports.isObjectId = isObjectId;
