const crypto = require('crypto');

// Attach an x-request-id to every request (echoes incoming header if present).
// pino-http picks it up automatically via the genReqId hook configured in
// server.js, so every log line gets req.id for correlation.

module.exports = function requestId(req, res, next) {
  const incoming = req.headers['x-request-id'];
  const id = (typeof incoming === 'string' && incoming.length <= 128 && incoming.length > 0)
    ? incoming
    : crypto.randomUUID();
  req.id = id;
  res.setHeader('x-request-id', id);
  next();
};
