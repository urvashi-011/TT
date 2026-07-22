const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.VERCEL
  ? '/tmp/employeehub.db'
  : path.join(__dirname, 'employeehub.db');

async function getDbConnection() {
  if (process.env.VERCEL) {
    const sourceDb = path.join(__dirname, 'employeehub.db');
    if (!fs.existsSync('/tmp/employeehub.db') && fs.existsSync(sourceDb)) {
      try {
        fs.copyFileSync(sourceDb, '/tmp/employeehub.db');
        console.log('Copied root database to /tmp/employeehub.db');
      } catch (err) {
        console.error('Error copying DB to /tmp:', err);
      }
    }
  }
  return open({
    filename: dbPath,
    driver: sqlite3.Database
  });
}

async function initDb() {
  const db = await getDbConnection();

  // Create Users table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL,
      department TEXT,
      designation TEXT,
      joining_date TEXT,
      salary REAL DEFAULT 0,
      status TEXT DEFAULT 'active',
      deposit_total REAL DEFAULT 0,
      deposit_deduction_type TEXT DEFAULT 'monthly_2000',
      deposit_paid REAL DEFAULT 0
    )
  `);

  // Create Attendance table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      date TEXT NOT NULL,
      check_in TEXT,
      check_out TEXT,
      status TEXT DEFAULT 'Present',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Create Leaves table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS leaves (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      leave_type TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT DEFAULT 'Pending',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Create Salaries table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS salaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      month TEXT NOT NULL,
      basic_salary REAL NOT NULL,
      allowances REAL DEFAULT 0,
      deductions REAL DEFAULT 0,
      net_salary REAL NOT NULL,
      payment_date TEXT,
      status TEXT DEFAULT 'Paid',
      breakdown TEXT,
      deposit_deduction REAL DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Create User Activities table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS user_activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      activity_type TEXT NOT NULL,
      description TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Create Documents table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      title TEXT NOT NULL,
      file_path TEXT NOT NULL,
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Create Holidays table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS holidays (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL
    )
  `);

  // Schema alterations for backward compatibility
  try {
    await db.exec(`ALTER TABLE salaries ADD COLUMN breakdown TEXT`);
  } catch (e) {
    // Already exists
  }
  try {
    await db.exec(`ALTER TABLE salaries ADD COLUMN deposit_deduction REAL DEFAULT 0`);
  } catch (e) {}
  try {
    await db.exec(`ALTER TABLE users ADD COLUMN deposit_total REAL DEFAULT 0`);
  } catch (e) {}
  try {
    await db.exec(`ALTER TABLE users ADD COLUMN deposit_deduction_type TEXT DEFAULT 'monthly_2000'`);
  } catch (e) {}
  try {
    await db.exec(`ALTER TABLE users ADD COLUMN deposit_paid REAL DEFAULT 0`);
  } catch (e) {}

  // Schema alterations for breaks
  try {
    await db.exec(`ALTER TABLE attendance ADD COLUMN break_1_start TEXT`);
  } catch (e) {}
  try {
    await db.exec(`ALTER TABLE attendance ADD COLUMN break_1_end TEXT`);
  } catch (e) {}
  try {
    await db.exec(`ALTER TABLE attendance ADD COLUMN break_2_start TEXT`);
  } catch (e) {}
  try {
    await db.exec(`ALTER TABLE attendance ADD COLUMN break_2_end TEXT`);
  } catch (e) {}

  // Schema alterations for attendance approval
  try {
    await db.exec(`ALTER TABLE attendance ADD COLUMN is_approved INTEGER DEFAULT 0`);
  } catch (e) {}

  // Optimize performance with indexes
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON attendance(user_id, date)`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_leaves_user ON leaves(user_id)`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_salaries_user_month ON salaries(user_id, month)`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_activities_timestamp ON user_activities(timestamp DESC)`);

  // Check if users table is empty before seeding
  const userCount = await db.get('SELECT COUNT(*) as count FROM users');
  
  if (userCount.count === 0) {
    console.log('Seeding initial database records...');

    const salt = bcrypt.genSaltSync(10);
    const adminPassword = bcrypt.hashSync('admin123', salt);
    const employeePassword = bcrypt.hashSync('password123', salt);

    // Seed Admin
    await db.run(
      `INSERT INTO users (name, email, password, role, department, designation, joining_date, salary, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['Parekh Urvashi', 'urvashi@employeehub.com', adminPassword, 'admin', 'Management', 'HR Admin', '2025-01-01', 95000.0, 'active']
    );

    // Seed Employees
    await db.run(
      `INSERT INTO users (name, email, password, role, department, designation, joining_date, salary, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['John Doe', 'john.doe@employeehub.com', employeePassword, 'employee', 'Engineering', 'Senior Developer', '2025-03-15', 75000.0, 'active']
    );

    await db.run(
      `INSERT INTO users (name, email, password, role, department, designation, joining_date, salary, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['Jane Smith', 'jane.smith@employeehub.com', employeePassword, 'employee', 'Marketing', 'Designer', '2025-06-01', 55000.0, 'active']
    );

    console.log('Initial database records seeded successfully.');
  }

  // Ensure the admin accounts are always seeded and updated correctly
  const salt = bcrypt.genSaltSync(10);
  const urvashiHash = bcrypt.hashSync('TT9501', salt);
  const akshayHash = bcrypt.hashSync('TT9501', salt);

  // Delete old default admin accounts to prevent clutter
  await db.run("DELETE FROM users WHERE email IN ('admin@employeehub.com', 'urvashi@employeehub.com')");

  // Ensure Urvashi Parekh exists as admin
  const urvashiExists = await db.get("SELECT id FROM users WHERE email = 'urvashinocturnesoft@gmail.com'");
  if (urvashiExists) {
    await db.run(
      "UPDATE users SET name = 'Urvashi Parekh', password = ?, role = 'admin' WHERE id = ?",
      [urvashiHash, urvashiExists.id]
    );
  } else {
    await db.run(
      `INSERT INTO users (name, email, password, role, department, designation, joining_date, salary, status) 
       VALUES (?, ?, ?, 'admin', 'Management', 'Director', '2025-01-01', 95000.0, 'active')`,
      ['Urvashi Parekh', 'urvashinocturnesoft@gmail.com', urvashiHash]
    );
  }

  // Ensure Akshay Patel exists as admin
  const akshayExists = await db.get("SELECT id FROM users WHERE email = 'akshay.nocturnesoft@gmail.com'");
  if (akshayExists) {
    await db.run(
      "UPDATE users SET name = 'Akshay Patel', password = ?, role = 'admin' WHERE id = ?",
      [akshayHash, akshayExists.id]
    );
  } else {
    await db.run(
      `INSERT INTO users (name, email, password, role, department, designation, joining_date, salary, status) 
       VALUES (?, ?, ?, 'admin', 'Management', 'Operations Admin', '2025-01-01', 90000.0, 'active')`,
      ['Akshay Patel', 'akshay.nocturnesoft@gmail.com', akshayHash]
    );
  }

  await db.close();
}

async function logUserActivity(db, userId, activityType, description) {
  try {
    await db.run(
      'INSERT INTO user_activities (user_id, activity_type, description) VALUES (?, ?, ?)',
      [userId, activityType, description]
    );
  } catch (err) {
    console.error('Error logging user activity:', err);
  }
}

module.exports = {
  getDbConnection,
  initDb,
  logUserActivity
};
