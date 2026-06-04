const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('sparepart.db');
db.all("SELECT * FROM stock_movements WHERE movement_type IN ('OUT', 'BORROW', 'RETURN') ORDER BY id DESC LIMIT 5", (err, rows) => {
  if (err) console.error(err);
  else console.log(rows);
});
