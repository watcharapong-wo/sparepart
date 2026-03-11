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
    sparePartsCache = data || [];
    renderSparePartsTable(sparePartsCache);
  } catch (err) {
    console.error("Load Spare Parts Failed:", err);
  }
}

function renderSparePartsTable(data) {
  const tbody = document.querySelector("#spareparts-table tbody");
  if (tbody) {
    tbody.innerHTML = "";
    if (Array.isArray(data) && data.length > 0) {
      data.forEach((p, index) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${index + 1}</td>
          <td>${p.id}</td>
          <td>${p.part_no}</td>
          <td>${p.name}</td>
          <td>${p.description || ""}</td>
          <td>${p.quantity}</td>
          <td class="cell-price">${p.price ?? ""}</td>
          <td>${p.warehouse_name || "-"}</td>
          <td>
            <div class="row-actions">
              <button onclick="editPart(${p.id})" class="btn btn-sm btn-primary" data-i18n="edit">Edit</button>
              <button onclick="deletePart(${p.id})" class="btn btn-sm btn-danger" data-i18n="delete">Delete</button>
            </div>
          </td>
        `;
        tbody.appendChild(tr);
      });
    } else {
      tbody.innerHTML = `<tr><td colspan="9" class="table-empty-state"><i style="color:var(--danger)">❌</i>Failed to load data</td></tr>`;
    }
    if (typeof applyTranslations === "function") applyTranslations();
    if (typeof checkPermissions === "function") checkPermissions();
  }
}

function editPart(id) {
  const part = sparePartsCache.find((p) => p.id === id);
  if (!part) return;

  const index = sparePartsCache.indexOf(part);
  const tr = document.querySelector(`#spareparts-table tbody tr:nth-child(${index + 1})`);
  tr.innerHTML = `
    <td>${index + 1}</td>
    <td>${part.id}</td>
    <td><input type="text" id="edit-part_no-${id}" value="${part.part_no}" style="width:100px;"></td>
    <td><input type="text" id="edit-name-${id}" value="${part.name}" style="width:150px;"></td>
    <td><input type="text" id="edit-desc-${id}" value="${part.description || ""}" style="width:200px;"></td>
    <td><input type="number" id="edit-qty-${id}" value="${part.quantity}" style="width:60px;"></td>
    <td><input type="number" id="edit-price-${id}" value="${part.price ?? 0}" style="width:80px;"></td>
    <td>${part.warehouse_name || "-"}</td>
    <td>
      <div class="row-actions">
        <button onclick="saveInlineEdit(${id})" class="btn btn-sm btn-success" data-i18n="save">Save</button>
        <button onclick="cancelEdit(${id})" class="btn btn-sm btn-secondary" data-i18n="cancel">Cancel</button>
      </div>
    </td>
  `;
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

  document.getElementById("add-part-form")?.addEventListener("submit", async function (e) {
    e.preventDefault();
    const part_no = document.getElementById("add-part_no").value;
    const name = document.getElementById("add-name").value;
    const description = document.getElementById("add-desc").value;
    const quantity = parseInt(document.getElementById("add-qty").value) || 0;
    const price = parseFloat(document.getElementById("add-price").value) || 0;
    const warehouseId = document.getElementById("add-warehouse-select").value;

    const token = localStorage.getItem("token");
    await postData("/spareparts", { part_no, name, description, quantity, price, warehouseId }, token);
    this.reset();
    showToast(translations[currentLang].saveSuccess, "success");
    loadSpareParts();
  });

  // CSV Export
  document.getElementById("export-parts")?.addEventListener("click", () => {
    const data = sparePartsCache.map((item) => ({
      ID: item.id,
      "Part No": item.part_no,
      Name: item.name,
      Description: item.description,
      Quantity: item.quantity,
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
