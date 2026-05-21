/* =============================================
   HOME PAGE LOGIC
   ============================================= */

document.addEventListener('DOMContentLoaded', async () => {
  await Promise.all([
    loadCategories(),
    loadFeaturedProducts(),
    loadTrendingProducts(),
    loadDairyProducts(),
  ]);
});

// ── Categories ────────────────────────────────
async function loadCategories() {
  const grid = document.getElementById('categoriesGrid');
  if (!grid) return;
  grid.innerHTML = skeletonGrid(10, '120px');
  try {
    const res = await CategoryAPI.getAll();
    const cats = res.categories || [];
    if (!cats.length) { grid.innerHTML = '<p>No categories found</p>'; return; }
    grid.innerHTML = cats.map(buildCategoryCard).join('');
  } catch (e) {
    grid.innerHTML = '<p style="color:var(--text-muted)">Failed to load categories</p>';
  }
}

// ── Featured Products ─────────────────────────
async function loadFeaturedProducts() {
  const grid = document.getElementById('featuredGrid');
  if (!grid) return;
  grid.innerHTML = skeletonGrid(6);
  try {
    const res = await ProductAPI.getFeatured();
    const products = res.products || [];
    grid.innerHTML = products.length ? products.map(buildProductCard).join('') : '<p>No featured products</p>';
  } catch (e) {
    grid.innerHTML = '<p style="color:var(--text-muted)">Failed to load products</p>';
  }
}

// ── Trending Products ─────────────────────────
async function loadTrendingProducts() {
  const grid = document.getElementById('trendingGrid');
  if (!grid) return;
  grid.innerHTML = skeletonGrid(6);
  try {
    const res = await ProductAPI.getTrending();
    const products = res.products || [];
    grid.innerHTML = products.length ? products.map(buildProductCard).join('') : '<p>No trending products</p>';
  } catch (e) {
    grid.innerHTML = '<p style="color:var(--text-muted)">Failed to load products</p>';
  }
}

// ── Dairy Section ─────────────────────────────
async function loadDairyProducts() {
  const grid = document.getElementById('dairyGrid');
  if (!grid) return;
  grid.innerHTML = skeletonGrid(6);
  try {
    // Get dairy-eggs category id first
    const catRes = await CategoryAPI.getAll();
    const dairy = (catRes.categories || []).find(c => c.slug === 'dairy-eggs');
    if (!dairy) { grid.innerHTML = ''; return; }
    const res = await ProductAPI.getAll({ category: dairy._id, limit: 8 });
    const products = res.products || [];
    grid.innerHTML = products.length ? products.map(buildProductCard).join('') : '';
  } catch (e) {
    grid.innerHTML = '';
  }
}
