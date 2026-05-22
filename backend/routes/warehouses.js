const express = require('express');
const router = express.Router();
const { Warehouse } = require('../models');
const asyncHandler = require('../middleware/asyncHandler');

router.get('/', asyncHandler(async (req, res) => {
  const warehouses = await Warehouse.find({ isActive: true });
  res.json({ success: true, warehouses });
}));

module.exports = router;
