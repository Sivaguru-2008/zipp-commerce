const Redis = require('ioredis');
const logger = require('./logger');

// Singleton Redis client. Lazily connected on first command. If REDIS_URL is
// missing or unreachable we degrade to a no-op cache: getCache always returns
// null (forcing a DB hit), setCache/deleteCache silently succeed. The app
// never crashes because Redis is down.

let client = null;
let unavailable = false;
let warnedUnavailable = false;

function buildClient() {
  if (!process.env.REDIS_URL) {
    if (!warnedUnavailable) {
      logger.warn('REDIS_URL not set — caching disabled (no-op fallback)');
      warnedUnavailable = true;
    }
    unavailable = true;
    return null;
  }

  const c = new Redis(process.env.REDIS_URL, {
    lazyConnect: true,
    // Don't retry forever — if Redis is down, fail open after a few attempts
    maxRetriesPerRequest: 2,
    retryStrategy: (times) => {
      if (times > 5) return null; // stop retrying; we'll mark unavailable
      return Math.min(times * 200, 2000);
    },
    enableOfflineQueue: false
  });

  c.on('connect',     () => { unavailable = false; logger.info('Redis connected'); });
  c.on('ready',       () => { unavailable = false; });
  c.on('end',         () => { unavailable = true;  logger.warn('Redis connection closed'); });
  c.on('reconnecting',() => { logger.debug('Redis reconnecting'); });
  c.on('error', (err) => {
    if (!unavailable) {
      unavailable = true;
      logger.warn({ err: err.message }, 'Redis unavailable — falling back to no-op cache');
    }
  });

  // Trigger connection without blocking module load.
  c.connect().catch(() => { unavailable = true; });
  return c;
}

function getClient() {
  if (client === null && !unavailable) client = buildClient();
  return client;
}

async function getCache(key) {
  const c = getClient();
  if (!c || unavailable) return null;
  try {
    const val = await c.get(key);
    if (val === null) {
      logger.debug({ key }, 'cache miss');
      return null;
    }
    logger.debug({ key }, 'cache hit');
    return JSON.parse(val);
  } catch (err) {
    logger.warn({ err: err.message, key }, 'cache get failed');
    return null;
  }
}

async function setCache(key, value, ttlSeconds) {
  const c = getClient();
  if (!c || unavailable) return false;
  try {
    const payload = JSON.stringify(value);
    if (ttlSeconds && ttlSeconds > 0) {
      await c.set(key, payload, 'EX', ttlSeconds);
    } else {
      await c.set(key, payload);
    }
    return true;
  } catch (err) {
    logger.warn({ err: err.message, key }, 'cache set failed');
    return false;
  }
}

async function deleteCache(key) {
  const c = getClient();
  if (!c || unavailable) return false;
  try {
    // Allow wildcard delete with key pattern ending in *
    if (typeof key === 'string' && key.includes('*')) {
      const keys = await c.keys(key);
      if (keys.length) await c.del(keys);
      return true;
    }
    if (Array.isArray(key)) {
      if (key.length) await c.del(key);
      return true;
    }
    await c.del(key);
    return true;
  } catch (err) {
    logger.warn({ err: err.message, key }, 'cache delete failed');
    return false;
  }
}

// Raw client access for use cases beyond simple get/set/delete
// (e.g. online users tracking that needs EXPIRE / SCAN).
function getRawClient() {
  const c = getClient();
  if (!c || unavailable) return null;
  return c;
}

function isAvailable() {
  return !unavailable && client !== null;
}

module.exports = { getCache, setCache, deleteCache, getRawClient, isAvailable };
