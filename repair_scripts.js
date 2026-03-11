const fs = require('fs');
const path = require('path');
// Since this script is in the same directory as scripts.js
const filePath = path.join(__dirname, 'scripts.js');

try {
    const buf = fs.readFileSync(filePath);
    console.log('File length:', buf.length);
    const pattern = Buffer.from('function parseCSV(csv) {');
    const index = buf.indexOf(pattern);
    
    if (index !== -1) {
        const head = buf.slice(0, index);
        const fixedFunction = `function parseCSV(csv) {
  // 1. จัดการ Byte Order Mark (BOM) สำหรับ UTF-8
  if (csv.charCodeAt(0) === 0xFEFF) {
    csv = csv.substr(1);
  }

  // 2. รองรับหลายบรรทัด (\\n, \\r\\n, \\r)
  const lines = csv.split(/\\r?\\n|\\r/).filter(l => l.trim() !== "");
  if (lines.length < 2) return [];

  // 3. ตรวจสอบ Delimiter (คอมม่า หรือ เซมิโคลอน)
  const firstLine = lines[0];
  const delimiter = firstLine.includes(";") ? ";" : ",";

  // 4. ล้าง " และช่องว่างรอบๆ Header และทำให้เป็นตัวเล็ก (Lowercase) ทั้งหมด
  const headers = firstLine.split(delimiter).map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());

  const results = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(delimiter).map(v => v.trim().replace(/^"|"$/g, ''));
    
    // Helper function to find value by any of the possible headers
    const getVal = (aliases) => {
      const index = headers.findIndex(h => aliases.includes(h));
      return index !== -1 ? values[index] : null;
    };

    // Aliases ครอบคลุมทั้งไทยและอังกฤษ และกรณีที่ Excel ใส่หัวแปลกๆ
    const part_no = getVal(["part_no", "part no", "spare part no", "รหัสอะไหล่", "รหัส", "idอะไหล่", "sparepart no"]);
    const name = getVal(["name", "name device", "รายการ", "ชื่อ", "ชื่ออะไหล่", "device"]);
    const description = getVal(["description", "detail device", "รุ่น / โมเดล", "รายละเอียด", "รุ่น", "โมเดล", "spec"]);
    const quantity = getVal(["quantity", "จำนวน", "qty", "ยอดคงเหลือ", "คงเหลือ"]);
    const price = getVal(["price", "price/unit", "ราคา", "ราคา/หน่วย", "ทุน"]);
    const warehouse_name = getVal(["warehouse_name", "warehouse", "คลังสินค้า", "คลัง", "ที่เก็บ"]);

    results.push({
      part_no: part_no || "",
      name: name || "",
      description: description || "",
      quantity: parseInt(quantity) || 0,
      price: parseFloat(price) || 0,
      warehouse_name: warehouse_name || null
    });
  }

  return results;
}
`;
        const final = Buffer.concat([head, Buffer.from(fixedFunction, 'utf8')]);
        fs.writeFileSync(filePath, final);
        console.log('Successfully repaired scripts.js using local path');
    } else {
        console.log('Error: function parseCSV(csv) { not found in binary');
    }
} catch (e) {
    console.log('Error:', e.message);
}
