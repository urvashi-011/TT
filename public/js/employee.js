// Employee Dashboard Operations

let currentSlipDetails = null; // Global storage for selected payslip modal details

document.addEventListener('DOMContentLoaded', () => {
  // 1. Guard check
  checkAuth('employee');

  // 2. Set active tab listener
  setupTabNavigation();

  // 3. Start running digital clock
  initClock();

  // 4. Set current month input default
  const todayStr = new Date().toISOString().split('T')[0];
  document.getElementById('filter-month').value = todayStr.substring(0, 7);

  // 5. Load dashboard statistics & details
  loadDashboardStats();
  loadAttendanceHistory();
  loadLeaveHistory();
  loadSalarySlips();
  populateProfileDetails();
  loadUpcomingHolidays();

  // 6. Bind leave request submit
  const leaveForm = document.getElementById('applyLeaveForm');
  leaveForm.addEventListener('submit', handleLeaveSubmit);
});

// Sidebar navigation tab toggles
function setupTabNavigation() {
  const menuItems = document.querySelectorAll('.sidebar-menu-item');
  const sections = document.querySelectorAll('.tab-content');
  const pageTitle = document.getElementById('page-title');

  menuItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      
      const tabId = item.getAttribute('data-tab');
      
      // Update sidebar state
      menuItems.forEach(mi => mi.classList.remove('active'));
      item.classList.add('active');

      // Update visible tab layout
      sections.forEach(sec => {
        if (sec.id === tabId) {
          sec.classList.remove('d-none');
        } else {
          sec.classList.add('d-none');
        }
      });

      // Update page title representation
      if (tabId === 'tab-dashboard') pageTitle.textContent = 'Dashboard Overview';
      if (tabId === 'tab-attendance') pageTitle.textContent = 'Attendance History';
      if (tabId === 'tab-leave') pageTitle.textContent = 'Leave Applications';
      if (tabId === 'tab-salary') pageTitle.textContent = 'Salary Records';
      if (tabId === 'tab-profile') pageTitle.textContent = 'My Personal Profile';

      // Auto-collapse sidebar on mobile after clicking
      if (window.innerWidth < 992) {
        document.querySelector('.sidebar').classList.add('collapsed');
      }
    });
  });
}

// Running clock widget
function initClock() {
  const clockEl = document.getElementById('live-clock');
  const dateEl = document.getElementById('live-date');

  function update() {
    const now = new Date();
    
    // Time format
    clockEl.textContent = now.toLocaleTimeString();

    // Date format
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    dateEl.textContent = now.toLocaleDateString(undefined, options);
  }

  update();
  setInterval(update, 1000);
}

// Populate stats & check-in buttons
async function loadDashboardStats() {
  try {
    const stats = await apiRequest('/employee/stats');
    
    // Update count labels
    document.getElementById('stat-present-count').textContent = stats.monthlyPresent;
    document.getElementById('stat-leaves-count').textContent = stats.monthlyLeaves;
    document.getElementById('stat-pending-count').textContent = stats.pendingLeaves;

    // Update attendance buttons & status
    const statusBadge = document.getElementById('today-status-badge');
    const checkinBtn = document.getElementById('btn-checkin');
    const checkoutBtn = document.getElementById('btn-checkout');
    const breakLunchBtn = document.getElementById('btn-break-lunch');
    const breakTeaBtn = document.getElementById('btn-break-tea');
    const logDetails = document.getElementById('attendance-log-today');

    statusBadge.textContent = stats.todayStatus;
    
    // Reset classes
    statusBadge.className = 'status-badge ms-2 fw-bold ';
    if (stats.todayStatus === 'Present') {
      statusBadge.classList.add('badge-present');
    } else if (stats.todayStatus === 'On Leave') {
      statusBadge.classList.add('badge-leave');
    } else if (stats.todayStatus === 'Half Day') {
      statusBadge.classList.add('badge-halfday');
    } else {
      statusBadge.classList.add('badge-absent');
    }

    // Toggle button state machine
    if (stats.todayStatus === 'On Leave') {
      checkinBtn.disabled = true;
      checkoutBtn.disabled = true;
      breakLunchBtn.classList.add('d-none');
      breakTeaBtn.classList.add('d-none');
      logDetails.innerHTML = `<span class="text-warning"><i class="fa-solid fa-plane-departure me-1"></i> Marked on Leave today.</span>`;
    } else if (stats.todayStatus === 'Present') {
      checkinBtn.disabled = true;
      
      let breakLogsText = '';
      if (stats.break1Start) {
        breakLogsText += `<div class="text-white-50 mt-1" style="font-size: 0.8rem;">Lunch Break: <strong class="text-white">${stats.break1Start} - ${stats.break1End || 'Active'}</strong></div>`;
      }
      if (stats.break2Start) {
        breakLogsText += `<div class="text-white-50 mt-1" style="font-size: 0.8rem;">Tea Break: <strong class="text-white">${stats.break2Start} - ${stats.break2End || 'Active'}</strong></div>`;
      }

      if (stats.checkOutTime) {
        checkoutBtn.disabled = true;
        breakLunchBtn.classList.add('d-none');
        breakTeaBtn.classList.add('d-none');
        logDetails.innerHTML = `
          <div class="text-white-50">Checked in: <strong class="text-white">${stats.checkInTime}</strong></div>
          <div class="text-white-50">Checked out: <strong class="text-white">${stats.checkOutTime}</strong></div>
          ${breakLogsText}
        `;
      } else {
        checkoutBtn.disabled = false;
        breakLunchBtn.classList.remove('d-none');
        breakTeaBtn.classList.remove('d-none');
        
        // Update Lunch Break button
        if (stats.break1Start && !stats.break1End) {
          breakLunchBtn.innerHTML = '<i class="fa-solid fa-bowl-food me-2"></i>End Lunch';
          breakLunchBtn.className = 'btn btn-danger w-100 py-2 border-0 fw-semibold text-white';
          breakLunchBtn.disabled = false;
          breakTeaBtn.disabled = true;
        } else if (stats.break1Start && stats.break1End) {
          breakLunchBtn.innerHTML = '<i class="fa-solid fa-circle-check me-2"></i>Lunch Completed';
          breakLunchBtn.className = 'btn btn-secondary w-100 py-2 border-0 fw-semibold text-white';
          breakLunchBtn.disabled = true;
        } else {
          breakLunchBtn.innerHTML = '<i class="fa-solid fa-bowl-food me-2"></i>Start Lunch';
          breakLunchBtn.className = 'btn btn-warning w-100 py-2 border-0 fw-semibold text-white';
          breakLunchBtn.disabled = stats.isOnBreak;
        }

        // Update Tea Break button
        if (stats.break2Start && !stats.break2End) {
          breakTeaBtn.innerHTML = '<i class="fa-solid fa-mug-hot me-2"></i>End Tea';
          breakTeaBtn.className = 'btn btn-danger w-100 py-2 border-0 fw-semibold text-white';
          breakTeaBtn.disabled = false;
          breakLunchBtn.disabled = true;
        } else if (stats.break2Start && stats.break2End) {
          breakTeaBtn.innerHTML = '<i class="fa-solid fa-circle-check me-2"></i>Tea Completed';
          breakTeaBtn.className = 'btn btn-secondary w-100 py-2 border-0 fw-semibold text-white';
          breakTeaBtn.disabled = true;
        } else {
          breakTeaBtn.innerHTML = '<i class="fa-solid fa-mug-hot me-2"></i>Start Tea';
          breakTeaBtn.className = 'btn btn-info w-100 py-2 border-0 fw-semibold text-white';
          breakTeaBtn.disabled = stats.isOnBreak;
        }

        logDetails.innerHTML = `
          <div class="text-white-50">Checked in: <strong class="text-white">${stats.checkInTime}</strong></div>
          <div class="text-white-50">${stats.isOnBreak ? '<span class="text-warning fw-bold">Currently on Break</span>' : 'Pending Check-out'}</div>
          ${breakLogsText}
        `;
      }
    } else {
      // Absent / Not checked in
      checkinBtn.disabled = false;
      checkoutBtn.disabled = true;
      breakLunchBtn.classList.add('d-none');
      breakTeaBtn.classList.add('d-none');
      logDetails.innerHTML = `<span class="text-light">You haven't checked in today.</span>`;
    }
  } catch (err) {
    console.error(err);
    showAlert('Error loading dashboard stats', 'danger');
  }
}

// Mark Check-in
async function performCheckIn() {
  try {
    const data = await apiRequest('/employee/attendance/check-in', {
      method: 'POST'
    });
    
    showAlert(data.message, 'success');
    loadDashboardStats();
    loadAttendanceHistory();
  } catch (err) {
    showAlert(err.message, 'danger');
  }
}

// Mark Check-out
async function performCheckOut() {
  try {
    const data = await apiRequest('/employee/attendance/check-out', {
      method: 'POST'
    });
    
    showAlert(data.message, 'success');
    loadDashboardStats();
    loadAttendanceHistory();
  } catch (err) {
    showAlert(err.message, 'danger');
  }
}

// Fetch and render Attendance History logs table
async function loadAttendanceHistory() {
  const monthVal = document.getElementById('filter-month').value;
  const tbody = document.getElementById('attendance-history-table');
  tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-muted"><i class="fa-solid fa-spinner fa-spin me-2"></i>Loading records...</td></tr>';

  try {
    const data = await apiRequest(`/employee/attendance/history?month=${monthVal}`);
    tbody.innerHTML = '';

    if (data.history.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-muted">No attendance logs found for this month.</td></tr>';
      return;
    }

    data.history.forEach(item => {
      let badgeClass = 'badge-present';
      if (item.status === 'Absent') badgeClass = 'badge-absent';
      if (item.status === 'On Leave') badgeClass = 'badge-leave';
      if (item.status === 'Half Day') badgeClass = 'badge-halfday';

      tbody.innerHTML += `
        <tr>
          <td class="fw-semibold">${item.date}</td>
          <td class="font-monospace">${item.check_in || '--:--:--'}</td>
          <td class="font-monospace">${item.check_out || '--:--:--'}</td>
          <td><span class="status-badge ${badgeClass}">${item.status}</span></td>
        </tr>
      `;
    });
  } catch (err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger py-4">Error loading records.</td></tr>';
  }
}

// Submit Leave application
async function handleLeaveSubmit(e) {
  e.preventDefault();
  
  const leave_type = document.getElementById('leave_type').value;
  const start_date = document.getElementById('start_date').value;
  const end_date = document.getElementById('end_date').value;
  const reason = document.getElementById('leave_reason').value;

  try {
    const data = await apiRequest('/employee/leaves/apply', {
      method: 'POST',
      body: JSON.stringify({ leave_type, start_date, end_date, reason })
    });

    showAlert(data.message, 'success');
    document.getElementById('applyLeaveForm').reset();
    
    // Reload components
    loadDashboardStats();
    loadLeaveHistory();
  } catch (err) {
    showAlert(err.message, 'danger');
  }
}

// Fetch and render My Leaves list table
async function loadLeaveHistory() {
  const tbody = document.getElementById('leaves-history-table');
  tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-muted"><i class="fa-solid fa-spinner fa-spin me-2"></i>Loading leave history...</td></tr>';

  try {
    const data = await apiRequest('/employee/leaves');
    tbody.innerHTML = '';

    if (data.leaves.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-muted">No leave applications submitted yet.</td></tr>';
      return;
    }

    data.leaves.forEach(item => {
      let badgeClass = 'badge-pending';
      if (item.status === 'Approved') badgeClass = 'badge-approved';
      if (item.status === 'Rejected') badgeClass = 'badge-rejected';

      tbody.innerHTML += `
        <tr>
          <td><strong class="text-dark">${item.leave_type} Leave</strong></td>
          <td style="font-size: 0.9rem;">
            <div>${item.start_date}</div>
            <div class="text-muted" style="font-size: 0.8rem;">to ${item.end_date}</div>
          </td>
          <td style="font-max-width: 250px; white-space: normal;">${item.reason}</td>
          <td><span class="status-badge ${badgeClass}">${item.status}</span></td>
        </tr>
      `;
    });
  } catch (err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger py-4">Error loading records.</td></tr>';
  }
}

// Format number as local currency
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR'
  }).format(amount);
}

// Fetch and render Salary record list
async function loadSalarySlips() {
  const tbody = document.getElementById('salaries-table');
  tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted"><i class="fa-solid fa-spinner fa-spin me-2"></i>Loading statements...</td></tr>';

  try {
    const data = await apiRequest('/employee/salaries');
    tbody.innerHTML = '';

    if (data.salaries.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">No salary payments processed yet.</td></tr>';
      return;
    }

    data.salaries.forEach((item, index) => {
      tbody.innerHTML += `
        <tr>
          <td><strong class="text-dark">${formatMonthName(item.month)}</strong></td>
          <td class="font-monospace">${formatCurrency(item.basic_salary)}</td>
          <td class="font-monospace text-success">+${formatCurrency(item.allowances)}</td>
          <td class="font-monospace text-danger">-${formatCurrency(item.deductions)}</td>
          <td class="font-monospace fw-bold">${formatCurrency(item.net_salary)}</td>
          <td>${item.payment_date}</td>
          <td>
            <button class="btn btn-sm btn-outline-primary" onclick="viewPayslipModal(${index}, '${item.month}', ${item.basic_salary}, ${item.allowances}, ${item.deductions}, ${item.net_salary}, '${item.payment_date}')">
              <i class="fa-solid fa-file-invoice-dollar me-1"></i>View
            </button>
          </td>
        </tr>
      `;
    });
    
    // Store salaries in window for modal binding index lookup
    window.employeeSalaries = data.salaries;
  } catch (err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-danger py-4">Error loading records.</td></tr>';
  }
}

// Populate Profile fields on screen
function populateProfileDetails() {
  const user = getUser();
  if (user) {
    document.getElementById('profile-designation').textContent = user.designation || 'Staff Member';
    document.getElementById('profile-designation-badge').textContent = user.designation || 'Staff Member';
    document.getElementById('profile-dept-badge').textContent = user.department || 'General';
    document.getElementById('profile-email').textContent = user.email;
    document.getElementById('profile-department').textContent = user.department || 'General';
    document.getElementById('profile-joining').textContent = user.joining_date || 'N/A';
    document.getElementById('profile-salary').textContent = formatCurrency(user.salary);

    // Show security deposit fields if total configured is greater than 0
    const depositContainer = document.getElementById('profile-deposit-container');
    if (depositContainer) {
      if (user.deposit_total > 0) {
        depositContainer.classList.remove('d-none');
        document.getElementById('profile-deposit-total').textContent = formatCurrency(user.deposit_total);
        document.getElementById('profile-deposit-paid').textContent = formatCurrency(user.deposit_paid || 0);
        document.getElementById('profile-deposit-balance').textContent = formatCurrency(Math.max(0, user.deposit_total - (user.deposit_paid || 0)));
        document.getElementById('profile-deposit-rule').textContent = user.deposit_deduction_type === 'first_month' ? 'Deduct Full in First Month' : 'Deduct ₹2,000 Monthly';
      } else {
        depositContainer.classList.add('d-none');
      }
    }
  }
}

// Open modal slip statement details
function viewPayslipModal(index, month, basic, allowance, deduction, net, paymentDate) {
  const user = getUser();
  const slip = window.employeeSalaries[index];
  
  document.getElementById('slip-month').textContent = formatMonthName(month);
  document.getElementById('slip-department').textContent = user.department || 'General';
  document.getElementById('slip-payment-date').textContent = paymentDate;
  document.getElementById('slip-basic-salary').textContent = formatCurrency(basic);
  document.getElementById('slip-allowances').textContent = formatCurrency(allowance);
  document.getElementById('slip-deductions').textContent = formatCurrency(deduction);
  document.getElementById('slip-net-salary').textContent = formatCurrency(net);

  // Show security deposit deduction if it was applied in this slip
  const depositDeductionRow = document.getElementById('slip-deposit-deduction-row');
  if (depositDeductionRow) {
    if (slip && slip.deposit_deduction > 0) {
      depositDeductionRow.classList.remove('d-none');
      document.getElementById('slip-deposit-deduction').textContent = formatCurrency(slip.deposit_deduction);
    } else {
      depositDeductionRow.classList.add('d-none');
    }
  }

  const breakdownContainer = document.getElementById('slip-breakdown-container');
  const breakdownText = document.getElementById('slip-breakdown-text');

  if (slip && slip.breakdown) {
    breakdownContainer.classList.remove('d-none');
    breakdownText.textContent = slip.breakdown;
  } else {
    breakdownContainer.classList.add('d-none');
    breakdownText.textContent = '';
  }

  const modal = new bootstrap.Modal(document.getElementById('payslipModal'));
  modal.show();
}

// Utility to convert YYYY-MM into Word Months (e.g. 2026-06 to "June 2026")
function formatMonthName(monthStr) {
  const [year, month] = monthStr.split('-');
  const date = new Date(year, parseInt(month) - 1, 1);
  return date.toLocaleString('default', { month: 'long', year: 'numeric' });
}

// Fetch and display upcoming holidays list
async function loadUpcomingHolidays() {
  const container = document.getElementById('holiday-notices-container');
  try {
    const data = await apiRequest('/employee/holidays');
    
    // Sort and filter for upcoming holidays (today and future)
    const todayStr = new Date().toISOString().split('T')[0];
    const upcoming = data.holidays.filter(h => h.date >= todayStr);

    if (upcoming.length === 0) {
      container.innerHTML = '<div class="col-12 text-muted py-2">No upcoming holidays scheduled.</div>';
      return;
    }

    container.innerHTML = '';
    upcoming.forEach(h => {
      const [y, m, d] = h.date.split('-');
      const formattedDate = new Date(y, parseInt(m) - 1, d).toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });

      container.innerHTML += `
        <div class="col-md-6 col-lg-4 mb-3">
          <div class="p-3 border rounded bg-light border-start border-primary border-4 h-100">
            <div class="fw-bold text-primary mb-1">${h.name}</div>
            <div class="text-secondary font-monospace" style="font-size: 0.85rem;"><i class="fa-regular fa-calendar me-1"></i>${formattedDate}</div>
          </div>
        </div>
      `;
    });
  } catch (err) {
    console.error(err);
    container.innerHTML = '<div class="col-12 text-danger py-2">Error loading holidays calendar.</div>';
  }
}

// Perform Break (Lunch or Tea) start/end
async function performBreak(type) {
  const btn = document.getElementById(type === 'lunch' ? 'btn-break-lunch' : 'btn-break-tea');
  const isEnding = btn.textContent.includes('End');
  const endpoint = isEnding ? '/employee/attendance/break-end' : '/employee/attendance/break-start';

  try {
    const data = await apiRequest(endpoint, {
      method: 'POST',
      body: JSON.stringify({ breakType: type })
    });

    showAlert(data.message, 'success');
    loadDashboardStats();
  } catch (err) {
    showAlert(err.message, 'danger');
  }
}
