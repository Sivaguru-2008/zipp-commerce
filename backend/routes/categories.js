const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/categoryController');
const { protect, adminOnly } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');

router.get   ('/',     asyncHandler(ctrl.list));
router.get   ('/:id',  asyncHandler(ctrl.get));

router.post  ('/',     protect, adminOnly, asyncHandler(ctrl.create));
router.put   ('/:id',  protect, adminOnly, asyncHandler(ctrl.update));
router.delete('/:id',  protect, adminOnly, asyncHandler(ctrl.remove));

module.exports = router;
