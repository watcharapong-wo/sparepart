// logs.js
async function loadLogs() {
  const token = localStorage.getItem("token");
  if (!token) {
    window.location.href = "login.html";
    return;
  }

  try {
    const data = await fetchData("/report/activity-logs", token);
    const tbody = document.getElementById("logs-table-body");
    if (!tbody) return;

    tbody.innerHTML = "";
    if (Array.isArray(data) && data.length > 0) {
      data.forEach(log => {
        const row = tbody.insertRow();
        row.insertCell(0).textContent = new Date(log.timestamp).toLocaleString();
        row.insertCell(1).textContent = log.username || '-';
        row.insertCell(2).innerHTML = `<span class="badge ${getBadgeClass(log.action)}">${log.action}</span>`;
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
  if (action.includes("CREATE")) return "bg-success";
  if (action.includes("UPDATE")) return "bg-primary";
  if (action.includes("DELETE")) return "bg-danger";
  if (action.includes("LOGIN")) return "bg-secondary";
  return "bg-info";
}

function updateUserInfo() {
    const username = localStorage.getItem('username');
    const role = localStorage.getItem('role');
    const userDisplay = document.getElementById('user-display');
    if (userDisplay && username && role) {
        userDisplay.textContent = `User: ${username} (${role.toUpperCase()})`;
    }
}

document.addEventListener("DOMContentLoaded", () => {
    updateUserInfo();
    loadLogs();
});
