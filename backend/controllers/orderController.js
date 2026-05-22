const orderService = require('../services/orderService');

exports.listMine = async (req, res) => {
  const result = await orderService.listForUser(req.user._id, req.query);
  res.json({ success: true, ...result });
};

exports.get = async (req, res) => {
  const order = await orderService.getById(req.params.id, req.user);
  res.json({ success: true, order });
};

exports.place = async (req, res) => {
  const order = await orderService.placeOrder(req.user._id, req.body);
  res.status(201).json({ success: true, message: 'Order placed successfully', order });
};

exports.cancel = async (req, res) => {
  const order = await orderService.cancel(req.params.id, req.user._id, req.body.reason);
  res.json({ success: true, message: 'Order cancelled', order });
};

exports.updateStatus = async (req, res) => {
  const order = await orderService.updateStatus(req.params.id, req.body);
  res.json({ success: true, message: 'Status updated', order });
};

exports.listAll = async (req, res) => {
  const result = await orderService.listAll(req.query);
  res.json({ success: true, ...result });
};
