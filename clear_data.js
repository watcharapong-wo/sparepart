const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'sparepart.db');
const db = new sqlite3.Database(dbPath);

console.log('--- DATA CLEANUP START ---');

db.serialize(() => {
  db.run('BEGIN TRANSACTION');

  // Tables to clear
  const tables = [
    'movement_items',
    'stock_movements',
    'spare_part_items',
    'spare_parts',
    'activity_logs'
  ];

  tables.forEach(table => {
    db.run(`DELETE FROM ${table}`, (err) => {
      if (err) {
        console.error(`Error clearing ${table}:`, err.message);
      } else {
        console.log(`Cleared table: ${table}`);
      }
    });
    
    // Reset auto-increment
    db.run(`DELETE FROM sqlite_sequence WHERE name = '${table}'`, (err) => {
        if (!err) console.log(`Reset auto-increment for: ${table}`);
    });
  });

  db.run('COMMIT', (err) => {
    if (err) {
      console.error('Final commit error:', err.message);
    } else {
      console.log('--- CLEANUP COMPLETED SUCCESSFULLY ---');
    }
    db.close();
  });
});
