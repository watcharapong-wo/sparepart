function setSectionVisible(element, visible, displayValue = "block") {
  if (!element) return;
  element.hidden = !visible;
  element.style.display = visible ? displayValue : "none";
}

function i18nText(key, fallback = "") {
  if (typeof translations === "undefined" || typeof currentLang === "undefined") {
    return fallback;
  }
  return translations?.[currentLang]?.[key] || fallback;
}

// แสดงข้อมูลหน่วย/ชิ้น เมื่อ part เป็นประเภท box/pack
function updatePieceStockInfo(part) {
  const infoDiv = document.getElementById("piece-stock-info");
  const qtyLabel = document.getElementById("quantity-label");
  const qtyInput = document.getElementById("quantity");
  const movementType = document.getElementById("movement-type")?.value;

  if (!infoDiv) return;

  if (!part) {
    setSectionVisible(infoDiv, false);
    if (qtyLabel) {
      qtyLabel.textContent = i18nText("qty", "Quantity");
      qtyLabel.setAttribute("data-i18n", "qty");
    }
    if (qtyInput) qtyInput.removeAttribute("max");
    return;
  }

  const isPackUnit = part.unit_type === "box" || part.unit_type === "pack";
  const convRate = Math.max(1, Number(part.conversion_rate) || 1);
  const pieceStock = Number(part.piece_stock) || 0;
  const boxStock = Number(part.quantity) || 0;

  if (isPackUnit && movementType !== "TRANSFER") {
    if (movementType === "IN") {
      setSectionVisible(infoDiv, true, "block");
      infoDiv.textContent = i18nText("packInfoCurrent", "Current").replace("{boxes}", boxStock).replace("{unit}", part.unit_type).replace("{pieces}", pieceStock);
      if (qtyLabel) {
        qtyLabel.textContent = part.unit_type === "box"
          ? i18nText("qtyAddBox", "Boxes to add")
          : i18nText("qtyAddPack", "Packs to add");
      }
      if (qtyInput) { qtyInput.removeAttribute("max"); qtyInput.min = "1"; }
    } else {
      // OUT / BORROW / RETURN — ระบุเป็น "ชิ้น"
      setSectionVisible(infoDiv, true, "block");
      infoDiv.textContent = i18nText("packInfoRemaining", "Remaining").replace("{pieces}", pieceStock).replace("{boxes}", boxStock).replace("{unit}", part.unit_type).replace("{rate}", convRate);
      if (qtyLabel) { qtyLabel.textContent = i18nText("qtyRequestedPiece", "Requested pieces"); }
      if (qtyInput) { qtyInput.max = String(pieceStock); qtyInput.min = "1"; }
    }
  } else {
    setSectionVisible(infoDiv, false);
    if (qtyLabel) {
      qtyLabel.textContent = i18nText("qty", "Quantity");
      qtyLabel.setAttribute("data-i18n", "qty");
    }
    if (qtyInput) qtyInput.removeAttribute("max");
  }
}

function setMovementType(type) {
  const form = document.getElementById("movement-form");
  const el = document.getElementById("movement-type");
  if (form && el) {
    form.reset();
    el.value = type;

    // ซ่อน serial groups ทุกครั้งเมื่อเปลี่ยน type
    const serialGroup = document.getElementById("serial-selection-group");
    const inSerialGroup = document.getElementById("in-serials-group");
    const targetWhGroup = document.getElementById("target-warehouse-group");
    const dueDateGroup = document.getElementById("due-date-group");
    const dueDateInput = document.getElementById("due-date");
    setSectionVisible(serialGroup, false);
    setSectionVisible(inSerialGroup, false);
    setSectionVisible(targetWhGroup, type === "TRANSFER", "flex");
    setSectionVisible(dueDateGroup, type === "BORROW", "flex");
    if (dueDateInput && type !== "BORROW") dueDateInput.value = "";

    // อัปเดต piece-stock info & quantity label ตาม movement type
    const partId = document.getElementById("part-select")?.value;
    if (partId) {
      const currentPart = cachedParts.find(p => String(p.id) === String(partId));
      updatePieceStockInfo(currentPart || null);
      fetchSerials(partId);
    } else {
      updatePieceStockInfo(null);
    }

    if (type === "TRANSFER") loadTargetWarehouses();
  }
}

document.getElementById("movement-type")?.addEventListener("change", async function() {
    const dueDateGroup = document.getElementById("due-date-group");
    const dueDateInput = document.getElementById("due-date");
    const targetWhGroup = document.getElementById("target-warehouse-group");
    
    const isBorrow = this.value === "BORROW";
    const isTransfer = this.value === "TRANSFER";

    if (dueDateGroup) {
      setSectionVisible(dueDateGroup, isBorrow, "flex");
      if (!isBorrow && dueDateInput) dueDateInput.value = "";
    }

    if (targetWhGroup) {
      setSectionVisible(targetWhGroup, isTransfer, "flex");
      if (isTransfer) await loadTargetWarehouses();
    }

    // อัปเดต piece-stock info เมื่อ movement type เปลี่ยน
    const partId = document.getElementById("part-select")?.value;
    if (partId) {
      const currentPart = cachedParts.find(p => String(p.id) === String(partId));
      updatePieceStockInfo(currentPart || null);
    }
});

async function loadTargetWarehouses() {
  const select = document.getElementById("target-warehouse-select");
  if (!select || select.children.length > 0) return; // Only load once

  try {
    const token = localStorage.getItem("token");
    const warehouses = await fetchData("/warehouses", token);
    if (Array.isArray(warehouses)) {
      warehouses.forEach(w => {
        const opt = document.createElement("option");
        opt.value = w.id;
        opt.textContent = w.name;
        select.appendChild(opt);
      });
    }
  } catch (err) {
    console.error("Failed to load target warehouses", err);
  }
}

document.getElementById("part-select")?.addEventListener("change", function() {
    const partId = this.value;
    const sparepartNoInput = document.getElementById("sparepart-no");
    // หา part_no จาก cachedParts
    const part = cachedParts.find(p => String(p.id) === String(partId));
    if (sparepartNoInput && part) sparepartNoInput.value = part.partType || part.part_no || "";
  syncWarehouseByPart(part || null);
    // อัปเดต unit-type, conversion-rate และ piece-stock info จาก part ที่เลือก
    if (part) {
      const unitTypeEl = document.getElementById("unit-type");
      const convRateEl = document.getElementById("conversion-rate");
      if (unitTypeEl) unitTypeEl.value = part.unit_type || "piece";
      if (convRateEl) convRateEl.value = part.conversion_rate || 1;
      updatePieceStockInfo(part);
    } else {
      updatePieceStockInfo(null);
    }
    fetchSerials(partId);
});

async function fetchSerials(partId) {
  const serialGroup = document.getElementById("serial-selection-group");
  const inSerialGroup = document.getElementById("in-serials-group");
  const serialList = document.getElementById("serial-list");
  const serialWarning = document.getElementById("serial-warning");
  const qtyInput = document.getElementById("quantity");
  const type = document.getElementById("movement-type").value;
  const part = cachedParts.find(p => String(p.id) === String(partId));
  const isPackUnit = part && (part.unit_type === "box" || part.unit_type === "pack");
  const usesAutoPackFlow = Boolean(isPackUnit && (type === "OUT" || type === "BORROW" || type === "RETURN"));

  if (!partId) {
    setSectionVisible(serialGroup, false);
    setSectionVisible(inSerialGroup, false);
    return;
  }

  // Handle Stock IN separate logic
  if (type === "IN") {
    setSectionVisible(serialGroup, false);
    if (inSerialGroup) {
      setSectionVisible(inSerialGroup, true, "block");
      qtyInput.readOnly = true;
      updateInSerialsCount();
    }
    return;
  } else {
    setSectionVisible(inSerialGroup, false);
  }

  try {
    const token = localStorage.getItem("token");
    const serials = await fetchData(`/spareparts/${partId}/serials`, token);
    setSectionVisible(serialGroup, true, "block");
    if (serials && serials.length > 0) {
      if (usesAutoPackFlow) {
        serialList.innerHTML = serials.map(s => `
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 13px; background: var(--bg-main); padding: 6px 8px; border-radius: 4px; border: 1px solid var(--border-color);">
            <span>${s.serial_no}</span>
            <strong>${Number(s.remaining_qty) || 0}/${Number(s.initial_qty) || 0}</strong>
          </div>
        `).join("");
        qtyInput.readOnly = false;
        if (!qtyInput.value || Number(qtyInput.value) < 1) qtyInput.value = "";
        serialWarning.textContent = i18nText("packAutoAllocateHint", "System will consume the current SP no until empty, then continue with the next one.");
        setSectionVisible(serialWarning, true, "block");
      } else {
        serialList.innerHTML = serials.map(s => `
          <label style="display: flex; align-items: center; gap: 5px; cursor: pointer; font-size: 13px; background: var(--bg-main); padding: 5px 8px; border-radius: 4px; border: 1px solid var(--border-color);">
            <input type="checkbox" name="serial" value="${s.id}" onchange="updateSelectedSerialsCount()">
            ${s.serial_no}
          </label>
        `).join("");
        qtyInput.readOnly = true;
        qtyInput.value = 0;
        setSectionVisible(serialWarning, false);
      }
    } else {
      serialList.innerHTML = "";
      qtyInput.readOnly = false;
      serialWarning.textContent = i18nText("noAvailableSpNo", "No available SP no for this part.");
      setSectionVisible(serialWarning, true, "block");
    }
    updateSelectedSerialsCount();
  } catch (err) {
    console.error("Failed to fetch serials", err);
  }
}

function updateSelectedSerialsCount() {
  const checkboxes = document.querySelectorAll('input[name="serial"]:checked');
  const countDisplay = document.getElementById("selected-count");
  const qtyInput = document.getElementById("quantity");
  if (countDisplay) countDisplay.textContent = checkboxes.length;
  if (qtyInput && qtyInput.readOnly && document.getElementById("movement-type").value !== "IN") {
    qtyInput.value = checkboxes.length;
  }
}

function updateInSerialsCount() {
  const textarea = document.getElementById("in-serials");
  const qtyInput = document.getElementById("quantity");
  if (textarea && qtyInput && document.getElementById("movement-type").value === "IN") {
    const count = textarea.value.split("\n").filter(s => s.trim()).length;
    qtyInput.value = count;
  }
}

document.getElementById("in-serials")?.addEventListener("input", function() {
  const rawVal = this.value;
  const lines = rawVal.split("\n").filter(line => line.trim() !== "");
  const trimmedLines = lines.map(l => l.trim());
  
  // Internal duplicate check
  const duplicates = trimmedLines.filter((item, index) => trimmedLines.indexOf(item) !== index);
  if (duplicates.length > 0) {
    this.style.borderColor = "#ef4444";
    this.title = "Duplicate SP no detected: " + [...new Set(duplicates)].join(", ");
  } else {
    this.style.borderColor = "#cbd5e1";
    this.title = "";
  }
  updateInSerialsCount();
});

document.getElementById("movement-type")?.addEventListener("change", function() {
  const partId = document.getElementById("part-select")?.value;
  if(partId) fetchSerials(partId);
});

let allMovements = [];
let cachedParts = [];

document.getElementById("movement-search")?.addEventListener("input", function() {
    const searchTerm = this.value.toLowerCase();
    filterMovements(searchTerm);
});

function formatDate(isoString) {
  if (!isoString) return "-";
  const d = new Date(isoString);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

async function loadParts() {
  try {
    const token = localStorage.getItem("token");
    const data = await fetchData("/spareparts", token);
    cachedParts = Array.isArray(data) ? data : [];
    renderPartOptions(cachedParts);
  } catch (err) {
    console.error("Failed to load parts", err);
  }
}

function renderPartOptions(parts) {
  const select = document.getElementById("part-select");
  if (!select) return;
  select.innerHTML = "";
  if (parts.length > 0) {
    parts.forEach(part => {
      const option = document.createElement("option");
      option.value = part.id;
      option.textContent = `${part.name} - ${part.partType || part.part_no}${part.description ? ' - ' + part.description : ''} (In stock: ${part.quantity})`;
      select.appendChild(option);
    });
    // Trigger change to update Spare Part No field
    select.dispatchEvent(new Event("change"));
  } else {
    const sparepartNoInput = document.getElementById("sparepart-no");
    if (sparepartNoInput) sparepartNoInput.value = "";
  }
}

function syncWarehouseByPart(part) {
  const warehouseSelect = document.getElementById("reason-select");
  if (!warehouseSelect) return;
  if (!part || !part.warehouse_name) {
    warehouseSelect.value = "";
    warehouseSelect.disabled = false;
    warehouseSelect.title = "";
    return;
  }

  const normalizedWarehouse = String(part.warehouse_name || "").trim();
  const matchingOption = Array.from(warehouseSelect.options).find(
    (o) => String(o.value || "").trim() === normalizedWarehouse
  );

  // Auto-fill from selected part, but keep it editable so users can switch to LPN2/LPN1 manually.
  warehouseSelect.value = matchingOption ? matchingOption.value : "";
  warehouseSelect.disabled = false;
  warehouseSelect.title = matchingOption ? "Auto-filled from selected part (editable)" : "";
}

function applyFilters() {
  const searchTerm = document.getElementById("part-search-input")?.value.toLowerCase() || "";
  const selectedWarehouse = document.getElementById("reason-select")?.value || "";

  const filtered = cachedParts.filter(p => {
    const matchesSearch = (p.name || "").toLowerCase().includes(searchTerm) || 
                          (p.partType || p.part_no || "").toLowerCase().includes(searchTerm);
    const matchesWarehouse = !selectedWarehouse || (p.warehouse_name === selectedWarehouse);
    return matchesSearch && matchesWarehouse;
  });

  renderPartOptions(filtered);
}

document.getElementById("part-search-input")?.addEventListener("input", applyFilters);

document.getElementById("reason-select")?.addEventListener("change", applyFilters);

async function loadReasons() {
  try {
    const token = localStorage.getItem("token");
    const data = await fetchData("/warehouses", token);
    const select = document.getElementById("reason-select");
    if (!select) return;
    select.innerHTML = "";
    const allOption = document.createElement("option");
    allOption.value = "";
    allOption.textContent = "All Warehouses";
    select.appendChild(allOption);
    if (Array.isArray(data)) {
      data.forEach(w => {
        const option = document.createElement("option");
        option.value = w.name;
        option.textContent = w.name;
        select.appendChild(option);
      });
    }

    const selectedPartId = document.getElementById("part-select")?.value;
    if (selectedPartId) {
      const currentPart = cachedParts.find((p) => String(p.id) === String(selectedPartId));
      syncWarehouseByPart(currentPart || null);
    }
  } catch (err) {
    console.error("Failed to load warehouses for movement", err);
  }
}

async function loadMovements() {
  try {
    const token = localStorage.getItem("token");
    const tbody = document.getElementById("movements-table")?.getElementsByTagName("tbody")[0];
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="12" class="table-loading-state"><div class="spinner"></div>Loading history...</td></tr>`;

    allMovements = await fetchData("/report/movements3", token);
    displayMovements(allMovements);
  } catch (err) {
    console.error("Failed to load movements", err);
  }
}

function displayMovements(data) {
    const tbody = document.getElementById("movements-table")?.getElementsByTagName("tbody")[0];
    if (!tbody) return;
    tbody.innerHTML = "";

    if (Array.isArray(data) && data.length > 0) {
      data.forEach(m => {
        const row = tbody.insertRow();
        row.insertCell(0).textContent = formatDate(m.movement_date);
        const typeCell = row.insertCell(1);
        const typeClass = m.movement_type === 'OUT' ? 'text-danger' : 
                          m.movement_type === 'IN' ? 'text-success' : 
                          m.movement_type === 'BORROW' ? 'text-warning' :
                          m.movement_type === 'RETURN' ? 'text-info' : 'text-primary';
        typeCell.innerHTML = `<span class="${typeClass}">${m.movement_type}</span>`;
        row.insertCell(2).textContent = m.part_name || "-";
        row.insertCell(3).textContent = m.partType || m.part_no || "-";
        row.insertCell(4).textContent = m.quantity;
        
        // Value Cell
        const totalVal = (m.quantity || 0) * (m.price || 0);
        row.insertCell(5).textContent = totalVal.toLocaleString();

        row.insertCell(6).textContent = m.department || "-";
        row.insertCell(7).textContent = formatDate(m.due_date);
        row.insertCell(8).textContent = m.receiver || "-";
        row.insertCell(9).textContent = m.receipt_number || "-";
        row.insertCell(10).textContent = m.serial_usage || "-";
        row.insertCell(11).textContent = m.note || "-";
      });
    } else {
        tbody.innerHTML = `<tr><td colspan="12" class="table-empty-state"><i style="font-size: 24px;">🔎</i><p>No results found.</p></td></tr>`;
    }
}

function filterMovements(term) {
    const filtered = allMovements.filter(m => {
        const name = (m.part_name || "").toLowerCase();
        const no = (m.partType || m.part_no || "").toLowerCase();
        return name.includes(term) || no.includes(term);
    });
    displayMovements(filtered);
}

document.getElementById("movement-form").addEventListener("submit", async function (e) {
  e.preventDefault();
  console.log("Submit button clicked - Handler started");

  try {
    const token = localStorage.getItem("token");
    if (!token) {
      showToast("Session expired. Please login again.", "error");
      window.location.href = "login.html";
      return;
    }

    const part_id = parseInt(document.getElementById("part-select").value);
    const movement_type = document.getElementById("movement-type").value;
    const quantity = parseInt(document.getElementById("quantity").value);
    const department = document.getElementById("reason-select").value;
    const receiver = document.getElementById("receiver").value;
    const receipt_number = document.getElementById("receipt-number").value;
    const due_date = document.getElementById("due-date").value;
    const note = document.getElementById("note").value;

    console.log("Form values collected:", { part_id, movement_type, quantity, department });

    if (!part_id || isNaN(part_id)) {
      showToast("Please select a valid part.", "warning");
      return;
    }

    if (!quantity || isNaN(quantity) || quantity <= 0) {
      showToast("Please enter a valid quantity.", "warning");
      return;
    }

    // Bypass confirm() as it seems to be suppressed in user environment
    console.log("Proceeding with submission (skipping confirm)...");

    const selectedSerials = Array.from(document.querySelectorAll('input[name="serial"]:checked')).map(cb => parseInt(cb.value));
    const newSerialsRaw = document.getElementById("in-serials")?.value || "";
    const newSerials = movement_type === "IN" ? newSerialsRaw.split("\n").filter(s => s.trim()).map(s => s.trim()) : [];

    // Strict duplicate check before submission for IN
    if (movement_type === "IN" && newSerials.length > 0) {
      const duplicates = newSerials.filter((item, index) => newSerials.indexOf(item) !== index);
      if (duplicates.length > 0) {
        showToast("Duplicate SP no detected: " + [...new Set(duplicates)].join(", "), "error");
        const inSerialsEl = document.getElementById("in-serials");
        if (inSerialsEl) {
          inSerialsEl.style.borderColor = "#ef4444";
          inSerialsEl.focus();
        }
        return;
      }
    }

    console.log("Calling postData...");
    let endpoint = "/stock-movements";
    let payload = {
        part_id, 
        movement_type, 
        quantity, 
        department, 
        receiver, 
        receipt_number, 
        note, 
        due_date: movement_type === "BORROW" ? due_date : "",
        serial_ids: selectedSerials,
        new_serials: newSerials
    };

    if (movement_type === "TRANSFER") {
      endpoint = "/spareparts/transfer";
      payload = {
        part_id,
        target_warehouse_id: parseInt(document.getElementById("target-warehouse-select").value),
        quantity,
        note: note || `Transfer by ${localStorage.getItem("username") || "user"}`
      };
    }

    await postData(endpoint, payload, token);

    showToast(movement_type === "TRANSFER" ? "Transfer successful!" : "Stock movement recorded successfully!", "success");
    document.getElementById("movement-form").reset();
    setSectionVisible(document.getElementById("serial-selection-group"), false);
    setSectionVisible(document.getElementById("in-serials-group"), false);
    setSectionVisible(document.getElementById("target-warehouse-group"), false);
    await loadParts();
    await loadMovements();
  } catch (err) {
    console.error("Submission failed ERROR:", err);
    if (err.status === 409) {
      showToast("Duplicate serial number detected", "error");
    } else {
      showToast("An error occurred: " + err.message, "error");
    }
  }
});

// Initial Load
async function initMovementsPage() {
  await loadParts();
  await loadReasons();
  applyFilters();
  await loadMovements();

  const currentType = document.getElementById("movement-type")?.value || "OUT";
  const dueDateGroup = document.getElementById("due-date-group");
  const targetWhGroup = document.getElementById("target-warehouse-group");
  setSectionVisible(dueDateGroup, currentType === "BORROW", "flex");
  setSectionVisible(targetWhGroup, currentType === "TRANSFER", "flex");

  if (typeof updateUserStatus === "function") updateUserStatus();
}

initMovementsPage();

// Refresh เมื่อกลับมาที่หน้านี้ (bfcache)
window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    initMovementsPage();
  }
});

const exportBtn = document.getElementById("export-movements");
if (exportBtn) {
  exportBtn.addEventListener("click", async () => {
    try {
      const token = localStorage.getItem("token");
      const url = `/export/movements?warehouseId=all`;

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error("Export failed");

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `movements-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      showToast("Export failed: " + err.message, "error");
    }
  });
}
