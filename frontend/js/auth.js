// Defensive fallback: if /js/toast.js failed to load, never crash callers.
if (typeof window.showToast !== 'function') {
  window.showToast = function (message, _type) {
    try { alert(String(message == null ? '' : message)); } catch (_) {}
  };
}

// Auth state management
let currentUser = null;

// Cookies are HttpOnly so JS can't see the access token directly. We treat
// `zipp_user` as the source of truth for "are we logged in"; the server is
// the real authority and api.js refreshes/clears on 401.
function getToken() { return localStorage.getItem('zipp_token'); }
function getUser() {
  const u = localStorage.getItem('zipp_user');
  try { return u ? JSON.parse(u) : null; } catch { return null; }
}
function isLoggedIn() { return !!getUser() || !!getToken(); }
function isAdmin() { const u = getUser(); return u && u.role === 'admin'; }

function setAuth(token, user) {
  // Cookie is the new canonical store — token here is just a legacy mirror
  // that keeps older code paths working until 6.2 lands.
  if (token) localStorage.setItem('zipp_token', token);
  localStorage.setItem('zipp_user', JSON.stringify(user));
  currentUser = user;
  updateNavAuth();
}

function clearAuth() {
  localStorage.removeItem('zipp_token');
  localStorage.removeItem('zipp_user');
  currentUser = null;
  updateNavAuth();
}

async function logout() {
  // Tell the server first so it can revoke the refresh token AND clear the
  // HttpOnly cookies — clearing localStorage alone leaves the user logged
  // in on the server until the refresh token expires.
  try {
    await AuthAPI.logout();
  } catch (_) {
    // Network/server failure — proceed with local cleanup either way.
  }
  clearAuth();
  showToast('Logged out successfully', 'success');
  setTimeout(() => { window.location.href = '/'; }, 600);
}

function updateNavAuth() {
  const user = getUser();
  const loginBtn = document.getElementById('loginBtn');
  const userMenu = document.getElementById('userMenu');
  const userName = document.getElementById('userName');
  const userAvatar = document.getElementById('userAvatar');

  if (user && loginBtn && userMenu) {
    loginBtn.classList.add('hidden');
    userMenu.classList.remove('hidden');
    if (userName) userName.textContent = user.name.split(' ')[0];
    if (userAvatar) userAvatar.textContent = user.name.charAt(0).toUpperCase();
  } else if (loginBtn && userMenu) {
    loginBtn.classList.remove('hidden');
    userMenu.classList.add('hidden');
  }
}

function toggleUserDropdown() {
  const dropdown = document.getElementById('userDropdown');
  if (dropdown) dropdown.classList.toggle('hidden');
}

// Close dropdown on outside click
document.addEventListener('click', (e) => {
  const menu = document.getElementById('userMenu');
  const dropdown = document.getElementById('userDropdown');
  if (menu && dropdown && !menu.contains(e.target)) {
    dropdown.classList.add('hidden');
  }
});

// Validate token + refresh user data from server. Falls back silently on network errors.
async function restoreSession() {
  if (!getToken()) return;
  try {
    const res = await AuthAPI.me();
    if (res && res.user) {
      // Refresh stored user (handles name/role/avatar changes since last login)
      localStorage.setItem('zipp_user', JSON.stringify(res.user));
      currentUser = res.user;
    }
  } catch (err) {
    // api.js already cleared the token on 401; nothing more to do.
    // For network errors keep the cached session so offline reload still works.
  } finally {
    updateNavAuth();
  }
}

// Init auth state on load
document.addEventListener('DOMContentLoaded', () => {
  updateNavAuth();      // Immediate paint from localStorage (no flicker)
  restoreSession();     // Background validation + refresh
});

// Protected page guard
function requireAuth(redirectTo = '/pages/login.html') {
  if (!isLoggedIn()) {
    window.location.href = redirectTo;
    return false;
  }
  return true;
}

function requireAdmin() {
  if (!isLoggedIn() || !isAdmin()) {
    window.location.href = '/';
    return false;
  }
  return true;
}
