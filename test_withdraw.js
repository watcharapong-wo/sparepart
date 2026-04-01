const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('sparepart.db');
const sql = "SELECT p.name, m.department, SUM(m.quantity) as total_qty FROM stock_movements m JOIN spare_parts p ON m.part_id = p.id WHERE m.movement_type IN ('OUT', 'BORROW') GROUP BY p.name, m.department ORDER BY total_qty DESC LIMIT 10";
db.all(sql, [], (err, rows) => {
  if (err) {
    console.error(err);
  } else {
    console.log(JSON.stringify(rows, null, 2));
  }
  db.close();
});
