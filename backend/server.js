const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

const app = express();

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({
  origin: ['http://localhost:3000','http://127.0.0.1:3000','http://localhost:5000','http://127.0.0.1:5000','http://localhost:5500','http://127.0.0.1:5500'],
  credentials: true
}));
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 1000 });
app.use('/api/', limiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('dev'));

const frontendPath = path.join(__dirname, '../frontend');
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(frontendPath));

mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/zipp')
  .then(() => console.log('✅  MongoDB connected → zipp'))
  .catch(err => console.error('❌  MongoDB error:', err.message));

app.use('/api/auth',       require('./routes/auth'));
app.use('/api/users',      require('./routes/users'));
app.use('/api/products',   require('./routes/products'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/cart',       require('./routes/cart'));
app.use('/api/wishlist',   require('./routes/wishlist'));
app.use('/api/orders',     require('./routes/orders'));
app.use('/api/payments',   require('./routes/payments'));
app.use('/api/coupons',    require('./routes/coupons'));
app.use('/api/delivery',   require('./routes/delivery'));
app.use('/api/admin',      require('./routes/admin'));
app.use('/api/reviews',    require('./routes/reviews'));
app.use('/api/warehouses', require('./routes/warehouses'));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ success: false, message: 'Not found' });
  res.sendFile(path.join(frontendPath, 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ success: false, message: err.message || 'Internal Server Error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log('\n🚀 ═══════════════════════════════════════════');
  console.log(`🛍️  Store  → http://localhost:${PORT}`);
  console.log(`⚡  Admin  → http://localhost:${PORT}/admin.html`);
  console.log(`🔑  Login  → http://localhost:${PORT}/pages/login.html`);
  console.log('📦  Seed   → npm run seed');
  console.log('🚀 ═══════════════════════════════════════════\n');
});

module.exports = app;
