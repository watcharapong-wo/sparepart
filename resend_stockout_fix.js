const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');

// Load environment variables
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split('\n').forEach(line => {
      const idx = line.indexOf('=');
      if (idx !== -1) {
        process.env[line.substring(0, idx).trim()] = line.substring(idx + 1).trim();
      }
    });
  }
} catch (err) {}

const { createDatabase } = require("./db/adapter");
const db = createDatabase();

const TARGET_RECEIPT = 'IT26050062';

const sql = `
  SELECT m.*, p.name as part_name, w.name as warehouse_name, u.username as user_name
  FROM stock_movements m
  JOIN spare_parts p ON m.part_id = p.id
  LEFT JOIN warehouses w ON p.warehouseId = w.id
  LEFT JOIN users u ON m.user_id = u.id
  WHERE m.receipt_number = ? AND m.movement_type = 'OUT'
  ORDER BY m.id DESC LIMIT 1
`;

db.get(sql, [TARGET_RECEIPT], (err, row) => {
  if (err) {
    console.error("Database error:", err.message);
    process.exit(1);
  }

  if (!row) {
    console.log(`[Resend] Could not find movement with Request Number: ${TARGET_RECEIPT}`);
    process.exit(0);
  }

  console.log(`[Resend] Found movement! Preparing payload...`);

  function buildSerialUsageText(r) {
    return `${r.serial_no} (${Number(r.used_qty) || 1}: ${Number(r.before_qty) || 0}->${Number(r.after_qty) || 0})`;
  }

  db.all(`
    SELECT mi.movement_id, spi.serial_no, mi.used_qty, mi.before_qty, mi.after_qty
    FROM movement_items mi
    JOIN spare_part_items spi ON spi.id = mi.item_id
    WHERE mi.movement_id = ?
  `, [row.id], (err2, serialRows) => {
    
    let serialNosString = "-";
    if (!err2 && serialRows && serialRows.length > 0) {
      serialNosString = serialRows.map(buildSerialUsageText).join(", ");
    }

    const payload = {
      type: "OUT",
      eventType: "OUT",
      title: "📤 Stock Movement: OUT",
      summary: "Stock Out | " + row.part_name + " | Qty " + row.quantity,
      message: "Stock Out\n\nPart: " + row.part_name + "\nQty: " + row.quantity + "\nWarehouse: " + (row.warehouse_name || "-") + "\nBy: " + (row.user_name || "System") + "\nIssuer: " + (row.receiver || "-") + "\nReceiver: " + (row.receiver_name || "-") + "\nDept: " + (row.department || "-") + "\nRequest No: " + (row.receipt_number || "-") + "\nSP No: " + serialNosString + "\nNote: " + (row.note || "-") + "\nTime: " + new Date(row.movement_date).toLocaleString('th-TH'),
      partName: row.part_name,
      quantity: row.quantity + " " + (row.unit_type || "PC"),
      user: row.user_name || "System",
      receiver: row.receiver || "-",
      receiver_name: row.receiver_name || "-",
      department: row.department || "-",
      warehouse: row.warehouse_name || "-",
      sourceWarehouse: "-",
      destinationWarehouse: "-",
      serialNos: serialNosString,
      requestNumber: row.receipt_number || "-",
      note: row.note || "-",
      timestamp: new Date(row.movement_date).toLocaleString('th-TH')
    };

    const webhookUrl = process.env.TEAMS_WEBHOOK_URL;
    const body = JSON.stringify(payload);
    const parsedUrl = url.parse(webhookUrl);

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: parsedUrl.path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    console.log("Sending request to Teams...");
    const req = https.request(options, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => {
        responseBody += chunk;
      });
      res.on('end', () => {
        console.log(`\n--- HTTP Response ---`);
        console.log(`Status Code: ${res.statusCode}`);
        console.log(`Body: ${responseBody}`);
        console.log(`---------------------\n`);
        console.log("Finished sending. Exiting...");
        process.exit(0);
      });
    });

    req.on('error', (e) => {
      console.error(`Request Error: ${e.message}`);
      process.exit(1);
    });

    req.write(body);
    req.end();
  });
});
