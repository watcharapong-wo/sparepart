const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('sparepart.db');
db.all("PRAGMA table_info(movement_items)", (err, rows) => {
  if (err) {
    console.error(err);
  } else {
    console.log(JSON.stringify(rows));
  }
  db.close();
});
