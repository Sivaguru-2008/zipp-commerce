const express = require('express');
const router = express.Router();

const ctrl = require('../controllers/couponController');
const { protect, adminOnly } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');

router.post  ('/validate', protect,            asyncHandler(ctrl.validate));
router.get   ('/',         protect, adminOnly, asyncHandler(ctrl.list));
router.post  ('/',         protect, adminOnly, asyncHandler(ctrl.create));
router.put   ('/:id',      protect, adminOnly, asyncHandler(ctrl.update));
router.delete('/:id',      protect, adminOnly, asyncHandler(ctrl.remove));

module.exports = router;
