
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'sparepart.db');
const csvPath = path.join(__dirname, 'Invoice record2025-2026(ALL).csv');

// Configuration
const INCLUDED_PR_TYPES = ['Spare part', 'Asset', 'Hardware'];
const WAREHOUSE_MAP = {
    'LPN1': 1,
    'LPN2': 2
};

const db = new sqlite3.Database(dbPath);

function parseCSVLine(line) {
    const result = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            if (inQuote && line[i + 1] === '"') {
                cur += '"';
                i++;
            } else {
                inQuote = !inQuote;
            }
        } else if (char === ',' && !inQuote) {
            result.push(cur.trim());
            cur = '';
        } else {
            cur += char;
        }
    }
    result.push(cur.trim());
    return result;
}

function parsePrice(priceStr) {
    if (!priceStr) return 0;
    const clean = priceStr.replace(/[",\s]/g, '');
    return parseFloat(clean) || 0;
}

function parseDate(dateStr) {
    if (!dateStr) return new Date().toISOString();
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        const months = {
            'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04', 'May': '05', 'Jun': '06',
            'Jul': '07', 'Aug': '08', 'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
        };
        const day = parts[0].padStart(2, '0');
        const month = months[parts[1]];
        if (!month) return new Date().toISOString();
        const year = '20' + parts[2];
        return `${year}-${month}-${day} 12:00:00`;
    }
    return new Date().toISOString();
}

async function run() {
    console.log('Starting FINAL Breakthrough Import...');
    
    if (!fs.existsSync(csvPath)) {
        console.error(`CSV file not found at: ${csvPath}`);
        return;
    }

    const content = fs.readFileSync(csvPath, 'utf8');
    const allLines = content.split(/\r?\n/);
    console.log(`Found ${allLines.length} lines in CSV.`);

    let importedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        const insertSparePart = db.prepare(`
            INSERT INTO spare_parts (part_no, name, description, quantity, price, warehouseId)
            VALUES (?, ?, ?, 0, ?, ?)
        `);

        const insertMovement = db.prepare(`
            INSERT INTO stock_movements (part_id, movement_type, quantity, movement_date, note, user_id)
            VALUES (?, 'IN', 1, ?, ?, 1)
        `);

        const insertSPItem = db.prepare(`
            INSERT OR IGNORE INTO spare_part_items (part_id, serial_no, status)
            VALUES (?, ?, 'available')
        `);

        const insertMovementItem = db.prepare(`
            INSERT INTO movement_items (movement_id, item_id)
            VALUES (?, ?)
        `);

        // Skip header (line 0)
        for (let i = 1; i < allLines.length; i++) {
            const line = allLines[i];
            if (!line.trim()) continue;

            try {
                const cols = parseCSVLine(line);
                if (cols.length < 18) continue;

                // REAL INDICES from manual view (1-indexed in view_file -> 0-indexed here)
                // 4: Plant -> index 4
                // 15: PR type -> index 15
                // 16: Part type -> index 16
                // 17: Description -> index 17
                // 19: Amount -> index 19
                // 13: S/N No. -> index 13
                // 2: Rec.Date -> index 2

                const warehouseName = cols[4];
                const prType = cols[15];
                const partType = cols[16]; 
                const description = cols[17];
                const price = parsePrice(cols[19]);
                const serialNo = cols[13];
                const recDate = parseDate(cols[2]);

                if (!INCLUDED_PR_TYPES.includes(prType)) {
                    skippedCount++;
                    continue;
                }

                const warehouseId = WAREHOUSE_MAP[warehouseName] || 1;

                insertSparePart.run(partType, description, prType, price, warehouseId, function(err) {
                    if (err) {
                        console.error('Insert spare_parts error:', err);
                        errorCount++;
                        return;
                    }
                    const sparePartId = this.lastID;

                    const noteStr = `Bulk Import [${prType}] - ${partType}`;
                    insertMovement.run(sparePartId, recDate, noteStr, function(err) {
                        if (err) return;
                        const movementId = this.lastID;

                        if (serialNo && serialNo !== '-' && serialNo !== '') {
                            insertSPItem.run(sparePartId, serialNo, function(err) {
                                if (err) return;
                                if (this.changes > 0) {
                                    const itemId = this.lastID;
                                    insertMovementItem.run(movementId, itemId);
                                }
                            });
                        }
                    });
                });

                importedCount++;
            } catch (e) {
                console.error('Error processing line:', e);
                errorCount++;
            }
        }

        insertSparePart.finalize();
        insertMovement.finalize();
        insertSPItem.finalize();
        insertMovementItem.finalize();

        db.run('COMMIT', (err) => {
            if (err) {
                console.error('Import TRANSACTION failed:', err);
            } else {
                console.log(`Import completed.`);
                console.log(`Successfully processed: ${importedCount} items`);
                console.log(`Skipped (other categories): ${skippedCount} items`);
                if (errorCount > 0) console.log(`Errors: ${errorCount}`);
            }
            db.close();
        });
    });
}

run().catch(console.error);
