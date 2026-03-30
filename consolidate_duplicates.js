const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('sparepart.db');

db.serialize(() => {
  db.run("BEGIN TRANSACTION");

  // 1. Find duplicate groups (Name, Part No, Warehouse)
  db.all(
    `SELECT name, part_no, warehouseId, COUNT(*) as count 
     FROM spare_parts 
     GROUP BY name, part_no, warehouseId 
     HAVING count > 1`,
    [],
    (err, groups) => {
      if (err) {
        console.error("Failed to find duplicates:", err.message);
        db.run("ROLLBACK");
        return;
      }

      console.log(`Found ${groups.length} groups of duplicates.`);

      let groupsProcessed = 0;
      if (groups.length === 0) {
        db.run("COMMIT");
        console.log("No duplicates found.");
        return;
      }

      groups.forEach((group) => {
        // Find all IDs for this group, sorted by ID ASC (oldest first as Master)
        db.all(
          "SELECT id, quantity, piece_stock FROM spare_parts WHERE name = ? AND part_no = ? AND warehouseId = ? ORDER BY id ASC",
          [group.name, group.part_no, group.warehouseId],
          (err, rows) => {
            if (err) {
              console.error(`Error fetching group ${group.name}:`, err.message);
              return;
            }

            const masterId = rows[0].id;
            const duplicateIds = rows.slice(1).map(r => r.id);
            const placeholders = duplicateIds.map(() => "?").join(",");

            console.log(`Consolidating ${group.name} (${group.part_no}) -> Master ID: ${masterId}, Moving from: ${duplicateIds}`);

            // Move Serial Items
            db.run(
              `UPDATE spare_part_items SET part_id = ? WHERE part_id IN (${placeholders})`,
              [masterId, ...duplicateIds],
              (err) => {
                if (err) console.error("Error moving items:", err.message);

                // Move Movement History
                db.run(
                  `UPDATE stock_movements SET part_id = ? WHERE part_id IN (${placeholders})`,
                  [masterId, ...duplicateIds],
                  (err) => {
                    if (err) console.error("Error moving movements:", err.message);

                    // Recalculate Master Quantity
                    db.get(
                      "SELECT COUNT(*) as total_qty FROM spare_part_items WHERE part_id = ? AND status != 'consumed'",
                      [masterId],
                      (err, countRow) => {
                        const newQty = countRow ? countRow.total_qty : 0;
                        
                        // Piece Stock is basically same or summed (if we assume conversion rate is same)
                        // For simplicity, let's sum them
                        const totalPieceStock = rows.reduce((sum, r) => sum + (r.piece_stock || 0), 0);
                        const totalQuantity = rows.reduce((sum, r) => sum + (r.quantity || 0), 0);

                        db.run(
                          "UPDATE spare_parts SET quantity = ?, piece_stock = ? WHERE id = ?",
                          [totalQuantity, totalPieceStock, masterId],
                          (err) => {
                            if (err) console.error("Error updating master quantity:", err.message);

                            // Delete empty parts
                            db.run(
                              `DELETE FROM spare_parts WHERE id IN (${placeholders})`,
                              duplicateIds,
                              (err) => {
                                if (err) console.error("Error deleting duplicates:", err.message);
                                
                                groupsProcessed++;
                                if (groupsProcessed === groups.length) {
                                  db.run("COMMIT");
                                  console.log("Consolidation COMPLETED successfully.");
                                }
                              }
                            );
                          }
                        );
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
