window.API_URL = `${window.location.protocol}//${window.location.hostname}:5000`;
const API_URL = window.API_URL;

function normalizeRole(role) {
  const value = String(role || "").trim().toLowerCase().replace(/[_\s]+/g, "-");
  if (value === "coadmin") return "co-admin";
  return value;
}

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
    const result = await response.json().catch(() => ({}));
    const requestId = response.headers.get("x-request-id") || result.requestId;
    handleAuthFailure(response.status);
    if (!response.ok) {
      const err = new Error(result.error || `Fetch failed: ${response.status}`);
      err.status = response.status;
      err.requestId = requestId;
      if (requestId) err.message = `${err.message} (ref: ${requestId})`;
      throw err;
    }
    return result;
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
    const requestId = response.headers.get("x-request-id") || result.requestId;
    handleAuthFailure(response.status);
    if (!response.ok) {
      const err = new Error(result.error || `DELETE failed: ${response.status}`);
      err.status = response.status;
      err.requestId = requestId;
      if (requestId) err.message = `${err.message} (ref: ${requestId})`;
      throw err;
    }
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
    const requestId = response.headers.get("x-request-id") || result.requestId;
    handleAuthFailure(response.status);
    if (!response.ok) {
      const err = new Error(result.error || `POST failed: ${response.status}`);
      err.status = response.status;
      err.requestId = requestId || null;
      if (requestId) {
        err.message = `${err.message} (ref: ${requestId})`;
      }
      throw err;
    }
    if (requestId && typeof result === "object" && result !== null && !result.requestId) {
      result.requestId = requestId;
    }
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
    const requestId = response.headers.get("x-request-id") || result.requestId;
    handleAuthFailure(response.status);
    if (!response.ok) {
      const err = new Error(result.error || `PUT failed: ${response.status}`);
      err.status = response.status;
      err.requestId = requestId;
      if (requestId) err.message = `${err.message} (ref: ${requestId})`;
      throw err;
    }
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
  const userRole = normalizeRole(localStorage.getItem("role") || "viewer");
  document.querySelectorAll("[data-role-required]").forEach((el) => {
    const requiredRoles = el
      .getAttribute("data-role-required")
      .split(",")
      .map((role) => normalizeRole(role));
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

  // Remove after 30 seconds (user requested longer visibility)
  setTimeout(() => {
    toast.classList.add("removing");
    toast.addEventListener("animationend", () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    });
  }, 30000);
};

/* ============================================
   UI UTILITIES: BUTTON LOADING STATES
   ============================================ */
window.setButtonLoading = function(button, isLoading = true) {
  if (!button) return;
  
  if (isLoading) {
    button.classList.add("btn-loading");
    button.disabled = true;
    const loader = document.createElement("span");
    loader.className = "btn-loader";
    const originalText = button.textContent;
    button.innerHTML = '';
    button.appendChild(loader);
    button.appendChild(document.createTextNode(originalText));
    button.dataset.originalText = originalText;
  } else {
    button.classList.remove("btn-loading");
    button.disabled = false;
    const originalText = button.dataset.originalText || button.textContent;
    button.innerHTML = originalText;
    delete button.dataset.originalText;
  }
};

/* ============================================
   UI UTILITIES: FORM VALIDATION
   ============================================ */
window.showFieldError = function(fieldEl, errorMessage) {
  if (!fieldEl) return;
  
  // Add error class to field
  const formGroup = fieldEl.closest(".stacked-form-group") || fieldEl.closest(".form-group");
  if (formGroup) {
    formGroup.classList.add("form-error");
  } else {
    fieldEl.classList.add("form-error");
  }
  
  // Remove existing error message if any
  const existingError = fieldEl.parentElement?.querySelector(".form-error-message");
  if (existingError) existingError.remove();
  
  // Create and append error message
  const errorEl = document.createElement("span");
  errorEl.className = "form-error-message";
  errorEl.textContent = errorMessage;
  fieldEl.parentElement.appendChild(errorEl);
};

window.clearFieldError = function(fieldEl) {
  if (!fieldEl) return;
  
  // Remove error class
  const formGroup = fieldEl.closest(".stacked-form-group") || fieldEl.closest(".form-group");
  if (formGroup) {
    formGroup.classList.remove("form-error");
  } else {
    fieldEl.classList.remove("form-error");
  }
  
  // Remove error message
  const errorEl = fieldEl.parentElement?.querySelector(".form-error-message");
  if (errorEl) errorEl.remove();
};

window.validateField = function(fieldEl, validationType = "required", customMessage = "") {
  const value = (fieldEl.value || "").trim();
  let isValid = true;
  let message = customMessage;
  
  if (validationType === "required") {
    isValid = value.length > 0;
    message = message || "This field is required";
  } else if (validationType === "email") {
    isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    message = message || "Please enter a valid email";
  } else if (validationType === "number") {
    isValid = !isNaN(value) && value.length > 0;
    message = message || "Please enter a valid number";
  } else if (validationType === "min-length") {
    const minLength = parseInt(fieldEl.dataset.minLength || "3");
    isValid = value.length >= minLength;
    message = message || `Minimum ${minLength} characters required`;
  } else if (validationType === "phone") {
    isValid = /^[\d\s\-\+\(\)]+$/.test(value) && value.length >= 8;
    message = message || "Please enter a valid phone number";
  }
  
  if (!isValid) {
    window.showFieldError(fieldEl, message);
  } else {
    window.clearFieldError(fieldEl);
  }
  
  return isValid;
};

/* ============================================
   UI UTILITIES: EMPTY STATES
   ============================================ */
window.showEmptyState = function(containerEl, title = "No data", message = "There's nothing to display here", icon = "📭") {
  if (!containerEl) return;
  
  containerEl.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">${icon}</div>
      <div class="empty-state-title">${title}</div>
      <div class="empty-state-message">${message}</div>
    </div>
  `;
};

window.showTableEmptyState = function(tableEl, colspanCount = 5, title = "No data", icon = "📭") {
  if (!tableEl) return;
  
  const tbody = tableEl.querySelector("tbody");
  if (!tbody) return;
  
  tbody.innerHTML = `
    <tr class="empty-state-row">
      <td colspan="${colspanCount}" class="empty-state-content">
        <div style="font-size: 32px; margin-bottom: 8px;">${icon}</div>
        <div style="font-weight: 600; color: var(--text-main); margin-bottom: 4px;">${title}</div>
        <div style="font-size: 13px; color: #94a3b8;">No records to display</div>
      </td>
    </tr>
  `;
};