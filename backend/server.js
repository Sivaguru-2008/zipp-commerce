require('dotenv').config();

// Fail fast on missing critical config
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('FATAL: JWT_SECRET is missing or too short (min 32 chars). Set it in .env');
  process.exit(1);
}

const logger = require('./utils/logger');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const pinoHttp = require('pino-http');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const path = require('path');

// Sentry — bootstrap before any other module that throws so we capture
// init-time crashes. No-op if SENTRY_DSN is unset.
const sentry = require('./utils/sentry');
sentry.init();

const requestId = require('./middleware/requestId');
const trackActivity = require('./middleware/trackActivity');
const latency = require('./middleware/latency');
const { errorHandler, notFound } = require('./middleware/errorHandler');

const app = express();

// Trust the first proxy hop (Render, Vercel, Nginx, Cloudflare) so:
//   - req.ip is the real client IP, not the proxy
//   - express-rate-limit keys correctly per-client
//   - Secure cookies + HTTPS detection work
// Disable in plain dev mode if you don't need it.
app.set('trust proxy', +process.env.TRUST_PROXY || 1);

// Content Security Policy — restrictive defaults, with explicit allow-list
// for the third-party scripts we actually load (Razorpay, Google Fonts,
// Unsplash CDN imagery). Re-evaluate when adding new third parties.
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'", 'https://checkout.razorpay.com'],
      // The HTML uses inline onclick handlers throughout (category cards,
      // cart, nav, buttons). Helmet's default `script-src-attr 'none'` would
      // silently block all of them, so we override it here.
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc:   ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc:    ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc:     ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc: ["'self'", 'https://*.razorpay.com', 'https://lumberjack.razorpay.com'],
      frameSrc:   ["'self'", 'https://api.razorpay.com', 'https://checkout.razorpay.com'],
      objectSrc:  ["'none'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
    }
  },
  crossOriginEmbedderPolicy: false,
  // The SPA fetches images from many CDNs; keep CORP loose enough for them.
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// Request correlation id — must run before pino-http so log lines carry req.id.
app.use(requestId);

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5000', 'http://127.0.0.1:5000', 'http://localhost:5500', 'http://127.0.0.1:5500'];

app.use(cors({ origin: allowedOrigins, credentials: true }));

// Sentry request handler must run before any route or error handler. No-op
// when Sentry is not configured.
sentry.attachRequestHandler(app);

// Parse cookies for HttpOnly auth tokens (zipp_at / zipp_rt).
app.use(cookieParser());

// General API rate limit — generous to keep happy paths un-throttled.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: 'draft-7',
  legacyHeaders: false
});
app.use('/api/', limiter);

// Stricter limit on auth endpoints to slow brute-force attempts.
// `skipSuccessfulRequests` means only failed logins burn the budget.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Too many auth attempts, please try again later' }
});
app.use('/api/auth/', authLimiter);

// Dedicated, very tight bucket for OTP send/resend to prevent SMS pumping.
// Verification (which doesn't trigger an SMS) shares the main authLimiter.
const otpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,                                  // 10 sends per IP per hour
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'OTP send limit reached — try again in an hour' }
});
app.use(['/api/auth/send-otp', '/api/auth/resend-otp'], otpLimiter);

// Dedicated bucket for the payment endpoints. Razorpay verify retries from
// the SDK are common; we still want a ceiling per IP.
const paymentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Too many payment requests, please retry shortly' }
});
app.use('/api/payments/', paymentLimiter);

// Search is the most expensive read endpoint (regex scan). Tighten its own
// budget so a runaway client can't degrade DB latency for everyone else.
const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Search rate limit — slow down a moment' }
});
app.use('/api/products/search', searchLimiter);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Strip NoSQL operators from req.body/query/params so a malicious payload
// like `{ "email": { "$ne": null } }` can't bypass auth lookups.
app.use(mongoSanitize({
  replaceWith: '_',
  onSanitize: ({ req, key }) => {
    logger.warn({ url: req.url, key }, 'mongo-sanitize stripped operator');
  }
}));

// Structured HTTP request logging (replaces morgan)
app.use(pinoHttp({
  logger,
  // Reuse req.id from requestId middleware so log lines correlate with the
  // x-request-id response header.
  genReqId: (req) => req.id,
  customLogLevel: (req, res, err) => {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  // Skip log noise: static files, the /health probe (hammered by LBs), and
  // browser preflight OPTIONS.
  autoLogging: {
    ignore: (req) => !req.url.startsWith('/api') || req.method === 'OPTIONS'
  },
  // Custom serializers keep log lines small and PII-safe.
  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      remoteAddress: req.remoteAddress,
      userAgent: req.headers && req.headers['user-agent']
    }),
    res: (res) => ({ statusCode: res.statusCode })
  }
}));

// Best-effort online-user tracking — silently updates Redis if user has a
// valid Bearer token. No effect when Redis is unavailable.
app.use('/api', trackActivity);

// Per-request latency capture — records duration, emits a structured warn
// for slow requests (> SLOW_REQUEST_MS), and feeds the admin /ops endpoint.
app.use('/api', latency);

const frontendPath = path.join(__dirname, '../frontend');

// Static file caching — short for HTML (so deploys propagate quickly),
// aggressive for hashed assets. The frontend has no hashing yet, so use a
// modest TTL across the board.
const staticOpts = {
  maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
  setHeaders: (res, file) => {
    if (file.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
  }
};
// SEO routes mount before static so /sitemap.xml hits the dynamic builder
// instead of the legacy file in /frontend.
app.use(require('./routes/seo'));

app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  maxAge: '7d',
  immutable: true,
  // Tell browsers + CDNs uploads can be shared cross-route. The Cloudinary
  // mirror path is content-addressable so we can cache aggressively.
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
  }
}));
app.use(express.static(frontendPath, staticOpts));

// Liveness + readiness probe for load balancers, uptime monitors, k8s.
// `live` returns OK as long as the process is responsive; `ready` reflects
// Mongo connectivity. Both are unauthenticated and very cheap.
app.get('/health', (req, res) => {
  const mongoState = mongoose.connection.readyState; // 1 = connected
  const ok = mongoState === 1;
  res.status(ok ? 200 : 503).json({
    status: ok ? 'ok' : 'degraded',
    uptime: Math.round(process.uptime()),
    mongo: ['disconnected','connected','connecting','disconnecting'][mongoState] || 'unknown',
    ts: new Date().toISOString()
  });
});
app.get('/api/health', (req, res) => res.redirect(301, '/health'));

const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/zipp';
const mongoOpts = {
  maxPoolSize: +process.env.MONGO_POOL_SIZE || (process.env.NODE_ENV === 'production' ? 20 : 10),
  serverSelectionTimeoutMS: 8000
};
mongoose.connect(mongoUri, mongoOpts)
  .then(() => logger.info({ poolSize: mongoOpts.maxPoolSize }, 'MongoDB connected → zipp'))
  .catch(err => {
    logger.error({ err }, 'MongoDB connection failed');
    process.exit(1);
  });

app.use('/api/config',     require('./routes/config'));
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/users',      require('./routes/users'));
app.use('/api/products',   require('./routes/products'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/cart',       require('./routes/cart'));
app.use('/api/wishlist',   require('./routes/wishlist'));
app.use('/api/orders',     require('./routes/orders'));
app.use('/api/payments',   require('./routes/payments'));
app.use('/api/coupons',    require('./routes/coupons'));
app.use('/api/delivery',   require('./routes/delivery'));
app.use('/api/admin/analytics', require('./routes/adminAnalytics'));
app.use('/api/admin',      require('./routes/admin'));
app.use('/api/reviews',    require('./routes/reviews'));
app.use('/api/warehouses', require('./routes/warehouses'));
app.use('/api/analytics',  require('./routes/analytics'));

// 404 for unknown /api/* paths; everything else falls back to the SPA shell.
app.use(notFound);
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Sentry error handler — must come BEFORE our error handler so it can
// report 5xx before the response is sanitized.
sentry.attachErrorHandler(app);

// Centralized error handler — must be the last app.use.
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
  logger.info(`Store  → http://localhost:${PORT}`);
  logger.info(`Admin  → http://localhost:${PORT}/admin.html`);
});

// Graceful shutdown — stops accepting new connections, drains in-flight,
// closes Mongo, then exits. The 10s hard timeout guards against a stuck
// connection holding the process forever.
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received — shutting down gracefully`);
  server.close((err) => {
    if (err) logger.error({ err }, 'HTTP server close failed');
    mongoose.disconnect()
      .then(() => { logger.info('clean exit'); process.exit(0); })
      .catch((mErr) => { logger.error({ err: mErr }, 'mongo disconnect failed'); process.exit(1); });
  });
  setTimeout(() => {
    logger.warn('Forcing exit after 10s graceful timeout');
    process.exit(1);
  }, 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// Catch-all so a stray promise rejection or sync throw is logged with full
// context before the process dies. Without these the default behavior on
// modern Node is termination with a single stderr line — useless in prod.
process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise }, 'Unhandled promise rejection');
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception — exiting');
  // Per Node guidance, an uncaught exception leaves the process in an
  // undefined state; let the orchestrator restart us.
  setTimeout(() => process.exit(1), 100);
});

module.exports = app;
