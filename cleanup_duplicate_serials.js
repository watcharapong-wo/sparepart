const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('sparepart.db');

console.log('--- Scanning for Duplicate Serial Numbers across different lots ---');

db.all(`
  SELECT serial_no, COUNT(*) as count 
  FROM spare_part_items 
  GROUP BY serial_no 
  HAVING count > 1 AND serial_no != 'NO SPS'
`, [], (err, dupes) => {
    if (err) return console.error(err);
    if (!dupes || dupes.length === 0) {
        console.log('No duplicates found (excluding "NO SPS").');
        db.close();
        return;
    }

    const serials = dupes.map(d => d.serial_no);
    const placeholders = serials.map(() => '?').join(',');

    db.all(`
      SELECT spi.id, spi.part_id, spi.serial_no, spi.remaining_qty, spi.status, p.name as part_name, p.price, p.warehouseId
      FROM spare_part_items spi
      JOIN spare_parts p ON spi.part_id = p.id
      WHERE spi.serial_no IN (${placeholders})
      ORDER BY spi.serial_no, spi.id
    `, serials, (err2, items) => {
        if (err2) return console.error(err2);

        console.log('\nFound the following redundancies:');
        const groups = {};
        items.forEach(item => {
            if (!groups[item.serial_no]) groups[item.serial_no] = [];
            groups[item.serial_no].push(item);
        });

        const toDeleteIds = [];
        
        Object.keys(groups).forEach(sn => {
            console.log(`\nSerial: ${sn}`);
            const list = groups[sn];
            list.forEach(item => {
                console.log(`  - ID: ${item.id} | Part: ${item.part_name} | Price: ${item.price} | Status: ${item.status} (${item.remaining_qty} remaining)`);
            });

            // Logic: If one is consumed (qty 0) and others are available (qty > 0)
            // Suggest deleting the available ones for this specific item if it was meant to be only one.
            const consumed = list.find(i => i.remaining_qty === 0);
            const available = list.filter(i => i.remaining_qty > 0);

            if (consumed && available.length > 0) {
                console.log(`    [SUGGESTION] This item was consumed in ID ${consumed.id}. Available duplicates in other lots may be errors.`);
                available.forEach(a => toDeleteIds.push(a.id));
            }
        });

        if (toDeleteIds.length > 0) {
            console.log(`\n--- Recommendations ---`);
            console.log(`Suggested to remove ${toDeleteIds.length} redundant "available" records that have a corresponding "consumed" record.`);
            console.log(`Run with DELETE_DUPLICATES=true to execute.`);
            
            if (process.env.DELETE_DUPLICATES === 'true') {
                const delPlaceholders = toDeleteIds.map(() => "?").join(",");
                db.run(`DELETE FROM spare_part_items WHERE id IN (${delPlaceholders})`, toDeleteIds, function(delErr) {
                    if (delErr) console.error('Delete error:', delErr.message);
                    else console.log(`\nSuccessfully removed ${this.changes} redundant items.`);
                    db.close();
                });
            } else {
                db.close();
            }
        } else {
            console.log('\nNo obvious "Consumed vs Available" duplicates found to auto-cleanup.');
            db.close();
        }
    });
});
