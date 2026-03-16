const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcryptjs");
const path = require("path");

const dbPath = path.join(__dirname, "sparepart.db");
const db = new sqlite3.Database(dbPath);

const username = "watcharapong";
const password = "Wongmano@2928";
const role = "admin";

bcrypt.hash(password, 10, (err, hash) => {
  if (err) {
    console.error("Hash error:", err);
    process.exit(1);
  }
  
  db.run(
    "INSERT INTO users (username, password, role) VALUES (?, ?, ?)",
    [username, hash, role],
    function(err) {
      if (err) {
        if (err.message.includes("UNIQUE constraint failed")) {
          console.log("User already exists, updating password instead.");
          db.run("UPDATE users SET password = ?, role = ? WHERE username = ?", [hash, role, username], (err2) => {
            if (err2) console.error("Update error:", err2);
            else console.log("User updated successfully!");
            db.close();
          });
        } else {
          console.error("Insert error:", err.message);
          db.close();
        }
      } else {
        console.log("User created successfully!");
        db.close();
      }
    }
  );
});
