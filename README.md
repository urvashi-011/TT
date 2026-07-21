# EmployeeHub - Employee Attendance & Management System

EmployeeHub is a complete, production-ready full-stack employee attendance, leave management, and salary slips application. It is built using Node.js, Express.js, SQLite, and a custom cobalt blue themed Bootstrap 5 frontend.

---

## Features

### 🔑 Authentication
- Secure JWT-based session tokens.
- Secure credential hashing using `bcryptjs`.
- Automatic client-side router guards for employees and admins.

### 🧑‍💼 Employee Portal
- **Dashboard Overview**: Access live real-time digital clock widget and immediate attendance status indicators (Present/Absent/On Leave).
- **Attendance Check-In/Out**: Easily log daily attendance with server-side time calculations to prevent system time spoofing.
- **Leave Application Forms**: File Sick, Casual, or Earned leave requests with automatic date duration calculations and reasons.
- **Monthly Attendance Logs**: View historical attendance tables filtered by month.
- **Payslips & Salaries**: Review salary statements with detailed base, allowance, deduction, and net breakdown. Includes options to print pay slips.
- **Profile Card**: View employee profile details like department, designation, salary package, and joining date.

### 👑 Admin Portal
- **Dashboard Metrics**: Live count metrics for Total Active headcount, Present Today, On Leave Today, and Absent Today.
- **Employee Directory (CRUD)**: Create, edit, and delete employee details, update salary packages, change portal login passwords, and toggle active status.
- **Global Attendance Logs**: View all logs of all employees filterable by date and name.
- **Leave Requests Desk**: Approve or reject pending leaves. Approved leaves automatically write "On Leave" attendance logs for the requested duration.
- **Salary processing desk**: Disburse monthly salaries with basic packages, allowances, and deduction inputs. Holds history logs.

---

## Technology Stack

- **Backend**: Node.js & Express.js
- **Database**: SQLite (Zero-config local file: `employeehub.db`)
- **Authentication**: JWT (`jsonwebtoken`) and `bcryptjs`
- **Frontend**: HTML5 + Vanilla JS + Bootstrap 5 + FontAwesome Icons + Google Fonts (Inter)
- **Aesthetic**: Premium Cobalt Blue, modern dark layout, glassmorphic panels, subtle hover transitions.

---

## Directory Layout

```
EmployeeHub/
├── .env                  # Configuration (Port, JWT Secret)
├── package.json          # Node package dependencies
├── server.js             # Express application root entry point
├── database.js           # Database schema initialization and seed script
├── employeehub.db        # SQLite local file (generated on start)
├── README.md             # Setup guide documentation
├── middleware/
│   └── auth.js           # Verification and Admin permission guards
├── routes/
│   ├── auth.js           # Login & Auth status check endpoints
│   ├── employee.js       # Employee operations (stats, check-in, leaves, salary)
│   └── admin.js          # Admin operations (CRUD, global logs, approval, payouts)
└── public/
    ├── css/
    │   └── style.css     # CSS design tokens & animations styles
    ├── js/
    │   ├── app.js        # Shared auth guards & API request interceptors
    │   ├── employee.js   # Employee dashboard tab logic
    │   └── admin.js      # Admin CRUD directory & leave processor logic
    ├── login.html        # Floating login interface
    ├── dashboard.html    # Employee panel interface
    ├── admin.html        # Admin portal interface
    └── 404.html          # Fallback error page
```

---

## Getting Started

### 📋 Prerequisites
- Make sure [Node.js](https://nodejs.org/) (v16 or higher recommended) is installed on your machine.

### 🚀 Installation Steps

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Initialize SQLite database & Start Server**:
   Start the server. The application will automatically detect that `employeehub.db` does not exist (or is empty), build all necessary tables, and seed initial test credentials.
   ```bash
   npm start
   ```

3. **Open the web application**:
   Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

---

## 🔒 Default Test Accounts

When the application database is created, the system seeds three default test profiles:

### 1. Admin Portal
- **Email**: `admin@employeehub.com`
- **Password**: `admin123`
- **Role**: HR Admin

### 2. Employee Profile 1 (Engineering)
- **Email**: `john.doe@employeehub.com`
- **Password**: `password123`
- **Role**: Senior Developer

### 3. Employee Profile 2 (Marketing)
- **Email**: `jane.smith@employeehub.com`
- **Password**: `password123`
- **Role**: Designer
