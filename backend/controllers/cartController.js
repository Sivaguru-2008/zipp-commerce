const cartService = require('../services/cartService');

exports.get = async (req, res) => {
  const result = await cartService.get(req.user._id);
  res.json({ success: true, ...result });
};

exports.add = async (req, res) => {
  const { productId, quantity = 1 } = req.body;
  const result = await cartService.add(req.user._id, productId, quantity);
  res.json({ success: true, message: 'Added to cart', ...result });
};

exports.update = async (req, res) => {
  const { productId, quantity } = req.body;
  const result = await cartService.update(req.user._id, productId, quantity);
  res.json({ success: true, ...result });
};

exports.remove = async (req, res) => {
  const result = await cartService.remove(req.user._id, req.params.productId);
  res.json({ success: true, message: 'Item removed', ...result });
};

exports.clear = async (req, res) => {
  await cartService.clear(req.user._id);
  res.json({ success: true, message: 'Cart cleared' });
};

const couponService = require('../services/couponService');

// Validate the code against the live coupon rules + cart subtotal, then
// persist on the cart so it can't drift from client-side state.
exports.applyCoupon = async (req, res) => {
  const cart = await cartService.get(req.user._id);
  const code = (req.body.code || '').trim();
  if (!code) {
    const result = await cartService.applyCoupon(req.user._id, null);
    return res.json({ success: true, message: 'Coupon removed', ...result });
  }
  const coupon = await couponService.validate({ code, orderAmount: cart.subtotal });
  const result = await cartService.applyCoupon(req.user._id, coupon);
  res.json({ success: true, message: 'Coupon applied', ...result });
};

exports.removeCoupon = async (req, res) => {
  const result = await cartService.applyCoupon(req.user._id, null);
  res.json({ success: true, message: 'Coupon removed', ...result });
};
