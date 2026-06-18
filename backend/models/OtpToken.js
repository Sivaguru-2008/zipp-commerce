// OTP token store.
//
// Holds the *hash* of a 6-digit code (never the cleartext), bound to a
// user + channel (sms/email). TTL index reaps expired tokens. We keep a
// running attempt count so brute-force can be rejected after a small N.

const mongoose = require('mongoose');

const otpTokenSchema = new mongoose.Schema({
  user:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  channel:    { type: String, enum: ['sms', 'email'], default: 'sms' },
  destination: String,                            // phone number / email used
  codeHash:   { type: String, required: true },   // sha256(code + pepper)
  attempts:   { type: Number, default: 0 },
  resends:    { type: Number, default: 0 },
  lastSentAt: { type: Date,   default: Date.now },
  expiresAt:  { type: Date,   required: true, index: { expires: 0 } }
}, { timestamps: true });

module.exports = mongoose.model('OtpToken', otpTokenSchema);
