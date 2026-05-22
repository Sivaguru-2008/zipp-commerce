const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const ctrl = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../middleware/asyncHandler');

router.post('/register',
  body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be 2–100 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('phone').optional({ nullable: true, checkFalsy: true }).isMobilePhone().withMessage('Valid phone number required'),
  validate,
  asyncHandler(ctrl.register)
);

router.post('/login',
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').notEmpty().withMessage('Password is required'),
  validate,
  asyncHandler(ctrl.login)
);

router.get('/me', protect, asyncHandler(ctrl.me));

router.put('/change-password',
  protect,
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
  validate,
  asyncHandler(ctrl.changePassword)
);

module.exports = router;
