const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { protect, adminOnly } = require('../middleware/auth');

// GET /api/users/profile
router.get('/profile', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/users/profile
router.put('/profile', protect, async (req, res) => {
  try {
    const { name, phone, preferences } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { name, phone, preferences },
      { new: true, runValidators: true }
    ).select('-password');
    res.json({ success: true, message: 'Profile updated', user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/users/addresses
router.post('/addresses', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const newAddress = req.body;
    if (newAddress.isDefault) {
      user.addresses.forEach(addr => addr.isDefault = false);
    }
    if (user.addresses.length === 0) newAddress.isDefault = true;
    user.addresses.push(newAddress);
    await user.save();
    res.json({ success: true, message: 'Address added', user: user.toJSON ? user.toJSON() : user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/users/addresses/:id
router.put('/addresses/:id', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const addr = user.addresses.id(req.params.id);
    if (!addr) return res.status(404).json({ success: false, message: 'Address not found' });
    if (req.body.isDefault) user.addresses.forEach(a => a.isDefault = false);
    Object.assign(addr, req.body);
    await user.save();
    res.json({ success: true, message: 'Address updated', user: user.toJSON ? user.toJSON() : user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/users/addresses/:id
router.delete('/addresses/:id', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    user.addresses = user.addresses.filter(a => a._id.toString() !== req.params.id);
    await user.save();
    res.json({ success: true, message: 'Address deleted', user: user.toJSON ? user.toJSON() : user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/users (admin only)
router.get('/', protect, adminOnly, async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const escaped = search ? search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : null;
    const query = escaped
      ? { $or: [{ name: new RegExp(escaped, 'i') }, { email: new RegExp(escaped, 'i') }] }
      : {};
    const total = await User.countDocuments(query);
    const users = await User.find(query).select('-password').sort('-createdAt').limit(+limit).skip((+page - 1) * +limit);
    res.json({ success: true, users, total, page: +page, pages: Math.ceil(total / +limit) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
