const mongoose = require('mongoose');

const variantSchema = new mongoose.Schema({
  name: String,
  value: String,
  price: Number,
  mrp: Number,
  stock: Number,
  sku: String
});

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, unique: true },
  description: { type: String, default: '' },
  shortDescription: { type: String, default: '' },
  brand: { type: String, default: 'Generic' },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  subcategory: { type: String, default: '' },
  images: [{ type: String }],
  price: { type: Number, required: true, min: 0 },
  mrp: { type: Number, required: true, min: 0 },
  discount: { type: Number, default: 0 },
  unit: { type: String, default: '1 pc' },
  stock: { type: Number, default: 0, min: 0 },
  minOrderQty: { type: Number, default: 1 },
  maxOrderQty: { type: Number, default: 10 },
  variants: [variantSchema],
  tags: [String],
  badges: [{ type: String }],
  isActive: { type: Boolean, default: true },
  isFeatured: { type: Boolean, default: false },
  rating: { type: Number, default: 0, min: 0, max: 5 },
  reviewCount: { type: Number, default: 0 },
  soldCount: { type: Number, default: 0 },
  warehouse: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' },
  deliveryTime: { type: String, default: '10-20 mins' },
  weight: Number,
  dimensions: { l: Number, w: Number, h: Number },
  nutritionInfo: mongoose.Schema.Types.Mixed,
  expiryDays: Number,
  country: { type: String, default: 'India' },
  taxRate: { type: Number, default: 5 }
}, { timestamps: true });

productSchema.pre('save', function(next) {
  if (!this.slug) {
    const base = this.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    this.slug = base + '-' + Date.now().toString(36);
  }
  if (this.mrp > 0) {
    this.discount = Math.round(((this.mrp - this.price) / this.mrp) * 100);
  }
  next();
});

productSchema.index({ name: 'text', description: 'text', brand: 'text', tags: 'text' });
productSchema.index({ category: 1, isActive: 1, price: 1 });

module.exports = mongoose.model('Product', productSchema);
