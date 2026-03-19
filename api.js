window.API_URL = `${window.location.protocol}//${window.location.hostname}:${window.location.port}`;
const API_URL = window.API_URL;

function handleAuthFailure(status) {
  if (status !== 401 && status !== 403) return;
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  localStorage.removeItem("username");
  if (!window.location.pathname.endsWith("login.html")) {
    window.location.href = "login.html";
  }
}

async function fetchData(endpoint, token) {
  try {
    const url = new URL(`${API_URL}${endpoint}`);
    url.searchParams.set("_t", Date.now());

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      handleAuthFailure(response.status);
      throw new Error(errorData.error || `Fetch failed: ${response.status}`);
    }
    return response.json();
  } catch (err) {
    console.error(`fetchData error [${endpoint}]:`, err);
    throw err;
  }
}

async function deleteData(endpoint, token) {
  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    const result = await response.json().catch(() => ({}));
    handleAuthFailure(response.status);
    if (!response.ok) throw new Error(result.error || `DELETE failed: ${response.status}`);
    return result;
  } catch (err) {
    console.error(`deleteData error [${endpoint}]:`, err);
    throw err;
  }
}

async function postData(endpoint, data, token) {
  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(data)
    });
    const result = await response.json().catch(() => ({}));
    handleAuthFailure(response.status);
    if (!response.ok) throw new Error(result.error || `POST failed: ${response.status}`);
    return result;
  } catch (err) {
    console.error(`postData error [${endpoint}]:`, err);
    throw err;
  }
}

async function putData(endpoint, data, token) {
  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(data)
    });
    const result = await response.json().catch(() => ({}));
    handleAuthFailure(response.status);
    if (!response.ok) throw new Error(result.error || `PUT failed: ${response.status}`);
    return result;
  } catch (err) {
    console.error(`putData error [${endpoint}]:`, err);
    throw err;
  }
}

function updateUserStatus() {
  const username = localStorage.getItem("username") || "User";
  const role = localStorage.getItem("role") || "";
  const statusEl = document.getElementById("user-status");
  if (statusEl) {
    // We prioritize using the i18n display if available, but provide a fallback
    if (typeof applyTranslations === "function") {
      // i18n.js will handle displayUserStatus() which uses translations
    } else {
      statusEl.innerText = `${username} (${role.toUpperCase()})`;
    }
  }
}

function checkPermissions() {
  const userRole = localStorage.getItem("role") || "viewer";
  document.querySelectorAll("[data-role-required]").forEach((el) => {
    const requiredRoles = el.getAttribute("data-role-required").split(",");
    if (!requiredRoles.includes(userRole)) el.style.display = "none";
  });
  const userMgmtLink = document.getElementById("nav-users");
  if (userMgmtLink && userRole !== "admin") userMgmtLink.style.display = "none";
}

function exportToCSV(data, filename) {
  if (!data || !data.length) { showToast("No data to export", "warning"); return; }
  const headers = Object.keys(data[0]);
  const rows = data.map(obj => headers.map(h => {
    let v = obj[h] === null ? "" : obj[h];
    return typeof v === "string" ? `"${v.replace(/"/g, '""')}"` : v;
  }).join(","));
  const csvContent = "\ufeff" + [headers.join(","), ...rows].join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

document.addEventListener("DOMContentLoaded", () => {
  checkPermissions();
  updateUserStatus();
  
  // Auto-logout after 5 minutes of inactivity
  const token = localStorage.getItem("token");
  if (token && !window.location.pathname.endsWith("login.html")) {
    let inactivityTimeout;
    const INACTIVITY_LIMIT = 5 * 60 * 1000; // 5 minutes

    const logoutUser = () => {
      localStorage.clear();
      if (typeof showToast === "function") {
        showToast("You have been logged out due to inactivity.", "warning");
        setTimeout(() => { window.location.href = "login.html"; }, 1500);
      } else {
        window.location.href = "login.html";
      }
    };

    const resetInactivityTimer = () => {
      clearTimeout(inactivityTimeout);
      inactivityTimeout = setTimeout(logoutUser, INACTIVITY_LIMIT);
    };

    // Reset timer on these events
    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];
    events.forEach(event => document.addEventListener(event, resetInactivityTimer, { passive: true }));

    resetInactivityTimer(); // Start the timer
  }

  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", (e) => {
      e.preventDefault();
      localStorage.clear();
      window.location.href = "login.html";
    });
  }
});

// UI Helper: Toast Notifications
window.showToast = function(message, type = "info") {
  // Create container if it doesn't exist
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  
  // Icon based on type
  let icon = "ℹ️";
  if (type === "success") icon = "✅";
  if (type === "error") icon = "❌";
  if (type === "warning") icon = "⚠️";

  toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
  container.appendChild(toast);

  // Remove after 3 seconds
  setTimeout(() => {
    toast.classList.add("removing");
    toast.addEventListener("animationend", () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    });
  }, 3000);
};