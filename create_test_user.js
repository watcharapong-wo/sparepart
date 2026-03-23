const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const dbConfig = require('./db/config');

const username = process.env.SMOKE_USERNAME || 'testuser';
const password = process.env.SMOKE_PASSWORD || 'test123';
const sqliteFilePath = dbConfig.sqlite?.filePath || './sparepart.db';
const db = new sqlite3.Database(sqliteFilePath);

bcrypt.hash(password, 10, (err, hash) => {
  if (err) {
    console.error('Hash error:', err);
    db.close();
    process.exit(1);
  }

  db.run("DELETE FROM users WHERE username = ?", [username], () => {
    db.run(
      "INSERT INTO users (username, password, role) VALUES (?, ?, ?)",
      [username, hash, 'admin'],
      (err) => {
        if (err) {
          console.error('Insert error:', err.message);
        } else {
          console.log(`User ${username} created with password ${password}`);
        }
        db.close();
      }
    );
  });
});
