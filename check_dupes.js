const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('sparepart.db');
db.all('SELECT serial_no, COUNT(*) as count FROM spare_part_items GROUP BY serial_no HAVING count > 1', [], (err, rows) => {
    if (err) {
        console.error(err);
    } else {
        console.log('Duplicates found:', rows);
        if (rows.length > 0) {
            const serials = rows.map(r => r.serial_no);
            const placeholders = serials.map(() => '?').join(',');
            db.all(`SELECT id, part_id, serial_no, remaining_qty, status FROM spare_part_items WHERE serial_no IN (${placeholders})`, serials, (err2, items) => {
                console.log('Details:');
                console.table(items);
                db.close();
            });
        } else {
            db.close();
        }
    }
});
