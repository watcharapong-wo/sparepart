const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('sparepart.db');

db.serialize(() => {
  db.run("BEGIN TRANSACTION");

  // 1. Find duplicate groups (Name, Part No, Description, Warehouse)
  db.all(
    `SELECT name, part_no, description, warehouseId, COUNT(*) as count 
     FROM spare_parts 
     GROUP BY name, part_no, description, warehouseId 
     HAVING count > 1`,
    [],
    (err, groups) => {
      if (err) {
        console.error("Failed to find duplicates:", err.message);
        db.run("ROLLBACK");
        return;
      }

      console.log(`Found ${groups.length} groups of duplicates with identical Name, Type, and Details.`);

      let groupsProcessed = 0;
      if (groups.length === 0) {
        db.run("COMMIT");
        console.log("No further duplicates found with exact matching details.");
        return;
      }

      groups.forEach((group) => {
        db.all(
          "SELECT id, quantity, piece_stock FROM spare_parts WHERE name = ? AND part_no = ? AND description = ? AND warehouseId = ? ORDER BY id ASC",
          [group.name, group.part_no, group.description, group.warehouseId],
          (err, rows) => {
            if (err) {
              console.error(`Error fetching group ${group.name}:`, err.message);
              return;
            }

            const masterId = rows[0].id;
            const duplicateIds = rows.slice(1).map(r => r.id);
            const placeholders = duplicateIds.map(() => "?").join(",");

            console.log(`Consolidating ${group.name} (${group.part_no}: ${group.description}) -> Master ID: ${masterId}`);

            db.run(
              `UPDATE spare_part_items SET part_id = ? WHERE part_id IN (${placeholders})`,
              [masterId, ...duplicateIds],
              (err) => {
                db.run(
                  `UPDATE stock_movements SET part_id = ? WHERE part_id IN (${placeholders})`,
                  [masterId, ...duplicateIds],
                  (err) => {
                    const totalPieceStock = rows.reduce((sum, r) => sum + (r.piece_stock || 0), 0);
                    const totalQuantity = rows.reduce((sum, r) => sum + (r.quantity || 0), 0);

                    db.run(
                      "UPDATE spare_parts SET quantity = ?, piece_stock = ? WHERE id = ?",
                      [totalQuantity, totalPieceStock, masterId],
                      () => {
                        db.run(`DELETE FROM spare_parts WHERE id IN (${placeholders})`, duplicateIds, () => {
                          groupsProcessed++;
                          if (groupsProcessed === groups.length) {
                            db.run("COMMIT");
                            console.log("Refined consolidation COMPLETED.");
                          }
                        });
                      }
                    );
                  }
                );
              }
            );
          }
        );
      });
    }
  );
});
