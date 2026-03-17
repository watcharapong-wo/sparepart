const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'sparepart.db');
const db = new sqlite3.Database(dbPath);

console.log('--- Checking Users ---');
db.all('SELECT id, username, role FROM users', (err, rows) => {
  if (err) console.error(err);
  else console.table(rows);

  console.log('--- Checking Warehouses ---');
  db.all('SELECT * FROM warehouses', (errW, rowsW) => {
    if (errW) console.error(errW);
    else console.table(rowsW);
    db.close();
  });
});
