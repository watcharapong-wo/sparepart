// This file now focuses entirely on Spare Parts Management (index.html)
const _userRole = localStorage.getItem("role");
if (_userRole === "staff") {
  window.location.href = "dashboard.html";
}

let sparePartsCache = [];

async function loadWarehouses() {
  try {
    const token = localStorage.getItem("token");
    const data = await fetchData("/warehouses", token);
    
    // Update Add Part dropdown
    const select = document.getElementById("add-warehouse-select");
    if (select) {
      select.innerHTML = "";
      if (Array.isArray(data)) {
        data.forEach((w) => {
          const opt = document.createElement("option");
          opt.value = w.id;
          opt.textContent = w.name;
          select.appendChild(opt);
        });
      }
    }

    // Update Management Table (if present)
    const mgmtTableBody = document.querySelector("#warehouses-mgmt-table tbody");
    if (mgmtTableBody) {
      mgmtTableBody.innerHTML = "";
      if (Array.isArray(data)) {
        data.forEach((w) => {
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td>${w.id}</td>
            <td>${w.name}</td>
            <td>
              <button onclick="deleteWarehouse(${w.id})" class="btn btn-sm btn-danger" data-i18n="delete">Delete</button>
            </td>
          `;
          mgmtTableBody.appendChild(tr);
        });
      }
      if (typeof checkPermissions === "function") checkPermissions();
      if (typeof applyTranslations === "function") applyTranslations();
    }
  } catch (err) {
    console.error("Load Warehouses Failed:", err);
  }
}

async function addWarehouse(name) {
  const token = localStorage.getItem("token");
  try {
    await postData("/warehouses", { name }, token);
    await loadWarehouses();
  } catch (err) {
    showToast("Failed to add warehouse: " + err.message, "error");
  }
}

async function deleteWarehouse(id) {
  if (!confirm("Are you sure you want to delete this warehouse?")) return;
  const token = localStorage.getItem("token");
  try {
    const response = await fetch(`${API_URL}/warehouses/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) {
      const result = await response.json();
      throw new Error(result.error || "Delete failed");
    }
    await loadWarehouses();
  } catch (err) {
    showToast("Delete failed: " + err.message, "error");
  }
}

async function loadSpareParts() {
  const tbody = document.querySelector("#spareparts-table tbody");
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="9" class="table-loading-state"><div class="spinner"></div>Loading spare parts...</td></tr>`;
  }
  try {
    const token = localStorage.getItem("token");
    const data = await fetchData("/spareparts", token);
    sparePartsCache = data;
    renderSparePartsTable(data);
  } catch (err) {
    console.error("Load Spare Parts Failed:", err);
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="9" class="table-empty-state"><i style="color:var(--danger)">❌</i>Failed to load data</td></tr>`;
    }
  }
}

function renderSparePartsTable(data) {
  const tbody = document.querySelector("#spareparts-table tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!Array.isArray(data) || data.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="table-empty-state">
          <i>📦</i>
          <p>No spare parts found.</p>
        </td>
      </tr>
    `;
    return;
  }

  data.forEach((p, index) => {
      const tr = document.createElement("tr");
      tr.id = `row-${p.id}`;
      tr.innerHTML = `
        <td>${index + 1}</td>
        <td>${p.id}</td>
        <td class="cell-part-no">${p.part_no}</td>
        <td class="cell-name">${p.name}</td>
        <td class="cell-description">${p.description ?? ""}</td>
        <td class="cell-quantity">${p.quantity}</td>
        <td class="cell-price">${p.price ?? ""}</td>
        <td>${p.warehouse_name ?? "-"}</td>
        <td class="actions-cell" data-role-required="admin,co-admin">
          <button onclick="editPart(${p.id})" class="btn btn-sm btn-primary" data-i18n="edit">Edit</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
    // Re-check permissions after rendering dynamic content
    if (typeof checkPermissions === "function") checkPermissions();
    if (typeof applyTranslations === "function") applyTranslations();
}

function editPart(id) {
  console.log("Entering edit mode for ID:", id);
  const row = document.getElementById(`row-${id}`);
  const part = sparePartsCache.find(p => p.id === id);
  if (!row || !part) {
    console.error("Part or Row not found for edit:", id);
    return;
  }

  row.innerHTML = `
    <td>-</td>
    <td>${id}</td>
    <td><input type="text" id="edit-part-no-${id}" value="${part.part_no}" style="width:100px;"></td>
    <td><input type="text" id="edit-name-${id}" value="${part.name}" style="width:120px;"></td>
    <td><input type="text" id="edit-desc-${id}" value="${part.description ?? ""}" style="width:150px;"></td>
    <td><input type="number" id="edit-qty-${id}" value="${part.quantity}" style="width:60px;"></td>
    <td><input type="number" id="edit-price-${id}" value="${part.price ?? 0}" style="width:80px;"></td>
    <td>${part.warehouse_name ?? "-"}</td>
    <td>
      <button onclick="saveInlineEdit(${id})" class="btn btn-sm btn-success" data-i18n="save">Save</button>
      <button onclick="cancelEdit(${id})" class="btn btn-sm btn-secondary" data-i18n="cancel">Cancel</button>
    </td>
  `;
  if (typeof applyTranslations === "function") applyTranslations();
}

function cancelEdit(id) {
  console.log("Cancelling edit for ID:", id);
  loadSpareParts(); 
}

async function saveInlineEdit(id) {
  const token = localStorage.getItem("token");
  const part_no = document.getElementById(`edit-part-no-${id}`).value;
  const name = document.getElementById(`edit-name-${id}`).value;
  const description = document.getElementById(`edit-desc-${id}`).value;
  const quantityInput = document.getElementById(`edit-qty-${id}`).value;
  const priceInput = document.getElementById(`edit-price-${id}`).value;

  const quantity = quantityInput === "" ? 0 : parseInt(quantityInput);
  const price = priceInput === "" ? 0 : parseFloat(priceInput);

  const updateData = { part_no, name, description, quantity, price };
  console.log(`Saving inline edit for ID ${id} with payload:`, updateData);

  try {
    const response = await fetch(`${API_URL}/spareparts/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(updateData)
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Update failed");

    showToast("Updated Successfully!", "success");
    loadSpareParts();
  } catch (err) {
    showToast("Error: " + err.message, "error");
  }
}

document.getElementById("add-part-form")?.addEventListener("submit", async function (e) {
  e.preventDefault();
  try {
    const token = localStorage.getItem("token");
    const part_no = document.getElementById("add-part-no").value;
    const name = document.getElementById("add-name").value;
    const description = document.getElementById("add-description").value;
    const quantity = parseInt(document.getElementById("add-quantity").value);
    const price = parseFloat(document.getElementById("add-price").value) || 0;
    const warehouseId = parseInt(document.getElementById("add-warehouse-select").value);

    await postData("/spareparts", { part_no, name, description, quantity, price, warehouseId }, token);
    showToast("Spare part added successfully!", "success");
    document.getElementById("add-part-form").reset();
    loadSpareParts();
  } catch (err) {
    showToast("Error: " + err.message, "error");
  }
});

document.getElementById("delete-part-form")?.addEventListener("submit", async function (e) {
  e.preventDefault();
  try {
    const token = localStorage.getItem("token");
    const partId = document.getElementById("delete-id").value;
    if (!partId) return;

    if (!confirm("Are you sure you want to delete this part?")) return;

    const response = await fetch(`${API_URL}/spareparts/${partId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "Delete failed");
    }
    showToast("Spare part deleted successfully", "success");
    document.getElementById("delete-part-form").reset();
    loadSpareParts();
  } catch (err) {
    showToast("Error: " + err.message, "error");
  }
});

document.getElementById("manage-warehouses-form")?.addEventListener("submit", function(e) {
  e.preventDefault();
  const name = document.getElementById("new-warehouse-name").value;
  if(name) addWarehouse(name);
});

// Initial Load
(async () => {
  await loadSpareParts();
  await loadWarehouses();
  if (typeof updateUserStatus === "function") updateUserStatus();
  
  const searchInput = document.getElementById("part-search");
  if (searchInput) {
    searchInput.addEventListener("input", function(e) {
      const term = e.target.value.toLowerCase();
      if (!term) {
        renderSparePartsTable(sparePartsCache);
        return;
      }
      const filtered = sparePartsCache.filter(p => 
        (p.part_no && p.part_no.toLowerCase().includes(term)) || 
        (p.name && p.name.toLowerCase().includes(term))
      );
      renderSparePartsTable(filtered);
    });
  }
})();

const exportBtn = document.getElementById("export-parts");
if (exportBtn) {
  exportBtn.addEventListener("click", async () => {
    try {
      const token = localStorage.getItem("token");
      const resp = await fetchData("/spareparts", token);
      if (resp && Array.isArray(resp)) {
        const exportData = resp.map((item) => ({
          "Part No": item.part_no,
          Name: item.name,
          Description: item.description,
          Quantity: item.quantity,
          Price: item.price,
          Warehouse: item.warehouse_name || "-",
        }));
        exportToCSV(exportData, `spare-parts-${new Date().toISOString().split("T")[0]}.csv`);
      }
    } catch (err) {
      alert("Export failed: " + err.message);
    }
  });
}