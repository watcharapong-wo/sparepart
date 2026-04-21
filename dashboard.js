// dashboard.js uses global fetchData and API_URL from api.js

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(isoString) {
  if (!isoString) return "-";
  // SQLite CURRENT_TIMESTAMP returns UTC as 'YYYY-MM-DD HH:MM:SS' (no timezone marker).
  // Append 'Z' so JS correctly parses it as UTC and converts to local time.
  const normalized = typeof isoString === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(isoString)
    ? isoString.replace(' ', 'T') + 'Z'
    : isoString;
  const d = new Date(normalized);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

let charts = {};

async function loadDashboard() {
  const token = localStorage.getItem("token");
  const username = localStorage.getItem("username") || "User";
  
  if (!token) {
     window.location.href = "login.html";
     return;
  }

  // Populate Filter once if empty
  await populateWarehouseFilter(token);
  const warehouseId = document.getElementById("warehouse-filter")?.value || 'all';
  const filterQuery = `?warehouseId=${warehouseId}`;

  // Update Welcome Section
  const welcomeMsg = document.getElementById("welcome-message");
  const icons = ["👋", "✨", "🌟", "😊", "🚀", "💻", "🛠️"];
  const randomIcon = icons[Math.floor(Math.random() * icons.length)];
  if (welcomeMsg) welcomeMsg.innerText = `${i18nText("welcome", "Welcome")}, ${username} ${randomIcon}`;
  
  const dateEl = document.getElementById("current-date");
  if (dateEl) {
    const locale = currentLang === 'th' ? 'th-TH' : 'en-US';
    dateEl.innerText = new Date().toLocaleDateString(locale, { 
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
    });
  }

  try {
    console.log(`Loading dashboard data for ${warehouseId}...`);
    
    // Prepare warehouse data endpoint based on selection
    const warehouseDataEndpoint = warehouseId === 'all' 
      ? "/report/value-by-warehouse"
      : `/report/top-parts-by-warehouse${filterQuery}`;
    
    // Keep dashboard usable even when one report endpoint fails.
    const settled = await Promise.allSettled([
      fetchData(`/report/value${filterQuery}`, token),
      fetchData(`/report/low-stock${filterQuery}`, token),
      fetchData(`/report/movements3${filterQuery}`, token),
      fetchData(warehouseDataEndpoint, token),
      fetchData(`/report/movement-trends${filterQuery}`, token),
      fetchData(`/report/monthly-comparison${filterQuery}`, token),
      fetchData(`/report/expense-by-warehouse${filterQuery}`, token),
      fetchData(`/report/withdraw-by-account${filterQuery}`, token)
    ]);

    const pick = (index, fallback, label) => {
      const item = settled[index];
      if (item.status === "fulfilled") return item.value;
      console.error(`Dashboard partial failure [${label}]:`, item.reason);
      return fallback;
    };

    const stockValueResp = pick(0, [], "value");
    const lowStock = pick(1, [], "low-stock");
    const movements = pick(2, [], "movements3");
    const warehouseValue = pick(3, [], "warehouse-data");
    const trends = pick(4, [], "movement-trends");
    const monthlyData = pick(5, [], "monthly-comparison");
    const expensesByWarehouse = pick(6, [], "expense-by-warehouse");
    const accountData = pick(7, [], "withdraw-by-account");

    // Update Stats
    const totalValue = Number(stockValueResp?.[0]?.stock_value || 0);
    document.getElementById("stock-value").innerText = totalValue.toLocaleString();
    document.getElementById("low-stock").innerText = lowStock?.length || 0;
    
    if (Array.isArray(movements)) {
      document.getElementById("stock-out").innerText = movements.filter(m => m.movement_type === "OUT").length;
      document.getElementById("recent-movements-count").innerText = movements.length;

      // Recent Movements Table
      const tableBody = document.querySelector("#recent-movements tbody");
      if (tableBody) {
        tableBody.innerHTML = movements.slice(0, 5).map(m => `
          <tr>
            <td>${formatDate(m.movement_date)}</td>
            <td>${escapeHtml(m.movement_type)} ${m.quantity}</td>
            <td>${escapeHtml(m.part_name || '-')}</td>
            <td>${escapeHtml(m.partType || m.part_no || '-')}</td>
            <td>${escapeHtml(m.note || m.department || m.receiver || '-')}</td>
            <td style="color:var(--primary); font-weight:600;">฿${(Number(m.quantity || 0) * Number(m.price || 0)).toLocaleString()}</td>
            <td><span class="badge badge-user">${escapeHtml(m.username || '-')}</span></td>
          </tr>
        `).join('');
      }

      // Charts
      if (trends) renderTrendChart(trends);
      if (monthlyData) renderMonthlyChart(monthlyData);
      if (warehouseValue) renderWarehouseChart(warehouseValue);
      if (accountData) renderAccountChart(accountData, warehouseId);

      loadInsights(warehouseId);

      // Populate Expense & Out Stats
      let totalExp = 0;
      let totalQty = 0;

      if (warehouseId === 'all') {
        totalExp = (expensesByWarehouse || []).reduce((sum, w) => sum + (w.total_expense || 0), 0);
        totalQty = (expensesByWarehouse || []).reduce((sum, w) => sum + (w.total_qty || 0), 0);
      } else {
        const wh = (expensesByWarehouse || []).find(w => String(w.warehouse_name) === String(getSelectedWarehouseName()));
        totalExp = wh?.total_expense || 0;
        totalQty = wh?.total_qty || 0;
      }

      const elExp = document.getElementById("total-expense");
      const elOut = document.getElementById("total-out");
      const elConsumed = document.getElementById("total-consumed-value");
      if (elExp) elExp.innerText = totalExp.toLocaleString();
      if (elOut) elOut.innerText = totalQty.toLocaleString();
      if (elConsumed) elConsumed.innerText = "฿" + totalExp.toLocaleString();

      // NEW: Load high-level stats and usage charts
      loadParts();
    }
  } catch (err) {
    console.error("Dashboard error:", err);
  }
}

let filterInitialized = false;
async function populateWarehouseFilter(token) {
  if (filterInitialized) return;
  const select = document.getElementById("warehouse-filter");
  if (!select) return;

  try {
    const warehouses = await fetchData("/warehouses", token);
    if (Array.isArray(warehouses)) {
      warehouses.forEach(w => {
        const opt = document.createElement("option");
        opt.value = w.id;
        opt.textContent = w.name;
        select.appendChild(opt);
      });
      filterInitialized = true;
      select.addEventListener("change", () => loadDashboard());
    }
  } catch (err) {
    console.error("Failed to load warehouses:", err);
  }
}

function getSelectedWarehouseName() {
  const select = document.getElementById("warehouse-filter");
  if (!select) return "";
  return select.options[select.selectedIndex].text;
}

function renderTrendChart(trends) {
  const chartEl = document.getElementById("trend-chart");
  if (!chartEl) return;
  const ctx = chartEl.getContext("2d");
  const dates = [...new Set(trends.map(t => t.date))].sort();
  
  const inData = dates.map(d => trends.find(t => t.date === d && t.movement_type === 'IN')?.total_qty || 0);
  const outData = dates.map(d => trends.find(t => t.date === d && t.movement_type === 'OUT')?.total_qty || 0);

  if (charts.trend) charts.trend.destroy();
  charts.trend = new Chart(ctx, {
    type: 'line',
    data: {
      labels: dates.map(d => formatDate(d)),
      datasets: [
        { label: i18nText("movementIn", "Stock IN"), data: inData, borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', fill: true, tension: 0.4 },
        { label: i18nText("movementOut", "Stock OUT"), data: outData, borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', fill: true, tension: 0.4 }
      ]
    },
    options: { maintainAspectRatio: false, plugins: { legend: { position: 'top' } } }
  });
}

function renderWarehouseChart(data) {
  const chartEl = document.getElementById("warehouse-chart");
  if (!chartEl || !Array.isArray(data) || data.length === 0) return;
  
  const ctx = chartEl.getContext("2d");
  
  if (charts.warehouse) charts.warehouse.destroy();
  
  // Check data type: warehouse_name (comparison) vs part_no (top parts)
  const isWarehouseComparison = data.some(d => d.warehouse_name);
  
  if (isWarehouseComparison) {
    // Warehouse comparison - doughnut chart
    charts.warehouse = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: data.map(d => d.warehouse_name),
        datasets: [{
          data: data.map(d => d.total_value),
          backgroundColor: ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899']
        }]
      },
      options: { 
        maintainAspectRatio: false, 
        cutout: '70%', 
        plugins: { 
          legend: { position: 'bottom' },
          title: { display: true, text: i18nText("inventoryByWarehouse", "Inventory by Warehouse") }
        } 
      }
    });
  } else {
    // Top parts by warehouse - bar chart
    charts.warehouse = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.map(d => `${d.part_no} - ${d.name.substring(0, 20)}`),
        datasets: [{
          label: i18nText("timesConsumed", "Times Consumed"),
          data: data.map(d => d.total_consumed),
          backgroundColor: '#8b5cf6',
          borderRadius: 4
        }]
      },
      options: {
        maintainAspectRatio: false,
        indexAxis: 'y',
        scales: { x: { beginAtZero: true } },
        plugins: {
          legend: { position: 'top' },
          title: { display: true, text: i18nText("topPartsConsumed", "Top 5 Parts Consumed") }
        }
      }
    });
  }
}

function renderMonthlyChart(data) {
  const months = [...new Set(data.map(d => d.month))].sort();
  
  // 1. Quantity Comparison Chart
  const ctxQty = document.getElementById('monthly-chart')?.getContext('2d');
  if (ctxQty) {
    if (charts.monthly) charts.monthly.destroy();
    const inData = months.map(m => data.find(d => d.month === m && d.movement_type === 'IN')?.total_qty || 0);
    const outData = months.map(m => data.find(d => d.month === m && d.movement_type === 'OUT')?.total_qty || 0);

    charts.monthly = new Chart(ctxQty, {
      type: 'bar',
      data: {
        labels: months,
        datasets: [
          { label: i18nText("movementIn", "Stock IN"), data: inData, backgroundColor: '#10b981', borderRadius: 4 },
          { label: i18nText("movementOut", "Stock OUT"), data: outData, backgroundColor: '#ef4444', borderRadius: 4 }
        ]
      },
      options: { maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
    });
  }

  // 2. Financial Spending Chart
  const ctxVal = document.getElementById('spending-chart')?.getContext('2d');
  if (ctxVal) {
    if (charts.spending) charts.spending.destroy();
    const spendingData = months.map(m => {
      const movements = data.filter(d => d.month === m && ['OUT', 'BORROW'].includes(d.movement_type));
      return movements.reduce((sum, d) => sum + (Number(d.total_value) || 0), 0);
    });

    charts.spending = new Chart(ctxVal, {
      type: 'line',
      data: {
        labels: months,
        datasets: [{ 
          label: i18nText("monthlySpending", "Monthly Spending"), 
          data: spendingData, 
          borderColor: '#f59e0b', 
          backgroundColor: 'rgba(245, 158, 11, 0.1)', 
          fill: true,
          tension: 0.4
        }]
      },
      options: { 
        maintainAspectRatio: false, 
        scales: { y: { beginAtZero: true, ticks: { callback: (v) => '฿' + v.toLocaleString() } } }
      }
    });
  }
}

console.log("Initializing dashboard...");
loadDashboard();
loadOverdueAlerts();

async function loadOverdueAlerts() {
  try {
    const token = localStorage.getItem("token");
    const warehouseId = document.getElementById("warehouse-filter")?.value || 'all';
    const data = await fetchData(`/report/overdue?warehouseId=${warehouseId}`, token);
    const container = document.getElementById("overdue-alerts-container");
    if (!container) return;

    if (Array.isArray(data) && data.length > 0) {
      let html = `
        <div class="card" style="background: rgba(239, 68, 68, 0.1); border: 1px solid var(--danger); min-width: 300px;">
          <div class="card-title" style="color: var(--danger); margin-bottom: 8px;">
            <span data-i18n="overdueAlerts">Overdue Alerts</span> (${data.length})
          </div>
          <div style="max-height: 150px; overflow-y: auto;">
      `;
      data.forEach(item => {
        const dueDate = new Date(item.due_date);
        const now = new Date();
        const diffDays = Math.floor((now - dueDate) / (1000 * 60 * 60 * 24));
        html += `
          <div style="font-size: 13px; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid rgba(239, 68, 68, 0.1); display: flex; justify-content: space-between; align-items: center;">
            <div>
              <strong style="color: var(--text-color);">${escapeHtml(item.receiver)}</strong><br>
              <span style="color: var(--text-secondary); font-size: 11px;">${escapeHtml(item.part_name)}</span>
            </div>
            <div style="text-align: right;">
              <span style="color: var(--danger); font-weight: 600;">${diffDays} <span data-i18n="daysOverdue">Days</span></span>
            </div>
          </div>
        `;
      });
      html += `</div></div>`;
      container.innerHTML = html;
      if (typeof applyTranslations === "function") applyTranslations();
    } else {
      container.innerHTML = "";
    }
  } catch (err) {
    console.warn("Failed to load overdue alerts:", err);
  }
}

function renderAccountChart(data, warehouseId) {
  console.log("renderAccountChart called with data:", data);
  const chartEl = document.getElementById("account-chart");
  if (!chartEl) return;
  const ctx = chartEl.getContext("2d");
  
  if (charts.account) charts.account.destroy();
  
  if (!data || !Array.isArray(data) || data.length === 0) {
    console.warn("No data for account chart");
    // Show empty state if needed, or just let Chart.js show empty
  }

  charts.account = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(d => String(d.name || "Unknown")),
      datasets: [{
        label: i18nText("withdrawalsByAccount", "Top 10 Parts Withdrawn"),
        data: data.map(d => Number(d.total_qty || 0)),
        backgroundColor: 'rgba(139, 92, 246, 0.6)',
        borderColor: '#8b5cf6',
        borderWidth: 1,
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: 'y',
      maintainAspectRatio: false,
      responsive: true,
      scales: {
        x: { 
          beginAtZero: true,
          ticks: { stepSize: 1 }
        }
      },
      plugins: {
        legend: { display: false }
      }
    }
  });
  loadInsights(warehouseId || document.getElementById("warehouse-filter")?.value || 'all');
}

let parts = [];
let chartInstance = null;

async function loadMonthlyUsage() {
  const ctx = document.getElementById('usageChart');
  if (!ctx) return;

  try {
    const token = localStorage.getItem("token");
    const data = await fetchData("/report/monthly-usage", token);
    
    if (chartInstance) chartInstance.destroy();

    const labels = (data || []).map(row => row.month);
    const values = (data || []).map(row => row.total);

    chartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Total Qty Moving Out',
          data: values,
          backgroundColor: '#3b82f6',
          borderRadius: 4,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: { beginAtZero: true, grid: { display: false } },
          x: { grid: { display: false } }
        }
      }
    });
  } catch (err) {
    console.error("Failed to load chart data:", err);
  }
}

async function loadParts() {
  try {
    const token = localStorage.getItem("token");
    const data = await fetchData("/spareparts", token);
    parts = Array.isArray(data) ? data : [];
    
    // Update Stats
    document.getElementById("total-parts").textContent = parts.length;
    const lowStock = parts.filter(p => Number(p.quantity) <= 5).length;
    document.getElementById("low-stock-count").textContent = lowStock;

    displayParts(parts);
    renderWarehouseInventoryTable(parts); // Ensure this is called with parts data
    await loadMonthlyUsage();
  } catch (err) {
    console.error("Failed to load parts", err);
  }
}

function renderWarehouseInventoryTable(parts) {
  const tableBody = document.querySelector("#warehouse-inventory-table tbody");
  if (!tableBody) return;

  if (!parts || parts.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="3" class="text-center">${i18nText("noData", "No items")}</td></tr>`;
    return;
  }

  const summary = {};
  parts.forEach(p => {
    const wh = p.warehouse_name || "Unassigned";
    if (!summary[wh]) summary[wh] = { count: 0, value: 0 };
    summary[wh].count++;
    summary[wh].value += (Number(p.quantity) * Number(p.price || 0));
  });

  tableBody.innerHTML = Object.entries(summary).map(([wh, data]) => `
    <tr>
      <td><strong>${wh}</strong></td>
      <td>${data.count} ${i18nText("pieces", "items")}</td>
      <td>฿${data.value.toLocaleString()}</td>
    </tr>
  `).join("");
}

async function loadInsights(warehouseId) {
  const token = localStorage.getItem("token");
  const data = await fetchData(`/report/insights?warehouseId=${warehouseId}`, token);
  
  if (data) {
    // Render Popular Parts Mini List
    const popularMiniList = document.getElementById("popular-parts-mini-list");
    if (popularMiniList) {
      popularMiniList.innerHTML = (data.popular || []).slice(0, 5).map(p => {
        const value = Number(p.total_value || 0);
        const valueText = value > 0 ? value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : "-";
        const unitPrice = Number(p.price || 0);
        const unitPriceText = unitPrice > 0 ? `฿${unitPrice.toLocaleString()}/unit` : '';
        return `
          <div class="mini-row" style="flex-direction:column; align-items:stretch; gap:2px; padding:8px 4px; border-bottom:1px solid var(--border-color);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-weight:600;">${p.name} <small class="text-muted">(${p.partType || p.part_no})</small></span>
              <span class="mini-qty" style="white-space:nowrap;">${p.total_consumed} ${i18nText("issued", "issued")}</span>
            </div>
            <div style="display:flex; justify-content:space-between;">
              <span style="font-size:11px; color:var(--text-muted);">${unitPriceText}</span>
              <span style="font-size:11px; color:var(--text-muted);">${i18nText("totalValue", "Total Value")}: <strong style="color:var(--primary);">${valueText}</strong></span>
            </div>
          </div>
        `;
      }).join("");
    }

    // Render Popular Parts Table
    const popularTable = document.querySelector("#popular-parts-table tbody");
    if (popularTable) {
      popularTable.innerHTML = (data.popular || []).map((p, i) => {
        const val = Number(p.total_value || 0);
        return `
        <tr>
          <td>${i + 1}</td>
          <td>${escapeHtml(p.name)} <small class="text-muted">(${p.partType || p.part_no})</small></td>
          <td><strong>${p.total_consumed}</strong></td>
          <td style="color:var(--primary); font-weight:600;">฿${val.toLocaleString()}</td>
        </tr>`;
      }).join("");
      if (!data.popular || data.popular.length === 0) popularTable.innerHTML = `<tr><td colspan="4" class="text-center">${i18nText("noData", "No data")}</td></tr>`;
    }

    const lowStockTable = document.querySelector("#low-stock-table tbody");
    if (lowStockTable) {
      lowStockTable.innerHTML = (data.lowStock || []).map((p) => {
        const val = (Number(p.quantity) * Number(p.price || 0));
        const valText = val > 0 ? `฿${val.toLocaleString()}` : '-';
        return `
        <tr>
          <td>${escapeHtml(p.name || '-')}</td>
          <td class="text-danger"><strong>${p.quantity}</strong></td>
          <td style="color:var(--primary); font-weight:600;">${valText}</td>
          <td>${escapeHtml(p.warehouse_name || '-')}</td>
        </tr>`;
      }).join("");
    }

    const lowStockInsightsTable = document.querySelector("#low-stock-insights-table tbody");
    if (lowStockInsightsTable) {
      lowStockInsightsTable.innerHTML = (data.lowStock || []).map((p) => `
        <tr>
          <td>${escapeHtml(p.partType || p.part_no || '-')}</td>
          <td class="text-danger"><strong>${p.quantity}</strong></td>
          <td>${escapeHtml(p.warehouse_name || '-')}</td>
        </tr>
      `).join("");
      if (!data.lowStock || data.lowStock.length === 0) lowStockInsightsTable.innerHTML = `<tr><td colspan="3" class="text-center">${i18nText("noLowStock", "No low stock items")}</td></tr>`;
    }
    // Render Overdue Items
    const overdueTable = document.querySelector("#overdue-insights-table tbody");
    if (overdueTable) {
      overdueTable.innerHTML = (data.overdue || []).map((item) => `
        <tr>
          <td>${escapeHtml(item.receiver || '-')}</td>
          <td>${escapeHtml(item.partType || item.part_no || item.part_name || '-')}</td>
          <td class="text-danger">${escapeHtml(item.days_overdue ?? '-')}</td>
        </tr>
      `).join("");
      if (!data.overdue || data.overdue.length === 0) overdueTable.innerHTML = `<tr><td colspan="3" class="text-center">${i18nText("noOverdueItems", "No overdue items")}</td></tr>`;
    }

    // Render Dead Stock
    const deadTable = document.querySelector("#dead-stock-table tbody");
    if (deadTable) {
      deadTable.innerHTML = (data.deadStock || []).map(p => `
        <tr>
          <td>${p.partType || p.part_no}</td>
          <td>${p.name}</td>
          <td><strong>${p.quantity ?? 0}</strong></td>
          <td>${Number(p.stock_value || 0).toLocaleString()}</td>
          <td class="text-danger">${p.last_movement ? new Date(p.last_movement).toLocaleDateString(currentLang === 'th' ? 'th-TH' : 'en-US') : i18nText("never", "Never")}</td>
        </tr>
      `).join("");
      if (!data.deadStock || data.deadStock.length === 0) deadTable.innerHTML = `<tr><td colspan="5" class="text-center">${i18nText("noDeadStock", "No dead stock")}</td></tr>`;
    }

  }
}


async function exportInventory() {
  const token = localStorage.getItem("token");
  const warehouseId = document.getElementById("warehouse-filter")?.value || 'all';
  const url = `/export/inventory?warehouseId=${warehouseId}`;
  
  try {
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error("Export failed");
    
    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `inventory-${warehouseId}-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (err) {
    console.error("Export error:", err);
    if (typeof showToast === "function") showToast("Export failed: " + err.message, "error");
  }
}

// Handle language change re-render
window.addEventListener('languageChanged', () => {
    // Refresh welcome message and date
    const username = localStorage.getItem("username") || "User";
    const welcomeMsg = document.getElementById("welcome-message");
    const icons = ["👋", "✨", "🌟", "😊", "🚀", "💻", "🛠️"];
    const randomIcon = icons[Math.floor(Math.random() * icons.length)];
    if (welcomeMsg) welcomeMsg.innerText = `${i18nText("welcome", "Welcome")}, ${username} ${randomIcon}`;
    
    const dateEl = document.getElementById("current-date");
    if (dateEl) {
        const locale = currentLang === 'th' ? 'th-TH' : 'en-US';
        dateEl.innerText = new Date().toLocaleDateString(locale, { 
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
        });
    }

    // Refresh charts and insights
    try {
        loadDashboard();
        const whId = document.getElementById("warehouse-filter")?.value || 'all';
        loadInsights(whId);
    } catch(err) {
        console.error("Language change refresh error:", err);
    }
});
