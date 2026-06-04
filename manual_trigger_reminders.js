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
const sqlDialect = require("./db/dialect");
const { sendTeamsNotification } = require('./teams_notifier');

console.log("[Manual Trigger] Starting to check for overdue items...");

const db = createDatabase();

const sql = `
  SELECT m.*, p.name as part_name, w.name as warehouse_name
  FROM stock_movements m
  JOIN spare_parts p ON m.part_id = p.id
  JOIN warehouses w ON p.warehouseId = w.id
  WHERE m.movement_type = 'BORROW' 
    AND m.return_status = 'pending' 
    AND m.due_date < ${sqlDialect.dateNow}
`;

db.all(sql, [], (err, rows) => {
  if (err) {
    console.error("Database error:", err.message);
    process.exit(1);
  }

  if (!rows || rows.length === 0) {
    console.log("[Manual Trigger] No overdue items found.");
    process.exit(0);
  }

  console.log(`[Manual Trigger] Found ${rows.length} overdue items. Sending notifications...`);

  rows.forEach(row => {
    sendTeamsNotification({
      type: 'REMINDER',
      partName: row.part_name,
      quantity: row.quantity,
      warehouse: row.warehouse_name,
      user: row.receiver || 'Unknown',
      serialNos: row.serial_no || '-',
      note: row.note || '-',
      dueDate: row.due_date
    });
  });

  console.log(`[Manual Trigger] Sent ${rows.length} overdue reminders.`);
  
  // Update system_config so it doesn't run again if the server happens to be restarted at 8 AM today.
  const todayStr = new Date().toISOString().split('T')[0];
  db.run(sqlDialect.systemConfigUpsertSql, [todayStr], () => {
    console.log("[Manual Trigger] Updated last_overdue_remind_date to", todayStr);
    process.exit(0);
  });
});
