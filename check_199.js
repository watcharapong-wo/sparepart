const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('sparepart.db');
db.get("SELECT * FROM spare_parts WHERE id = 199", (err, row) => {
  if (err) console.error(err);
  else console.log(row);
});
