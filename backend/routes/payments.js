const express = require('express');
const router = express.Router();

const ctrl = require('../controllers/paymentController');
const { protect } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');

router.post('/create-order', protect, asyncHandler(ctrl.createOrder));
router.post('/verify',       protect, asyncHandler(ctrl.verify));
router.get ('/history',      protect, asyncHandler(ctrl.history));

module.exports = router;
