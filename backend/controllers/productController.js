const productService = require('../services/productService');
const { CLOUDINARY_CONFIGURED } = require('../middleware/upload');

function normalizePayload(body, files) {
  const data = { ...body };
  if (files && files.length > 0) {
    data.images = files.map(f => CLOUDINARY_CONFIGURED ? f.path : `/uploads/${f.filename}`);
  }
  if (typeof data.tags    === 'string') data.tags    = data.tags.split(',').map(t => t.trim());
  if (typeof data.badges  === 'string') data.badges  = data.badges.split(',').map(b => b.trim());
  return data;
}

exports.list = async (req, res) => {
  const result = await productService.list(req.query);
  res.json({ success: true, ...result });
};

exports.search = async (req, res) => {
  const products = await productService.search(req.query.q, req.query.limit);
  res.json({ success: true, products });
};

exports.featured = async (req, res) => {
  const products = await productService.featured();
  res.json({ success: true, products });
};

exports.trending = async (req, res) => {
  const products = await productService.trending();
  res.json({ success: true, products });
};

exports.detail = async (req, res) => {
  const product = await productService.detail(req.params.id);
  res.json({ success: true, product });
};

exports.create = async (req, res) => {
  const product = await productService.create(normalizePayload(req.body, req.files));
  res.status(201).json({ success: true, message: 'Product created', product });
};

exports.update = async (req, res) => {
  const product = await productService.update(req.params.id, normalizePayload(req.body, req.files));
  res.json({ success: true, message: 'Product updated', product });
};

exports.remove = async (req, res) => {
  await productService.softDelete(req.params.id);
  res.json({ success: true, message: 'Product deleted' });
};
