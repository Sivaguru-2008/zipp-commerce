const ApiError = require('../utils/ApiError');
const repo = require('../repositories/couponRepository');

exports.validate = async ({ code, orderAmount }) => {
  if (!code) throw new ApiError(400, 'Coupon code required');
  const coupon = await repo.findActiveByCode(code);
  if (!coupon) throw new ApiError(404, 'Invalid coupon code');
  if (new Date() > coupon.validTill)          throw new ApiError(400, 'Coupon expired');
  if (coupon.usedCount >= coupon.usageLimit)  throw new ApiError(400, 'Coupon usage limit reached');
  if (orderAmount < coupon.minOrderAmount) {
    throw new ApiError(400, `Minimum order amount is ₹${coupon.minOrderAmount}`);
  }

  let discount = 0;
  if (coupon.type === 'percentage') {
    discount = Math.round(orderAmount * coupon.value / 100);
    if (coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);
  } else if (coupon.type === 'fixed' || coupon.type === 'free_delivery') {
    discount = coupon.value;
  }
  return { code: coupon.code, type: coupon.type, value: coupon.value, discount, description: coupon.description };
};

exports.list         = ()             => repo.list();
exports.create       = (data)         => repo.create(data);
exports.update       = (id, data)     => repo.update(id, data);
exports.deleteById   = (id)           => repo.deleteById(id);
