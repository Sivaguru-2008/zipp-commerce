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

// Refresh / logout do not require a valid access token — they consume the
// HttpOnly refresh cookie. Logout still succeeds with no cookie so the client
// can call it on app start to clear stale state.
router.post('/refresh', asyncHandler(ctrl.refresh));
router.post('/logout',  asyncHandler(ctrl.logout));
router.post('/logout-all', protect, asyncHandler(ctrl.logoutAll));

// OTP flow — all behind `protect` because we tie the OTP to a user account.
// Guest browsing remains allowed; sensitive actions check req.user.isVerified.
const otpCtrl = require('../controllers/otpController');
router.post('/send-otp',
  protect,
  body('channel').optional().isIn(['sms', 'email']).withMessage('Invalid channel'),
  body('destination').optional().isString().isLength({ min: 5, max: 120 }),
  validate,
  asyncHandler(otpCtrl.send)
);
router.post('/verify-otp',
  protect,
  body('code').isString().isLength({ min: 4, max: 8 }).withMessage('Code must be 4–8 digits'),
  validate,
  asyncHandler(otpCtrl.verify)
);
router.post('/resend-otp', protect, asyncHandler(otpCtrl.resend));

module.exports = router;
