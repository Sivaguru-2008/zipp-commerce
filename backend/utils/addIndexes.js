/**
 * One-time migration script — adds missing compound indexes.
 * Run once after deployment: node utils/addIndexes.js
 * Safe to re-run: createIndex is idempotent.
 */
require('dotenv').config();
const mongoose = require('mongoose');

const { Order, Review } = require('../models/index');
const Product = require('../models/Product');

async function addIndexes() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/zipp');
  console.log('Connected to MongoDB');

  const ops = [
    // User order history (GET /api/orders — most common user query)
    Order.collection.createIndex({ user: 1, createdAt: -1 }, { background: true }),
    // Admin order filtering by status
    Order.collection.createIndex({ status: 1, createdAt: -1 }, { background: true }),
    // Prevent duplicate reviews (model logic exists but no DB-level enforcement)
    Review.collection.createIndex({ product: 1, user: 1 }, { unique: true, background: true }),
    // Featured products query
    Product.collection.createIndex({ isFeatured: 1, isActive: 1 }, { background: true }),
    // Trending products query (sort by soldCount)
    Product.collection.createIndex({ soldCount: -1, isActive: 1 }, { background: true })
  ];

  const names = [
    'Order { user, createdAt }',
    'Order { status, createdAt }',
    'Review { product, user } UNIQUE',
    'Product { isFeatured, isActive }',
    'Product { soldCount, isActive }'
  ];

  const results = await Promise.allSettled(ops);
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') console.log(`  ✅  ${names[i]}`);
    else console.error(`  ❌  ${names[i]}: ${r.reason.message}`);
  });

  await mongoose.disconnect();
  console.log('Done.');
}

addIndexes().catch(err => { console.error(err); process.exit(1); });
