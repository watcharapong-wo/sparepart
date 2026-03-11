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
});

let allMovements = [];

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
    const select = document.getElementById("part-select");
    if (!select) return;
    select.innerHTML = "";
    if (Array.isArray(data)) {
      data.forEach(part => {
        const option = document.createElement("option");
        option.value = part.id;
        option.textContent = `${part.part_no} - ${part.name} (In stock: ${part.quantity})`;
        select.appendChild(option);
      });
    }
  } catch (err) {
    console.error("Failed to load parts", err);
  }
}

async function loadReasons() {
  try {
    const token = localStorage.getItem("token");
    const data = await fetchData("/reasons", token);
    const select = document.getElementById("reason-select");
    if (!select) return;
    select.innerHTML = "";
    if (Array.isArray(data)) {
      data.forEach(r => {
        const option = document.createElement("option");
        option.value = r.name;
        option.textContent = r.name;
        select.appendChild(option);
      });
    }
  } catch (err) {
    console.error("Failed to load reasons", err);
  }
}

async function loadLowStock() {
  try {
    const token = localStorage.getItem("token");
    const tbody = document.getElementById("low-stock-table").getElementsByTagName("tbody")[0];
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="3" class="table-loading-state"><div class="spinner"></div>Loading...</td></tr>`;

    const data = await fetchData("/report/low-stock", token);
    tbody.innerHTML = "";
    if (Array.isArray(data) && data.length > 0) {
      data.forEach(item => {
        const row = tbody.insertRow();
        row.insertCell(0).textContent = item.part_no;
        row.insertCell(1).textContent = item.name;
        row.insertCell(2).textContent = item.quantity;
      });
    } else {
      tbody.innerHTML = `<tr><td colspan="3" class="table-empty-state"><i style="font-size: 24px;">📦</i><p>Stock levels are healthy.</p></td></tr>`;
    }
  } catch (err) {
    console.error("Failed to load low stock", err);
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
        row.insertCell(2).textContent = m.part_no || "-";
        row.insertCell(3).textContent = m.part_name || "-";
        row.insertCell(4).textContent = m.quantity;
        row.insertCell(5).textContent = m.department || "-";
        row.insertCell(6).textContent = formatDate(m.due_date);
        row.insertCell(7).textContent = m.receiver || "-";
        row.insertCell(8).textContent = m.receipt_number || "-";
        row.insertCell(9).textContent = m.note || "-";
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

    console.log("Calling postData...");
    const data = await postData("/stock-movements", {
        part_id, 
        movement_type, 
        quantity, 
        department, 
        receiver, 
        receipt_number, 
        note, 
        due_date: movement_type === "BORROW" ? due_date : "" // Only send due_date for BORROW
    }, token);

    showToast("Stock movement recorded successfully!", "success");
    document.getElementById("movement-form").reset();
    loadParts();
    loadLowStock();
    loadMovements();
  } catch (err) {
    console.error("Submission failed ERROR:", err);
    showToast("An error occurred: " + err.message, "error");
  }
});

// Initial Load
(async () => {
  await loadParts();
  await loadReasons();
  await loadLowStock();
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
