// API client.
//
// Auth in Sprint 6 lives in HttpOnly cookies (zipp_at / zipp_rt) set by the
// server. fetch sends them automatically with `credentials: 'include'`. We
// still read a legacy `zipp_token` from localStorage if present so users
// already logged in from before don't get bounced — the server accepts both
// cookies and the Authorization header.
//
// On a 401 we transparently try POST /auth/refresh once. If that succeeds the
// original request is retried with the freshly rotated access cookie.

const API_BASE = '/api';

let refreshInflight = null;          // de-dupe concurrent refresh attempts
let refreshFailedAt = 0;             // back off briefly after a hard failure

async function tryRefresh() {
  if (refreshInflight) return refreshInflight;
  // Don't hammer the refresh endpoint if it just failed.
  if (Date.now() - refreshFailedAt < 5000) return false;

  refreshInflight = (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!res.ok) throw new Error('refresh-failed');
      const json = await res.json().catch(() => ({}));
      // Mirror token into legacy localStorage so any old code paths still
      // expecting it keep working until 6.2 lands.
      if (json.token) localStorage.setItem('zipp_token', json.token);
      if (json.user)  localStorage.setItem('zipp_user', JSON.stringify(json.user));
      return true;
    } catch {
      refreshFailedAt = Date.now();
      return false;
    } finally {
      // Release the lock on next tick so concurrent callers all see it.
      setTimeout(() => { refreshInflight = null; }, 0);
    }
  })();
  return refreshInflight;
}

const api = {
  async request(method, endpoint, data = null, isFormData = false, _retried = false) {
    const headers = {};
    // Legacy fallback — once cookie auth is fully rolled out and the user
    // logs out then in again, this stops being read.
    const legacyToken = localStorage.getItem('zipp_token');
    if (legacyToken) headers['Authorization'] = `Bearer ${legacyToken}`;
    if (!isFormData) headers['Content-Type'] = 'application/json';

    const config = {
      method,
      headers,
      credentials: 'include'   // HttpOnly auth cookies ride with every request
    };
    if (data) {
      config.body = isFormData ? data : JSON.stringify(data);
    }

    const res = await fetch(`${API_BASE}${endpoint}`, config);

    // Try one silent refresh on 401 — except for the auth endpoints themselves
    // (login/register failures are real, not stale-token).
    if (res.status === 401
        && !_retried
        && !endpoint.startsWith('/auth/login')
        && !endpoint.startsWith('/auth/register')
        && !endpoint.startsWith('/auth/refresh')
        && !endpoint.startsWith('/auth/logout')) {
      const refreshed = await tryRefresh();
      if (refreshed) {
        return api.request(method, endpoint, data, isFormData, true);
      }
      // Refresh failed → truly logged out. Clear legacy stash.
      localStorage.removeItem('zipp_token');
      localStorage.removeItem('zipp_user');
    }

    let json;
    try { json = await res.json(); } catch { json = {}; }
    if (!res.ok) {
      const validatorMsg = Array.isArray(json.errors) && json.errors[0] && json.errors[0].msg;
      const err = new Error(validatorMsg || json.message || 'Request failed');
      err.status = res.status;
      err.errors = json.errors;
      throw err;
    }
    // Keep legacy mirror in sync on successful login/register/refresh.
    if (json && json.token) localStorage.setItem('zipp_token', json.token);
    if (json && json.user)  localStorage.setItem('zipp_user', JSON.stringify(json.user));
    return json;
  },

  get:      (endpoint)            => api.request('GET', endpoint),
  post:     (endpoint, data)      => api.request('POST', endpoint, data),
  put:      (endpoint, data)      => api.request('PUT', endpoint, data),
  delete:   (endpoint)            => api.request('DELETE', endpoint),
  postForm: (endpoint, data)      => api.request('POST', endpoint, data, true),
};

// Product APIs
const ProductAPI = {
  getAll: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api.get(`/products?${qs}`);
  },
  getFeatured: () => api.get('/products/featured'),
  getTrending: () => api.get('/products/trending'),
  getById: (id) => api.get(`/products/${id}`),
  search: (q, limit = 10) => api.get(`/products/search?q=${q}&limit=${limit}`),
};

// Category APIs
const CategoryAPI = {
  getAll: () => api.get('/categories'),
  getById: (id) => api.get(`/categories/${id}`),
};

// Cart APIs
const CartAPI = {
  get: () => api.get('/cart'),
  add: (productId, quantity = 1) => api.post('/cart/add', { productId, quantity }),
  update: (productId, quantity) => api.put('/cart/update', { productId, quantity }),
  remove: (productId) => api.delete(`/cart/remove/${productId}`),
  clear: () => api.delete('/cart/clear'),
};

// Auth APIs
const AuthAPI = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  register: (name, email, password, phone) => api.post('/auth/register', { name, email, password, phone }),
  me: () => api.get('/auth/me'),
  refresh: () => api.post('/auth/refresh', {}),
  logout: () => api.post('/auth/logout', {}),
  logoutAll: () => api.post('/auth/logout-all', {}),
  changePassword: (currentPassword, newPassword) => api.put('/auth/change-password', { currentPassword, newPassword }),
  sendOtp: (channel) => api.post('/auth/send-otp', { channel }),
  verifyOtp: (code) => api.post('/auth/verify-otp', { code }),
  resendOtp: () => api.post('/auth/resend-otp', {}),
};

// Order APIs
const OrderAPI = {
  getAll: () => api.get('/orders'),
  getById: (id) => api.get(`/orders/${id}`),
  place: (data) => api.post('/orders', data),
  cancel: (id, reason) => api.put(`/orders/${id}/cancel`, { reason }),
};

// User APIs
const UserAPI = {
  getProfile: () => api.get('/users/profile'),
  updateProfile: (data) => api.put('/users/profile', data),
  addAddress: (data) => api.post('/users/addresses', data),
  updateAddress: (id, data) => api.put(`/users/addresses/${id}`, data),
  deleteAddress: (id) => api.delete(`/users/addresses/${id}`),
};

// Wishlist APIs
const WishlistAPI = {
  get: () => api.get('/wishlist'),
  toggle: (productId) => api.post('/wishlist/toggle', { productId }),
  remove: (productId) => api.delete(`/wishlist/${productId}`),
};

// Delivery APIs
const DeliveryAPI = {
  check: (pincode, lat, lng) => api.post('/delivery/check', { pincode, lat, lng }),
  getEta: (lat, lng) => api.get(`/delivery/eta?lat=${lat}&lng=${lng}`),
};

// Coupon APIs
const CouponAPI = {
  validate: (code, orderAmount) => api.post('/coupons/validate', { code, orderAmount }),
};

// Payment APIs
const PaymentAPI = {
  createOrder: (orderId) => api.post('/payments/create-order', { orderId }),
  verify: (data) => api.post('/payments/verify', data),
};

// Admin APIs
const AdminAPI = {
  getStats: () => api.get('/admin/stats'),
  getOrders: (params = {}) => api.get(`/admin/orders?${new URLSearchParams(params)}`),
  updateOrderStatus: (id, status) => api.put(`/admin/orders/${id}/status`, { status }),
  getProducts: (params = {}) => api.get(`/admin/products?${new URLSearchParams(params)}`),
  getInventory: () => api.get('/admin/inventory'),
  updateInventory: (id, stock) => api.put(`/admin/inventory/${id}`, { stock }),
  getUsers: (params = {}) => api.get(`/admin/users?${new URLSearchParams(params)}`),
};

// Extended Admin API
AdminAPI.getCoupons = () => api.get('/admin/coupons');
AdminAPI.getWarehouses = () => api.get('/admin/warehouses');
AdminAPI.analyticsOverview = () => api.get('/admin/analytics/overview');
AdminAPI.analyticsRevenue  = (days = 14) => api.get(`/admin/analytics/revenue?days=${days}`);
AdminAPI.analyticsUsers    = (days = 14) => api.get(`/admin/analytics/users?days=${days}`);
AdminAPI.analyticsOrders   = (days = 14) => api.get(`/admin/analytics/orders?days=${days}`);
