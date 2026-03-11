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
- **Database**: SQLite3
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
   *(This will install express, sqlite3, bcryptjs, cors, jsonwebtoken, etc., based on `package.json`)*

3. Start the server:
   ```bash
   node index.js
   ```

4. Access the application:
   Open your browser and navigate to `http://localhost:3000` (or the port specified in your console).

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
