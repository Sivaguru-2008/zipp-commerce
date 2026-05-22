const paymentService = require('../services/paymentService');

exports.createOrder = async (req, res) => {
  const result = await paymentService.createOrder(req.user._id, req.body.orderId);
  res.json({ success: true, ...result });
};

exports.verify = async (req, res) => {
  const result = await paymentService.verify(req.user._id, req.body);
  res.json({
    success: true,
    message: result.idempotent ? 'Payment already verified' : 'Payment verified successfully',
    ...result
  });
};

exports.history = async (req, res) => {
  const payments = await paymentService.history(req.user._id);
  res.json({ success: true, payments });
};
