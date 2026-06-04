const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('sparepart.db');
db.get("SELECT * FROM spare_parts WHERE part_no LIKE '%US-1001%'", (err, row) => {
  if (err) console.error(err);
  else console.log(row);
});
