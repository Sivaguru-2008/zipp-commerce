// API Configuration
const API_BASE = '/api';

const api = {
  async request(method, endpoint, data = null, isFormData = false) {
    const token = localStorage.getItem('zipp_token');
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (!isFormData) headers['Content-Type'] = 'application/json';

    const config = {
      method,
      headers,
    };
    if (data) {
      config.body = isFormData ? data : JSON.stringify(data);
    }

    try {
      const res = await fetch(`${API_BASE}${endpoint}`, config);
      const json = await res.json();
      if (!res.ok) {
        // express-validator returns { errors: [{ msg, path, ... }] } on 422
        const validatorMsg = Array.isArray(json.errors) && json.errors[0] && json.errors[0].msg;
        const err = new Error(validatorMsg || json.message || 'Request failed');
        err.status = res.status;
        err.errors = json.errors;
        // Auto-clear stale session on token failure
        if (res.status === 401 && endpoint !== '/auth/login' && endpoint !== '/auth/register') {
          localStorage.removeItem('zipp_token');
          localStorage.removeItem('zipp_user');
        }
        throw err;
      }
      return json;
    } catch (err) {
      throw err;
    }
  },

  get: (endpoint) => api.request('GET', endpoint),
  post: (endpoint, data) => api.request('POST', endpoint, data),
  put: (endpoint, data) => api.request('PUT', endpoint, data),
  delete: (endpoint) => api.request('DELETE', endpoint),
  postForm: (endpoint, data) => api.request('POST', endpoint, data, true),
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
  changePassword: (currentPassword, newPassword) => api.put('/auth/change-password', { currentPassword, newPassword }),
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
