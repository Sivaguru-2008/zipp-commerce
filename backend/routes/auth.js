const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { Cart, Wishlist } = require('../models/index');
const { protect } = require('../middleware/auth');
const logger = require('../utils/logger');

const generateToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });

function validate(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ success: false, errors: errors.array() });
    return false;
  }
  return true;
}

// POST /api/auth/register
router.post('/register',
  body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be 2–100 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('phone').optional({ nullable: true, checkFalsy: true }).isMobilePhone().withMessage('Valid phone number required'),
  async (req, res) => {
    if (!validate(req, res)) return;
    try {
      const { name, email, password, phone } = req.body;
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ success: false, message: 'Email already registered' });
      }
      const user = await User.create({ name, email, password, phone });

      // Pre-create empty cart and wishlist so the new user has a complete data footprint.
      // Failures here don't break registration — cart/wishlist routes also lazy-init.
      try {
        await Promise.all([
          Cart.create({ user: user._id, items: [] }),
          Wishlist.create({ user: user._id, products: [] })
        ]);
      } catch (e) {
        logger.warn({ userId: user._id, err: e.message }, 'Failed to pre-create cart/wishlist; will lazy-init');
      }

      const token = generateToken(user._id);
      res.status(201).json({
        success: true,
        message: 'Account created successfully',
        token,
        user: { _id: user._id, name: user.name, email: user.email, role: user.role, phone: user.phone }
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// POST /api/auth/login
router.post('/login',
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').notEmpty().withMessage('Password is required'),
  async (req, res) => {
    if (!validate(req, res)) return;
    try {
      const { email, password } = req.body;
      const user = await User.findOne({ email });
      if (!user || !(await user.comparePassword(password))) {
        return res.status(401).json({ success: false, message: 'Invalid email or password' });
      }
      user.lastLogin = new Date();
      await user.save();
      const token = generateToken(user._id);
      res.json({
        success: true,
        message: 'Login successful',
        token,
        user: { _id: user._id, name: user.name, email: user.email, role: user.role, phone: user.phone, avatar: user.avatar }
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// GET /api/auth/me
router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/auth/change-password
router.put('/change-password',
  protect,
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
  async (req, res) => {
    if (!validate(req, res)) return;
    try {
      const { currentPassword, newPassword } = req.body;
      const user = await User.findById(req.user._id);
      if (!(await user.comparePassword(currentPassword))) {
        return res.status(400).json({ success: false, message: 'Current password incorrect' });
      }
      user.password = newPassword;
      await user.save();
      res.json({ success: true, message: 'Password changed successfully' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

module.exports = router;
