const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.join(__dirname, "sparepart.db");
const db = new sqlite3.Database(dbPath);

console.log("Starting database cleanup...");

const tablesToClear = ["spare_parts", "stock_movements", "activity_logs"];

db.serialize(() => {
  tablesToClear.forEach((table) => {
    db.run(`DELETE FROM ${table}`, (err) => {
      if (err) {
        console.error(`Error clearing table ${table}:`, err.message);
      } else {
        console.log(`Table ${table} cleared successfully.`);
        // Reset autoincrement
        db.run(`DELETE FROM sqlite_sequence WHERE name='${table}'`, (err2) => {
           if (!err2) console.log(`Autoincrement reset for ${table}`);
        });
      }
    });
  });
});

db.close((err) => {
  if (err) console.error(err.message);
  else console.log("Database connection closed. Cleanup complete.");
});
