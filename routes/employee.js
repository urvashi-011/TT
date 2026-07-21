const express = require('express');
const router = express.Router();
const { getDbConnection, logUserActivity } = require('../database');
const { verifyToken } = require('../middleware/auth');

// Helper to get today's date in YYYY-MM-DD format
function getTodayDate() {
  const d = new Date();
  // Adjust to local timezone format (YYYY-MM-DD)
  const offset = d.getTimezoneOffset();
  const localDate = new Date(d.getTime() - (offset * 60 * 1000));
  return localDate.toISOString().split('T')[0];
}

// Helper to get current time in HH:MM:SS format
function getCurrentTime() {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  const localDate = new Date(d.getTime() - (offset * 60 * 1000));
  return localDate.toISOString().split('T')[1].split('.')[0];
}

// GET /api/employee/stats - Dashboard statistics
router.get('/stats', verifyToken, async (req, res) => {
  const userId = req.user.id;
  const today = getTodayDate();
  const currentMonth = today.substring(0, 7); // YYYY-MM

  let db;
  try {
    db = await getDbConnection();

    // 1. Today's attendance record
    const todayAttendance = await db.get(
      'SELECT * FROM attendance WHERE user_id = ? AND date = ?',
      [userId, today]
    );

    // 2. Count present days this month
    const presentCount = await db.get(
      "SELECT COUNT(*) as count FROM attendance WHERE user_id = ? AND date LIKE ? AND status = 'Present'",
      [userId, `${currentMonth}%`]
    );

    // 3. Count approved leaves this month
    const leaveCount = await db.get(
      "SELECT COUNT(*) as count FROM leaves WHERE user_id = ? AND (start_date LIKE ? OR end_date LIKE ?) AND status = 'Approved'",
      [userId, `${currentMonth}%`, `${currentMonth}%`]
    );

    // 4. Pending leave applications count
    const pendingLeaveCount = await db.get(
      "SELECT COUNT(*) as count FROM leaves WHERE user_id = ? AND status = 'Pending'",
      [userId]
    );

    const isOnBreak = todayAttendance ? (
      (todayAttendance.break_1_start && !todayAttendance.break_1_end) ||
      (todayAttendance.break_2_start && !todayAttendance.break_2_end)
    ) : false;

    res.json({
      todayStatus: todayAttendance ? todayAttendance.status : 'Absent',
      checkInTime: todayAttendance ? todayAttendance.check_in : null,
      checkOutTime: todayAttendance ? todayAttendance.check_out : null,
      isOnBreak,
      break1Start: todayAttendance ? todayAttendance.break_1_start : null,
      break1End: todayAttendance ? todayAttendance.break_1_end : null,
      break2Start: todayAttendance ? todayAttendance.break_2_start : null,
      break2End: todayAttendance ? todayAttendance.break_2_end : null,
      monthlyPresent: presentCount.count,
      monthlyLeaves: leaveCount.count,
      pendingLeaves: pendingLeaveCount.count
    });
  } catch (err) {
    console.error('Fetch employee stats error:', err);
    res.status(500).json({ error: 'Server error retrieving dashboard statistics.' });
  } finally {
    if (db) await db.close();
  }
});

// POST /api/employee/attendance/check-in
router.post('/attendance/check-in', verifyToken, async (req, res) => {
  const userId = req.user.id;
  const today = getTodayDate();
  const nowTime = getCurrentTime();

  let db;
  try {
    db = await getDbConnection();

    // Check if user has already checked in or is on leave today
    const existing = await db.get(
      'SELECT * FROM attendance WHERE user_id = ? AND date = ?',
      [userId, today]
    );

    if (existing) {
      if (existing.status === 'On Leave') {
        return res.status(400).json({ error: 'Cannot check in. You are on approved leave today.' });
      }
      return res.status(400).json({ error: 'You have already checked in for today.' });
    }

    // Record check-in (is_approved defaults to 0 for self check-in)
    await db.run(
      'INSERT INTO attendance (user_id, date, check_in, status, is_approved) VALUES (?, ?, ?, ?, 0)',
      [userId, today, nowTime, 'Present']
    );

    // Log Activity
    await logUserActivity(db, userId, 'CHECK_IN', `${req.user.name} checked in at ${nowTime}.`);

    res.json({
      message: 'Successfully checked in.',
      date: today,
      checkInTime: nowTime
    });
  } catch (err) {
    console.error('Check-in error:', err);
    res.status(500).json({ error: 'Server error during check-in.' });
  } finally {
    if (db) await db.close();
  }
});

// POST /api/employee/attendance/check-out
router.post('/attendance/check-out', verifyToken, async (req, res) => {
  const userId = req.user.id;
  const today = getTodayDate();
  const nowTime = getCurrentTime();

  let db;
  try {
    db = await getDbConnection();

    const existing = await db.get(
      'SELECT * FROM attendance WHERE user_id = ? AND date = ?',
      [userId, today]
    );

    if (!existing) {
      return res.status(400).json({ error: 'You have not checked in today. Check-in first.' });
    }

    if (existing.check_out) {
      return res.status(400).json({ error: 'You have already checked out for today.' });
    }

    if (existing.status === 'On Leave') {
      return res.status(400).json({ error: 'You are marked as On Leave today.' });
    }

    // Record check-out
    await db.run(
      'UPDATE attendance SET check_out = ? WHERE id = ?',
      [nowTime, existing.id]
    );

    // Log Activity
    await logUserActivity(db, userId, 'CHECK_OUT', `${req.user.name} checked out at ${nowTime}.`);

    res.json({
      message: 'Successfully checked out.',
      date: today,
      checkOutTime: nowTime
    });
  } catch (err) {
    console.error('Check-out error:', err);
    res.status(500).json({ error: 'Server error during check-out.' });
  } finally {
    if (db) await db.close();
  }
});

// POST /api/employee/attendance/break-start - Start break
router.post('/attendance/break-start', verifyToken, async (req, res) => {
  const userId = req.user.id;
  const today = getTodayDate();
  const nowTime = getCurrentTime();
  const { breakType } = req.body || {};

  let db;
  try {
    db = await getDbConnection();

    // Check if checked in today
    const attendance = await db.get(
      'SELECT * FROM attendance WHERE user_id = ? AND date = ?',
      [userId, today]
    );

    if (!attendance) {
      return res.status(400).json({ error: 'Please check in first before starting a break.' });
    }

    if (attendance.check_out) {
      return res.status(400).json({ error: 'You have already checked out for today.' });
    }

    let updateColumn = '';
    let breakName = '';

    if (breakType === 'lunch' || (!breakType && nowTime >= '12:00:00' && nowTime < '15:00:00')) {
      if (attendance.break_1_start) {
        return res.status(400).json({ error: 'You have already taken Lunch Break today.' });
      }
      updateColumn = 'break_1_start';
      breakName = 'Lunch Break (1:00 PM - 1:45 PM)';
    } else if (breakType === 'tea' || (!breakType && nowTime >= '15:00:00' && nowTime < '18:00:00')) {
      if (attendance.break_2_start) {
        return res.status(400).json({ error: 'You have already taken Tea Break today.' });
      }
      updateColumn = 'break_2_start';
      breakName = 'Tea Break (4:00 PM - 4:15 PM)';
    } else {
      return res.status(400).json({ error: 'Breaks are only allowed during official break windows (1:00 PM - 1:45 PM for Lunch or 4:00 PM - 4:15 PM for Tea).' });
    }

    await db.run(
      `UPDATE attendance SET ${updateColumn} = ? WHERE id = ?`,
      [nowTime, attendance.id]
    );

    // Log Activity
    await logUserActivity(db, userId, 'BREAK_START', `${req.user.name} started ${breakName} at ${nowTime}.`);

    res.json({
      message: `Successfully started ${breakName}.`,
      breakTime: nowTime
    });
  } catch (err) {
    console.error('Break start error:', err);
    res.status(500).json({ error: 'Server error during break start.' });
  } finally {
    if (db) await db.close();
  }
});

// POST /api/employee/attendance/break-end - End break
router.post('/attendance/break-end', verifyToken, async (req, res) => {
  const userId = req.user.id;
  const today = getTodayDate();
  const nowTime = getCurrentTime();
  const { breakType } = req.body || {};

  let db;
  try {
    db = await getDbConnection();

    // Check if checked in today
    const attendance = await db.get(
      'SELECT * FROM attendance WHERE user_id = ? AND date = ?',
      [userId, today]
    );

    if (!attendance) {
      return res.status(400).json({ error: 'Please check in first.' });
    }

    // Determine which break is active
    let updateColumn = '';
    let breakName = '';

    if (breakType === 'lunch') {
      if (attendance.break_1_start && !attendance.break_1_end) {
        updateColumn = 'break_1_end';
        breakName = 'Lunch Break';
      } else {
        return res.status(400).json({ error: 'Lunch Break is not currently active.' });
      }
    } else if (breakType === 'tea') {
      if (attendance.break_2_start && !attendance.break_2_end) {
        updateColumn = 'break_2_end';
        breakName = 'Tea Break';
      } else {
        return res.status(400).json({ error: 'Tea Break is not currently active.' });
      }
    } else {
      // Auto fallback
      if (attendance.break_1_start && !attendance.break_1_end) {
        updateColumn = 'break_1_end';
        breakName = 'Lunch Break';
      } else if (attendance.break_2_start && !attendance.break_2_end) {
        updateColumn = 'break_2_end';
        breakName = 'Tea Break';
      } else {
        return res.status(400).json({ error: 'No active break found to end.' });
      }
    }

    await db.run(
      `UPDATE attendance SET ${updateColumn} = ? WHERE id = ?`,
      [nowTime, attendance.id]
    );

    // Log Activity
    await logUserActivity(db, userId, 'BREAK_END', `${req.user.name} ended ${breakName} at ${nowTime}.`);

    res.json({
      message: `Successfully ended ${breakName}.`,
      breakTime: nowTime
    });
  } catch (err) {
    console.error('Break end error:', err);
    res.status(500).json({ error: 'Server error during break end.' });
  } finally {
    if (db) await db.close();
  }
});

// GET /api/employee/attendance/history - View my monthly attendance
router.get('/attendance/history', verifyToken, async (req, res) => {
  const userId = req.user.id;
  const month = req.query.month || getTodayDate().substring(0, 7); // default YYYY-MM

  let db;
  try {
    db = await getDbConnection();
    const history = await db.all(
      'SELECT * FROM attendance WHERE user_id = ? AND date LIKE ? ORDER BY date DESC',
      [userId, `${month}%`]
    );

    res.json({ history });
  } catch (err) {
    console.error('Fetch attendance history error:', err);
    res.status(500).json({ error: 'Server error retrieving attendance history.' });
  } finally {
    if (db) await db.close();
  }
});

// GET /api/employee/leaves - View my leave applications
router.get('/leaves', verifyToken, async (req, res) => {
  const userId = req.user.id;

  let db;
  try {
    db = await getDbConnection();
    const leaves = await db.all(
      'SELECT * FROM leaves WHERE user_id = ? ORDER BY id DESC',
      [userId]
    );

    res.json({ leaves });
  } catch (err) {
    console.error('Fetch leaves error:', err);
    res.status(500).json({ error: 'Server error retrieving leave applications.' });
  } finally {
    if (db) await db.close();
  }
});

// POST /api/employee/leaves/apply - Submit a leave application
router.post('/leaves/apply', verifyToken, async (req, res) => {
  const userId = req.user.id;
  const { leave_type, start_date, end_date, reason } = req.body;

  if (!leave_type || !start_date || !end_date || !reason) {
    return res.status(400).json({ error: 'Please provide all details (leave_type, start_date, end_date, reason).' });
  }

  // Validate dates
  const start = new Date(start_date);
  const end = new Date(end_date);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return res.status(400).json({ error: 'Invalid start date or end date format.' });
  }

  if (start > end) {
    return res.status(400).json({ error: 'Start date cannot be after the end date.' });
  }

  let db;
  try {
    db = await getDbConnection();
    await db.run(
      'INSERT INTO leaves (user_id, leave_type, start_date, end_date, reason, status) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, leave_type, start_date, end_date, reason, 'Pending']
    );

    // Log Activity
    await logUserActivity(db, userId, 'LEAVE_APPLY', `${req.user.name} applied for ${leave_type} Leave (${start_date} to ${end_date}).`);

    res.json({ message: 'Leave application submitted successfully.' });
  } catch (err) {
    console.error('Apply leave error:', err);
    res.status(500).json({ error: 'Server error submitting leave application.' });
  } finally {
    if (db) await db.close();
  }
});

// GET /api/employee/salaries - View my salary slips
router.get('/salaries', verifyToken, async (req, res) => {
  const userId = req.user.id;

  let db;
  try {
    db = await getDbConnection();
    const salaries = await db.all(
      'SELECT * FROM salaries WHERE user_id = ? ORDER BY month DESC',
      [userId]
    );

    res.json({ salaries });
  } catch (err) {
    console.error('Fetch salary details error:', err);
    res.status(500).json({ error: 'Server error retrieving salary details.' });
  } finally {
    if (db) await db.close();
  }
});

// GET /api/employee/holidays - List holidays for employee view
router.get('/holidays', verifyToken, async (req, res) => {
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

module.exports = router;
