const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('sparepart.db');
db.serialize(() => {
  db.get("SELECT COUNT(*) as count FROM spare_parts", (err, row) => {
    if (err) return console.error(err);
    console.log("Current spare parts:", row.count);
    if (row.count === 0) {
      console.log("Seeding initial parts...");
      db.run("INSERT INTO spare_parts (part_no, name, description, quantity, price, warehouseId) VALUES ('ITEM-001', 'Ram NB', '8GB DDR4', 15, 1200, 1)");
      db.run("INSERT INTO spare_parts (part_no, name, description, quantity, price, warehouseId) VALUES ('ITEM-002', 'SSD 500GB', 'SATA 3', 5, 1800, 1)");
      db.run("INSERT INTO spare_parts (part_no, name, description, quantity, price, warehouseId) VALUES ('ITEM-003', 'Ram Desktop', '16GB DDR4', 2, 2500, 2)");
      console.log("Done seeding.");
    }
  });
});
db.close();
