const { Warehouse } = require('../models');

// Haversine distance in km.
function getDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
          + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const DEFAULT_FEE = 40;
const FREE_DELIVERY_ABOVE = 499;

exports.check = async ({ pincode, lat, lng }) => {
  const warehouses = await Warehouse.find({ isActive: true });
  let nearest = null;
  let minDistance = Infinity;

  for (const wh of warehouses) {
    if (pincode && wh.serviceablePincodes.includes(pincode)) {
      nearest = wh;
      minDistance = 0;
      break;
    }
    if (lat && lng) {
      const dist = getDistance(lat, lng, wh.coordinates.lat, wh.coordinates.lng);
      if (dist < minDistance && dist <= wh.serviceableRadius) {
        minDistance = dist;
        nearest = wh;
      }
    }
  }

  if (!nearest) {
    return { deliverable: false, message: 'Delivery not available in your area' };
  }

  const distance = (lat && lng && minDistance !== Infinity) ? minDistance : 3;
  const eta = Math.ceil(nearest.avgPreparationTime + (distance * 3));
  return {
    deliverable: true,
    warehouse: nearest.name,
    eta: `${eta} mins`,
    etaMinutes: eta,
    deliveryFee: DEFAULT_FEE,
    freeDeliveryAbove: FREE_DELIVERY_ABOVE
  };
};

exports.listWarehouses = () =>
  Warehouse.find({ isActive: true }).select('name code type address coordinates serviceableRadius');

exports.eta = async ({ lat, lng }) => {
  const warehouses = await Warehouse.find({ isActive: true });
  let nearest = null, minDist = Infinity;
  for (const wh of warehouses) {
    const d = getDistance(+lat || 12.9716, +lng || 77.5946, wh.coordinates.lat, wh.coordinates.lng);
    if (d < minDist) { minDist = d; nearest = wh; }
  }
  const eta = nearest ? Math.ceil(nearest.avgPreparationTime + (minDist * 3)) : 30;
  return { eta: `${eta} mins`, etaMinutes: eta };
};
