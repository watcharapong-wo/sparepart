const fs = require("fs");
const path = require("path");

// Load .env for CLI scripts (check/migrate) that do not bootstrap environment in index.js
try {
  const envPath = path.join(__dirname, "..", ".env");
  if (fs.existsSync(envPath)) {
    const envText = fs.readFileSync(envPath, "utf8");
    envText.split(/\r?\n/).forEach((line) => {
      const trimmed = String(line || "").trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const idx = trimmed.indexOf("=");
      if (idx === -1) return;
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim();
      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    });
  }
} catch (err) {
  console.error("[DB CONFIG] Failed to load .env:", err.message);
}

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") return defaultValue;
  return ["1", "true", "yes", "y", "on"].includes(String(value).trim().toLowerCase());
}

function parseNumber(value, defaultValue) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

const dbClient = String(process.env.DB_CLIENT || "sqlite").trim().toLowerCase();
const mssqlInstanceName = String(process.env.MSSQL_INSTANCE_NAME || "").trim();
const mssqlPort = parseNumber(process.env.MSSQL_PORT, 1433);

module.exports = {
  dbClient,
  fallbackToSqlite: parseBoolean(process.env.DB_FALLBACK_TO_SQLITE, true),
  sqlite: {
    filePath: process.env.SQLITE_DB_PATH || path.join(__dirname, "..", "sparepart.db")
  },
  mssql: {
    server: process.env.MSSQL_SERVER || "localhost",
    port: mssqlInstanceName ? undefined : mssqlPort,
    database: process.env.MSSQL_DATABASE || "sparepart",
    user: process.env.MSSQL_USER || "sa",
    password: process.env.MSSQL_PASSWORD || "",
    options: {
      ...(mssqlInstanceName ? { instanceName: mssqlInstanceName } : {}),
      encrypt: parseBoolean(process.env.MSSQL_ENCRYPT, false),
      trustServerCertificate: parseBoolean(process.env.MSSQL_TRUST_SERVER_CERTIFICATE, true)
    },
    pool: {
      max: parseNumber(process.env.MSSQL_POOL_MAX, 10),
      min: parseNumber(process.env.MSSQL_POOL_MIN, 0),
      idleTimeoutMillis: parseNumber(process.env.MSSQL_POOL_IDLE_TIMEOUT_MS, 30000)
    }
  }
};
