const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('sparepart.db');

const partNo = 'Mouse USB'; // From screenshot
const serialNo = 'SPS2506009';

console.log(`Checking Part: ${partNo}, Serial: ${serialNo}`);

db.all(`SELECT id, name, part_no, quantity, piece_stock FROM spare_parts WHERE part_no = ? OR name LIKE ?`, [partNo, `%${partNo}%`], (err, parts) => {
    if (err) return console.error(err);
    console.log('--- Spare Parts ---');
    console.table(parts);

    if (parts.length > 0) {
        const partIds = parts.map(p => p.id);
        const placeholders = partIds.map(() => '?').join(',');
        
        db.all(`SELECT id, part_id, serial_no, status, initial_qty, remaining_qty FROM spare_part_items WHERE part_id IN (${placeholders})`, partIds, (err, items) => {
            if (err) return console.error(err);
            console.log('\n--- Spare Part Items (Serials) ---');
            console.table(items.filter(i => (i.serial_no === serialNo || parts.find(p => p.id === i.part_id))));

            db.all(`SELECT m.id, m.part_id, m.movement_type, m.quantity, m.movement_date, mi.used_qty, mi.before_qty, mi.after_qty, spi.serial_no
                    FROM stock_movements m
                    JOIN movement_items mi ON m.id = mi.movement_id
                    JOIN spare_part_items spi ON mi.item_id = spi.id
                    WHERE spi.serial_no = ? OR m.part_id IN (${placeholders})
                    ORDER BY m.movement_date DESC`, [serialNo, ...partIds], (err, movements) => {
                if (err) return console.error(err);
                console.log('\n--- Related Movements ---');
                console.table(movements);
                db.close();
            });
        });
    } else {
        console.log('No matching part found.');
        db.close();
    }
});
