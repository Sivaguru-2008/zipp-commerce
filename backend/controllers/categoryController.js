const categoryService = require('../services/categoryService');

exports.list = async (req, res) => {
  const categories = await categoryService.list();
  res.json({ success: true, categories });
};

exports.get = async (req, res) => {
  const category = await categoryService.get(req.params.id);
  res.json({ success: true, category });
};

exports.create = async (req, res) => {
  const category = await categoryService.create(req.body);
  res.status(201).json({ success: true, category });
};

exports.update = async (req, res) => {
  const category = await categoryService.update(req.params.id, req.body);
  res.json({ success: true, category });
};

exports.remove = async (req, res) => {
  await categoryService.softDelete(req.params.id);
  res.json({ success: true, message: 'Category deleted' });
};
