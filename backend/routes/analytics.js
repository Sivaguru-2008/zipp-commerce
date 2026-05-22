const express = require('express');
const router = express.Router();
const analytics = require('../utils/analytics');
const { protect, adminOnly } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');

router.get('/summary', protect, adminOnly, asyncHandler(async (req, res) => {
  const summary = await analytics.getSummary();
  res.json({ success: true, summary });
}));

router.get('/online', protect, adminOnly, asyncHandler(async (req, res) => {
  const [count, userIds] = await Promise.all([
    analytics.getOnlineCount(),
    analytics.getOnlineUserIds(100)
  ]);
  res.json({ success: true, count, userIds });
}));

router.get('/top-products', protect, adminOnly, asyncHandler(async (req, res) => {
  const limit = +req.query.limit || 10;
  const raw = await analytics.getTopSellingProducts(limit);
  // zrevrange WITHSCORES returns [member, score, member, score, …] — pair up.
  const items = [];
  for (let i = 0; i < raw.length; i += 2) {
    items.push({ productId: raw[i], count: +raw[i + 1] });
  }
  res.json({ success: true, items });
}));

module.exports = router;
