const multer = require('multer');
const logger = require('../utils/logger');
const ApiError = require('../utils/ApiError');
const metrics = require('../utils/metrics');
const sentry = require('../utils/sentry');

// 404 handler — mounted after all routes, before errorHandler.
function notFound(req, res, next) {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ success: false, message: 'Not found' });
  }
  return next();
}

// Central error handler — formats every error as
//   { success: false, message, errors? }
// Inspects error type so callers don't need to translate Mongo/JWT/Multer
// errors manually.
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  let status = err.status || err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let errors = err.errors || null;

  // express-validator failures (we throw them as ApiError too, but defensively
  // handle the raw array form).
  if (Array.isArray(err) && err[0] && err[0].msg) {
    status = 422;
    message = 'Validation failed';
    errors = err;
  }

  // Mongoose validation
  if (err.name === 'ValidationError') {
    status = 422;
    message = 'Validation failed';
    errors = Object.values(err.errors || {}).map(e => ({
      field: e.path,
      message: e.message
    }));
  }

  // Bad ObjectId etc.
  if (err.name === 'CastError') {
    status = 400;
    message = `Invalid ${err.path}: ${err.value}`;
  }

  // Duplicate key
  if (err.code === 11000) {
    status = 409;
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    message = `Duplicate value for ${field}`;
    errors = err.keyValue;
  }

  // JWT
  if (err.name === 'JsonWebTokenError') {
    status = 401;
    message = 'Invalid token';
  }
  if (err.name === 'TokenExpiredError') {
    status = 401;
    message = 'Token expired';
  }

  // Multer upload errors
  if (err instanceof multer.MulterError) {
    status = 400;
    if (err.code === 'LIMIT_FILE_SIZE') message = 'File too large (max 5MB)';
    else if (err.code === 'LIMIT_FILE_COUNT') message = 'Too many files';
    else message = err.message;
  }

  // 5xx should be logged with the full stack; 4xx are usually user errors
  // and don't need stack traces in the log stream.
  if (status >= 500) {
    logger.error({ err, url: req.url, method: req.method }, 'Unhandled error');
    // Belt-and-braces report to Sentry — its own express middleware also
    // catches these, but this path runs even on synchronous errors that
    // bypass the framework integration.
    sentry.captureException(err, {
      user: req.user && req.user._id,
      tags: { route: req.path, method: req.method },
      extra: { url: req.originalUrl, requestId: req.id }
    });
  } else {
    logger.warn({ err: err.message, url: req.url, method: req.method, status }, 'Request error');
  }

  // Fire-and-forget metric — never blocks the response.
  metrics.recordError(status).catch(() => {});

  // Hide internals in production for 5xx
  if (status === 500 && process.env.NODE_ENV === 'production') {
    message = 'Internal Server Error';
    errors = null;
  }

  const body = { success: false, message };
  if (errors) body.errors = errors;
  res.status(status).json(body);
}

module.exports = { errorHandler, notFound };
