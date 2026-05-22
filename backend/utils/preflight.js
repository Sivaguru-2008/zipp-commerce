/**
 * Pre-deploy sanity check. Run with `node utils/preflight.js` before
 * pointing real traffic at a new environment.
 *
 * Exits non-zero on any FAIL so it can gate a CI / deploy hook.
 */
require('dotenv').config();
const mongoose = require('mongoose');

const checks = [];
const fail = (name, msg) => checks.push({ name, ok: false, msg });
const pass = (name, msg) => checks.push({ name, ok: true,  msg });

function envCheck(key, { minLength = 0, forbidPlaceholders = true } = {}) {
  const v = process.env[key];
  if (!v) return fail(key, 'missing');
  if (minLength && v.length < minLength) return fail(key, `shorter than ${minLength} chars`);
  if (forbidPlaceholders && /your_|replace_with|change_me/i.test(v)) {
    return fail(key, 'still contains placeholder text');
  }
  pass(key, 'set');
}

(async () => {
  // ── Required for any production deploy ───────────────────────────────
  envCheck('NODE_ENV');
  envCheck('JWT_SECRET', { minLength: 32 });
  envCheck('MONGO_URI');
  envCheck('ALLOWED_ORIGINS');

  // ── Strongly recommended — warn but don't block ──────────────────────
  const optional = ['REDIS_URL', 'SENTRY_DSN',
    'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET',
    'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET'];
  const missingOptional = optional.filter(k => !process.env[k] || /your_/i.test(process.env[k] || ''));

  // ── MongoDB connectivity ─────────────────────────────────────────────
  if (process.env.MONGO_URI) {
    try {
      await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
      pass('mongo.connect', 'connected');
      const collections = await mongoose.connection.db.listCollections().toArray();
      pass('mongo.collections', `${collections.length} collections`);
      await mongoose.disconnect();
    } catch (e) {
      fail('mongo.connect', e.message);
    }
  }

  // ── Print report ─────────────────────────────────────────────────────
  console.log('\nPREFLIGHT REPORT');
  console.log('================');
  for (const c of checks) {
    console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name.padEnd(28)} ${c.msg}`);
  }
  if (missingOptional.length) {
    console.log('\nOptional but recommended (still placeholders):');
    missingOptional.forEach(k => console.log('  -', k));
  }
  const failed = checks.filter(c => !c.ok).length;
  console.log(`\n${failed ? `${failed} CHECK(S) FAILED` : 'ALL REQUIRED CHECKS PASSED'}`);
  process.exit(failed ? 1 : 0);
})();
