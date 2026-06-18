// Admin analytics dashboard.
//
// Fetches /api/admin/analytics/{overview,revenue,users,orders} and renders
// inline SVG charts so there's no extra JS bundle. Polls /overview every
// 30s so the "live" KPIs (online users, today's orders, error counts) stay
// fresh while the admin keeps the page open.

(function () {
  const $ = (id) => document.getElementById(id);

  function fmtINR(n) {
    if (n == null) return '₹0';
    return '₹' + Math.round(n).toLocaleString('en-IN');
  }
  function fmtInt(n) {
    return (n == null ? 0 : n).toLocaleString('en-IN');
  }

  function gate() {
    const u = (function () {
      try { return JSON.parse(localStorage.getItem('zipp_user') || 'null'); } catch (_) { return null; }
    })();
    if (!u || u.role !== 'admin') {
      $('adminPanel').style.display = 'none';
      $('adminGate').style.display  = 'block';
      return false;
    }
    return true;
  }

  function getRange() { return +$('rangeSel').value || 14; }

  // --- chart helpers (inline SVG, no library) ---
  function drawBars(svgId, points, valueKey) {
    const svg = $(svgId);
    if (!svg) return;
    const w = 600, h = 180, padL = 36, padR = 8, padT = 10, padB = 22;
    const innerW = w - padL - padR;
    const innerH = h - padT - padB;
    const max = Math.max(1, ...points.map(p => p[valueKey] || 0));
    const barW = Math.max(2, innerW / points.length - 4);
    let html = '';
    points.forEach((p, i) => {
      const v = p[valueKey] || 0;
      const barH = (v / max) * innerH;
      const x = padL + i * (innerW / points.length) + 2;
      const y = padT + innerH - barH;
      html += `<rect class="aa-bar" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" rx="3">
                 <title>${p.date}: ${v}</title>
               </rect>`;
    });
    // Y-axis ticks (0, max/2, max)
    [0, max / 2, max].forEach((tv, i) => {
      const y = padT + innerH - (tv / max) * innerH;
      html += `<text class="aa-chart-axis" x="${padL - 6}" y="${(y + 3).toFixed(1)}" text-anchor="end">${Math.round(tv)}</text>`;
    });
    // X-axis: first, middle, last date labels
    [0, Math.floor(points.length / 2), points.length - 1].forEach(idx => {
      if (!points[idx]) return;
      const x = padL + idx * (innerW / points.length) + barW / 2;
      html += `<text class="aa-chart-axis" x="${x.toFixed(1)}" y="${h - 6}" text-anchor="middle">${points[idx].date.slice(5)}</text>`;
    });
    svg.innerHTML = html;
  }

  function drawArea(svgId, points, valueKey) {
    const svg = $(svgId);
    if (!svg) return;
    const w = 600, h = 180, padL = 40, padR = 8, padT = 10, padB = 22;
    const innerW = w - padL - padR;
    const innerH = h - padT - padB;
    const max = Math.max(1, ...points.map(p => p[valueKey] || 0));
    const xStep = innerW / Math.max(1, points.length - 1);
    let linePath = '';
    let areaPath = '';
    points.forEach((p, i) => {
      const v = p[valueKey] || 0;
      const x = padL + i * xStep;
      const y = padT + innerH - (v / max) * innerH;
      linePath += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1) + ' ';
      areaPath += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1) + ' ';
    });
    if (points.length) {
      const lastX = padL + (points.length - 1) * xStep;
      areaPath += `L${lastX.toFixed(1)},${(padT + innerH).toFixed(1)} L${padL},${(padT + innerH).toFixed(1)} Z`;
    }
    let html = `<path class="aa-area" d="${areaPath}"></path>
                <path class="aa-line" d="${linePath}"></path>`;
    [0, max / 2, max].forEach(tv => {
      const y = padT + innerH - (tv / max) * innerH;
      const label = valueKey === 'revenue' ? '₹' + Math.round(tv) : Math.round(tv);
      html += `<text class="aa-chart-axis" x="${padL - 6}" y="${(y + 3).toFixed(1)}" text-anchor="end">${label}</text>`;
    });
    [0, Math.floor(points.length / 2), points.length - 1].forEach(idx => {
      if (!points[idx]) return;
      const x = padL + idx * xStep;
      html += `<text class="aa-chart-axis" x="${x.toFixed(1)}" y="${h - 6}" text-anchor="middle">${points[idx].date.slice(5)}</text>`;
    });
    svg.innerHTML = html;
  }

  function renderKpis(ov) {
    const tiles = [
      { label: 'Revenue today',    value: fmtINR(ov.orders.revenueToday) },
      { label: 'Orders today',     value: fmtInt(ov.orders.today),       sub: fmtInt(ov.orders.total) + ' all-time' },
      { label: 'Online now',       value: fmtInt(ov.users.onlineNow),    cls: 'ok' },
      { label: 'Users (active 30d)', value: fmtInt(ov.users.active30d), sub: fmtInt(ov.users.total) + ' total' },
      { label: 'New signups today', value: fmtInt(ov.users.newToday) },
      { label: 'Low stock items',  value: fmtInt(ov.inventory.lowStockCount), cls: ov.inventory.lowStockCount > 0 ? 'warn' : '' },
      { label: 'Payment failures (today)', value: fmtInt(ov.ops.today.paymentFailures), cls: ov.ops.today.paymentFailures > 0 ? 'warn' : '' },
      { label: '5xx errors (today)', value: fmtInt(ov.ops.today.errors5xx), cls: ov.ops.today.errors5xx > 0 ? 'warn' : '' },
      { label: 'Slow requests',    value: fmtInt(ov.ops.today.slowRequests) },
      { label: 'Memory (RSS)',     value: ov.ops.memoryMB + ' MB', sub: 'Uptime ' + Math.round(ov.ops.uptimeSeconds/60) + 'm' }
    ];
    $('kpiGrid').innerHTML = tiles.map(t => `
      <div class="aa-card ${t.cls || ''}">
        <div class="label">${t.label}</div>
        <div class="value">${t.value}</div>
        ${t.sub ? `<div class="sub">${t.sub}</div>` : ''}
      </div>
    `).join('');
  }

  function renderTopProducts(rows) {
    const tbody = $('topProductsTable').querySelector('tbody');
    if (!rows || !rows.length) {
      tbody.innerHTML = '<tr><td colspan="3" style="color:#888">No sales in this range.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(r => `
      <tr>
        <td>${(r.name || 'Unknown product').replace(/</g, '&lt;')}</td>
        <td>${fmtInt(r.quantity)}</td>
        <td>${fmtINR(r.revenue)}</td>
      </tr>
    `).join('');
  }

  function renderStatusBreakdown(rows) {
    const tbody = $('statusTable').querySelector('tbody');
    if (!rows || !rows.length) {
      tbody.innerHTML = '<tr><td style="color:#888">No orders in this range.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(r => `
      <tr>
        <td><span class="aa-status-pill ${r._id}">${r._id}</span></td>
        <td style="text-align:right">${fmtInt(r.count)}</td>
      </tr>
    `).join('');
  }

  function renderOps(ov) {
    const ops = ov.ops;
    const live = ov.live;
    const rows = [
      ['Logins today', fmtInt(live.loginsToday)],
      ['Orders today', fmtInt(live.ordersToday)],
      ['Cart adds today', fmtInt(live.cartAdditionsToday)],
      ['DAU', fmtInt(ov.users.dailyActive)],
      ['Payment failures (today)', fmtInt(ops.today.paymentFailures)],
      ['4xx errors (today)', fmtInt(ops.today.errors4xx)],
      ['5xx errors (today)', fmtInt(ops.today.errors5xx)],
      ['Slow requests', fmtInt(ops.today.slowRequests)]
    ];
    $('opsTable').querySelector('tbody').innerHTML = rows.map(([k, v]) =>
      `<tr><td>${k}</td><td style="text-align:right">${v}</td></tr>`
    ).join('');
  }

  async function load() {
    if (!gate()) return;
    const days = getRange();
    $('aaUpdatedAt').textContent = 'Loading…';
    try {
      const [overview, revenue, users, orders] = await Promise.all([
        AdminAPI.analyticsOverview(),
        AdminAPI.analyticsRevenue(days),
        AdminAPI.analyticsUsers(days),
        AdminAPI.analyticsOrders(days)
      ]);
      renderKpis(overview.overview);
      renderOps(overview.overview);
      drawArea('revenueChart', revenue.series, 'revenue');
      drawBars('ordersChart',  orders.series,  'count');
      drawArea('signupsChart', users.signups,  'count');
      renderTopProducts(orders.topProducts);
      renderStatusBreakdown(orders.statusBreakdown);
      $('aaUpdatedAt').textContent = 'Updated ' + new Date().toLocaleTimeString();
    } catch (err) {
      $('aaUpdatedAt').textContent = 'Failed: ' + (err.message || 'request failed');
      if (err.status === 401 || err.status === 403) {
        $('adminPanel').style.display = 'none';
        $('adminGate').style.display = 'block';
      }
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    load();
    $('refreshBtn').addEventListener('click', load);
    $('rangeSel').addEventListener('change', load);
    // Poll just the overview KPIs every 30s so the "live" tiles stay current
    // without re-fetching the heavy chart aggregations.
    setInterval(async function () {
      if (!gate()) return;
      try {
        const overview = await AdminAPI.analyticsOverview();
        renderKpis(overview.overview);
        renderOps(overview.overview);
        $('aaUpdatedAt').textContent = 'Updated ' + new Date().toLocaleTimeString();
      } catch (_) { /* silent */ }
    }, 30_000);
  });
})();
