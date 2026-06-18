// Admin-only operational analytics.
//
// Four endpoints back the /admin-analytics.html dashboard:
//   GET /api/admin/analytics/overview   roll-up + ops counters
//   GET /api/admin/analytics/revenue    revenue + order count per day (?days=N)
//   GET /api/admin/analytics/users      signup growth + cumulative + DAU
//   GET /api/admin/analytics/orders     per-day, status breakdown, top products
//
// Heavy work runs through MongoDB aggregations. Redis counters (today's
// payment failures, online users, slow request count) come from utils/metrics
// + utils/analytics. Every endpoint short-circuits to safe defaults if a
// dependency (Redis) is unavailable.

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const { protect, adminOnly } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const analytics = require('../utils/analytics');
const metrics = require('../utils/metrics');
const { Order, Payment } = require('../models');
const User = require('../models/User');
const Product = require('../models/Product');

router.use(protect, adminOnly);

// --- helpers ---
function clampDays(input, max = 90, def = 14) {
  const n = +input;
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(n, max);
}

function startOfNDaysAgo(days) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (days - 1));
  return d;
}

// Fill in days with zero where the aggregation returned no row, so charting
// libraries don't have to dedupe / interpolate.
function fillDaily(rows, days, valueKeys = ['count']) {
  const out = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const map = new Map(rows.map(r => [r._id, r]));
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const r = map.get(key) || {};
    const point = { date: key };
    for (const k of valueKeys) point[k] = r[k] || 0;
    out.push(point);
  }
  return out;
}

// GET /overview ------------------------------------------------------------
router.get('/overview', asyncHandler(async (req, res) => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [
    totalUsers,
    activeUsers30d,
    todayUsers,
    totalOrders,
    todayOrders,
    revenueAgg,
    todayRevenueAgg,
    lowStock,
    ops,
    analyticsSummary
  ] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ lastLogin: { $gte: new Date(Date.now() - 30 * 24 * 3600 * 1000) } }),
    User.countDocuments({ createdAt: { $gte: todayStart } }),
    Order.countDocuments({}),
    Order.countDocuments({ createdAt: { $gte: todayStart } }),
    Order.aggregate([
      { $match: { status: { $ne: 'cancelled' } } },
      { $group: { _id: null, total: { $sum: '$pricing.total' } } }
    ]),
    Order.aggregate([
      { $match: { createdAt: { $gte: todayStart }, status: { $ne: 'cancelled' } } },
      { $group: { _id: null, total: { $sum: '$pricing.total' } } }
    ]),
    Product.countDocuments({ stock: { $lte: 10 }, isActive: true }),
    metrics.getOpsSummary(),
    analytics.getSummary()
  ]);

  res.json({
    success: true,
    overview: {
      users: {
        total: totalUsers,
        active30d: activeUsers30d,
        newToday: todayUsers,
        onlineNow: analyticsSummary.onlineNow,
        dailyActive: analyticsSummary.dailyActiveUsers
      },
      orders: {
        total: totalOrders,
        today: todayOrders,
        revenueTotal: revenueAgg[0]?.total || 0,
        revenueToday: todayRevenueAgg[0]?.total || 0
      },
      inventory: { lowStockCount: lowStock },
      ops, // payment failures, errors today, slow requests, memory, uptime
      live: {
        loginsToday: analyticsSummary.loginsToday,
        ordersToday: analyticsSummary.ordersToday,
        cartAdditionsToday: analyticsSummary.cartAdditionsToday
      }
    }
  });
}));

// GET /revenue ------------------------------------------------------------
router.get('/revenue', asyncHandler(async (req, res) => {
  const days = clampDays(req.query.days, 90, 14);
  const since = startOfNDaysAgo(days);

  const rows = await Order.aggregate([
    { $match: { createdAt: { $gte: since } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        orders: { $sum: 1 },
        revenue: {
          $sum: {
            $cond: [{ $ne: ['$status', 'cancelled'] }, '$pricing.total', 0]
          }
        },
        cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } }
      }
    }
  ]);

  const series = fillDaily(rows, days, ['orders', 'revenue', 'cancelled']);
  const totals = series.reduce((acc, p) => {
    acc.orders   += p.orders;
    acc.revenue  += p.revenue;
    acc.cancelled += p.cancelled;
    return acc;
  }, { orders: 0, revenue: 0, cancelled: 0 });
  totals.averageOrderValue = totals.orders ? Math.round(totals.revenue / totals.orders) : 0;

  res.json({ success: true, days, series, totals });
}));

// GET /users --------------------------------------------------------------
router.get('/users', asyncHandler(async (req, res) => {
  const days = clampDays(req.query.days, 90, 14);
  const since = startOfNDaysAgo(days);

  const [signups, cumulativeTotal] = await Promise.all([
    User.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 }
        }
      }
    ]),
    User.countDocuments({ createdAt: { $lt: since } })
  ]);

  const series = fillDaily(signups, days, ['count']);
  let running = cumulativeTotal;
  const cumulative = series.map(p => {
    running += p.count;
    return { date: p.date, total: running };
  });

  res.json({ success: true, days, signups: series, cumulative });
}));

// GET /orders -------------------------------------------------------------
router.get('/orders', asyncHandler(async (req, res) => {
  const days = clampDays(req.query.days, 90, 14);
  const since = startOfNDaysAgo(days);

  const [perDay, statusBreakdown, topProducts, paymentFailures] = await Promise.all([
    Order.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 }
        }
      }
    ]),
    Order.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]),
    Order.aggregate([
      { $match: { createdAt: { $gte: since }, status: { $ne: 'cancelled' } } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          name:     { $first: '$items.name' },
          quantity: { $sum: '$items.quantity' },
          revenue:  { $sum: '$items.subtotal' }
        }
      },
      { $sort: { quantity: -1 } },
      { $limit: 10 }
    ]),
    Payment.aggregate([
      { $match: { createdAt: { $gte: since }, status: 'failed' } },
      { $count: 'count' }
    ])
  ]);

  res.json({
    success: true,
    days,
    series: fillDaily(perDay, days, ['count']),
    statusBreakdown,
    topProducts,
    paymentFailures: paymentFailures[0]?.count || 0
  });
}));

module.exports = router;
