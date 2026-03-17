const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'sparepart.db');
const db = new sqlite3.Database(dbPath);

const sql = `
  SELECT w.name AS warehouse_name, SUM(p.quantity * p.price) AS total_value
  FROM spare_parts p
  LEFT JOIN warehouses w ON p.warehouseId = w.id
  GROUP BY w.name
`;

const sqlTotal = "SELECT SUM(quantity * price) AS stock_value FROM spare_parts";

console.log('--- Inventory Value by Warehouse ---');
db.all(sql, [], (err, rows) => {
  if (err) console.error(err);
  else console.table(rows);

  db.get(sqlTotal, [], (errT, rowT) => {
    console.log('--- Total Inventory Value ---');
    console.log(rowT);
    db.close();
  });
});
