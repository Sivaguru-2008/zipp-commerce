const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const ctrl = require('../controllers/orderController');
const { protect, adminOnly } = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../middleware/asyncHandler');

router.get('/',           protect, asyncHandler(ctrl.listMine));
router.get('/admin/all',  protect, adminOnly, asyncHandler(ctrl.listAll));
router.get('/:id',        protect, asyncHandler(ctrl.get));

router.post('/',
  protect,
  body('deliveryAddress.fullName').trim().notEmpty().withMessage('Delivery full name is required'),
  body('deliveryAddress.phone').isMobilePhone().withMessage('Valid delivery phone number is required'),
  body('deliveryAddress.addressLine1').trim().notEmpty().withMessage('Address line 1 is required'),
  body('deliveryAddress.pincode').trim().isPostalCode('IN').withMessage('Valid 6-digit pincode is required'),
  body('paymentMethod').optional().isIn(['cod', 'razorpay', 'wallet']).withMessage('Invalid payment method'),
  validate,
  asyncHandler(ctrl.place)
);

router.put('/:id/cancel', protect,            asyncHandler(ctrl.cancel));
router.put('/:id/status', protect, adminOnly, asyncHandler(ctrl.updateStatus));

module.exports = router;
