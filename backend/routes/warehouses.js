const express = require('express');
const router = express.Router();
const { Warehouse } = require('../models/index');

router.get('/', async (req, res) => {
  try {
    const warehouses = await Warehouse.find({ isActive: true });
    res.json({ success: true, warehouses });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
