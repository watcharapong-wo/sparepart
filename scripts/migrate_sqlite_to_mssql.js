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

async function insertRows(pool, tableName, rows) {
  if (!rows.length) {
    console.log(`Skipping ${tableName}: no rows`);
    return;
  }

  const columns = Object.keys(rows[0]);
  const hasIdentityColumn = columns.includes("id") && identityTables.has(tableName);

  if (hasIdentityColumn) {
    await pool.request().query(`SET IDENTITY_INSERT ${quoteIdentifier(tableName)} ON`);
  }

  try {
    for (const row of rows) {
      const request = pool.request();
      const valuesSql = columns.map((column, index) => {
        const paramName = `p${index}`;
        request.input(paramName, row[column]);
        return `@${paramName}`;
      }).join(", ");

      const insertSql = `INSERT INTO ${quoteIdentifier(tableName)} (${columns.map(quoteIdentifier).join(", ")}) VALUES (${valuesSql})`;
      await request.query(insertSql);
    }
  } finally {
    if (hasIdentityColumn) {
      await pool.request().query(`SET IDENTITY_INSERT ${quoteIdentifier(tableName)} OFF`);
    }
  }

  console.log(`Inserted ${rows.length} row(s) into ${tableName}`);
}

async function main() {
  const sqliteDb = new sqlite3.Database(sqlitePath);
  let pool;

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
