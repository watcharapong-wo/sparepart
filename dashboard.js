// dashboard.js uses global fetchData and API_URL from api.js

function formatDate(isoString) {
  if (!isoString) return "-";
  const d = new Date(isoString);
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

  // Update Welcome Section
  const welcomeMsg = document.getElementById("welcome-message");
  if (welcomeMsg) welcomeMsg.innerText = `Welcome, ${username}!`;
  
  const dateEl = document.getElementById("current-date");
  if (dateEl) {
    dateEl.innerText = new Date().toLocaleDateString('th-TH', { 
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
    });
  }

  try {
    console.log("Loading dashboard data...");
    // Parallel Fetching
    const [stockValueResp, lowStock, movements, warehouseValue, trends, monthlyData] = await Promise.all([
      fetchData("/report/value", token),
      fetchData("/report/low-stock", token),
      fetchData("/report/movements3", token),
      fetchData("/report/value-by-warehouse", token),
      fetchData("/report/movement-trends", token),
      fetchData("/report/monthly-comparison", token)
    ]);

    // Update Stats
    const totalValue = (stockValueResp?.[0]?.stock_value) || 0;
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
            <td>
              <span class="${m.movement_type === 'OUT' ? 'text-danger' : 'text-success'}">${m.movement_type}</span> 
              <strong>${m.quantity}</strong>
            </td>
            <td>${m.part_name || '-'}</td>
            <td>${m.note || m.department || m.receiver || '-'}</td>
          </tr>
        `).join('');
      }

      // Charts
      if (trends) renderTrendChart(trends);
      if (monthlyData) renderMonthlyChart(monthlyData);
      if (warehouseValue) renderWarehouseChart(warehouseValue);

      // Populate Specific Warehouse Values
      const lpn1 = warehouseValue.find(w => w.warehouse_name === 'LPN1');
      const lpn2 = warehouseValue.find(w => w.warehouse_name === 'LPN2');
      
      const el1 = document.getElementById("lpn1-value");
      const el2 = document.getElementById("lpn2-value");
      if (el1) el1.innerText = (lpn1?.total_value || 0).toLocaleString();
      if (el2) el2.innerText = (lpn2?.total_value || 0).toLocaleString();
    }
  } catch (err) {
    console.error("Dashboard error:", err);
  }
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
        { label: 'Stock IN', data: inData, borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', fill: true, tension: 0.4 },
        { label: 'Stock OUT', data: outData, borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', fill: true, tension: 0.4 }
      ]
    },
    options: { maintainAspectRatio: false, plugins: { legend: { position: 'top' } } }
  });
}

function renderWarehouseChart(data) {
  const chartEl = document.getElementById("warehouse-chart");
  if (!chartEl) return;
  const ctx = chartEl.getContext("2d");
  if (charts.warehouse) charts.warehouse.destroy();
  charts.warehouse = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: data.map(d => d.warehouse_name),
      datasets: [{
        data: data.map(d => d.total_value),
        backgroundColor: ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b']
      }]
    },
    options: { maintainAspectRatio: false, cutout: '70%', plugins: { legend: { position: 'bottom' } } }
  });
}

function renderMonthlyChart(data) {
  const chartEl = document.getElementById("monthly-chart");
  if (!chartEl) return;
  const ctx = chartEl.getContext("2d");
  const months = [...new Set(data.map(d => d.month))].sort();
  
  const inData = months.map(m => data.find(d => d.month === m && d.movement_type === 'IN')?.total_qty || 0);
  const outData = months.map(m => data.find(d => d.month === m && d.movement_type === 'OUT')?.total_qty || 0);

  if (charts.monthly) charts.monthly.destroy();
  charts.monthly = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: months,
      datasets: [
        { label: 'Stock IN', data: inData, backgroundColor: '#10b981', borderRadius: 4 },
        { label: 'Stock OUT', data: outData, backgroundColor: '#ef4444', borderRadius: 4 }
      ]
    },
    options: { 
      maintainAspectRatio: false, 
      scales: { y: { beginAtZero: true } },
      plugins: { legend: { position: 'top' } } 
    }
  });
}

console.log("Initializing dashboard...");
loadDashboard();
loadOverdueAlerts();

async function loadOverdueAlerts() {
  try {
    const token = localStorage.getItem("token");
    const data = await fetchData("/report/overdue", token);
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
              <strong style="color: var(--text-color);">${item.receiver}</strong><br>
              <span style="color: var(--text-secondary); font-size: 11px;">${item.part_name}</span>
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
