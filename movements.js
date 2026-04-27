// Role-based redirect for Movements
const _currentRole = String(localStorage.getItem("role") || "").toLowerCase().trim().replace(/[_\s]+/g, "-");
if (_currentRole === "viewer") {
  window.location.href = "dashboard.html";
}

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

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeRegExp(value) {
  return String(value ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightMatches(value, searchTerm) {
  const rawValue = String(value ?? "");
  const tokens = String(searchTerm || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5);

  if (tokens.length === 0) return escapeHtml(rawValue);

  const regex = new RegExp(`(${tokens.map(escapeRegExp).join("|")})`, "ig");
  const tokenSet = new Set(tokens.map((token) => token.toLowerCase()));

  return rawValue
    .split(regex)
    .map((segment) => {
      if (tokenSet.has(segment.toLowerCase())) {
        return `<mark class="part-search-highlight">${escapeHtml(segment)}</mark>`;
      }
      return escapeHtml(segment);
    })
    .join("");
}

function tokenizeSearchTerm(searchTerm) {
  return String(searchTerm || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5);
}

function formatSelectedPartSearchValue(part) {
  if (!part) return "";
  const name = String(part.name || "").trim();
  const warehouse = String(part.warehouse_name || "-").trim();
  const partRef = String(part.partType || part.part_no || "-").trim();
  return `${name} | ${warehouse} | ${partRef}`;
}

function getStockState(quantity) {
  const numericQuantity = Number(quantity) || 0;
  if (numericQuantity <= 0) return "danger";
  if (numericQuantity <= 3) return "warning";
  return "healthy";
}

function normalizeUnitType(unitType) {
  const normalized = String(unitType || "PC").trim().toUpperCase();
  if (normalized === "PIECE") return "PC";
  if (normalized === "PACK") return "PAC";
  if (normalized === "ROLL") return "ROL";
  return ["M", "PC", "PAC", "BOX", "ROL"].includes(normalized) ? normalized : "PC";
}

function normalizeRole(role) {
  const value = String(role || "").trim().toLowerCase().replace(/[_\s]+/g, "-");
  if (value === "coadmin") return "co-admin";
  return value;
}

function canCorrectMovements() {
  const role = normalizeRole(localStorage.getItem("role") || "");
  return role === "admin" || role === "co-admin";
}

function isPackUnitType(unitType) {
  return ["BOX", "PAC"].includes(normalizeUnitType(unitType));
}

let existingSerialLookup = new Set();
let existingSerialRows = [];

function setExistingSerialLookup(serialRows) {
  existingSerialRows = Array.isArray(serialRows) ? serialRows : [];
  existingSerialLookup = new Set(
    existingSerialRows
      .map((row) => String(row?.serial_no || "").trim().toLowerCase())
      .filter(Boolean)
  );
}

let itemCart = [];

function renderCartTable() {
    const container = document.getElementById("movement-cart-container");
    const tbody = document.getElementById("cart-items");
    const submitAllBtn = document.getElementById("submit-all-btn");
    
    if (!container || !tbody || !submitAllBtn) return;

    if (itemCart.length === 0) {
        container.hidden = true;
        tbody.innerHTML = "";
        submitAllBtn.disabled = true;
        return;
    }

    container.hidden = false;
    submitAllBtn.disabled = false;
    tbody.innerHTML = itemCart.map((item, index) => `
        <tr class="cart-row">
            <td>
                <div class="cart-part-name">${escapeHtml(item.partName)}</div>
                <div class="cart-part-type text-muted" style="font-size: 0.85em;">${escapeHtml(item.partType)}</div>
            </td>
            <td><span class="badge badge-secondary">${item.quantity}</span></td>
            <td>
                <div class="cart-serials" style="max-width: 200px; max-height: 50px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.8em;" title="${escapeHtml((item.serialNos || []).join(', '))}">
                    ${(item.serialNos || []).length > 0 ? (item.serialNos || []).join(', ') : '-'}
                </div>
            </td>
            <td>
                <button type="button" class="btn-delete" onclick="removeItemFromCart(${index})" title="Remove Item">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </td>
        </tr>
    `).join("");
}

window.removeItemFromCart = function(index) {
    itemCart.splice(index, 1);
    renderCartTable();
};

document.getElementById("add-to-cart-btn")?.addEventListener("click", function() {
    if (!currentSelectedPart) {
        showToast(i18nText("selectPart", "Please select a part first"), "warning");
        return;
    }

    const qtyInput = document.getElementById("quantity");
    const qty = parseInt(qtyInput.value);
    if (!qty || qty <= 0) {
        showToast("Minimum quantity is 1", "warning");
        return;
    }

    const movementType = document.getElementById("movement-type").value;
    const selectedSerials = Array.from(document.querySelectorAll('input[name="serial"]:checked')).map(cb => ({
        id: parseInt(cb.value),
        no: cb.parentElement.querySelector('span')?.textContent || cb.value
    }));
    
    const newSerialsRaw = document.getElementById("in-serials")?.value || "";
    const newSerials = movementType === "IN" ? newSerialsRaw.split("\n").map(s => s.trim()).filter(Boolean) : [];

    const isShowingInSerials = !document.getElementById("in-serials-group")?.hidden;
    const isShowingStockSerials = !document.getElementById("serial-selection-group")?.hidden;
    const isPack = isPackUnitType(currentSelectedPart.unit_type);

    // Validation for tracked serials (logic based on UI visibility)
    if (isShowingInSerials) {
        if (newSerials.length !== qty) {
            showToast(`Registered SP No count (${newSerials.length}) must match quantity (${qty}).`, "error");
            return;
        }
    } else if (isShowingStockSerials && !isPack && movementType !== "TRANSFER") {
        if (selectedSerials.length !== qty) {
            showToast(`Selected SP No count (${selectedSerials.length}) must match quantity (${qty}).`, "error");
            return;
        }
    }

    itemCart.push({
        partId: currentSelectedPart.id,
        partName: currentSelectedPart.name,
        partType: currentSelectedPart.partType || currentSelectedPart.part_no,
        type: movementType,
        quantity: qty,
        serialIds: selectedSerials.map(s => s.id),
        newSerials: newSerials,
        serialNos: movementType === "IN" ? newSerials : selectedSerials.map(s => s.no),
        price: document.getElementById("price-unit")?.value || null,
        due_date: document.getElementById("due-date")?.value || null,
        department: document.getElementById("reason-select")?.value || 'INTERNAL',
        target_warehouse: document.getElementById("target-warehouse-select")?.value || null
    });

    const searchInput = document.getElementById("part-search-input");
    // Reset everything for next item, but keep search text for visual confirmation
    resetPartSelectionState({ preserveSearchText: true });
    
    // Highlight the search input so they see what they added
    if (searchInput) {
        searchInput.style.backgroundColor = "#f0fdf4"; // Subtle green
        setTimeout(() => { searchInput.style.backgroundColor = ""; }, 1500);
    }
    
    renderCartTable();
    showToast(i18nText("itemAddedToList", "Added item to list"), "success");
});

function findExistingSerialConflicts(serialLines) {
  return (Array.isArray(serialLines) ? serialLines : [])
    .map((line) => String(line || "").trim())
    .filter(Boolean)
    .filter((line) => existingSerialLookup.has(line.toLowerCase()));
}

function renderSelectedPartSummary(part) {
  const summary = document.getElementById("part-selection-summary");
  if (!summary) return;

  if (!part) {
    summary.hidden = true;
    summary.innerHTML = "";
    return;
  }

  const partCode = escapeHtml(part.partType || part.part_no || "-");
  const description = escapeHtml(part.description || "-");
  const warehouseName = escapeHtml(part.warehouse_name || "-");
  const unitType = escapeHtml(normalizeUnitType(part.unit_type));
  const quantity = escapeHtml(part.quantity ?? 0);
  const pieceStock = escapeHtml(part.piece_stock ?? part.quantity ?? 0);

  const t = translations[currentLang] || translations.en;
  summary.innerHTML = `
    <div class="part-summary-header">
      <strong>${escapeHtml(part.name || "-")}</strong>
      <span class="part-summary-badge">${partCode}</span>
    </div>
    <div class="part-summary-grid">
      <div><span class="part-summary-label">${t.labelDescription || "Description"}</span><span>${description}</span></div>
      <div><span class="part-summary-label">${t.labelWarehouse || "Warehouse"}</span><span>${warehouseName}</span></div>
      <div><span class="part-summary-label">${t.labelUnitType || "Unit Type"}</span><span>${unitType}</span></div>
      <div><span class="part-summary-label">${t.labelStock || "Stock"}</span><span>${quantity}</span></div>
      <div><span class="part-summary-label">${t.labelPieceStock || "Remaining number of units"}</span><span>${pieceStock}</span></div>
      <div><span class="part-summary-label">${t.labelUnitPrice || "Unit Price"}</span><span class="text-primary font-bold">${Number(part.price || 0).toLocaleString()}</span></div>
      <div><span class="part-summary-label">${t.labelPartRef || "Part Ref"}</span><span>${partCode}</span></div>
    </div>
  `;
  summary.hidden = false;
}

function renderPartSelectionWarning(message) {
  const warning = document.getElementById("part-selection-warning");
  if (!warning) return;

  if (!message) {
    warning.hidden = true;
    warning.innerHTML = "";
    return;
  }

  warning.innerHTML = `<strong>Check before selecting:</strong> ${escapeHtml(message)}`;
  warning.hidden = false;
}

// แสดงข้อมูลหน่วย/ชิ้น เมื่อ part เป็นประเภท BOX/PAC
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

  const unitType = normalizeUnitType(part.unit_type);
  const isPackUnit = isPackUnitType(unitType);
  const convRate = Math.max(1, Number(part.conversion_rate) || 1);
  const pieceStock = Number(part.piece_stock) || 0;
  const boxStock = Number(part.quantity) || 0;

  if (isPackUnit && movementType !== "TRANSFER") {
    if (movementType === "IN") {
      setSectionVisible(infoDiv, true, "block");
      infoDiv.textContent = i18nText("packInfoCurrent", "Current").replace("{boxes}", boxStock).replace("{unit}", unitType).replace("{pieces}", pieceStock);
      if (qtyLabel) {
        qtyLabel.textContent = unitType === "BOX"
          ? i18nText("qtyAddBox", "Boxes to add")
          : i18nText("qtyAddPack", "Packs to add");
      }
      if (qtyInput) { qtyInput.removeAttribute("max"); qtyInput.min = "1"; }
    } else {
      // OUT / BORROW / RETURN — ระบุเป็น "ชิ้น"
      setSectionVisible(infoDiv, true, "block");
      infoDiv.textContent = i18nText("packInfoRemaining", "Remaining").replace("{pieces}", pieceStock).replace("{boxes}", boxStock).replace("{unit}", unitType).replace("{rate}", convRate);
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
    resetPartSelectionState();

    // ซ่อน serial groups ทุกครั้งเมื่อเปลี่ยน type
    const serialGroup = document.getElementById("serial-selection-group");
    const inSerialGroup = document.getElementById("in-serials-group");
    const targetWhGroup = document.getElementById("target-warehouse-group");
    const dueDateGroup = document.getElementById("due-date-group");
    const dueDateInput = document.getElementById("due-date");
    const priceGroup = document.getElementById("price-unit-group");
    const priceInput = document.getElementById("price-unit");

    setSectionVisible(serialGroup, false);
    setSectionVisible(inSerialGroup, false);
    setSectionVisible(targetWhGroup, type === "TRANSFER", "flex");
    setSectionVisible(dueDateGroup, type === "BORROW", "flex");
    setSectionVisible(priceGroup, type === "IN", "flex");
    if (dueDateInput && type !== "BORROW") dueDateInput.value = "";
    if (priceInput && type !== "IN") priceInput.value = "";

    // รีเซ็ตให้เลือก part ใหม่ทุกครั้ง
    const statusEl = document.getElementById("serial-lookup-status");
    if (statusEl) {
      statusEl.textContent = "";
      statusEl.hidden = true;
    }
    const lookupInput = document.getElementById("serial-lookup-input");
    if (lookupInput) lookupInput.value = "";
    
    updatePieceStockInfo(null);

    if (type === "TRANSFER") loadTargetWarehouses();
  }
}

document.getElementById("movement-type")?.addEventListener("change", async function() {
  resetPartSelectionState();

    const dueDateGroup = document.getElementById("due-date-group");
    const dueDateInput = document.getElementById("due-date");
    const targetWhGroup = document.getElementById("target-warehouse-group");
    const serialGroup = document.getElementById("serial-selection-group");
    const inSerialGroup = document.getElementById("in-serials-group");
    const priceGroup = document.getElementById("price-unit-group");
    
    const isBorrow = this.value === "BORROW";
    const isTransfer = this.value === "TRANSFER";
    const isIncome = this.value === "IN";

  setSectionVisible(serialGroup, false);
  setSectionVisible(inSerialGroup, false);

    if (dueDateGroup) {
      setSectionVisible(dueDateGroup, isBorrow, "flex");
      if (!isBorrow && dueDateInput) dueDateInput.value = "";
    }

    if (targetWhGroup) {
      setSectionVisible(targetWhGroup, isTransfer, "flex");
      if (isTransfer) await loadTargetWarehouses();
    }

    if (priceGroup) {
      setSectionVisible(priceGroup, isIncome, "flex");
    }

    updatePieceStockInfo(null);
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

document.getElementById("part-select")?.addEventListener("change", function(event) {
    const isAutocompleteSelection = this.dataset.selectionSource === "autocomplete";
    const isManualSelection = Boolean(event?.isTrusted) || isAutocompleteSelection;
    this.dataset.selectionSource = "";
    this.dataset.manualSelection = isManualSelection ? "true" : "false";
    if (isManualSelection) {
      closePartAutocomplete();
    }
    const partId = this.value;
    const sparepartNoInput = document.getElementById("sparepart-no");
    // หา part_no จาก cachedParts
    const part = cachedParts.find(p => String(p.id) === String(partId));
    if (sparepartNoInput) sparepartNoInput.value = part ? (part.partType || part.part_no || "") : "";
    const warehouseSelect = document.getElementById("reason-select");
    if (warehouseSelect && isManualSelection) {
      warehouseSelect.dataset.manualSelection = "false";
    }
  syncWarehouseByPart(part || null);
    // อัปเดต unit-type, conversion-rate และ piece-stock info จาก part ที่เลือก
    if (part) {
      currentSelectedPart = part;
      const unitTypeEl = document.getElementById("unit-type");
      const convRateEl = document.getElementById("conversion-rate");
      if (unitTypeEl) unitTypeEl.value = normalizeUnitType(part.unit_type);
      if (convRateEl) convRateEl.value = part.conversion_rate || 1;
      updatePieceStockInfo(part);
      renderSelectedPartSummary(part);
    } else {
      currentSelectedPart = null;
      updatePieceStockInfo(null);
      renderSelectedPartSummary(null);
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
  const isPackUnit = part && isPackUnitType(part.unit_type);

  if (!partId) {
    setExistingSerialLookup([]);
    setSectionVisible(serialGroup, false);
    setSectionVisible(inSerialGroup, false);
    return;
  }

  // Handle Stock IN separate logic
  if (type === "IN") {
    try {
      const token = localStorage.getItem("token");
      const serials = await fetchData(`/spareparts/${partId}/serials`, token);
      const serialRows = Array.isArray(serials) ? serials : [];
      setExistingSerialLookup(serialRows);

      setSectionVisible(serialGroup, false);
      if (inSerialGroup) {
        setSectionVisible(inSerialGroup, true, "block");
        qtyInput.readOnly = true;
        const priceInput = document.getElementById("price-unit");
        if (priceInput && part) {
          priceInput.value = part.price ?? 0;
        }
        updateInSerialsCount();
      }
      return;
    } catch (err) {
      console.error("Failed to fetch serials for IN", err);
      setExistingSerialLookup([]);
      setSectionVisible(serialGroup, false);
      if (inSerialGroup) {
        setSectionVisible(inSerialGroup, true, "block");
        qtyInput.readOnly = true;
        updateInSerialsCount();
      }
      return;
    }
  } else {
    setSectionVisible(inSerialGroup, false);
  }

  try {
    const token = localStorage.getItem("token");
    const serials = await fetchData(`/spareparts/${partId}/serials`, token);
    setExistingSerialLookup(Array.isArray(serials) ? serials : []);

    if (serialGroup) {
      const serialLabel = serialGroup.querySelector(".section-label");
      if (serialLabel) {
        serialLabel.innerHTML = `Select Individual SP No: (<span id="selected-count">0</span> selected)`;
      }
    }

    setSectionVisible(serialGroup, true, "block");



    if (serials && serials.length > 0) {
      serialList.innerHTML = serials.map(s => {
        const initialQty = Number(s.initial_qty) || 1;
        const remainingQty = Number(s.remaining_qty) || 0;
        const qtyBadge = isPackUnit
          ? `<span style="font-weight: 700; color: var(--primary);">${remainingQty}/${initialQty}</span>`
          : "";

        return `
          <label style="display: inline-flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px; white-space: nowrap; background: var(--bg-main); padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border-color);">
            <input type="checkbox" name="serial" value="${s.id}" onchange="updateSelectedSerialsCount()">
            <span>${s.serial_no}</span>
            ${s.price ? `<small class="text-muted">(@${s.price})</small>` : ""}
            ${qtyBadge}
          </label>
        `;
      }).join("");

      if (isPackUnit) {
        qtyInput.readOnly = false;
        if (!qtyInput.value || Number(qtyInput.value) < 1) qtyInput.value = "";
        serialWarning.textContent = "Please select SP no to use, then enter quantity in pieces.";
        setSectionVisible(serialWarning, true, "block");
      } else {
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
  const helper = document.getElementById("in-serials-helper");
  if (textarea && qtyInput && document.getElementById("movement-type").value === "IN") {
    const lines = textarea.value.split("\n").map(s => s.trim()).filter(Boolean);
    const count = lines.length;
    const duplicates = lines.filter((item, index) => lines.indexOf(item) !== index);
    const existingConflicts = findExistingSerialConflicts(lines);
    qtyInput.value = count;

    if (helper) {
      if (duplicates.length > 0) {
        helper.textContent = `SP no duplicated: ${[...new Set(duplicates)].join(", ")}`;
        helper.style.color = "#ef4444";
      } else if (existingConflicts.length > 0) {
        helper.textContent = `SP no already exists: ${[...new Set(existingConflicts)].join(", ")}`;
        helper.style.color = "#ef4444";
      } else if (count > 0) {
        helper.textContent = `SP no entered: ${count} item(s). Ready to submit.`;
        helper.style.color = "#16a34a";
      } else {
        helper.textContent = "Enter one SP no per line.";
        helper.style.color = "#64748b";
      }
    }
  }
}

document.getElementById("in-serials")?.addEventListener("input", function() {
  const rawVal = this.value;
  const lines = rawVal.split("\n").filter(line => line.trim() !== "");
  const trimmedLines = lines.map(l => l.trim());
  
  // Internal duplicate check
  const duplicates = trimmedLines.filter((item, index) => trimmedLines.indexOf(item) !== index);
  const existingConflicts = findExistingSerialConflicts(trimmedLines);
  if (duplicates.length > 0) {
    this.style.borderColor = "#ef4444";
    this.title = "Duplicate SP no detected: " + [...new Set(duplicates)].join(", ");
  } else if (existingConflicts.length > 0) {
    this.style.borderColor = "#ef4444";
    this.title = "SP no already exists: " + [...new Set(existingConflicts)].join(", ");
  } else {
    this.style.borderColor = "#cbd5e1";
    this.title = "";
  }
  updateInSerialsCount();
});

document.getElementById("movement-type")?.addEventListener("change", function() {
  const partId = document.getElementById("part-select")?.value;
  const helper = document.getElementById("in-serials-helper");
  if (helper && this.value !== "IN") {
    helper.textContent = "Enter one SP no per line.";
    helper.style.color = "#64748b";
  }
  if(partId) fetchSerials(partId);
});

let allMovements = [];
let cachedParts = [];
let currentSelectedPart = null;
const MAX_VISIBLE_PART_RESULTS = 6;
let filteredPartResults = [];
let activeAutocompleteIndex = -1;

document.getElementById("movement-search")?.addEventListener("input", function() {
    const searchTerm = this.value.toLowerCase();
    filterMovements(searchTerm);
});

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
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

async function loadParts() {
  try {
    const token = localStorage.getItem("token");
    const data = await fetchData("/spareparts", token);
    cachedParts = Array.isArray(data) ? data : [];
    applyFilters();
  } catch (err) {
    console.error("Failed to load parts", err);
  }
}

function getPartSearchScore(part, normalizedSearchTerm) {
  const tokens = tokenizeSearchTerm(normalizedSearchTerm);
  const name = String(part?.name || "").toLowerCase();
  const partNo = String(part?.partType || part?.part_no || "").toLowerCase();
  const warehouse = String(part?.warehouse_name || "").toLowerCase();
  const description = String(part?.description || "").toLowerCase();

  if (tokens.length === 0) return 100;

  let score = 0;
  let matchedNameOrPart = false;
  let matchedWarehouse = false;

  tokens.forEach((token) => {
    if (partNo.startsWith(token)) {
      score += 0;
      matchedNameOrPart = true;
      return;
    }
    if (name.startsWith(token)) {
      score += 1;
      matchedNameOrPart = true;
      return;
    }
    if (warehouse.startsWith(token)) {
      score += 2;
      matchedWarehouse = true;
      return;
    }
    if (partNo.includes(token)) {
      score += 3;
      matchedNameOrPart = true;
      return;
    }
    if (name.includes(token)) {
      score += 4;
      matchedNameOrPart = true;
      return;
    }
    if (warehouse.includes(token)) {
      score += 5;
      matchedWarehouse = true;
      return;
    }
    if (description.includes(token)) {
      score += 6;
      return;
    }
    score += 20;
  });

  if (matchedNameOrPart && matchedWarehouse) score -= 3;
  if (name === normalizedSearchTerm || partNo === normalizedSearchTerm) score -= 2;

  return score;
}

function getFilteredParts(searchTerm, selectedWarehouse) {
  const normalizedSearchTerm = String(searchTerm || "").trim().toLowerCase();
  const tokens = tokenizeSearchTerm(normalizedSearchTerm);

  return cachedParts
    .filter((part) => {
      const matchesWarehouse = !selectedWarehouse || part.warehouse_name === selectedWarehouse;
      if (!matchesWarehouse) return false;
      if (!normalizedSearchTerm) return true;

      const name = String(part.name || "").toLowerCase();
      const partNo = String(part.partType || part.part_no || "").toLowerCase();
      const warehouse = String(part.warehouse_name || "").toLowerCase();
      const description = String(part.description || "").toLowerCase();
      
      const cleanTerm = normalizedSearchTerm.replace(/\s+/g, "");
      const cleanName = name.replace(/\s+/g, "");
      const cleanPartNo = partNo.replace(/\s+/g, "");
      const cleanDesc = description.replace(/\s+/g, "");

      // Flexible space-ignoring match
      if (cleanTerm && (cleanName.includes(cleanTerm) || cleanPartNo.includes(cleanTerm) || cleanDesc.includes(cleanTerm))) return true;

      return tokens.every((token) =>
        name.includes(token) ||
        partNo.includes(token) ||
        warehouse.includes(token) ||
        description.includes(token)
      );
    })
    .sort((left, right) => {
      const byScore = getPartSearchScore(left, normalizedSearchTerm) - getPartSearchScore(right, normalizedSearchTerm);
      if (byScore !== 0) return byScore;

      const leftPartNo = String(left.partType || left.part_no || "");
      const rightPartNo = String(right.partType || right.part_no || "");
      return leftPartNo.localeCompare(rightPartNo) || String(left.name || "").localeCompare(String(right.name || ""));
    });
}

function getSimilarPartWarning(parts, searchTerm) {
  if (!String(searchTerm || "").trim() || parts.length < 2) return "";

  const groups = new Map();
  parts.forEach((part) => {
    const key = String(part.name || "").trim().toLowerCase();
    if (!key) return;
    const current = groups.get(key) || [];
    current.push(part);
    groups.set(key, current);
  });

  const duplicateGroup = [...groups.values()].find((group) => {
    if (group.length < 2) return false;
    const warehouses = new Set(group.map((part) => String(part.warehouse_name || "-").trim()));
    return warehouses.size > 1;
  });

  if (!duplicateGroup) return "";

  const partName = duplicateGroup[0]?.name || "Selected part";
  const warehouseList = [...new Set(duplicateGroup.map((part) => String(part.warehouse_name || "-").trim()))]
    .filter(Boolean)
    .join(", ");

  return `${partName} appears in multiple warehouses (${warehouseList}). Check Part Ref and Warehouse before selecting.`;
}

function formatPartOptionLabel(part) {
  const priceStr = Number(part.price || 0).toLocaleString();
  return `${part.name} - ${part.partType || part.part_no}${part.description ? ' - ' + part.description : ''} (In stock: ${part.quantity}, Price: ${priceStr})`;
}

function setAutocompleteActiveIndex(nextIndex) {
  const resultButtons = Array.from(document.querySelectorAll("#part-autocomplete-results .part-result-option"));
  if (resultButtons.length === 0) {
    activeAutocompleteIndex = -1;
    return;
  }

  const normalizedIndex = Math.max(0, Math.min(nextIndex, resultButtons.length - 1));
  activeAutocompleteIndex = normalizedIndex;
  resultButtons.forEach((button, index) => {
    button.classList.toggle("is-active", index === normalizedIndex);
  });
}

function closePartAutocomplete() {
  const resultsContainer = document.getElementById("part-autocomplete-results");
  if (!resultsContainer) return;
  resultsContainer.hidden = true;
  activeAutocompleteIndex = -1;
}

function resetPartSelectionState(options = {}) {
  const { preserveSearchText = false } = options;
  const partSearchInput = document.getElementById("part-search-input");
  const partSelect = document.getElementById("part-select");
  const sparepartNoInput = document.getElementById("sparepart-no");
  const reasonSelect = document.getElementById("reason-select");
  const serialLookupInput = document.getElementById("serial-lookup-input");
  const serialLookupStatus = document.getElementById("serial-lookup-status");
  const serialSelectionGroup = document.getElementById("serial-selection-group");
  const inSerialsGroup = document.getElementById("in-serials-group");
  const serialList = document.getElementById("serial-list");

  if (partSearchInput && !preserveSearchText) partSearchInput.value = "";
  if (serialLookupInput) serialLookupInput.value = "";
  if (serialLookupStatus) {
    serialLookupStatus.hidden = true;
    serialLookupStatus.innerHTML = "";
  }
  
  if (partSelect) {
    partSelect.value = "";
    partSelect.dataset.selectionSource = "";
    partSelect.dataset.manualSelection = "false";
  }
  
  // Hide serial UI groups
  if (serialSelectionGroup) serialSelectionGroup.hidden = true;
  if (inSerialsGroup) inSerialsGroup.hidden = true;
  if (serialList) serialList.innerHTML = "";
  
  currentSelectedPart = null;
  if (sparepartNoInput) sparepartNoInput.value = "";
  if (reasonSelect) reasonSelect.dataset.manualSelection = "false";
  
  const priceInput = document.getElementById("price-unit");
  if (priceInput) priceInput.value = "";
  
  const priceGroup = document.getElementById("price-unit-group");
  if (priceGroup) priceGroup.hidden = true;

  renderSelectedPartSummary(null);
  renderPartSelectionWarning("");
  setExistingSerialLookup([]);
  closePartAutocomplete();
  
  // Reset quantity
  const qtyInput = document.getElementById("quantity");
  if (qtyInput) {
    qtyInput.value = "";
    qtyInput.readOnly = false;
  }
}

function selectPart(part, options = {}) {
  const { updateSearchInput = true, preserveDropdown = false } = options;
  const select = document.getElementById("part-select");
  const searchInput = document.getElementById("part-search-input");
  if (!select) return;

  if (!part) {
    select.value = "";
    if (updateSearchInput && searchInput) searchInput.value = "";
    select.dispatchEvent(new Event("change"));
    if (!preserveDropdown) closePartAutocomplete();
    return;
  }

  select.dataset.selectionSource = "autocomplete";
  select.value = String(part.id);
  select.dataset.manualSelection = "true";
  currentSelectedPart = part;
  if (updateSearchInput && searchInput) searchInput.value = formatSelectedPartSearchValue(part);
  select.dispatchEvent(new Event("change"));
  if (!preserveDropdown) closePartAutocomplete();
}

function renderAutocompleteResults(parts, options = {}) {
  const { searchTerm = "" } = options;
  const resultsContainer = document.getElementById("part-autocomplete-results");
  if (!resultsContainer) return;

  const normalizedSearchTerm = String(searchTerm || "").trim();
  resultsContainer.innerHTML = "";

  if (!normalizedSearchTerm) {
    resultsContainer.hidden = true;
    activeAutocompleteIndex = -1;
    return;
  }

  if (parts.length === 0) {
    const emptyState = document.createElement("div");
    emptyState.className = "part-result-empty";
    emptyState.textContent = i18nText("noResultsFound", "No matching part found");
    resultsContainer.appendChild(emptyState);
    resultsContainer.hidden = false;
    activeAutocompleteIndex = -1;
    return;
  }

  parts.slice(0, MAX_VISIBLE_PART_RESULTS).forEach((part, index) => {
    const stockState = getStockState(part.quantity);
    const pieceStockState = getStockState(part.piece_stock ?? part.quantity);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "part-result-option";
    button.dataset.partId = String(part.id);
    button.innerHTML = `
      <span class="part-result-title-row">
        <span class="part-result-title">${highlightMatches(part.name || "-", searchTerm)}</span>
        <span class="part-result-code">${highlightMatches(part.partType || part.part_no || "-", searchTerm)}</span>
      </span>
      <span class="part-result-chip-row">
        <span class="part-result-chip part-result-chip-warehouse">Warehouse: ${highlightMatches(part.warehouse_name || "-", searchTerm)}</span>
        <span class="part-result-chip part-result-chip-unit">Unit: ${escapeHtml(normalizeUnitType(part.unit_type))}</span>
        <span class="part-result-chip part-result-chip-stock part-result-chip-stock-${stockState}">Stock: ${escapeHtml(part.quantity ?? 0)}</span>
        <span class="part-result-chip part-result-chip-piece part-result-chip-piece-${pieceStockState}">Piece: ${escapeHtml(part.piece_stock ?? part.quantity ?? 0)}</span>
        <span class="part-result-chip part-result-chip-price">Price: ฿${Number(part.price || 0).toLocaleString()}</span>
      </span>
      <span class="part-result-description">${highlightMatches(part.description || "No description", searchTerm)}</span>
    `;
    button.addEventListener("click", () => {
      selectPart(part);
    });
    resultsContainer.appendChild(button);
    if (index === 0) button.classList.add("is-active");
  });

  resultsContainer.hidden = false;
  activeAutocompleteIndex = 0;
}

function renderPartOptions(parts, options = {}) {
  const { searchTerm = "" } = options;
  const select = document.getElementById("part-select");
  if (!select) return;
  const normalizedSearchTerm = String(searchTerm || "").trim();

  select.innerHTML = "";
  select.dataset.manualSelection = "false";
  filteredPartResults = parts.slice(0, MAX_VISIBLE_PART_RESULTS);
  renderPartSelectionWarning(getSimilarPartWarning(parts, normalizedSearchTerm));

  if (!normalizedSearchTerm) {
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = i18nText("selectPart", "Select part");
    placeholder.selected = true;
    select.appendChild(placeholder);
  }

  if (parts.length > 0) {
    parts.forEach(part => {
      const option = document.createElement("option");
      option.value = part.id;
      option.textContent = formatPartOptionLabel(part);
      select.appendChild(option);
    });
    renderAutocompleteResults(parts, { searchTerm: normalizedSearchTerm });
  } else {
    const emptyOption = document.createElement("option");
    emptyOption.value = "";
    emptyOption.textContent = i18nText("noResultsFound", "No matching part found");
    emptyOption.disabled = true;
    emptyOption.selected = true;
    select.appendChild(emptyOption);

    const sparepartNoInput = document.getElementById("sparepart-no");
    if (sparepartNoInput) sparepartNoInput.value = "";
    updatePieceStockInfo(null);
    renderSelectedPartSummary(null);
    renderPartSelectionWarning("");
    syncWarehouseByPart(null);
    fetchSerials("");
    renderAutocompleteResults([], { searchTerm: normalizedSearchTerm });
  }
}

function syncWarehouseByPart(part) {
  const warehouseSelect = document.getElementById("reason-select");
  if (!warehouseSelect) return;
  const partSelect = document.getElementById("part-select");
  if (partSelect?.dataset.manualSelection !== "true") {
    warehouseSelect.value = "";
    warehouseSelect.disabled = false;
    warehouseSelect.title = "";
    return;
  }
  if (warehouseSelect.dataset.manualSelection === "true") return;
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
  const searchTerm = document.getElementById("part-search-input")?.value || "";
  const selectedWarehouse = document.getElementById("reason-select")?.value || "";

  const filtered = getFilteredParts(searchTerm, selectedWarehouse);
  renderPartOptions(filtered, { searchTerm });
}

document.getElementById("part-search-input")?.addEventListener("input", applyFilters);

document.getElementById("part-search-input")?.addEventListener("focus", function() {
  if (String(this.value || "").trim()) {
    applyFilters();
  }
});

document.getElementById("part-search-input")?.addEventListener("keydown", function(event) {
  if (filteredPartResults.length === 0) return;

  if (event.key === "ArrowDown") {
    event.preventDefault();
    setAutocompleteActiveIndex(activeAutocompleteIndex + 1);
    return;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    setAutocompleteActiveIndex(activeAutocompleteIndex - 1);
    return;
  }

  if (event.key === "Enter") {
    if (activeAutocompleteIndex >= 0 && filteredPartResults[activeAutocompleteIndex]) {
      event.preventDefault();
      selectPart(filteredPartResults[activeAutocompleteIndex]);
    }
    return;
  }

  if (event.key === "Escape") {
    closePartAutocomplete();
  }
});

document.addEventListener("click", function(event) {
  const searchRow = document.querySelector(".search-select-row");
  if (!searchRow?.contains(event.target)) {
    closePartAutocomplete();
  }
});

document.getElementById("reason-select")?.addEventListener("change", function() {
  this.dataset.manualSelection = "true";
  applyFilters();
});

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
    tbody.innerHTML = `<tr><td colspan="13" class="table-loading-state"><div class="spinner"></div>${i18nText("loadingHistory", "Loading history...")}</td></tr>`;

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
        const type = String(m.movement_type || "").toUpperCase();
        const typeCell = row.insertCell(1);
        const typeClass = m.movement_type === 'OUT' ? 'text-danger' :
                          m.movement_type === 'IN' ? 'text-success' :
                          m.movement_type === 'BORROW' ? 'text-warning' :
                          m.movement_type === 'RETURN' ? 'text-info' : 'text-primary';
        const typeLabelKey = `movement${type.charAt(0) + type.slice(1).toLowerCase()}`;
        typeCell.innerHTML = `<span class="${typeClass}">${i18nText(typeLabelKey, type)}</span>`;
        typeCell.className = `movement-type movement-${type.toLowerCase()}`;
        const revertCell = row.insertCell(2);
        const isCorrection = Number(m.correction_of || 0) > 0;
        const hasCorrection = Number(m.has_correction || 0) > 0;
        const canCorrect = canCorrectMovements() && ["IN", "OUT", "BORROW", "RETURN"].includes(type);

        if (isCorrection) {
          revertCell.textContent = i18nText("itemReturned", "Returned Item");
        } else if (hasCorrection) {
          revertCell.textContent = i18nText("returnedAlready", "Returned Already");
        } else if (canCorrect) {
          revertCell.innerHTML = `<button class="btn btn-sm btn-warning" onclick="correctMovement(${m.id})">${i18nText("returnBtn", "Return")}</button>`;
        } else {
          revertCell.textContent = "-";
        }

        row.insertCell(3).textContent = m.part_name || "-";
        row.insertCell(4).textContent = m.partType || m.part_no || "-";
        row.insertCell(5).textContent = m.quantity;
        
        // Unit Price Used Cell
        const priceUsed = Number(m.price || 0);
        row.insertCell(6).textContent = priceUsed > 0 ? priceUsed.toLocaleString() : "-";

        row.insertCell(7).textContent = m.department || "-";
        row.insertCell(8).textContent = formatDate(m.due_date);
        row.insertCell(9).textContent = m.receiver || "-";
        row.insertCell(10).textContent = m.receipt_number || "-";
        row.insertCell(11).textContent = m.serial_usage || "-";
        const noteCell = row.insertCell(12);
        if (m.correction_of) {
          noteCell.textContent = `${m.note || "-"} (Correction of #${m.correction_of})`;
        } else {
          noteCell.textContent = m.note || "-";
        }
      });
    } else {
        tbody.innerHTML = `<tr><td colspan="13" class="table-empty-state"><i style="font-size: 24px;">🔎</i><p>${i18nText("noData", "No results found.")}</p></td></tr>`;
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

async function correctMovement(movementId) {
  const reason = prompt("Correction reason (required):");
  if (!reason || !String(reason).trim()) {
    showToast("Correction reason is required", "warning");
    return;
  }

  const token = localStorage.getItem("token");
  try {
    await postData(`/stock-movements/${movementId}/correct`, { reason: String(reason).trim() }, token);
    showToast("Correction created successfully", "success");
    await loadParts();
    await loadMovements();
  } catch (err) {
    showToast("Correction failed: " + err.message, "error");
  }
}

window.correctMovement = correctMovement;

document.getElementById("movement-form").addEventListener("submit", async function (e) {
  e.preventDefault();
  
  const submitBtn = document.getElementById("submit-all-btn");
  const receiver = document.getElementById("receiver").value.trim();
  const receiptNumber = document.getElementById("receipt-number").value.trim();
  const note = document.getElementById("note").value.trim();

  if (itemCart.length === 0) {
      showToast(i18nText("cartEmpty", "Please add items to the list first"), "warning");
      return;
  }

  if (!receiver || !receiptNumber) {
      showToast("Please enter Receiver and Request Number", "warning");
      return;
  }

  try {
    submitBtn.disabled = true;
    const token = localStorage.getItem("token");
    let successCount = 0;

    for (let i = 0; i < itemCart.length; i++) {
        const item = itemCart[i];
        let endpoint = "/stock-movements";
        let payload = {
            part_id: item.partId,
            movement_type: item.type,
            quantity: item.quantity,
            department: item.department,
            receiver: receiver,
            receipt_number: receiptNumber,
            note: note,
            due_date: item.due_date,
            serial_ids: item.serialIds,
            new_serials: item.newSerials,
            price: item.price
        };

        if (item.type === "TRANSFER") {
            endpoint = "/spareparts/transfer";
            payload = {
                part_id: item.partId,
                target_warehouse_id: parseInt(item.target_warehouse),
                quantity: item.quantity,
                serial_ids: item.serialIds,
                note: note || `Transfer by ${localStorage.getItem("username") || "user"}`
            };
        }

        // Silent recording for batch items
        await postData(`${endpoint}?notify=false`, payload, token);
        successCount++;
    }

    // Send single consolidated notification to Teams
    try {
        const firstItem = itemCart[0];
        console.log("Triggering batch notification for", itemCart.length, "items");
        
        await postData("/stock-movements/batch-notify", {
            type: firstItem.type,
            items: itemCart.map(it => ({
                partId: it.partId,
                partName: it.partName,
                partType: it.partType,
                quantity: it.quantity,
                serialNos: Array.isArray(it.serialNos) ? it.serialNos.join(", ") : String(it.serialNos || "-")
            })),
            receiver,
            department: firstItem.department || "-",
            requestNumber: receiptNumber,
            note
        }, token);
        console.log("Batch notification request sent successfully");
    } catch (notifErr) {
        console.error("Batch notification failed:", notifErr);
        showToast("Notification failed but records saved", "warning");
    }

    showToast(`${i18nText("saveSuccess", "All movements recorded!")}: ${successCount} items`, "success");
    
    // Cleanup everything
    const form = document.getElementById("movement-form");
    itemCart = [];
    renderCartTable();
    if (form) form.reset(); // Resets standard form fields (Receiver, Request No, etc.)
    
    // Full reset of all selection states and UI
    resetPartSelectionState({ preserveSearchText: false });
    
    try {
        await loadParts();
        await loadMovements();
    } catch (refreshErr) {
        console.error("Refresh failed", refreshErr);
    }
    
  } catch (error) {
    console.error("Batch save error:", error);
    showToast(error.message, "error");
  } finally {
    submitBtn.disabled = false;
  }
});

document.getElementById("serial-lookup-input")?.addEventListener("keypress", async function(e) {
  if (e.key === "Enter") {
    e.preventDefault();
    const serialNo = this.value.trim();
    if (!serialNo) return;

    const statusEl = document.getElementById("serial-lookup-status");
    if (statusEl) {
      statusEl.textContent = i18nText("searching", "Searching...");
      statusEl.style.color = "#64748b";
      statusEl.hidden = false;
    }

    try {
      const token = localStorage.getItem("token");
      const partData = await fetchData(`/api/lookup/serial/${encodeURIComponent(serialNo)}`, token);
      
      if (partData && partData.part_id) {
        const matchedPart = cachedParts.find(p => Number(p.id) === Number(partData.part_id));
        if (matchedPart) {
          selectPart(matchedPart);
          
          // Sync the main search input so it shows the found part
          const mainSearchInput = document.getElementById("part-search-input");
          if (mainSearchInput) {
            mainSearchInput.value = formatSelectedPartSearchValue(matchedPart);
          }
          
          // If in Stock IN mode, automatically add this serial to the IN list
          const type = document.getElementById("movement-type")?.value;
          if (type === "IN") {
            const inSerialsArea = document.getElementById("in-serials");
            if (inSerialsArea) {
              const currentVal = inSerialsArea.value.trim();
              const serials = currentVal ? currentVal.split("\n") : [];
              if (!serials.includes(serialNo)) {
                serials.push(serialNo);
                inSerialsArea.value = serials.join("\n");
                inSerialsArea.dispatchEvent(new Event("input"));
              }
            }
          }

          if (statusEl) {
            statusEl.textContent = `✓ Found: ${matchedPart.name}`;
            statusEl.style.color = "#16a34a";
          }
          
          // Auto-focus quantity field for immediate entry
          setTimeout(() => {
            const qtyInput = document.getElementById("quantity");
            if (qtyInput) {
              qtyInput.focus();
              qtyInput.select();
            }
          }, 100);
        } else {
           // Clear status if not found in cache
           if (statusEl) {
             statusEl.textContent = `× ${i18nText("notFound", "Not found")}`;
             statusEl.style.color = "#dc2626";
           }
        }
      } else {
        throw new Error(i18nText("notFound", "Not found"));
      }
    } catch (err) {
      // Fallback: Local search in cachedParts serial_summary
      const localMatch = cachedParts.find(p => {
        const summary = (p.serial_summary || "").toLowerCase();
        const search = serialNo.toLowerCase();
        // Check for exact word/line match to avoid partial matches like '123' matching '1123'
        return summary === search || 
               summary.startsWith(search + "\n") || 
               summary.endsWith("\n" + search) || 
               summary.includes("\n" + search + "\n");
      });

      if (localMatch) {
          selectPart(localMatch);
          const select = document.getElementById("part-select");
          if (select) {
            select.dataset.manualSelection = "true";
            select.dispatchEvent(new Event("change"));
          }
          
          if (statusEl) {
             statusEl.textContent = `✓ Found (Local): ${localMatch.name}`;
             statusEl.style.color = "#16a34a";
          }
          
          setTimeout(() => {
            const qtyInput = document.getElementById("quantity");
            if (qtyInput) {
              qtyInput.focus();
              qtyInput.select();
            }
          }, 100);
      } else if (statusEl) {
        statusEl.textContent = `× ${err.message || i18nText("notFound", "Not found")}`;
        statusEl.style.color = "#dc2626";
      }
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

let serialCheckTimeout = null;

function setupRealtimeSerialCheck() {
  const inSerialsTextarea = document.getElementById("in-serials");
  const helper = document.getElementById("in-serials-helper");
  if (!inSerialsTextarea || !helper) return;

  const showStatus = (issues, type) => {
    if (issues && issues.length > 0) {
      inSerialsTextarea.style.borderColor = "#ef4444";
      inSerialsTextarea.style.backgroundColor = "#fff1f2";
      const label = type === 'internal' ? "Duplicate in list" : (translations[currentLang].duplicateSerialDetected || "Already used in history");
      helper.innerHTML = `<span style="color:#e11d48; font-weight:600;">⚠️ ${label}: ${[...new Set(issues)].join(", ")}</span>`;
    } else {
      inSerialsTextarea.style.borderColor = "#10b981";
      inSerialsTextarea.style.backgroundColor = "#f0fdf4";
      helper.innerHTML = `<span style="color:#16a34a; font-weight:600;">✓ ${translations[currentLang].noDuplicates || "Available (Unique)"}</span>`;
    }
  };

  inSerialsTextarea.addEventListener("input", function() {
    clearTimeout(serialCheckTimeout);
    const lines = this.value.split("\n").map(s => s.trim()).filter(Boolean);
    
    if (lines.length === 0) {
      this.style.borderColor = "";
      this.style.backgroundColor = "";
      helper.textContent = i18nText("inSerialsHelper", "Enter one SP no per line.");
      return;
    }

    // 1. Immediate local check for internal duplicates
    const internalDuplicates = lines.filter((item, index) => lines.indexOf(item) !== index);
    if (internalDuplicates.length > 0) {
      showStatus(internalDuplicates, 'internal');
      return;
    }

    // 2. Debounced remote check for historical duplicates
    helper.innerHTML = `<span class="text-muted"><div class="spinner-tiny"></div> ${i18nText("searching", "Checking history...")}</span>`;
    
    serialCheckTimeout = setTimeout(async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await postData("/api/verify-serials", { serials: lines }, token);
        showStatus(res.conflicts, 'history');
      } catch (err) {
        console.error("Historical check failed:", err);
        helper.textContent = "Validation error occurred";
      }
    }, 600);
  });
}

initMovementsPage();
setupRealtimeSerialCheck();

// Refresh เมื่อกลับมาที่หน้านี้ (bfcache)
window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    initMovementsPage();
  }
});

// Handle language change re-render
window.addEventListener('languageChanged', () => {
    if (allMovements && allMovements.length > 0) {
        displayMovements(allMovements);
    }
    // Re-render part summary card and quantity label in current language
    if (currentSelectedPart) {
        renderSelectedPartSummary(currentSelectedPart);
        updatePieceStockInfo(currentSelectedPart);
    } else {
        updatePieceStockInfo(null);
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
