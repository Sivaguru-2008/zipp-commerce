const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/cartController');
const { protect } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');

router.get   ('/',                   protect, asyncHandler(ctrl.get));
router.post  ('/add',                protect, asyncHandler(ctrl.add));
router.put   ('/update',             protect, asyncHandler(ctrl.update));
router.delete('/remove/:productId',  protect, asyncHandler(ctrl.remove));
router.delete('/clear',              protect, asyncHandler(ctrl.clear));
router.post  ('/coupon',             protect, asyncHandler(ctrl.applyCoupon));
router.delete('/coupon',             protect, asyncHandler(ctrl.removeCoupon));

module.exports = router;
