# ⚡ Zipp Commerce
### Ultra-Modern Quick Commerce Platform

A production-grade quick commerce web app inspired by **Zepto, Blinkit, Swiggy Instamart, Amazon & Flipkart** — built with Node.js, Express, MongoDB, and Vanilla JS.

---

## 🚀 Quick Start (3 steps)

### 1. Install Dependencies
```bash
cd zipp-commerce/backend
npm install
```

### 2. Start MongoDB
```bash
# macOS (with Homebrew)
brew services start mongodb-community

# Ubuntu/Linux
sudo systemctl start mongod

# Windows
net start MongoDB

# Or start manually
mongod --dbpath /data/db
```

### 3. Seed the Database & Run
```bash
# Seed with sample data
npm run seed

# Start the server
npm run dev
```

🌐 Open: **http://localhost:5000**

---

## 🔑 Login Credentials

| Role | Email | Password |
|------|-------|----------|
| **Admin** | admin@example.com | password123 |
| **User** | user@example.com | user123 |

---

## 📁 Project Structure

```
zipp-commerce/
├── backend/
│   ├── middleware/
│   │   └── auth.js              # JWT auth + role guards
│   ├── models/
│   │   ├── Category.js          # Category schema
│   │   ├── Product.js           # Product schema (variants, inventory)
│   │   ├── User.js              # User schema (addresses, loyalty)
│   │   └── index.js             # Cart, Order, Wishlist, Coupon,
│   │                            #   Warehouse, Payment, Notification
│   ├── routes/
│   │   ├── auth.js              # Register, Login, Change Password
│   │   ├── products.js          # CRUD, Search, Featured, Trending
│   │   ├── categories.js        # Category management
│   │   ├── cart.js              # Add, Update, Remove, Clear
│   │   ├── wishlist.js          # Toggle, Get, Remove
│   │   ├── orders.js            # Place, Track, Cancel, Admin update
│   │   ├── payments.js          # Razorpay create + verify
│   │   ├── users.js             # Profile, Addresses, Admin users
│   │   ├── coupons.js           # Validate, CRUD (admin)
│   │   ├── delivery.js          # Serviceability, ETA, Warehouses
│   │   ├── admin.js             # Stats, Inventory, Orders, Users
│   │   ├── reviews.js           # Product reviews
│   │   └── warehouses.js        # Warehouse list
│   ├── utils/
│   │   └── seed.js              # Full database seeder
│   ├── uploads/                 # Multer file uploads
│   ├── .env                     # Environment variables
│   ├── package.json
│   └── server.js                # Express app entry point
│
└── frontend/
    ├── css/
    │   └── main.css             # Complete design system
    ├── js/
    │   ├── api.js               # All API calls (ProductAPI, CartAPI, etc.)
    │   ├── auth.js              # Auth state management
    │   ├── cart.js              # Cart sidebar logic
    │   ├── ui.js                # Toast, skeleton, product cards, search
    │   └── home.js              # Homepage data loading
    ├── pages/
    │   ├── login.html           # Login + Register
    │   ├── product.html         # Product detail + gallery + reviews
    │   ├── search.html          # Search + filters + pagination
    │   ├── cart.html            # Full cart with coupon
    │   ├── checkout.html        # Address + Payment + Order placement
    │   ├── order-success.html   # Order confirmation + tracking
    │   ├── orders.html          # Order history + timeline
    │   ├── profile.html         # Profile + addresses + security
    │   └── wishlist.html        # Saved products
    ├── index.html               # Homepage (hero, categories, products)
    └── admin.html               # Full admin dashboard
```

---

## 🌟 Features

### 🛒 Commerce
- Dynamic product catalog with categories, search, filters, sorting
- Cart with persistent MongoDB storage + coupon support
- Wishlist with toggle functionality
- Full checkout flow with address book
- COD + Razorpay online payment

### ⚡ Quick Commerce
- 10-minute delivery ETA display
- Dark store / warehouse logic
- Pincode serviceability checking
- Live order tracking timeline (7 statuses)

### 👤 Users
- JWT authentication (30-day tokens)
- Multiple saved addresses
- Order history with tracking
- Profile management + password change

### ⚙️ Admin Dashboard
- Real-time analytics (revenue, orders, users, products)
- 7-day orders chart
- Order status management
- Product CRUD with image support
- Inventory management (low stock alerts)
- Customer management
- Coupon creation & management

### 🔒 Security
- bcrypt password hashing (12 rounds)
- JWT authentication middleware
- Role-based access control (user/admin/delivery)
- Rate limiting (1000 req/15min)
- Helmet security headers
- Input validation

---

## ⚙️ Environment Variables (`backend/.env`)

```env
# Required
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/zipp
JWT_SECRET=your_super_secret_key_change_this

# Payments (get from razorpay.com)
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
RAZORPAY_KEY_SECRET=your_razorpay_secret

# Maps (get from console.cloud.google.com)
GOOGLE_MAPS_API_KEY=your_google_maps_key

# Image Storage (get from cloudinary.com)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

---

## 💳 Razorpay Setup

1. Sign up at [razorpay.com](https://razorpay.com)
2. Go to Settings → API Keys → Generate Test Key
3. Add `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` to `.env`
4. Test payments work automatically in test mode

> Without Razorpay keys, the app runs in **demo mode** (COD works normally, online payment shows demo message).

---

## 🗺️ Google Maps Setup

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Enable **Maps JavaScript API** and **Places API**
3. Create API key and add to `.env` as `GOOGLE_MAPS_API_KEY`

> Without Google Maps key, delivery check works via pincode matching.

---

## 📊 Available Coupons (from seed)

| Code | Type | Value | Min Order |
|------|------|-------|-----------|
| `ZIPP10` | 10% off | 10% | ₹199 |
| `SAVE50` | Flat discount | ₹50 | ₹299 |
| `FREEDEL` | Free delivery | — | ₹0 |
| `NEWUSER` | New user | 20% | ₹399 |
| `WEEKEND20` | Weekend deal | 20% | ₹499 |

---

## 🔧 npm Scripts

```bash
npm run dev     # Start with nodemon (auto-restart)
npm start       # Start production server
npm run seed    # Seed database with sample data
```

---

## 🐛 Troubleshooting

**MongoDB not connecting?**
```bash
# Check if MongoDB is running
mongod --version
sudo systemctl status mongod

# Start MongoDB
sudo systemctl start mongod
```

**Port already in use?**
```bash
# Change PORT in backend/.env
PORT=3001
```

**Products not loading?**
```bash
# Run the seed script first
cd backend && npm run seed
```

**Admin dashboard shows no data?**
- Make sure you're logged in as `admin@example.com`
- Run `npm run seed` to populate the database

---

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | HTML5, CSS3, Vanilla JavaScript |
| **Backend** | Node.js, Express.js |
| **Database** | MongoDB, Mongoose |
| **Auth** | JWT, bcryptjs |
| **Payments** | Razorpay |
| **Uploads** | Multer |
| **Security** | Helmet, express-rate-limit |

---

## 📈 Scalability Ready

The architecture supports adding:
- Redis caching layer
- Socket.io for live order tracking
- Cloudinary for image hosting
- Twilio for OTP/SMS
- Firebase for push notifications
- OpenAI for AI recommendations
- Multi-vendor support
- PWA/mobile app

---

*Built with ❤️ as a production-grade quick commerce platform*
