const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const db = new sqlite3.Database('./sparepart.db');

bcrypt.hash('test123', 10, (err, hash) => {
  if (err) {
    console.error('Hash error:', err);
    db.close();
    process.exit(1);
  }

  // Delete existing testuser
  db.run("DELETE FROM users WHERE username = 'testuser'", () => {
    // Insert new testuser
    db.run(
      "INSERT INTO users (username, password, role) VALUES (?, ?, ?)",
      ['testuser', hash, 'admin'],
      (err) => {
        if (err) {
          console.error('Insert error:', err.message);
        } else {
          console.log('User testuser created with password test123');
        }
        db.close();
      }
    );
  });
});
