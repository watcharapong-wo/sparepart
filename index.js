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
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { sendTeamsNotification } = require('./teams_notifier');

const app = express();
const PORT = 4003;
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

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

// Log all requests (Moved to top)
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// ใช้ Middleware
app.use(cors());
app.use(express.json());

// --- Static File Serving ---
app.use(express.static("."));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});
// ---------------------------

// เปิดฐานข้อมูล
const dbPath = path.join(__dirname, "sparepart.db");
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error(err.message);
  else console.log("DB opened at " + dbPath);
});

// สร้างตารางอะไหล่, ผู้ใช้, และคลัง
db.run(
  `CREATE TABLE IF NOT EXISTS spare_parts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    part_no TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    quantity INTEGER NOT NULL,
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

  // [NEW] Table สำหรับเก็บค่าคอนฟิกของระบบ (เช่น วันที่ส่งแจ้งเตือนล่าสุด)
  db.run(`CREATE TABLE IF NOT EXISTS system_config (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);

// [NEW] ฟังก์ชันสำหรับรัน Automation รายวัน (เช่น ส่ง Reminder ตอน 8 โมงเช้า)
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
          
          // เรียกใช้ Logic เดียวกับ API /report/send-reminders
          triggerOverdueReminders();

          // บันทึกว่าวันนี้รันไปแล้ว
          db.run("INSERT OR REPLACE INTO system_config (key, value) VALUES ('last_overdue_remind_date', ?)", [todayStr]);
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
      AND m.due_date < date('now')
  `;

  db.all(sql, [], (err, rows) => {
    if (err) return console.error("Trigger reminders error:", err);
    if (rows.length === 0) return console.log("[Automation] No overdue items found.");

    const { sendTeamsNotification } = require('./teams_notifier');
    rows.forEach(row => {
      sendTeamsNotification({
        type: 'REMINDER',
        partName: row.part_name,
        qty: row.quantity,
        warehouse: row.warehouse_name,
        user: row.receiver || 'Unknown',
        spNo: row.serial_no || '-',
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
    status TEXT DEFAULT 'available', -- 'available', 'out', 'borrowed'
    FOREIGN KEY (part_id) REFERENCES spare_parts(id)
  )`
);

db.run(
  `CREATE TABLE IF NOT EXISTS movement_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    movement_id INTEGER NOT NULL,
    item_id INTEGER NOT NULL,
    FOREIGN KEY (movement_id) REFERENCES stock_movements(id),
    FOREIGN KEY (item_id) REFERENCES spare_part_items(id)
  )`,
  (err) => {
    if (err) console.error("Create movement_items table error:", err.message);
    else seedData();
  }
);

// Helper function to log activity
function logActivity(userId, action, details) {
  const sql = "INSERT INTO activity_logs (user_id, action, details) VALUES (?, ?, ?)";
  db.run(sql, [userId, action, details || null], (err) => {
    if (err) console.error("Logging error:", err.message);
  });
}

// Middleware ตรวจ token และ role

// Seed Data function
function seedData() {
  console.log("--- SEEDING START ---");
  // Seed Warehouses
  db.get("SELECT COUNT(*) as count FROM warehouses", (err, row) => {
    if (err) return console.error("Error checking warehouses:", err.message);
    if (row && row.count === 0) {
      console.log("Seeding warehouses LPN1, LPN2...");
      db.run("INSERT INTO warehouses (name, location) VALUES ('LPN1', 'Building A')");
      db.run("INSERT INTO warehouses (name, location) VALUES ('LPN2', 'Building B')");
    } else {
      console.log("Warehouses exist:", row ? row.count : 0);
    }
  });

  // Seed Reasons
  db.get("SELECT COUNT(*) as count FROM movement_reasons", (err, row) => {
    if (err) return console.error("Error checking reasons:", err.message);
    if (row && row.count === 0) {
      console.log("Seeding movement_reasons...");
      db.run("INSERT INTO movement_reasons (name) VALUES ('LPN1')");
      db.run("INSERT INTO movement_reasons (name) VALUES ('LPN2')");
    } else {
      console.log("Reasons exist:", row ? row.count : 0);
    }
  });

  // Seed Admin User
  db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
    if (err) return console.error("Error checking users:", err.message);
    if (row && row.count === 0) {
      console.log("Seeding default admin...");
      bcrypt.hash("admin123", 10, (err, hashedPassword) => {
        if (!err) {
          db.run("INSERT INTO users (username, password, role) VALUES (?, ?, ?)", ["admin", hashedPassword, "admin"]);
        }
      });
    }
  });
}

// Seed Data function (called after tables ready)

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

// API Register (Admin only)
app.post("/register", authenticateToken, requireRole(["admin"]), (req, res) => {
  const { username, password, role } = req.body;

  bcrypt.hash(password, 10, (err, hashedPassword) => {
    if (err) return res.status(500).json({ error: err.message });

    db.run(
      "INSERT INTO users (username, password, role) VALUES (?, ?, ?)",
      [username, hashedPassword, role],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        logActivity(req.user.userId, "REGISTER_USER", `Registered new user: ${username} with role: ${role}`);
        res.status(201).json({ message: "User registered successfully!" });
      }
    );
  });
});

// API Login
app.post("/login", (req, res) => {
  console.log("POST /login req.body:", req.body); // Debug log
  const { username, password } = req.body;

  db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(404).json({ error: "User not found" });

    bcrypt.compare(password, user.password, (err, isMatch) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!isMatch) return res.status(401).json({ error: "Invalid credentials" });

      const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: "10h" });
      logActivity(user.id, "LOGIN", `User ${user.username} logged in`);
      res.json({ token, role: user.role });
    });
  });
});

// API Get All Users (Admin only)
app.get("/users", authenticateToken, requireRole(["admin"]), (req, res) => {
  db.all("SELECT id, username, role FROM users", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// API Reset User Password (Admin only)
app.put("/users/:id/reset-password", authenticateToken, requireRole(["admin"]), (req, res) => {
  const { id } = req.params;
  const { password } = req.body;

  if (!password) return res.status(400).json({ error: "PASSWORD_REQUIRED" });

  bcrypt.hash(password, 10, (err, hashedPassword) => {
    if (err) return res.status(500).json({ error: err.message });

    db.run(
      "UPDATE users SET password = ? WHERE id = ?",
      [hashedPassword, id],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: "USER_NOT_FOUND" });
        res.json({ message: "Password reset successfully!" });
      }
    );
  });
});

// API Delete User (Admin only)
app.delete("/users/:id", authenticateToken, requireRole(["admin"]), (req, res) => {
  const { id } = req.params;

  // Prevent admin from deleting themselves (optional but recommended)
  if (parseInt(id) === req.user.userId) {
    return res.status(400).json({ error: "CANNOT_DELETE_SELF" });
  }

  db.run("DELETE FROM users WHERE id = ?", [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: "USER_NOT_FOUND" });
    res.json({ message: "User deleted successfully" });
  });
});

// รายงานมูลค่าคงคลัง
app.get("/report/value", authenticateToken, (req, res) => {
  const warehouseId = req.query.warehouseId;
  let sql = "SELECT SUM(quantity * price) AS stock_value FROM spare_parts";
  const params = [];
  
  if (warehouseId && warehouseId !== 'all') {
    sql += " WHERE warehouseId = ?";
    params.push(warehouseId);
  }

  db.all(sql, params, (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row);
  });
});

// รายงานสต็อกอะไหล่ที่ quantity < 10
app.get("/report/stock", authenticateToken, requireRole(["admin", "co-admin", "staff", "viewer"]), (req, res) => {
  db.all("SELECT * FROM spare_parts WHERE quantity < 10", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// รายงานอะไหล่ที่มีปริมาณ < 10
app.get("/report/low-stock", authenticateToken, requireRole(["admin", "co-admin", "staff", "viewer"]), (req, res) => {
  const warehouseId = req.query.warehouseId;
  let sql = "SELECT * FROM spare_parts WHERE quantity < 10";
  const params = [];

  if (warehouseId && warehouseId !== 'all') {
    sql += " AND warehouseId = ?";
    params.push(warehouseId);
  }

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// รายงานการเคลื่อนไหวของสต็อก
app.get("/report/movements", authenticateToken, requireRole(["admin", "co-admin", "staff", "viewer"]), (req, res) => {
  db.all("SELECT * FROM stock_movements ORDER BY movement_date DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// รายงาน movements แบบ JOIN (แสดงชื่ออะไหล่ + part_no + warehouseId)
app.get("/report/movements2", authenticateToken, requireRole(["admin", "co-admin", "staff", "viewer"]), (req, res) => {
  const sql = `
    SELECT 
      m.id,
      m.movement_date,
      m.movement_type,
      m.quantity,
      m.note,
      p.id AS part_id,
      p.part_no,
      p.name AS part_name,
      p.warehouseId
    FROM stock_movements m
    JOIN spare_parts p ON p.id = m.part_id
    ORDER BY m.movement_date DESC, m.id DESC
  `;
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// รายงานประวัติการเคลื่อนไหวของสต็อก (movements3)
app.get("/report/activity-logs", authenticateToken, requireRole(["admin"]), (req, res) => {
  const { startDate, endDate, search } = req.query;
  let sql = `
    SELECT 
      l.id, l.user_id, l.action, l.details,
      strftime('%Y-%m-%dT%H:%M:%SZ', l.timestamp) as timestamp,
      u.username,
      u.role
    FROM activity_logs l
    LEFT JOIN users u ON u.id = l.user_id
    WHERE 1=1
  `;
  const params = [];

  if (startDate) {
    sql += " AND l.timestamp >= ?";
    params.push(startDate + " 00:00:00");
  }
  if (endDate) {
    sql += " AND l.timestamp <= ?";
    params.push(endDate + " 23:59:59");
  }
  if (search) {
    sql += " AND (l.action LIKE ? OR l.details LIKE ? OR u.username LIKE ?)";
    const searchParam = `%${search}%`;
    params.push(searchParam, searchParam, searchParam);
  }

  sql += " ORDER BY l.timestamp DESC LIMIT 500";

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// รายงานความเคลื่อนไหวล่าสุด (30 วัน)
app.get("/report/movements3", authenticateToken, requireRole(["admin", "co-admin", "staff", "viewer"]), (req, res) => {
  const warehouseId = req.query.warehouseId;
  let sql = `
    SELECT 
      m.*, 
      p.name as part_name, 
      p.part_no, 
      u.username
    FROM stock_movements m
    JOIN spare_parts p ON m.part_id = p.id
    LEFT JOIN users u ON m.user_id = u.id
    WHERE m.movement_date >= date('now', '-30 days')
  `;
  const params = [];

  if (warehouseId && warehouseId !== 'all') {
    sql += " AND p.warehouseId = ?";
    params.push(warehouseId);
  }

  sql += " ORDER BY m.movement_date DESC";

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// รายงานสรุปยอดเบิกรายแผนก
app.get("/report/out-by-dept", authenticateToken, requireRole(["admin", "co-admin", "staff", "viewer"]), (req, res) => {
  const sql = `
    SELECT department, COUNT(*) AS tx, SUM(quantity) AS total_qty
    FROM stock_movements
    WHERE movement_type = 'OUT'
      AND department IS NOT NULL
      AND TRIM(department) <> ''
    GROUP BY department
    ORDER BY total_qty DESC
  `;
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// [NEW] รายงานมูลค่าคลังแยกตามคลังสินค้า
app.get("/report/value-by-warehouse", authenticateToken, (req, res) => {
  const sql = `
    SELECT w.name AS warehouse_name, SUM(p.quantity * p.price) AS total_value
    FROM spare_parts p
    JOIN warehouses w ON p.warehouseId = w.id
    GROUP BY w.name
  `;
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// [NEW] รายงานค่าใช้จ่ายแยกตามคลังสินค้า (รายการเบิกออก OUT)
app.get("/report/expense-by-warehouse", authenticateToken, (req, res) => {
  const warehouseId = req.query.warehouseId;
  let sql = `
    SELECT w.name AS warehouse_name, SUM(m.quantity * p.price) AS total_expense, SUM(m.quantity) AS total_qty
    FROM stock_movements m
    JOIN spare_parts p ON m.part_id = p.id
    JOIN warehouses w ON p.warehouseId = w.id
    WHERE m.movement_type = 'OUT'
  `;
  const params = [];

  if (warehouseId && warehouseId !== 'all') {
    sql += " AND p.warehouseId = ?";
    params.push(warehouseId);
  }

  sql += " GROUP BY w.name";

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get("/report/movement-trends", authenticateToken, (req, res) => {
  const warehouseId = req.query.warehouseId;
  let sql = `
    SELECT 
      date(movement_date) as date,
      movement_type,
      SUM(m.quantity) as total_qty
    FROM stock_movements m
    JOIN spare_parts p ON m.part_id = p.id
    WHERE m.movement_date >= date('now', '-7 days')
  `;
  const params = [];

  if (warehouseId && warehouseId !== 'all') {
    sql += " AND p.warehouseId = ?";
    params.push(warehouseId);
  }

  sql += " GROUP BY date(m.movement_date), m.movement_type";

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get("/report/monthly-comparison", authenticateToken, (req, res) => {
  const warehouseId = req.query.warehouseId;
  let sql = `
    SELECT 
      strftime('%Y-%m', m.movement_date) as month,
      m.movement_type,
      SUM(m.quantity) as total_qty
    FROM stock_movements m
    JOIN spare_parts p ON m.part_id = p.id
    WHERE m.movement_date >= date('now', '-6 months')
  `;
  const params = [];

  if (warehouseId && warehouseId !== 'all') {
    sql += " AND p.warehouseId = ?";
    params.push(warehouseId);
  }

  sql += " GROUP BY month, m.movement_type";

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// [NEW] รายงานการเบิกแยกตามบัญชีผู้รับ (Receiver)
app.get("/report/withdraw-by-account", authenticateToken, (req, res) => {
  const warehouseId = req.query.warehouseId;
  let sql = `
    SELECT 
      m.receiver,
      SUM(m.quantity) as total_qty
    FROM stock_movements m
    JOIN spare_parts p ON m.part_id = p.id
    WHERE m.movement_type IN ('OUT', 'BORROW')
      AND m.receiver IS NOT NULL
      AND TRIM(m.receiver) <> ''
  `;
  const params = [];

  if (warehouseId && warehouseId !== 'all') {
    sql += " AND p.warehouseId = ?";
    params.push(warehouseId);
  }

  sql += " GROUP BY m.receiver ORDER BY total_qty DESC LIMIT 10";

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// เพิ่มฟิลด์ warehouseId ในตาราง spare_parts (ถ้ายังไม่มี)
db.all("PRAGMA table_info(spare_parts)", [], (err, cols) => {
  if (err) return console.error("PRAGMA error:", err.message);

  const hasWarehouseId = cols.some((c) => c.name === "warehouseId");
  if (hasWarehouseId) return; // มีแล้ว ไม่ต้องทำอะไร

  db.run("ALTER TABLE spare_parts ADD COLUMN warehouseId INTEGER", (err2) => {
    if (err2) console.error("Add warehouseId column error:", err2.message);
    else console.log("warehouseId column added");
  });
});

// API สำหรับดึงอะไหล่ทั้งหมด
app.get("/spareparts", authenticateToken, requireRole(["admin", "co-admin", "staff", "viewer"]), (req, res) => {
  const sql = `
    SELECT p.*, w.name AS warehouse_name 
    FROM spare_parts p
    LEFT JOIN warehouses w ON p.warehouseId = w.id
    ORDER BY p.id DESC
  `;
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// API สำหรับเพิ่มอะไหล่
app.post(
  "/spareparts",
  authenticateToken,
  requireRole(["admin", "co-admin"]),
  (req, res) => {
    const { part_no, name, description = null, quantity, price = null, warehouseId, serials = [] } = req.body;

    if (!part_no || !name || !Number.isInteger(quantity)) {
      return res.status(400).json({ error: "BAD_REQUEST" });
    }

    const incomingSerials = Array.isArray(serials) ? serials.map(s => s.trim()).filter(s => s !== "") : [];

    // Check for duplicates in DB
    if (incomingSerials.length > 0) {
      const placeholders = incomingSerials.map(() => "?").join(",");
      db.get(`SELECT serial_no FROM spare_part_items WHERE serial_no IN (${placeholders})`, incomingSerials, (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (row) {
          return res.status(409).json({ error: "DUPLICATE_SERIAL", serial: row.serial_no });
        }
        proceedToInsert();
      });
    } else {
      proceedToInsert();
    }

    function proceedToInsert() {
      db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        
        const insertPartSql = `INSERT INTO spare_parts (part_no, name, description, quantity, price, warehouseId) VALUES (?, ?, ?, ?, ?, ?)`;
        db.run(insertPartSql, [String(part_no), String(name), description, quantity, price, warehouseId], function (err) {
          if (err) {
            db.run("ROLLBACK");
            return res.status(500).json({ error: err.message });
          }
          
          const partId = this.lastID;

          if (incomingSerials.length > 0) {
            const itemSql = `INSERT INTO spare_part_items (part_id, serial_no, status) VALUES (?, ?, 'available')`;
            const stmt = db.prepare(itemSql);
            incomingSerials.forEach(sn => {
              stmt.run([partId, sn]);
            });
            stmt.finalize();
          }

          db.run("COMMIT", (err2) => {
            if (err2) {
              db.run("ROLLBACK");
              return res.status(500).json({ error: err2.message });
            }
            logActivity(req.user.userId, "CREATE_PART", `Created part: ${part_no} - ${name} with quantity: ${quantity} (${incomingSerials.length} serials)`);
            
            console.log(`[TEAMS-DEBUG] Starting notification for New Part: ${name}, warehouseId: ${warehouseId}`);
            // [TEAM NOTIFICATION]
            db.get("SELECT name FROM warehouses WHERE id = ?", [warehouseId], (errW, wh) => {
              if (errW) console.error('[TEAMS-DEBUG] Warehouse lookup error:', errW);
              console.log(`[TEAMS-DEBUG] Warehouse found: ${wh ? wh.name : 'NONE'}`);
              
              try {
                sendTeamsNotification({
                  type: 'NEW',
                  partName: name,
                  quantity: quantity,
                  user: req.user.username || 'System',
                  receiver: '-',
                  department: '-',
                  warehouse: wh ? wh.name : '-',
                  serialNos: incomingSerials.join(', '),
                  note: description || '-'
                });
                console.log('[TEAMS-DEBUG] sendTeamsNotification called successfully');
              } catch (notifErr) {
                console.error('[TEAMS-DEBUG] sendTeamsNotification threw error:', notifErr);
              }
            });

            res.status(201).json({ id: partId });
          });
        });
      });
    }
  }
);

// API GET available serials for a part
app.get("/spareparts/:id/serials", authenticateToken, (req, res) => {
  const { id } = req.params;
  db.all("SELECT * FROM spare_part_items WHERE part_id = ? AND status = 'available'", [id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// [TEMP] Cleanup endpoint for IDs 16-292
app.get("/spareparts-cleanup", (req, res) => {
  db.run("DELETE FROM spare_parts WHERE id BETWEEN 16 AND 292", function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: "Deleted " + this.changes + " rows" });
  });
});

// [NEW] API สำหรับเพิ่มอะไหล่จำนวนมาก (Bulk Import)
app.post(
  "/spareparts/bulk",
  authenticateToken,
  requireRole(["admin", "co-admin"]),
  (req, res) => {
    const { parts } = req.body;
    if (!Array.isArray(parts) || parts.length === 0) {
      return res.status(400).json({ error: "Parts must be an array and not empty" });
    }

    // ดึงข้อมูลคลังสินค้าเพื่อทำ Mapping ชื่อเป็น ID
    db.all("SELECT id, name FROM warehouses", [], (err, warehouses) => {
      if (err) return res.status(500).json({ error: err.message });

      const warehouseMap = {};
      warehouses.forEach(w => warehouseMap[w.name.toLowerCase()] = w.id);

      db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        const stmt = db.prepare(`
          INSERT INTO spare_parts (part_no, name, description, quantity, price, warehouseId)
          VALUES (?, ?, ?, ?, ?, ?)
        `);

        let count = 0;
        try {
          parts.forEach(p => {
            let wId = p.warehouseId;
            if (!wId && p.warehouse_name) {
              wId = warehouseMap[p.warehouse_name.toLowerCase()];
            }
            // ถ้าไม่มีคลังสินค้าตามที่ระบุ ให้ใช้คลังแรกเป็น default (ถ้ามี)
            if (!wId && warehouses.length > 0) wId = warehouses[0].id;

            stmt.run([
              String(p.part_no || ""),
              String(p.name || ""),
              p.description || null,
              p.quantity || 0,
              p.price || 0,
              wId || null
            ]);
            count++;
          });
          stmt.finalize();
          db.run("COMMIT", (err2) => {
            if (err2) {
              db.run("ROLLBACK");
              return res.status(500).json({ error: err2.message });
            }
            logActivity(req.user.userId, "BULK_CREATE_PART", `Bulk created ${count} parts via import`);
            res.status(201).json({ message: `Successfully imported ${count} parts`, count });
          });
        } catch (error) {
          db.run("ROLLBACK");
          res.status(500).json({ error: error.message });
        }
      });
    });
  }
);

// ปรับปรุงฐานข้อมูลอะไหล่ทั้งหมด (รองรับ Part No, Name, Desc, Price, Quantity)
app.put("/spareparts/:id", authenticateToken, requireRole(["admin", "co-admin"]), (req, res) => {
  const id = parseInt(req.params.id);
  const { part_no, name, description, quantity, price, warehouseId } = req.body;

  console.log(`Updating part ID ${id}:`, req.body);

  let updateFields = [];
  let params = [];

  if (part_no !== undefined) {
    updateFields.push("part_no = ?");
    params.push(String(part_no));
  }
  if (name !== undefined) {
    updateFields.push("name = ?");
    params.push(String(name));
  }
  if (description !== undefined) {
    updateFields.push("description = ?");
    params.push(description);
  }
  if (quantity !== undefined) {
    if (!Number.isInteger(quantity)) return res.status(400).json({ error: "INVALID_QUANTITY" });
    updateFields.push("quantity = ?");
    params.push(quantity);
  }
  if (price !== undefined) {
    updateFields.push("price = ?");
    params.push(price);
  }
  if (warehouseId !== undefined) {
    updateFields.push("warehouseId = ?");
    params.push(warehouseId);
  }

  if (updateFields.length === 0) {
    return res.status(400).json({ error: "NO_FIELDS_TO_UPDATE" });
  }

  params.push(id);
  const sql = `UPDATE spare_parts SET ${updateFields.join(", ")} WHERE id = ?`;

  db.run(sql, params, function (err) {
    if (err) {
      console.error("Update DB Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
    console.log(`Update success for ID ${id}, changes: ${this.changes}`);
    logActivity(req.user.userId, "UPDATE_PART", `Updated part ID ${id}: ${part_no || 'N/A'} - ${name || 'N/A'}`);
    res.json({ message: "Updated successfully", id, changes: this.changes });
  });
});

// ลบอะไหล่
app.delete("/spareparts/:id", authenticateToken, requireRole(["admin", "co-admin"]), (req, res) => {
  const id = req.params.id;

  db.serialize(() => {
    db.run("BEGIN TRANSACTION");
    // Delete associated serial items first
    db.run("DELETE FROM spare_part_items WHERE part_id = ?", [id], (err1) => {
      if (err1) {
        db.run("ROLLBACK");
        return res.status(500).json({ error: err1.message });
      }

      // Delete the part itself
      db.run("DELETE FROM spare_parts WHERE id = ?", [id], function (err2) {
        if (err2) {
          db.run("ROLLBACK");
          return res.status(500).json({ error: err2.message });
        }
        
        if (this.changes === 0) {
          db.run("ROLLBACK");
          return res.status(404).json({ error: "Spare part not found" });
        }

        db.run("COMMIT", (err3) => {
          if (err3) return res.status(500).json({ error: err3.message });
          logActivity(req.user.userId, "DELETE_PART", `Deleted part ID ${id} and its serials`);
          res.json({ message: "Spare part and its serials deleted successfully", id });
        });
      });
    });
  });
});



// GET all movement reasons
app.get("/reasons", authenticateToken, (req, res) => {
  db.all("SELECT * FROM movement_reasons ORDER BY name", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// POST new movement reason (Admin/Co-Admin)
app.post("/reasons", authenticateToken, requireRole(["admin", "co-admin"]), (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "NAME_REQUIRED" });
  db.run("INSERT INTO movement_reasons (name) VALUES (?)", [name], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ id: this.lastID, name });
  });
});

// DELETE movement reason (Admin/Co-Admin)
app.delete("/reasons/:id", authenticateToken, requireRole(["admin", "co-admin"]), (req, res) => {
  db.run("DELETE FROM movement_reasons WHERE id = ?", [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: "Deleted" });
  });
});

// GET warehouses ทั้งหมด
app.get("/warehouses", authenticateToken, requireRole(["admin", "co-admin", "staff", "viewer"]), (req, res) => {
  db.all("SELECT * FROM warehouses ORDER BY id", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// POST สร้างคลัง (admin เท่านั้น)
app.post("/warehouses", authenticateToken, requireRole(["admin", "co-admin"]), (req, res) => {
  const { name, location = null } = req.body;
  if (!name) return res.status(400).json({ error: "BAD_REQUEST" });

  db.run(
    "INSERT INTO warehouses (name, location) VALUES (?, ?)",
    [String(name), String(location)],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id: this.lastID, name, location });
    }
  );
});

// DELETE warehouse (Admin/Co-Admin)
app.delete("/warehouses/:id", authenticateToken, requireRole(["admin", "co-admin"]), (req, res) => {
  db.run("DELETE FROM warehouses WHERE id = ?", [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: "Deleted" });
  });
});

// API สำหรับบันทึกการเคลื่อนไหวของสต็อก
app.post(
  "/stock-movements",
  authenticateToken,
  requireRole(["admin", "co-admin", "staff"]),
  (req, res) => {
    const { part_id, movement_type, quantity, note, department, receiver, receipt_number, due_date, serial_ids = [], new_serials = [] } = req.body;

    const dep = (department || "").trim();
    const receipt_no = (receipt_number || "").trim();
    const rec = (receiver || "").trim();
    const noteStr = (note || "").trim();
    const dd  = (due_date || "").trim();

    if (movement_type === "IN") {
      if (!["admin", "co-admin"].includes(req.user.role)) {
        return res.status(403).json({ error: "FORBIDDEN_ACTION_FOR_ROLE" });
      }
    }
  
    const validTypes = ["IN", "OUT", "BORROW", "RETURN"];
    if (!part_id || !movement_type || !validTypes.includes(movement_type) || !Number.isInteger(quantity)) {
      return res.status(400).json({ error: "BAD_REQUEST" });
    }

    if (["OUT", "BORROW", "RETURN"].includes(movement_type)) {
      if (!dep || !rec || !receipt_no) return res.status(400).json({ error: "FIELDS_REQUIRED" });
    }

    const new_serials_arr = Array.isArray(new_serials) ? new_serials.map(s => s.trim()).filter(s => s !== "") : [];

    if (movement_type === "IN" && new_serials_arr.length > 0) {
      const placeholders = new_serials_arr.map(() => "?").join(",");
      db.all(`SELECT serial_no FROM spare_part_items WHERE serial_no IN (${placeholders})`, new_serials_arr, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        if (rows && rows.length > 0) {
          return res.status(409).json({ error: "DUPLICATE_SERIAL", serials: rows.map(row => row.serial_no) });
        }
        proceedToMovement();
      });
    } else {
      proceedToMovement();
    }

    function proceedToMovement() {
      db.serialize(() => {
        db.run("BEGIN IMMEDIATE TRANSACTION");
    
        db.get(
          "SELECT p.*, w.name AS warehouse_name FROM spare_parts p LEFT JOIN warehouses w ON p.warehouseId = w.id WHERE p.id = ?",
          [part_id],
          (err, part) => {
          if (err || !part) return db.run("ROLLBACK", () => res.status(404).json({ error: "PART_NOT_FOUND" }));
    
          const current = part.quantity;
          let newQty = current;
    
          if (movement_type === "IN" || movement_type === "RETURN") {
            newQty = current + quantity;
          } else if (movement_type === "OUT" || movement_type === "BORROW") {
            if (current < quantity) return db.run("ROLLBACK", () => res.status(400).json({ error: "INSUFFICIENT_STOCK" }));
            newQty = current - quantity;
          }

          db.run(
            `INSERT INTO stock_movements
             (part_id, movement_type, quantity, note, department, receiver, receipt_number, user_id, due_date, return_status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [part_id, movement_type, quantity, noteStr || null, dep || null, rec || null, receipt_no || null, req.user.userId, dd || null, movement_type === "BORROW" ? "pending" : null],
            function (err2) {
              if (err2) return db.run("ROLLBACK", () => res.status(500).json({ error: err2.message }));
              
              const movementId = this.lastID;

              // Function to finalize transaction after all items are processed
              const finalizeAll = () => {
                db.run("UPDATE spare_parts SET quantity = ? WHERE id = ?", [newQty, part_id], (err3) => {
                  if (err3) return db.run("ROLLBACK", () => res.status(500).json({ error: err3.message }));
                  
                  // Get Serial numbers for this movement to display in notification
                  const getSerialsSql = `
                    SELECT serial_no 
                    FROM spare_part_items 
                    JOIN movement_items ON spare_part_items.id = movement_items.item_id
                    WHERE movement_items.movement_id = ?
                  `;
                  
                  db.all(getSerialsSql, [movementId], (errS, serialRows) => {
                    const serialsStr = (serialRows || []).map(r => r.serial_no).join(', ');

                    db.run("COMMIT", () => {
                      logActivity(req.user.userId, "STOCK_MOVEMENT", `${movement_type}: ${quantity} units for part ID ${part_id}. Receiver: ${rec}, Request: ${receipt_no}`);

                      // [TEAM NOTIFICATION]
                      sendTeamsNotification({
                        type: movement_type,
                        partName: part.name,
                        quantity: quantity,
                        user: req.user.username || 'System',
                        receiver: rec,
                        department: dep,
                        warehouse: part.warehouse_name,
                        serialNos: serialsStr || '-',
                        note: noteStr || '-'
                      });

                      // [LOW STOCK ALERT]
                      if (["OUT", "BORROW"].includes(movement_type) && newQty < 3) {
                        sendTeamsNotification({
                          type: 'LOW_STOCK',
                          partName: part.name,
                          quantity: newQty, // Show remaining quantity
                          user: req.user.username || 'System',
                          receiver: rec,
                          department: dep,
                          warehouse: part.warehouse_name,
                          serialNos: '-',
                          note: `Stock is low! Remaining: ${newQty}`
                        });
                      }

                      res.status(201).json({ message: "OK", movement_id: movementId, newQty });
                    });
                  });
                });
              };

              let pending = 0;
              const checkDone = () => {
                pending--;
                if (pending === 0) finalizeAll();
              };

              // Process Serial IDs (OUT/BORROW/RETURN)
              if (Array.isArray(serial_ids) && serial_ids.length > 0) {
                pending += serial_ids.length;
                const newStat = movement_type === "BORROW" ? "borrowed" : (movement_type === "OUT" ? "out" : "available");
                serial_ids.forEach(sid => {
                  db.run(`UPDATE spare_part_items SET status = ? WHERE id = ?`, [newStat, sid], () => {
                    db.run(`INSERT INTO movement_items (movement_id, item_id) VALUES (?, ?)`, [movementId, sid], checkDone);
                  });
                });
              }

              // Process New Serials (IN)
              if (movement_type === "IN" && new_serials_arr.length > 0) {
                pending += new_serials_arr.length;
                new_serials_arr.forEach(sn => {
                  db.run(`INSERT INTO spare_part_items (part_id, serial_no, status) VALUES (?, ?, 'available')`, [part_id, sn.trim()], function(errX) {
                    if (!errX && this.lastID) {
                      db.run(`INSERT INTO movement_items (movement_id, item_id) VALUES (?, ?)`, [movementId, this.lastID], checkDone);
                    } else {
                      checkDone();
                    }
                  });
                });
              }

              if (pending === 0) finalizeAll();
            }
          );
        });
      });
    }
  }
);
// [NEW] API สำหรับ Export ข้อมูลคงคลังเป็น CSV
app.get("/export/inventory", authenticateToken, (req, res) => {
  const warehouseId = req.query.warehouseId;
  let sql = `
    SELECT p.part_no, p.name, p.description, p.quantity, p.price, w.name as warehouse
    FROM spare_parts p
    JOIN warehouses w ON p.warehouseId = w.id
  `;
  const params = [];
  if (warehouseId && warehouseId !== 'all') {
    sql += " WHERE p.warehouseId = ?";
    params.push(warehouseId);
  }

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    
    const header = "Part No,Name,Description,Quantity,Price,Warehouse\n";
    const csv = rows.map(r => 
      `"${r.part_no}","${r.name}","${r.description || ''}",${r.quantity},${r.price},"${r.warehouse}"`
    ).join("\n");
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=inventory.csv');
    res.send(header + csv);
  });
});

// [NEW] API สำหรับ Export ประวัติการเคลื่อนไหวเป็น CSV
app.get("/export/movements", authenticateToken, (req, res) => {
  const warehouseId = req.query.warehouseId;
  let sql = `
    SELECT 
      m.movement_date, m.movement_type, m.quantity, m.receiver, m.note,
      p.part_no, p.name as part_name, w.name as warehouse
    FROM stock_movements m
    JOIN spare_parts p ON m.part_id = p.id
    JOIN warehouses w ON p.warehouseId = w.id
  `;
  const params = [];
  if (warehouseId && warehouseId !== 'all') {
    sql += " WHERE p.warehouseId = ?";
    params.push(warehouseId);
  }
  sql += " ORDER BY m.movement_date DESC";

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    
    const header = "Date,Type,Part No,Part Name,Quantity,Receiver,Warehouse,Note\n";
    const csv = rows.map(r => 
      `"${r.movement_date}","${r.movement_type}","${r.part_no}","${r.part_name}",${r.quantity},"${r.receiver || ''}","${r.warehouse}","${r.note || ''}"`
    ).join("\n");
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=movements.csv');
    res.send(header + csv);
  });
});

// [NEW] API สำหรับโอนย้ายอะไหล่ข้ามคลัง
// [NEW] API สำหรับดึงข้อมูลวิเคราะห์คลัง (Insights)
app.get("/report/insights", authenticateToken, (req, res) => {
  const warehouseId = req.query.warehouseId;
  const popularSql = `
    SELECT p.part_no, p.name, SUM(m.quantity) as total_consumed
    FROM stock_movements m
    JOIN spare_parts p ON m.part_id = p.id
    WHERE m.movement_type IN ('OUT', 'BORROW')
    ${warehouseId && warehouseId !== 'all' ? 'AND p.warehouseId = ?' : ''}
    GROUP BY p.id
    ORDER BY total_consumed DESC
    LIMIT 5
  `;

  const deadStockSql = `
    SELECT p.part_no, p.name, p.quantity, MAX(m.movement_date) as last_movement
    FROM spare_parts p
    LEFT JOIN stock_movements m ON p.id = m.part_id
    WHERE p.quantity > 0
    ${warehouseId && warehouseId !== 'all' ? 'AND p.warehouseId = ?' : ''}
    GROUP BY p.id
    HAVING last_movement IS NULL OR last_movement < date('now', '-180 days')
    LIMIT 10
  `;

  const params = warehouseId && warehouseId !== 'all' ? [warehouseId] : [];

  db.all(popularSql, params, (err, popular) => {
    if (err) return res.status(500).json({ error: err.message });
    
    db.all(deadStockSql, params, (err, deadStock) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ popular, deadStock });
    });
  });
});

app.post("/spareparts/transfer", authenticateToken, requireRole(["admin", "co-admin"]), (req, res) => {
  const { part_id, target_warehouse_id, quantity, note } = req.body;

  if (!part_id || !target_warehouse_id || !quantity || quantity <= 0) {
    return res.status(400).json({ error: "BAD_REQUEST" });
  }

  db.serialize(() => {
    db.run("BEGIN TRANSACTION");

    // 1. Fetch Source Part
    db.get(
      "SELECT p.*, w.name as warehouse_name FROM spare_parts p JOIN warehouses w ON p.warehouseId = w.id WHERE p.id = ?",
      [part_id],
      (err, sourcePart) => {
        if (err || !sourcePart) return db.run("ROLLBACK", () => res.status(404).json({ error: "SOURCE_PART_NOT_FOUND" }));
        if (sourcePart.quantity < quantity) return db.run("ROLLBACK", () => res.status(400).json({ error: "INSUFFICIENT_STOCK" }));

        // 2. Find Target Warehouse
        db.get("SELECT name FROM warehouses WHERE id = ?", [target_warehouse_id], (err2, targetWh) => {
          if (err2 || !targetWh) return db.run("ROLLBACK", () => res.status(404).json({ error: "TARGET_WAREHOUSE_NOT_FOUND" }));

          // 3. Find/Create Part in Target Warehouse
          db.get(
            "SELECT id FROM spare_parts WHERE part_no = ? AND warehouseId = ?",
            [sourcePart.part_no, target_warehouse_id],
            (err3, targetPart) => {
              if (err3) return db.run("ROLLBACK", () => res.status(500).json({ error: err3.message }));

              const finalizeTransfer = (target_part_id) => {
                // 4. Update Quantities
                db.run("UPDATE spare_parts SET quantity = quantity - ? WHERE id = ?", [quantity, sourcePart.id]);
                db.run("UPDATE spare_parts SET quantity = quantity + ? WHERE id = ?", [quantity, target_part_id]);

                // 5. Create Movements (Audit)
                const noteStr = note ? ` (${note})` : "";
                db.run(
                  "INSERT INTO stock_movements (part_id, movement_type, quantity, note, user_id) VALUES (?, 'OUT', ?, ?, ?)",
                  [sourcePart.id, quantity, `Transfer to ${targetWh.name}${noteStr}`, req.user.userId]
                );
                db.run(
                  "INSERT INTO stock_movements (part_id, movement_type, quantity, note, user_id) VALUES (?, 'IN', ?, ?, ?)",
                  [target_part_id, quantity, `Transfer from ${sourcePart.warehouse_name}${noteStr}`, req.user.userId]
                );

                db.run("COMMIT", (err4) => {
                  if (err4) return db.run("ROLLBACK", () => res.status(500).json({ error: err4.message }));
                  logActivity(req.user.userId, "TRANSFER", `${quantity} units of ${sourcePart.part_no} from ${sourcePart.warehouse_name} to ${targetWh.name}`);
                  res.json({ message: "Transfer successful" });
                });
              };

              if (targetPart) {
                finalizeTransfer(targetPart.id);
              } else {
                // Create part in target warehouse if not exists
                db.run(
                  "INSERT INTO spare_parts (part_no, name, description, quantity, price, warehouseId) VALUES (?, ?, ?, 0, ?, ?)",
                  [sourcePart.part_no, sourcePart.name, sourcePart.description, sourcePart.price, target_warehouse_id],
                  function (err5) {
                    if (err5) return db.run("ROLLBACK", () => res.status(500).json({ error: err5.message }));
                    finalizeTransfer(this.lastID);
                  }
                );
              }
            }
          );
        });
      }
    );
  });
});

// [NEW] API สำหรับส่งแจ้งเตือนของยืมที่เกินกำหนดเข้า Teams
app.get("/report/send-reminders", authenticateToken, requireRole(["admin", "co-admin"]), (req, res) => {
  const sql = `
    SELECT m.*, p.name as part_name, w.name as warehouse_name
    FROM stock_movements m
    JOIN spare_parts p ON m.part_id = p.id
    JOIN warehouses w ON p.warehouseId = w.id
    WHERE m.movement_type = 'BORROW' 
    AND m.return_status = 'pending'
    AND m.due_date < date('now')
  `;

  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    
    if (rows.length === 0) {
      return res.json({ message: "No overdue items found." });
    }

    rows.forEach(item => {
      sendTeamsNotification({
        type: 'REMINDER',
        partName: item.part_name,
        quantity: item.quantity,
        user: 'System Reminder',
        receiver: item.receiver,
        department: item.department,
        warehouse: item.warehouse_name,
        serialNos: '-',
        note: `OVERDUE! Due date was: ${item.due_date}`
      });
    });

    res.json({ message: `Sent ${rows.length} reminders to Teams.` });
  });
});

// [RESTORED] API สำหรับดึงรายการของยืมที่เกินกำหนด
app.get("/report/overdue", authenticateToken, (req, res) => {
  const warehouseId = req.query.warehouseId;
  let sql = `
    SELECT m.*, p.name as part_name 
    FROM stock_movements m
    JOIN spare_parts p ON m.part_id = p.id
    WHERE m.movement_type = 'BORROW' 
    AND m.return_status = 'pending'
    AND m.due_date < date('now')
  `;
  const params = [];

  if (warehouseId && warehouseId !== 'all') {
    sql += " AND p.warehouseId = ?";
    params.push(warehouseId);
  }

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Catch-all for 404
app.use((req, res) => {
  console.log(`404 - ${req.method} ${req.url}`);
  res.status(404).json({ error: "Path not found" });
});

// เริ่มเซิร์ฟเวอร์
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running at http://0.0.0.0:${PORT}`);
});