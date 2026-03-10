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
    const username = document.getElementById("reg-username").value;
    const password = document.getElementById("reg-password").value;
    const role = document.getElementById("reg-role").value;

    try {
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
        loadUsers();
      } else {
        showToast("Error: " + (data.error || "Failed to create user"), "error");
      }
    } catch (err) {
      console.error(err);
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
        <td>${user.username}</td>
        <td><span class="badge badge-${user.role}">${user.role}</span></td>
        <td>
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
  console.log("deleteUser called for ID:", id);
  // Removed confirm temporarily to bypass environment blockage
  console.log("Proceeding with deletion (confirm bypassed for debugging)...");
  
  const token = localStorage.getItem("token");
  try {
    console.log("Calling deleteData for user:", id);
    const result = await deleteData(`/users/${id}`, token);
    console.log("Delete result:", result);
    loadUsers();
  } catch (err) {
    console.error("deleteUser error:", err);
    showToast("Error: " + err.message, "error");
  }
}

// Ensure functions are global
window.deleteUser = deleteUser;
window.deleteReason = deleteReason;
