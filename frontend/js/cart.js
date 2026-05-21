// Cart state
let cartData = { items: [], subtotal: 0, itemCount: 0 };

// Cart sidebar open/close
function openCart() {
  const sidebar = document.getElementById('cartSidebar');
  const overlay = document.getElementById('cartOverlay');
  if (sidebar) sidebar.classList.add('open');
  if (overlay) overlay.classList.add('open');
  loadCart();
}

function closeCart() {
  const sidebar = document.getElementById('cartSidebar');
  const overlay = document.getElementById('cartOverlay');
  if (sidebar) sidebar.classList.remove('open');
  if (overlay) overlay.classList.remove('open');
}

// Load cart from server
async function loadCart() {
  if (!isLoggedIn()) {
    updateCartBadge(0);
    return;
  }
  try {
    const res = await CartAPI.get();
    cartData = res;
    renderCartSidebar(res);
    updateCartBadge(res.itemCount || 0);
  } catch (err) {
    console.error('Cart load error:', err);
  }
}

function updateCartBadge(count) {
  const badge = document.getElementById('cartBadge');
  if (badge) {
    badge.textContent = count;
    badge.style.display = count > 0 ? 'flex' : 'none';
  }
}

function renderCartSidebar(data) {
  const cartItems = document.getElementById('cartItems');
  const cartEmpty = document.getElementById('cartEmpty');
  const cartFooter = document.getElementById('cartFooter');
  const cartSubtotal = document.getElementById('cartSubtotal');
  const cartDelivery = document.getElementById('cartDelivery');
  const cartTotal = document.getElementById('cartTotal');

  if (!cartItems) return;

  const items = data.cart?.items || [];

  if (items.length === 0) {
    cartEmpty.style.display = 'block';
    cartItems.innerHTML = '';
    if (cartFooter) cartFooter.style.display = 'none';
    return;
  }

  if (cartEmpty) cartEmpty.style.display = 'none';
  if (cartFooter) cartFooter.style.display = 'block';

  cartItems.innerHTML = items.map(item => `
    <div class="cart-item" id="cart-item-${item.product._id || item.product}">
      <img class="cart-item-img" src="${item.image || item.product?.images?.[0] || '/images/placeholder.png'}" alt="${item.name}" onerror="this.src='/images/placeholder.png'" />
      <div class="cart-item-info">
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-price">₹${item.price}</div>
      </div>
      <div class="qty-ctrl">
        <button class="qty-btn" onclick="updateCartItem('${item.product._id || item.product}', ${item.quantity - 1})">−</button>
        <span class="qty-num">${item.quantity}</span>
        <button class="qty-btn" onclick="updateCartItem('${item.product._id || item.product}', ${item.quantity + 1})">+</button>
      </div>
    </div>
  `).join('');

  const subtotal = data.subtotal || 0;
  const deliveryFee = subtotal >= 499 ? 0 : 40;
  const total = subtotal + deliveryFee;

  if (cartSubtotal) cartSubtotal.textContent = `₹${subtotal}`;
  if (cartDelivery) cartDelivery.textContent = deliveryFee === 0 ? 'FREE' : `₹${deliveryFee}`;
  if (cartTotal) cartTotal.textContent = `₹${total}`;
}

// Add to cart
async function addToCart(productId, quantity = 1, event) {
  if (event) { event.stopPropagation(); event.preventDefault(); }
  
  if (!isLoggedIn()) {
    showToast('Please login to add items to cart', 'warning');
    setTimeout(() => { window.location.href = '/pages/login.html'; }, 1000);
    return;
  }

  try {
    const res = await CartAPI.add(productId, quantity);
    updateCartBadge(res.itemCount);
    showToast('Added to cart! 🛒', 'success');
    
    // Update the button to show quantity controls
    const addBtn = document.getElementById(`add-btn-${productId}`);
    const qtyCtrl = document.getElementById(`qty-ctrl-${productId}`);
    if (addBtn && qtyCtrl) {
      addBtn.classList.add('hidden');
      qtyCtrl.classList.remove('hidden');
      const numEl = qtyCtrl.querySelector('.qty-num');
      if (numEl) numEl.textContent = quantity;
    }
  } catch (err) {
    showToast(err.message || 'Failed to add to cart', 'error');
  }
}

// Update cart item quantity
async function updateCartItem(productId, quantity) {
  if (!isLoggedIn()) return;
  
  try {
    const res = await CartAPI.update(productId, quantity);
    updateCartBadge(res.itemCount || 0);
    renderCartSidebar(res);

    const addBtn = document.getElementById(`add-btn-${productId}`);
    const qtyCtrl = document.getElementById(`qty-ctrl-${productId}`);
    
    if (quantity <= 0) {
      if (addBtn && qtyCtrl) {
        qtyCtrl.classList.add('hidden');
        addBtn.classList.remove('hidden');
      }
      showToast('Removed from cart', 'success');
    } else {
      if (qtyCtrl) {
        const numEl = qtyCtrl.querySelector('.qty-num');
        if (numEl) numEl.textContent = quantity;
      }
    }
  } catch (err) {
    showToast(err.message || 'Failed to update cart', 'error');
  }
}

// Toggle wishlist
async function toggleWishlist(productId, event) {
  if (event) { event.stopPropagation(); event.preventDefault(); }
  
  if (!isLoggedIn()) {
    showToast('Please login to add to wishlist', 'warning');
    return;
  }
  
  try {
    const res = await WishlistAPI.toggle(productId);
    const btn = document.querySelector(`.wishlist-btn-${productId}`);
    if (btn) {
      btn.textContent = res.added ? '❤️' : '🤍';
      btn.classList.toggle('wishlisted', res.added);
    }
    showToast(res.added ? 'Added to wishlist ❤️' : 'Removed from wishlist', 'success');
  } catch (err) {
    showToast('Login to use wishlist', 'warning');
  }
}

// Init cart on page load
document.addEventListener('DOMContentLoaded', () => {
  loadCart();
  // Make cart icon clickable to open sidebar
  const cartLink = document.querySelector('.nav-cart');
  if (cartLink) {
    cartLink.addEventListener('click', (e) => {
      e.preventDefault();
      openCart();
    });
  }
});
