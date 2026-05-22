const Category = require('../models/Category');

exports.findAll  = () => Category.find({ isActive: true }).sort('sortOrder').lean();
exports.findById = (id) => Category.findById(id).lean();
exports.create   = (data) => Category.create(data);
exports.update   = (id, data) => Category.findByIdAndUpdate(id, data, { new: true });
exports.softDelete = (id) => Category.findByIdAndUpdate(id, { isActive: false });
