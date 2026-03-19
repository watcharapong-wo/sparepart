const sql = require("mssql");
const dbConfig = require("./db/config");

async function main() {
  const config = {
    server: dbConfig.mssql.server,
    port: dbConfig.mssql.port,
    database: dbConfig.mssql.database,
    user: dbConfig.mssql.user,
    password: dbConfig.mssql.password,
    options: dbConfig.mssql.options,
    pool: dbConfig.mssql.pool
  };

  let pool;
  try {
    pool = await sql.connect(config);
    const result = await pool.request().query("SELECT DB_NAME() AS database_name, @@SERVERNAME AS server_name");
    console.log("MSSQL connection successful");
    console.table(result.recordset);
  } catch (error) {
    console.error("MSSQL connection failed:", error.message);
    process.exitCode = 1;
  } finally {
    if (pool) {
      await pool.close();
    }
  }
}

main();
