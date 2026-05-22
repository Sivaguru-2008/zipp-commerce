// Lightweight analytics built on Redis counters + MongoDB aggregations.
// Counters live in Redis (fast increment, daily key rotation). Historical
// queries (top-selling, total users) hit MongoDB.
//
// All write paths swallow errors so analytics can never break the request
// path. Reads return safe defaults when Redis is unavailable.

const logger = require('./logger');
const cache = require('./cache');
const User = require('../models/User');

const todayKey = (d = new Date()) => d.toISOString().slice(0, 10); // YYYY-MM-DD

const KEY = {
  dau:        (date)   => `analytics:dau:${date}`,
  orders:     (date)   => `analytics:orders:${date}`,
  cartAdds:   (date)   => `analytics:cart_adds:${date}`,
  logins:     (date)   => `analytics:logins:${date}`,
  topProduct: (id)     => `analytics:top_products:${id}`,
  online:                 'analytics:online'
};

// Keep daily buckets around for ~30 days so we can chart trends.
const DAILY_TTL = 60 * 60 * 24 * 35;

// A user is "online" if we've seen activity in the last 5 minutes.
const ONLINE_WINDOW_SECONDS = 5 * 60;

async function incrCounter(key, member = null) {
  const client = cache.getRawClient();
  if (!client) return;
  try {
    if (member) {
      // Sorted-set increment for things like top-selling products.
      await client.zincrby(key, 1, member);
    } else {
      await client.incr(key);
      await client.expire(key, DAILY_TTL);
    }
  } catch (err) {
    logger.warn({ err: err.message, key }, 'analytics incr failed');
  }
}

async function getCounter(key) {
  const client = cache.getRawClient();
  if (!client) return 0;
  try {
    const v = await client.get(key);
    return v ? +v : 0;
  } catch {
    return 0;
  }
}

async function markActiveUser(userId, date = todayKey()) {
  const client = cache.getRawClient();
  if (!client) return;
  try {
    await client.sadd(KEY.dau(date), String(userId));
    await client.expire(KEY.dau(date), DAILY_TTL);
    // Online tracking piggy-backs on every active-user signal.
    await trackOnline(userId);
  } catch (err) {
    logger.warn({ err: err.message }, 'analytics markActiveUser failed');
  }
}

// Online tracking — sorted set keyed by userId, scored by last-seen epoch
// milliseconds. getOnlineCount expires stale entries before counting.
async function trackOnline(userId) {
  const client = cache.getRawClient();
  if (!client || !userId) return;
  try {
    await client.zadd(KEY.online, Date.now(), String(userId));
  } catch (err) {
    logger.warn({ err: err.message }, 'analytics trackOnline failed');
  }
}

async function pruneOfflineUsers() {
  const client = cache.getRawClient();
  if (!client) return;
  const cutoff = Date.now() - ONLINE_WINDOW_SECONDS * 1000;
  try {
    await client.zremrangebyscore(KEY.online, '-inf', cutoff);
  } catch (err) {
    logger.warn({ err: err.message }, 'analytics pruneOfflineUsers failed');
  }
}

exports.markActiveUser = markActiveUser;
exports.trackOnline    = trackOnline;

exports.getOnlineCount = async () => {
  const client = cache.getRawClient();
  if (!client) return 0;
  try {
    await pruneOfflineUsers();
    return await client.zcard(KEY.online);
  } catch {
    return 0;
  }
};

exports.getOnlineUserIds = async (limit = 100) => {
  const client = cache.getRawClient();
  if (!client) return [];
  try {
    await pruneOfflineUsers();
    return await client.zrevrange(KEY.online, 0, limit - 1);
  } catch {
    return [];
  }
};

exports.incrementLogin = async (userId) => {
  await incrCounter(KEY.logins(todayKey()));
  await markActiveUser(userId);
};

exports.incrementOrder = async (userId, items = []) => {
  await incrCounter(KEY.orders(todayKey()));
  for (const it of items) {
    if (it.product) await incrCounter('analytics:top_products', String(it.product));
  }
  await markActiveUser(userId);
};

exports.incrementCartAddition = async (userId /* , productId */) => {
  await incrCounter(KEY.cartAdds(todayKey()));
  await markActiveUser(userId);
};

exports.getDailyActiveUsers = async (date = todayKey()) => {
  const client = cache.getRawClient();
  if (!client) return 0;
  try {
    return await client.scard(KEY.dau(date));
  } catch {
    return 0;
  }
};

exports.getOrdersToday   = () => getCounter(KEY.orders(todayKey()));
exports.getLoginsToday   = () => getCounter(KEY.logins(todayKey()));
exports.getCartAddsToday = () => getCounter(KEY.cartAdds(todayKey()));

exports.getTopSellingProducts = async (limit = 10) => {
  const client = cache.getRawClient();
  if (!client) return [];
  try {
    // zrevrange returns highest-scored members first.
    return await client.zrevrange('analytics:top_products', 0, limit - 1, 'WITHSCORES');
  } catch {
    return [];
  }
};

exports.getTotalUsers = () => User.countDocuments({});

// Roll-up for an admin dashboard.
exports.getSummary = async () => {
  const [totalUsers, dau, online, orders, logins, cartAdds] = await Promise.all([
    exports.getTotalUsers(),
    exports.getDailyActiveUsers(),
    exports.getOnlineCount(),
    exports.getOrdersToday(),
    exports.getLoginsToday(),
    exports.getCartAddsToday()
  ]);
  return {
    totalUsers,
    onlineNow: online,
    dailyActiveUsers: dau,
    ordersToday: orders,
    loginsToday: logins,
    cartAdditionsToday: cartAdds
  };
};

exports.KEY = KEY;
