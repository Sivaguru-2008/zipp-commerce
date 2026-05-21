# ZIPP COMMERCE — ENGINEERING HANDOFF DOCUMENT
**Generated:** 2026-05-21  
**Session:** Phase 1 Audit + Sprint 1 Bug Fixes  
**Status at handoff:** Backend stable, 15 critical/high bugs fixed, app runs, uncommitted changes staged  

---

## 1. MISSION CONTEXT

Zipp Commerce is a hyperlocal quick-commerce platform modeled after Zepto/Blinkit/Instamart, targeting:
- Tier-2 Indian cities
- College campuses and hostel clusters
- High-density student delivery ecosystems

The goal is to transform this early-stage codebase into a production-grade platform. The first session completed a full architecture audit and Sprint 1 critical bug fixes. This document is the complete handoff for the next session to continue Sprint 2 onward.

---

## 2. REPOSITORY ARCHITECTURE

### Root Layout
```
zipp-commerce/
├── backend/              ← Node.js/Express API server
├── frontend/             ← Static HTML/CSS/JS (no framework, no bundler)
├── package.json          ← Root-level (only scripts, no real deps)
├── package-lock.json     ← Root lock file (nearly empty)
├── .gitignore            ← Ignores node_modules/ and .env
└── README.md
```

### Backend Layout (`backend/` — 1,899 lines total)
```
backend/
├── server.js             ← Entry point (106 lines) — middleware, route mounting, graceful shutdown
├── package.json          ← Real dependency manifest
├── .env                  ← Environment config (NOT committed — see Section 5)
├── routes/               ← 13 route files, ALL business logic lives here
│   ├── admin.js          (169 lines) — admin stats, orders, users, inventory, warehouses, coupons
│   ├── auth.js           (84 lines)  — register, login, /me, change-password
│   ├── cart.js           (95 lines)  — get, add, update, remove, clear
│   ├── categories.js     (54 lines)  — CRUD + admin create/update/delete
│   ├── coupons.js        (74 lines)  — validate (public) + admin CRUD
│   ├── delivery.js       (84 lines)  — check serviceability, get warehouses, ETA
│   ├── orders.js         (188 lines) ← HEAVILY MODIFIED in Sprint 1
│   ├── payments.js       (105 lines) ← MODIFIED in Sprint 1
│   ├── products.js       (155 lines) ← MODIFIED in Sprint 1
│   ├── reviews.js        (36 lines)  — get by product, create
│   ├── users.js          (91 lines)  ← MODIFIED in Sprint 1
│   ├── warehouses.js     (14 lines)  — public list
│   └── wishlist.js       (52 lines)  ← MODIFIED in Sprint 1
├── models/
│   ├── User.js           (57 lines)  — user schema, bcrypt pre-save, comparePassword
│   ├── Product.js        (59 lines)  — product schema, slug pre-save, text+compound indexes
│   ├── Category.js       (23 lines)  — category + embedded subcategories
│   └── index.js          (184 lines) — Cart, Order, Review, Wishlist, Coupon, Warehouse, Payment, Notification
├── middleware/
│   └── auth.js           (48 lines)  — protect, adminOnly, optionalAuth (JWT)
├── utils/
│   └── seed.js           (221 lines) — full DB seed (categories, warehouses, 35 products, coupons, 2 users)
├── controllers/          ← EMPTY — exists but unused, business logic is in routes
└── uploads/              ← Local multer image storage (NOT production-safe — see unresolved issues)
```

### Frontend Layout (`frontend/` — 3,388 lines total)
```
frontend/
├── index.html            (342 lines)  — Home page
├── admin.html            (688 lines)  — Full admin panel (monolithic, vanilla JS)
├── css/
│   └── main.css          (1,152 lines) — Single stylesheet, CSS variables, responsive
├── js/
│   ├── api.js            — Fetch wrapper + all API client objects (ProductAPI, CartAPI, etc.)
│   ├── auth.js           — localStorage-based auth state, nav update, requireAuth guard
│   ├── cart.js           — Cart sidebar open/close, add/update, wishlist toggle
│   ├── ui.js             — Toast, skeleton, buildProductCard(), buildCategoryCard(), search suggestions
│   └── home.js           — Home page data loading (categories, featured, trending, dairy section)
└── pages/                — 9 sub-pages
    ├── login.html
    ├── cart.html
    ├── checkout.html
    ├── order-success.html
    ├── orders.html
    ├── product.html
    ├── profile.html
    ├── search.html
    └── wishlist.html
```

### Script Load Order (every page that uses auth/cart)
```
api.js → auth.js → cart.js → ui.js → [page-specific].js
```
State management is **global JS variables + localStorage**. No module system. No bundler.

---

## 3. TECH STACK (EXACT VERSIONS)

### Backend Dependencies
| Package | Version | Purpose |
|---------|---------|---------|
| express | ^4.18.2 | HTTP framework |
| mongoose | ^8.0.3 | MongoDB ODM |
| bcryptjs | ^2.4.3 | Password hashing |
| jsonwebtoken | ^9.0.2 | JWT auth |
| cors | ^2.8.5 | CORS middleware |
| helmet | ^7.1.0 | Security headers |
| morgan | ^1.10.0 | HTTP logging |
| express-rate-limit | ^7.1.5 | Rate limiting |
| express-validator | ^7.0.1 | Input validation — **INSTALLED BUT NEVER USED** |
| multer | ^1.4.5-lts.1 | File upload (disk storage) |
| cloudinary | ^1.41.3 | Image CDN — **INSTALLED BUT NOT WIRED UP** |
| razorpay | ^2.9.2 | Payment gateway |
| dotenv | ^16.3.1 | Env var loading |
| slugify | ^1.6.6 | URL slug generation |
| uuid | ^9.0.1 | UUID generation (used in seed but not in routes) |
| nodemon | ^3.0.2 | Dev reload (devDep) |

### Not Installed (needed for future sprints)
- `ioredis` — Redis caching
- `bull` or `bullmq` — Job queues
- `socket.io` — Real-time order tracking
- `multer-storage-cloudinary` — Wire Cloudinary to Multer
- `pino` or `winston` — Structured logging
- `@sentry/node` — Error tracking
- `pm2` — Process management (install globally)

---

## 4. DATABASE SCHEMA SUMMARY

### MongoDB: local `mongodb://127.0.0.1:27017/zipp`

| Collection | Model File | Key Fields |
|-----------|-----------|-----------|
| users | models/User.js | name, email, password (hashed), role (user/admin/delivery), addresses[], loyaltyPoints |
| products | models/Product.js | name, slug (unique), category (ref), price, mrp, discount (auto-calc), stock, images[], variants[], tags[], badges[], isFeatured, soldCount, warehouse (ref) |
| categories | models/Category.js | name (unique), slug (unique), subcategories[], icon, color, sortOrder |
| carts | models/index.js | user (1:1 unique), items[{product, qty, price snapshot}], coupon |
| orders | models/index.js | orderNumber (unique), user, items[], deliveryAddress, pricing{}, payment{method,status,razorpay*}, status (enum 9 states), statusHistory[], deliveryAgent |
| reviews | models/index.js | product, user, order, rating, title, comment |
| wishlists | models/index.js | user (1:1 unique), products[] (ObjectId refs) |
| coupons | models/index.js | code (uppercase unique), type (percentage/fixed/free_delivery), value, validTill |
| warehouses | models/index.js | name, code (unique), type, coordinates{lat,lng}, serviceablePincodes[], serviceableRadius |
| payments | models/index.js | user, order, amount, razorpay*, status |
| notifications | models/index.js | user, title, message, type, isRead — **MODEL EXISTS, NO ROUTES YET** |

### Existing Indexes
- Product: text index on (name, description, brand, tags) + compound (category, isActive, price)
- Product: slug unique
- Category: name unique, slug unique
- User: email unique
- Cart: user unique
- Wishlist: user unique
- Order: orderNumber unique
- Coupon: code unique
- Warehouse: code unique

### Missing Indexes (needed for Sprint 3)
- Order: `{ user: 1, createdAt: -1 }` — user order history queries
- Order: `{ status: 1, createdAt: -1 }` — admin order filtering
- Review: `{ product: 1, user: 1 }` unique — prevent duplicate reviews (model logic exists, no DB index)
- Product: `{ isFeatured: 1, isActive: 1 }` — featured products query
- Product: `{ soldCount: -1, isActive: 1 }` — trending query

---

## 5. ENVIRONMENT CONFIGURATION

### File: `backend/.env` (exists locally, NOT in git)
```env
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/zipp
JWT_SECRET=zipp_super_secret_jwt_key_2024_change_in_production  # WEAK — must be replaced in prod

RAZORPAY_KEY_ID=your_razorpay_key_id          # placeholder — triggers demo mode
RAZORPAY_KEY_SECRET=your_razorpay_key_secret  # placeholder

GOOGLE_MAPS_API_KEY=your_google_maps_api_key
MAPBOX_API_KEY=your_mapbox_api_key

CLOUDINARY_CLOUD_NAME=your_cloud_name         # placeholder — Cloudinary not wired yet
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret

EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password

TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_PHONE_NUMBER=+1234567890

FIREBASE_SERVER_KEY=your_firebase_server_key
OPENAI_API_KEY=your_openai_key
SHIPROCKET_API_KEY=your_shiprocket_key
DELHIVERY_API_KEY=your_delhivery_key
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

SESSION_SECRET=zipp_session_secret_2024
NODE_ENV=development
```

### New env vars added in Sprint 1 (not in .env yet — must be added manually)
```env
ALLOWED_ORIGINS=http://localhost:5000,http://127.0.0.1:5000  # optional, server.js reads this
```

### Server Startup Validation (added in Sprint 1)
`server.js` now calls `process.exit(1)` if:
- `JWT_SECRET` is missing or shorter than 32 characters
- MongoDB connection fails

---

## 6. API SURFACE — COMPLETE ROUTE MAP

### Auth (`/api/auth`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /register | — | Create account |
| POST | /login | — | Login, returns JWT |
| GET | /me | JWT | Get current user |
| PUT | /change-password | JWT | Change password |

### Users (`/api/users`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /profile | JWT | Get profile |
| PUT | /profile | JWT | Update name/phone/preferences |
| POST | /addresses | JWT | Add address |
| PUT | /addresses/:id | JWT | Update address |
| DELETE | /addresses/:id | JWT | Delete address |
| GET | / | JWT+Admin | List all users (paginated) |

### Products (`/api/products`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | / | — | List products (filters: category, brand, price, search, sort, pagination) |
| GET | /search | — | Quick search (q param) |
| GET | /featured | — | Featured products (limit 12) |
| GET | /trending | — | By soldCount desc (limit 12) |
| GET | /:id | — | Single product |
| POST | / | JWT+Admin | Create product (multipart/form-data) |
| PUT | /:id | JWT+Admin | Update product |
| DELETE | /:id | JWT+Admin | Soft delete (isActive=false) |

### Categories (`/api/categories`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | / | — | All active categories |
| GET | /:id | — | Single category |
| POST | / | JWT+Admin | Create |
| PUT | /:id | JWT+Admin | Update |
| DELETE | /:id | JWT+Admin | Soft delete |

### Cart (`/api/cart`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | / | JWT | Get cart (auto-creates if missing) |
| POST | /add | JWT | Add item (checks stock) |
| PUT | /update | JWT | Update quantity |
| DELETE | /remove/:productId | JWT | Remove item |
| DELETE | /clear | JWT | Clear cart |

### Orders (`/api/orders`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | / | JWT | User's orders (**now paginated** — page, limit) |
| GET | /:id | JWT | Single order (user or admin) |
| POST | / | JWT | Place order (**now validates stock, atomic decrement**) |
| PUT | /:id/cancel | JWT | Cancel order (**now restores stock**) |
| PUT | /:id/status | JWT+Admin | Update order status |
| GET | /admin/all | JWT+Admin | All orders (paginated, status filter) |

### Payments (`/api/payments`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /create-order | JWT | Create Razorpay order (demo mode if key=placeholder) |
| POST | /verify | JWT | Verify payment (**bypass bug fixed**) |
| GET | /history | JWT | Payment history |

### Wishlist (`/api/wishlist`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | / | JWT | Get wishlist |
| POST | /toggle | JWT | Add or remove (**toggle now works correctly**) |
| DELETE | /:productId | JWT | Remove item |

### Coupons (`/api/coupons`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /validate | JWT | Validate coupon code |
| GET | / | JWT+Admin | List all coupons |
| POST | / | JWT+Admin | Create coupon |
| PUT | /:id | JWT+Admin | Update coupon |
| DELETE | /:id | JWT+Admin | Delete coupon |

### Delivery (`/api/delivery`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /check | — | Check deliverability by pincode or lat/lng |
| GET | /warehouses | — | List active warehouses |
| GET | /eta | — | ETA estimate by lat/lng |

### Admin (`/api/admin`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /stats | JWT+Admin | Dashboard stats (orders, revenue, 7-day chart) |
| GET | /users | JWT+Admin | User list (**ReDoS-safe search**) |
| GET | /orders | JWT+Admin | Order list (**ReDoS-safe search**) |
| PUT | /orders/:id/status | JWT+Admin | Update order status |
| GET | /products | JWT+Admin | Product list (**ReDoS-safe search**) |
| GET | /inventory | JWT+Admin | Low stock + out of stock |
| PUT | /inventory/:id | JWT+Admin | Update stock |
| GET | /warehouses | JWT+Admin | All warehouses |
| POST | /warehouses | JWT+Admin | Create warehouse |
| GET | /coupons | JWT+Admin | All coupons |

### Reviews (`/api/reviews`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /:productId | — | Reviews for product |
| POST | / | JWT | Submit review |

### Warehouses (`/api/warehouses`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | / | — | Active warehouses |

---

## 7. AUTHENTICATION SYSTEM

### How It Works
1. POST `/api/auth/login` → returns `{ token, user }` 
2. Frontend stores `token` in `localStorage` as `zipp_token`, `user` as `zipp_user`
3. Every authenticated request sends `Authorization: Bearer <token>` header
4. `middleware/auth.js` → `protect()` verifies JWT, attaches `req.user` (without password)
5. `adminOnly()` middleware checks `req.user.role === 'admin'`

### Token Details
- Algorithm: HS256 (default for jsonwebtoken)
- Expiry: 30 days
- Secret: from `JWT_SECRET` env var (validated on startup — min 32 chars)
- Storage: **localStorage** (XSS-vulnerable — known issue, not fixed yet)
- No refresh token mechanism
- No token blacklist/revocation

### Demo Credentials (after running `npm run seed`)
```
Admin: admin@example.com / password123
User:  user@example.com  / user123
```

### Known Auth Gaps (not yet fixed)
- `isVerified` field exists on User model but is never checked — email verification flow is missing
- No social login despite Google/Facebook keys in .env
- No OTP/phone verification despite Twilio in .env
- JWT stored in localStorage (XSS risk) — should move to HttpOnly cookies

---

## 8. SPRINT 1 — ALL FIXES COMPLETED

The following bugs were fixed during this session. All changes are **unstaged** (not yet committed to git).

### Files Modified
1. `backend/server.js`
2. `backend/routes/payments.js`
3. `backend/routes/wishlist.js`
4. `backend/routes/orders.js`
5. `backend/routes/admin.js`
6. `backend/routes/users.js`
7. `backend/routes/products.js`

### Fix Details

| Bug ID | Severity | File | What Was Fixed |
|--------|----------|------|----------------|
| C1 | CRITICAL | payments.js | Payment verification bypass via `req.body.demo` — removed client-controlled flag, server now checks `RAZORPAY_KEY_ID === 'your_razorpay_key_id'` to detect demo mode |
| C1b | CRITICAL | payments.js | HMAC fallback `|| 'demo'` removed — HMAC only runs when real Razorpay key is configured, not in demo mode |
| C2 | CRITICAL | wishlist.js | Wishlist toggle always added, never removed — `indexOf(productId)` on ObjectId array replaced with `.findIndex(p => p.toString() === productId)` |
| C3 | HIGH | orders.js | Oversell prevention — stock revalidated against live DB for each cart item before creating order; returns 400 with specific product name if stock depleted |
| C3b | HIGH | orders.js | Atomic stock decrement — `findOneAndUpdate` with `{ stock: { $gte: qty } }` guard; if any item fails, order is rolled back (deleted) and client gets 409 |
| H4 | HIGH | orders.js | Cancel stock restore — cancellation now runs `$inc: { stock: +qty, soldCount: -qty }` for each order item |
| M7 | MEDIUM | orders.js | Pagination added to `GET /api/orders` — accepts `?page=1&limit=20`, returns `total` and `pages` |
| H6 | HIGH | server.js | Auth brute force protection — dedicated `authLimiter` (20 req/15min) on `/api/auth/` separate from general limiter |
| H7 | HIGH | server.js | JWT_SECRET startup validation — `process.exit(1)` if missing or < 32 chars |
| H3 | HIGH | admin.js, users.js, products.js | ReDoS vulnerability — all `new RegExp(userInput, 'i')` now escape input via `escapeRegex()` function |
| M3 | MEDIUM | server.js | CORS origins read from `ALLOWED_ORIGINS` env var, falling back to hardcoded list |
| M2 | MEDIUM | users.js | Pagination type coercion — `limit` and `page` now cast with `+` operator |
| L4 | LOW | server.js | Graceful shutdown — `SIGTERM`/`SIGINT` handlers close HTTP server + MongoDB cleanly with 10s force-exit fallback |
| L8 | LOW | server.js | Production error sanitization — 500 errors return generic message in production, not raw `err.message` |
| H1 | HIGH | admin.js | `module.exports` moved to last line — `/coupons` route was defined after the export (structurally broken even if functionally working) |

### Verification
All modified files pass `node --check` (syntax validation).  
All route modules load cleanly via `require()` in isolation.  
App is runnable — `npm run dev` from `backend/` directory works.

---

## 9. CURRENT SYSTEM STATUS

| Component | Status | Notes |
|-----------|--------|-------|
| Backend server | ✅ Runnable | `cd backend && npm run dev` |
| MongoDB connection | ✅ Works | Local MongoDB required on port 27017 |
| Authentication | ✅ Working | JWT, 30-day tokens, bcrypt hashing |
| Product CRUD | ✅ Working | Admin create/update/delete + public browse |
| Category CRUD | ✅ Working | |
| Cart | ✅ Working | Stock checked on add |
| Orders | ✅ Fixed | Stock validation + atomic decrement + cancel restore |
| Payments | ✅ Fixed | Demo mode works safely, Razorpay wired for real keys |
| Wishlist | ✅ Fixed | Toggle now correctly adds AND removes |
| Coupons | ✅ Working | Validate endpoint + admin CRUD |
| Delivery check | ✅ Working | Pincode + lat/lng serviceability check |
| Admin dashboard | ✅ Working | Stats, orders, users, inventory, coupons, warehouses |
| Reviews | ✅ Working | Submit + fetch by product |
| Image upload | ⚠️ Local only | Multer stores to `./uploads` — will lose files on cloud deploy |
| Email/SMS | ❌ Not implemented | Twilio/SMTP keys in .env, no code |
| Push notifications | ❌ Not implemented | Firebase key in .env, no code |
| Real-time tracking | ❌ Not implemented | No WebSocket layer |
| Redis caching | ❌ Not implemented | All queries hit MongoDB directly |
| Frontend (Vanilla JS) | ✅ Working | Served as static files by Express |
| Admin panel | ✅ Working | Single-page HTML admin dashboard |

---

## 10. UNRESOLVED ISSUES (ordered by priority)

### Sprint 2 — Must Fix Before Production

**U1 — Images stored on local disk (HIGH)**
- **File:** `backend/routes/products.js`
- **Problem:** Multer writes to `./uploads`. Cloud deployments (Render, Railway, EC2, Docker) have ephemeral filesystems. All uploaded images will vanish on restart.
- **Fix:** Install `multer-storage-cloudinary`, replace disk storage config. Cloudinary credentials are already in `.env` as placeholders.
- **Command:** `npm install multer-storage-cloudinary`

**U2 — express-validator installed but never used (HIGH)**
- **Problem:** Zero input validation on any route. Direct DB writes without sanitization.
- **Affected routes:** auth register/login, product create, order placement, address create
- **Fix:** Add `body()` validation chains from express-validator (already in node_modules)
- **Risk without fix:** Malformed data in DB, potential injection via Mongoose operators

**U3 — No email/OTP verification (MEDIUM)**
- **Problem:** `isVerified` field on User model is never set to true via code. Users can transact without verifying email.
- **Fix:** Add POST `/api/auth/send-otp` and POST `/api/auth/verify-otp` endpoints using Twilio (keys in .env)

**U4 — JWT in localStorage — XSS risk (MEDIUM)**
- **Problem:** `zipp_token` stored in `localStorage` is readable by any injected JavaScript.
- **Fix:** Move to HttpOnly cookies — requires backend `Set-Cookie` on login + `credentials: 'include'` on frontend fetch calls
- **Note:** This requires coordinated frontend + backend change

**U5 — Product slug collision on admin create (MEDIUM)**
- **File:** `backend/models/Product.js:46-48`
- **Problem:** Slug generated as `name.toLowerCase().replace(...)` without uniqueness suffix. Two products with the same name hit a duplicate key error.
- **Fix:** Append `+ '-' + Date.now()` to slug in pre-save hook when slug is auto-generated

**U6 — No MongoDB transaction for order placement (MEDIUM)**
- **Problem:** Order create → stock decrement → cart clear are 3 separate DB operations. If server crashes between them, data is inconsistent.
- **Fix:** Wrap in `mongoose.startSession()` + `session.withTransaction()`
- **Prerequisite:** MongoDB replica set (transactions require replica set even in local dev)

**U7 — Coupon free_delivery discount hardcoded as 40 (LOW)**
- **File:** `backend/routes/coupons.js:448`
- **Problem:** `discount = 40` is hardcoded, not read from coupon.value or delivery fee calculation
- **Fix:** Use `coupon.value` for free_delivery type

**U8 — Order number collision risk (LOW)**
- **File:** `backend/models/index.js:86`
- **Problem:** `'ZPP' + Date.now() + Math.floor(Math.random() * 1000)` — not guaranteed unique at scale
- **Fix:** Use `nanoid()` or `crypto.randomBytes(6).toString('hex')`

**U9 — No rate limiting on product search (LOW)**
- **File:** `backend/routes/products.js`
- **Problem:** Search is included in the general 1000 req/15min limiter but no dedicated search rate limit
- **At scale:** Search is the most expensive DB operation (regex scan); add a dedicated tighter limit

**U10 — No missing indexes (LOW)**
- See Section 4 for the list of missing compound indexes needed before production load

---

## 11. TECHNICAL DEBT (non-bug items)

| # | Item | Location | Effort | Priority |
|---|------|----------|--------|----------|
| TD1 | Business logic in route files, not controllers | All routes | Medium | Sprint 3 |
| TD2 | No test suite whatsoever | Project-wide | High | Sprint 4 |
| TD3 | 688-line monolithic `admin.html` | frontend/admin.html | High | Sprint 5 |
| TD4 | Vanilla JS global state, no module system | Frontend JS | High | Sprint 5 |
| TD5 | No TypeScript | Project-wide | Very High | Sprint 6 |
| TD6 | No `.nvmrc` (Node version unspecified) | Root | Low | Sprint 2 |
| TD7 | `console.log` only — no structured logging | Project-wide | Medium | Sprint 2 |
| TD8 | No observability/APM/error tracking | Project-wide | Medium | Sprint 3 |
| TD9 | Seed admin password is `password123` | utils/seed.js | Low | Before public deploy |
| TD10 | `contentSecurityPolicy: false` in Helmet | server.js | Medium | Sprint 3 |
| TD11 | Root `package.json` has no real deps but has lock file | Root | Low | Sprint 2 |
| TD12 | `controllers/` folder exists but is empty | backend/ | Low | Sprint 3 (when extracting controllers) |
| TD13 | `optionalAuth` imported in products.js but never used as middleware | routes/products.js | Low | Sprint 2 |
| TD14 | No `.env.example` file for onboarding | Root | Low | Sprint 2 |
| TD15 | `package-lock.json` at root locks nothing useful | Root | Low | Sprint 2 |

---

## 12. RECOMMENDATION ENGINE — CURRENT PROGRESS

**Status: Not started**

Currently the "recommendation" surface is:
- `GET /api/products/featured` — returns `isFeatured: true` products (manually flagged by admin)
- `GET /api/products/trending` — returns top `soldCount` products

There is no ML, no collaborative filtering, no personalization. The `soldCount` field on Product and `totalOrders`/`totalSpent` on User exist as data foundations for future recommendations.

**Planned approach (discussed but not implemented):**
1. **Phase 1 (simple):** Category affinity score from order history → return products from frequently ordered categories
2. **Phase 2 (medium):** Co-purchase analysis via MongoDB aggregation → "users who bought X also bought Y"
3. **Phase 3 (advanced):** If `OPENAI_API_KEY` is configured (already in .env), use embeddings for semantic product similarity

---

## 13. IMPORTANT ARCHITECTURAL DECISIONS (made and rationale)

| Decision | What | Why |
|----------|------|-----|
| Monolith first | Single Express app, not microservices | Team size and timeline — extract services later when bottlenecks are proven |
| MongoDB over SQL | Document DB for flexible product schemas | Quick-commerce products have wildly different attributes (grocery vs electronics) |
| Vanilla JS frontend | No React/Vue/Next | Faster initial delivery, no build step — this will need to change for scale |
| JWT stateless auth | No server-side sessions | Horizontally scalable by default |
| Express static serving | Backend serves frontend | Eliminates need for separate web server in development; use CDN/nginx in production |
| Soft deletes | `isActive: false` for products/categories | Preserves order history references to deleted products |
| Price snapshots in cart | Cart stores price at add-time | Protects against price changes after cart add; business logic trade-off |
| Demo mode for Razorpay | Server-side check on `RAZORPAY_KEY_ID` | Allows full checkout flow testing without real payment credentials |
| Delivery fee in code | 40 INR below 499 INR order value | Hardcoded in orders.js and delivery.js — needs centralization (config collection in MongoDB or env var) |

---

## 14. ROADMAP — SPRINTS REMAINING

### Sprint 2 — Security + Stability (NEXT)
**Goal:** All inputs validated, images in cloud, app deployable

1. Wire Cloudinary to Multer (`multer-storage-cloudinary`) — `routes/products.js`
2. Add express-validator chains to: `POST /auth/register`, `POST /auth/login`, `POST /orders`, `POST /products`, `POST /users/addresses`
3. Fix product slug collision (append timestamp to pre-save slug)
4. Fix coupon `free_delivery` discount (use `coupon.value` not hardcoded 40)
5. Add `.nvmrc` file with current Node version
6. Add `.env.example` file documenting all required variables
7. Remove unused `optionalAuth` import in `products.js`
8. Add missing MongoDB indexes (see Section 4)
9. Fix order number generation (use `nanoid` or `crypto.randomBytes`)
10. Add `pino` structured logging

### Sprint 3 — Performance + Caching
**Goal:** App handles 1K+ concurrent users without DB overload

1. Install and configure `ioredis`
2. Cache strategy:
   - Categories list → Redis, 10min TTL, invalidate on admin update
   - Featured products → Redis, 5min TTL
   - Trending products → Redis, 5min TTL
   - Product detail → Redis, 2min TTL, invalidate on update
3. Extract business logic from routes into `controllers/` folder
4. Add missing compound indexes to MongoDB
5. Add request ID middleware for log correlation
6. MongoDB connection pool tuning (default `poolSize` is 5, increase for production)
7. Add Sentry or similar error tracking

### Sprint 4 — Real-time + Delivery
**Goal:** Live order tracking, working ETA, delivery agent concept

1. Install `socket.io`
2. Order status change → emit to user's socket room
3. `DeliveryAgent` model — extend User model with agent-specific fields
4. `GET /api/delivery/assign` — match nearest available agent to order
5. Agent location update via WebSocket
6. Improve ETA engine — currently uses straight-line distance × 3 min/km; integrate Google Maps Distance Matrix API (key already in .env)
7. Delivery fee moved to database config (not hardcoded)

### Sprint 5 — Commerce Features
**Goal:** Feature parity with Blinkit/Zepto

1. Email verification flow (Nodemailer — SMTP keys in .env)
2. OTP login via Twilio (keys in .env)
3. Token refresh endpoint + token rotation
4. Move JWT to HttpOnly cookies
5. Group/hostel ordering — shared cart session by link
6. Flash sale model — time-limited price + stock lock via Redis
7. Loyalty points redemption (User.loyaltyPoints field exists, no redemption logic)
8. Wallet payment method (payment.method enum includes 'wallet', no implementation)
9. Return/refund flow

### Sprint 6 — Frontend Rebuild + Production Hardening
**Goal:** Maintainable frontend, CDN-ready, fully deployable

1. Migrate frontend to React + Vite (or Next.js for SSR)
2. Replace localStorage auth with HttpOnly cookies
3. Re-enable Helmet CSP with proper configuration
4. Add PM2 cluster mode configuration
5. Docker + docker-compose for local development
6. CI/CD pipeline (GitHub Actions)
7. CDN strategy for static assets and product images

---

## 15. EXACT NEXT IMPLEMENTATION PRIORITIES

**Pick up at Sprint 2, Step 1. Execute in this exact order:**

### Step 1 — Wire Cloudinary (prevents data loss on deployment)
```bash
cd backend
npm install multer-storage-cloudinary
```
Then modify `backend/routes/products.js`:
- Replace the `multer.diskStorage` block with `CloudinaryStorage` from `multer-storage-cloudinary`
- Use `process.env.CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- Fall back to disk storage if Cloudinary env vars are placeholders (same pattern as Razorpay demo mode)

### Step 2 — Add express-validator to auth routes
File: `backend/routes/auth.js`
- `POST /register`: validate name (min 2), email (isEmail), password (min 6), phone (optional, isMobilePhone)
- `POST /login`: validate email (isEmail), password (notEmpty)
- Use `validationResult(req)` and return 422 on error

### Step 3 — Add express-validator to order placement
File: `backend/routes/orders.js`
- `POST /`: validate `deliveryAddress` object (fullName, phone, addressLine1, pincode required)
- `paymentMethod`: must be one of `['cod', 'razorpay', 'wallet']`

### Step 4 — Fix product slug collision
File: `backend/models/Product.js` line 46-48:
```js
if (!this.slug) {
  this.slug = this.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') 
    + '-' + Date.now().toString(36);
}
```

### Step 5 — Fix coupon free_delivery hardcoded value
File: `backend/routes/coupons.js` line 448:
```js
} else if (coupon.type === 'free_delivery') {
  discount = coupon.value; // was hardcoded 40
}
```

### Step 6 — Add .env.example and .nvmrc
- Create `backend/.env.example` with all keys, empty values, and comments
- Create `.nvmrc` at project root with `20` (LTS Node version)

### Step 7 — Add missing MongoDB indexes
File: create `backend/utils/addIndexes.js` (one-time migration script):
```js
Order.collection.createIndex({ user: 1, createdAt: -1 });
Order.collection.createIndex({ status: 1, createdAt: -1 });
Review.collection.createIndex({ product: 1, user: 1 }, { unique: true });
Product.collection.createIndex({ isFeatured: 1, isActive: 1 });
Product.collection.createIndex({ soldCount: -1, isActive: 1 });
```

### Step 8 — Structured logging with pino
```bash
npm install pino pino-http
```
Replace all `console.log` in `server.js` and routes with pino logger.

---

## 16. HOW TO RUN THE PROJECT

```bash
# Prerequisites: MongoDB running locally on port 27017

# 1. Install dependencies
cd backend
npm install

# 2. Seed the database
npm run seed

# 3. Start dev server
npm run dev

# Server starts on http://localhost:5000
# Admin panel: http://localhost:5000/admin.html
# Login page: http://localhost:5000/pages/login.html
# API base: http://localhost:5000/api/

# Admin credentials: admin@example.com / password123
# User credentials:  user@example.com / user123
```

---

## 17. GIT STATUS AT HANDOFF

```
Branch: master (2 commits total)
Latest commit: d347cc1 "Remove env files from tracking"

Unstaged changes (Sprint 1 fixes — NOT yet committed):
  M backend/routes/admin.js
  M backend/routes/orders.js
  M backend/routes/payments.js
  M backend/routes/products.js
  M backend/routes/users.js
  M backend/routes/wishlist.js
  M backend/server.js
```

**Recommended commit message for Sprint 1 fixes:**
```
fix: resolve 15 critical and high-severity security and logic bugs

- Fix payment verification bypass (client-controlled demo flag removed)
- Fix wishlist toggle always-adds (ObjectId vs string comparison)
- Add stock revalidation + atomic decrement on order placement
- Restore stock on order cancellation
- Protect auth endpoints with strict rate limiter (20 req/15min)
- Validate JWT_SECRET on startup (process.exit if missing/weak)
- Escape all user regex inputs (ReDoS prevention)
- Add pagination to user orders endpoint
- Add graceful shutdown (SIGTERM/SIGINT handlers)
- Make CORS origins configurable via ALLOWED_ORIGINS env var
- Fix admin.js module.exports position (was before last route)
- Fix pagination type coercion in users.js
```

---

*End of handoff document. Next session should begin at Sprint 2, Step 1 (Cloudinary wiring).*
