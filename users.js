function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

document.addEventListener("DOMContentLoaded", function() {
  const role = localStorage.getItem("role");
  if (role !== "admin") {
    showToast("Access Denied: Admin only", "error");
    window.location.href = "dashboard.html";
    return;
  }

  loadAll();

  document.getElementById("add-user-form").addEventListener("submit", async function(e) {
    e.preventDefault();
    
    // Validate required fields
    const usernameEl = document.getElementById("reg-username");
    const passwordEl = document.getElementById("reg-password");
    const roleEl = document.getElementById("reg-role");
    
    const requiredFields = [
      { el: usernameEl, type: "min-length", message: "Username must be at least 3 characters" },
      { el: passwordEl, type: "min-length", message: "Password must be at least 6 characters" },
      { el: roleEl, type: "required", message: "Please select a role" }
    ];
    
    let hasErrors = false;
    requiredFields.forEach(field => {
      if (field.el) {
        if (field.type === "min-length") {
          const minLength = field.el.dataset.minLength || (field.el.id === "reg-password" ? "6" : "3");
          field.el.dataset.minLength = minLength;
        }
        if (!validateField(field.el, field.type, field.message)) {
          hasErrors = true;
        }
      }
    });
    
    if (hasErrors) {
      showToast("Please fix the errors in the form", "error");
      return;
    }
    
    const username = usernameEl.value;
    const password = passwordEl.value;
    const role = roleEl.value;

    try {
      const submitBtn = this.querySelector('button[type="submit"]');
      setButtonLoading(submitBtn, true);
      
      const response = await fetch(`${window.API_URL}/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + localStorage.getItem("token")
        },
        body: JSON.stringify({ username, password, role })
      });

      const data = await response.json();
      if (response.ok) {
        showToast("User created successfully", "success");
        document.getElementById("add-user-form").reset();
        
        // Clear field errors on success
        requiredFields.forEach(field => {
          if (field.el) clearFieldError(field.el);
        });
        
        setButtonLoading(submitBtn, false);
        loadUsers();
      } else {
        showToast("Error: " + (data.error || "Failed to create user"), "error");
        setButtonLoading(submitBtn, false);
      }
    } catch (err) {
      console.error(err);
      setButtonLoading(this.querySelector('button[type="submit"]'), false);
      showToast("System Error", "error");
    }
  });

  document.getElementById("add-reason-form")?.addEventListener("submit", async function (e) {
    e.preventDefault();
    const name = document.getElementById("reason-name").value;
    const token = localStorage.getItem("token");

    try {
      const res = await fetch(`${window.API_URL}/reasons`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        document.getElementById("add-reason-form").reset();
        loadReasons();
      }
    } catch (err) {
      console.error(err);
    }
  });
});

function loadAll() {
  loadUsers();
  loadReasons();
}

async function loadReasons() {
  const token = localStorage.getItem("token");
  try {
    const res = await fetch(`${window.API_URL}/reasons`, {
      headers: { Authorization: "Bearer " + token },
    });
    const data = await res.json();
    const tbody = document.querySelector("#reasons-table tbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (Array.isArray(data)) {
        data.forEach((r) => {
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td>${r.id}</td>
            <td>${r.name}</td>
            <td><button class="btn btn-danger btn-sm" onclick="deleteReason(${r.id})">Delete</button></td>
          `;
          tbody.appendChild(tr);
        });
    }
  } catch (err) {
    console.error(err);
  }
}

async function deleteReason(id) {
  if (!confirm("Are you sure?")) return;
  const token = localStorage.getItem("token");
  try {
    await deleteData(`/reasons/${id}`, token);
    loadReasons();
  } catch (err) {
    console.error(err);
  }
}

async function loadUsers() {
  try {
    const token = localStorage.getItem("token");
    const users = await fetchData("/users", token);
    const tbody = document.querySelector("#users-table tbody");
    if (!tbody) return;
    
    if (!Array.isArray(users) || users.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="table-empty-state"><i style="font-size: 24px;">👥</i><p>No users found.</p></td></tr>`;
      return;
    }
    
    tbody.innerHTML = "";

    users.forEach(user => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${user.id}</td>
        <td>${escapeHtml(user.username)}</td>
        <td><span class="badge badge-${escapeHtml(user.role)}">${escapeHtml(user.role)}</span></td>
        <td class="actions-cell">
          <button class="btn btn-sm" style="background-color: #3b82f6; color: white;" onclick="resetPassword(${user.id})">Reset</button>
          <button class="btn btn-danger btn-sm" onclick="deleteUser(${user.id})" data-i18n="delete">Delete</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
    if (typeof applyTranslations === "function") applyTranslations();
  } catch (err) {
    console.error("loadUsers error:", err);
  }
}

async function deleteUser(id) {
  if (!confirm("Are you sure you want to delete this user?")) return;
  const token = localStorage.getItem("token");
  try {
    await deleteData(`/users/${id}`, token);
    showToast("User deleted", "success");
    loadUsers();
  } catch (err) {
    console.error("deleteUser error:", err);
    showToast("Error: " + err.message, "error");
  }
}

async function resetPassword(id) {
  const newPassword = prompt("Enter new password for this user:");
  if (!newPassword) return;

  const token = localStorage.getItem("token");
  try {
    const res = await fetch(`${window.API_URL}/users/${id}/reset-password`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ password: newPassword }),
    });
    const data = await res.json();
    if (res.ok) {
      showToast("Password reset successfully!", "success");
    } else {
      showToast("Error: " + (data.error || "Failed to reset password"), "error");
    }
  } catch (err) {
    console.error(err);
    showToast("System Error", "error");
  }
}

// Ensure functions are global
window.deleteUser = deleteUser;
window.deleteReason = deleteReason;
window.resetPassword = resetPassword;
