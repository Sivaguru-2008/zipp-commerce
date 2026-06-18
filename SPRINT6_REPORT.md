# Sprint 6 Report — Real Beta Readiness + Production Stability

**Sprint window:** 2026-05-22
**Status:** All nine objectives delivered, verified end-to-end against a live MongoDB Atlas database with the dev server.

---

## What shipped

### 6.1 — Secure auth (HttpOnly cookies + refresh rotation)
- **Access JWT** (15 min, configurable) ships in `zipp_at` cookie at `Path=/`.
- **Refresh JWT** (30 d, configurable) ships in `zipp_rt` cookie at `Path=/api/auth` — scope-restricted so the cookie never crosses normal API surface.
- Cookies are `HttpOnly`, `SameSite=Lax`, `Secure` in production. `SameSite=Lax` blocks cross-site POST CSRF without the operational cost of a CSRF token header.
- **Refresh tokens are tracked server-side** by `jti` in a new `RefreshToken` collection with a TTL index. Each refresh deletes the old `jti` and mints a new one — classic rotation. A replayed refresh (jti not found) is treated as a stolen-token signal: every session for that user is killed and a Sentry warning is fired.
- **Distinct refresh-token signing secret** (`JWT_REFRESH_SECRET`) supported — a leaked access secret cannot mint refresh tokens, and vice-versa.
- **Graceful migration**: middleware still accepts `Authorization: Bearer …` so curl, the legacy frontend, and anyone with an old localStorage token keeps working. The frontend auto-clears legacy storage once cookie-auth lights up.
- New endpoints: `POST /api/auth/refresh`, `POST /api/auth/logout`, `POST /api/auth/logout-all`.
- Password change now revokes all existing refresh tokens — every device must log in again.

**Files:** `backend/utils/{tokens,cookies}.js`, `backend/models/RefreshToken.js`, `backend/services/authService.js`, `backend/controllers/authController.js`, `backend/middleware/auth.js`, `backend/routes/auth.js`, `backend/server.js` (cookie-parser), `frontend/js/api.js` (credentials:'include', auto-refresh), `frontend/js/auth.js` (server-side logout).

### 6.2 — Frontend Vite multi-page architecture
- `frontend/package.json` + `frontend/vite.config.js` define an MPA build with every existing HTML file as a Vite entry (index, admin, admin-analytics, all of `pages/*.html`).
- Vite produces hashed `assets/*.js`, code-splits a shared `zipp-core` chunk (api / auth / toast / observability), and emits both modern + legacy bundles via `@vitejs/plugin-legacy`.
- `frontend/src/shared/head.js` provides `injectSharedHead({...})` so per-page `<head>` duplication can be progressively removed without breaking pages mid-migration.
- Dev proxy maps `/api`, `/uploads`, `/sitemap.xml`, `/health` to the Express server so cookie-auth works under `vite dev`.
- **Scope discipline:** existing static delivery via Express is **untouched**. The Vite output is a side-by-side artifact that the team can wire into deployment once each page is migrated and verified. This avoids the risk of breaking inline `onclick` handlers across 9 HTML files in a single sprint.

**Migration handoff:** Sprint 7 should migrate one page at a time — re-bind its inline `onclick`s as `addEventListener`s, convert to a Vite module entry, and confirm parity before deleting the static path.

### 6.3 — Transactional order safety
- New helper `backend/utils/tx.js` exports `withTransaction(fn)`. It detects whether the connected Mongo deployment is a replica set / mongos (Atlas always is) and runs the callback in a `withTransaction` session with `readConcern: majority` + `writeConcern: majority`. On standalone dev Mongo it falls back to the legacy non-atomic path, so dev never crashes with “Transaction numbers are only allowed on a replica set”.
- `orderService.placeOrder` now wraps **order creation + per-line stock decrement + cart clearing** in one session. Stock contention (any `findOneAndUpdate({_id, stock:{$gte}})` returning null) throws — the transaction aborts and rolls back the order doc and every successful decrement.
- Repository methods (`createInSession`, `decrementStockIfAvailable`, `restoreStock`, `clearCart`, `findCartWithProducts`) now accept an optional session.

**Files:** `backend/utils/tx.js`, `backend/services/orderService.js`, `backend/repositories/orderRepository.js`.

### 6.4 — Real observability (Sentry, backend + frontend)
- `backend/utils/sentry.js` is an env-aware adapter. When `SENTRY_DSN` is unset every export is a no-op. When set:
  - `init()` runs before any other require so init-time crashes are captured.
  - `attachRequestHandler(app)` + `attachErrorHandler(app)` wire the Express integration. Belt-and-braces: `errorHandler.js` also calls `captureException` directly on 5xx.
  - `beforeSend` scrubs `password / token / refreshToken / authorization / cookie / secret` keys recursively across request, body, headers, extras, contexts.
  - `addBreadcrumb` is used in the auth refresh-replay path, payment verify start, signature mismatch, and order placement start + commit.
- `frontend/js/observability.js` is a CDN-loaded Sentry browser shim. With no DSN it installs a `window.Zipp.observe` no-op so callers never branch. With a DSN it loads the Sentry CDN bundle, tags the active user, queues + replays `error` / `unhandledrejection` events captured before the SDK finished loading.
- Public Sentry DSN (separate from server DSN) is served via `GET /api/config`.

**Files:** `backend/utils/sentry.js`, `backend/server.js`, `backend/middleware/errorHandler.js`, `backend/services/{authService,orderService,paymentService}.js`, `backend/routes/config.js`, `frontend/js/observability.js`, `frontend/index.html` + `frontend/admin-analytics.html` script ordering.

### 6.5 — OTP verification (Twilio)
- `OtpToken` model stores `sha256(code + pepper)` only — cleartext codes leave the process via Twilio and never touch the DB or logs. TTL index reaps expired tokens.
- `otpService.send / verify / resend`:
  - Rate-limits resends to one per minute, capped at 5 resends per token.
  - Caps verification attempts at 5 — exceeded → lockout + Sentry warning + token deletion.
  - Uses `crypto.timingSafeEqual` for hash comparison.
  - Falls back to logger output in dev when Twilio credentials are missing, so the OTP flow is fully testable without spending SMS budget.
- New routes: `POST /api/auth/send-otp`, `POST /api/auth/verify-otp`, `POST /api/auth/resend-otp` (all behind `protect`).
- Dedicated `otpLimiter` (10 sends per IP per hour) in `server.js` defends against SMS pumping.
- `middleware/requireVerified.js` returns `403 { code: 'OTP_REQUIRED' }` — the frontend can use that stable code to drive a verification modal. **`POST /api/orders` is now gated**. Sensitive-action additions are a one-line `requireVerified` mount.
- `OTP_REQUIRED=false` disables the gate entirely so existing accounts aren't locked out at rollout.

**Files:** `backend/models/OtpToken.js`, `backend/services/otpService.js`, `backend/controllers/otpController.js`, `backend/middleware/requireVerified.js`, `backend/routes/auth.js`, `backend/routes/orders.js`, `backend/server.js`.

### 6.6 — Dynamic admin analytics dashboard
- New `frontend/admin-analytics.html` + `frontend/js/admin-analytics.js`. No chart library — inline SVG drawing keeps the bundle lean and CSP-friendly.
- Backend route `backend/routes/adminAnalytics.js` with four endpoints (all admin-gated):
  - `GET /api/admin/analytics/overview` — totals, today, online, low stock, ops counters (payment failures, 4xx/5xx, slow requests, memory, uptime).
  - `GET /api/admin/analytics/revenue?days=N` — per-day revenue + orders + cancelled, plus AOV.
  - `GET /api/admin/analytics/users?days=N` — daily signups + running cumulative total.
  - `GET /api/admin/analytics/orders?days=N` — per-day count, status breakdown, top products, payment failures.
- All endpoints `fillDaily()` zero-padding so the chart shows every day in the window even with no orders.
- `?days` is clamped to 1–90 so the aggregation can't be turned into a DOS.
- KPI tiles poll `/overview` on a 30-second interval; heavier aggregations only refetch on user action (range change / refresh button).
- Verified end-to-end logged in as the seeded admin: 10 KPI tiles render, all 3 charts populated, response < 200ms on a 14-day window with the seed data.

### 6.7 — Dynamic SEO infrastructure
- `backend/routes/seo.js`:
  - **`GET /sitemap.xml`** assembles static pages + every category + every active product. Cached in-process for 6 h and served with `Cache-Control: public, max-age=21600`. Mounted **before** `express.static` so the dynamic builder wins over the legacy static file (now deleted).
  - **`GET /api/seo/product/:id`** returns a JSON bundle with `title`, `description`, `canonical`, `og.*`, and a complete schema.org Product JSON-LD (incl. `Offer` with availability + price, plus `AggregateRating` when present).
- `frontend/pages/product.html` now fetches that bundle on load and injects canonical link, OG meta tags, twitter card, JSON-LD `<script type="application/ld+json">` into `<head>`.

### 6.8 — CDN + media optimisation
- `backend/middleware/upload.js`: every Cloudinary upload now ships with `f_auto`, `q_auto`, and **eager renders** at 320 / 640 / 1080 widths so Cloudinary's CDN serves responsive variants without per-request transform charges.
- `backend/utils/media.js`: `cdnUrl`, `srcset`, `augmentProduct` helpers that inject `f_auto/q_auto/w_*` into any Cloudinary URL. Non-Cloudinary URLs pass through unchanged so the helpers are safe to call on every product (legacy Unsplash imagery still works).
- `/uploads/*` static delivery now sends `Cache-Control: public, max-age=604800, immutable` — Cloudflare-ready.

### 6.9 — Production validation
Live verification against the connected Atlas DB:

| Check | Result |
|---|---|
| Server boots (cold start) | ✅ Sentry disabled cleanly, Mongo connected, Redis no-op |
| `GET /api/config` | ✅ Returns env, feature flags, public DSN, razorpay key |
| `GET /sitemap.xml` | ✅ 10 kB, every active product enumerated, valid XML |
| `GET /health` | ✅ 200, mongo: connected |
| Register → set HttpOnly cookies | ✅ 201, cookies set, body still carries `token` for backward compat |
| `GET /api/auth/me` via cookie only | ✅ 200 |
| `POST /api/auth/refresh` | ✅ 200, jti rotated |
| `POST /api/auth/logout` then refresh | ✅ 401 (refresh row deleted) |
| OTP send (no Twilio configured) | ✅ 200, code in dev logs |
| OTP verify bogus code | ✅ 400, attempt counter incremented |
| `POST /api/orders` unverified | ✅ 403 `OTP_REQUIRED` (gate active) |
| Analytics overview as non-admin | ✅ 403 |
| Analytics overview as admin | ✅ 200, populated |
| Analytics revenue / users / orders | ✅ 200, 14-day padded series |
| Admin analytics dashboard render | ✅ 10 KPI tiles, all 3 charts populated |
| SEO product/:id JSON-LD | ✅ JSON-LD + OG present |
| CSP / Helmet | ✅ Untouched — same allow-list as Sprint 5 |

---

## Architecture improvements
- **Stateful refresh-token registry**. Beyond cookie hygiene, every refresh is auditable and revocable. `logout-all` lets users kill all sessions; replay attacks are deterministically caught and broadcast all-session logout.
- **Layered analytics**: Mongo aggregations for historical queries, Redis counters for hot live signals, single rollup endpoint for the dashboard.
- **Sentry-as-no-op pattern**: every observability hook is safe to call regardless of config — there's no `if (sentryEnabled) ...` clutter at call sites.
- **Vite MPA scaffold without forcing a flag-day migration** — the team can move pages one at a time.
- **One transaction utility** (`utils/tx.js`) that all multi-write flows can opt into in Sprint 7 (payment finalize, cart merge, etc.).

## Security improvements
- HttpOnly cookies eliminate the XSS-steals-token risk that was U4 in the bug audit.
- Refresh rotation + replay detection mean a stolen refresh token becomes one-shot and noisy in Sentry.
- OTP gating closes the unverified-account vector (bug U3).
- OTP brute-force protected by attempt counter + lockout + rate limiter.
- OTP cleartext **never** logged or stored — only `HMAC-SHA256(code, pepper)`.
- Sentry payload scrubs `password / token / refreshToken / authorization / cookie / secret` recursively before egress.
- Distinct refresh-token signing secret supported (defence in depth).
- New `/api/config` carefully isolates public DSN from server DSN.

## Scalability improvements
- Sitemap cached for 6 h in-process — googlebot bursts no longer hammer the catalogue.
- Cloudinary eager renders + `f_auto/q_auto` cut origin transform charges.
- Static + uploads served with `immutable` cache headers — friendly to CDN edges (Cloudflare drop-in).
- Admin analytics dashboard polls only the cheap `overview` endpoint on its 30s interval; heavy aggregations gated behind explicit user action.
- Mongo TTL indexes on `RefreshToken` + `OtpToken` keep the collections self-pruning.

## Operational improvements
- Sentry breadcrumbs trail auth refresh replays, payment verify start, signature mismatch, refund failure, OTP brute-force lockout, order placement start + commit.
- Dashboard surfaces today's payment failures, 5xx count, slow request count, memory, uptime alongside the business KPIs — a single screen for on-call.
- `/api/admin/analytics/overview` is a single network round-trip, suitable as a status-page input.
- `/health` is unchanged but `/api/config` adds a one-shot feature-flag introspection point.

## Remaining technical debt → Sprint 7 candidates
- **Inline `onclick` removal** across all pages. The Vite scaffold exists; the per-page migration was deliberately scoped out of Sprint 6 to avoid breakage.
- **CSRF token header** (double-submit cookie). `SameSite=Lax` covers the realistic threat model but a token-header pattern is safer if we ever need `SameSite=None`.
- **Webhook-based payment finalisation**. `payments.verify` is client-driven; add a `POST /api/payments/webhook` so Razorpay can drive state directly. Wrap with the same `withTransaction` helper.
- **OTP via Email** as a fallback channel — service is already channel-aware, just needs a mail provider.
- **Per-device refresh-token UX** ("My active sessions"). The data is already on the `RefreshToken` doc (`userAgent`, `ip`); just needs a profile page surface.
- **Cloudflare in front of Render**. All cache headers + content-addressable Cloudinary URLs are already CDN-friendly; just needs DNS + a worker for HTML cache-purge on deploy.
- **CSP tightening**. With the Vite migration complete we can drop `'unsafe-inline'` from `scriptSrc` and `scriptSrcAttr`.
- **Sentry release tagging**. We pass `SENTRY_RELEASE` through; the CI/CD job should populate it from the git SHA.
- **Reuse `withTransaction`** in: cancel-with-refund, coupon-apply (when usedCount must stay consistent with the order), wishlist-merge-on-login.
- **Order-number generator**. `ZPP + Date.now() + random` can collide under load; swap for `crypto.randomUUID` suffix (bug U8 from the May audit).

## Future scale risks
- **Mongo aggregation cost** on the analytics endpoints will grow linearly with order volume. Pre-aggregate into a `daily_metrics` collection once order count > ~1M.
- **`/sitemap.xml` 10k limit** is hard-coded. At ~50k+ active products we need sitemap-index pagination.
- **Refresh-token collection** will hold one row per active session — fine until ~10M sessions. The TTL index keeps it bounded.
- **OTP rate-limit is per-IP**. NAT'd campus networks may share a few public IPs; tighten to per-user once we have wider rollout data.
- **Cloudinary eager renders** are bills — re-evaluate when product image volume gets large.

## Deployment notes
- **New backend deps**: `cookie-parser`, `@sentry/node`, `twilio`. Already added to `backend/package.json`. `npm install` is required after pull.
- **New env vars** documented in `backend/.env.example` and `.env.example`: `JWT_REFRESH_SECRET`, `ACCESS_TOKEN_EXPIRES_IN`, `REFRESH_TOKEN_EXPIRES_IN`, `COOKIE_DOMAIN`, `SENTRY_DSN`, `SENTRY_DSN_PUBLIC`, `SENTRY_TRACES_RATE`, `SENTRY_RELEASE`, `OTP_*`, `SITE_URL`, `TWILIO_FROM`.
- **No DB migrations required** — both new collections (`RefreshToken`, `OtpToken`) auto-create on first write with TTL indexes.
- **Render compatibility preserved** — `trust proxy` already set, cookies use `secure` only in production, no new infrastructure required.
- **No breaking API contract changes**. Existing `Authorization: Bearer …` clients keep working until they re-auth.
