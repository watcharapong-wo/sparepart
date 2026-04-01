const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('sparepart.db');
db.all('SELECT p.id, p.part_no, p.name, p.quantity, w.name as warehouse FROM spare_parts p JOIN warehouses w ON p.warehouseId = w.id WHERE p.name LIKE "Mouse%" OR p.part_no LIKE "Mouse%"', [], (err, rows) => {
    if (err) {
        console.error(err);
    } else {
        console.table(rows);
    }
    db.close();
});
