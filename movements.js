function setMovementType(type) {
  const form = document.getElementById("movement-form");
  const el = document.getElementById("movement-type");
  if (form && el) {
    form.reset(); // Reset all fields
    el.value = type; // Restore the desired type
    el.dispatchEvent(new Event("change")); // Trigger UI updates (like Due Date visibility)
  }
}

document.getElementById("movement-type")?.addEventListener("change", function() {
    const dueDateGroup = document.getElementById("due-date-group");
    const dueDateInput = document.getElementById("due-date");
    if (dueDateGroup) {
      const isBorrow = this.value === "BORROW";
      dueDateGroup.style.display = isBorrow ? "flex" : "none";
      if (!isBorrow && dueDateInput) {
        dueDateInput.value = ""; // Clear value when switching away from BORROW
      }
    }
});

document.getElementById("part-select")?.addEventListener("change", function() {
    const selectedPart = this.options[this.selectedIndex].textContent;
    const partNo = selectedPart.split(" - ")[0];
    const sparepartNoInput = document.getElementById("sparepart-no");
    if (sparepartNoInput) sparepartNoInput.value = partNo;
    fetchSerials(this.value);
});

async function fetchSerials(partId) {
  const serialGroup = document.getElementById("serial-selection-group");
  const inSerialGroup = document.getElementById("in-serials-group");
  const serialList = document.getElementById("serial-list");
  const qtyInput = document.getElementById("quantity");
  const type = document.getElementById("movement-type").value;

  if (!partId) {
    if (serialGroup) serialGroup.style.display = "none";
    if (inSerialGroup) inSerialGroup.style.display = "none";
    return;
  }

  // Handle Stock IN separate logic
  if (type === "IN") {
    if (serialGroup) serialGroup.style.display = "none";
    if (inSerialGroup) {
      inSerialGroup.style.display = "block";
      qtyInput.readOnly = true;
      updateInSerialsCount();
    }
    return;
  } else {
    if (inSerialGroup) inSerialGroup.style.display = "none";
  }

  try {
    const token = localStorage.getItem("token");
    const serials = await fetchData(`/spareparts/${partId}/serials`, token);
    
    if (serials && serials.length > 0) {
      serialGroup.style.display = "block";
      serialList.innerHTML = serials.map(s => `
        <label style="display: flex; align-items: center; gap: 5px; cursor: pointer; font-size: 13px; background: var(--bg-main); padding: 5px 8px; border-radius: 4px; border: 1px solid var(--border-color);">
          <input type="checkbox" name="serial" value="${s.id}" onchange="updateSelectedSerialsCount()">
          ${s.serial_no}
        </label>
      `).join("");
      qtyInput.readOnly = true;
      qtyInput.value = 0;
    } else {
      serialGroup.style.display = "none";
      qtyInput.readOnly = false;
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
      option.textContent = `${part.name} - ${part.part_no}${part.description ? ' - ' + part.description : ''} (In stock: ${part.quantity})`;
      select.appendChild(option);
    });
    // Trigger change to update Spare Part No field
    select.dispatchEvent(new Event("change"));
  } else {
    const sparepartNoInput = document.getElementById("sparepart-no");
    if (sparepartNoInput) sparepartNoInput.value = "";
  }
}

document.getElementById("part-search-input")?.addEventListener("input", function() {
    const searchTerm = this.value.toLowerCase();
    const filtered = cachedParts.filter(p => 
        (p.name || "").toLowerCase().includes(searchTerm) || 
        (p.part_no || "").toLowerCase().includes(searchTerm)
    );
    renderPartOptions(filtered);
});

async function loadReasons() {
  try {
    const token = localStorage.getItem("token");
    const data = await fetchData("/warehouses", token);
    const select = document.getElementById("reason-select");
    if (!select) return;
    select.innerHTML = "";
    if (Array.isArray(data)) {
      data.forEach(w => {
        const option = document.createElement("option");
        option.value = w.name;
        option.textContent = w.name;
        select.appendChild(option);
      });
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
    tbody.innerHTML = `<tr><td colspan="8" class="table-loading-state"><div class="spinner"></div>Loading history...</td></tr>`;

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
        row.insertCell(3).textContent = m.part_no || "-";
        row.insertCell(4).textContent = m.quantity;
        
        // Value Cell
        const totalVal = (m.quantity || 0) * (m.price || 0);
        row.insertCell(5).textContent = totalVal.toLocaleString();

        row.insertCell(6).textContent = m.department || "-";
        row.insertCell(7).textContent = formatDate(m.due_date);
        row.insertCell(8).textContent = m.receiver || "-";
        row.insertCell(9).textContent = m.receipt_number || "-";
        row.insertCell(10).textContent = m.note || "-";
      });
    } else {
        tbody.innerHTML = `<tr><td colspan="10" class="table-empty-state"><i style="font-size: 24px;">🔎</i><p>No results found.</p></td></tr>`;
    }
}

function filterMovements(term) {
    const filtered = allMovements.filter(m => {
        const name = (m.part_name || "").toLowerCase();
        const no = (m.part_no || "").toLowerCase();
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
    const data = await postData("/stock-movements", {
        part_id, 
        movement_type, 
        quantity, 
        department, 
        receiver, 
        receipt_number, 
        note, 
        due_date: movement_type === "BORROW" ? due_date : "", // Only send due_date for BORROW
        serial_ids: selectedSerials,
        new_serials: newSerials
    }, token);

    showToast("Stock movement recorded successfully!", "success");
    document.getElementById("movement-form").reset();
    document.getElementById("serial-selection-group").style.display = "none";
    document.getElementById("in-serials-group").style.display = "none";
    loadParts();
    loadMovements();
  } catch (err) {
    console.error("Submission failed ERROR:", err);
    if (err.status === 409) {
      const errorData = await err.response.json();
      const dupList = Array.isArray(errorData.serials) ? errorData.serials.join(", ") : errorData.serial || "Unknown";
      showToast(`Duplicate SP no: ${dupList}`, "error");
    } else {
      showToast("An error occurred: " + err.message, "error");
    }
  }
});

// Initial Load
(async () => {
  await loadParts();
  await loadReasons();
  await loadMovements();
  if (typeof updateUserStatus === 'function') updateUserStatus();
})();

const exportBtn = document.getElementById("export-movements");
if (exportBtn) {
  exportBtn.addEventListener("click", async () => {
    try {
      const token = localStorage.getItem("token");
      const resp = await fetchData("/report/movements3", token);
      if (resp && Array.isArray(resp)) {
        const exportData = resp.map(item => ({
          'Date': formatDate(item.movement_date),
          'Type': item.movement_type,
          'Part Name': item.part_name || item.part_no,
          'Quantity': item.quantity,
          'Total Value': (item.quantity || 0) * (item.price || 0),
          'Category/Dept': item.department || "-",
          'Due Date': formatDate(item.due_date),
          'Receiver': item.receiver || "-",
          'Note': item.note || "-"
        }));
        exportToCSV(exportData, `movement-history-${new Date().toISOString().split('T')[0]}.csv`);
      }
    } catch (err) {
      showToast("Export failed: " + err.message, "error");
    }
  });
}
