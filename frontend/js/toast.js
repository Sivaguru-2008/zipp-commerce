/* =============================================
   TOAST NOTIFICATIONS — standalone, no deps
   Loaded before auth.js on every page.
   ============================================= */

(function () {
  // Inject minimal fallback CSS once, so toasts still look right
  // even on pages that don't load main.css (e.g. embedded views).
  function injectFallbackStyles() {
    if (document.getElementById('zipp-toast-styles')) return;
    const style = document.createElement('style');
    style.id = 'zipp-toast-styles';
    style.textContent = `
      #toastContainer { position: fixed; top: 24px; right: 24px; z-index: 10000;
                        display: flex; flex-direction: column; gap: 10px;
                        pointer-events: none; }
      .toast { background: #fff; color: #1a1a1a; border-radius: 12px;
               padding: 14px 18px; min-width: 240px; max-width: 360px;
               box-shadow: 0 10px 30px rgba(0,0,0,.15);
               display: flex; align-items: center; gap: 10px;
               border-left: 4px solid #6c3bff; font: 500 14px/1.4 system-ui, sans-serif;
               animation: zipp-toast-in .25s ease forwards;
               pointer-events: auto; }
      .toast.success { border-left-color: #1db954; }
      .toast.error   { border-left-color: #e0245e; }
      .toast.warning { border-left-color: #f5a623; }
      .toast.info    { border-left-color: #6c3bff; }
      @keyframes zipp-toast-in  { from{transform:translateX(120%);opacity:0} to{transform:translateX(0);opacity:1} }
      @keyframes zipp-toast-out { from{transform:translateX(0);opacity:1} to{transform:translateX(120%);opacity:0} }
    `;
    document.head.appendChild(style);
  }

  // Find or create the container. Container survives across calls.
  function ensureContainer() {
    let container = document.getElementById('toastContainer');
    if (container) return container;
    container = document.createElement('div');
    container.id = 'toastContainer';
    (document.body || document.documentElement).appendChild(container);
    return container;
  }

  const ICONS = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };

  /**
   * Show a toast notification.
   * @param {string} message - text to display
   * @param {'success'|'error'|'warning'|'info'} [type='info']
   * @param {number} [duration=3000] - milliseconds before auto-dismiss
   */
  function showToast(message, type = 'info', duration = 3000) {
    try {
      injectFallbackStyles();
      const container = ensureContainer();
      const toast = document.createElement('div');
      toast.className = `toast ${type}`;
      const icon = document.createElement('span');
      icon.textContent = ICONS[type] || ICONS.info;
      const text = document.createElement('span');
      text.textContent = String(message == null ? '' : message);
      toast.appendChild(icon);
      toast.appendChild(text);
      container.appendChild(toast);
      setTimeout(() => {
        toast.style.animation = 'zipp-toast-out .25s ease forwards';
        setTimeout(() => toast.remove(), 250);
      }, Math.max(500, duration));
    } catch (e) {
      // Final safety net — never let the toast layer crash the caller
      try { console.warn('showToast failed, falling back to alert:', e); alert(message); } catch (_) {}
    }
  }

  window.showToast = showToast;
})();
