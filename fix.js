const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('database.sqlite');
db.run(`UPDATE stock_movements SET unit_type = 'PC' WHERE unit_type IN ('PAC', 'BOX') AND movement_type IN ('OUT', 'BORROW', 'RETURN')`, function(err) {
  if (err) console.error(err);
  else console.log('Updated ' + this.changes + ' rows');
});
