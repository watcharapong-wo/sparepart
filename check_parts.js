const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('sparepart.db');
db.all('SELECT id, part_no, name, description, quantity, warehouseId, unit_type FROM spare_parts WHERE id IN (77, 137)', [], (err, rows) => {
    if (err) {
        console.error(err);
    } else {
        console.table(rows);
    }
    db.close();
});
