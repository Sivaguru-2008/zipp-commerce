/* =============================================
   SUPPORT FAB — floating "Need help?" button.
   Skips on admin and login pages to keep them clean.
   ============================================= */
(function () {
  const path = window.location.pathname;
  const skip = path.endsWith('/admin.html')
            || path.endsWith('/login.html')
            || path.endsWith('/order-success.html');
  if (skip) return;

  function mount() {
    if (document.getElementById('zipp-support-fab')) return;
    const el = document.createElement('div');
    el.id = 'zipp-support-fab';
    el.innerHTML = `
      <style>
        #zipp-support-fab {
          position: fixed; right: 18px; bottom: 18px; z-index: 998;
          display: flex; flex-direction: column; align-items: flex-end; gap: 8px;
        }
        #zipp-support-fab .fab-toggle {
          background: linear-gradient(135deg, #6c3bff, #1db954);
          color: #fff; border: 0; border-radius: 999px;
          padding: 12px 18px; font: 600 14px/1 system-ui, sans-serif;
          box-shadow: 0 10px 30px rgba(108,59,255,.35);
          cursor: pointer; display: flex; align-items: center; gap: 8px;
        }
        #zipp-support-fab .fab-menu {
          display: none; background: #fff; border-radius: 14px;
          box-shadow: 0 20px 40px rgba(0,0,0,.18);
          padding: 8px; min-width: 200px; font: 500 14px system-ui, sans-serif;
        }
        #zipp-support-fab.open .fab-menu { display: block; }
        #zipp-support-fab .fab-menu a {
          display: block; padding: 10px 12px; border-radius: 8px;
          color: #1a1a1a; text-decoration: none;
        }
        #zipp-support-fab .fab-menu a:hover { background: #f6f4ff; }
        @media (max-width: 480px) {
          #zipp-support-fab { right: 12px; bottom: 12px; }
          #zipp-support-fab .fab-toggle { padding: 10px 14px; font-size: 13px; }
        }
      </style>
      <div class="fab-menu">
        <a href="mailto:support@zipp.example?subject=Help%20with%20Zipp">📧 Email support</a>
        <a href="https://wa.me/918000000000" target="_blank" rel="noopener">💬 WhatsApp us</a>
        <a href="tel:+918000000000">📞 Call +91 80000 00000</a>
        <a href="/pages/orders.html">📦 Track your order</a>
      </div>
      <button class="fab-toggle" type="button" aria-label="Need help?">
        <span>💬</span> <span>Help</span>
      </button>
    `;
    document.body.appendChild(el);
    el.querySelector('.fab-toggle').addEventListener('click', (e) => {
      e.stopPropagation();
      el.classList.toggle('open');
    });
    document.addEventListener('click', (e) => {
      if (!el.contains(e.target)) el.classList.remove('open');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
