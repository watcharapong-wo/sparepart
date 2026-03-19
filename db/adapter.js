const sqlite3 = require("sqlite3").verbose();
const mssql = require("mssql");
const { AsyncLocalStorage } = require("async_hooks");
const config = require("./config");

function createSqliteDatabase(filePath) {
  const db = new sqlite3.Database(filePath, (err) => {
    if (err) {
      console.error("[DB] SQLite open error:", err.message);
      return;
    }
    console.log(`[DB] SQLite connected: ${filePath}`);
  });

  return db;
}

function mapSqlWithParams(sqlText, params = []) {
  let index = 0;
  const mappedSql = String(sqlText).replace(/\?/g, () => `@p${index++}`);
  return {
    sql: mappedSql,
    params: Array.isArray(params) ? params : []
  };
}

function createMssqlDatabase() {
  const txStorage = new AsyncLocalStorage();
  const pool = new mssql.ConnectionPool({
    server: config.mssql.server,
    port: config.mssql.port,
    database: config.mssql.database,
    user: config.mssql.user,
    password: config.mssql.password,
    options: config.mssql.options,
    pool: config.mssql.pool
  });

  const poolConnect = pool.connect()
    .then(() => {
      console.log(`[DB] MSSQL connected: ${config.mssql.server}:${config.mssql.port}/${config.mssql.database}`);
    })
    .catch((err) => {
      console.error("[DB] MSSQL connect error:", err.message);
      throw err;
    });

  function normalizeArgs(params, callback) {
    if (typeof params === "function") {
      return { params: [], callback: params };
    }
    return { params: Array.isArray(params) ? params : [], callback };
  }

  function getTransactionContext() {
    return txStorage.getStore();
  }

  async function executeTransactionControl(sqlUpper, callback) {
    await poolConnect;
    const ctx = getTransactionContext();
    const keyword = sqlUpper.replace(/\s+/g, " ").trim();

    if (!ctx) {
      throw new Error("Transaction statements must be executed inside db.serialize() context.");
    }

    if (keyword.startsWith("BEGIN TRANSACTION")) {
      if (ctx.transaction) {
        throw new Error("Transaction is already active in this context.");
      }
      const tx = new mssql.Transaction(pool);
      await tx.begin();
      ctx.transaction = tx;
      const context = { lastID: null, changes: 0 };
      if (typeof callback === "function") callback.call(context, null);
      return;
    }

    if (keyword.startsWith("COMMIT")) {
      if (!ctx.transaction) {
        throw new Error("No active transaction to commit.");
      }
      await ctx.transaction.commit();
      ctx.transaction = null;
      const context = { lastID: null, changes: 0 };
      if (typeof callback === "function") callback.call(context, null);
      return;
    }

    if (keyword.startsWith("ROLLBACK")) {
      if (!ctx.transaction) {
        throw new Error("No active transaction to rollback.");
      }
      await ctx.transaction.rollback();
      ctx.transaction = null;
      const context = { lastID: null, changes: 0 };
      if (typeof callback === "function") callback.call(context, null);
      return;
    }

    throw new Error("Unsupported transaction control statement.");
  }

  function isTransactionControl(sqlUpper) {
    return /\bBEGIN\s+TRANSACTION\b|\bCOMMIT\b|\bROLLBACK\b/.test(sqlUpper);
  }

  function isMutatingStatement(sqlUpper) {
    return /^\s*(INSERT|UPDATE|DELETE|MERGE)\b/.test(sqlUpper);
  }

  function buildRunSql(sqlText) {
    const sqlUpper = String(sqlText || "").toUpperCase();
    if (!isMutatingStatement(sqlUpper)) {
      return String(sqlText || "");
    }
    return `${sqlText}; SELECT CAST(SCOPE_IDENTITY() AS INT) AS lastID;`;
  }

  function execute(sqlText, params, callback, mode) {
    const sqlUpper = String(sqlText || "").toUpperCase();
    if (isTransactionControl(sqlUpper)) {
      executeTransactionControl(sqlUpper, callback).catch((err) => {
        if (typeof callback === "function") callback(err);
      });
      return;
    }

    poolConnect
      .then(() => {
        const ctx = getTransactionContext();
        const request = ctx?.transaction ? new mssql.Request(ctx.transaction) : pool.request();
        const mapped = mapSqlWithParams(sqlText, params);

        mapped.params.forEach((value, idx) => {
          request.input(`p${idx}`, value);
        });

        request.query(mapped.sql)
          .then((result) => {
            if (mode === "run") {
              const firstRow = (result.recordset && result.recordset[0]) || {};
              const context = {
                lastID: firstRow.lastID || null,
                changes: typeof result.rowsAffected?.[0] === "number" ? result.rowsAffected[0] : 0
              };
              if (typeof callback === "function") callback.call(context, null);
              return;
            }

            if (mode === "get") {
              if (typeof callback === "function") callback(null, (result.recordset || [])[0]);
              return;
            }

            if (typeof callback === "function") callback(null, result.recordset || []);
          })
          .catch((err) => {
            if (typeof callback === "function") callback(err);
          });
      })
      .catch((err) => {
        if (typeof callback === "function") callback(err);
      });
  }

  return {
    run(sqlText, params, callback) {
      const normalized = normalizeArgs(params, callback);
      const runSql = buildRunSql(sqlText);
      const safeParams = normalized.params;
      const cb = normalized.callback;
      execute(runSql, safeParams, cb, "run");
    },
    get(sqlText, params, callback) {
      const normalized = normalizeArgs(params, callback);
      const safeParams = normalized.params;
      const cb = normalized.callback;
      execute(sqlText, safeParams, cb, "get");
    },
    all(sqlText, params, callback) {
      const normalized = normalizeArgs(params, callback);
      const safeParams = normalized.params;
      const cb = normalized.callback;
      execute(sqlText, safeParams, cb, "all");
    },
    serialize(fn) {
      if (typeof fn === "function") {
        txStorage.run({ transaction: null }, fn);
      }
    },
    prepare(sqlText) {
      return {
        run(...args) {
          const cb = typeof args[args.length - 1] === "function" ? args.pop() : undefined;
          execute(sqlText, args, cb, "run");
        },
        finalize(cb) {
          if (typeof cb === "function") cb();
        }
      };
    }
  };
}

function createDatabase() {
  if (config.dbClient === "sqlite") {
    return createSqliteDatabase(config.sqlite.filePath);
  }

  if (config.dbClient === "mssql" && !config.fallbackToSqlite) {
    return createMssqlDatabase();
  }

  console.warn(`[DB] DB_CLIENT=${config.dbClient} is not fully enabled in runtime yet. Falling back to SQLite.`);
  return createSqliteDatabase(config.sqlite.filePath);
}

module.exports = {
  createDatabase
};
