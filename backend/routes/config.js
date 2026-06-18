// Public runtime config endpoint.
//
// Lets the static frontend learn server-side feature flags + DSNs without
// hardcoding them at build time. Anything returned here is treated as
// public — never put a secret in this response.

const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.set('Cache-Control', 'public, max-age=60'); // short cache; flags rare-changing
  res.json({
    success: true,
    config: {
      env: process.env.NODE_ENV || 'development',
      release: process.env.SENTRY_RELEASE || null,
      sentryDsn: process.env.SENTRY_DSN_PUBLIC || null,
      razorpayKey: process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_ID !== 'your_razorpay_key_id'
        ? process.env.RAZORPAY_KEY_ID
        : null,
      features: {
        otpRequired:   !!process.env.TWILIO_ACCOUNT_SID && process.env.OTP_REQUIRED !== 'false',
        transactions:  true
      }
    }
  });
});

module.exports = router;
