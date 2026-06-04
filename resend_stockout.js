const path = require('path');
const fs = require('fs');

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
const { sendTeamsNotification } = require('./teams_notifier');

const db = createDatabase();

// The target receipt number from the user's screenshot
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

  console.log(`[Resend] Found movement! Sending OUT notification to Teams...`);

  // Using the fetchMovementSerialUsageMap to get the exact SP usage string
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

    sendTeamsNotification({
      type: 'OUT',
      partName: row.part_name,
      quantity: row.quantity,
      unitType: row.unit_type || 'PC',
      user: row.user_name || 'System',
      receiver: row.receiver || '-', 
      receiver_name: row.receiver_name || '-', 
      department: row.department || '-',
      warehouse: row.warehouse_name || '-',
      serialNos: serialNosString,
      requestNumber: row.receipt_number || '-',
      note: row.note || '-'
    });

    console.log("[Resend] Successfully triggered the notification. Please check Teams.");
    
    // Give it a few seconds to send before exiting
    setTimeout(() => {
      process.exit(0);
    }, 2000);
  });
});
