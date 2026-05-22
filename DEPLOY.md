# Deployment Runbook — Zipp Commerce

Single-service deploy: the Express app under `backend/` serves the static
frontend from `../frontend`. You only need to host one process.

## 1. Provision MongoDB Atlas

1. Create a free M0 cluster on https://cloud.mongodb.com
2. Database Access → add a user with `readWrite` on the `zipp` database
3. Network Access → temporarily allow `0.0.0.0/0`; restrict later to your
   host's egress IPs once Render / Fly tells you what they are
4. Connect → "Drivers" → copy the SRV URI; replace `<password>` and append
   `/zipp?retryWrites=true&w=majority`

## 2. Provision Cloudinary

1. Create a free account at https://cloudinary.com
2. Dashboard → copy **Cloud name**, **API Key**, **API Secret**
3. The app auto-detects real credentials at startup (`middleware/upload.js`);
   no code change required

## 3. Production environment variables

Required (deploy will refuse to boot without these):

| Variable | Where to get |
|---|---|
| `JWT_SECRET` | `openssl rand -hex 32` — at least 32 chars |
| `MONGO_URI` | Atlas connection string from step 1 |
| `ALLOWED_ORIGINS` | Your public domain(s), comma-separated |
| `NODE_ENV` | `production` |
| `TRUST_PROXY` | `1` for Render/Fly/Vercel, `2` for double-proxy |

Strongly recommended:

| Variable | Why |
|---|---|
| `CLOUDINARY_*` | Image uploads survive restarts |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Real payments instead of demo mode |
| `REDIS_URL` | Online-user analytics + admin metrics |
| `SENTRY_DSN` | Production error tracking |
| `LOG_LEVEL` | `info` (default) — set `debug` to triage |
| `MONGO_POOL_SIZE` | `20` default; tune by traffic |

## 4. Deploy — Render (recommended)

```bash
# 1. push branch (you'll need to commit Sprint 3/5 changes first)
git push origin master

# 2. open https://dashboard.render.com/blueprints
# 3. "New Blueprint Instance" → connect this repo → uses render.yaml
# 4. Fill the `sync: false` secrets in the dashboard
# 5. Deploy
```

Health endpoint: `https://<your-app>.onrender.com/health`

## 4b. Deploy — Docker (Fly, Railway, ECS, plain VM)

```bash
docker build -t zipp-commerce .
docker run -d -p 5000:5000 --env-file backend/.env --name zipp zipp-commerce
docker logs -f zipp
```

## 5. Post-deploy checks

```bash
# Run preflight against the production .env (locally, against Atlas):
cd backend && npm run preflight

# Smoke test the live deployment:
curl -fsS https://<your-app>/health
curl -fsS https://<your-app>/api/products/featured | head -c 200
```

Then in a browser:

- [ ] Home page loads (`/`)
- [ ] Login + register work
- [ ] Add to cart from product page
- [ ] Checkout reaches Razorpay (or demo)
- [ ] Admin login → `/admin.html` → stats render
- [ ] No CORS errors in DevTools console
- [ ] Image upload from admin → image survives a restart (Cloudinary)

## 6. First-time seed

After Atlas is connected and the app is up, run the seed *once* against the
production DB to populate categories / products / coupons / demo users:

```bash
# from local machine, pointing MONGO_URI at Atlas
MONGO_URI="<atlas-uri>" npm --prefix backend run seed
```

Demo credentials created:
- Admin: `admin@example.com` / `password123` — **change immediately after seeding**
- User:  `user@example.com`  / `user123`

## 7. Custom domain + HTTPS

- Render / Fly issue Let's Encrypt certs automatically once you point a
  CNAME at the platform-provided hostname
- Add the production hostname to `ALLOWED_ORIGINS`
- CSP already permits the third parties we use (Razorpay, Google Fonts,
  Unsplash imagery) — see `server.js`

## 8. Rollback

Render keeps the previous successful build; click "Rollback" in the
dashboard. For Docker hosts, redeploy the previous image tag.
