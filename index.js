const fs = require('fs');
const path = require('path');

// Manual .env loader to avoid external dependencies
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split('\n').forEach(line => {
      const idx = line.indexOf('=');
      if (idx !== -1) {
        const key = line.substring(0, idx).trim();
        const value = line.substring(idx + 1).trim();
        process.env[key] = value;
      }
    });
  }
} catch (err) {
  console.error('[ENV] Error loading .env:', err.message);
}

const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { sendTeamsNotification } = require('./teams_notifier');
const dbConfig = require("./db/config");
const { createDatabase } = require("./db/adapter");
const sqlDialect = require("./db/dialect");

const app = express();
const PORT = 5000; // เปลี่ยนมาใช้ 5000 ถาวร
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

if (dbConfig.dbClient !== "sqlite") {
  console.warn(`[DB] DB_CLIENT=${dbConfig.dbClient} is configured, runtime is in migration mode.`);
  console.warn(`[DB] DB_FALLBACK_TO_SQLITE=${dbConfig.fallbackToSqlite}`);
  console.warn("[DB] Use npm run check:mssql and npm run migrate:mssql to prepare SQL Server first.");
}

process.on("uncaughtException", (err) => {
  console.error("FATAL: Uncaught Exception:", err.message);
  console.error(err.stack);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("FATAL: Unhandled Rejection at:", promise, "reason:", reason);
});

// ---------------------------

app.get("/test", (req, res) => {
  res.json({ message: "Server is alive", timestamp: new Date().toISOString() });
});

app.get("/test-notif", (req, res) => {
  const { sendTeamsNotification } = require('./teams_notifier');
  console.log('[DEBUG] Triggering manual test notification...');
  sendTeamsNotification({
    type: 'NEW',
    partName: 'Debug Part (Direct API)',
    quantity: 99,
    user: 'Debugger',
    receiver: '-',
    department: '-',
    warehouse: 'LPN TEST'
  });
  res.json({ message: "Notification triggered" });
});

// Silence browser favicon requests when no favicon file is configured.
app.get("/favicon.ico", (req, res) => {
  res.status(204).end();
});

// Log all requests
app.use((req, res, next) => {
  console.log(`${new Date().toLocaleTimeString()} - ${req.method} ${req.url}`);
  next();
});

// ใช้ Middleware
app.use(cors());
app.use(express.json());

// --- Static File Serving ---
app.use(express.static(__dirname));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html")); // กลับไปชี้ที่ index.html ตามโค้ดดั้งเดิม
});
// ---------------------------

// เปิดฐานข้อมูลผ่าน adapter (SQLite default, fallback during MSSQL migration phase)
const db = createDatabase();

// สร้างตารางอะไหล่, ผู้ใช้, และคลัง
db.run(
  `CREATE TABLE IF NOT EXISTS spare_parts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    part_no TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    quantity INTEGER NOT NULL,
    unit_type TEXT DEFAULT 'piece',
    conversion_rate REAL DEFAULT 1,
    piece_stock INTEGER DEFAULT 0,
    price REAL
  )`
);

db.run(
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL
  )`
);

db.run(
  `CREATE TABLE IF NOT EXISTS warehouses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    location TEXT
  )`
);

db.run(
  `CREATE TABLE IF NOT EXISTS stock_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    part_id INTEGER NOT NULL,
    movement_type TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    movement_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    note TEXT,
    department TEXT,
    receiver TEXT,
    receipt_number TEXT,
    user_id INTEGER,
    due_date DATETIME,
    return_status TEXT DEFAULT 'pending',
    FOREIGN KEY (part_id) REFERENCES spare_parts(id)
  )`,
  (err) => {
    if (err) console.error("Create stock_movements table error:", err.message);
    else {
      // Migration: Add columns if they don't exist
      const cols = {
        department: "TEXT",
        receiver: "TEXT",
        receipt_number: "TEXT",
        user_id: "INTEGER",
        due_date: "DATETIME",
        return_status: "TEXT DEFAULT 'pending'"
      };
      Object.keys(cols).forEach(col => {
        db.run(`ALTER TABLE stock_movements ADD COLUMN ${col} ${cols[col]}`, (err2) => {
          if (err2 && !err2.message.includes("duplicate column name")) {
            // Silently fail if column exists or other minor issues
          }
        });
      });
    }
  }
);

db.run(
  `CREATE TABLE IF NOT EXISTS movement_reasons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  )`
);

// Table สำหรับเก็บค่าคอนฟิกของระบบ (เช่น วันที่ส่งแจ้งเตือนล่าสุด)
db.run(`CREATE TABLE IF NOT EXISTS system_config (
  key TEXT PRIMARY KEY,
  value TEXT
)`);

// ฟังก์ชันสำหรับรัน Automation รายวัน (เช่น ส่ง Reminder ตอน 8 โมงเช้า)
function runDailyAutomation() {
  const checkInterval = 60 * 60 * 1000; // เช็คทุก 1 ชั่วโมง

  setInterval(() => {
    const now = new Date();
    const currentHour = now.getHours();
    const todayStr = now.toISOString().split('T')[0];

    // รันตอนเช้า 8:00 - 8:59 น.
    if (currentHour === 8) {
      db.get("SELECT value FROM system_config WHERE key = 'last_overdue_remind_date'", (err, row) => {
        if (err) return console.error("Automation error:", err);

        if (!row || row.value !== todayStr) {
          console.log(`[Automation] Running daily overdue reminders for ${todayStr}...`);

          triggerOverdueReminders();

          db.run(sqlDialect.systemConfigUpsertSql, [todayStr]);
        }
      });
    }
  }, checkInterval);
}

async function triggerOverdueReminders() {
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
    if (err) return console.error("Trigger reminders error:", err);
    if (rows.length === 0) return console.log("[Automation] No overdue items found.");

    const { sendTeamsNotification } = require('./teams_notifier');
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
    console.log(`[Automation] Sent ${rows.length} overdue reminders.`);
  });
}

// เริ่มทำงาน Automation
runDailyAutomation();

db.run(
  `CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT NOT NULL,
    details TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`
);

db.run(
  `CREATE TABLE IF NOT EXISTS spare_part_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    part_id INTEGER NOT NULL,
    serial_no TEXT NOT NULL,
    status TEXT DEFAULT 'available',
    initial_qty INTEGER DEFAULT 1,
    remaining_qty INTEGER DEFAULT 1,
    last_used_at DATETIME,
    FOREIGN KEY (part_id) REFERENCES spare_parts(id)
  )`
);

db.run(
  `CREATE TABLE IF NOT EXISTS movement_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    movement_id INTEGER NOT NULL,
    item_id INTEGER NOT NULL,
    used_qty INTEGER DEFAULT 1,
    before_qty INTEGER DEFAULT 0,
    after_qty INTEGER DEFAULT 0,
    FOREIGN KEY (movement_id) REFERENCES stock_movements(id),
    FOREIGN KEY (item_id) REFERENCES spare_part_items(id)
  )`,
  (err) => {
    if (err) console.error("Create movement_items table error:", err.message);
    else seedData();
  }
);

function logActivity(userId, action, details) {
  const sql = "INSERT INTO activity_logs (user_id, action, details) VALUES (?, ?, ?)";
  db.run(sql, [userId, action, details || null], (err) => {
    if (err) console.error("Logging error:", err.message);
  });
}

function buildSerialUsageText(row) {
  return `${row.serial_no} (${Number(row.used_qty) || 1}: ${Number(row.before_qty) || 0}->${Number(row.after_qty) || 0})`;
}

function fetchMovementSerialUsageMap(movementIds, callback) {
  if (!movementIds || movementIds.length === 0) {
    callback(null, new Map());
    return;
  }

  const placeholders = movementIds.map(() => "?").join(", ");
  const sql = `SELECT mi.movement_id, spi.serial_no, mi.used_qty, mi.before_qty, mi.after_qty
               FROM movement_items mi
               JOIN spare_part_items spi ON spi.id = mi.item_id
               WHERE mi.movement_id IN (${placeholders})
               ORDER BY mi.movement_id, mi.id`;

  db.all(sql, movementIds, (err, rows) => {
    if (err) return callback(err);
    const usageMap = new Map();
    (rows || []).forEach((row) => {
      const current = usageMap.get(row.movement_id) || [];
      current.push(buildSerialUsageText(row));
      usageMap.set(row.movement_id, current);
    });
    callback(null, usageMap);
  });
}

function fetchSerialSummaryMap(partIds, callback) {
  if (!partIds || partIds.length === 0) {
    callback(null, new Map());
    return;
  }

  const placeholders = partIds.map(() => "?").join(", ");
  const sql = `SELECT part_id, serial_no, initial_qty, remaining_qty, status, id
               FROM spare_part_items
               WHERE part_id IN (${placeholders})
               ORDER BY part_id, CASE WHEN status = 'partial' THEN 0 ELSE 1 END, id ASC`;

  db.all(sql, partIds, (err, rows) => {
    if (err) return callback(err);
    const summaryMap = new Map();
    (rows || []).forEach((row) => {
      const current = summaryMap.get(row.part_id) || [];
      current.push(`${row.serial_no} [${Number(row.remaining_qty) || 1}/${Number(row.initial_qty) || 1}]`);
      summaryMap.set(row.part_id, current);
    });
    callback(null, summaryMap);
  });
}

function insertOrGetSparePartItem(partId, serialNo, itemQty, callback) {
  db.get(
    "SELECT id FROM spare_part_items WHERE part_id = ? AND serial_no = ?",
    [partId, serialNo],
    (selectErr, existingRow) => {
      if (selectErr) return callback(selectErr);
      if (existingRow?.id) {
        callback(null, { itemId: existingRow.id, created: false });
        return;
      }

      db.run(
        "INSERT INTO spare_part_items (part_id, serial_no, status, initial_qty, remaining_qty) VALUES (?, ?, 'available', ?, ?)",
        [partId, serialNo, itemQty, itemQty],
        function(insertErr) {
          if (insertErr) return callback(insertErr);
          callback(null, { itemId: this.lastID, created: true });
        }
      );
    }
  );
}

function seedData() {
  console.log("--- SEEDING START ---");
  db.get("SELECT COUNT(*) as count FROM warehouses", (err, row) => {
    if (row && row.count === 0) {
      db.run("INSERT INTO warehouses (name, location) VALUES ('LPN1', 'Building A')");
      db.run("INSERT INTO warehouses (name, location) VALUES ('LPN2', 'Building B')");
    }
  });

  db.get("SELECT COUNT(*) as count FROM movement_reasons", (err, row) => {
    if (row && row.count === 0) {
      db.run("INSERT INTO movement_reasons (name) VALUES ('LPN1')");
      db.run("INSERT INTO movement_reasons (name) VALUES ('LPN2')");
    }
  });

  db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
    if (row && row.count === 0) {
      bcrypt.hash("admin123", 10, (err, hashedPassword) => {
        if (!err) {
          db.run("INSERT INTO users (username, password, role) VALUES (?, ?, ?)", ["admin", hashedPassword, "admin"]);
        }
      });
    }
  });
}

function authenticateToken(req, res, next) {
  const token = req.header("Authorization")?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Access denied" });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Invalid token" });
    req.user = user;
    next();
  });
}

function requireRole(roles = []) {
  return (req, res, next) => {
    if (!req.user?.role) return res.status(401).json({ error: "NO_ROLE" });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: "FORBIDDEN" });
    next();
  };
}

// API Register
app.post("/register", authenticateToken, requireRole(["admin"]), (req, res) => {
  const { username, password, role } = req.body;
  bcrypt.hash(password, 10, (err, hashedPassword) => {
    db.run("INSERT INTO users (username, password, role) VALUES (?, ?, ?)", [username, hashedPassword, role], function (err) {
      logActivity(req.user.userId, "REGISTER_USER", `Registered new user: ${username} with role: ${role}`);
      res.status(201).json({ message: "User registered successfully!" });
    });
  });
});

// API Login
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(404).json({ error: "User not found" });

    bcrypt.compare(password, user.password, (err, isMatch) => {
      if (!isMatch) return res.status(401).json({ error: "Invalid credentials" });
      const token = jwt.sign({ userId: user.id, role: user.role, username: user.username }, JWT_SECRET, { expiresIn: "10h" });
      logActivity(user.id, "LOGIN", `User ${user.username} logged in`);
      res.json({ token, role: user.role });
    });
  });
});

// APIs Reports & Dashboards
app.get("/users", authenticateToken, requireRole(["admin"]), (req, res) => {
  db.all("SELECT id, username, role FROM users", [], (err, rows) => res.json(rows));
});

app.put("/users/:id/reset-password", authenticateToken, requireRole(["admin"]), (req, res) => {
  const id = Number(req.params.id);
  const { password } = req.body || {};

  if (!id || !password) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  bcrypt.hash(password, 10, (hashErr, hashedPassword) => {
    if (hashErr) return res.status(500).json({ error: hashErr.message });

    db.run("UPDATE users SET password = ? WHERE id = ?", [hashedPassword, id], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: "User not found" });

      logActivity(req.user.userId, "RESET_PASSWORD", `Reset password for user ID ${id}`);
      res.json({ message: "Password reset successfully" });
    });
  });
});

app.delete("/users/:id", authenticateToken, requireRole(["admin"]), (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid user id" });

  if (req.user?.userId === id) {
    return res.status(400).json({ error: "Cannot delete your own account" });
  }

  db.run("DELETE FROM users WHERE id = ?", [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: "User not found" });

    logActivity(req.user.userId, "DELETE_USER", `Deleted user ID ${id}`);
    res.json({ message: "User deleted successfully" });
  });
});

app.get("/report/value", authenticateToken, (req, res) => {
  const warehouseId = req.query.warehouseId;
  let sql = "SELECT SUM(quantity * price) AS stock_value FROM spare_parts";
  const params = [];
  if (warehouseId && warehouseId !== 'all') { sql += " WHERE warehouseId = ?"; params.push(warehouseId); }
  console.log("[VALUE] warehouseId:", warehouseId, "SQL:", sql, "Params:", params);
  db.all(sql, params, (err, row) => {
    console.log("[VALUE] result:", row);
    res.json(row);
  });
});

app.get("/report/value-by-warehouse", authenticateToken, (req, res) => {
  const sql = `
    SELECT w.name AS warehouse_name, COALESCE(SUM(p.quantity * p.price), 0) AS total_value
    FROM warehouses w
    LEFT JOIN spare_parts p ON p.warehouseId = w.id
    GROUP BY w.id, w.name
    ORDER BY w.id
  `;
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.get("/report/low-stock", authenticateToken, (req, res) => {
  const warehouseId = req.query.warehouseId;
  let sql = "SELECT * FROM spare_parts WHERE quantity < 10";
  const params = [];
  if (warehouseId && warehouseId !== 'all') { sql += " AND warehouseId = ?"; params.push(warehouseId); }
  console.log("[LOW-STOCK] warehouseId:", warehouseId, "SQL:", sql, "Params:", params);
  db.all(sql, params, (err, rows) => {
    console.log("[LOW-STOCK] result:", rows);
    res.json(rows);
  });
});

app.get("/report/movements", authenticateToken, (req, res) => {
  db.all("SELECT * FROM stock_movements ORDER BY movement_date DESC", [], (err, rows) => res.json(rows));
});

app.get("/report/movements2", authenticateToken, (req, res) => {
  const sql = `SELECT m.id, m.movement_date, m.movement_type, m.quantity, m.note, p.id AS part_id, p.part_no, p.name AS part_name, p.warehouseId FROM stock_movements m JOIN spare_parts p ON p.id = m.part_id ORDER BY m.movement_date DESC, m.id DESC`;
  db.all(sql, [], (err, rows) => res.json(rows));
});

app.get("/report/activity-logs", authenticateToken, requireRole(["admin"]), (req, res) => {
  let sql = `SELECT l.id, l.user_id, l.action, l.details, ${sqlDialect.isoUtc("l.timestamp")} as timestamp, u.username, u.role FROM activity_logs l LEFT JOIN users u ON u.id = l.user_id ORDER BY l.timestamp DESC ${sqlDialect.limit(500)}`;
  db.all(sql, [], (err, rows) => res.json(rows));
});

app.get("/report/movements3", authenticateToken, (req, res) => {
  const warehouseId = req.query.warehouseId;
  let sql = `SELECT m.*, p.name as part_name, p.part_no, u.username
             FROM stock_movements m
             JOIN spare_parts p ON m.part_id = p.id
             LEFT JOIN users u ON m.user_id = u.id
             WHERE m.movement_date >= ${sqlDialect.dateDaysAgo(30)}`;
  const params = [];
  if (warehouseId && warehouseId !== 'all') { sql += " AND p.warehouseId = ?"; params.push(warehouseId); }
  sql += " ORDER BY m.movement_date DESC";
  console.log("[MOVEMENTS3] warehouseId:", warehouseId, "SQL:", sql, "Params:", params);
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const movementIds = (rows || []).map((row) => row.id);
    fetchMovementSerialUsageMap(movementIds, (usageErr, usageMap) => {
      if (usageErr) return res.status(500).json({ error: usageErr.message });
      const result = (rows || []).map((row) => ({
        ...row,
        serial_usage: (usageMap.get(row.id) || []).join(", ") || "-"
      }));
    console.log("[MOVEMENTS3] result:", rows);
      res.json(result);
    });
  });
});

app.get("/report/expense-by-warehouse", authenticateToken, (req, res) => {
  const warehouseId = req.query.warehouseId;
  let sql = `SELECT w.name AS warehouse_name, SUM(m.quantity * p.price) AS total_expense, SUM(m.quantity) AS total_qty FROM stock_movements m JOIN spare_parts p ON m.part_id = p.id JOIN warehouses w ON p.warehouseId = w.id WHERE m.movement_type = 'OUT'`;
  const params = [];
  if (warehouseId && warehouseId !== 'all') { sql += " AND p.warehouseId = ?"; params.push(warehouseId); }
  sql += " GROUP BY w.name";
  console.log("[EXPENSE-BY-WAREHOUSE] warehouseId:", warehouseId, "SQL:", sql, "Params:", params);
  db.all(sql, params, (err, rows) => {
    console.log("[EXPENSE-BY-WAREHOUSE] result:", rows);
    res.json(rows);
  });
});

app.get("/report/movement-trends", authenticateToken, (req, res) => {
  const warehouseId = req.query.warehouseId;
  let sql = `SELECT ${sqlDialect.dateOnly("movement_date")} as date, movement_type, SUM(m.quantity) as total_qty FROM stock_movements m JOIN spare_parts p ON m.part_id = p.id WHERE m.movement_date >= ${sqlDialect.dateDaysAgo(7)}`;
  const params = [];
  if (warehouseId && warehouseId !== 'all') { sql += " AND p.warehouseId = ?"; params.push(warehouseId); }
  sql += ` GROUP BY ${sqlDialect.dateOnly("m.movement_date")}, m.movement_type`;
  db.all(sql, params, (err, rows) => res.json(rows));
});

app.get("/report/monthly-comparison", authenticateToken, (req, res) => {
  const warehouseId = req.query.warehouseId;
  let sql = `SELECT ${sqlDialect.monthKey("m.movement_date")} as month, m.movement_type, SUM(m.quantity) as total_qty FROM stock_movements m JOIN spare_parts p ON m.part_id = p.id WHERE m.movement_date >= ${sqlDialect.dateDaysAgo(180)}`;
  const params = [];
  if (warehouseId && warehouseId !== 'all') { sql += " AND p.warehouseId = ?"; params.push(warehouseId); }
  sql += ` GROUP BY ${sqlDialect.monthKey("m.movement_date")}, m.movement_type`;
  db.all(sql, params, (err, rows) => res.json(rows));
});

app.get("/report/withdraw-by-account", authenticateToken, (req, res) => {
  const warehouseId = req.query.warehouseId;
  let sql = `SELECT m.receiver, SUM(m.quantity) as total_qty FROM stock_movements m JOIN spare_parts p ON m.part_id = p.id WHERE m.movement_type IN ('OUT', 'BORROW') AND m.receiver IS NOT NULL`;
  const params = [];
  if (warehouseId && warehouseId !== 'all') { sql += " AND p.warehouseId = ?"; params.push(warehouseId); }
  sql += ` GROUP BY m.receiver ORDER BY total_qty DESC ${sqlDialect.limit(10)}`;
  db.all(sql, params, (err, rows) => res.json(rows));
});

app.get("/report/insights", authenticateToken, (req, res) => {
  const warehouseId = req.query.warehouseId;
  const popularSql = `SELECT p.part_no, p.name, SUM(m.quantity) as total_consumed FROM stock_movements m JOIN spare_parts p ON m.part_id = p.id WHERE m.movement_type IN ('OUT', 'BORROW') ${warehouseId && warehouseId !== 'all' ? 'AND p.warehouseId = ?' : ''} GROUP BY p.id, p.part_no, p.name ORDER BY total_consumed DESC ${sqlDialect.limit(5)}`;
  const deadStockSql = `SELECT p.part_no, p.name, p.quantity, MAX(m.movement_date) as last_movement FROM spare_parts p LEFT JOIN stock_movements m ON p.id = m.part_id WHERE p.quantity > 0 ${warehouseId && warehouseId !== 'all' ? 'AND p.warehouseId = ?' : ''} GROUP BY p.id, p.part_no, p.name, p.quantity HAVING MAX(m.movement_date) IS NULL OR MAX(m.movement_date) < ${sqlDialect.dateDaysAgo(180)} ORDER BY last_movement ASC ${sqlDialect.limit(10)}`;
  const params = warehouseId && warehouseId !== 'all' ? [warehouseId] : [];

  db.all(popularSql, params, (err, popular) => {
    db.all(deadStockSql, params, (err, deadStock) => res.json({ popular, deadStock }));
  });
});

app.get("/report/top-parts-by-warehouse", authenticateToken, (req, res) => {
  const warehouseId = req.query.warehouseId;
  
  if (!warehouseId || warehouseId === 'all') {
    return res.json([]);
  }
  
  const sql = `SELECT TOP 5 p.id, p.part_no, p.name, p.quantity, ISNULL(SUM(m.quantity), 0) as total_consumed 
               FROM spare_parts p 
               LEFT JOIN stock_movements m ON p.id = m.part_id AND m.movement_type IN ('OUT', 'BORROW')
               WHERE p.warehouseId = ?
               GROUP BY p.id, p.part_no, p.name, p.quantity
               ORDER BY total_consumed DESC`;
  
  db.all(sql, [warehouseId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

if (dbConfig.dbClient === "sqlite") {
  db.all("PRAGMA table_info(spare_parts)", [], (err, cols) => {
    if (!cols) return;
    if (!cols.some((c) => c.name === "warehouseId")) {
      db.run("ALTER TABLE spare_parts ADD COLUMN warehouseId INTEGER");
    }
    if (!cols.some((c) => c.name === "unit_type")) {
      db.run("ALTER TABLE spare_parts ADD COLUMN unit_type TEXT DEFAULT 'piece'");
    }
    if (!cols.some((c) => c.name === "conversion_rate")) {
      db.run("ALTER TABLE spare_parts ADD COLUMN conversion_rate REAL DEFAULT 1");
    }
    if (!cols.some((c) => c.name === "piece_stock")) {
      db.run("ALTER TABLE spare_parts ADD COLUMN piece_stock INTEGER DEFAULT 0", (altErr) => {
        if (!altErr) {
          db.run("UPDATE spare_parts SET piece_stock = CAST(quantity * COALESCE(conversion_rate, 1) AS INTEGER)");
        } else {
          console.error("Migration piece_stock error:", altErr.message);
        }
      });
    }
  });

  db.all("PRAGMA table_info(spare_part_items)", [], (err, cols) => {
    if (!cols) return;

    const ensureNormalizedItems = () => {
      db.run(
        `UPDATE spare_part_items
         SET initial_qty = COALESCE(initial_qty, 1),
             remaining_qty = COALESCE(remaining_qty, 1),
             status = CASE
               WHEN COALESCE(remaining_qty, 1) <= 0 THEN 'consumed'
               WHEN COALESCE(remaining_qty, 1) < COALESCE(initial_qty, 1) THEN 'partial'
               ELSE 'available'
             END`
      );
    };

    const ensureLastUsedAt = () => {
      if (!cols.some((c) => c.name === "last_used_at")) {
        db.run("ALTER TABLE spare_part_items ADD COLUMN last_used_at DATETIME", ensureNormalizedItems);
        return;
      }
      ensureNormalizedItems();
    };

    const ensureRemainingQty = () => {
      if (!cols.some((c) => c.name === "remaining_qty")) {
        db.run("ALTER TABLE spare_part_items ADD COLUMN remaining_qty INTEGER DEFAULT 1", (altErr) => {
          if (!altErr) {
            db.run(
              `UPDATE spare_part_items
               SET remaining_qty = COALESCE((
                 SELECT CASE
                   WHEN p.unit_type IN ('box', 'pack') THEN CAST(COALESCE(p.conversion_rate, 1) AS INTEGER)
                   ELSE 1
                 END
                 FROM spare_parts p
                 WHERE p.id = spare_part_items.part_id
               ), 1)`,
              ensureLastUsedAt
            );
            return;
          }
          ensureLastUsedAt();
        });
        return;
      }
      ensureLastUsedAt();
    };

    if (!cols.some((c) => c.name === "initial_qty")) {
      db.run("ALTER TABLE spare_part_items ADD COLUMN initial_qty INTEGER DEFAULT 1", ensureRemainingQty);
      return;
    }

    ensureRemainingQty();
  });

  db.all("PRAGMA table_info(movement_items)", [], (err, cols) => {
    if (!cols) return;
    if (!cols.some((c) => c.name === "used_qty")) {
      db.run("ALTER TABLE movement_items ADD COLUMN used_qty INTEGER DEFAULT 1");
    }
    if (!cols.some((c) => c.name === "before_qty")) {
      db.run("ALTER TABLE movement_items ADD COLUMN before_qty INTEGER DEFAULT 0");
    }
    if (!cols.some((c) => c.name === "after_qty")) {
      db.run("ALTER TABLE movement_items ADD COLUMN after_qty INTEGER DEFAULT 0");
    }
  });
}

// API สำหรับดึงอะไหล่ทั้งหมด
app.get("/spareparts", authenticateToken, (req, res) => {
  db.all(
    `SELECT p.*, w.name AS warehouse_name
     FROM spare_parts p
     LEFT JOIN warehouses w ON p.warehouseId = w.id
     ORDER BY p.id DESC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      const partIds = (rows || []).map((row) => row.id);
      fetchSerialSummaryMap(partIds, (summaryErr, summaryMap) => {
        if (summaryErr) return res.status(500).json({ error: summaryErr.message });
        const result = (rows || []).map((row) => ({
          ...row,
          serial_summary: (summaryMap.get(row.id) || []).join("\n")
        }));
        res.json(result);
      });
    }
  );
});

// API อื่นๆ คงเดิมตามโค้ดต้นฉบับ
app.get("/reasons", authenticateToken, (req, res) => {
  db.all("SELECT * FROM movement_reasons ORDER BY name", [], (err, rows) => res.json(rows));
});

app.get("/warehouses", authenticateToken, (req, res) => {
  db.all("SELECT * FROM warehouses ORDER BY id", [], (err, rows) => res.json(rows));
});

// API สำหรับเพิ่มอะไหล่ใหม่
app.post("/spareparts", authenticateToken, requireRole(["admin", "co-admin"]), (req, res) => {
  const { name, part_no, description, quantity, unit_type, conversion_rate, price, warehouseId, serials } = req.body;
  if (!name || !part_no || !quantity || !warehouseId || !serials || !Array.isArray(serials) || serials.length === 0) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const normalizedUnit = String(unit_type || "piece").toLowerCase();
  const normalizedRate = Number(conversion_rate) > 0 ? Number(conversion_rate) : 1;
  const itemInitialQty = normalizedUnit === "box" || normalizedUnit === "pack" ? Math.round(normalizedRate) : 1;

  if ((normalizedUnit === "box" || normalizedUnit === "pack") && Number(quantity) !== serials.length) {
    return res.status(400).json({ error: "SP no count must match box/pack quantity" });
  }

  const pieceStock = Math.round(Number(quantity) * normalizedRate);
  db.run(
    "INSERT INTO spare_parts (name, part_no, description, quantity, unit_type, conversion_rate, piece_stock, price, warehouseId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [name, part_no, description || '', quantity, normalizedUnit, normalizedRate, pieceStock, price || 0, warehouseId],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      const partId = this.lastID;
      const stmt = db.prepare("INSERT INTO spare_part_items (part_id, serial_no, status, initial_qty, remaining_qty) VALUES (?, ?, 'available', ?, ?)");
      serials.forEach(sn => stmt.run(partId, sn, itemInitialQty, itemInitialQty));
      stmt.finalize();

      sendTeamsNotification({
        type: "NEW",
        partName: name,
        quantity: Number(quantity) || 0,
        user: req.user?.username || "System",
        warehouse: warehouseId,
        serialNos: serials.join(", "),
        note: description || "-"
      });

      logActivity(req.user.userId, "ADD_SPARE_PART", `Added part ${name} (${part_no}) with ${serials.length} serials`);
      res.status(201).json({ message: "Spare part added", partId });
    }
  );
});

// API สำหรับแก้ไขอะไหล่
app.put("/spareparts/:id", authenticateToken, requireRole(["admin", "co-admin"]), (req, res) => {
  const id = Number(req.params.id);
  const { part_no, name, description, quantity, price } = req.body;
  if (!id || !part_no || !name) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const sql = "UPDATE spare_parts SET part_no = ?, name = ?, description = ?, quantity = ?, price = ? WHERE id = ?";
  db.run(sql, [part_no, name, description || "", Number(quantity) || 0, Number(price) || 0, id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: "Part not found" });

    logActivity(req.user.userId, "UPDATE_SPARE_PART", `Updated part ID ${id} (${part_no})`);
    res.json({ message: "Spare part updated" });
  });
});

// API สำหรับลบอะไหล่
app.delete("/spareparts/:id", authenticateToken, requireRole(["admin", "co-admin"]), (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid part id" });

  // Fetch part details before deleting so we can notify Teams
  db.get("SELECT sp.name, sp.part_no, sp.quantity, w.name AS warehouse_name FROM spare_parts sp LEFT JOIN warehouses w ON sp.warehouseId = w.id WHERE sp.id = ?", [id], (fetchErr, part) => {
    if (fetchErr) return res.status(500).json({ error: fetchErr.message });
    if (!part) return res.status(404).json({ error: "Part not found" });

    db.serialize(() => {
      db.run("BEGIN TRANSACTION");

      db.run("DELETE FROM spare_part_items WHERE part_id = ?", [id], (err) => {
        if (err) {
          db.run("ROLLBACK");
          return res.status(500).json({ error: err.message });
        }

        db.run("DELETE FROM spare_parts WHERE id = ?", [id], function (err2) {
          if (err2) {
            db.run("ROLLBACK");
            return res.status(500).json({ error: err2.message });
          }
          if (this.changes === 0) {
            db.run("ROLLBACK");
            return res.status(404).json({ error: "Part not found" });
          }

          db.run("COMMIT");
          logActivity(req.user.userId, "DELETE_SPARE_PART", `Deleted part ${part.name} (${part.part_no}) ID ${id}`);

          sendTeamsNotification({
            type: "DELETE",
            partName: part.name,
            quantity: part.quantity,
            user: req.user?.username || "System",
            warehouse: part.warehouse_name || "-",
            note: `Part No: ${part.part_no}`
          });

          res.json({ message: "Spare part deleted" });
        });
      });
    });
  });
});

// API สำหรับดึงเลข Serial ของอะไหล่แต่ละชิ้น
app.get("/spareparts/:id/serials", authenticateToken, (req, res) => {
  const sql = `SELECT *
               FROM spare_part_items
               WHERE part_id = ?
                 AND COALESCE(remaining_qty, 1) > 0
               ORDER BY CASE WHEN status = 'partial' THEN 0 ELSE 1 END, id ASC`;
  db.all(sql, [req.params.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// API สำหรับบันทึกการเบิกจ่าย (Stock Movement)
app.post("/stock-movements", authenticateToken, (req, res) => {
  const { part_id, movement_type, quantity, department, receiver, receipt_number, note, due_date, serial_ids, new_serials } = req.body;
  const userId = req.user.userId;

  const VALID_MOVEMENT_TYPES = ["IN", "OUT", "BORROW", "RETURN", "TRANSFER"];
  if (!movement_type || !VALID_MOVEMENT_TYPES.includes(movement_type)) {
    return res.status(400).json({ error: `Invalid movement_type. Must be one of: ${VALID_MOVEMENT_TYPES.join(", ")}` });
  }

  db.get(
    "SELECT unit_type, COALESCE(conversion_rate, 1) AS conversion_rate, COALESCE(piece_stock, quantity) AS piece_stock, quantity FROM spare_parts WHERE id = ?",
    [part_id],
    (preErr, partMeta) => {
      if (preErr || !partMeta) return res.status(404).json({ error: "Part not found" });

      const unitType = partMeta.unit_type || "piece";
      const convInt = Math.max(1, Math.round(Number(partMeta.conversion_rate) || 1));
      const isPackUnit = unitType === "box" || unitType === "pack";
      const requestedQty = Math.max(0, Number(quantity) || 0);

      if (!requestedQty) {
        return res.status(400).json({ error: "Invalid quantity" });
      }

      db.serialize(() => {
        db.run("BEGIN TRANSACTION");

        const rollbackWith = (status, message) => {
          db.run("ROLLBACK");
          return res.status(status).json({ error: message });
        };

        const updatePackTotals = (done) => {
          let updateSql = "";
          let updateParams = [];
          if (movement_type === "IN") {
            updateSql = "UPDATE spare_parts SET quantity = quantity + ?, piece_stock = piece_stock + (? * ?) WHERE id = ?";
            updateParams = [requestedQty, requestedQty, convInt, part_id];
          } else if (movement_type === "OUT" || movement_type === "BORROW") {
            updateSql = `UPDATE spare_parts SET
              piece_stock = piece_stock - ?,
              quantity = ((piece_stock - ? + ? - 1) / ?)
              WHERE id = ?`;
            updateParams = [requestedQty, requestedQty, convInt, convInt, part_id];
          } else if (movement_type === "RETURN") {
            updateSql = `UPDATE spare_parts SET
              piece_stock = piece_stock + ?,
              quantity = ((piece_stock + ? + ? - 1) / ?)
              WHERE id = ?`;
            updateParams = [requestedQty, requestedQty, convInt, convInt, part_id];
          } else {
            updateSql = "UPDATE spare_parts SET quantity = quantity - ?, piece_stock = MAX(0, piece_stock - (? * ?)) WHERE id = ?";
            updateParams = [requestedQty, requestedQty, convInt, part_id];
          }
          db.run(updateSql, updateParams, done);
        };

        const updateSimpleTotals = (done) => {
          const sign = movement_type === "IN" || movement_type === "RETURN" ? 1 : -1;
          db.run(
            "UPDATE spare_parts SET quantity = quantity + ?, piece_stock = COALESCE(piece_stock, quantity) + ? WHERE id = ?",
            [sign * requestedQty, sign * requestedQty, part_id],
            done
          );
        };

        const finalizeMovement = (movementId, touchedSerialNos) => {
          const updateTotals = isPackUnit ? updatePackTotals : updateSimpleTotals;
          updateTotals((updateErr) => {
            if (updateErr) return rollbackWith(500, updateErr.message);
            db.run("COMMIT");

            db.get(
              `SELECT p.name AS part_name, w.name AS warehouse_name
               FROM spare_parts p
               LEFT JOIN warehouses w ON p.warehouseId = w.id
               WHERE p.id = ?`,
              [part_id],
              (metaErr, meta) => {
                if (!metaErr) {
                  sendTeamsNotification({
                    type: movement_type,
                    partName: meta?.part_name || `Part ID ${part_id}`,
                    quantity: requestedQty,
                    user: req.user?.username || "System",
                    receiver: receiver || "-",
                    department: department || "-",
                    warehouse: meta?.warehouse_name || "-",
                    serialNos: touchedSerialNos.length > 0 ? touchedSerialNos.join(", ") : "-",
                    note: note || "-"
                  });
                }
              }
            );

            logActivity(userId, `MOVEMENT_${movement_type}`, `Part ID ${part_id}: ${requestedQty} units`);
            res.status(201).json({ message: "Success", movementId });
          });
        };

        const insertMovementItem = (movementId, itemId, usedQty, beforeQty, afterQty, done) => {
          db.run(
            "INSERT INTO movement_items (movement_id, item_id, used_qty, before_qty, after_qty) VALUES (?, ?, ?, ?, ?)",
            [movementId, itemId, usedQty, beforeQty, afterQty],
            done
          );
        };

        const allocatePackUsage = (movementId) => {
          db.all(
            `SELECT id, serial_no, initial_qty, remaining_qty
             FROM spare_part_items
             WHERE part_id = ? AND COALESCE(remaining_qty, 0) > 0
             ORDER BY CASE WHEN status = 'partial' THEN 0 ELSE 1 END, id ASC`,
            [part_id],
            (itemsErr, rows) => {
              if (itemsErr) return rollbackWith(500, itemsErr.message);
              const totalRemaining = rows.reduce((sum, row) => sum + (Number(row.remaining_qty) || 0), 0);
              if (totalRemaining < requestedQty) {
                return rollbackWith(400, "Not enough quantity in SP no list");
              }

              let remainingToTake = requestedQty;
              const touchedSerialNos = [];

              const consumeNext = (index) => {
                if (remainingToTake <= 0) return finalizeMovement(movementId, touchedSerialNos);
                const row = rows[index];
                if (!row) return rollbackWith(400, "Unable to allocate requested quantity");

                const availableQty = Number(row.remaining_qty) || 0;
                const initialQty = Number(row.initial_qty) || convInt;
                const usedQty = Math.min(availableQty, remainingToTake);
                const newRemaining = availableQty - usedQty;
                const nextStatus = newRemaining <= 0 ? "consumed" : newRemaining < initialQty ? "partial" : "available";

                db.run(
                  "UPDATE spare_part_items SET remaining_qty = ?, status = ?, last_used_at = CURRENT_TIMESTAMP WHERE id = ?",
                  [newRemaining, nextStatus, row.id],
                  (updateErr) => {
                    if (updateErr) return rollbackWith(500, updateErr.message);
                    insertMovementItem(movementId, row.id, usedQty, availableQty, newRemaining, (linkErr) => {
                      if (linkErr) return rollbackWith(500, linkErr.message);
                      touchedSerialNos.push(`${row.serial_no} (${usedQty})`);
                      remainingToTake -= usedQty;
                      consumeNext(index + 1);
                    });
                  }
                );
              };

              consumeNext(0);
            }
          );
        };

        const restorePackUsage = (movementId) => {
          db.all(
            `SELECT id, serial_no, initial_qty, remaining_qty
             FROM spare_part_items
             WHERE part_id = ? AND COALESCE(remaining_qty, 0) < COALESCE(initial_qty, 1)
             ORDER BY CASE WHEN status = 'partial' THEN 0 ELSE 1 END, COALESCE(last_used_at, '') DESC, id DESC`,
            [part_id],
            (itemsErr, rows) => {
              if (itemsErr) return rollbackWith(500, itemsErr.message);
              const capacity = rows.reduce((sum, row) => sum + ((Number(row.initial_qty) || convInt) - (Number(row.remaining_qty) || 0)), 0);
              if (capacity < requestedQty) {
                return rollbackWith(400, "Return quantity exceeds consumed SP no stock");
              }

              let remainingToRestore = requestedQty;
              const touchedSerialNos = [];

              const restoreNext = (index) => {
                if (remainingToRestore <= 0) return finalizeMovement(movementId, touchedSerialNos);
                const row = rows[index];
                if (!row) return rollbackWith(400, "Unable to restore requested quantity");

                const initialQty = Number(row.initial_qty) || convInt;
                const currentQty = Number(row.remaining_qty) || 0;
                const space = initialQty - currentQty;
                const restoredQty = Math.min(space, remainingToRestore);
                const newRemaining = currentQty + restoredQty;
                const nextStatus = newRemaining >= initialQty ? "available" : "partial";

                db.run(
                  "UPDATE spare_part_items SET remaining_qty = ?, status = ?, last_used_at = CURRENT_TIMESTAMP WHERE id = ?",
                  [newRemaining, nextStatus, row.id],
                  (updateErr) => {
                    if (updateErr) return rollbackWith(500, updateErr.message);
                    insertMovementItem(movementId, row.id, restoredQty, currentQty, newRemaining, (linkErr) => {
                      if (linkErr) return rollbackWith(500, linkErr.message);
                      touchedSerialNos.push(`${row.serial_no} (+${restoredQty})`);
                      remainingToRestore -= restoredQty;
                      restoreNext(index + 1);
                    });
                  }
                );
              };

              restoreNext(0);
            }
          );
        };

        const moveSql = `INSERT INTO stock_movements (part_id, movement_type, quantity, department, receiver, receipt_number, note, user_id, due_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        db.run(moveSql, [part_id, movement_type, requestedQty, department, receiver, receipt_number, note, userId, due_date || null], function(err) {
          if (err) return rollbackWith(500, err.message);
          const movementId = this.lastID;

          if (movement_type === "IN" && new_serials && new_serials.length > 0) {
            const itemQty = isPackUnit ? convInt : 1;
            let insertIndex = 0;
            const insertNext = () => {
              if (insertIndex >= new_serials.length) return finalizeMovement(movementId, new_serials);
              const serialNo = new_serials[insertIndex];
              insertOrGetSparePartItem(part_id, serialNo, itemQty, (insertErr, result) => {
                if (insertErr) return rollbackWith(500, insertErr.message);
                if (!result?.created) {
                  insertIndex += 1;
                  return insertNext();
                }
                insertMovementItem(movementId, result.itemId, itemQty, 0, itemQty, (linkErr) => {
                  if (linkErr) return rollbackWith(500, linkErr.message);
                  insertIndex += 1;
                  insertNext();
                });
              });
            };
            return insertNext();
          }

          if (isPackUnit && (movement_type === "OUT" || movement_type === "BORROW")) {
            return allocatePackUsage(movementId);
          }

          if (isPackUnit && movement_type === "RETURN") {
            return restorePackUsage(movementId);
          }

          if (serial_ids && serial_ids.length > 0) {
            const nextStatus = movement_type === "RETURN" ? "available" : "consumed";
            const nextRemaining = movement_type === "RETURN" ? 1 : 0;
            let itemIndex = 0;
            const touchedSerialNos = [];

            const updateNext = () => {
              if (itemIndex >= serial_ids.length) return finalizeMovement(movementId, touchedSerialNos);
              const itemId = serial_ids[itemIndex];
              db.get("SELECT serial_no, COALESCE(remaining_qty, 1) AS remaining_qty FROM spare_part_items WHERE id = ?", [itemId], (rowErr, row) => {
                if (rowErr) return rollbackWith(500, rowErr.message);
                const beforeQty = Number(row?.remaining_qty) || 0;
                db.run(
                  "UPDATE spare_part_items SET status = ?, remaining_qty = ?, last_used_at = CURRENT_TIMESTAMP WHERE id = ?",
                  [nextStatus, nextRemaining, itemId],
                  (updateErr) => {
                    if (updateErr) return rollbackWith(500, updateErr.message);
                    insertMovementItem(movementId, itemId, 1, beforeQty, nextRemaining, (linkErr) => {
                      if (linkErr) return rollbackWith(500, linkErr.message);
                      if (row?.serial_no) touchedSerialNos.push(row.serial_no);
                      itemIndex += 1;
                      updateNext();
                    });
                  }
                );
              });
            };
            return updateNext();
          }

          return finalizeMovement(movementId, []);
        });
      });
    }
  );
});

// API สำหรับโอนย้ายคลัง
app.post("/spareparts/transfer", authenticateToken, (req, res) => {
  const { part_id, target_warehouse_id, quantity, note } = req.body;
  const userId = req.user.userId;
  const transferQty = Math.max(0, Number(quantity) || 0);

  if (!transferQty) {
    return res.status(400).json({ error: "Invalid quantity" });
  }

  db.serialize(() => {
    db.run("BEGIN TRANSACTION");

    db.get("SELECT * FROM spare_parts WHERE id = ?", [part_id], (partErr, part) => {
      if (partErr) {
        db.run("ROLLBACK");
        return res.status(500).json({ error: partErr.message });
      }
      if (!part) {
        db.run("ROLLBACK");
        return res.status(404).json({ error: "Part not found" });
      }

      const conversionRate = Math.max(1, Number(part.conversion_rate) || 1);
      const pieceDelta = (part.unit_type === "box" || part.unit_type === "pack")
        ? Math.round(transferQty * conversionRate)
        : transferQty;

      db.run(
        `UPDATE spare_parts
         SET quantity = quantity - ?,
             piece_stock = CASE
               WHEN COALESCE(piece_stock, quantity) - ? < 0 THEN 0
               ELSE COALESCE(piece_stock, quantity) - ?
             END
         WHERE id = ?`,
        [transferQty, pieceDelta, pieceDelta, part_id],
        (updateErr) => {
          if (updateErr) {
            db.run("ROLLBACK");
            return res.status(500).json({ error: updateErr.message });
          }

          db.get(
            "SELECT * FROM spare_parts WHERE part_no = ? AND warehouseId = ?",
            [part.part_no, target_warehouse_id],
            (targetErr, targetPart) => {
              if (targetErr) {
                db.run("ROLLBACK");
                return res.status(500).json({ error: targetErr.message });
              }

              const onTransferSaved = (saveErr) => {
                if (saveErr) {
                  db.run("ROLLBACK");
                  return res.status(500).json({ error: saveErr.message });
                }

                db.run("COMMIT");

                db.get("SELECT name FROM warehouses WHERE id = ?", [target_warehouse_id], (wErr, targetWarehouse) => {
                  if (!wErr) {
                    sendTeamsNotification({
                      type: "TRANSFER",
                      partName: part.name,
                      quantity: transferQty,
                      user: req.user?.username || "System",
                      warehouse: targetWarehouse?.name || String(target_warehouse_id),
                      note: note || "-"
                    });
                  }
                });

                logActivity(userId, "TRANSFER", `Transferred ${transferQty} of ${part.part_no} to warehouse ${target_warehouse_id}`);
                res.json({ message: "Transfer completed" });
              };

              if (targetPart) {
                db.run(
                  "UPDATE spare_parts SET quantity = quantity + ?, piece_stock = COALESCE(piece_stock, quantity) + ? WHERE id = ?",
                  [transferQty, pieceDelta, targetPart.id],
                  onTransferSaved
                );
                return;
              }

              db.run(
                `INSERT INTO spare_parts (part_no, name, description, quantity, unit_type, conversion_rate, piece_stock, price, warehouseId)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [part.part_no, part.name, part.description, transferQty, part.unit_type || "piece", conversionRate, pieceDelta, part.price, target_warehouse_id],
                onTransferSaved
              );
            }
          );
        }
      );
    });
  });
});

// API สำหรับส่งออก CSV
app.get("/export/inventory", authenticateToken, (req, res) => {
  const warehouseId = req.query.warehouseId;
  let sql = `SELECT p.part_no, p.name, p.description, p.quantity, p.price, w.name AS warehouse
             FROM spare_parts p
             LEFT JOIN warehouses w ON p.warehouseId = w.id`;
  const params = [];

  if (warehouseId && warehouseId !== "all") {
    sql += " WHERE p.warehouseId = ?";
    params.push(warehouseId);
  }

  sql += " ORDER BY p.id DESC";

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    const escapeCsv = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const headers = ["Part No", "Name", "Description", "Quantity", "Price", "Warehouse"];
    const csvRows = (rows || []).map((r) => [
      escapeCsv(r.part_no),
      escapeCsv(r.name),
      escapeCsv(r.description),
      escapeCsv(r.quantity),
      escapeCsv(r.price),
      escapeCsv(r.warehouse)
    ].join(","));
    const csvContent = "\ufeff" + [headers.join(","), ...csvRows].join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=inventory.csv");
    res.send(csvContent);
  });
});

app.get("/export/movements", authenticateToken, (req, res) => {
  const sql = `SELECT m.movement_date, m.movement_type, p.name, p.part_no, m.quantity, m.department, m.receiver, m.note 
               FROM stock_movements m JOIN spare_parts p ON m.part_id = p.id ORDER BY m.movement_date DESC`;
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    
    const headers = ["Date", "Type", "Part Name", "Part No", "Qty", "Dept", "Receiver", "Note"];
    const csvRows = rows.map(r => [r.movement_date, r.movement_type, r.name, r.part_no, r.quantity, r.department, r.receiver, r.note].join(","));
    const csvContent = "\ufeff" + [headers.join(","), ...csvRows].join("\n");
    
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=movements.csv");
    res.send(csvContent);
  });
});

// จับ Error กรณีไม่พบ Path
app.use((req, res) => {
  res.status(404).json({ error: "Path not found" });
});

// --- 6. START SERVER (กัน Process หลุด) ---
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n-----------------------------------------`);
  console.log(`🚀 SERVER IS LIVE WITH FULL APIS!`);
  console.log(`🔗 URL: http://localhost:${PORT}`);
  console.log(`-----------------------------------------`);
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log(`PORT ${PORT} is already in use. Server already running.`);
    process.exit(0);
    return;
  }
  console.log("Server start failed:", e.message);
  process.exit(1);
});
process.stdin.resume();