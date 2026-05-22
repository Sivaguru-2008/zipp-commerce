const express = require('express');
const router = express.Router();

const ctrl = require('../controllers/productController');
const { protect, adminOnly } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const asyncHandler = require('../middleware/asyncHandler');

router.get('/',         asyncHandler(ctrl.list));
router.get('/search',   asyncHandler(ctrl.search));
router.get('/featured', asyncHandler(ctrl.featured));
router.get('/trending', asyncHandler(ctrl.trending));
router.get('/:id',      asyncHandler(ctrl.detail));

router.post('/',       protect, adminOnly, upload.array('images', 5), asyncHandler(ctrl.create));
router.put('/:id',     protect, adminOnly, upload.array('images', 5), asyncHandler(ctrl.update));
router.delete('/:id',  protect, adminOnly,                            asyncHandler(ctrl.remove));

module.exports = router;
