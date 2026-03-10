const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('sparepart.db');
db.serialize(() => {
  db.each("SELECT count(*) as count FROM spare_parts", (err, row) => console.log("Spare Parts:", row.count));
  db.each("SELECT count(*) as count FROM movements", (err, row) => console.log("Movements:", row.count)).catch(() => console.log("Movements table not found"));
  db.each("SELECT count(*) as count FROM stock_movements", (err, row) => console.log("Stock Movements:", row.count));
  db.each("SELECT count(*) as count FROM users", (err, row) => console.log("Users:", row.count));
  db.each("SELECT count(*) as count FROM warehouses", (err, row) => console.log("Warehouses:", row.count));
});
db.close();
