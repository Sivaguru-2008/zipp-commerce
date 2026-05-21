// Auth state management
let currentUser = null;

function getToken() { return localStorage.getItem('zipp_token'); }
function getUser() {
  const u = localStorage.getItem('zipp_user');
  try { return u ? JSON.parse(u) : null; } catch { return null; }
}
function isLoggedIn() { return !!getToken(); }
function isAdmin() { const u = getUser(); return u && u.role === 'admin'; }

function setAuth(token, user) {
  localStorage.setItem('zipp_token', token);
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

function logout() {
  clearAuth();
  showToast('Logged out successfully', 'success');
  setTimeout(() => { window.location.href = '/'; }, 800);
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

// Init auth state on load
document.addEventListener('DOMContentLoaded', () => {
  updateNavAuth();
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
