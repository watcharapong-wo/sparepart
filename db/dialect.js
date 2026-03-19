const dbConfig = require("./config");

const DIALECTS = {
  sqlite: {
    currentTimestamp: "CURRENT_TIMESTAMP",
    dateNow: "date('now')",
    dateDaysAgo(days) {
      return `date('now', '-${Number(days)} days')`;
    },
    isoUtc(column) {
      return `strftime('%Y-%m-%dT%H:%M:%SZ', ${column})`;
    },
    dateOnly(column) {
      return `date(${column})`;
    },
    monthKey(column) {
      return `strftime('%Y-%m', ${column})`;
    },
    groupConcat(expression, separator) {
      const escapedSeparator = String(separator).replace(/'/g, "''");
      return `GROUP_CONCAT(${expression}, '${escapedSeparator}')`;
    },
    limit(count) {
      return `LIMIT ${Number(count)}`;
    },
    systemConfigUpsertSql: "INSERT OR REPLACE INTO system_config (key, value) VALUES ('last_overdue_remind_date', ?)"
  },
  mssql: {
    currentTimestamp: "GETDATE()",
    dateNow: "CAST(GETDATE() AS DATE)",
    dateDaysAgo(days) {
      return `DATEADD(day, -${Number(days)}, CAST(GETDATE() AS DATE))`;
    },
    isoUtc(column) {
      return `CONVERT(VARCHAR(33), ${column}, 127) + 'Z'`;
    },
    dateOnly(column) {
      return `CAST(${column} AS DATE)`;
    },
    monthKey(column) {
      return `CONVERT(VARCHAR(7), ${column}, 126)`;
    },
    groupConcat(expression, separator) {
      const escapedSeparator = String(separator).replace(/'/g, "''");
      return `STRING_AGG(${expression}, '${escapedSeparator}')`;
    },
    limit(count) {
      return `OFFSET 0 ROWS FETCH NEXT ${Number(count)} ROWS ONLY`;
    },
    systemConfigUpsertSql: "MERGE system_config AS target USING (SELECT 'last_overdue_remind_date' AS [key], ? AS [value]) AS source ON target.[key] = source.[key] WHEN MATCHED THEN UPDATE SET target.[value] = source.[value] WHEN NOT MATCHED THEN INSERT ([key], [value]) VALUES (source.[key], source.[value]);"
  }
};

module.exports = DIALECTS[dbConfig.dbClient] || DIALECTS.sqlite;
