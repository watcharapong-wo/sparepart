# ระบบจัดการอะไหล่ IT

**ภาษา**

[![English](https://img.shields.io/badge/English-README-blue)](README.md) [![Thai](https://img.shields.io/badge/ไทย-README.th.md-green)](README.th.md)

ระบบบริหารคลังและอะไหล่ผ่านเว็บสำหรับติดตามอุปกรณ์และอะไหล่ IT อย่างเป็นระบบ รองรับการใช้งานจริงด้วยหน้าจอที่ใช้งานง่าย การควบคุมสิทธิ์ตามบทบาท และรายงานสรุปข้อมูลอย่างครบถ้วน

## เริ่มต้นอย่างรวดเร็ว

### สำหรับผู้ใช้งานทั่วไป

1. เปิดระบบที่ `http://localhost:5000`
2. เข้าสู่ระบบด้วยบัญชีที่ได้รับมอบหมาย
3. ใช้งานเมนูหลัก ได้แก่ Dashboard, Spare Parts, Movements, Logs และ Users (ตามสิทธิ์)

### สำหรับทีมเทคนิค

1. ติดตั้ง Node.js และรัน `npm install`
2. คัดลอก `.env.example` เป็น `.env` และตั้งค่าตัวแปรที่เกี่ยวข้อง
3. เริ่มระบบด้วย `npm run start` หรือ `node index.js`
4. ตรวจสอบการย้ายข้อมูลไป SQL Server ตามหัวข้อ "การตั้งค่า SQL Server Migration"

## ✨ ความสามารถหลัก

- **แดชบอร์ดวิเคราะห์ข้อมูล**: แสดงภาพรวมมูลค่าสต็อก (LPN1, LPN2), แจ้งเตือนของใกล้หมด, ยอดจ่ายออกจากสต็อก และแนวโน้มการเคลื่อนไหวสต็อกแบบเรียลไทม์ผ่านกราฟ
- **จัดการอะไหล่**:
  - เพิ่ม แก้ไข (inline) และลบข้อมูลอะไหล่
  - รองรับการนำเข้า CSV ที่มีรูปแบบซับซ้อนและไฟล์ภาษาไทย (Windows-874)
  - จัดเก็บข้อมูล Quantity, Part No, Description, Category, Due Date และ Location
- **จัดการการเคลื่อนไหวสต็อก**:
  - ติดตามรายการ `IN`, `OUT`, `BORROW`, `RETURN`
   - ดูประวัติการเคลื่อนไหวแบบละเอียด พร้อมส่งออกเป็น CSV
- **สิทธิ์การใช้งานตามบทบาท (RBAC)**:
  - ล็อกอินปลอดภัยด้วย JWT
  - บทบาทที่รองรับ: `Admin`, `Co-Admin`, `Staff`, `Viewer` (แยกสิทธิ์หน้า UI และ API)
- **จัดการผู้ใช้งาน**: ผู้ดูแลระบบสามารถเพิ่ม แก้ไข ลบผู้ใช้ และกำหนดบทบาทได้
- **บันทึกกิจกรรมระบบ**: เก็บ Audit Trail (Login, Create, Update, Delete) พร้อมส่งออก CSV
- **รองรับสองภาษา**: สลับภาษาไทย/อังกฤษได้ผ่าน `i18n.js`
- **รองรับหลายขนาดหน้าจอ**: เมนูคงที่ การค้นหาแบบไดนามิก ตารางข้อมูล และรูปแบบหน้าจอที่ทันสมัย

## 🛠️ เทคโนโลยีที่ใช้

- **Frontend**: HTML5, Vanilla JavaScript, CSS3
- **Backend / API**: Node.js, Express.js
- **Database**: SQLite3 และมีโครงสำหรับย้ายไปยัง SQL Server
- **Authentication**: JWT และ bcryptjs สำหรับการแฮชรหัสผ่าน
- **Data Visualization**: Chart.js

## 🚀 เริ่มต้นใช้งาน

### สิ่งที่ต้องเตรียม

ติดตั้ง [Node.js](https://nodejs.org/) ให้เรียบร้อยก่อนเริ่มต้น

### การติดตั้ง

1. โคลนที่เก็บซอร์สโค้ด (repository):

   ```bash
   git clone https://github.com/watcharapong-wo/sparepart.git
   cd sparepart
   ```

2. ติดตั้งแพ็กเกจที่จำเป็น (dependencies):

   ```bash
   npm install
   ```

### การตั้งค่า SQL Server Migration

1. คัดลอก `.env.example` เป็น `.env` แล้วกำหนดค่า `MSSQL_*`
2. ตั้งค่า `DB_FALLBACK_TO_SQLITE=true` ระหว่างเตรียมการย้ายข้อมูล
3. สร้าง schema ใน SQL Server จากไฟล์ `schema_mssql.sql`
4. ทดสอบการเชื่อมต่อ SQL Server:

   ```bash
   npm run check:mssql
   ```

5. รันการย้ายข้อมูลรอบแรกจาก SQLite ไปยัง SQL Server:

   ```bash
   npm run migrate:mssql
   ```

6. เมื่อต้องการทดสอบโหมด MSSQL โดยตรง ให้ตั้งค่า:

   ```env
   DB_CLIENT=mssql
   DB_FALLBACK_TO_SQLITE=false
   ```

ระบบนี้ยังใช้ SQLite เป็นค่าเริ่มต้น และสามารถเปิดเส้นทาง MSSQL เพื่อทดสอบแบบค่อยเป็นค่อยไปได้

### การเริ่มเซิร์ฟเวอร์

#### ตัวเลือก 1: ง่ายที่สุด - ดับเบิลคลิก

สำหรับ Windows

- ดับเบิลคลิก `START_SERVER.bat` ในโฟลเดอร์โปรเจกต์
- ระบบจะเปิดหน้าต่างเทอร์มินัลและเริ่มเซิร์ฟเวอร์
- เซิร์ฟเวอร์ทำงานที่ `http://localhost:5000`

#### ตัวเลือก 2: ผ่าน command line

```bash
npm run start
```

หรือ

```bash
node index.js
```

#### ตัวเลือก 3: รันแบบซ่อนหน้าต่าง

สำหรับ Windows (ไม่แสดง terminal)

```powershell
wscript.exe .\run_server_hidden.vbs
```

- มีการตรวจสอบพอร์ต 5000 ก่อน เพื่อป้องกันการเปิดเซิร์ฟเวอร์ซ้ำ

#### ตัวเลือก 4: ให้รันอัตโนมัติเมื่อเข้าสู่ระบบ Windows

ต้องใช้สิทธิ์ผู้ดูแลระบบ

```powershell
powershell -ExecutionPolicy Bypass -File .\register_autostart_admin.ps1
```

- สร้าง Scheduled Task ใน Windows
- เซิร์ฟเวอร์จะเริ่มอัตโนมัติเมื่อผู้ใช้ลงชื่อเข้าใช้

หากต้องการยกเลิกการเริ่มระบบอัตโนมัติ:

```powershell
powershell -ExecutionPolicy Bypass -File .\unregister_autostart_admin.ps1
```

#### ตัวเลือก 5: ให้ VS Code เริ่มระบบโดยอัตโนมัติ

หากใช้งานใน VS Code

- เปิดโฟลเดอร์โปรเจกต์ใน VS Code
- เซิร์ฟเวอร์จะเริ่มทำงานแบบเบื้องหลังโดยอัตโนมัติ

### เข้าใช้งานระบบ

1. เปิดเบราว์เซอร์ไปที่ **`http://localhost:5000`**
2. ล็อกอินด้วยบัญชีผู้ดูแลระบบ
3. เริ่มใช้งานระบบจัดการอะไหล่

### บัญชีเริ่มต้น

- หากเป็นฐานข้อมูลใหม่ ให้ตรวจสอบค่าเริ่มต้นของผู้ดูแลระบบในไฟล์ `index.js` หรือไฟล์ตั้งต้น (seed) ของฐานข้อมูล

## 📁 โครงสร้างโปรเจกต์

- `index.js`: ตั้งค่าเซิร์ฟเวอร์ Express และเส้นทาง API
- `database.js` / `sqlite.db`: การเชื่อมต่อและการจัดเก็บข้อมูลฐานข้อมูล
- `api.js`: ยูทิลิตีฝั่งหน้าเว็บสำหรับเรียก API (fetch, post, put, delete)
- `styles.css`: สไตล์รวม, CSS variables และ layout
- `*.html` และ `*.js`: ไฟล์หน้าเว็บแต่ละหน้า (เช่น `dashboard.html/js`, `movements.html/js`, `users.html/js`)
- `i18n.js`: dictionary และ logic สำหรับการแปลภาษาไทย/อังกฤษ

## 🤝 การมีส่วนร่วม

ยินดีรับ Pull Request เพื่อพัฒนาระบบต่อเนื่อง

## 📄 License

โครงการนี้เป็นทรัพย์สินขององค์กรและพัฒนาโดย Watcharapong W. (IT Eng.) สำหรับ Hana Microelectronics Public Co., Ltd.
