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
const pinoHttp = require('pino-http');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5000', 'http://127.0.0.1:5000', 'http://localhost:5500', 'http://127.0.0.1:5500'];

app.use(cors({ origin: allowedOrigins, credentials: true }));

// General API rate limit
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 1000 });
app.use('/api/', limiter);

// Stricter limit on auth endpoints to prevent brute force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many auth attempts, please try again later' }
});
app.use('/api/auth/', authLimiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Structured HTTP request logging (replaces morgan)
app.use(pinoHttp({
  logger,
  // Don't log health-check or static asset requests at info level
  customLogLevel: (req, res, err) => {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  // Skip logging for static files to reduce noise
  autoLogging: { ignore: (req) => !req.url.startsWith('/api') }
}));

const frontendPath = path.join(__dirname, '../frontend');
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(frontendPath));

mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/zipp')
  .then(() => logger.info('MongoDB connected → zipp'))
  .catch(err => {
    logger.error({ err }, 'MongoDB connection failed');
    process.exit(1);
  });

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
app.use('/api/admin',      require('./routes/admin'));
app.use('/api/reviews',    require('./routes/reviews'));
app.use('/api/warehouses', require('./routes/warehouses'));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ success: false, message: 'Not found' });
  res.sendFile(path.join(frontendPath, 'index.html'));
});

app.use((err, req, res, next) => {
  logger.error({ err, url: req.url, method: req.method }, 'Unhandled error');
  const status = err.status || 500;
  const message = process.env.NODE_ENV === 'production' && status === 500
    ? 'Internal Server Error'
    : err.message || 'Internal Server Error';
  res.status(status).json({ success: false, message });
});

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
  logger.info(`Store  → http://localhost:${PORT}`);
  logger.info(`Admin  → http://localhost:${PORT}/admin.html`);
});

// Graceful shutdown
function shutdown(signal) {
  logger.info(`${signal} received — shutting down gracefully`);
  server.close(() => {
    mongoose.disconnect().then(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

module.exports = app;
