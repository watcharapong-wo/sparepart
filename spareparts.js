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
  await postData("/warehouses", { name }, token);
  loadWarehouses();
}

async function deleteWarehouse(id) {
  if (!confirm("Are you sure?")) return;
  const token = localStorage.getItem("token");
  await deleteData(`/warehouses/${id}`, token);
  loadWarehouses();
}

async function loadSpareParts() {
  try {
    const token = localStorage.getItem("token");
    const data = await fetchData("/spareparts", token);
    // Ensure latest parts are at the top (Double-check sorting)
    data.sort((a, b) => b.id - a.id);
    sparePartsCache = data || [];
    renderSparePartsTable(sparePartsCache);
  } catch (err) {
    console.error("Load Spare Parts Failed:", err);
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderSerialSummaryHtml(summary) {
  const raw = String(summary || "").trim();
  if (!raw) return "-";
  const lines = raw.split("\n").filter(Boolean);
  if (lines.length === 0) return "-";

  const items = lines.map((line) => {
    const safeLine = escapeHtml(line);
    const match = line.match(/^(.*)\[(\d+)\/(\d+)\]$/);
    if (!match) {
      return `<span class="serial-chip serial-chip-neutral">${safeLine}</span>`;
    }

    const serialNo = escapeHtml(match[1].trim());
    const remaining = Number(match[2]);
    const initial = Number(match[3]);
    let stateClass = "serial-chip-available";
    if (remaining <= 0) stateClass = "serial-chip-consumed";
    else if (remaining < initial) stateClass = "serial-chip-partial";

    return `<span class="serial-chip ${stateClass}">${serialNo} <strong>${remaining}/${initial}</strong></span>`;
  });

  return `<div class="serial-summary-list">${items.join("")}</div>`;
}

function renderSparePartsTable(data) {
  const tbody = document.querySelector("#spareparts-table tbody");
  if (tbody) {
    tbody.innerHTML = "";
    if (Array.isArray(data) && data.length > 0) {
      data.forEach((p, index) => {
        const tr = document.createElement("tr");
        tr.id = `row-${p.id}`; // Add unique ID to row
        const serialSummary = renderSerialSummaryHtml(p.serial_summary);
        tr.innerHTML = `
          <td>${index + 1}</td>
          <td>${p.id}</td>
          <td>${escapeHtml(p.name)}</td>
          <td>${escapeHtml(p.part_no)}</td>
          <td>${escapeHtml(p.description || "")}</td>
          <td>${p.quantity}</td>
          <td class="serial-status-cell">${serialSummary}</td>
          <td class="cell-price">${p.price ?? ""}</td>
          <td>${escapeHtml(p.warehouse_name || "-")}</td>
          <td class="actions-cell">
            <div class="row-actions">
              <button onclick="editPart(${p.id})" class="btn btn-sm btn-primary" data-i18n="edit">Edit</button>
              <button onclick="deletePart(${p.id})" class="btn btn-sm btn-danger" data-i18n="delete">Delete</button>
            </div>
          </td>
        `;
        tbody.appendChild(tr);
      });
    } else {
      tbody.innerHTML = `<tr><td colspan="10" class="table-empty-state"><i style="color:var(--text-muted)">ℹ️</i> ${translations[currentLang].noData || "No data found"}</td></tr>`;
    }
    if (typeof applyTranslations === "function") applyTranslations();
    if (typeof checkPermissions === "function") checkPermissions();
  }
}

function editPart(id) {
  const part = sparePartsCache.find((p) => p.id === id);
  if (!part) return;

  const index = sparePartsCache.indexOf(part);
  const tr = document.getElementById(`row-${id}`);
  if (!tr) {
    console.error("Row not found for ID:", id);
    return;
  }
  
  // Edit row with input fields (no actions)
  tr.innerHTML = `
    <td>${index + 1}</td>
    <td>${part.id}</td>
    <td><input type="text" id="edit-name-${id}" value="${escapeHtml(part.name)}" style="width:100px;"></td>
    <td><input type="text" id="edit-part_no-${id}" value="${escapeHtml(part.part_no)}" style="width:80px;"></td>
    <td><input type="text" id="edit-desc-${id}" value="${escapeHtml(part.description || "")}" style="width:120px;"></td>
    <td><input type="number" id="edit-qty-${id}" value="${part.quantity}" style="width:50px;"></td>
    <td class="serial-status-cell">${renderSerialSummaryHtml(part.serial_summary)}</td>
    <td><input type="number" id="edit-price-${id}" value="${part.price ?? 0}" style="width:70px;"></td>
    <td>${escapeHtml(part.warehouse_name || "-")}</td>
    <td></td>
  `;
  
  // Create actions row below
  const actionRow = document.createElement("tr");
  actionRow.id = `edit-actions-${id}`;
  actionRow.innerHTML = `
    <td colspan="9" style="padding: 0;">
      <div style="padding: 8px 10px; display: flex; gap: 8px;">
        <button onclick="saveInlineEdit(${id})" class="btn btn-sm btn-success" data-i18n="save">Save</button>
        <button onclick="cancelEdit(${id})" class="btn btn-sm btn-secondary" data-i18n="cancel">Cancel</button>
      </div>
    </td>
  `;
  tr.parentNode.insertBefore(actionRow, tr.nextSibling);
}
}

function cancelEdit(id) {
  renderSparePartsTable(sparePartsCache);
}

async function saveInlineEdit(id) {
  const part_no = document.getElementById(`edit-part_no-${id}`).value;
  const name = document.getElementById(`edit-name-${id}`).value;
  const description = document.getElementById(`edit-desc-${id}`).value;
  const quantity = parseInt(document.getElementById(`edit-qty-${id}`).value) || 0;
  const priceInput = document.getElementById(`edit-price-${id}`).value;
  const price = priceInput === "" ? 0 : parseFloat(priceInput);

  const updateData = { part_no, name, description, quantity, price };

  try {
    const token = localStorage.getItem("token");
    await putData(`/spareparts/${id}`, updateData, token);
    showToast(translations[currentLang].saveSuccess || "Saved successfully", "success");
    loadSpareParts();
  } catch (err) {
    showToast(translations[currentLang].saveError || "Error saving", "error");
  }
}

async function deletePart(id) {
  if (!confirm(translations[currentLang].confirmDelete || "Are you sure you want to delete this item?")) return;
  try {
    const token = localStorage.getItem("token");
    await deleteData(`/spareparts/${id}`, token);
    showToast(translations[currentLang].deleteSuccess || "Deleted successfully", "success");
    loadSpareParts();
  } catch (err) {
    showToast(translations[currentLang].deleteError || "Failed to delete", "error");
  }
}

// Event Listeners
document.addEventListener("DOMContentLoaded", () => {
  loadWarehouses();
  loadSpareParts();

  // Sync quantity with SP no count and check for internal duplicates
  document.getElementById("add-serials")?.addEventListener("input", function() {
    const rawVal = this.value;
    const lines = rawVal.split("\n").filter(line => line.trim() !== "");
    const trimmedLines = lines.map(l => l.trim());
    
    // Check for internal duplicates in the textarea
    const duplicates = trimmedLines.filter((item, index) => trimmedLines.indexOf(item) !== index);
    if (duplicates.length > 0) {
      this.style.borderColor = "#ef4444"; // Red border
      this.title = "Duplicate SP no detected: " + [...new Set(duplicates)].join(", ");
    } else {
      this.style.borderColor = "#cbd5e1"; // Default border
      this.title = "";
    }

    const qtyInput = document.getElementById("add-quantity");
    if (qtyInput) {
      qtyInput.value = lines.length;
      qtyInput.readOnly = true;
    }
  });

  // Make quantity readonly if there is serial input
  const initialSerials = document.getElementById("add-serials")?.value;
  if (initialSerials) {
    const qtyInput = document.getElementById("add-quantity");
    if (qtyInput) qtyInput.readOnly = true;
  }

  document.getElementById("manage-warehouses-form")?.addEventListener("submit", async function(e) {
    e.preventDefault();
    const nameInput = document.getElementById("new-warehouse-name");
    const name = nameInput.value.trim();
    if (!name) return;
    try {
      await addWarehouse(name);
      nameInput.value = "";
      showToast(translations[currentLang].saveSuccess || "Warehouse added", "success");
    } catch (err) {
      showToast(translations[currentLang].saveError || "Failed to add warehouse", "error");
    }
  });

  document.getElementById("add-part-form")?.addEventListener("submit", async function (e) {
    e.preventDefault();
    try {
      const part_no = document.getElementById("add-part-no").value;
      const name = document.getElementById("add-name").value;
      const description = document.getElementById("add-description").value;
      const quantity = parseInt(document.getElementById("add-quantity").value) || 0;
      const unit_type = document.getElementById("add-unit-type")?.value || "piece";
      const conversion_rate = parseFloat(document.getElementById("add-conversion-rate")?.value) || 1;
      const price = parseFloat(document.getElementById("add-price").value) || 0;
      const warehouseId = document.getElementById("add-warehouse-select").value;

      const serialsRaw = document.getElementById("add-serials")?.value || "";
      const serials = serialsRaw.split("\n").filter(s => s.trim()).map(s => s.trim());
      
      if (serials.length === 0) {
        showToast("Please enter at least one SP no", "error");
        return;
      }

      if ((unit_type === "box" || unit_type === "pack") && serials.length !== quantity) {
        showToast("For box/pack, SP no count must equal quantity", "error");
        return;
      }

      // Strict duplicate check before submission
      const duplicates = serials.filter((item, index) => serials.indexOf(item) !== index);
      if (duplicates.length > 0) {
        showToast("Duplicate SP no detected: " + [...new Set(duplicates)].join(", "), "error");
        const serialsEl = document.getElementById("add-serials");
        if (serialsEl) {
          serialsEl.style.borderColor = "#ef4444";
          serialsEl.focus();
        }
        return;
      }

      const token = localStorage.getItem("token");
      await postData("/spareparts", { part_no, name, description, quantity, unit_type, conversion_rate, price, warehouseId, serials }, token);
      this.reset();
      showToast(translations[currentLang].saveSuccess || "Saved successfully", "success");
      loadSpareParts();
    } catch (err) {
      console.error("Save failed:", err);
      if (err.message && err.message.includes("409")) {
        showToast(err.message.includes("serial") ? err.message : "Duplicate SP no detected", "error");
      } else {
        showToast(translations[currentLang].saveError || "Failed to save part", "error");
      }
    }
  });

  // CSV Export
  document.getElementById("export-parts")?.addEventListener("click", () => {
    const data = sparePartsCache.map((item) => ({
      ID: item.id,
      "Part No": item.part_no,
      Name: item.name,
      Description: item.description,
      Quantity: item.quantity,
      UnitType: item.unit_type || "piece",
      ConversionRate: item.conversion_rate || 1,
      Price: item.price,
      Warehouse: item.warehouse_name || "-"
    }));
    exportToCSV(data, "spare_parts_export.csv");
  });

  // CSV Import
  const importBtn = document.getElementById("import-parts");
  const fileInput = document.getElementById("import-csv-file");
  if (importBtn && fileInput) {
    importBtn.addEventListener("click", () => {
      fileInput.value = ""; // Reset to allow same file re-import
      fileInput.click();
    });

    fileInput.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        let text = event.target.result;
        const json = parseCSV(text);
        if (json.length === 0) {
          showToast(translations[currentLang].selectFile || "No data found in CSV", "error");
          return;
        }
        try {
          const token = localStorage.getItem("token");
          const response = await fetch(`${API_URL}/spareparts/bulk`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ parts: json })
          });

          if (!response.ok) throw new Error("Bulk upload failed");
          
          const result = await response.json();
          showToast(translations[currentLang].importSuccess + result.count, "success");
          loadSpareParts();
        } catch (err) {
          showToast(translations[currentLang].importError + err.message, "error");
        }
      };
      reader.readAsText(file, "windows-874");
    });
  }

  // Search Filter
  const partSearchInput = document.getElementById("part-search");
  if (partSearchInput) {
    partSearchInput.addEventListener("input", (e) => {
      const term = e.target.value.toLowerCase();
      const filtered = sparePartsCache.filter(p => 
        (p.part_no && p.part_no.toLowerCase().includes(term)) ||
        (p.name && p.name.toLowerCase().includes(term)) ||
        (p.description && p.description.toLowerCase().includes(term))
      );
      renderSparePartsTable(filtered);
    });
  }
});

function splitCSVLine(line, delimiter) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    let char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result.map(v => v.trim().replace(/^"|"$/g, ''));
}

function parseCSV(csv) {
  if (csv.charCodeAt(0) === 0xFEFF) csv = csv.substr(1);
  const rawLines = csv.split(/\r?\n|\r/).filter(l => l.trim() !== "");
  if (rawLines.length < 1) return [];

  const delimiter = rawLines[0].includes(";") ? ";" : ",";

  // 1. ระบุ Header จริง (หาแถวที่มี Keywords เยอะที่สุด)
  let headerIndex = 0;
  let maxMatches = -1;
  const keywords = ["ลำดับ", "sparepart", "รายการ", "รุ่น", "โมเดล", "คงเหลือ", "qty", "จำนวน"];

  for (let i = 0; i < Math.min(rawLines.length, 10); i++) {
    const testRow = splitCSVLine(rawLines[i], delimiter);
    const matches = testRow.filter(h => keywords.some(k => h.toLowerCase().includes(k))).length;
    if (matches > maxMatches) {
      maxMatches = matches;
      headerIndex = i;
    }
  }

  // 2. อ่านหัวตาราง และรวมร่างกับบรรทัดถัดไปหากจำเป็น (ข้อมูลมักแยก 2 บรรทัด)
  let headers = splitCSVLine(rawLines[headerIndex], delimiter);
  if (headerIndex + 1 < rawLines.length) {
    const nextRow = splitCSVLine(rawLines[headerIndex + 1], delimiter);
    if (nextRow.some(h => keywords.some(k => h.toLowerCase().includes(k)))) {
      headers = headers.map((h, idx) => {
        const nh = nextRow[idx] || "";
        return (h + " " + nh).trim();
      });
      headerIndex++; 
    }
  }

  console.log("Final Headers Mapping:", headers);

  const results = [];
  for (let i = headerIndex + 1; i < rawLines.length; i++) {
    const values = splitCSVLine(rawLines[i], delimiter);
    if (values.length < 2) continue;

    const findIdx = (aliases) => headers.findIndex(h => aliases.some(a => h.toLowerCase().includes(a.toLowerCase())));
    const getVal = (aliases) => {
      const idx = findIdx(aliases);
      return idx !== -1 ? values[idx] : "";
    };

    const rowNo = getVal(["ลำดับ", "no."]);
    const namePart1 = getVal(["sparepart"]);
    const namePart2 = getVal(["รายการ"]);
    const model = getVal(["รุ่น", "โมเดล"]);
    const spec = getVal(["หน่วย", "ความจุ", "spec"]);
    const qty = getVal(["คงเหลือ", "จำนวน", "qty"]);
    const price = getVal(["ราคา", "price", "ทุน"]);

    const cleanName = (namePart1 + " " + namePart2).trim();
    const cleanDesc = (model + " " + spec).trim();

    if (!cleanName || cleanName === "รายการ" || cleanName === "Sparepart") continue;
    if (!rowNo || isNaN(parseInt(rowNo))) continue; 
    if (values.filter(v => v).length < 3) continue;

    results.push({
      part_no: rowNo,
      name: cleanName,
      description: cleanDesc,
      quantity: parseInt(qty) || 0,
      price: parseFloat(price) || 0,
      warehouse_name: null
    });
  }

  console.log(`Parsed ${results.length} valid items.`);
  return results;
}
