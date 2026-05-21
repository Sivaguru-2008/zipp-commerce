/* =============================================
   UI UTILITIES – toast, skeleton, modal, helpers
   ============================================= */

// ── Toast Notifications ──────────────────────
function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type] || icons.info}</span><span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideOut .3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ── Skeleton Loader ───────────────────────────
function skeletonGrid(count = 6, height = '280px') {
  return Array.from({ length: count }, () =>
    `<div class="skeleton-card" style="height:${height};border-radius:14px"></div>`
  ).join('');
}

// ── Product Card Builder ──────────────────────
function buildProductCard(product) {
  const discount = product.discount || 0;
  const img = (product.images && product.images[0]) ? product.images[0] : 'https://via.placeholder.com/300x300?text=No+Image';
  const outOfStock = product.stock === 0;

  return `
  <div class="product-card" onclick="viewProduct('${product._id}')">
    <div class="product-img-wrap">
      <img src="${img}" alt="${product.name}" loading="lazy" onerror="this.src='https://via.placeholder.com/300x300?text=No+Image'" />
      <div class="product-badges">
        ${discount > 0 ? `<span class="badge badge-discount">${discount}% OFF</span>` : ''}
        ${product.badges && product.badges[0] ? `<span class="badge badge-new">${product.badges[0]}</span>` : ''}
      </div>
      <button class="product-wishlist wishlist-btn-${product._id}"
        onclick="toggleWishlist('${product._id}', event)" title="Wishlist">🤍</button>
      ${product.deliveryTime ? `<span class="product-eta">⚡ ${product.deliveryTime}</span>` : ''}
      ${outOfStock ? `<div class="out-of-stock-overlay">Out of Stock</div>` : ''}
    </div>
    <div class="product-info">
      <div class="product-brand">${product.brand || ''}</div>
      <div class="product-name">${product.name}</div>
      <div class="product-unit">${product.unit || ''}</div>
      <div class="product-pricing">
        <div class="product-price-group">
          <span class="product-price">₹${product.price}</span>
          ${product.mrp && product.mrp > product.price
            ? `<span class="product-mrp">₹${product.mrp}</span>` : ''}
        </div>
        ${outOfStock
          ? `<button class="add-btn" style="background:#ccc;cursor:default" disabled>✕</button>`
          : `<button class="add-btn" id="add-btn-${product._id}"
               onclick="addToCart('${product._id}', 1, event)">+</button>
             <div class="qty-ctrl hidden" id="qty-ctrl-${product._id}">
               <button class="qty-btn" onclick="event.stopPropagation();updateCartItem('${product._id}',
                 parseInt(document.querySelector('#qty-ctrl-${product._id} .qty-num').textContent) - 1)">−</button>
               <span class="qty-num">1</span>
               <button class="qty-btn" onclick="event.stopPropagation();updateCartItem('${product._id}',
                 parseInt(document.querySelector('#qty-ctrl-${product._id} .qty-num').textContent) + 1)">+</button>
             </div>`
        }
      </div>
    </div>
  </div>`;
}

// ── Category Card Builder ─────────────────────
function buildCategoryCard(cat) {
  return `
  <div class="category-card" onclick="goToCategory('${cat.slug}')"
       style="border-top: 4px solid ${cat.color || '#6C3BFF'}">
    <div class="category-icon">${cat.icon || '🛒'}</div>
    <div class="category-name">${cat.name}</div>
  </div>`;
}

// ── Copy Coupon Code ──────────────────────────
function copyCode(code) {
  navigator.clipboard.writeText(code).then(() => {
    showToast(`Code "${code}" copied! 🎉`, 'success');
  }).catch(() => {
    showToast(`Use code: ${code}`, 'info');
  });
}

// ── Navigate helpers ──────────────────────────
function viewProduct(id) {
  window.location.href = `/pages/product.html?id=${id}`;
}
function goToCategory(slug) {
  window.location.href = `/pages/search.html?category=${slug}`;
}

// ── Location Modal ────────────────────────────
function openLocationModal() {
  const m = document.getElementById('locationModal');
  if (m) m.classList.remove('hidden');
}
function closeLocationModal() {
  const m = document.getElementById('locationModal');
  if (m) m.classList.add('hidden');
}

async function checkDelivery() {
  const pincode = document.getElementById('pincodeInput')?.value?.trim();
  if (!pincode || pincode.length < 6) {
    showToast('Enter a valid 6-digit pincode', 'warning');
    return;
  }
  const resultEl = document.getElementById('deliveryResult');
  if (resultEl) resultEl.innerHTML = '<p style="color:var(--text-muted)">Checking…</p>';
  try {
    const res = await DeliveryAPI.check(pincode);
    if (resultEl) {
      resultEl.innerHTML = res.deliverable
        ? `<div style="color:var(--green);font-weight:600;margin-top:12px">
             ✅ Delivery available! ETA: ${res.eta}
           </div>`
        : `<div style="color:var(--red);font-weight:600;margin-top:12px">
             ❌ Sorry, we don't deliver to this pincode yet.
           </div>`;
    }
    if (res.deliverable) {
      localStorage.setItem('zipp_pincode', pincode);
      const loc = document.getElementById('locationDisplay');
      if (loc) loc.textContent = pincode;
    }
  } catch (e) {
    if (resultEl) resultEl.innerHTML = '<p style="color:var(--red)">Error checking delivery</p>';
  }
}

// ── Search Suggestions ────────────────────────
let searchTimeout = null;

function initSearch() {
  const input = document.getElementById('searchInput');
  const suggestions = document.getElementById('searchSuggestions');
  if (!input || !suggestions) return;

  input.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    const q = input.value.trim();
    if (q.length < 2) { suggestions.classList.remove('open'); return; }
    searchTimeout = setTimeout(async () => {
      try {
        const res = await ProductAPI.search(q, 6);
        if (!res.products.length) { suggestions.classList.remove('open'); return; }
        suggestions.innerHTML = res.products.map(p => `
          <div class="suggestion-item" onclick="viewProduct('${p._id}')">
            <img class="suggestion-img"
                 src="${p.images?.[0] || 'https://via.placeholder.com/40'}"
                 alt="${p.name}" onerror="this.src='https://via.placeholder.com/40'" />
            <div class="suggestion-info">
              <span class="suggestion-name">${p.name}</span>
              <span class="suggestion-price">₹${p.price}</span>
            </div>
          </div>`).join('');
        suggestions.classList.add('open');
      } catch (_) { suggestions.classList.remove('open'); }
    }, 350);
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      suggestions.classList.remove('open');
      window.location.href = `/pages/search.html?q=${encodeURIComponent(input.value.trim())}`;
    }
  });

  document.addEventListener('click', e => {
    if (!input.closest('.nav-search-wrap')?.contains(e.target))
      suggestions.classList.remove('open');
  });
}

function searchFromHero() {
  const val = document.getElementById('heroSearch')?.value?.trim();
  if (val) window.location.href = `/pages/search.html?q=${encodeURIComponent(val)}`;
}

// ── Restore saved location ────────────────────
function restoreLocation() {
  const saved = localStorage.getItem('zipp_pincode');
  const el = document.getElementById('locationDisplay');
  if (saved && el) el.textContent = saved;
}

// ── Init on load ──────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initSearch();
  restoreLocation();
});
