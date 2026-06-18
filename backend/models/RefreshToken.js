// Active refresh-token registry.
//
// One row per issued refresh token. We verify the JWT signature on /refresh,
// then look up jti here — if the row is gone (logout, rotation, admin revoke),
// the refresh is rejected even though the JWT itself is still valid.
//
// `expiresAt` carries a TTL index so Mongo auto-purges expired rows.

const mongoose = require('mongoose');

const refreshTokenSchema = new mongoose.Schema({
  jti:       { type: String, required: true, unique: true, index: true },
  user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  // Stored for forensic / device-management UX (revoke this session).
  userAgent: String,
  ip:        String,
  // Mongo TTL index removes the document shortly after `expiresAt` passes.
  expiresAt: { type: Date, required: true, index: { expires: 0 } }
}, { timestamps: true });

module.exports = mongoose.model('RefreshToken', refreshTokenSchema);
