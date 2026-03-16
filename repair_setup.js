const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

const db = new sqlite3.Database('/home/watcharapongw/new-project/sparepart.db');

async function repair() {
  console.log("Starting repair...");

  // 1. Restore Users
  const usersToRestore = [
    { username: 'staff', password: 'staff123', role: 'staff' },
    { username: 'viewer', password: 'viewer123', role: 'viewer' }
  ];

  for (const user of usersToRestore) {
    const hashedPassword = await bcrypt.hash(user.password, 10);
    db.run("INSERT OR IGNORE INTO users (username, password, role) VALUES (?, ?, ?)", 
      [user.username, hashedPassword, user.role], (err) => {
        if (!err) console.log(`User ${user.username} ensured.`);
      });
  }

  // 2. Restore Departments (Movement Reasons) from CSV common ones
  const depts = ['IT', 'ITS', 'LPN1', 'LPN2', 'PLN1', 'PLN2', 'GEN', 'HRD', 'BSD1', 'FIN', 'QM', 'QMSS', 'PUR', 'IE', 'IC', 'OP2S', 'OP3', 'OP4'];
  
  for (const dept of depts) {
    db.run("INSERT OR IGNORE INTO movement_reasons (name) VALUES (?)", [dept], (err) => {
      if (!err) console.log(`Department ${dept} ensured.`);
    });
  }

  // 3. Restore Warehouses if missing (though LPN1/LPN2 usually enough)
  db.run("INSERT OR IGNORE INTO warehouses (name) VALUES (?)", ["LPN1"]);
  db.run("INSERT OR IGNORE INTO warehouses (name) VALUES (?)", ["LPN2"]);

  console.log("Repair script tasks queued.");
  
  setTimeout(() => {
    db.close();
    console.log("Database closed.");
  }, 2000);
}

repair();
