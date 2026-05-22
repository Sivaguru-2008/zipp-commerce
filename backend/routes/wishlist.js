const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/wishlistController');
const { protect } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');

router.get   ('/',             protect, asyncHandler(ctrl.get));
router.post  ('/toggle',       protect, asyncHandler(ctrl.toggle));
router.delete('/:productId',   protect, asyncHandler(ctrl.remove));

module.exports = router;
