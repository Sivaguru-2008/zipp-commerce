const deliveryService = require('../services/deliveryService');

exports.check = async (req, res) => {
  const result = await deliveryService.check(req.body);
  res.json({ success: true, ...result });
};

exports.listWarehouses = async (req, res) => {
  const warehouses = await deliveryService.listWarehouses();
  res.json({ success: true, warehouses });
};

exports.eta = async (req, res) => {
  const result = await deliveryService.eta(req.query);
  res.json({ success: true, ...result });
};
