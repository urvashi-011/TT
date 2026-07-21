const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const { initDb } = require('./database');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS
app.use(cors());

// Body Parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve Static Files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Initialize Database & Tables
initDb()
  .then(() => {
    console.log('SQLite Database successfully initialized and verified.');
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });

// Load Routes
const authRouter = require('./routes/auth');
const employeeRouter = require('./routes/employee');
const adminRouter = require('./routes/admin');

// ─── SECURITY: Block DELETE & PUT on all /api/employee/* routes ───────────────
// Employees are NOT allowed to delete or overwrite any data.
// Only check-in / check-out / break / leave-apply (POST/GET) are permitted.
app.use('/api/employee', (req, res, next) => {
  if (req.method === 'DELETE') {
    return res.status(403).json({
      error: 'Permission denied. Employees are not allowed to delete any data.'
    });
  }
  if (req.method === 'PUT' || req.method === 'PATCH') {
    return res.status(403).json({
      error: 'Permission denied. Employees are not allowed to modify records directly.'
    });
  }
  next();
});
// ──────────────────────────────────────────────────────────────────────────────

// Map Routes
app.use('/api/auth', authRouter);
app.use('/api/employee', employeeRouter);
app.use('/api/admin', adminRouter);

// Fallback Route: Redirect root path to login.html
app.get('/', (req, res) => {
  res.redirect('/login.html');
});

// Wildcard fallback to redirect unknown paths
app.get('*', (req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'), (err) => {
    if (err) {
      res.status(404).send('404 Page Not Found');
    }
  });
});

// Start Server Listening (only if run directly, not when required by Vercel serverless)
if (require.main === module && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`TrueTwist server running locally on http://localhost:${PORT}`);
  });
}

module.exports = app;
