const couponService = require('../services/couponService');

exports.validate = async (req, res) => {
  const coupon = await couponService.validate(req.body);
  res.json({ success: true, coupon });
};

exports.list = async (req, res) => {
  const coupons = await couponService.list();
  res.json({ success: true, coupons });
};

exports.create = async (req, res) => {
  const coupon = await couponService.create(req.body);
  res.status(201).json({ success: true, coupon });
};

exports.update = async (req, res) => {
  const coupon = await couponService.update(req.params.id, req.body);
  res.json({ success: true, coupon });
};

exports.remove = async (req, res) => {
  await couponService.deleteById(req.params.id);
  res.json({ success: true, message: 'Coupon deleted' });
};
