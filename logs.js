// logs.js
let currentLogsCache = [];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function loadLogs(filters = {}) {
  const token = localStorage.getItem("token");
  if (!token) {
    window.location.href = "login.html";
    return;
  }

  try {
    let url = "/report/activity-logs";
    const params = new URLSearchParams();
    if (filters.startDate) params.append("startDate", filters.startDate);
    if (filters.endDate) params.append("endDate", filters.endDate);
    if (filters.search) params.append("search", filters.search);
    
    if (params.toString()) {
      url += `?${params.toString()}`;
    }

    const data = await fetchData(url, token);
    const tbody = document.getElementById("logs-table-body");
    if (!tbody) return;

    currentLogsCache = Array.isArray(data) ? data : [];
    tbody.innerHTML = "";
    if (currentLogsCache.length > 0) {
      currentLogsCache.forEach(log => {
        const row = tbody.insertRow();
        row.insertCell(0).textContent = new Date(log.timestamp).toLocaleString();
        row.insertCell(1).textContent = log.username || '-';
        row.insertCell(2).innerHTML = `<span class="badge ${getBadgeClass(log.action)}">${escapeHtml(getActionLabel(log.action))}</span>`;
        row.insertCell(3).textContent = log.details || '-';
      });
    } else {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center">No logs found</td></tr>';
    }
  } catch (err) {
    console.error("Failed to load logs:", err);
  }
}

function getBadgeClass(action) {
  if (action.includes("CORRECTION") || action.includes("REVERT")) return "bg-warning";
  if (action.includes("MOVEMENT_")) return "bg-primary";
  if (action.includes("CREATE")) return "bg-success";
  if (action.includes("UPDATE")) return "bg-primary";
  if (action.includes("DELETE")) return "bg-danger";
  if (action.includes("LOGIN")) return "bg-secondary";
  return "bg-info";
}

function getActionLabel(action) {
  const value = String(action || "").toUpperCase();
  if (value === "MOVEMENT_CORRECTION") return i18nText("movementCorrection", "Part Correction");
  if (value === "MOVEMENT_OUT") return i18nText("movementOut", "Stock Out");
  if (value === "MOVEMENT_IN") return i18nText("movementIn", "Stock In");
  if (value === "MOVEMENT_BORROW") return i18nText("movementBorrow", "Borrow");
  if (value === "MOVEMENT_RETURN") return i18nText("movementReturn", "Return");
  if (value === "TRANSFER") return i18nText("movementTransfer", "Transfer");
  return action;
}

function updateUserInfo() {
    const username = localStorage.getItem('username');
    const role = localStorage.getItem('role');
    const userDisplay = document.getElementById('user-status');
    if (userDisplay && username && role) {
        userDisplay.textContent = `User: ${username} (${role.toUpperCase()})`;
    }
}

document.addEventListener("DOMContentLoaded", () => {
    updateUserInfo();
    loadLogs();

    const btnFilter = document.getElementById("btn-filter");
    const btnClear = document.getElementById("btn-clear");

    if (btnFilter) {
        btnFilter.addEventListener("click", () => {
            const filters = {
                startDate: document.getElementById("filter-start-date").value,
                endDate: document.getElementById("filter-end-date").value,
                search: document.getElementById("filter-search").value
            };
            loadLogs(filters);
        });
    }

    if (btnClear) {
        btnClear.addEventListener("click", () => {
            document.getElementById("filter-start-date").value = "";
            document.getElementById("filter-end-date").value = "";
            document.getElementById("filter-search").value = "";
            loadLogs();
        });
    }

    const btnExport = document.getElementById("btn-export");
    if (btnExport) {
        btnExport.addEventListener("click", () => {
            if (!currentLogsCache || currentLogsCache.length === 0) {
                // If translations is not available, default to English string
                const msg = (typeof translations !== 'undefined' && translations[currentLang]?.noDataToExport) 
                    ? translations[currentLang].noDataToExport 
                    : "No data to export";
                if (typeof showToast === 'function') {
                    showToast(msg, "warning");
                } else {
                    alert(msg);
                }
                return;
            }
            
            const exportData = currentLogsCache.map(log => ({
                Timestamp: new Date(log.timestamp).toLocaleString(),
                User: log.username || '-',
                Action: log.action,
                Details: log.details || '-'
            }));
            
            if (typeof exportToCSV === 'function') {
                const dateStr = new Date().toISOString().split('T')[0];
                exportToCSV(exportData, `System_Activity_Logs_${dateStr}.csv`);
            } else {
                console.error("exportToCSV function not found");
            }
        });
    }
});

// Handle language change re-render
window.addEventListener('languageChanged', () => {
    const tbody = document.getElementById("logs-table-body");
    if (!tbody || !currentLogsCache || currentLogsCache.length === 0) return;
    
    tbody.innerHTML = "";
    currentLogsCache.forEach(log => {
        const row = tbody.insertRow();
        row.insertCell(0).textContent = new Date(log.timestamp).toLocaleString();
        row.insertCell(1).textContent = log.username || '-';
        row.insertCell(2).innerHTML = `<span class="badge ${getBadgeClass(log.action)}">${escapeHtml(getActionLabel(log.action))}</span>`;
        row.insertCell(3).textContent = log.details || '-';
    });
});
