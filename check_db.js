const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("sparepart.db");
db.all("SELECT id, name, quantity FROM spare_parts WHERE id = 164", [], (err, rows) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    console.log(JSON.stringify(rows, null, 2));
    db.close();
});
