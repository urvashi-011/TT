const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { getDbConnection, logUserActivity } = require('../database');
const { verifyToken } = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Please provide both email and password.' });
  }

  let db;
  try {
    db = await getDbConnection();
    const user = await db.get('SELECT * FROM users WHERE email = ?', [email.toLowerCase().trim()]);

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (user.status !== 'active') {
      return res.status(403).json({ error: 'Your account is deactivated. Please contact support.' });
    }

    const isMatch = bcrypt.compareSync(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Log Activity
    await logUserActivity(db, user.id, 'LOGIN', `${user.name} logged in.`);

    // Generate JWT
    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'employeehub_secret_key_2026_xyz',
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Login successful.',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        designation: user.designation,
        joining_date: user.joining_date,
        salary: user.salary,
        deposit_total: user.deposit_total || 0,
        deposit_deduction_type: user.deposit_deduction_type || 'monthly_2000',
        deposit_paid: user.deposit_paid || 0
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login processing.' });
  } finally {
    if (db) await db.close();
  }
});

// GET /api/auth/me
router.get('/me', verifyToken, async (req, res) => {
  let db;
  try {
    db = await getDbConnection();
    const user = await db.get(
      'SELECT id, name, email, role, department, designation, joining_date, salary, status, deposit_total, deposit_deduction_type, deposit_paid FROM users WHERE id = ?',
      [req.user.id]
    );

    if (!user) {
      return res.status(404).json({ error: 'User profile not found.' });
    }

    res.json({ user });
  } catch (err) {
    console.error('Fetch me error:', err);
    res.status(500).json({ error: 'Server error retrieving profile details.' });
  } finally {
    if (db) await db.close();
  }
});

module.exports = router;
