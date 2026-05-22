const express = require('express');
const router = express.Router();

const ctrl = require('../controllers/deliveryController');
const asyncHandler = require('../middleware/asyncHandler');

router.post('/check',      asyncHandler(ctrl.check));
router.get ('/warehouses', asyncHandler(ctrl.listWarehouses));
router.get ('/eta',        asyncHandler(ctrl.eta));

module.exports = router;
