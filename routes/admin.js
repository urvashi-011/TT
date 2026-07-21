const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { getDbConnection, logUserActivity } = require('../database');
const { verifyToken, isAdmin } = require('../middleware/auth');

// Configure multer storage for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = './uploads';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

// Helper to get today's date in YYYY-MM-DD format
function getTodayDate() {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  const localDate = new Date(d.getTime() - (offset * 60 * 1000));
  return localDate.toISOString().split('T')[0];
}

// GET /api/admin/stats - Admin dashboard overview stats
router.get('/stats', verifyToken, isAdmin, async (req, res) => {
  const today = getTodayDate();
  const currentMonth = today.substring(0, 7); // YYYY-MM

  let db;
  try {
    db = await getDbConnection();

    // 1. Total Active Employees
    const totalActiveUsers = await db.get(
      "SELECT COUNT(*) as count FROM users WHERE role = 'employee' AND status = 'active'"
    );

    // 2. Present Today
    const presentToday = await db.get(
      "SELECT COUNT(*) as count FROM attendance WHERE date = ? AND status = 'Present'",
      [today]
    );

    // 3. On Leave Today
    const leaveToday = await db.get(
      "SELECT COUNT(*) as count FROM attendance WHERE date = ? AND status = 'On Leave'",
      [today]
    );

    // 4. Pending Leave Applications (all-time pending)
    const pendingLeaves = await db.get(
      "SELECT COUNT(*) as count FROM leaves WHERE status = 'Pending'"
    );

    // 5. Calculate Absent Today (Active Employees - Present Today - On Leave Today)
    const activeCount = totalActiveUsers.count;
    const presentCount = presentToday.count;
    const leaveCount = leaveToday.count;
    const absentCount = Math.max(0, activeCount - presentCount - leaveCount);

    res.json({
      totalEmployees: activeCount,
      presentToday: presentCount,
      leaveToday: leaveCount,
      absentToday: absentCount,
      pendingLeaves: pendingLeaves.count
    });
  } catch (err) {
    console.error('Fetch admin stats error:', err);
    res.status(500).json({ error: 'Server error retrieving admin stats.' });
  } finally {
    if (db) await db.close();
  }
});

// GET /api/admin/employees - List all employees
router.get('/employees', verifyToken, isAdmin, async (req, res) => {
  let db;
  try {
    db = await getDbConnection();
    const employees = await db.all(
      "SELECT id, name, email, role, department, designation, joining_date, salary, status, deposit_total, deposit_deduction_type, deposit_paid FROM users ORDER BY name ASC"
    );
    res.json({ employees });
  } catch (err) {
    console.error('Fetch employees error:', err);
    res.status(500).json({ error: 'Server error retrieving employee list.' });
  } finally {
    if (db) await db.close();
  }
});

// GET /api/admin/profile/:id - Return admin profile data (hard‑coded for Parekh Urvashi)
router.get('/profile/:id', verifyToken, isAdmin, async (req, res) => {
  const adminId = parseInt(req.params.id, 10);
  let db;
  try {
    db = await getDbConnection();
    const admin = await db.get('SELECT id, name, email, department, designation, joining_date FROM users WHERE id = ? AND role = \'admin\'', [adminId]);
    if (!admin) {
      return res.status(404).json({ error: 'Admin not found.' });
    }
    res.json(admin);
  } catch (err) {
    console.error('Fetch admin profile error:', err);
    res.status(500).json({ error: 'Server error retrieving admin profile.' });
  } finally {
    if (db) await db.close();
  }
});

// POST /api/admin/employees - Add new employee
router.post('/employees', verifyToken, isAdmin, async (req, res) => {
  const { name, email, password, role, department, designation, joining_date, salary, deposit_total, deposit_deduction_type } = req.body;

  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'Please provide name, email, password, and role.' });
  }

  let db;
  try {
    db = await getDbConnection();

    // Check if email already exists
    const existing = await db.get('SELECT id FROM users WHERE email = ?', [email.toLowerCase().trim()]);
    if (existing) {
      return res.status(400).json({ error: 'An account with this email already exists.' });
    }

    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(password, salt);

    await db.run(
      `INSERT INTO users (name, email, password, role, department, designation, joining_date, salary, status, deposit_total, deposit_deduction_type, deposit_paid)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, 0)`,
      [
        name.trim(),
        email.toLowerCase().trim(),
        hashedPassword,
        role,
        department || '',
        designation || '',
        joining_date || getTodayDate(),
        parseFloat(salary) || 0,
        parseFloat(deposit_total) || 0,
        deposit_deduction_type || 'monthly_2000'
      ]
    );

    res.status(201).json({ message: 'Employee account created successfully.' });
  } catch (err) {
    console.error('Create employee error:', err);
    res.status(500).json({ error: 'Server error creating employee record.' });
  } finally {
    if (db) await db.close();
  }
});

// PUT /api/admin/employees/:id - Update employee
router.put('/employees/:id', verifyToken, isAdmin, async (req, res) => {
  const employeeId = req.params.id;
  const { name, email, password, role, department, designation, joining_date, salary, status, deposit_total, deposit_deduction_type, deposit_paid } = req.body;

  if (!name || !email || !role || !status) {
    return res.status(400).json({ error: 'Please provide name, email, role, and status.' });
  }

  let db;
  try {
    db = await getDbConnection();

    // Check if employee exists
    const employee = await db.get('SELECT * FROM users WHERE id = ?', [employeeId]);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found.' });
    }

    // Check if new email conflicts with another user
    const emailConflict = await db.get(
      'SELECT id FROM users WHERE email = ? AND id != ?',
      [email.toLowerCase().trim(), employeeId]
    );
    if (emailConflict) {
      return res.status(400).json({ error: 'Another user with this email already exists.' });
    }

    let query = `
      UPDATE users 
      SET name = ?, email = ?, role = ?, department = ?, designation = ?, joining_date = ?, salary = ?, status = ?,
          deposit_total = ?, deposit_deduction_type = ?, deposit_paid = ?
    `;
    const params = [
      name.trim(),
      email.toLowerCase().trim(),
      role,
      department || '',
      designation || '',
      joining_date || '',
      parseFloat(salary) || 0,
      status,
      parseFloat(deposit_total) || 0,
      deposit_deduction_type || 'monthly_2000',
      parseFloat(deposit_paid) || 0
    ];

    if (password && password.trim() !== '') {
      const salt = bcrypt.genSaltSync(10);
      const hashedPassword = bcrypt.hashSync(password, salt);
      query += ', password = ?';
      params.push(hashedPassword);
    }

    query += ' WHERE id = ?';
    params.push(employeeId);

    await db.run(query, params);

    res.json({ message: 'Employee details updated successfully.' });
  } catch (err) {
    console.error('Update employee error:', err);
    res.status(500).json({ error: 'Server error updating employee record.' });
  } finally {
    if (db) await db.close();
  }
});

// DELETE /api/admin/employees/:id - Delete employee
router.delete('/employees/:id', verifyToken, isAdmin, async (req, res) => {
  const employeeId = req.params.id;

  // Protect against deleting yourself
  if (parseInt(employeeId) === req.user.id) {
    return res.status(400).json({ error: 'You cannot delete your own admin account.' });
  }

  let db;
  try {
    db = await getDbConnection();

    const employee = await db.get('SELECT id FROM users WHERE id = ?', [employeeId]);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found.' });
    }

    await db.run('DELETE FROM users WHERE id = ?', [employeeId]);
    res.json({ message: 'Employee deleted successfully.' });
  } catch (err) {
    console.error('Delete employee error:', err);
    res.status(500).json({ error: 'Server error deleting employee record.' });
  } finally {
    if (db) await db.close();
  }
});

// GET /api/admin/attendance - View all attendance logs
router.get('/attendance', verifyToken, isAdmin, async (req, res) => {
  const { date, month, user_id } = req.query;

  let query = `
    SELECT a.*, u.name, u.email, u.department 
    FROM attendance a 
    JOIN users u ON a.user_id = u.id 
    WHERE 1=1
  `;
  const params = [];

  if (date) {
    query += ' AND a.date = ?';
    params.push(date);
  } else if (month) {
    query += ' AND a.date LIKE ?';
    params.push(`${month}%`);
  } else if (!user_id) {
    // Default to today if no date, month, and user_id is specified
    query += ' AND a.date = ?';
    params.push(getTodayDate());
  }

  if (user_id) {
    query += ' AND a.user_id = ?';
    params.push(user_id);
  }

  query += ' ORDER BY a.date DESC, u.name ASC';

  let db;
  try {
    db = await getDbConnection();
    const attendance = await db.all(query, params);
    res.json({ attendance });
  } catch (err) {
    console.error('Fetch global attendance error:', err);
    res.status(500).json({ error: 'Server error retrieving attendance records.' });
  } finally {
    if (db) await db.close();
  }
});

// GET /api/admin/leaves - View all leave requests
router.get('/leaves', verifyToken, isAdmin, async (req, res) => {
  let db;
  try {
    db = await getDbConnection();
    const leaves = await db.all(`
      SELECT l.*, u.name, u.email, u.department, u.designation 
      FROM leaves l 
      JOIN users u ON l.user_id = u.id 
      ORDER BY l.id DESC
    `);
    res.json({ leaves });
  } catch (err) {
    console.error('Fetch global leaves error:', err);
    res.status(500).json({ error: 'Server error retrieving leave applications.' });
  } finally {
    if (db) await db.close();
  }
});

// PUT /api/admin/leaves/:id - Approve or Reject leave
router.put('/leaves/:id', verifyToken, isAdmin, async (req, res) => {
  const leaveId = req.params.id;
  const { status } = req.body; // 'Approved' or 'Rejected'

  if (!status || !['Approved', 'Rejected'].includes(status)) {
    return res.status(400).json({ error: "Invalid status. Must be 'Approved' or 'Rejected'." });
  }

  let db;
  try {
    db = await getDbConnection();

    // Get the leave application details
    const leave = await db.get('SELECT * FROM leaves WHERE id = ?', [leaveId]);
    if (!leave) {
      return res.status(404).json({ error: 'Leave request not found.' });
    }

    if (leave.status !== 'Pending') {
      return res.status(400).json({ error: 'Leave request has already been processed.' });
    }

    // Update status
    await db.run('UPDATE leaves SET status = ? WHERE id = ?', [status, leaveId]);

    // If approved, insert attendance entries as 'On Leave' for that period
    if (status === 'Approved') {
      const start = new Date(leave.start_date);
      const end = new Date(leave.end_date);

      const dates = [];
      let current = new Date(start);

      while (current <= end) {
        // format date as YYYY-MM-DD
        const offset = current.getTimezoneOffset();
        const localDate = new Date(current.getTime() - (offset * 60 * 1000));
        dates.push(localDate.toISOString().split('T')[0]);
        current.setDate(current.getDate() + 1);
      }

      for (const d of dates) {
        // Clear any duplicate/conflicting records first
        await db.run('DELETE FROM attendance WHERE user_id = ? AND date = ?', [leave.user_id, d]);
        // Insert 'On Leave' log
        await db.run(
          'INSERT INTO attendance (user_id, date, status) VALUES (?, ?, ?)',
          [leave.user_id, d, 'On Leave']
        );
      }
    }

    res.json({ message: `Leave request successfully ${status.toLowerCase()}d.` });
  } catch (err) {
    console.error('Process leave error:', err);
    res.status(500).json({ error: 'Server error processing leave request.' });
  } finally {
    if (db) await db.close();
  }
});

// GET /api/admin/salaries - List all salaries
router.get('/salaries', verifyToken, isAdmin, async (req, res) => {
  let db;
  try {
    db = await getDbConnection();
    const salaries = await db.all(`
      SELECT s.*, u.name, u.email, u.department 
      FROM salaries s 
      JOIN users u ON s.user_id = u.id 
      ORDER BY s.month DESC, u.name ASC
    `);
    res.json({ salaries });
  } catch (err) {
    console.error('Fetch global salaries error:', err);
    res.status(500).json({ error: 'Server error retrieving salary list.' });
  } finally {
    if (db) await db.close();
  }
});

// POST /api/admin/salaries - Process salary payout
router.post('/salaries', verifyToken, isAdmin, async (req, res) => {
  const { user_id, month, allowances, deductions, payment_date, status, breakdown } = req.body;

  if (!user_id || !month) {
    return res.status(400).json({ error: 'Please specify employee (user_id) and month.' });
  }

  // Validate month format (YYYY-MM)
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: 'Invalid month format. Please use YYYY-MM.' });
  }

  let db;
  try {
    db = await getDbConnection();

    // Verify employee exists
    const employee = await db.get(
      "SELECT id, salary, deposit_total, deposit_deduction_type, deposit_paid FROM users WHERE id = ? AND role = 'employee'",
      [user_id]
    );

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found.' });
    }

    // Verify salary hasn't already been processed for this user and month
    const existing = await db.get(
      'SELECT id FROM salaries WHERE user_id = ? AND month = ?',
      [user_id, month]
    );

    if (existing) {
      return res.status(400).json({ error: `Salary for employee has already been processed for ${month}.` });
    }

    // Calculate applied deposit deduction
    const depositTotal = employee.deposit_total || 0;
    const depositPaid = employee.deposit_paid || 0;
    const remainingDeposit = Math.max(0, depositTotal - depositPaid);
    let appliedDepositDeduction = 0;
    if (remainingDeposit > 0) {
      if (employee.deposit_deduction_type === 'first_month') {
        appliedDepositDeduction = remainingDeposit;
      } else {
        appliedDepositDeduction = Math.min(2000, remainingDeposit);
      }
    }

    const basicSalary = employee.salary;
    const allowanceVal = parseFloat(allowances) || 0;
    const deductionVal = parseFloat(deductions) || 0;
    
    // Clamp applied deposit deduction to the total submitted deductionVal
    appliedDepositDeduction = Math.min(appliedDepositDeduction, deductionVal);

    const netSalary = basicSalary + allowanceVal - deductionVal;
    const payDate = payment_date || getTodayDate();
    const payStatus = status || 'Paid';
    const payBreakdown = breakdown || null;

    await db.run(
      `INSERT INTO salaries (user_id, month, basic_salary, allowances, deductions, net_salary, payment_date, status, breakdown, deposit_deduction)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [user_id, month, basicSalary, allowanceVal, deductionVal, netSalary, payDate, payStatus, payBreakdown, appliedDepositDeduction]
    );

    // Update deposit paid for employee
    if (appliedDepositDeduction > 0) {
      await db.run(
        'UPDATE users SET deposit_paid = deposit_paid + ? WHERE id = ?',
        [appliedDepositDeduction, user_id]
      );
    }

    res.status(201).json({ message: 'Salary slip generated successfully.' });
  } catch (err) {
    console.error('Process salary error:', err);
    res.status(500).json({ error: 'Server error processing salary.' });
  } finally {
    if (db) await db.close();
  }
});

// GET /api/admin/activities - Get audit trail of employee activities
router.get('/activities', verifyToken, isAdmin, async (req, res) => {
  let db;
  try {
    db = await getDbConnection();
    const activities = await db.all(`
      SELECT a.*, u.name, u.email 
      FROM user_activities a
      JOIN users u ON a.user_id = u.id 
      ORDER BY a.timestamp DESC 
      LIMIT 50
    `);
    res.json({ activities });
  } catch (err) {
    console.error('Fetch activities error:', err);
    res.status(500).json({ error: 'Server error retrieving activity logs.' });
  } finally {
    if (db) await db.close();
  }
});

// PUT /api/admin/attendance/:id - Update specific attendance record (Admin override)
router.put('/attendance/:id', verifyToken, isAdmin, async (req, res) => {
  const attendanceId = req.params.id;
  const { check_in, check_out, status, break_1_start, break_1_end, break_2_start, break_2_end } = req.body;

  if (!status || !['Present', 'Absent', 'On Leave', 'Half Day'].includes(status)) {
    return res.status(400).json({ error: "Invalid status. Must be 'Present', 'Absent', 'On Leave', or 'Half Day'." });
  }

  let db;
  try {
    db = await getDbConnection();

    const record = await db.get(
      'SELECT a.*, u.name FROM attendance a JOIN users u ON a.user_id = u.id WHERE a.id = ?',
      [attendanceId]
    );
    if (!record) {
      return res.status(404).json({ error: 'Attendance record not found.' });
    }

    await db.run(
      `UPDATE attendance 
       SET check_in = ?, check_out = ?, status = ?, is_approved = 1,
           break_1_start = ?, break_1_end = ?, break_2_start = ?, break_2_end = ?
       WHERE id = ?`,
      [
        check_in || null, 
        check_out || null, 
        status, 
        break_1_start || null, 
        break_1_end || null, 
        break_2_start || null, 
        break_2_end || null,
        attendanceId
      ]
    );

    // Log Activity
    await logUserActivity(db, req.user.id, 'ADMIN_EDIT', `Admin modified ${record.name}'s attendance for ${record.date} to ${status}.`);

    res.json({ message: 'Attendance record updated successfully.' });
  } catch (err) {
    console.error('Update attendance error:', err);
    res.status(500).json({ error: 'Server error updating attendance.' });
  } finally {
    if (db) await db.close();
  }
});

// POST /api/admin/attendance - Manually add attendance record (Admin override)
router.post('/attendance', verifyToken, isAdmin, async (req, res) => {
  const { user_id, date, check_in, check_out, status, break_1_start, break_1_end, break_2_start, break_2_end } = req.body;

  if (!user_id || !date || !status) {
    return res.status(400).json({ error: 'Please provide employee (user_id), date, and status.' });
  }

  let db;
  try {
    db = await getDbConnection();

    const user = await db.get('SELECT name FROM users WHERE id = ?', [user_id]);
    if (!user) {
      return res.status(404).json({ error: 'Employee not found.' });
    }

    // Clear conflicting records for the same day
    await db.run('DELETE FROM attendance WHERE user_id = ? AND date = ?', [user_id, date]);

    await db.run(
      `INSERT INTO attendance (user_id, date, check_in, check_out, status, is_approved, break_1_start, break_1_end, break_2_start, break_2_end) 
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
      [
        user_id, 
        date, 
        check_in || null, 
        check_out || null, 
        status,
        break_1_start || null,
        break_1_end || null,
        break_2_start || null,
        break_2_end || null
      ]
    );

    // Log Activity
    await logUserActivity(db, req.user.id, 'ADMIN_ADD', `Admin manually logged attendance for ${user.name} on ${date} as ${status}.`);

    res.json({ message: 'Attendance record created successfully.' });
  } catch (err) {
    console.error('Add manual attendance error:', err);
    res.status(500).json({ error: 'Server error creating manual attendance record.' });
  } finally {
    if (db) await db.close();
  }
});

// PUT /api/admin/attendance/:id/approve - Approve attendance (Admin only)
router.put('/attendance/:id/approve', verifyToken, isAdmin, async (req, res) => {
  const attendanceId = req.params.id;

  let db;
  try {
    db = await getDbConnection();

    const record = await db.get(
      'SELECT a.*, u.name FROM attendance a JOIN users u ON a.user_id = u.id WHERE a.id = ?',
      [attendanceId]
    );
    if (!record) {
      return res.status(404).json({ error: 'Attendance record not found.' });
    }

    await db.run(
      'UPDATE attendance SET is_approved = 1 WHERE id = ?',
      [attendanceId]
    );

    // Log Activity
    await logUserActivity(db, req.user.id, 'ADMIN_APPROVE', `Admin approved ${record.name}'s attendance for ${record.date}.`);

    res.json({ message: 'Attendance approved successfully.' });
  } catch (err) {
    console.error('Approve attendance error:', err);
    res.status(500).json({ error: 'Server error approving attendance.' });
  } finally {
    if (db) await db.close();
  }
});

// GET /api/admin/employees/:id/documents - View attached documents
router.get('/employees/:id/documents', verifyToken, isAdmin, async (req, res) => {
  const empId = req.params.id;
  let db;
  try {
    db = await getDbConnection();
    const docs = await db.all('SELECT * FROM documents WHERE user_id = ? ORDER BY id DESC', [empId]);
    res.json({ documents: docs });
  } catch (err) {
    console.error('Fetch documents error:', err);
    res.status(500).json({ error: 'Server error retrieving documents list.' });
  } finally {
    if (db) await db.close();
  }
});

// POST /api/admin/employees/:id/documents - Attach new document to employee profile
router.post('/employees/:id/documents', verifyToken, isAdmin, async (req, res) => {
  const empId = req.params.id;
  const { title, file_path } = req.body;

  if (!title || !file_path) {
    return res.status(400).json({ error: 'Please provide document title and link path.' });
  }

  let db;
  try {
    db = await getDbConnection();
    const emp = await db.get('SELECT name FROM users WHERE id = ?', [empId]);
    if (!emp) {
      return res.status(404).json({ error: 'Employee not found.' });
    }

    await db.run(
      'INSERT INTO documents (user_id, title, file_path) VALUES (?, ?, ?)',
      [empId, title, file_path]
    );

    // Log Activity
    await logUserActivity(db, req.user.id, 'ADMIN_UPLOAD', `Admin attached document '${title}' to ${emp.name}'s profile.`);

    res.status(201).json({ message: 'Document details attached successfully.' });
  } catch (err) {
    console.error('Attach document error:', err);
    res.status(500).json({ error: 'Server error attaching document.' });
  } finally {
    if (db) await db.close();
  }
});

// DELETE /api/admin/documents/:id - Delete document reference
router.delete('/documents/:id', verifyToken, isAdmin, async (req, res) => {
  const docId = req.params.id;
  let db;
  try {
    db = await getDbConnection();
    const doc = await db.get(
      'SELECT d.*, u.name FROM documents d JOIN users u ON d.user_id = u.id WHERE d.id = ?',
      [docId]
    );
    if (!doc) {
      return res.status(404).json({ error: 'Document link not found.' });
    }

    await db.run('DELETE FROM documents WHERE id = ?', [docId]);

    // Log Activity
    await logUserActivity(db, req.user.id, 'ADMIN_DELETE_DOC', `Admin removed document '${doc.title}' from ${doc.name}'s profile.`);

    res.json({ message: 'Document reference deleted successfully.' });
  } catch (err) {
    console.error('Delete document error:', err);
    res.status(500).json({ error: 'Server error deleting document.' });
  } finally {
    if (db) await db.close();
  }
});

// GET /api/admin/salaries/calculate - Shift-based automatic salary calculator
router.get('/salaries/calculate', verifyToken, isAdmin, async (req, res) => {
  const { user_id, month } = req.query;

  if (!user_id || !month) {
    return res.status(400).json({ error: 'Please specify user_id and month.' });
  }

  if (!/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: 'Invalid month format. Use YYYY-MM.' });
  }

  let db;
  try {
    db = await getDbConnection();

    // Verify employee
    const employee = await db.get(
      "SELECT id, name, salary, deposit_total, deposit_deduction_type, deposit_paid FROM users WHERE id = ? AND role = 'employee'",
      [user_id]
    );

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found.' });
    }

    const basicSalary = employee.salary;

    // Calculate Security Deposit Deduction
    const depositTotal = employee.deposit_total || 0;
    const depositPaid = employee.deposit_paid || 0;
    const remainingDeposit = Math.max(0, depositTotal - depositPaid);
    let depositDeduction = 0;
    if (remainingDeposit > 0) {
      if (employee.deposit_deduction_type === 'first_month') {
        depositDeduction = remainingDeposit;
      } else {
        depositDeduction = Math.min(2000, remainingDeposit);
      }
    }
    const [yearStr, monthStr] = month.split('-');
    const year = parseInt(yearStr);
    const monthNum = parseInt(monthStr);

    // Days in Month
    const totalDays = new Date(year, monthNum, 0).getDate();

    // Load holidays for this month
    const holidays = await db.all(
      'SELECT date, name FROM holidays WHERE date LIKE ?',
      [`${month}%`]
    );
    const holidayDates = new Set(holidays.map(h => h.date));

    let sundaysCount = 0;
    let holidaysCount = 0;
    const workingDates = [];

    // Identify sundays, holidays, and working dates
    for (let day = 1; day <= totalDays; day++) {
      const dateObj = new Date(year, monthNum - 1, day);
      const dayOfWeek = dateObj.getDay(); // 0 is Sunday
      const dateStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      if (dayOfWeek === 0) {
        sundaysCount++;
      } else if (holidayDates.has(dateStr)) {
        holidaysCount++;
      } else {
        workingDates.push(dateStr);
      }
    }

    const workingDaysCount = workingDates.length;
    const dailyRate = workingDaysCount > 0 ? basicSalary / workingDaysCount : 0;
    const hourlyRate = dailyRate / 9; // 9 hours work day (9:30 to 6:30)

    // Load attendance records for this month
    const attendance = await db.all(
      'SELECT * FROM attendance WHERE user_id = ? AND date LIKE ?',
      [user_id, `${month}%`]
    );

    const attendanceMap = {};
    attendance.forEach(a => {
      attendanceMap[a.date] = a;
    });

    let absentCount = 0;
    let presentCount = 0;
    let leaveCount = 0;
    let halfDayCount = 0;
    let absentDeductions = 0;
    let leaveDeductions = 0;
    let penaltyDeductions = 0; // missing checkout penalty
    let halfDayDeductions = 0;

    // Granular time tracking (in seconds)
    let totalLateInSeconds = 0;       // check-in after 09:30
    let totalEarlyOutSeconds = 0;     // check-out before 18:30
    let totalExtraBreakSeconds = 0;   // break time beyond allowed limits
    let totalOvertimeSeconds = 0;     // work after 18:30

    function convertTimeToSeconds(timeStr) {
      if (!timeStr) return 0;
      const [h, m, s] = timeStr.split(':').map(Number);
      return h * 3600 + m * 60 + (s || 0);
    }

    // Official shift: 09:30:00 (34200s) to 18:30:00 (66600s)
    const shiftStart = 34200;
    const shiftEnd = 66600;

    workingDates.forEach(date => {
      const log = attendanceMap[date];

      if (!log || log.status === 'Absent' || (log.status === 'Present' && !log.is_approved)) {
        absentCount++;
        absentDeductions += dailyRate;
      } else if (log.status === 'On Leave') {
        leaveCount++;
        leaveDeductions += dailyRate;
      } else if (log.status === 'Half Day') {
        halfDayCount++;
        halfDayDeductions += dailyRate / 2;
      } else if (log.status === 'Present' && log.is_approved) {
        presentCount++;

        if (!log.check_out) {
          // Checked in but no checkout → full day penalty
          penaltyDeductions += dailyRate;
        } else {
          const inSec = convertTimeToSeconds(log.check_in);
          const outSec = convertTimeToSeconds(log.check_out);

          // Late check-in: seconds after 09:30
          if (inSec > shiftStart) {
            totalLateInSeconds += (inSec - shiftStart);
          }

          // Early out: seconds before 18:30
          if (outSec < shiftEnd) {
            totalEarlyOutSeconds += (shiftEnd - outSec);
          }

          // Overtime: seconds worked after 18:30
          if (outSec > shiftEnd) {
            totalOvertimeSeconds += (outSec - shiftEnd);
          }

          // Excess break time
          if (log.break_1_start) {
            const b1Start = convertTimeToSeconds(log.break_1_start);
            const b1End = log.break_1_end
              ? convertTimeToSeconds(log.break_1_end)
              : (log.check_out ? convertTimeToSeconds(log.check_out) : b1Start);
            const b1Duration = Math.max(0, b1End - b1Start);
            if (b1Duration > 2700) { // 45 min limit
              totalExtraBreakSeconds += (b1Duration - 2700);
            }
          }
          if (log.break_2_start) {
            const b2Start = convertTimeToSeconds(log.break_2_start);
            const b2End = log.break_2_end
              ? convertTimeToSeconds(log.break_2_end)
              : (log.check_out ? convertTimeToSeconds(log.check_out) : b2Start);
            const b2Duration = Math.max(0, b2End - b2Start);
            if (b2Duration > 900) { // 15 min limit
              totalExtraBreakSeconds += (b2Duration - 900);
            }
          }
        }
      }
    });

    // Per-minute rates
    const minuteRate = hourlyRate / 60; // salary per 1 minute

    // Deductions (2x per minute for late-in, early-out, extra break)
    const lateInDeductions   = Math.min(basicSalary, (totalLateInSeconds / 60) * minuteRate * 2);
    const earlyOutDeductions = Math.min(basicSalary, (totalEarlyOutSeconds / 60) * minuteRate * 2);
    const breakDeductions    = Math.min(basicSalary, (totalExtraBreakSeconds / 60) * minuteRate * 2);

    // Overtime bonus (1.5x per minute — added to net salary)
    const overtimeBonus = (totalOvertimeSeconds / 60) * minuteRate * 1.5;

    const totalDeductions = absentDeductions + leaveDeductions + halfDayDeductions
                          + penaltyDeductions + lateInDeductions + earlyOutDeductions + breakDeductions
                          + depositDeduction;

    const netSalary = Math.max(0, basicSalary - totalDeductions + overtimeBonus);

    res.json({
      employeeId: employee.id,
      employeeName: employee.name,
      month,
      basicSalary,
      workingDays: workingDaysCount,
      sundays: sundaysCount,
      holidays: holidaysCount,
      absentDays: absentCount,
      presentDays: presentCount,
      leaveDays: leaveCount,
      halfDays: halfDayCount,
      // Minute counts
      lateInMinutes: Math.round(totalLateInSeconds / 60),
      earlyOutMinutes: Math.round(totalEarlyOutSeconds / 60),
      extraBreakMinutes: Math.round(totalExtraBreakSeconds / 60),
      overtimeMinutes: Math.round(totalOvertimeSeconds / 60),
      // Deductions (all 2x)
      absentDeductions:   Math.round(absentDeductions * 100) / 100,
      leaveDeductions:    Math.round(leaveDeductions * 100) / 100,
      halfDayDeductions:  Math.round(halfDayDeductions * 100) / 100,
      penaltyDeductions:  Math.round(penaltyDeductions * 100) / 100,
      lateInDeductions:   Math.round(lateInDeductions * 100) / 100,
      earlyOutDeductions: Math.round(earlyOutDeductions * 100) / 100,
      breakDeductions:    Math.round(breakDeductions * 100) / 100,
      // Bonus
      overtimeBonus:      Math.round(overtimeBonus * 100) / 100,
      // Deposit
      depositDeduction:   Math.round(depositDeduction * 100) / 100,
      depositDeductionType: employee.deposit_deduction_type || 'monthly_2000',
      // Totals
      totalDeductions:    Math.round(totalDeductions * 100) / 100,
      netSalary:          Math.round(netSalary * 100) / 100
    });
  } catch (err) {
    console.error('Calculate salary error:', err);
    res.status(500).json({ error: 'Server error performing salary calculations.' });
  } finally {
    if (db) await db.close();
  }
});

// GET /api/admin/holidays - List all holidays
router.get('/holidays', verifyToken, isAdmin, async (req, res) => {
  let db;
  try {
    db = await getDbConnection();
    const holidays = await db.all('SELECT * FROM holidays ORDER BY date ASC');
    res.json({ holidays });
  } catch (err) {
    console.error('Fetch holidays error:', err);
    res.status(500).json({ error: 'Server error retrieving holidays.' });
  } finally {
    if (db) await db.close();
  }
});

// POST /api/admin/holidays - Create a holiday
router.post('/holidays', verifyToken, isAdmin, async (req, res) => {
  const { date, name } = req.body;

  if (!date || !name) {
    return res.status(400).json({ error: 'Please provide both date and holiday name.' });
  }

  // Validate date format (YYYY-MM-DD)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Invalid date format. Please use YYYY-MM-DD.' });
  }

  let db;
  try {
    db = await getDbConnection();

    // Check if duplicate date
    const existing = await db.get('SELECT id FROM holidays WHERE date = ?', [date]);
    if (existing) {
      return res.status(400).json({ error: 'A holiday is already declared on this date.' });
    }

    await db.run(
      'INSERT INTO holidays (date, name) VALUES (?, ?)',
      [date, name]
    );

    // Log activity
    await logUserActivity(db, req.user.id, 'HOLIDAY_ADD', `Admin declared a public holiday on ${date}: ${name}.`);

    res.status(201).json({ message: 'Holiday declared successfully.' });
  } catch (err) {
    console.error('Add holiday error:', err);
    res.status(500).json({ error: 'Server error creating holiday.' });
  } finally {
    if (db) await db.close();
  }
});

// DELETE /api/admin/holidays/:id - Delete a holiday
router.delete('/holidays/:id', verifyToken, isAdmin, async (req, res) => {
  const holidayId = req.params.id;

  let db;
  try {
    db = await getDbConnection();

    const holiday = await db.get('SELECT * FROM holidays WHERE id = ?', [holidayId]);
    if (!holiday) {
      return res.status(404).json({ error: 'Holiday not found.' });
    }

    await db.run('DELETE FROM holidays WHERE id = ?', [holidayId]);

    // Log activity
    await logUserActivity(db, req.user.id, 'HOLIDAY_DELETE', `Admin deleted public holiday ${holiday.name} on ${holiday.date}.`);

    res.json({ message: 'Holiday deleted successfully.' });
  } finally {
    if (db) await db.close();
  }
});

// PUT /api/admin/profile/change-password - Change admin's own password
router.put('/profile/change-password', verifyToken, isAdmin, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const adminId = req.user.id;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Please provide current and new passwords.' });
  }

  let db;
  try {
    db = await getDbConnection();

    const admin = await db.get('SELECT * FROM users WHERE id = ?', [adminId]);
    if (!admin) {
      return res.status(404).json({ error: 'Admin user not found.' });
    }

    const isMatch = bcrypt.compareSync(currentPassword, admin.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }

    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(newPassword, salt);

    await db.run('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, adminId]);

    // Log Activity
    await logUserActivity(db, adminId, 'ADMIN_CHANGE_PWD', `Admin changed their own password.`);

    res.json({ message: 'Password updated successfully.' });
  } catch (err) {
    console.error('Admin change password error:', err);
    res.status(500).json({ error: 'Server error updating password.' });
  } finally {
    if (db) await db.close();
  }
});

// PUT /api/admin/employees/:id/reset-password - Admin resets employee password
router.put('/employees/:id/reset-password', verifyToken, isAdmin, async (req, res) => {
  const employeeId = req.params.id;
  const { newPassword } = req.body;

  if (!newPassword) {
    return res.status(400).json({ error: 'Please provide the new password.' });
  }

  let db;
  try {
    db = await getDbConnection();

    const employee = await db.get('SELECT name FROM users WHERE id = ? AND role = "employee"', [employeeId]);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found.' });
    }

    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(newPassword, salt);

    await db.run('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, employeeId]);

    // Log Activity
    await logUserActivity(db, req.user.id, 'ADMIN_RESET_EMP_PWD', `Admin reset password for employee ${employee.name}.`);

    res.json({ message: `Password for ${employee.name} reset successfully.` });
  } catch (err) {
    console.error('Reset employee password error:', err);
    res.status(500).json({ error: 'Server error resetting employee password.' });
  } finally {
    if (db) await db.close();
  }
});

module.exports = router;
