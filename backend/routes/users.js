const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const ctrl = require('../controllers/userController');
const { protect, adminOnly } = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../middleware/asyncHandler');

const addressValidators = [
  body('fullName').trim().notEmpty().withMessage('Full name is required'),
  body('phone').isMobilePhone().withMessage('Valid phone number is required'),
  body('addressLine1').trim().notEmpty().withMessage('Address line 1 is required'),
  body('pincode').trim().isPostalCode('IN').withMessage('Valid 6-digit pincode is required')
];

router.get   ('/profile',         protect,                              asyncHandler(ctrl.getProfile));
router.put   ('/profile',         protect,                              asyncHandler(ctrl.updateProfile));

router.post  ('/addresses',       protect, ...addressValidators, validate, asyncHandler(ctrl.addAddress));
router.put   ('/addresses/:id',   protect, ...addressValidators, validate, asyncHandler(ctrl.updateAddress));
router.delete('/addresses/:id',   protect,                              asyncHandler(ctrl.deleteAddress));

router.get   ('/',                protect, adminOnly,                   asyncHandler(ctrl.listAll));

module.exports = router;
