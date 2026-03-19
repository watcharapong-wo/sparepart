const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const sql = require("mssql");
const dbConfig = require("../db/config");

const sqlitePath = path.resolve(dbConfig.sqlite.filePath);
const tables = [
  "warehouses",
  "users",
  "movement_reasons",
  "system_config",
  "spare_parts",
  "spare_part_items",
  "stock_movements",
  "movement_items",
  "activity_logs"
];

const identityTables = new Set([
  "warehouses",
  "users",
  "movement_reasons",
  "spare_parts",
  "spare_part_items",
  "stock_movements",
  "movement_items",
  "activity_logs"
]);

function sqliteAll(db, query) {
  return new Promise((resolve, reject) => {
    db.all(query, [], (error, rows) => {
      if (error) reject(error);
      else resolve(rows);
    });
  });
}

function quoteIdentifier(identifier) {
  return `[${String(identifier).replace(/]/g, "]]")}]`;
}

function toSqlLiteral(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  if (value instanceof Date) return `N'${value.toISOString().replace(/'/g, "''")}'`;
  return `N'${String(value).replace(/'/g, "''")}'`;
}

async function insertRows(pool, tableName, rows) {
  if (!rows.length) {
    console.log(`Skipping ${tableName}: no rows`);
    return;
  }

  const columns = Object.keys(rows[0]);
  const hasIdentityColumn = columns.includes("id") && identityTables.has(tableName);
  const targetTable = `[dbo].${quoteIdentifier(tableName)}`;

  if (hasIdentityColumn) {
    const rowsSql = rows.map((row) => {
      const valuesSql = columns.map((column) => toSqlLiteral(row[column])).join(", ");
      return `INSERT INTO ${targetTable} (${columns.map(quoteIdentifier).join(", ")}) VALUES (${valuesSql});`;
    }).join("\n");

    const batchSql = `SET IDENTITY_INSERT ${targetTable} ON;\n${rowsSql}\nSET IDENTITY_INSERT ${targetTable} OFF;`;
    await pool.request().batch(batchSql);
    console.log(`Inserted ${rows.length} row(s) into ${tableName}`);
    return;
  }

  for (const row of rows) {
    const request = pool.request();
    const valuesSql = columns.map((column, index) => {
      const paramName = `p${index}`;
      request.input(paramName, row[column]);
      return `@${paramName}`;
    }).join(", ");

    const insertSql = `INSERT INTO ${targetTable} (${columns.map(quoteIdentifier).join(", ")}) VALUES (${valuesSql})`;
    await request.query(insertSql);
  }

  console.log(`Inserted ${rows.length} row(s) into ${tableName}`);
}

async function main() {
  const sqliteDb = new sqlite3.Database(sqlitePath);
  let pool;
  let sourceSparePartIds = new Set();
  let sourceUserIds = new Set();
  let sourceSparePartItemIds = new Set();
  let sourceStockMovementIds = new Set();

  try {
    pool = await sql.connect({
      server: dbConfig.mssql.server,
      port: dbConfig.mssql.port,
      database: dbConfig.mssql.database,
      user: dbConfig.mssql.user,
      password: dbConfig.mssql.password,
      options: dbConfig.mssql.options,
      pool: dbConfig.mssql.pool
    });

    console.log(`Reading SQLite data from ${sqlitePath}`);

    for (const tableName of tables) {
      const rows = await sqliteAll(sqliteDb, `SELECT * FROM ${tableName}`);

      if (tableName === "spare_parts") {
        sourceSparePartIds = new Set(rows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id)));
      }

      if (tableName === "users") {
        sourceUserIds = new Set(rows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id)));
      }

      if (tableName === "spare_part_items") {
        const filteredRows = rows.filter((row) => sourceSparePartIds.has(Number(row.part_id)));
        const skipped = rows.length - filteredRows.length;
        if (skipped > 0) {
          console.warn(`Skipping ${skipped} orphan row(s) in spare_part_items due to missing spare_parts reference`);
        }
        await insertRows(pool, tableName, filteredRows);
        sourceSparePartItemIds = new Set(filteredRows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id)));
        continue;
      }

      if (tableName === "stock_movements") {
        const filteredRows = rows.filter((row) => {
          const partOk = sourceSparePartIds.has(Number(row.part_id));
          const userOk = row.user_id === null || row.user_id === undefined || sourceUserIds.has(Number(row.user_id));
          return partOk && userOk;
        });
        const skipped = rows.length - filteredRows.length;
        if (skipped > 0) {
          console.warn(`Skipping ${skipped} orphan row(s) in stock_movements due to missing part/user reference`);
        }
        await insertRows(pool, tableName, filteredRows);
        sourceStockMovementIds = new Set(filteredRows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id)));
        continue;
      }

      if (tableName === "movement_items") {
        const filteredRows = rows.filter((row) => {
          const movementOk = sourceStockMovementIds.has(Number(row.movement_id));
          const itemOk = sourceSparePartItemIds.has(Number(row.item_id));
          return movementOk && itemOk;
        });
        const skipped = rows.length - filteredRows.length;
        if (skipped > 0) {
          console.warn(`Skipping ${skipped} orphan row(s) in movement_items due to missing movement/item reference`);
        }
        await insertRows(pool, tableName, filteredRows);
        continue;
      }

      if (tableName === "activity_logs") {
        const filteredRows = rows.filter((row) => {
          return row.user_id === null || row.user_id === undefined || sourceUserIds.has(Number(row.user_id));
        });
        const skipped = rows.length - filteredRows.length;
        if (skipped > 0) {
          console.warn(`Skipping ${skipped} orphan row(s) in activity_logs due to missing user reference`);
        }
        await insertRows(pool, tableName, filteredRows);
        continue;
      }

      await insertRows(pool, tableName, rows);
    }

    console.log("SQLite to MSSQL migration completed.");
  } catch (error) {
    console.error("Migration failed:", error.message);
    process.exitCode = 1;
  } finally {
    sqliteDb.close();
    if (pool) {
      await pool.close();
    }
  }
}

main();
