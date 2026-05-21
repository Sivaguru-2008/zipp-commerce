const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { Warehouse } = require('../models/index');

function getDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// POST /api/delivery/check
router.post('/check', async (req, res) => {
  try {
    const { pincode, lat, lng } = req.body;
    const warehouses = await Warehouse.find({ isActive: true });
    
    let nearestWarehouse = null;
    let minDistance = Infinity;

    for (const wh of warehouses) {
      if (pincode && wh.serviceablePincodes.includes(pincode)) {
        nearestWarehouse = wh;
        break;
      }
      if (lat && lng) {
        const dist = getDistance(lat, lng, wh.coordinates.lat, wh.coordinates.lng);
        if (dist < minDistance && dist <= wh.serviceableRadius) {
          minDistance = dist;
          nearestWarehouse = wh;
        }
      }
    }

    if (nearestWarehouse) {
      const distance = (lat && lng) ? minDistance : 3;
      const eta = Math.ceil(nearestWarehouse.avgPreparationTime + (distance * 3));
      res.json({
        success: true,
        deliverable: true,
        warehouse: nearestWarehouse.name,
        eta: `${eta} mins`,
        etaMinutes: eta,
        deliveryFee: 40,
        freeDeliveryAbove: 499
      });
    } else {
      res.json({ success: true, deliverable: false, message: 'Delivery not available in your area' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/delivery/warehouses
router.get('/warehouses', async (req, res) => {
  try {
    const warehouses = await Warehouse.find({ isActive: true }).select('name code type address coordinates serviceableRadius');
    res.json({ success: true, warehouses });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/delivery/eta
router.get('/eta', async (req, res) => {
  try {
    const { lat, lng } = req.query;
    const warehouses = await Warehouse.find({ isActive: true });
    let nearest = null, minDist = Infinity;
    for (const wh of warehouses) {
      const dist = getDistance(+lat || 12.9716, +lng || 77.5946, wh.coordinates.lat, wh.coordinates.lng);
      if (dist < minDist) { minDist = dist; nearest = wh; }
    }
    const eta = nearest ? Math.ceil(nearest.avgPreparationTime + (minDist * 3)) : 30;
    res.json({ success: true, eta: `${eta} mins`, etaMinutes: eta });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
