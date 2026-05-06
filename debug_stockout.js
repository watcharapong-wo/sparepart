const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'sparepart.db');
const db = new sqlite3.Database(dbPath);

// Find the part
db.get(`
  SELECT id, part_no, name, quantity, piece_stock, unit_type, conversion_rate 
  FROM spare_parts 
  WHERE part_no LIKE '%LINK%' OR name LIKE '%CAT5E%'
  LIMIT 1
`, (err, part) => {
  if (err || !part) {
    console.log('No RJ45 part found:', err?.message);
    db.close();
    process.exit(0);
  }

  console.log('\n=== PART INFO ===');
  console.table([part]);

  // Check items
  db.all(`
    SELECT id, serial_no, initial_qty, remaining_qty, status 
    FROM spare_part_items 
    WHERE part_id = ? 
    ORDER BY id
  `, [part.id], (err, items) => {
    console.log('\n=== SPARE PART ITEMS ===');
    if (items) console.table(items);

    // Check movements
    db.all(`
      SELECT id, movement_type, quantity, movement_date
      FROM stock_movements
      WHERE part_id = ?
      ORDER BY movement_date DESC
      LIMIT 5
    `, [part.id], (err, movements) => {
      console.log('\n=== RECENT MOVEMENTS ===');
      if (movements) console.table(movements);

      // Check movement items
      db.all(`
        SELECT mi.id, mi.movement_id, mi.item_id, mi.used_qty, mi.before_qty, mi.after_qty,
               spi.serial_no, sm.movement_type
        FROM movement_items mi
        JOIN spare_part_items spi ON mi.item_id = spi.id
        JOIN stock_movements sm ON mi.movement_id = sm.id
        WHERE spi.part_id = ?
        ORDER BY sm.movement_date DESC
        LIMIT 10
      `, [part.id], (err, movementItems) => {
        console.log('\n=== MOVEMENT ITEMS LOG ===');
        if (movementItems) console.table(movementItems);
        db.close();
      });
    });
  });
});
