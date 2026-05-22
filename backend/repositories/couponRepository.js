const { Coupon } = require('../models');

exports.findActiveByCode = (code) => Coupon.findOne({ code: code.toUpperCase(), isActive: true });
exports.list             = ()     => Coupon.find().sort('-createdAt');
exports.create           = (data) => Coupon.create(data);
exports.update           = (id, data) => Coupon.findByIdAndUpdate(id, data, { new: true });
exports.deleteById       = (id)   => Coupon.findByIdAndDelete(id);
