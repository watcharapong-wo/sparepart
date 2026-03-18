const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('sparepart.db');

db.serialize(() => {
  db.all(`SELECT p.id, p.name, p.part_no, s.serial_no
          FROM spare_parts p
          LEFT JOIN spare_part_items s ON p.id = s.part_id
          ORDER BY p.id, s.serial_no`, (err, rows) => {
    if (err) {
      console.error('Query error:', err);
      return;
    }
    if (rows.length === 0) {
      console.log('No parts or serial numbers found.');
      return;
    }
    let lastPartId = null;
    rows.forEach(row => {
      if (row.id !== lastPartId) {
        console.log(`\nPart: ${row.name} (${row.part_no}) [ID: ${row.id}]`);
        lastPartId = row.id;
      }
      if (row.serial_no) {
        console.log(`  SP no: ${row.serial_no}`);
      }
    });
  });
});
db.close();
