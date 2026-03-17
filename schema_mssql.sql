-- MS SQL Server Schema for it Spare part System
-- Target: SQL Server 2019+

-- 1. Warehouses
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'warehouses')
BEGIN
    CREATE TABLE warehouses (
        id INT IDENTITY(1,1) PRIMARY KEY,
        name NVARCHAR(255) NOT NULL,
        location NVARCHAR(MAX)
    );
END

-- 2. Spare Parts
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'spare_parts')
BEGIN
    CREATE TABLE spare_parts (
        id INT IDENTITY(1,1) PRIMARY KEY,
        part_no NVARCHAR(255) NOT NULL,
        name NVARCHAR(255) NOT NULL,
        description NVARCHAR(MAX),
        quantity INT NOT NULL,
        price DECIMAL(18,2)
    );
END

-- 3. Users
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'users')
BEGIN
    CREATE TABLE users (
        id INT IDENTITY(1,1) PRIMARY KEY,
        username NVARCHAR(255) NOT NULL UNIQUE,
        password NVARCHAR(MAX) NOT NULL,
        role NVARCHAR(50) NOT NULL
    );
END

-- 4. Spare Part Items (Individual units with Serial Numbers)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'spare_part_items')
BEGIN
    CREATE TABLE spare_part_items (
        id INT IDENTITY(1,1) PRIMARY KEY,
        part_id INT NOT NULL,
        serial_no NVARCHAR(255) NOT NULL UNIQUE,
        status NVARCHAR(50) DEFAULT 'available',
        CONSTRAINT FK_SparePartItems_SpareParts FOREIGN KEY (part_id) REFERENCES spare_parts(id) ON DELETE CASCADE
    );
END

-- 5. Stock Movements
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'stock_movements')
BEGIN
    CREATE TABLE stock_movements (
        id INT IDENTITY(1,1) PRIMARY KEY,
        part_id INT NOT NULL,
        movement_type NVARCHAR(50) NOT NULL, -- 'IN', 'OUT', 'BORROW', 'RETURN'
        quantity INT NOT NULL,
        movement_date DATETIME2 DEFAULT GETDATE(),
        note NVARCHAR(MAX),
        department NVARCHAR(255),
        receiver NVARCHAR(255),
        receipt_number NVARCHAR(255),
        user_id INT,
        due_date DATETIME2,
        return_status NVARCHAR(50) DEFAULT 'pending',
        CONSTRAINT FK_StockMovements_SpareParts FOREIGN KEY (part_id) REFERENCES spare_parts(id),
        CONSTRAINT FK_StockMovements_Users FOREIGN KEY (user_id) REFERENCES users(id)
    );
END

-- 6. Movement Items (Link units to movements)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'movement_items')
BEGIN
    CREATE TABLE movement_items (
        id INT IDENTITY(1,1) PRIMARY KEY,
        movement_id INT NOT NULL,
        item_id INT NOT NULL,
        CONSTRAINT FK_MovementItems_Movements FOREIGN KEY (movement_id) REFERENCES stock_movements(id) ON DELETE CASCADE,
        CONSTRAINT FK_MovementItems_Items FOREIGN KEY (item_id) REFERENCES spare_part_items(id)
    );
END

-- 7. Movement Reasons / Departments
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'movement_reasons')
BEGIN
    CREATE TABLE movement_reasons (
        id INT IDENTITY(1,1) PRIMARY KEY,
        name NVARCHAR(255) NOT NULL UNIQUE
    );
END

-- 8. Activity Logs
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'activity_logs')
BEGIN
    CREATE TABLE activity_logs (
        id INT IDENTITY(1,1) PRIMARY KEY,
        user_id INT,
        action NVARCHAR(25) NOT NULL,
        details NVARCHAR(MAX),
        timestamp DATETIME2 DEFAULT GETDATE(),
        CONSTRAINT FK_ActivityLogs_Users FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );
END

-- SEED INITIAL DATA (Optional - same as index.js logic)
-- INSERT INTO warehouses (name, location) SELECT 'LPN1', 'Building A' WHERE NOT EXISTS (SELECT 1 FROM warehouses WHERE name = 'LPN1');
-- INSERT INTO warehouses (name, location) SELECT 'LPN2', 'Building B' WHERE NOT EXISTS (SELECT 1 FROM warehouses WHERE name = 'LPN2');
