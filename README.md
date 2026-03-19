# IT Spare Part Management System

A web-based inventory and spare part management system designed to streamline tracking of IT equipment and supplies. The application provides a sleek UI with robust tracking, role-based access control, and comprehensive reporting.

## ✨ Features

- **Dashboard Analytics**: Real-time overview of total inventory value (LPN1, LPN2), low stock alerts, stock out totals, and movement trends visualized with interactive charts.
- **Spare Parts Management**:
  - Add, edit (inline), and delete spare parts.
  - Smart CSV Import supporting complex formatting and Thai encodings (Windows-874).
  - Track Quantity, Part No, Description, Category, Due Dates, and Locations.
- **Stock Movements**:
  - Track all items going `IN`, `OUT`, `BORROW`, and `RETURN`.
  - Detailed movement history with CSV export functionality.
- **Role-Based Access Control (RBAC)**:
  - Secure login with JWT authentication.
  - Roles: `Admin`, `Co-Admin`, `Staff`, `Viewer` (each with customized UI visibility and API permissions).
- **User Management**: Administrators can add, edit, or delete user accounts and manage roles.
- **System Activity Logs**: Audit trail of system events (Login, Create, Update, Delete) with CSV export.
- **Bilingual Support**: Toggle between English and Thai (`i18n.js`).
- **Responsive UI**: Sticky navigation bars, dynamic search filtering, data-tables, and modern styling.

## 🛠️ Technology Stack

- **Frontend**: HTML5, Vanilla JavaScript, CSS3
- **Backend / API**: Node.js, Express.js
- **Database**: SQLite3, with SQL Server migration scaffolding in progress
- **Authentication**: JWT (JSON Web Tokens) & bcryptjs for password hashing.
- **Data Visualization**: Chart.js

## 🚀 Getting Started

### Prerequisites

Ensure you have [Node.js](https://nodejs.org/) installed on your machine.

### Installation

1. Clone this repository:

   ```bash
   git clone https://github.com/watcharapong-wo/sparepart.git
   cd sparepart
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

   *(This will install express, sqlite3, mssql, bcryptjs, cors, jsonwebtoken, etc., based on `package.json`)*

### SQL Server Migration Setup

1. Copy [.env.example](d:/Project%20Sparepart/new-project/.env.example) to `.env` and set the `MSSQL_*` values.
2. Keep `DB_FALLBACK_TO_SQLITE=true` while preparing migration (safe mode).
3. Create the SQL Server schema from [schema_mssql.sql](d:/Project%20Sparepart/new-project/schema_mssql.sql).
4. Test the SQL Server connection:

   ```bash
   npm run check:mssql
   ```

5. Run the first-pass SQLite to SQL Server migration script:

   ```bash
   npm run migrate:mssql
   ```

6. When ready to test MSSQL runtime path, set:

   ```env
   DB_CLIENT=mssql
   DB_FALLBACK_TO_SQLITE=false
   ```

This project runs on SQLite by default. The SQL Server work added here now includes an adapter path that can be toggled on for incremental testing.

### Starting the Server

#### Option 1: Easiest - Double-click to run

Windows only.

- Double-click `START_SERVER.bat` in the project folder
- A terminal window will appear and the server will start
- Server runs at `http://localhost:5000`

#### Option 2: Command line

   ```bash
   npm run start
   ```

   or

   ```bash
   node index.js
   ```

#### Option 3: Hidden window launcher

Windows only, no terminal visible.

   ```powershell
   wscript.exe .\run_server_hidden.vbs
   ```

- Checks port 5000 first and won't start duplicate server

#### Option 4: Auto-start on Windows logon

Requires admin.

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\register_autostart_admin.ps1
   ```

- Creates a Windows Scheduled Task
- Server starts automatically when you sign in

   To remove autostart:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\unregister_autostart_admin.ps1
   ```

#### Option 5: VS Code auto-run

If using VS Code.

- Open workspace folder in VS Code
- Server will start automatically in the background

### Access the Application

1. Open your browser and navigate to: **`http://localhost:5000`**
2. Log in with your administrator credentials
3. Start using the spare parts management system

### Default Login

- If the database is freshly initialized, check your `index.js` or database seed files for default administrator credentials.

## 📁 Project Structure

- `index.js`: Main Express server configuration and API route definitions.
- `database.js` / `sqlite.db`: Database connection and storage.
- `api.js`: Frontend utility for structured API requests (fetch, post, put, delete).
- `styles.css`: Global styling definitions, CSS variables, and layout.
- `*.html` & `*.js`: Page-specific frontend files (e.g., `dashboard.html/js`, `movements.html/js`, `users.html/js`).
- `i18n.js`: Localization dictionary and logic for TH/EN translations.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is proprietary and developed by Watcharapong W. (IT Eng.) for Hana Microelectronics Public Co., Ltd.
