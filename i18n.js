const translations = {
  en: {
    dashboard: "Dashboard",
    spareParts: "Spare Parts",
    movements: "Movements",
    logout: "Logout",
    stockValue: "Stock Value",
    lowStockItems: "Low Stock Items",
    totalStockOuts: "Total Stock Outs",
    recentMovements: "Recent Movements",
    type: "Type",
    movementType: "Movement Type:",
    qty: "Quantity:",
    warehouseLabel: "Warehouse:",
    warehouseHeader: "Warehouse",
    receiver: "Receiver:",
    note: "Note:",
    totalValue: "Total Value",
    stockOutByDept: "Stock Out by Department",
    sparePartManagement: "Spare Part Management",
    importCSV: "📥 Import CSV",
    reloadParts: "↻ Reload Parts",
    searchPart: "Search Part...",
    no: "No.",
    id: "ID",
    partType: "Part Type",
    name: "Name Device",
    description: "Detail Device",
    quantity: "Quantity",
    price: "Price/Unit",
    updateStock: "Update Stock",
    partId: "Part ID",
    newQuantity: "New Quantity",
    newPartType: "New Part Type",
    deleteSparePart: "Delete Spare Part",
    recordMovement: "Record Stock Movement",
    stockIn: "Stock IN",
    stockOut: "Stock OUT",
    borrow: "Borrow",
    return: "Return",
    stockAdjust: "Stock ADJUST",
    receiptNumber: "Request Number",
    unitType: "Unit Type",
    selectPart: "Select part",
    conversionRate: "Conversion Rate",
    conversionRatePlaceholder: "Conversion rate (e.g. 1 BOX = 10 PC)",
    m: "M",
    pc: "PC",
    pac: "PAC",
    box: "BOX",
    rol: "ROL",
    submit: "Submit",
    loginSystem: "IT Spare Part System",
    username: "Username",
    password: "Password",
    login: "Login",
    addSparePart: "Add Spare Part",
    savePart: "Save Part",
    warehouse: "Warehouse",
    manageUsers: "Manage Users",
    activityLogs: "Activity Logs",
    systemActivityLogs: "System Activity Logs",
    timestamp: "Timestamp",
    user: "User",
    action: "Action",
    withdrawalsByAccount: "Top 10 Parts Withdrawn (Quantity)",
    importSuccess: "Parts imported successfully: ",
    importError: "Import failed: ",
    saveSuccess: "Saved successfully",
    saveError: "Error saving data",
    selectFile: "Please select a file.",
    noData: "No data found",
    startDate: "Start Date",
    endDate: "End Date",
    searchPlaceholder: "Search activity...",
    filter: "Filter",
    clear: "Clear",
    loggedInAs: "User:",
    role: "Role:",
    existingUsers: "Existing Users",
    exportCSV: "Export CSV",
    actions: "Actions",
    edit: "Edit",
    save: "Save",
    cancel: "Cancel",
    manageWarehouses: "Manage Warehouses",
    totalInventoryValue: "Total Inventory Value",
    lpn1TotalValue: "Inventory Expense",
    lpn1TotalOut: "Units Withdrawn",
    allWarehouses: "All Warehouses",
    transfer: "TRANSFER",
    targetWarehouse: "Target Warehouse",
    exportInventory: "Export Inventory",
    exportMovements: "Export Movements",
    movementTrends: "Movement Trends (Last 7 Days)",
    monthlyStockComparison: "Monthly Stock Comparison (IN vs OUT)",
    stockValueByWarehouse: "Stock Value by Warehouse",
    inventoryInsights: "Inventory Insights & Analytics",
    popularParts: "Popular Consumed Parts (Top 5)",
    lowStockWatch: "Low Stock Watch",
    overdueBorrows: "Overdue Borrows",
    deadStock: "Inactive Stock (No movement > 180 days)",
    lastMovement: "Last Movement",
    timesConsumed: "Units Used",
    issued: "issued",
    totalConsumedValue: "Value Used",
    monthlySpending: "Monthly Spending Analysis",
    stockValue: "Value",
    borrower: "Borrower",
    activity: "Activity",
    details: "Details",
    account: "Account",
    recentMovementsHistory: "Recent Movements History",
    date: "Date",
    part: "Search Part",
    partName: "Part Name",
    searchParts: "Search by Part Type or Name...",
    trackSerials: "Individual SP no required",
    serialNumbers: "SP no List",
    selectSerials: "Select SP no",
    selectedSerials: "Selected SP no",
    spNoStatus: "SP No Status",
    serialUsage: "SP No Usage",
    qtyAddBox: "Boxes to add",
    qtyAddPack: "Packs to add",
    qtyRequestedPiece: "Requested pieces",
    packInfoCurrent: "Current: {boxes} {unit} ({pieces} pieces)",
    packInfoRemaining: "Remaining: {pieces} pieces ({boxes} {unit}) - 1 {unit} = {rate} pieces",
    packAutoAllocateHint: "System will consume the current SP no until empty, then continue with the next one.",
    noAvailableSpNo: "No available SP no for this part.",
    returnStatus: "Return Status",
    itemReturned: "Returned Item",
    returnedAlready: "Returned",
    returnBtn: "Return",
    loadingHistory: "Loading history...",
    movementCorrection: "Part Correction",
    movementOut: "Stock Out",
    movementIn: "Stock In",
    movementBorrow: "Borrow",
    movementReturn: "Return",
    movementTransfer: "Transfer",
    welcome: "Welcome",
    duplicateSerialDetected: "Duplicate SP No detected",
    noDuplicates: "No duplicates detected",
    inventoryByWarehouse: "Inventory by Warehouse",
    topPartsConsumed: "Top 5 Parts Consumed",
    noLowStockRisk: "No low stock risk",
    noOverdueItems: "No overdue items",
    never: "Never",
    noDeadStock: "No dead stock",
    quickLookup: "Quick Serial Lookup",
    lookup: "Check",
    searching: "Searching...",
    notFound: "Not found",
    monthlyUsageChart: "Monthly Usage Trend (OUT / Borrow)",
    totalItems: "Total Spare Parts",
    lowStockItems: "Critical Low Stock Items",
    totalValue: "Total Value",
    unitPriceUsed: "Unit Price Used",
    dashboardTitle: "Dashboard & Analytics",
    labelDescription: "Description",
    labelWarehouse: "Warehouse",
    labelUnitType: "Unit Type",
    labelStock: "Stock",
    labelPieceStock: "Remaining number of units",
    labelUnitPrice: "Unit Price",
    labelPartRef: "Part Ref",
    scanLookupLabel: "🔍 Scan/Lookup SP No (Auto-select Part)",
    scanLookupPlaceholder: "Scan or enter SP No to identify part..."
  },
  th: {
    dashboard: "แผงควบคุม",
    spareParts: "จัดการอะไหล่",
    movements: "เบิกจ่ายอะไหล่",
    logout: "ออกจากระบบ",
    stockValue: "มูลค่าคลังสินค้า",
    lowStockItems: "รายการอะไหล่ใกล้หมด",
    totalStockOuts: "ยอดการเบิกออกทั้งหมด",
    recentMovements: "ประวัติการเบิกจ่าย",
    type: "ประเภท",
    movementType: "ประเภท:",
    qty: "จำนวน:",
    warehouseLabel: "คลังสินค้า:",
    warehouseHeader: "คลังสินค้า",
    receiver: "ผู้รับ:",
    note: "บันทึก:",
    recordMovement: "บันทึกการเบิกจ่าย",
    stockIn: "รับเข้า",
    stockOut: "เบิกออก",
    receiptNumber: "เลขที่ใบขอเบิก",
    unitType: "หน่วย",
    selectPart: "เลือกอะไหล่",
    conversionRate: "อัตราแปลงหน่วย",
    conversionRatePlaceholder: "อัตราแปลง (เช่น 1 BOX = 10 PC)",
    m: "M",
    pc: "PC",
    pac: "PAC",
    box: "BOX",
    rol: "ROL",
    submit: "บันทึกข้อมูล",
    totalValue: "มูลค่ารวม",
    stockOutByDept: "การเบิกตามแผนก",
    sparePartManagement: "จัดการอะไหล่",
    importCSV: "📥 นำเข้า CSV",
    exportCSV: "ส่งออกไฟล์ CSV",
    reloadParts: "↻ โหลดข้อมูลใหม่",
    searchPart: "ค้นหาอะไหล่...",
    no: "ลำดับ",
    id: "ID",
    partType: "ประเภทอะไหล่",
    name: "ชื่ออุปกรณ์",
    description: "รายละเอียดอุปกรณ์",
    quantity: "จำนวน",
    price: "ราคาต่อหน่วย",
    updateStock: "แก้ไขข้อมูล",
    partId: "รหัส ID",
    newQuantity: "จำนวนใหม่",
    newPartType: "ประเภทอะไหล่ใหม่",
    deleteSparePart: "ลบอะไหล่",
    addSparePart: "เพิ่มอะไหล่",
    savePart: "บันทึกอะไหล่",
    warehouse: "คลังสินค้า",
    manageUsers: "จัดการผู้ใช้งาน",
    activityLogs: "ประวัติการใช้งาน",
    systemActivityLogs: "ประวัติกิจกรรมในระบบ",
    timestamp: "วันเวลา",
    user: "ผู้ใช้งาน",
    action: "กิจกรรม",
    withdrawalsByAccount: "สถิติการเบิกอะไหล่สูงสุด 10 อันดับ (ชิ้น)",
    importSuccess: "นำเข้าข้อมูลสำเร็จ: ",
    importError: "นำเข้าข้อมูลล้มเหลว: ",
    saveSuccess: "บันทึกข้อมูลเรียบร้อยแล้ว",
    saveError: "เกิดข้อผิดพลาดในการบันทึกข้อมูล",
    selectFile: "กรุณาเลือกไฟล์",
    noData: "ไม่พบข้อมูล",
    startDate: "วันที่เริ่มต้น",
    endDate: "วันที่สิ้นสุด",
    searchPlaceholder: "ค้นหากิจกรรม...",
    filter: "กรองข้อมูล",
    clear: "ล้างค่า",
    loggedInAs: "ผู้ใช้งาน:",
    role: "บทบาท:",
    actions: "จัดการ",
    edit: "แก้ไข",
    save: "บันทึก",
    cancel: "ยกเลิก",
    delete: "ลบ",
    manageWarehouses: "จัดการคลังสินค้า",
    newWarehouseName: "ชื่อคลังสินค้าใหม่",
    add: "เพิ่ม",
    borrow: "ยืม",
    return: "คืน",
    dueDate: "วันที่ต้องคืน",
    overdueAlerts: "แจ้งเตือนเกินกำหนดคืน",
    borrower: "ผู้ยืม",
    daysOverdue: "เกินกำหนด (วัน)",
    totalInventoryValue: "มูลค่าคงคลังรวม",
    lpn1TotalValue: "มูลค่าการใช้จ่าย",
    lpn1TotalOut: "จำนวนเบิกออก",
    allWarehouses: "คลังสินค้าทั้งหมด",
    transfer: "โอนย้าย",
    targetWarehouse: "คลังสินค้าปลายทาง",
    exportInventory: "ส่งออกไฟล์คงคลัง (CSV)",
    exportMovements: "ส่งออกประวัติ (CSV)",
    movementTrends: "แนวโน้มการเคลื่อนไหว (7 วันย้อนหลัง)",
    monthlyStockComparison: "เปรียบเทียบสต็อกรายเดือน (รับ vs เบิก)",
    stockValueByWarehouse: "มูลค่าสต็อกแยกตามคลัง",
    inventoryInsights: "การวิเคราะห์และข้อมูลเชิงลึก (Insights)",
    popularParts: "อะไหล่ยอดนิยม (ถูกเบิกใช้สูงสุด 5 อันดับ)",
    lowStockWatch: "อะไหล่ใกล้หมด",
    overdueBorrows: "รายการยืมเกินกำหนด",
    deadStock: "อะไหล่ค้างคลัง (ไม่มีการเคลื่อนไหวเกิน 180 วัน)",
    lastMovement: "เคลื่อนไหวล่าสุด",
    timesConsumed: "จำนวนที่ถูกใช้",
    issued: "เบิก",
    totalConsumedValue: "มูลค่าที่ถูกใช้",
    monthlySpending: "สรุปยอดใช้จ่ายรายเดือน",
    stockValue: "มูลค่า",
    borrower: "ผู้ยืม",
    activity: "ประเภท",
    details: "รายละเอียด",
    account: "ผู้ดำเนินการ",
    recentMovementsHistory: "ประวัติการเบิกจ่ายล่าสุด",
    date: "วันที่",
    part: "อะไหล่",
    partName: "ชื่ออะไหล่",
    searchParts: "ค้นหาด้วยรหัส หรือ ชื่ออะไหล่...",
    trackSerials: "ต้องระบุหมายเลข SP เฉพาะ",
    serialNumbers: "รายการหมายเลข SP",
    selectSerials: "เลือกหมายเลข SP",
    selectedSerials: "หมายเลข SP ที่เลือกไว้",
    spNoStatus: "สถานะ SP No",
    serialUsage: "การใช้ SP No",
    qtyAddBox: "จำนวนกล่องที่เพิ่ม",
    qtyAddPack: "จำนวนแพ็คที่เพิ่ม",
    qtyRequestedPiece: "จำนวนชิ้นที่ต้องการ",
    packInfoCurrent: "ปัจจุบัน: {boxes} {unit} ({pieces} ชิ้น)",
    packInfoRemaining: "คงเหลือ: {pieces} ชิ้น ({boxes} {unit}) - 1 {unit} = {rate} ชิ้น",
    packAutoAllocateHint: "ระบบจะหักจาก SP no ที่ค้างอยู่ก่อนจนหมด แล้วค่อยใช้ SP no ถัดไป",
    noAvailableSpNo: "ไม่พบ SP no ที่พร้อมใช้งานสำหรับอะไหล่นี้",
    returnStatus: "สถานะการคืน",
    itemReturned: "รายการคืนกลับ",
    returnedAlready: "คืนกลับแล้ว",
    returnBtn: "คืนกลับ",
    loadingHistory: "กำลังโหลดข้อมูล...",
    movementCorrection: "คืนกลับ PART",
    movementOut: "เบิกออก",
    movementIn: "รับเข้า",
    movementBorrow: "ยืม",
    movementReturn: "คืน",
    movementTransfer: "โอนย้าย",
    welcome: "ยินดีต้อนรับ",
    duplicateSerialDetected: "พบหมายเลข SP ซ้ำ",
    noDuplicates: "ไม่พบหมายเลขซ้ำ",
    inventoryByWarehouse: "มูลค่าคลังสินค้าแยกตามคลัง",
    topPartsConsumed: "อะไหล่ที่ถูกเบิกสูงสุด 5 อันดับ",
    noLowStockRisk: "ไม่มีความเสี่ยงสต็อกต่ำ",
    noOverdueItems: "ไม่มีรายการค้างคืน",
    never: "ไม่เคย",
    noDeadStock: "ไม่มีอะไหล่ค้างคลัง",
    quickLookup: "ตรวจสอบข้อมูล SP no ด่วน",
    lookup: "ตรวจสอบ",
    searching: "กำลังค้นหา...",
    notFound: "ไม่พบข้อมูล",
    monthlyUsageChart: "แนวโน้มการเบิกจ่ายรายเดือน (ออก/ยืม)",
    totalItems: "รายการอะไหล่ทั้งหมด",
    lowStockItems: "อะไหล่ที่สต็อกต่ำ",
    dashboardTitle: "สรุปข้อมูลผลการดำเนินงาน",
    labelDescription: "รายละเอียด",
    labelWarehouse: "คลังสินค้า",
    labelUnitType: "หน่วยนับ",
    labelStock: "จำนวนคงเหลือ",
    labelPieceStock: "จำนวนหน่วยคงเหลือ",
    labelUnitPrice: "ราคาต่อหน่วย",
    unitPriceUsed: "มูลค่าต่อหน่วยที่ถูกเบิกใช้",
    labelPartRef: "รหัสอ้างอิง",
    scanLookupLabel: "🔍 สแกน/ค้นหา SP No (เลือก Part อัตโนมัติ)",
    scanLookupPlaceholder: "สแกนหรือพิมพ์ SP No เพื่อระบุอะไหล่..."

  }
};

let currentLang = localStorage.getItem('appLang') || 'en';

function toggleLanguage() {
  currentLang = currentLang === 'en' ? 'th' : 'en';
  localStorage.setItem('appLang', currentLang);
  applyTranslations();
  const langBtn = document.getElementById('lang-toggle-btn');
  if(langBtn) langBtn.textContent = currentLang === 'en' ? '🇹🇭 TH' : '🇬🇧 EN';
  window.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang: currentLang } }));
}

function applyTranslations() {
  const t = translations[currentLang];

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (!t[key]) return;
    if (el.tagName === 'INPUT' && el.hasAttribute('placeholder')) {
      el.setAttribute('placeholder', t[key]);
    } else if (el.tagName === 'OPTION' || el.tagName === 'BUTTON' && !el.querySelector('span')) {
      el.textContent = t[key];
    } else {
      let hasTextNode = false;
      for (let child of el.childNodes) {
        if (child.nodeType === Node.TEXT_NODE && child.textContent.trim() !== '') {
          child.textContent = t[key] + (el.querySelector('span') ? ' ' : '');
          hasTextNode = true;
          break;
        }
      }
      if (!hasTextNode) {
        if (el.children.length === 0) el.textContent = t[key];
        else {
          const spanHtml = el.innerHTML.match(/<span.*<\/span>/i);
          if(spanHtml) el.innerHTML = t[key] + ' ' + spanHtml[0];
          else el.textContent = t[key];
        }
      }
    }
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (t[key]) el.setAttribute('placeholder', t[key]);
  });

  displayUserStatus();
}

function displayUserStatus() {
  const userStatusEl = document.getElementById("user-status");
  if (!userStatusEl) return;
  const username = localStorage.getItem("username") || "Unknown";
  const role = localStorage.getItem("role") || "none";
  const t = translations[currentLang] || translations.en;
  const label = (t && t.loggedInAs) ? t.loggedInAs : (currentLang === 'th' ? "ผู้ใช้งาน:" : "User:");
  userStatusEl.textContent = `${label} ${username} (${role.toUpperCase()})`;
}

function i18nText(key, fallback = "") {
  if (typeof translations === "undefined" || typeof currentLang === "undefined") {
    return fallback;
  }
  return translations?.[currentLang]?.[key] || fallback;
}

document.addEventListener("DOMContentLoaded", () => {
  const navLinks = document.querySelector('.nav-links');
  if (navLinks && !document.getElementById('lang-toggle-btn')) {
    const langBtn = document.createElement('a');
    langBtn.href = "#";
    langBtn.id = "lang-toggle-btn";
    langBtn.className = "lang-toggle";
    langBtn.textContent = currentLang === 'en' ? '🇹🇭 TH' : '🇬🇧 EN';
    langBtn.onclick = (e) => { e.preventDefault(); toggleLanguage(); };
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) navLinks.insertBefore(langBtn, logoutBtn);
    else navLinks.appendChild(langBtn);
  }
  applyTranslations();
});
