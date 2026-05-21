const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { v2: cloudinary } = require('cloudinary');
const Product = require('../models/Product');
const { protect, adminOnly } = require('../middleware/auth');

// Determine storage backend: Cloudinary if credentials are real, disk otherwise
const CLOUDINARY_CONFIGURED =
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_CLOUD_NAME !== 'your_cloud_name' &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_KEY !== 'your_cloudinary_api_key';

if (CLOUDINARY_CONFIGURED) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
}

// Custom Multer storage engine for Cloudinary v2 (streams file directly, no temp disk write)
const cloudinaryStorage = {
  _handleFile(req, file, cb) {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: 'zipp-products', resource_type: 'auto' },
      (err, result) => {
        if (err) return cb(err);
        cb(null, { path: result.secure_url, filename: result.public_id, size: result.bytes });
      }
    );
    file.stream.pipe(uploadStream);
  },
  _removeFile(req, file, cb) {
    if (file.filename) cloudinary.uploader.destroy(file.filename, cb);
    else cb(null);
  }
};

const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../uploads')),
  filename:    (req, file, cb) => cb(null, 'product-' + Date.now() + path.extname(file.originalname))
});

const upload = multer({
  storage: CLOUDINARY_CONFIGURED ? cloudinaryStorage : diskStorage,
  limits: { fileSize: 5 * 1024 * 1024 }
});

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// GET /api/products
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, category, subcategory, brand, minPrice, maxPrice, sort = '-createdAt', search, featured, badge, inStock } = req.query;
    const query = { isActive: true };
    if (category) query.category = category;
    if (subcategory) query.subcategory = subcategory;
    if (brand) query.brand = new RegExp(escapeRegex(brand), 'i');
    if (minPrice || maxPrice) query.price = {};
    if (minPrice) query.price.$gte = +minPrice;
    if (maxPrice) query.price.$lte = +maxPrice;
    if (featured === 'true') query.isFeatured = true;
    if (badge) query.badges = badge;
    if (inStock === 'true') query.stock = { $gt: 0 };
    const { q, minRating, minDiscount } = req.query;
    const searchTerm = search || q;
    if (searchTerm) {
      const escaped = escapeRegex(searchTerm);
      query.$or = [
        { name: new RegExp(escaped, 'i') },
        { brand: new RegExp(escaped, 'i') },
        { tags: new RegExp(escaped, 'i') }
      ];
    }
    if (minRating) query.rating = { $gte: +minRating };
    if (minDiscount) query.discount = { $gte: +minDiscount };

    const sortMap = { price_asc: 'price', price_desc: '-price', discount: '-discount', rating: '-rating', newest: '-createdAt', popular: '-soldCount' };
    const sortKey = sortMap[sort] || sort;

    const total = await Product.countDocuments(query);
    const products = await Product.find(query)
      .populate('category', 'name slug')
      .sort(sortKey)
      .limit(+limit)
      .skip((+page - 1) * +limit);

    res.json({ success: true, products, total, page: +page, pages: Math.ceil(total / +limit) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/products/search
router.get('/search', async (req, res) => {
  try {
    const { q, limit = 10 } = req.query;
    if (!q) return res.json({ success: true, products: [] });
    const escaped = escapeRegex(q);
    const products = await Product.find({
      isActive: true,
      $or: [
        { name: new RegExp(escaped, 'i') },
        { brand: new RegExp(escaped, 'i') },
        { tags: new RegExp(escaped, 'i') }
      ]
    }).limit(+limit).select('name slug price mrp images brand discount deliveryTime stock');
    res.json({ success: true, products });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/products/featured
router.get('/featured', async (req, res) => {
  try {
    const products = await Product.find({ isActive: true, isFeatured: true }).populate('category', 'name').limit(12);
    res.json({ success: true, products });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/products/trending
router.get('/trending', async (req, res) => {
  try {
    const products = await Product.find({ isActive: true, stock: { $gt: 0 } }).sort('-soldCount').limit(12).populate('category', 'name');
    res.json({ success: true, products });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/products/:id
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate('category', 'name slug').populate('warehouse', 'name coordinates');
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, product });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/products (admin)
router.post('/', protect, adminOnly, upload.array('images', 5), async (req, res) => {
  try {
    const data = { ...req.body };
    if (req.files && req.files.length > 0) {
      data.images = req.files.map(f => CLOUDINARY_CONFIGURED ? f.path : `/uploads/${f.filename}`);
    }
    if (typeof data.tags === 'string') data.tags = data.tags.split(',').map(t => t.trim());
    if (typeof data.badges === 'string') data.badges = data.badges.split(',').map(b => b.trim());
    const product = await Product.create(data);
    res.status(201).json({ success: true, message: 'Product created', product });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/products/:id (admin)
router.put('/:id', protect, adminOnly, upload.array('images', 5), async (req, res) => {
  try {
    const data = { ...req.body };
    if (req.files && req.files.length > 0) {
      data.images = req.files.map(f => CLOUDINARY_CONFIGURED ? f.path : `/uploads/${f.filename}`);
    }
    if (typeof data.tags === 'string') data.tags = data.tags.split(',').map(t => t.trim());
    if (typeof data.badges === 'string') data.badges = data.badges.split(',').map(b => b.trim());
    const product = await Product.findByIdAndUpdate(req.params.id, data, { new: true });
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, message: 'Product updated', product });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/products/:id (admin)
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    await Product.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ success: true, message: 'Product deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
