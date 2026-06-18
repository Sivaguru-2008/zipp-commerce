// Dynamic SEO surface area.
//
// - GET /sitemap.xml — assembles static pages + every active product. Cached
//   for 6h via Cache-Control + an in-memory snapshot so a googlebot burst
//   doesn't hammer the DB.
// - GET /api/seo/product/:id — returns JSON-LD + OpenGraph metadata for a
//   given product, used client-side by /pages/product.html to inject the
//   `<script type="application/ld+json">` tag and meta tags.
//
// /robots.txt is still served from the static frontend folder.

const express = require('express');
const router  = express.Router();
const asyncHandler = require('../middleware/asyncHandler');
const Product = require('../models/Product');
const Category = require('../models/Category');

const SITE_URL = process.env.SITE_URL || 'https://zipp.example';
const STATIC_PAGES = [
  { loc: '/',                   changefreq: 'daily',   priority: 1.0 },
  { loc: '/pages/search.html',  changefreq: 'weekly',  priority: 0.8 },
  { loc: '/pages/login.html',   changefreq: 'monthly', priority: 0.5 }
];

let sitemapCache = { xml: null, builtAt: 0 };
const SITEMAP_TTL_MS = 6 * 60 * 60 * 1000; // 6h

function escapeXml(s) {
  return String(s || '').replace(/[<>&'"]/g, ch => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;'
  }[ch]));
}

async function buildSitemap() {
  // Pull only what we need to keep memory low even with 10k+ products.
  const [products, categories] = await Promise.all([
    Product.find({ isActive: true }).select('_id slug updatedAt').limit(10000),
    Category.find({}).select('_id slug updatedAt')
  ]);

  const urls = [];
  for (const p of STATIC_PAGES) {
    urls.push({ loc: SITE_URL + p.loc, changefreq: p.changefreq, priority: p.priority });
  }
  for (const c of categories) {
    urls.push({
      loc: `${SITE_URL}/pages/search.html?category=${encodeURIComponent(c.slug || c._id)}`,
      changefreq: 'weekly',
      priority: 0.7,
      lastmod: c.updatedAt
    });
  }
  for (const p of products) {
    urls.push({
      loc: `${SITE_URL}/pages/product.html?id=${p._id}`,
      changefreq: 'daily',
      priority: 0.6,
      lastmod: p.updatedAt
    });
  }

  const body = urls.map(u => {
    return `  <url>
    <loc>${escapeXml(u.loc)}</loc>${u.lastmod ? `
    <lastmod>${u.lastmod.toISOString().slice(0, 10)}</lastmod>` : ''}
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority.toFixed(1)}</priority>
  </url>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>`;
}

router.get('/sitemap.xml', asyncHandler(async (req, res) => {
  if (!sitemapCache.xml || Date.now() - sitemapCache.builtAt > SITEMAP_TTL_MS) {
    sitemapCache = { xml: await buildSitemap(), builtAt: Date.now() };
  }
  res.set('Content-Type', 'application/xml; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=21600'); // 6h
  res.send(sitemapCache.xml);
}));

// Product SEO bundle — JSON-LD + OG + canonical link
router.get('/api/seo/product/:id', asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id)
    .select('name slug description shortDescription price mrp images brand rating reviewCount stock isActive')
    .populate('category', 'name slug')
    .lean();

  if (!product || !product.isActive) {
    return res.status(404).json({ success: false, message: 'Product not found' });
  }

  const url = `${SITE_URL}/pages/product.html?id=${product._id}`;
  const image = (product.images && product.images[0]) || `${SITE_URL}/images/og-cover.png`;
  const inStock = (product.stock || 0) > 0;

  const jsonLd = {
    '@context': 'https://schema.org/',
    '@type': 'Product',
    name: product.name,
    description: product.description || product.shortDescription || product.name,
    image: product.images || [image],
    brand: { '@type': 'Brand', name: product.brand || 'Zipp' },
    sku: String(product._id),
    offers: {
      '@type': 'Offer',
      url,
      priceCurrency: 'INR',
      price: product.price,
      availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition'
    }
  };
  if (product.rating > 0 && product.reviewCount > 0) {
    jsonLd.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: product.rating,
      reviewCount: product.reviewCount
    };
  }

  res.set('Cache-Control', 'public, max-age=300'); // 5min
  res.json({
    success: true,
    seo: {
      title: `${product.name} – Zipp`,
      description: (product.shortDescription || product.description || '').slice(0, 160),
      canonical: url,
      og: {
        type: 'product',
        title: product.name,
        description: (product.shortDescription || product.description || '').slice(0, 200),
        image,
        url
      },
      jsonLd
    }
  });
}));

// Public site-wide SEO defaults (header, social handles) — handy for the
// frontend bootstrap script.
router.get('/api/seo/site', (req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.json({
    success: true,
    site: {
      name: 'Zipp Commerce',
      url: SITE_URL,
      description: '10-minute grocery delivery for tier-2 Indian cities and college campuses.',
      twitter: '@zippcommerce'
    }
  });
});

module.exports = router;
