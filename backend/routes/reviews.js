const express = require('express');
const router = express.Router();

const ctrl = require('../controllers/reviewController');
const { protect } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');

router.get ('/:productId', asyncHandler(ctrl.listForProduct));
router.post('/',           protect, asyncHandler(ctrl.create));

module.exports = router;
