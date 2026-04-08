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
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { sendTeamsNotification, isSupportedNotificationType, normalizeNotificationType, SUPPORTED_NOTIFICATION_TYPES } = require('./teams_notifier');
const dbConfig = require("./db/config");
const { createDatabase } = require("./db/adapter");
const sqlDialect = require("./db/dialect");

const app = express();

// ABSOLUTE TOP: Diagnostic Route
app.get("/public-ping", (req, res) => res.json({ message: "pong (absolute top)", version: "2.3" }));
// ----------------------------
const PORT = Number(process.env.PORT || 5000);
const NODE_ENV = String(process.env.NODE_ENV || "development").toLowerCase();
const IS_PRODUCTION = NODE_ENV === "production";
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const ENABLE_TEST_ENDPOINTS = String(process.env.ENABLE_TEST_ENDPOINTS || "false").toLowerCase() === "true";
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 400);
const CORS_ORIGIN = String(process.env.CORS_ORIGIN || "*").trim();
const UNIT_TYPES = ["M", "PC", "PAC", "BOX", "ROL"];
const PACK_UNIT_TYPES = new Set(["PAC", "BOX"]);
const UNIT_TYPE_ALIASES = {
  M: "M",
  METER: "M",
  METRE: "M",
  PC: "PC",
  PIECE: "PC",
  PIECES: "PC",
  PAC: "PAC",
  PACK: "PAC",
  BOX: "BOX",
  ROL: "ROL",
  ROLL: "ROL"
};

function normalizeUnitType(unitType) {
  const normalized = String(unitType || "PC").trim().toUpperCase();
  return UNIT_TYPE_ALIASES[normalized] || "PC";
}

function isPackUnit(unitType) {
  return PACK_UNIT_TYPES.has(normalizeUnitType(unitType));
}

function validateEnvironment() {
  if (IS_PRODUCTION && (!process.env.JWT_SECRET || JWT_SECRET === "dev_secret_change_me")) {
    throw new Error("Missing secure JWT_SECRET in production environment.");
  }

  if (!process.env.JWT_SECRET) {
    console.warn("[ENV] JWT_SECRET is not set. Using development fallback secret.");
  }

  if (!Number.isFinite(RATE_LIMIT_WINDOW_MS) || RATE_LIMIT_WINDOW_MS <= 0) {
    throw new Error("RATE_LIMIT_WINDOW_MS must be a positive number.");
  }

  if (!Number.isFinite(RATE_LIMIT_MAX) || RATE_LIMIT_MAX <= 0) {
    throw new Error("RATE_LIMIT_MAX must be a positive number.");
  }
}

validateEnvironment();

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

// --- Utilities & Middleware (Moved up for priority) ---

function normalizeRole(role) {
  const value = String(role || "").trim().toLowerCase().replace(/[_\s]+/g, "-");
  if (value === "coadmin") return "co-admin";
  return value;
}

function authenticateToken(req, res, next) {
  const token = req.header("Authorization")?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Access denied" });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Invalid token" });
    if (user && typeof user === "object") {
      user.role = normalizeRole(user.role);
    }
    req.user = user;
    next();
  });
}

function requireRole(roles = []) {
  return (req, res, next) => {
    const userRole = normalizeRole(req.user?.role);
    const allowedRoles = roles.map(normalizeRole);
    if (!userRole) return res.status(401).json({ error: "NO_ROLE" });
    if (!allowedRoles.includes(userRole)) return res.status(403).json({ error: "FORBIDDEN" });
    next();
  };
}

const db = createDatabase(); // Initialize DB early
// --------------------------------------------------

// ---------------------------

app.get("/test", (req, res) => {
  res.json({ message: "Server is alive", timestamp: new Date().toISOString() });
});

if (ENABLE_TEST_ENDPOINTS && !IS_PRODUCTION) {
  app.get("/test-notif", (req, res) => {
    const testType = normalizeNotificationType(req.query.type || "OUT");
    if (!isSupportedNotificationType(testType)) {
      return res.status(400).json({
        error: `Unsupported notification type. Allowed types: ${[...SUPPORTED_NOTIFICATION_TYPES].join(', ')}`,
        type: testType
      });
    }
    console.log('[DEBUG] Triggering manual test notification...');
    sendTeamsNotification({
      type: testType,
      partName: 'Debug Part (Direct API)',
      quantity: 99,
      user: 'Debugger',
      receiver: '-',
      department: '-',
      warehouse: 'LPN TEST'
    });
    res.json({ message: "Notification triggered", type: testType });
  });
}

// Silence browser favicon requests when no favicon file is configured.
app.get("/favicon.ico", (req, res) => {
  res.status(204).end();
});

// Log all requests (Moved to top for visibility)
app.use((req, res, next) => {
  const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  console.log(`[${requestId}] ${new Date().toLocaleTimeString()} - ${req.method} ${req.url}`);
  next();
});

// ---------------------------
// (Removed redundant public-ping)
// ---------------------------

// ใช้ Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

const corsOptions = {
  origin: CORS_ORIGIN === "*" ? true : CORS_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean),
  credentials: true
};

app.use(cors(corsOptions));

app.use(rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false
}));

app.use(express.json());

// ---------------------------

// สร้างตารางอะไหล่, ผู้ใช้, และคลัง
db.run(
  `CREATE TABLE IF NOT EXISTS spare_parts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    part_no TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    quantity INTEGER NOT NULL,
    unit_type TEXT DEFAULT 'PC',
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
    correction_of INTEGER,
    correction_reason TEXT,
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
        correction_of: "INTEGER",
        correction_reason: "TEXT",
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
  const sql = `SELECT part_id, serial_no, initial_qty, remaining_qty, status, price, id
               FROM spare_part_items
               WHERE part_id IN (${placeholders})
                 AND status NOT IN ('consumed', 'removed')
               ORDER BY part_id, CASE WHEN status = 'partial' THEN 0 ELSE 1 END, id ASC`;

  db.all(sql, partIds, (err, rows) => {
    if (err) return callback(err);
    const summaryMap = new Map();
    (rows || []).forEach((row) => {
      const current = summaryMap.get(row.part_id) || [];
      const priceStr = row.price !== null && row.price !== undefined ? ` @${row.price}` : "";
      current.push(`${row.serial_no} [${Number(row.remaining_qty) || 1}/${Number(row.initial_qty) || 1}]${priceStr}`);
      summaryMap.set(row.part_id, current);
    });
    callback(null, summaryMap);
  });
}

function createSerialGenerator(existingRows, fallbackPartNo) {
  const existingSerials = new Set(
    (existingRows || [])
      .map((r) => String(r?.serial_no || "").trim())
      .filter(Boolean)
  );

  const prefixStats = new Map();
  (existingRows || []).forEach((r) => {
    const raw = String(r?.serial_no || "").trim();
    const match = raw.match(/^([^\d]*)(\d+)$/);
    if (!match) return;
    const prefix = match[1] || "SP";
    const num = Number(match[2]);
    const width = match[2].length;
    if (!Number.isFinite(num)) return;

    const current = prefixStats.get(prefix) || { count: 0, maxNum: 0, width };
    current.count += 1;
    current.maxNum = Math.max(current.maxNum, num);
    current.width = Math.max(current.width, width);
    prefixStats.set(prefix, current);
  });

  let selectedPrefix = "SP";
  let selectedMax = 0;
  let selectedWidth = 4;

  if (prefixStats.size > 0) {
    const ranked = [...prefixStats.entries()].sort((a, b) => {
      const byCount = b[1].count - a[1].count;
      if (byCount !== 0) return byCount;
      return b[1].maxNum - a[1].maxNum;
    });
    selectedPrefix = ranked[0][0] || "SP";
    selectedMax = Number(ranked[0][1].maxNum) || 0;
    selectedWidth = Math.max(1, Number(ranked[0][1].width) || 4);
  } else {
    const partPrefix = String(fallbackPartNo || "").match(/^([^\d]+)/)?.[1];
    if (partPrefix) selectedPrefix = partPrefix;
  }

  let nextNumber = selectedMax + 1;

  return () => {
    let candidate = "";
    let guard = 0;
    do {
      candidate = `${selectedPrefix}${String(nextNumber).padStart(selectedWidth, "0")}`;
      nextNumber += 1;
      guard += 1;
      if (guard > 100000) {
        candidate = `${selectedPrefix}${Date.now()}`;
        break;
      }
    } while (existingSerials.has(candidate));

    existingSerials.add(candidate);
    return candidate;
  };
}

function insertOrGetSparePartItem(partId, serialNo, itemQty, price, callback) {
  // Check if serial already exists anywhere (to prevent cross-part duplication)
  db.get(
    "SELECT spi.id, spi.part_id, spi.status, p.name as part_name, p.price FROM spare_part_items spi JOIN spare_parts p ON spi.part_id = p.id WHERE spi.serial_no = ?",
    [serialNo],
    (selectErr, existingRow) => {
      if (selectErr) return callback(selectErr);
      
      if (existingRow) {
        if (Number(existingRow.part_id) === Number(partId)) {
          // Already in this part, just return it
          return callback(null, { itemId: existingRow.id, created: false });
        } else {
          // Exists in a DIFFERENT part! This is a duplicate error.
          const err = new Error(`Serial ${serialNo} already exists in part "${existingRow.part_name}" (Price: ${Number(existingRow.price || 0).toLocaleString()})`);
          err.status = 409;
          return callback(err);
        }
      }

      db.run(
        "INSERT INTO spare_part_items (part_id, serial_no, status, initial_qty, remaining_qty, price) VALUES (?, ?, 'available', ?, ?, ?)",
        [partId, serialNo, itemQty, itemQty, price || 0],
        function(insertErr) {
          if (insertErr) return callback(insertErr);
          callback(null, { itemId: this.lastID, created: true });
        }
      );
    }
  );
}

function resolveSerialStatus(remainingQty, initialQty) {
  if (remainingQty <= 0) return "consumed";
  if (remainingQty < initialQty) return "partial";
  return "available";
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

// API Register
app.post("/register", authenticateToken, requireRole(["admin"]), (req, res) => {
  const { username, password } = req.body;
  const role = normalizeRole(req.body?.role);
  if (!username || !password || !role) {
    return res.status(400).json({ error: "Missing required fields" });
  }
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
      const normalizedRole = normalizeRole(user.role);
      const token = jwt.sign({ userId: user.id, role: normalizedRole, username: user.username }, JWT_SECRET, { expiresIn: "10h" });
      logActivity(user.id, "LOGIN", `User ${user.username} logged in`);
      res.json({ token, role: normalizedRole });
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
  let sql = `SELECT m.*, p.name as part_name, p.part_no, u.username,
                    CASE WHEN EXISTS (SELECT 1 FROM stock_movements c WHERE c.correction_of = m.id) THEN 1 ELSE 0 END AS has_correction
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
  let sql = `SELECT w.name AS warehouse_name, SUM(m.quantity * m.price) AS total_expense, SUM(m.quantity) AS total_qty FROM stock_movements m JOIN spare_parts p ON m.part_id = p.id JOIN warehouses w ON p.warehouseId = w.id WHERE m.movement_type = 'OUT'`;
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
  let sql = `SELECT p.name, SUM(m.quantity) as total_qty FROM stock_movements m JOIN spare_parts p ON m.part_id = p.id WHERE m.movement_type IN ('OUT', 'BORROW')`;
  const params = [];
  if (warehouseId && warehouseId !== 'all') { sql += " AND p.warehouseId = ?"; params.push(warehouseId); }
  sql += ` GROUP BY p.name ORDER BY total_qty DESC ${sqlDialect.limit(10)}`;
  db.all(sql, params, (err, rows) => res.json(rows));
});

app.get("/report/overdue", authenticateToken, (req, res) => {
  const warehouseId = req.query.warehouseId;
  let sql = `SELECT m.id, m.receiver, m.quantity, m.due_date, p.part_no, p.name AS part_name,
                    CAST(julianday('now') - julianday(m.due_date) AS INTEGER) AS days_overdue
             FROM stock_movements m
             JOIN spare_parts p ON m.part_id = p.id
             WHERE m.movement_type = 'BORROW'
               AND m.due_date IS NOT NULL
               AND m.due_date < CURRENT_TIMESTAMP
               AND COALESCE(m.return_status, 'pending') = 'pending'`;
  const params = [];
  if (warehouseId && warehouseId !== 'all') { sql += " AND p.warehouseId = ?"; params.push(warehouseId); }
  sql += ` ORDER BY m.due_date ASC ${sqlDialect.limit(10)}`;
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.get("/report/insights", authenticateToken, (req, res) => {
  const warehouseId = req.query.warehouseId;
  const popularSql = `SELECT p.part_no, p.name, SUM(m.quantity) as total_consumed
                      FROM stock_movements m
                      JOIN spare_parts p ON m.part_id = p.id
                      WHERE m.movement_type IN ('OUT', 'BORROW') ${warehouseId && warehouseId !== 'all' ? 'AND p.warehouseId = ?' : ''}
                      GROUP BY p.id, p.part_no, p.name
                      ORDER BY total_consumed DESC ${sqlDialect.limit(5)}`;
  const lowStockSql = `SELECT p.part_no, p.name, p.quantity, w.name AS warehouse_name
                       FROM spare_parts p
                       LEFT JOIN warehouses w ON p.warehouseId = w.id
                       WHERE p.quantity > 0 AND p.quantity < 10 ${warehouseId && warehouseId !== 'all' ? 'AND p.warehouseId = ?' : ''}
                       ORDER BY p.quantity ASC, p.name ASC ${sqlDialect.limit(5)}`;
  const overdueSql = `SELECT m.receiver, p.part_no, p.name AS part_name,
                             CAST(julianday('now') - julianday(m.due_date) AS INTEGER) AS days_overdue
                      FROM stock_movements m
                      JOIN spare_parts p ON m.part_id = p.id
                      WHERE m.movement_type = 'BORROW'
                        AND m.due_date IS NOT NULL
                        AND m.due_date < CURRENT_TIMESTAMP
                        AND COALESCE(m.return_status, 'pending') = 'pending'
                        ${warehouseId && warehouseId !== 'all' ? 'AND p.warehouseId = ?' : ''}
                      ORDER BY days_overdue DESC ${sqlDialect.limit(5)}`;
  const deadStockSql = `SELECT p.part_no, p.name, p.quantity,
                               COALESCE(p.price, 0) * p.quantity AS stock_value,
                               MAX(m.movement_date) as last_movement
                        FROM spare_parts p
                        LEFT JOIN stock_movements m ON p.id = m.part_id
                        WHERE p.quantity > 0 ${warehouseId && warehouseId !== 'all' ? 'AND p.warehouseId = ?' : ''}
                        GROUP BY p.id, p.part_no, p.name, p.quantity, p.price
                        HAVING MAX(m.movement_date) IS NULL OR MAX(m.movement_date) < ${sqlDialect.dateDaysAgo(180)}
                        ORDER BY stock_value DESC, last_movement ASC ${sqlDialect.limit(10)}`;
  const params = warehouseId && warehouseId !== 'all' ? [warehouseId] : [];

  db.all(popularSql, params, (err, popular) => {
    if (err) return res.status(500).json({ error: err.message });
    db.all(lowStockSql, params, (lowErr, lowStock) => {
      if (lowErr) return res.status(500).json({ error: lowErr.message });
      db.all(overdueSql, params, (overdueErr, overdue) => {
        if (overdueErr) return res.status(500).json({ error: overdueErr.message });
        db.all(deadStockSql, params, (deadErr, deadStock) => {
          if (deadErr) return res.status(500).json({ error: deadErr.message });
          res.json({
            popular: popular || [],
            lowStock: lowStock || [],
            overdue: overdue || [],
            deadStock: deadStock || []
          });
        });
      });
    });
  });
});

app.get("/report/top-parts-by-warehouse", authenticateToken, (req, res) => {
  const warehouseId = req.query.warehouseId;
  
  if (!warehouseId || warehouseId === 'all') {
    return res.json([]);
  }
  
  const sql = `SELECT p.id, p.part_no, p.name, p.quantity, COALESCE(SUM(m.quantity), 0) as total_consumed 
               FROM spare_parts p 
               LEFT JOIN stock_movements m ON p.id = m.part_id AND m.movement_type IN ('OUT', 'BORROW')
               WHERE p.warehouseId = ?
               GROUP BY p.id, p.part_no, p.name, p.quantity
               ORDER BY total_consumed DESC ${sqlDialect.limit(5)}`;
  
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
      db.run("ALTER TABLE spare_parts ADD COLUMN unit_type TEXT DEFAULT 'PC'");
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

    db.run(
      `UPDATE spare_parts
       SET unit_type = CASE UPPER(COALESCE(unit_type, 'PC'))
         WHEN 'PIECE' THEN 'PC'
         WHEN 'PIECES' THEN 'PC'
         WHEN 'PACK' THEN 'PAC'
         WHEN 'BOX' THEN 'BOX'
         WHEN 'ROLL' THEN 'ROL'
         WHEN 'METER' THEN 'M'
         WHEN 'METRE' THEN 'M'
         WHEN 'PC' THEN 'PC'
         WHEN 'PAC' THEN 'PAC'
         WHEN 'M' THEN 'M'
         WHEN 'ROL' THEN 'ROL'
         ELSE 'PC'
       END`
    );
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
                   WHEN UPPER(COALESCE(p.unit_type, 'PC')) IN ('BOX', 'PAC', 'PACK') THEN CAST(COALESCE(p.conversion_rate, 1) AS INTEGER)
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

  const normalizedUnit = normalizeUnitType(unit_type);
  const normalizedRate = Number(conversion_rate) > 0 ? Number(conversion_rate) : 1;
  const itemInitialQty = isPackUnit(normalizedUnit) ? Math.round(normalizedRate) : 1;

  if (isPackUnit(normalizedUnit) && Number(quantity) !== serials.length) {
    return res.status(400).json({ error: "SP no count must match BOX/PAC quantity" });
  }

  const pieceStock = Math.round(Number(quantity) * normalizedRate);
  const serialsFixed = [...new Set(serials.map(s => String(s || "").trim()).filter(Boolean))];

  db.serialize(() => {
    db.run("BEGIN TRANSACTION");

    // 1. Check for duplicate serials globally
    const placeholders = serialsFixed.map(() => "?").join(",");
    db.get(
      `SELECT spi.serial_no, p.name as part_name, p.price 
       FROM spare_part_items spi 
       JOIN spare_parts p ON spi.part_id = p.id 
       WHERE spi.serial_no IN (${placeholders})`,
      serialsFixed,
      (checkErr, duplicate) => {
        if (checkErr) {
          db.run("ROLLBACK");
          return res.status(500).json({ error: checkErr.message });
        }
        if (duplicate) {
          db.run("ROLLBACK");
          const priceDisplay = Number(duplicate.price || 0).toLocaleString();
          return res.status(409).json({ 
            error: `Serial ${duplicate.serial_no} already exists in part "${duplicate.part_name}" (Price: ${priceDisplay})` 
          });
        }

        // 2. Insert the part
        db.run(
          "INSERT INTO spare_parts (name, part_no, description, quantity, unit_type, conversion_rate, piece_stock, price, warehouseId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [name, part_no, description || '', quantity, normalizedUnit, normalizedRate, pieceStock, price || 0, warehouseId],
          function (err) {
            if (err) {
              db.run("ROLLBACK");
              return res.status(500).json({ error: err.message });
            }
            const partId = this.lastID;

            // 3. Insert serial items
            const stmt = db.prepare("INSERT INTO spare_part_items (part_id, serial_no, status, initial_qty, remaining_qty, price) VALUES (?, ?, 'available', ?, ?, ?)");
            serialsFixed.forEach(sn => stmt.run(partId, sn, itemInitialQty, itemInitialQty, price || 0));
            stmt.finalize((finalizeErr) => {
              if (finalizeErr) {
                db.run("ROLLBACK");
                return res.status(500).json({ error: finalizeErr.message });
              }
              db.run("COMMIT");
              logActivity(req.user.userId, "ADD_SPARE_PART", `Added part ${name} (${part_no}) with ${serialsFixed.length} serials`);
              res.status(201).json({ message: "Spare part added", partId });
            });
          }
        );
      }
    );
  });
});

// API สำหรับแก้ไขอะไหล่
app.put("/spareparts/:id", authenticateToken, requireRole(["admin", "co-admin"]), (req, res) => {
  const id = Number(req.params.id);
  const { part_no, name, description, quantity, price } = req.body;
  if (!id || !part_no || !name) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const nextQuantity = Math.max(0, Number(quantity) || 0);

  db.get(
    "SELECT id, quantity, unit_type, COALESCE(conversion_rate, 1) AS conversion_rate FROM spare_parts WHERE id = ?",
    [id],
    (partErr, partRow) => {
      if (partErr) return res.status(500).json({ error: partErr.message });
      if (!partRow) return res.status(404).json({ error: "Part not found" });

      const unitType = normalizeUnitType(partRow.unit_type);
      const convRate = Math.max(1, Number(partRow.conversion_rate) || 1);
      const itemInitialQty = isPackUnit(unitType) ? Math.round(convRate) : 1;

      db.all(
        `SELECT spi.id, spi.serial_no, spi.initial_qty, spi.remaining_qty, spi.status,
                CASE WHEN EXISTS(SELECT 1 FROM movement_items mi WHERE mi.item_id = spi.id) THEN 1 ELSE 0 END AS has_movement
         FROM spare_part_items spi
         WHERE spi.part_id = ?
         ORDER BY spi.id DESC`,
        [id],
        (itemsErr, itemRows) => {
          if (itemsErr) return res.status(500).json({ error: itemsErr.message });

          const activeItems = (itemRows || []).filter((r) => r.status !== "consumed" && r.status !== "removed");
          const currentItemCount = activeItems.length;
          const delta = nextQuantity - currentItemCount;
          const pieceStock = Math.round(nextQuantity * convRate);

          const runPartUpdate = () => {
            const sql = `UPDATE spare_parts
                         SET part_no = ?, name = ?, description = ?, quantity = ?, piece_stock = ?, price = ?
                         WHERE id = ?`;
            db.run(sql, [part_no, name, description || "", nextQuantity, pieceStock, Number(price) || 0, id], function (updateErr) {
              if (updateErr) {
                db.run("ROLLBACK");
                return res.status(500).json({ error: updateErr.message });
              }
              if (this.changes === 0) {
                db.run("ROLLBACK");
                return res.status(404).json({ error: "Part not found" });
              }

              db.run("COMMIT");
              logActivity(req.user.userId, "UPDATE_SPARE_PART", `Updated part ID ${id} (${part_no}) qty=${nextQuantity}`);
              res.json({ message: "Spare part updated" });
            });
          };

          db.serialize(() => {
            db.run("BEGIN TRANSACTION");

            const autoRows = (itemRows || []).filter((r) => String(r.serial_no || "").startsWith("AUTO-"));
            const nonAutoRows = (itemRows || []).filter((r) => !String(r.serial_no || "").startsWith("AUTO-"));

            const normalizeAutoSerials = (done) => {
              if (autoRows.length === 0) {
                done();
                return;
              }

              const generateSerialNo = createSerialGenerator(nonAutoRows, part_no);
              let idx = 0;

              const renameNext = () => {
                if (idx >= autoRows.length) {
                  done();
                  return;
                }

                const row = autoRows[idx];
                const nextSerial = generateSerialNo();
                db.run("UPDATE spare_part_items SET serial_no = ? WHERE id = ?", [nextSerial, row.id], (renameErr) => {
                  if (renameErr) {
                    db.run("ROLLBACK");
                    return res.status(500).json({ error: renameErr.message });
                  }
                  idx += 1;
                  renameNext();
                });
              };

              renameNext();
            };

            const proceedQuantitySync = () => {
              if (delta === 0) {
                runPartUpdate();
                return;
              }

              if (delta > 0) {
                const totalToAdd = delta;
                let added = 0;
                const generateSerialNo = createSerialGenerator(itemRows, part_no);

                const insertNext = () => {
                  if (added >= totalToAdd) {
                    runPartUpdate();
                    return;
                  }

                  const serialNo = generateSerialNo();
                  db.run(
                    "INSERT INTO spare_part_items (part_id, serial_no, status, initial_qty, remaining_qty, price) VALUES (?, ?, 'available', ?, ?, ?)",
                    [id, serialNo, itemInitialQty, itemInitialQty, Number(price) || Number(partMeta.price || 0)],
                    (insertErr) => {
                      if (insertErr) {
                        db.run("ROLLBACK");
                        return res.status(500).json({ error: insertErr.message });
                      }
                      added += 1;
                      insertNext();
                    }
                  );
                };

                insertNext();
                return;
              }

              const totalToRemove = Math.abs(delta);

              // Prefer hard-deleting items with no movement history (safe to delete)
              const deletable = activeItems.filter((r) => {
                const untouched = Number(r.remaining_qty) >= Number(r.initial_qty || 1);
                return Number(r.has_movement) === 0 && untouched;
              });
              // Items with movement history cannot be deleted; soft-remove them instead
              const softRemovable = activeItems.filter((r) => Number(r.has_movement) === 1);

              const deleteIds = deletable.slice(0, totalToRemove).map((r) => r.id);
              const softRemoveIds = softRemovable.slice(0, Math.max(0, totalToRemove - deleteIds.length)).map((r) => r.id);

              let step = 0;

              const removeNext = () => {
                if (step < deleteIds.length) {
                  db.run("DELETE FROM spare_part_items WHERE id = ?", [deleteIds[step]], (deleteErr) => {
                    if (deleteErr) { db.run("ROLLBACK"); return res.status(500).json({ error: deleteErr.message }); }
                    step += 1;
                    removeNext();
                  });
                  return;
                }
                const softIdx = step - deleteIds.length;
                if (softIdx < softRemoveIds.length) {
                  db.run("UPDATE spare_part_items SET status = 'removed', remaining_qty = 0 WHERE id = ?", [softRemoveIds[softIdx]], (updateErr) => {
                    if (updateErr) { db.run("ROLLBACK"); return res.status(500).json({ error: updateErr.message }); }
                    step += 1;
                    removeNext();
                  });
                  return;
                }
                runPartUpdate();
              };

              removeNext();
            };

            normalizeAutoSerials(proceedQuantitySync);
          });
        }
      );
    }
  );
});

// API สำหรับลบอะไหล่
app.delete("/spareparts/:id", authenticateToken, requireRole(["admin", "co-admin"]), (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid part id" });

  // Fetch part details before deleting so we can notify Teams
  db.get("SELECT sp.name, sp.part_no, sp.quantity, w.name AS warehouse_name FROM spare_parts sp LEFT JOIN warehouses w ON sp.warehouseId = w.id WHERE sp.id = ?", [id], (fetchErr, part) => {
    if (fetchErr) return res.status(500).json({ error: fetchErr.message });
    if (!part) return res.status(404).json({ error: "Part not found" });

    // Admin: force delete all related movement_items and stock_movements before deleting part
    db.serialize(() => {
      db.run("BEGIN TRANSACTION");

      // Delete movement_items related to this part
      db.run(
        `DELETE FROM movement_items WHERE item_id IN (SELECT id FROM spare_part_items WHERE part_id = ?)`,
        [id],
        (miErr) => {
          if (miErr) {
            db.run("ROLLBACK");
            return res.status(500).json({ error: miErr.message });
          }

          // Delete stock_movements related to this part
          db.run(
            `DELETE FROM stock_movements WHERE part_id = ?`,
            [id],
            (smErr) => {
              if (smErr) {
                db.run("ROLLBACK");
                return res.status(500).json({ error: smErr.message });
              }

              // Delete spare_part_items
              db.run("DELETE FROM spare_part_items WHERE part_id = ?", [id], (spiErr) => {
                if (spiErr) {
                  db.run("ROLLBACK");
                  return res.status(500).json({ error: spiErr.message });
                }

                // Delete spare_parts
                db.run("DELETE FROM spare_parts WHERE id = ?", [id], function (spErr) {
                  if (spErr) {
                    db.run("ROLLBACK");
                    return res.status(500).json({ error: spErr.message });
                  }
                  if (this.changes === 0) {
                    db.run("ROLLBACK");
                    return res.status(404).json({ error: "Part not found" });
                  }

                  db.run("COMMIT");
                  logActivity(req.user.userId, "DELETE_SPARE_PART", `Force deleted part ${part.name} (${part.part_no}) ID ${id}`);

                  res.json({ message: "Spare part force deleted by admin" });
                });
              });
            }
          );
        }
      );
    });
  });
});
// API สำหรับแบ่งแยกอะไหล่ (Split Part) ออกไปเป็นรายการใหม่ตาม Description ที่ต้องการ
app.post("/spareparts/:id/split", authenticateToken, requireRole(["admin", "co-admin"]), (req, res) => {
  const sourcePartId = req.params.id;
  const { serial_ids, new_description } = req.body;
  
  if (!serial_ids || !Array.isArray(serial_ids) || serial_ids.length === 0 || !new_description) {
    return res.status(400).json({ error: "Missing serial_ids or new_description" });
  }

  db.serialize(() => {
    db.run("BEGIN TRANSACTION");

    // 1. ดึงข้อมูลต้นฉบับ
    db.get("SELECT * FROM spare_parts WHERE id = ?", [sourcePartId], (err, part) => {
      if (err || !part) {
        db.run("ROLLBACK");
        return res.status(404).json({ error: "Source part not found" });
      }

      // 2. สร้าง Part ใหม่ (Copy ข้อมูลเดิมแต่เปลี่ยน Description)
      db.run(
        "INSERT INTO spare_parts (name, part_no, description, quantity, unit_type, conversion_rate, piece_stock, price, warehouseId) VALUES (?, ?, ?, 0, ?, ?, 0, ?, ?)",
        [part.name, part.part_no, new_description, part.unit_type, part.conversion_rate, part.price, part.warehouseId],
        function (err) {
          if (err) {
            db.run("ROLLBACK");
            return res.status(500).json({ error: err.message });
          }
          const newPartId = this.lastID;
          const placeholders = serial_ids.map(() => "?").join(",");

          // 3. ย้าย Serial Items ไปยัง Part ใหม่
          db.run(
            `UPDATE spare_part_items SET part_id = ? WHERE id IN (${placeholders}) AND part_id = ?`,
            [newPartId, ...serial_ids, sourcePartId],
            (err) => {
              if (err) {
                db.run("ROLLBACK");
                return res.status(500).json({ error: err.message });
              }

              // 4. ย้าย Movement History ที่เกี่ยวข้อง (ที่มี Serial Items เหล่านี้อยู่)
              db.run(
                `UPDATE stock_movements SET part_id = ? 
                 WHERE id IN (SELECT movement_id FROM movement_items WHERE item_id IN (${placeholders}))`,
                [newPartId, ...serial_ids],
                (err) => {
                  if (err) {
                    db.run("ROLLBACK");
                    return res.status(500).json({ error: err.message });
                  }

                  // 5. คำนวณจำนวนคงเหลือ (Quantity) ใหม่ให้กับทั้ง 2 Part
                  const updateQtys = (pid, done) => {
                    db.get("SELECT SUM(remaining_qty) as total_piece FROM spare_part_items WHERE part_id = ? AND (status='available' OR status='partial')", [pid], (err, row) => {
                      const pieceStock = row ? (Number(row.total_piece) || 0) : 0;
                      const convRate = Math.max(1, Number(part.conversion_rate) || 1);
                      const unitQty = Math.ceil(pieceStock / convRate);
                      db.run("UPDATE spare_parts SET quantity = ?, piece_stock = ? WHERE id = ?", [unitQty, pieceStock, pid], done);
                    });
                  };

                  updateQtys(sourcePartId, () => {
                    updateQtys(newPartId, () => {
                      db.run("COMMIT");
                      res.json({ message: "Split completed successfully", newPartId });
                    });
                  });
                }
              );
            }
          );
        }
      );
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
  const { part_id, movement_type, quantity, department, receiver, receipt_number, note, due_date, serial_ids, new_serials, price } = req.body;
  const userId = req.user.userId;
  const reqId = req.requestId || "n/a";
  const selectedSerialIds = Array.isArray(serial_ids)
    ? [...new Set(serial_ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))]
    : [];
  const normalizedNewSerials = Array.isArray(new_serials)
    ? new_serials.map((s) => String(s || "").trim()).filter(Boolean)
    : [];

  console.log(`[${reqId}] [MOVEMENT] Incoming request`, {
    part_id,
    movement_type,
    quantity,
    serial_ids_count: Array.isArray(serial_ids) ? serial_ids.length : 0,
    new_serials_count: normalizedNewSerials.length,
    userId
  });

  const VALID_MOVEMENT_TYPES = ["IN", "OUT", "BORROW", "RETURN", "TRANSFER"];
  if (!movement_type || !VALID_MOVEMENT_TYPES.includes(movement_type)) {
    return res.status(400).json({ error: `Invalid movement_type. Must be one of: ${VALID_MOVEMENT_TYPES.join(", ")}` });
  }

  db.get(
    `SELECT p.name, p.part_no, p.unit_type,
            COALESCE(p.conversion_rate, 1) AS conversion_rate,
            COALESCE(p.piece_stock, p.quantity) AS piece_stock,
            p.quantity,
            COALESCE(w.name, '-') AS warehouse_name
     FROM spare_parts p
     LEFT JOIN warehouses w ON p.warehouseId = w.id
     WHERE p.id = ?`,
    [part_id],
    (preErr, partMeta) => {
      if (preErr || !partMeta) return res.status(404).json({ error: "Part not found" });

      const unitType = normalizeUnitType(partMeta.unit_type);
      const convInt = Math.max(1, Math.round(Number(partMeta.conversion_rate) || 1));
      const usesPackUnit = isPackUnit(unitType);
      const requestedQty = Math.max(0, Number(quantity) || 0);

      if (!requestedQty) {
        return res.status(400).json({ error: "Invalid quantity" });
      }

      if (movement_type === "IN") {
        if (normalizedNewSerials.length === 0) {
          return res.status(400).json({ error: "Please provide SP no list for stock IN" });
        }
        if (normalizedNewSerials.length !== requestedQty) {
          return res.status(400).json({
            error: `SP no count (${normalizedNewSerials.length}) must equal quantity (${requestedQty})`,
            requestId: reqId
          });
        }

        const duplicateInPayload = normalizedNewSerials.filter((v, i, arr) => arr.indexOf(v) !== i);
        if (duplicateInPayload.length > 0) {
          return res.status(409).json({
            error: `Duplicate SP no in request: ${[...new Set(duplicateInPayload)].join(", ")}`,
            requestId: reqId
          });
        }
      }

      if (["OUT", "BORROW", "RETURN"].includes(movement_type) && selectedSerialIds.length === 0) {
        return res.status(400).json({ error: "Please select at least one SP no" });
      }

      if (!usesPackUnit && ["OUT", "BORROW", "RETURN"].includes(movement_type) && selectedSerialIds.length !== requestedQty) {
        return res.status(400).json({
          error: `Selected SP no (${selectedSerialIds.length}) must equal quantity (${requestedQty})`,
          requestId: reqId
        });
      }

      db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        console.log(`[${reqId}] [MOVEMENT] Transaction BEGIN`);

        const rollbackWith = (status, message) => {
          db.run("ROLLBACK");
          console.error(`[${reqId}] [MOVEMENT] Transaction ROLLBACK`, { status, message });
          return res.status(status).json({ error: message, requestId: reqId });
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
          const updateTotals = usesPackUnit ? updatePackTotals : updateSimpleTotals;
          updateTotals((updateErr) => {
            if (updateErr) return rollbackWith(500, updateErr.message);
            db.run("COMMIT");
            console.log(`[${reqId}] [MOVEMENT] Transaction COMMIT`, {
              movementId,
              movement_type,
              quantity: requestedQty,
              touchedSerialCount: touchedSerialNos.length
            });

            sendTeamsNotification({
              type: movement_type,
              partName: partMeta.name || partMeta.part_no || `Part ID ${part_id}`,
              quantity: requestedQty,
              user: req.user?.username || "System",
              receiver: receiver || "-",
              department: department || "-",
              warehouse: partMeta.warehouse_name || "-",
              serialNos: touchedSerialNos.length > 0 ? touchedSerialNos.join(", ") : "-",
              requestNumber: receipt_number || "-",
              note: note || "-"
            });

            // Trigger Low Stock Alert if quantity <= 3 after removal
            if (movement_type === "OUT" || movement_type === "BORROW" || movement_type === "TRANSFER") {
              db.get("SELECT quantity, name, warehouseId FROM spare_parts WHERE id = ?", [part_id], (err, current) => {
                if (!err && current && current.quantity <= 3) {
                  db.get("SELECT name FROM warehouses WHERE id = ?", [current.warehouseId], (wErr, wh) => {
                    sendTeamsNotification({
                      type: "LOW_STOCK",
                      partName: current.name,
                      quantity: current.quantity,
                      user: "System (Stock Level Auto-Check)",
                      warehouse: wh ? wh.name : "-",
                      note: `Attention: Stock is critically low (${current.quantity} units remaining)`
                    });
                  });
                }
              });
            }

            logActivity(userId, `MOVEMENT_${movement_type}`, `Part ID ${part_id}: ${requestedQty} units`);
            res.status(201).json({ message: "Success", movementId, requestId: reqId });
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
          const serialFilterSql = selectedSerialIds.length > 0
            ? ` AND id IN (${selectedSerialIds.map(() => "?").join(",")})`
            : "";
          const serialFilterParams = selectedSerialIds.length > 0 ? selectedSerialIds : [];

          db.all(
            `SELECT id, serial_no, initial_qty, remaining_qty
             FROM spare_part_items
             WHERE part_id = ? AND COALESCE(remaining_qty, 0) > 0
             ${serialFilterSql}
             ORDER BY CASE WHEN status = 'partial' THEN 0 ELSE 1 END, id ASC`,
            [part_id, ...serialFilterParams],
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
          const serialFilterSql = selectedSerialIds.length > 0
            ? ` AND id IN (${selectedSerialIds.map(() => "?").join(",")})`
            : "";
          const serialFilterParams = selectedSerialIds.length > 0 ? selectedSerialIds : [];

          db.all(
            `SELECT id, serial_no, initial_qty, remaining_qty
             FROM spare_part_items
             WHERE part_id = ? AND COALESCE(remaining_qty, 0) < COALESCE(initial_qty, 1)
             ${serialFilterSql}
             ORDER BY CASE WHEN status = 'partial' THEN 0 ELSE 1 END, COALESCE(last_used_at, '') DESC, id DESC`,
            [part_id, ...serialFilterParams],
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

        const getMovePrice = (callback) => {
          if (movement_type === "IN") {
            return callback(Number(price) || Number(partMeta.price || 0));
          }
          if (selectedSerialIds.length > 0) {
            const placeholders = selectedSerialIds.map(() => "?").join(",");
            db.get(`SELECT AVG(price) as avg_price FROM spare_part_items WHERE id IN (${placeholders})`, selectedSerialIds, (err, row) => {
              if (err || !row || row.avg_price === null) {
                return callback(Number(partMeta.price || 0));
              }
              callback(Number(row.avg_price));
            });
          } else {
            callback(Number(partMeta.price || 0));
          }
        };

        getMovePrice((movePrice) => {
          const moveSql = "INSERT INTO stock_movements (part_id, movement_type, quantity, department, receiver, receipt_number, note, user_id, due_date, price) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
          db.run(moveSql, [part_id, movement_type, requestedQty, department, receiver, receipt_number, note, userId, due_date || null, movePrice], function(err) {
            if (err) return rollbackWith(500, err.message);
            const movementId = this.lastID;
            console.log(`[${reqId}] [MOVEMENT] Inserted stock_movements row`, { movementId, movePrice });

          if (movement_type === "IN" && normalizedNewSerials.length > 0) {
            // Note: We no longer update spare_parts.price here to avoid overwriting the master price for the whole lot.
            // Individual SP no prices are handled inside insertOrGetSparePartItem.

            const itemQty = usesPackUnit ? convInt : 1;
            let insertIndex = 0;
            const insertNext = () => {
              if (insertIndex >= normalizedNewSerials.length) return finalizeMovement(movementId, normalizedNewSerials);
              const serialNo = normalizedNewSerials[insertIndex];
              insertOrGetSparePartItem(part_id, serialNo, itemQty, price, (insertErr, result) => {
                if (insertErr) return rollbackWith(500, insertErr.message);
                if (!result?.created) {
                  return rollbackWith(409, `Duplicate SP no already exists: ${serialNo}`);
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

          if (usesPackUnit && (movement_type === "OUT" || movement_type === "BORROW")) {
            return allocatePackUsage(movementId);
          }

          if (usesPackUnit && movement_type === "RETURN") {
            return restorePackUsage(movementId);
          }

          if (selectedSerialIds.length > 0) {
            const nextStatus = movement_type === "RETURN" ? "available" : "consumed";
            const nextRemaining = movement_type === "RETURN" ? 1 : 0;
            let itemIndex = 0;
            const touchedSerialNos = [];

            const updateNext = () => {
              if (itemIndex >= selectedSerialIds.length) return finalizeMovement(movementId, touchedSerialNos);
              const itemId = selectedSerialIds[itemIndex];
              db.get(
                "SELECT serial_no, COALESCE(remaining_qty, 1) AS remaining_qty FROM spare_part_items WHERE id = ? AND part_id = ?",
                [itemId, part_id],
                (rowErr, row) => {
                if (rowErr) return rollbackWith(500, rowErr.message);
                if (!row) return rollbackWith(400, `Invalid SP no selected: ${itemId}`);
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
              }
            );
            };
            return updateNext();
          }

          return finalizeMovement(movementId, []);
        });
      });
    });
  });
});

app.post("/stock-movements/:id/correct", authenticateToken, requireRole(["admin", "co-admin"]), (req, res) => {
  const originalMovementId = Number(req.params.id);
  const reason = String(req.body?.reason || "").trim();
  const userId = req.user.userId;

  if (!originalMovementId) {
    return res.status(400).json({ error: "Invalid movement id" });
  }

  if (!reason) {
    return res.status(400).json({ error: "Correction reason is required" });
  }

  const rollbackWith = (status, message) => {
    db.run("ROLLBACK");
    return res.status(status).json({ error: message });
  };

  db.serialize(() => {
    db.run("BEGIN TRANSACTION");

    db.get(
      `SELECT m.*, p.name AS part_name, p.part_no, p.unit_type, COALESCE(p.conversion_rate, 1) AS conversion_rate
       FROM stock_movements m
       JOIN spare_parts p ON p.id = m.part_id
       WHERE m.id = ?`,
      [originalMovementId],
      (fetchErr, original) => {
        if (fetchErr) return rollbackWith(500, fetchErr.message);
        if (!original) return rollbackWith(404, "Original movement not found");
        if (original.correction_of) return rollbackWith(400, "Cannot correct a correction entry");
        if (String(original.movement_type || "").toUpperCase() === "TRANSFER") {
          return rollbackWith(400, "Transfer correction is not supported yet");
        }

        db.get(
          "SELECT id FROM stock_movements WHERE correction_of = ?",
          [originalMovementId],
          (existingErr, existingCorrection) => {
            if (existingErr) return rollbackWith(500, existingErr.message);
            if (existingCorrection?.id) {
              return rollbackWith(409, "This movement already has a correction record");
            }

            db.all(
              `SELECT mi.item_id, mi.used_qty, mi.before_qty, mi.after_qty,
                      spi.serial_no,
                      COALESCE(spi.initial_qty, 1) AS initial_qty,
                      COALESCE(spi.remaining_qty, 1) AS remaining_qty
               FROM movement_items mi
               JOIN spare_part_items spi ON spi.id = mi.item_id
               WHERE mi.movement_id = ?
               ORDER BY mi.id ASC`,
              [originalMovementId],
              (itemsErr, movementItems) => {
                if (itemsErr) return rollbackWith(500, itemsErr.message);
                if (!Array.isArray(movementItems) || movementItems.length === 0) {
                  return rollbackWith(400, "Original movement has no serial usage details");
                }

                const originalType = String(original.movement_type || "").toUpperCase();
                const correctionTypeMap = {
                  OUT: "RETURN",
                  BORROW: "RETURN",
                  RETURN: "OUT",
                  IN: "OUT"
                };
                const correctionType = correctionTypeMap[originalType];
                if (!correctionType) return rollbackWith(400, "Unsupported movement type for correction");

                const addBackQty = originalType === "OUT" || originalType === "BORROW";
                const touchedRows = [];
                let idx = 0;

                const updateNextSerial = () => {
                  if (idx >= movementItems.length) return insertCorrectionMovement();

                  const row = movementItems[idx];
                  const usedQty = Math.max(1, Number(row.used_qty) || 1);
                  const initialQty = Math.max(1, Number(row.initial_qty) || 1);
                  const currentRemaining = Math.max(0, Number(row.remaining_qty) || 0);
                  const nextRemaining = addBackQty
                    ? currentRemaining + usedQty
                    : currentRemaining - usedQty;

                  if (nextRemaining < 0) {
                    return rollbackWith(409, `Cannot correct movement: serial ${row.serial_no} has insufficient remaining quantity`);
                  }
                  if (nextRemaining > initialQty) {
                    return rollbackWith(409, `Cannot correct movement: serial ${row.serial_no} would exceed initial quantity`);
                  }

                  const nextStatus = resolveSerialStatus(nextRemaining, initialQty);
                  db.run(
                    "UPDATE spare_part_items SET remaining_qty = ?, status = ?, last_used_at = CURRENT_TIMESTAMP WHERE id = ?",
                    [nextRemaining, nextStatus, row.item_id],
                    (updateErr) => {
                      if (updateErr) return rollbackWith(500, updateErr.message);
                      touchedRows.push({
                        item_id: row.item_id,
                        serial_no: row.serial_no,
                        used_qty: usedQty,
                        before_qty: currentRemaining,
                        after_qty: nextRemaining
                      });
                      idx += 1;
                      updateNextSerial();
                    }
                  );
                };

                const recalculatePartTotals = (done) => {
                  db.get(
                    "SELECT COALESCE(SUM(COALESCE(remaining_qty, 0)), 0) AS remaining_sum FROM spare_part_items WHERE part_id = ?",
                    [original.part_id],
                    (sumErr, sumRow) => {
                      if (sumErr) return done(sumErr);

                      const pieceStock = Math.max(0, Number(sumRow?.remaining_sum) || 0);
                      const convInt = Math.max(1, Math.round(Number(original.conversion_rate) || 1));
                      const unitType = normalizeUnitType(original.unit_type);
                      const qty = isPackUnit(unitType)
                        ? Math.ceil(pieceStock / convInt)
                        : pieceStock;

                      db.run(
                        "UPDATE spare_parts SET quantity = ?, piece_stock = ? WHERE id = ?",
                        [qty, pieceStock, original.part_id],
                        done
                      );
                    }
                  );
                };

                const insertCorrectionMovementItems = (correctionMovementId, done) => {
                  let itemIndex = 0;
                  const insertNext = () => {
                    if (itemIndex >= touchedRows.length) return done();
                    const row = touchedRows[itemIndex];
                    db.run(
                      "INSERT INTO movement_items (movement_id, item_id, used_qty, before_qty, after_qty) VALUES (?, ?, ?, ?, ?)",
                      [correctionMovementId, row.item_id, row.used_qty, row.before_qty, row.after_qty],
                      (insertErr) => {
                        if (insertErr) return done(insertErr);
                        itemIndex += 1;
                        insertNext();
                      }
                    );
                  };
                  insertNext();
                };

                const insertCorrectionMovement = () => {
                  const correctionNote = `[CORRECTION of #${originalMovementId}] ${reason}`;

                  db.run(
                    `INSERT INTO stock_movements
                     (part_id, movement_type, quantity, department, receiver, receipt_number, note, user_id, due_date, return_status, correction_of, correction_reason)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                      original.part_id,
                      correctionType,
                      Number(original.quantity) || 0,
                      original.department || null,
                      original.receiver || null,
                      original.receipt_number || null,
                      correctionNote,
                      userId,
                      null,
                      original.return_status || "pending",
                      originalMovementId,
                      reason
                    ],
                    function(insertErr) {
                      if (insertErr) return rollbackWith(500, insertErr.message);

                      const correctionMovementId = this.lastID;
                      insertCorrectionMovementItems(correctionMovementId, (linkErr) => {
                        if (linkErr) return rollbackWith(500, linkErr.message);

                        recalculatePartTotals((recalcErr) => {
                          if (recalcErr) return rollbackWith(500, recalcErr.message);

                          db.run("COMMIT");
                          logActivity(
                            userId,
                            "MOVEMENT_CORRECTION",
                            `Corrected movement #${originalMovementId} with #${correctionMovementId}: ${reason}`
                          );

                          res.status(201).json({
                            message: "Correction created successfully",
                            correctionMovementId,
                            originalMovementId
                          });
                        });
                      });
                    }
                  );
                };

                updateNextSerial();
              }
            );
          }
        );
      }
    );
  });
});

// API สำหรับโอนย้ายคลัง
app.post("/spareparts/transfer", authenticateToken, (req, res) => {
  const { part_id, target_warehouse_id, quantity, note, serial_ids } = req.body;
  const userId = req.user.userId;
  const transferQty = Math.max(0, Number(quantity) || 0);
  const selectedSerialIds = Array.isArray(serial_ids)
    ? [...new Set(serial_ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))]
    : [];

  if (!transferQty) {
    return res.status(400).json({ error: "Invalid quantity" });
  }

  if (!Number.isInteger(Number(target_warehouse_id)) || Number(target_warehouse_id) <= 0) {
    return res.status(400).json({ error: "Invalid target warehouse" });
  }

  if (selectedSerialIds.length === 0) {
    return res.status(400).json({ error: "Please select at least one SP no for transfer" });
  }

  if (selectedSerialIds.length !== transferQty) {
    return res.status(400).json({
      error: `Selected SP no (${selectedSerialIds.length}) must equal transfer quantity (${transferQty})`
    });
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

      if (Number(part.warehouseId) === Number(target_warehouse_id)) {
        db.run("ROLLBACK");
        return res.status(400).json({ error: "Source and target warehouse must be different" });
      }

      if ((Number(part.quantity) || 0) < transferQty) {
        db.run("ROLLBACK");
        return res.status(400).json({ error: "Not enough quantity to transfer" });
      }

      const placeholders = selectedSerialIds.map(() => "?").join(",");
      const serialQuery = `SELECT id, serial_no, price, COALESCE(remaining_qty, 1) AS remaining_qty
                           FROM spare_part_items
                           WHERE part_id = ? AND id IN (${placeholders}) AND COALESCE(remaining_qty, 0) > 0`;

      db.all(serialQuery, [part_id, ...selectedSerialIds], (serialErr, serialRows) => {
        if (serialErr) {
          db.run("ROLLBACK");
          return res.status(500).json({ error: serialErr.message });
        }

        if ((serialRows || []).length !== selectedSerialIds.length) {
          db.run("ROLLBACK");
          return res.status(400).json({ error: "Some selected SP no are invalid for this part" });
        }

        const transferPieceQty = (serialRows || []).reduce((sum, row) => sum + (Number(row.remaining_qty) || 0), 0);
        if (transferPieceQty <= 0) {
          db.run("ROLLBACK");
          return res.status(400).json({ error: "Selected SP no do not have transferable quantity" });
        }

        const serialNosForNotification = (serialRows || []).map((row) => row.serial_no).filter(Boolean).join(", ") || "-";
        const sumPrice = (serialRows || []).reduce((sum, row) => sum + (Number(row.price) || 0), 0);
        const avgPrice = (serialRows || []).length > 0 ? sumPrice / (serialRows || []).length : (part.price || 0);
        const conversionRate = Math.max(1, Number(part.conversion_rate) || 1);

        db.run(
          `UPDATE spare_parts
           SET quantity = quantity - ?,
               piece_stock = CASE
                 WHEN COALESCE(piece_stock, quantity) - ? < 0 THEN 0
                 ELSE COALESCE(piece_stock, quantity) - ?
               END
           WHERE id = ?`,
          [transferQty, transferPieceQty, transferPieceQty, part_id],
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

                const moveSerialsToTarget = (targetPartId) => {
                  db.run(
                    `UPDATE spare_part_items SET part_id = ? WHERE id IN (${placeholders})`,
                    [targetPartId, ...selectedSerialIds],
                    (moveErr) => {
                      if (moveErr) {
                        db.run("ROLLBACK");
                        return res.status(500).json({ error: moveErr.message });
                      }

                      const moveSql = "INSERT INTO stock_movements (part_id, movement_type, quantity, department, receiver, receipt_number, note, user_id, price) VALUES (?, 'TRANSFER', ?, 'INTERNAL', 'SYSTEM', '-', ?, ?, ?)";
                      const moveNote = `Transfer to warehouse ID ${target_warehouse_id}. ${note || ""}`;
                      db.run(moveSql, [part_id, transferQty, moveNote, userId, avgPrice], (smErr) => {
                        if (smErr) console.error("[TRANSFER] Failed to log movement:", smErr.message);
                        db.run("COMMIT");
                      });

                      db.all("SELECT id, name FROM warehouses WHERE id IN (?, ?)", [part.warehouseId || 0, target_warehouse_id], (wErr, warehouseRows) => {
                        if (!wErr) {
                          const warehouseMap = new Map((warehouseRows || []).map((row) => [Number(row.id), row.name]));
                          sendTeamsNotification({
                            type: "TRANSFER",
                            partName: part.name,
                            quantity: transferQty,
                            user: req.user?.username || "System",
                            warehouse: warehouseMap.get(Number(target_warehouse_id)) || String(target_warehouse_id),
                            sourceWarehouse: warehouseMap.get(Number(part.warehouseId)) || String(part.warehouseId || "-"),
                            destinationWarehouse: warehouseMap.get(Number(target_warehouse_id)) || String(target_warehouse_id),
                            serialNos: serialNosForNotification,
                            note: note || "-"
                          });
                        }
                      });

                      logActivity(userId, "TRANSFER", `Transferred ${transferQty} of ${part.part_no} to warehouse ${target_warehouse_id} with ${selectedSerialIds.length} SP no`);
                      res.json({ message: "Transfer completed" });
                    }
                  );
                };

                if (targetPart) {
                  db.run(
                    "UPDATE spare_parts SET quantity = quantity + ?, piece_stock = COALESCE(piece_stock, quantity) + ? WHERE id = ?",
                    [transferQty, transferPieceQty, targetPart.id],
                    (saveErr) => {
                      if (saveErr) {
                        db.run("ROLLBACK");
                        return res.status(500).json({ error: saveErr.message });
                      }
                      moveSerialsToTarget(targetPart.id);
                    }
                  );
                  return;
                }

                db.run(
                  `INSERT INTO spare_parts (part_no, name, description, quantity, unit_type, conversion_rate, piece_stock, price, warehouseId)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                  [part.part_no, part.name, part.description, transferQty, normalizeUnitType(part.unit_type), conversionRate, transferPieceQty, part.price, target_warehouse_id],
                  function (insertErr) {
                    if (insertErr) {
                      db.run("ROLLBACK");
                      return res.status(500).json({ error: insertErr.message });
                    }
                    moveSerialsToTarget(this.lastID);
                  }
                );
              }
            );
          }
        );
      });
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

app.get("/report/monthly-usage", authenticateToken, (req, res) => {
  const sql = `
    SELECT strftime('%Y-%m', movement_date) as month, SUM(quantity) as total 
    FROM stock_movements 
    WHERE movement_type IN ('OUT', 'BORROW') 
    GROUP BY month 
    ORDER BY month ASC
    LIMIT 12
  `;
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});


// --- Static File Serving ---
app.use(express.static(__dirname));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});



app.get("/ping", (req, res) => res.json({ message: "pong", version: "2.2" }));

app.get("/api/lookup/serial/:serialNo", authenticateToken, (req, res) => {
  const serialNo = String(req.params.serialNo || "").trim();
  if (!serialNo) return res.status(400).json({ error: "Serial number required" });
  
  const sql = `
    SELECT spi.serial_no, spi.status, spi.remaining_qty, spi.initial_qty, spi.last_used_at,
           p.id as part_id, p.name as part_name, p.part_no, p.description, p.unit_type, p.price,
           w.name as warehouse_name
    FROM spare_part_items spi
    JOIN spare_parts p ON spi.part_id = p.id
    LEFT JOIN warehouses w ON p.warehouseId = w.id
    WHERE UPPER(spi.serial_no) LIKE '%' || UPPER(?)
  `;

  db.get(sql, [serialNo], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: "Serial number not found" });
    res.json(row);
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