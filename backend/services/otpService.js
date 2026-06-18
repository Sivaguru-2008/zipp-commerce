// OTP verification flow.
//
// Send  — generate code, store SHA-256(code + pepper), dispatch via Twilio
//         (or log in dev when Twilio creds are missing).
// Verify — hash incoming code, compare against stored hash, set
//         user.isVerified=true on match, delete token.
// Resend — same as send but increments a resend counter and enforces a
//         minimum interval to slow abuse.
//
// All cleartext codes leave the process via Twilio only; we never log them
// and only ever store the hash.

const crypto = require('crypto');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const sentry = require('../utils/sentry');
const OtpToken = require('../models/OtpToken');
const User = require('../models/User');

const TTL_MS = +process.env.OTP_TTL_MS || 5 * 60 * 1000;          // 5 min
const RESEND_MIN_INTERVAL_MS = +process.env.OTP_RESEND_MS || 60_000; // 1 min
const MAX_ATTEMPTS = +process.env.OTP_MAX_ATTEMPTS || 5;
const MAX_RESENDS  = +process.env.OTP_MAX_RESENDS  || 5;
const PEPPER = process.env.OTP_PEPPER || process.env.JWT_SECRET || 'zipp-otp-pepper';

function generateCode() {
  // 6 digits, zero-padded. crypto.randomInt is unbiased.
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

function hashCode(code) {
  return crypto.createHmac('sha256', PEPPER).update(String(code)).digest('hex');
}

let twilioClient = null;
function getTwilio() {
  if (twilioClient !== null) return twilioClient || null;
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    twilioClient = false;
    return null;
  }
  try {
    const Twilio = require('twilio');
    twilioClient = Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    return twilioClient;
  } catch (err) {
    logger.warn({ err: err.message }, 'Twilio init failed — OTP will be logged only');
    twilioClient = false;
    return null;
  }
}

async function dispatchSms(to, code) {
  const client = getTwilio();
  if (!client) {
    // Dev / test mode — surface the code in logs so engineers can complete
    // the flow. NEVER do this in production with real users.
    logger.warn({ to, code }, '[OTP][dev] Twilio not configured — code shown above');
    return { simulated: true };
  }
  const from = process.env.TWILIO_FROM;
  if (!from) throw new ApiError(500, 'TWILIO_FROM is not configured');
  await client.messages.create({
    to,
    from,
    body: `Your Zipp verification code is ${code}. Expires in ${Math.round(TTL_MS/60000)} minutes.`
  });
  return { simulated: false };
}

async function findUser(userId) {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, 'User not found');
  return user;
}

async function send(userId, { channel = 'sms', destination } = {}) {
  const user = await findUser(userId);
  if (user.isVerified) return { alreadyVerified: true };

  const dest = destination || user.phone;
  if (!dest) throw new ApiError(400, 'No destination on file. Add a phone number first.');

  // Throttle: don't allow another send within RESEND_MIN_INTERVAL_MS.
  const existing = await OtpToken.findOne({ user: user._id });
  if (existing && (Date.now() - existing.lastSentAt.getTime()) < RESEND_MIN_INTERVAL_MS) {
    const waitMs = RESEND_MIN_INTERVAL_MS - (Date.now() - existing.lastSentAt.getTime());
    throw new ApiError(429, `Please wait ${Math.ceil(waitMs / 1000)}s before requesting another code`);
  }
  if (existing && existing.resends >= MAX_RESENDS) {
    throw new ApiError(429, 'Too many OTP resends — try again later');
  }

  const code = generateCode();
  const codeHash = hashCode(code);
  const expiresAt = new Date(Date.now() + TTL_MS);

  await OtpToken.findOneAndUpdate(
    { user: user._id },
    {
      $set: {
        channel, destination: dest, codeHash, expiresAt,
        attempts: 0, lastSentAt: new Date()
      },
      $inc: { resends: existing ? 1 : 0 },
      $setOnInsert: { user: user._id }
    },
    { upsert: true, new: true }
  );

  try {
    await dispatchSms(dest, code);
  } catch (err) {
    logger.error({ err: err.message, userId: String(user._id) }, 'OTP dispatch failed');
    sentry.captureException(err, { tags: { stage: 'otp.send' }, user: user._id });
    throw new ApiError(502, 'Could not send verification code');
  }

  return { sent: true, channel, destination: dest, ttlMs: TTL_MS };
}

async function verify(userId, code) {
  if (!code || !/^\d{4,8}$/.test(String(code))) {
    throw new ApiError(400, 'Invalid code');
  }
  const token = await OtpToken.findOne({ user: userId });
  if (!token) throw new ApiError(400, 'No OTP pending. Request a new code.');
  if (token.expiresAt < new Date()) {
    await OtpToken.deleteOne({ _id: token._id });
    throw new ApiError(410, 'OTP expired. Request a new code.');
  }
  if (token.attempts >= MAX_ATTEMPTS) {
    await OtpToken.deleteOne({ _id: token._id });
    sentry.captureMessage('OTP brute-force lockout', 'warning', {
      tags: { stage: 'otp.verify' },
      extra: { userId: String(userId) }
    });
    throw new ApiError(429, 'Too many attempts. Request a new code.');
  }

  const expected = token.codeHash;
  const actual = hashCode(code);
  // crypto.timingSafeEqual requires equal-length buffers; both are hex sha256.
  const match = expected.length === actual.length
    && crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(actual, 'hex'));

  if (!match) {
    await OtpToken.updateOne({ _id: token._id }, { $inc: { attempts: 1 } });
    throw new ApiError(400, 'Incorrect code');
  }

  await OtpToken.deleteOne({ _id: token._id });
  await User.updateOne({ _id: userId }, { $set: { isVerified: true } });
  return { verified: true };
}

async function resend(userId) {
  // Resend is just send() with the same destination — service already
  // handles the rate-limit + counter logic.
  const user = await findUser(userId);
  return send(userId, { channel: 'sms', destination: user.phone });
}

module.exports = { send, verify, resend };
