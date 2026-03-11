const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const path = require("path");

const app = express();
const PORT = 4001;
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

// ใช้ Middleware
app.use(cors());
app.use(express.json());

// --- Static File Serving ---
app.use(express.static("."));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});
// ---------------------------

// Log all requests
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

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
}

// Seed immediately
seedData();

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
  db.all("SELECT SUM(quantity * price) AS stock_value FROM spare_parts", [], (err, row) => {
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
  db.all("SELECT * FROM spare_parts WHERE quantity < 10", [], (err, rows) => {
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
      l.*, 
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

app.get("/report/movements3", authenticateToken, requireRole(["admin", "co-admin", "staff", "viewer"]), (req, res) => {
  const sql = `
    SELECT 
      m.id,
      m.movement_date,
      m.movement_type,
      m.quantity,
      m.due_date,
      m.note,
      m.department,
      m.receiver,
      m.receipt_number,
      u.username,
      u.role,
      p.part_no,
      p.name AS part_name,
      p.warehouseId
    FROM stock_movements m
    LEFT JOIN users u ON u.id = m.user_id
    JOIN spare_parts p ON p.id = m.part_id
    ORDER BY m.movement_date DESC, m.id DESC
  `;
  db.all(sql, [], (err, rows) => {
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
  const sql = `
    SELECT w.name AS warehouse_name, SUM(m.quantity * p.price) AS total_expense
    FROM stock_movements m
    JOIN spare_parts p ON m.part_id = p.id
    JOIN warehouses w ON p.warehouseId = w.id
    WHERE m.movement_type = 'OUT'
    GROUP BY w.name
  `;
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get("/report/movement-trends", authenticateToken, (req, res) => {
  const sql = `
    SELECT 
      date(movement_date) as date,
      movement_type,
      SUM(quantity) as total_qty
    FROM stock_movements
    WHERE movement_date >= date('now', '-7 days')
    GROUP BY date(movement_date), movement_type
    ORDER BY date ASC
  `;
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get("/report/monthly-comparison", authenticateToken, (req, res) => {
  const sql = `
    SELECT 
      strftime('%Y-%m', movement_date) as month,
      movement_type,
      SUM(quantity) as total_qty
    FROM stock_movements
    WHERE movement_date >= date('now', 'start of month', '-1 month')
    GROUP BY strftime('%Y-%m', movement_date), movement_type
    ORDER BY month ASC
  `;
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// [NEW] รายงานการเบิกแยกตามบัญชีผู้รับ (Receiver)
app.get("/report/withdraw-by-account", authenticateToken, (req, res) => {
  const sql = `
    SELECT 
      receiver, 
      SUM(quantity) as total_qty
    FROM stock_movements
    WHERE movement_type IN ('OUT', 'BORROW')
      AND receiver IS NOT NULL
      AND TRIM(receiver) <> ''
    GROUP BY receiver
    ORDER BY total_qty DESC
    LIMIT 10
  `;
  db.all(sql, [], (err, rows) => {
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
    ORDER BY p.part_no
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
    const { part_no, name, description = null, quantity, price = null, warehouseId } = req.body;

    if (!part_no || !name || !Number.isInteger(quantity)) {
      return res.status(400).json({ error: "BAD_REQUEST" });
    }

    db.run(
      `INSERT INTO spare_parts (part_no, name, description, quantity, price, warehouseId)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [String(part_no), String(name), description, quantity, price, warehouseId],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        logActivity(req.user.userId, "CREATE_PART", `Created part: ${part_no} - ${name} with quantity: ${quantity}`);
        res.status(201).json({ id: this.lastID });
      }
    );
  }
);

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

  db.run("DELETE FROM spare_parts WHERE id = ?", [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: "Spare part not found" });
    logActivity(req.user.userId, "DELETE_PART", `Deleted part ID ${id}`);
    res.json({ message: "Spare part deleted successfully", id });
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

// API สำหรับบันทึกการเคลื่อนไหวของสต็อก
app.post(
  "/stock-movements",
  authenticateToken,
  requireRole(["admin", "co-admin", "staff"]),
  (req, res) => {
    const { part_id, movement_type, quantity, note, department, receiver, receipt_number, due_date } = req.body;

    // Trim fields
    const dep = (department || "").trim();
    const rec = (receiver || "").trim();
    const rn  = (receipt_number || "").trim();
    const nt  = (note || "").trim();
    const dd  = (due_date || "").trim();

    // ตรวจสอบค่าที่ได้รับ
    const validTypes = ["IN", "OUT", "BORROW", "RETURN"];
    if (!part_id || !movement_type || !validTypes.includes(movement_type) || !Number.isInteger(quantity)) {
      return res.status(400).json({ error: "BAD_REQUEST" });
    }

    // Role check for "IN" movement (Only admin/co-admin)
    if (movement_type === "IN") {
      if (!["admin", "co-admin"].includes(req.user.role)) {
        return res.status(403).json({ error: "FORBIDDEN_ACTION_FOR_ROLE" });
      }
    }
 
    // BORROW and RETURN behave like OUT/IN but with specific tracking. 
    // We require receiver details for non-"IN" movements for better audit trails.
    if (["OUT", "BORROW", "RETURN"].includes(movement_type)) {
      if (!dep || !rec || !rn) return res.status(400).json({ error: "FIELDS_REQUIRED" });
    }
 
    // ธุรกรรมเดียว ป้องกันสต็อกติดลบ
    db.serialize(() => {
      db.run("BEGIN IMMEDIATE TRANSACTION");
 
      db.get("SELECT quantity FROM spare_parts WHERE id = ?", [part_id], (err, part) => {
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
          [part_id, movement_type, quantity, nt || null, dep || null, rec || null, rn || null, req.user.userId, dd || null, movement_type === "BORROW" ? "pending" : null],
          function (err2) {
            if (err2) return db.run("ROLLBACK", () => res.status(500).json({ error: err2.message }));

            db.run("UPDATE spare_parts SET quantity = ? WHERE id = ?", [newQty, part_id], (err3) => {
              if (err3) return db.run("ROLLBACK", () => res.status(500).json({ error: err3.message }));

              db.run("COMMIT", () => {
                logActivity(req.user.userId, "STOCK_MOVEMENT", `${movement_type}: ${quantity} units for part ID ${part_id}. Receiver: ${rec}, Request: ${rn}`);
                res.status(201).json({ message: "OK", movement_id: this.lastID, newQty });
              });
            });
          }
        );
      });
    });
  }
);
// GET overdue borrows
app.get("/report/overdue", authenticateToken, (req, res) => {
  const sql = `
    SELECT sm.*, sp.name as part_name, sp.part_no
    FROM stock_movements sm
    JOIN spare_parts sp ON sm.part_id = sp.id
    WHERE sm.movement_type = 'BORROW' 
    AND sm.return_status = 'pending'
    AND sm.due_date < datetime('now', 'localtime')
    ORDER BY sm.due_date ASC
  `;
  db.all(sql, [], (err, rows) => {
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