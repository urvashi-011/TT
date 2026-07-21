// Admin Dashboard Operations

let employeesListGlobal = []; // Global store for search filtering

document.addEventListener('DOMContentLoaded', () => {
  // 1. Guard check
  checkAuth('admin');

  // 2. Set active tab listener
  setupTabNavigation();

  // 3. Set default filter dates
  const todayStr = new Date().toISOString().split('T')[0];
  document.getElementById('admin-filter-date').value = todayStr;
  document.getElementById('payout_month').value = todayStr.substring(0, 7);

  // 4. Initial load sequence
  loadOverviewStats();
  loadEmployeesDirectory();
  loadGlobalAttendance();
  loadGlobalLeaves();
  loadGlobalSalaries();
  loadRecentActivities();

  // 5. Bind form submittals
  document.getElementById('employeeForm').addEventListener('submit', handleEmployeeSubmit);
  document.getElementById('payoutForm').addEventListener('submit', handlePayoutSubmit);
  document.getElementById('addDocForm').addEventListener('submit', handleDocSubmit);
  document.getElementById('attendanceEditForm').addEventListener('submit', handleAttendanceEditSubmit);
  document.getElementById('attendanceManualForm').addEventListener('submit', handleAttendanceManualSubmit);
});

// Tab Navigation logic
function setupTabNavigation() {
  const menuItems = document.querySelectorAll('.sidebar-menu-item');
  const sections = document.querySelectorAll('.tab-content');
  const pageTitle = document.getElementById('page-title');

  menuItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      
      const tabId = item.getAttribute('data-tab');
      
      menuItems.forEach(mi => mi.classList.remove('active'));
      item.classList.add('active');

      if (tabId !== 'tab-admin-profile') {
        sections.forEach(sec => {
          if (sec.id === tabId) {
            sec.classList.remove('d-none');
          } else {
            sec.classList.add('d-none');
          }
        });
      }

      // Titles mapping
      if (tabId === 'tab-admin-dashboard') pageTitle.textContent = 'Overview Stats';
      if (tabId === 'tab-admin-employees') pageTitle.textContent = 'Employee Directory';
      if (tabId === 'tab-admin-attendance') pageTitle.textContent = 'Attendance Logs';
      if (tabId === 'tab-admin-leaves') pageTitle.textContent = 'Leave Requests';
      if (tabId === 'tab-admin-salaries') pageTitle.textContent = 'Salary Processing';
      if (tabId === 'tab-admin-holidays') pageTitle.textContent = 'Holiday Calendar';
      if (tabId === 'tab-admin-settings') pageTitle.textContent = 'Settings';

      // Refresh data on navigation
      if (tabId === 'tab-admin-dashboard') {
        loadOverviewStats();
        loadRecentActivities();
      }
      if (tabId === 'tab-admin-employees') loadEmployeesDirectory();
      if (tabId === 'tab-admin-attendance') {
        populateEmployeeDropdowns();
        loadGlobalAttendance();
      }
      if (tabId === 'tab-admin-leaves') loadGlobalLeaves();
      if (tabId === 'tab-admin-salaries') {
        populateEmployeeDropdowns();
        loadGlobalSalaries();
      }
      if (tabId === 'tab-admin-holidays') {
        loadHolidays();
      }
      if (tabId === 'tab-admin-settings') {
        loadSettingsPage();
      }

            // Admin Profile handling – fetch data and show modal
      if (tabId === 'tab-admin-profile') {
        loadAdminProfile();
        const profileModal = new bootstrap.Modal(document.getElementById('adminProfileModal'));
        profileModal.show();
      }
      if (window.innerWidth < 992) {
        document.querySelector('.sidebar').classList.add('collapsed');
      }
    });
  });
}

// Fetch Overview Stats
async function loadOverviewStats() {
  try {
    const stats = await apiRequest('/admin/stats');
    
    document.getElementById('stat-present-today').textContent = stats.presentToday;
    document.getElementById('stat-leave-today').textContent = stats.leaveToday;
    document.getElementById('stat-absent-today').textContent = stats.absentToday;
    document.getElementById('stat-total-headcount').textContent = stats.totalEmployees;

    // Update pending leave counters badge in sidebar
    const badge = document.getElementById('sidebar-leaves-badge');
    if (stats.pendingLeaves > 0) {
      badge.textContent = stats.pendingLeaves;
      badge.classList.remove('d-none');
    } else {
      badge.classList.add('d-none');
    }

    // Also reload break violations
    loadBreakViolations();
  } catch (err) {
    console.error(err);
    showAlert('Error fetching dashboard summary stats', 'danger');
  }
}

// Helper: convert HH:MM:SS to total seconds
function timeToSeconds(t) {
  if (!t) return 0;
  const parts = t.split(':').map(Number);
  return parts[0] * 3600 + parts[1] * 60 + (parts[2] || 0);
}

// Helper: get break duration in minutes, or 'Active' if no end time
function calcBreakMinutes(start, end) {
  if (!start) return null;
  if (!end) return 'active';
  const diff = Math.max(0, timeToSeconds(end) - timeToSeconds(start));
  return Math.round(diff / 60);
}

// Fetch today's attendance and render break usage / violations panel
async function loadBreakViolations() {
  const container = document.getElementById('break-violations-container');
  const badge = document.getElementById('break-violation-count-badge');
  if (!container) return;

  container.innerHTML = '<div class="p-3 text-center text-muted"><i class="fa-solid fa-spinner fa-spin me-2"></i>Loading break data...</div>';

  const LUNCH_LIMIT = 45;
  const TEA_LIMIT = 15;

  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const data = await apiRequest(`/admin/attendance?date=${todayStr}`);

    // Filter employees who have taken at least one break
    const withBreaks = data.attendance.filter(a => a.break_1_start || a.break_2_start);

    if (withBreaks.length === 0) {
      container.innerHTML = '<div class="p-4 text-center text-muted"><i class="fa-solid fa-mug-hot fa-2x mb-2 d-block opacity-25"></i>No break activity recorded today.</div>';
      badge.classList.add('d-none');
      return;
    }

    let violationCount = 0;
    let rowsHTML = '';

    withBreaks.forEach(emp => {
      const lunch = calcBreakMinutes(emp.break_1_start, emp.break_1_end);
      const tea = calcBreakMinutes(emp.break_2_start, emp.break_2_end);

      // Build lunch cell
      let lunchCell = '<span class="text-muted">—</span>';
      if (lunch !== null) {
        if (lunch === 'active') {
          lunchCell = '<span class="badge bg-warning text-dark" style="font-size:0.72rem;">⏱ Active</span>';
        } else {
          const excess = lunch - LUNCH_LIMIT;
          if (excess > 0) {
            violationCount++;
            lunchCell = `
              <span class="fw-bold text-danger">${lunch}m</span>
              <span class="text-muted" style="font-size:0.75rem;">/ ${LUNCH_LIMIT}m</span>
              <span class="badge bg-danger ms-1" style="font-size:0.65rem;">+${excess}m over</span>
            `;
          } else if (excess === 0) {
            lunchCell = `<span class="fw-bold text-warning">${lunch}m</span> <span class="text-muted" style="font-size:0.75rem;">/ ${LUNCH_LIMIT}m</span>`;
          } else {
            lunchCell = `<span class="fw-bold text-success">${lunch}m</span> <span class="text-muted" style="font-size:0.75rem;">/ ${LUNCH_LIMIT}m</span>`;
          }
        }
      }

      // Build tea cell
      let teaCell = '<span class="text-muted">—</span>';
      if (tea !== null) {
        if (tea === 'active') {
          teaCell = '<span class="badge bg-info text-white" style="font-size:0.72rem;">⏱ Active</span>';
        } else {
          const excess = tea - TEA_LIMIT;
          if (excess > 0) {
            violationCount++;
            teaCell = `
              <span class="fw-bold text-danger">${tea}m</span>
              <span class="text-muted" style="font-size:0.75rem;">/ ${TEA_LIMIT}m</span>
              <span class="badge bg-danger ms-1" style="font-size:0.65rem;">+${excess}m over</span>
            `;
          } else if (excess === 0) {
            teaCell = `<span class="fw-bold text-warning">${tea}m</span> <span class="text-muted" style="font-size:0.75rem;">/ ${TEA_LIMIT}m</span>`;
          } else {
            teaCell = `<span class="fw-bold text-success">${tea}m</span> <span class="text-muted" style="font-size:0.75rem;">/ ${TEA_LIMIT}m</span>`;
          }
        }
      }

      // Total excess
      const lunchExcess = (typeof lunch === 'number') ? Math.max(0, lunch - LUNCH_LIMIT) : 0;
      const teaExcess = (typeof tea === 'number') ? Math.max(0, tea - TEA_LIMIT) : 0;
      const totalExcess = lunchExcess + teaExcess;

      const rowClass = totalExcess > 0 ? 'table-danger' : '';

      rowsHTML += `
        <tr class="${rowClass}">
          <td>
            <strong>${emp.name}</strong><br>
            <small class="text-muted">${emp.email}</small>
          </td>
          <td style="font-size:0.85rem;">${lunchCell}</td>
          <td style="font-size:0.85rem;">${teaCell}</td>
          <td style="font-size:0.85rem;">
            ${totalExcess > 0 
              ? `<span class="badge bg-danger" style="font-size:0.75rem;"><i class="fa-solid fa-triangle-exclamation me-1"></i>${totalExcess}m excess</span>`
              : `<span class="badge bg-success" style="font-size:0.75rem;"><i class="fa-solid fa-check me-1"></i>OK</span>`
            }
          </td>
        </tr>
      `;
    });

    // Update violation badge count
    if (violationCount > 0) {
      badge.textContent = violationCount;
      badge.classList.remove('d-none');
    } else {
      badge.classList.add('d-none');
    }

    container.innerHTML = `
      <table class="table table-hub mb-0" style="font-size:0.85rem;">
        <thead>
          <tr>
            <th>Employee</th>
            <th><i class="fa-solid fa-bowl-food me-1 text-warning"></i>Lunch Break</th>
            <th><i class="fa-solid fa-mug-hot me-1 text-info"></i>Tea Break</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHTML}
        </tbody>
      </table>
    `;

  } catch (err) {
    console.error(err);
    container.innerHTML = '<div class="p-3 text-center text-danger">Error loading break data.</div>';
  }
}

// Fetch and render Employees Directory
async function loadEmployeesDirectory() {
  const tbody = document.getElementById('employees-directory-table');
  tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted"><i class="fa-solid fa-spinner fa-spin me-2"></i>Loading Directory...</td></tr>';

  try {
    const data = await apiRequest('/admin/employees');
    employeesListGlobal = data.employees;
    
    renderEmployees(employeesListGlobal);
    populateEmployeeDropdowns();
  } catch (err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger py-4">Error loading employees directory.</td></tr>';
  }
}

// Render Employee table rows
function renderEmployees(list) {
  const tbody = document.getElementById('employees-directory-table');
  tbody.innerHTML = '';

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">No employees found.</td></tr>';
    return;
  }

  list.forEach(emp => {
    const initials = emp.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    const isInactive = emp.status === 'inactive';
    const statusClass = isInactive ? 'badge-rejected' : 'badge-present';
    const roleClass = emp.role === 'admin' ? 'bg-secondary text-white' : 'bg-light text-secondary';
    
    const hasDeposit = emp.deposit_total > 0;
    const depositDisplay = hasDeposit 
      ? `<small class="text-muted d-block text-nowrap" style="font-size: 0.72rem;">Deposit: ${formatCurrency(emp.deposit_paid)}/${formatCurrency(emp.deposit_total)}</small>` 
      : '';

    tbody.innerHTML += `
      <tr>
        <td>
          <div class="d-flex align-items-center">
            <div class="avatar-circle me-3 ms-0 bg-secondary" style="width: 38px; height: 38px; font-size: 0.9rem;">${initials}</div>
            <div>
              <h6 class="mb-0 fw-semibold text-dark">${emp.name}</h6>
              <small class="text-muted">${emp.email}</small>
            </div>
          </div>
        </td>
        <td>
          <div><strong>${emp.designation || 'Staff Member'}</strong></div>
          <small class="badge ${roleClass} text-uppercase px-2 py-1" style="font-size: 0.65rem;">${emp.role}</small>
          <small class="text-muted ms-1">${emp.department || 'N/A'}</small>
        </td>
        <td>${emp.joining_date || '--'}</td>
        <td class="font-monospace text-nowrap">
          <div class="fw-bold">${formatCurrency(emp.salary)}</div>
          ${depositDisplay}
        </td>
        <td><span class="status-badge ${statusClass} text-capitalize">${emp.status}</span></td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-primary me-1" onclick="openManageDocsModal(${emp.id})" title="Manage Documents">
            <i class="fa-solid fa-file-pdf"></i>
          </button>
          <button class="btn btn-sm btn-outline-secondary me-1" onclick="openEditEmployeeModal(${emp.id})" title="Edit Employee">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="btn btn-sm btn-outline-danger" onclick="deleteEmployee(${emp.id})" title="Delete Employee">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </td>
      </tr>
    `;
  });
}

// Search filtering on employee names/emails
function filterEmployees() {
  const query = document.getElementById('search-employee').value.toLowerCase().trim();
  const filtered = employeesListGlobal.filter(emp => 
    emp.name.toLowerCase().includes(query) || 
    emp.email.toLowerCase().includes(query) ||
    (emp.department && emp.department.toLowerCase().includes(query)) ||
    (emp.designation && emp.designation.toLowerCase().includes(query))
  );
  renderEmployees(filtered);
}

// Populate filters dropdown listings
function populateEmployeeDropdowns() {
  const filterSelect = document.getElementById('admin-filter-employee');
  const payoutSelect = document.getElementById('payout_user_id');

  // Keep existing values or selections if any
  const oldFilterVal = filterSelect.value;
  const oldPayoutVal = payoutSelect.value;

  filterSelect.innerHTML = '<option value="">All Employees</option>';
  payoutSelect.innerHTML = '<option value="" disabled selected>Select Employee</option>';

  const employeesOnly = employeesListGlobal.filter(e => e.role === 'employee' && e.status === 'active');

  employeesOnly.forEach(emp => {
    filterSelect.innerHTML += `<option value="${emp.id}">${emp.name} (${emp.designation})</option>`;
    payoutSelect.innerHTML += `<option value="${emp.id}">${emp.name} - Basic: ${formatCurrency(emp.salary)}</option>`;
  });

  filterSelect.value = oldFilterVal;
  payoutSelect.value = oldPayoutVal;
}

// Load admin profile data dynamically from server session/token
function loadAdminProfile() {
  const user = getUser();
  const adminId = user ? user.id : 4;
  apiRequest(`/admin/profile/${adminId}`)
    .then(data => {
      document.getElementById('admin-profile-initials').textContent = getInitials(data.name);
      document.getElementById('admin-profile-name').textContent = data.name;
      document.getElementById('admin-profile-email').textContent = data.email;
      document.getElementById('admin-profile-dept').textContent = data.department || '--';
      document.getElementById('admin-profile-designation').textContent = data.designation || '--';
      document.getElementById('admin-profile-joining').textContent = data.joining_date || '--';
    })
    .catch(err => {
      console.error('Failed to load admin profile', err);
      showAlert('Unable to load admin profile.', 'danger');
    });
}

function getInitials(fullName) {
  if (!fullName) return '';
  return fullName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}

// Add modal toggles
function openAddEmployeeModal() {
  document.getElementById('employeeModalLabel').textContent = 'Add New Employee';
  document.getElementById('employeeForm').reset();
  document.getElementById('form-employee-id').value = '';
  document.getElementById('label-password').classList.add('required');
  document.getElementById('form-employee-password').setAttribute('required', 'required');
  document.getElementById('help-password').classList.add('d-none');

  // Hide and reset deposit fields
  document.getElementById('edit-deposit-paid-container').classList.add('d-none');
  document.getElementById('form-employee-deposit-total').value = 0;
  document.getElementById('form-employee-deposit-type').value = 'monthly_2000';
  document.getElementById('form-employee-deposit-paid').value = 0;

  const todayStr = new Date().toISOString().split('T')[0];
  document.getElementById('form-employee-join').value = todayStr;

  const modal = new bootstrap.Modal(document.getElementById('employeeModal'));
  modal.show();
}

// Edit modal fills
function openEditEmployeeModal(id) {
  const emp = employeesListGlobal.find(e => e.id === id);
  if (!emp) return;

  document.getElementById('employeeModalLabel').textContent = 'Edit Employee Profile';
  document.getElementById('form-employee-id').value = emp.id;
  document.getElementById('form-employee-name').value = emp.name;
  document.getElementById('form-employee-email').value = emp.email;
  document.getElementById('form-employee-role').value = emp.role;
  document.getElementById('form-employee-status').value = emp.status;
  document.getElementById('form-employee-dept').value = emp.department || '';
  document.getElementById('form-employee-desg').value = emp.designation || '';
  document.getElementById('form-employee-join').value = emp.joining_date || '';
  document.getElementById('form-employee-salary').value = emp.salary;

  // Populate and show deposit fields
  document.getElementById('edit-deposit-paid-container').classList.remove('d-none');
  document.getElementById('form-employee-deposit-total').value = emp.deposit_total || 0;
  document.getElementById('form-employee-deposit-type').value = emp.deposit_deduction_type || 'monthly_2000';
  document.getElementById('form-employee-deposit-paid').value = emp.deposit_paid || 0;

  // Password becomes optional during updates
  document.getElementById('label-password').classList.remove('required');
  document.getElementById('form-employee-password').removeAttribute('required');
  document.getElementById('form-employee-password').value = '';
  document.getElementById('help-password').classList.remove('d-none');

  const modal = new bootstrap.Modal(document.getElementById('employeeModal'));
  modal.show();
}

// Handle onboarding form processing
async function handleEmployeeSubmit(e) {
  e.preventDefault();
  
  const id = document.getElementById('form-employee-id').value;
  const name = document.getElementById('form-employee-name').value;
  const email = document.getElementById('form-employee-email').value;
  const password = document.getElementById('form-employee-password').value;
  const role = document.getElementById('form-employee-role').value;
  const status = document.getElementById('form-employee-status').value;
  const department = document.getElementById('form-employee-dept').value;
  const designation = document.getElementById('form-employee-desg').value;
  const joining_date = document.getElementById('form-employee-join').value;
  const salary = document.getElementById('form-employee-salary').value;
  const deposit_total = parseFloat(document.getElementById('form-employee-deposit-total').value) || 0;
  const deposit_deduction_type = document.getElementById('form-employee-deposit-type').value;
  const deposit_paid = parseFloat(document.getElementById('form-employee-deposit-paid').value) || 0;

  const isEdit = id && id !== '';
  const url = isEdit ? `/admin/employees/${id}` : '/admin/employees';
  const method = isEdit ? 'PUT' : 'POST';

  const body = { 
    name, email, role, department, designation, joining_date, salary, status,
    deposit_total, deposit_deduction_type, deposit_paid
  };
  if (password && password.trim() !== '') {
    body.password = password;
  }

  try {
    const data = await apiRequest(url, {
      method,
      body: JSON.stringify(body)
    });

    showAlert(data.message, 'success');
    
    // Hide modal overlay
    const modalEl = document.getElementById('employeeModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();

    // Reload directory tables
    loadEmployeesDirectory();
    loadOverviewStats();
  } catch (err) {
    showAlert(err.message, 'danger');
  }
}

// Delete Employee
async function deleteEmployee(id) {
  if (!confirm('Are you sure you want to permanently delete this employee? All related attendance, leave, and salary records will be deleted.')) {
    return;
  }

  try {
    const data = await apiRequest(`/admin/employees/${id}`, {
      method: 'DELETE'
    });

    showAlert(data.message, 'success');
    loadEmployeesDirectory();
    loadOverviewStats();
  } catch (err) {
    showAlert(err.message, 'danger');
  }
}

// Fetch and render Attendance tracker grid list
async function loadGlobalAttendance() {
  const dateVal = document.getElementById('admin-filter-date').value;
  const empVal = document.getElementById('admin-filter-employee').value;
  const tbody = document.getElementById('admin-attendance-table');
  
  tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted"><i class="fa-solid fa-spinner fa-spin me-2"></i>Loading logs...</td></tr>';

  let url = '/admin/attendance?';
  const queryParams = [];
  if (dateVal && dateVal !== '') {
    queryParams.push(`date=${dateVal}`);
  }
  if (empVal && empVal !== '') {
    queryParams.push(`user_id=${empVal}`);
  }
  url += queryParams.join('&');

  try {
    const data = await apiRequest(url);
    tbody.innerHTML = '';

    if (data.attendance.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">No attendance logs found.</td></tr>';
      return;
    }

    // Helper to calculate break durations in minutes
    function getBreakDurationMinutes(start, end) {
      if (!start) return 0;
      const sParts = start.split(':').map(Number);
      const startSec = sParts[0] * 3600 + sParts[1] * 60 + (sParts[2] || 0);
      
      let endSec = startSec;
      if (end) {
        const eParts = end.split(':').map(Number);
        endSec = eParts[0] * 3600 + eParts[1] * 60 + (eParts[2] || 0);
      } else {
        return 'Active';
      }
      
      const diffSec = Math.max(0, endSec - startSec);
      return Math.round(diffSec / 60);
    }

    data.attendance.forEach(item => {
      let badgeClass = 'badge-present';
      if (item.status === 'Absent') badgeClass = 'badge-absent';
      if (item.status === 'On Leave') badgeClass = 'badge-leave';
      if (item.status === 'Half Day') badgeClass = 'badge-halfday';

      const isPendingApproval = (item.status === 'Present' && !item.is_approved);
      const approvalBadge = isPendingApproval ? '<span class="badge bg-warning text-dark ms-1" style="font-size:0.65rem; padding: 0.25em 0.5em;"><i class="fa-solid fa-clock me-1"></i>Pending Admin Approval</span>' : '';

      const approveButton = isPendingApproval ? `
        <button class="btn btn-sm btn-outline-success me-1" onclick="approveAttendance(${item.id})" title="Approve Attendance">
          <i class="fa-solid fa-check"></i>
        </button>
      ` : '';

      // Format Breaks with limits and excess tracking
      const LUNCH_LIMIT = 45; // minutes allowed for lunch
      const TEA_LIMIT = 15;   // minutes allowed for tea

      function buildBreakHTML(start, end, limitMin, icon, label, colorClass) {
        if (!start) return `<span class="text-muted" style="font-size:0.78rem;">-- ${label} not taken</span>`;
        
        const mins = getBreakDurationMinutes(start, end);
        
        if (mins === 'Active') {
          return `
            <div class="d-flex align-items-center gap-1 flex-wrap">
              <i class="fa-solid ${icon} ${colorClass}"></i>
              <span class="fw-semibold">${label}:</span>
              <span class="badge bg-warning text-dark" style="font-size:0.7rem;">⏱ Active</span>
            </div>
          `;
        }

        const excess = mins - limitMin;
        let usageLabel = `<span class="fw-bold text-success">${mins}m</span> <span class="text-muted" style="font-size:0.72rem;">/ ${limitMin}m</span>`;
        let excessBadge = '';

        if (excess > 0) {
          usageLabel = `<span class="fw-bold text-danger">${mins}m</span> <span class="text-muted" style="font-size:0.72rem;">/ ${limitMin}m</span>`;
          excessBadge = `<span class="badge bg-danger ms-1" style="font-size:0.68rem; padding: 0.2em 0.5em;" title="Exceeded limit by ${excess} minutes">+${excess}m over</span>`;
        } else if (mins === limitMin) {
          usageLabel = `<span class="fw-bold text-warning">${mins}m</span> <span class="text-muted" style="font-size:0.72rem;">/ ${limitMin}m</span>`;
        }

        return `
          <div class="d-flex align-items-center gap-1 flex-wrap">
            <i class="fa-solid ${icon} ${colorClass}"></i>
            <span class="fw-semibold">${label}:</span>
            ${usageLabel}
            ${excessBadge}
          </div>
        `;
      }

      const break1HTML = buildBreakHTML(item.break_1_start, item.break_1_end, LUNCH_LIMIT, 'fa-bowl-food', 'Lunch', 'text-warning');
      const break2HTML = buildBreakHTML(item.break_2_start, item.break_2_end, TEA_LIMIT, 'fa-mug-hot', 'Tea', 'text-info');

      const breaksColumnHTML = `
        <div style="font-size: 0.8rem; line-height: 1.6; min-width: 160px;">
          <div class="mb-1">${break1HTML}</div>
          <div>${break2HTML}</div>
        </div>
      `;

      tbody.innerHTML += `
        <tr>
          <td><strong class="text-dark">${item.name}</strong></td>
          <td>
            <div>${item.email}</div>
            <small class="text-muted" style="font-size: 0.75rem;">Dept: ${item.department || 'N/A'}</small>
          </td>
          <td>${item.date}</td>
          <td class="font-monospace">${item.check_in || '--:--:--'}</td>
          <td class="font-monospace">${item.check_out || '--:--:--'}</td>
          <td>${breaksColumnHTML}</td>
          <td>
            <span class="status-badge ${badgeClass}">${item.status}</span>
            ${approvalBadge}
          </td>
          <td class="text-end">
            ${approveButton}
            <button class="btn btn-sm btn-outline-secondary" onclick="openEditAttendanceModal(${item.id}, '${item.name}', '${item.date}', '${item.check_in || ''}', '${item.check_out || ''}', '${item.status}', '${item.break_1_start || ''}', '${item.break_1_end || ''}', '${item.break_2_start || ''}', '${item.break_2_end || ''}')" title="Edit Attendance Record">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
          </td>
        </tr>
      `;
    });
  } catch (err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger py-4">Error loading records.</td></tr>';
  }
}

// Fetch and render Leaves application list
async function loadGlobalLeaves() {
  const tbody = document.getElementById('admin-leaves-table');
  tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted"><i class="fa-solid fa-spinner fa-spin me-2"></i>Loading requests...</td></tr>';

  try {
    const data = await apiRequest('/admin/leaves');
    tbody.innerHTML = '';

    if (data.leaves.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">No leave applications found.</td></tr>';
      return;
    }

    data.leaves.forEach(item => {
      let badgeClass = 'badge-pending';
      if (item.status === 'Approved') badgeClass = 'badge-approved';
      if (item.status === 'Rejected') badgeClass = 'badge-rejected';

      const isPending = item.status === 'Pending';
      const actionHtml = isPending ? `
        <div class="text-end">
          <button class="btn btn-sm btn-success me-1 border-0" onclick="processLeave(${item.id}, 'Approved')">
            <i class="fa-solid fa-check"></i> Approve
          </button>
          <button class="btn btn-sm btn-danger border-0" onclick="processLeave(${item.id}, 'Rejected')">
            <i class="fa-solid fa-xmark"></i> Reject
          </button>
        </div>
      ` : `<div class="text-end text-muted font-monospace" style="font-size:0.8rem;"><i class="fa-solid fa-circle-check text-secondary me-1"></i>Processed</div>`;

      tbody.innerHTML += `
        <tr>
          <td>
            <strong class="text-dark">${item.name}</strong>
            <div class="text-muted" style="font-size: 0.75rem;">${item.designation || 'Staff'} - ${item.department || 'N/A'}</div>
          </td>
          <td><span class="badge bg-light text-primary">${item.leave_type} Leave</span></td>
          <td style="font-size: 0.85rem;">
            <div>${item.start_date}</div>
            <div class="text-muted" style="font-size: 0.75rem;">to ${item.end_date}</div>
          </td>
          <td style="max-width: 250px; white-space: normal;">${item.reason}</td>
          <td><span class="status-badge ${badgeClass}">${item.status}</span></td>
          <td>${actionHtml}</td>
        </tr>
      `;
    });
  } catch (err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger py-4">Error loading records.</td></tr>';
  }
}

// Approve / Reject Leave application
async function processLeave(id, status) {
  try {
    const data = await apiRequest(`/admin/leaves/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ status })
    });

    showAlert(data.message, 'success');
    loadGlobalLeaves();
    loadOverviewStats();
  } catch (err) {
    showAlert(err.message, 'danger');
  }
}

// Update Payout form input fields dynamically
function updatePayoutBasicSalary() {
  const empId = parseInt(document.getElementById('payout_user_id').value);
  const emp = employeesListGlobal.find(e => e.id === empId);
  const basicField = document.getElementById('payout_basic');

  if (emp) {
    basicField.value = formatCurrency(emp.salary);
  } else {
    basicField.value = '0.00';
  }
}

// Fetch and render Global Salaries Log list
async function loadGlobalSalaries() {
  const tbody = document.getElementById('admin-salaries-table');
  tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted"><i class="fa-solid fa-spinner fa-spin me-2"></i>Loading statements...</td></tr>';

  try {
    const data = await apiRequest('/admin/salaries');
    tbody.innerHTML = '';

    if (data.salaries.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">No salary slips disbursed yet.</td></tr>';
      return;
    }

    data.salaries.forEach(item => {
      const breakdownText = item.breakdown ? `
        <div class="text-muted font-monospace mt-1" style="font-size:0.65rem; max-width:200px; white-space:normal; line-height:1.2; border-left: 2px solid #cbd5e1; padding-left: 6px;" title="Calculation breakdown log">
          ${item.breakdown}
        </div>
      ` : '';

      tbody.innerHTML += `
        <tr>
          <td>
            <strong class="text-dark">${item.name}</strong>
            <div class="text-muted" style="font-size:0.75rem;">${item.department || 'N/A'}</div>
          </td>
          <td><strong>${formatMonthName(item.month)}</strong></td>
          <td class="font-monospace">${formatCurrency(item.basic_salary)}</td>
          <td class="font-monospace text-success">+${formatCurrency(item.allowances)}</td>
          <td class="font-monospace text-danger">
            -${formatCurrency(item.deductions)}
            ${breakdownText}
          </td>
          <td class="font-monospace fw-bold text-dark">${formatCurrency(item.net_salary)}</td>
          <td><span class="status-badge badge-approved">PAID</span></td>
        </tr>
      `;
    });
  } catch (err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-danger py-4">Error loading salary log.</td></tr>';
  }
}

// Payout form processing
async function handlePayoutSubmit(e) {
  e.preventDefault();

  const user_id = document.getElementById('payout_user_id').value;
  const month = document.getElementById('payout_month').value;
  const allowances = document.getElementById('payout_allowances').value;
  const deductions = document.getElementById('payout_deductions').value;

  try {
    const data = await apiRequest('/admin/salaries', {
      method: 'POST',
      body: JSON.stringify({
        user_id,
        month,
        allowances,
        deductions,
        status: 'Paid',
        breakdown: activeBreakdownText || null
      })
    });

    showAlert(data.message, 'success');
    document.getElementById('payoutForm').reset();
    document.getElementById('payout_basic').value = '0.00';
    document.getElementById('payout_calc_mode').value = 'auto';
    document.getElementById('calc-summary-box').classList.add('d-none');
    document.getElementById('manual-calc-inputs').classList.add('d-none');
    document.getElementById('auto-calc-btn-container').classList.remove('d-none');
    activeBreakdownText = '';
    
    // Refresh stats and payout listings
    loadGlobalSalaries();
    loadOverviewStats();
  } catch (err) {
    showAlert(err.message, 'danger');
  }
}

// Format number as local currency
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR'
  }).format(amount);
}

// Convert YYYY-MM into Month Words
function formatMonthName(monthStr) {
  const [year, month] = monthStr.split('-');
  const date = new Date(year, parseInt(month) - 1, 1);
  return date.toLocaleString('default', { month: 'long', year: 'numeric' });
}

// Fetch and render Recent User Activities feed logs
async function loadRecentActivities() {
  const feedList = document.getElementById('recent-activities-list');
  if (!feedList) return;

  try {
    const data = await apiRequest('/admin/activities');
    feedList.innerHTML = '';

    if (data.activities.length === 0) {
      feedList.innerHTML = '<li class="list-group-item text-center py-4 text-muted">No employee activities logged yet.</li>';
      return;
    }

    data.activities.forEach(act => {
      let icon = 'fa-info-circle text-info';
      if (act.activity_type === 'LOGIN') icon = 'fa-right-to-bracket text-primary';
      if (act.activity_type === 'CHECK_IN') icon = 'fa-sign-in-alt text-success';
      if (act.activity_type === 'CHECK_OUT') icon = 'fa-sign-out-alt text-danger';
      if (act.activity_type === 'LEAVE_APPLY') icon = 'fa-paper-plane text-warning';
      if (act.activity_type.startsWith('ADMIN_')) icon = 'fa-user-shield text-secondary';

      const timeFormatted = new Date(act.timestamp).toLocaleString();

      feedList.innerHTML += `
        <li class="list-group-item d-flex align-items-start gap-3 py-3">
          <i class="fa-solid ${icon} mt-1" style="font-size: 1.1rem;"></i>
          <div class="w-100">
            <div class="d-flex justify-content-between align-items-center">
              <strong class="text-dark" style="font-size: 0.9rem;">${act.activity_type}</strong>
              <small class="text-muted" style="font-size: 0.75rem;">${timeFormatted}</small>
            </div>
            <p class="mb-0 text-secondary mt-1" style="font-size: 0.85rem;">${act.description}</p>
          </div>
        </li>
      `;
    });
  } catch (err) {
    console.error(err);
    feedList.innerHTML = '<li class="list-group-item text-center text-danger py-3">Failed to load activities.</li>';
  }
}

// Open Manage Documents Modal
function openManageDocsModal(empId) {
  const emp = employeesListGlobal.find(e => e.id === empId);
  if (!emp) return;

  document.getElementById('doc-employee-name').textContent = emp.name;
  document.getElementById('doc-employee-id').value = emp.id;
  document.getElementById('addDocForm').reset();

  loadEmployeeDocs(empId);

  const modal = new bootstrap.Modal(document.getElementById('employeeDocsModal'));
  modal.show();
}

// Load Employee Documents List
async function loadEmployeeDocs(empId) {
  const listContainer = document.getElementById('employee-docs-list');
  listContainer.innerHTML = '<li class="list-group-item text-center py-3 text-muted"><i class="fa-solid fa-spinner fa-spin me-2"></i>Loading documents...</li>';

  try {
    const data = await apiRequest(`/admin/employees/${empId}/documents`);
    listContainer.innerHTML = '';

    if (data.documents.length === 0) {
      listContainer.innerHTML = '<li class="list-group-item text-center py-3 text-muted">No documents attached yet.</li>';
      return;
    }

    data.documents.forEach(doc => {
      listContainer.innerHTML += `
        <li class="list-group-item d-flex justify-content-between align-items-center py-2 px-0 bg-transparent">
          <div>
            <i class="fa-solid fa-file-invoice text-secondary me-2"></i>
            <a href="${doc.file_path}" target="_blank" class="fw-semibold text-primary" style="text-decoration:none;">${doc.title}</a>
            <small class="text-muted d-block" style="font-size:0.75rem;">Link: ${doc.file_path}</small>
          </div>
          <button class="btn btn-sm btn-outline-danger border-0" onclick="deleteEmployeeDoc(${doc.id}, ${empId})">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </li>
      `;
    });
  } catch (err) {
    console.error(err);
    listContainer.innerHTML = '<li class="list-group-item text-center text-danger py-2">Error loading documents.</li>';
  }
}

// Submit new Document details
async function handleDocSubmit(e) {
  e.preventDefault();

  const empId = document.getElementById('doc-employee-id').value;
  const title = document.getElementById('doc-title').value;
  const fileInput = document.getElementById('doc-file');
  const file_path = document.getElementById('doc-path').value;

  const formData = new FormData();
  formData.append('title', title);
  if (fileInput.files.length > 0) {
    formData.append('file', fileInput.files[0]);
  }
  if (file_path) {
    formData.append('file_path', file_path);
  }

  try {
    const data = await apiRequest(`/admin/employees/${empId}/documents`, {
      method: 'POST',
      body: formData
    });

    showAlert(data.message, 'success');
    document.getElementById('addDocForm').reset();
    loadEmployeeDocs(empId);
  } catch (err) {
    showAlert(err.message, 'danger');
  }
}

// Delete Document attachment
async function deleteEmployeeDoc(docId, empId) {
  if (!confirm('Are you sure you want to remove this document attachment link?')) {
    return;
  }

  try {
    const data = await apiRequest(`/admin/documents/${docId}`, {
      method: 'DELETE'
    });

    showAlert(data.message, 'success');
    loadEmployeeDocs(empId);
  } catch (err) {
    showAlert(err.message, 'danger');
  }
}

// Open Edit Attendance Modal
function openEditAttendanceModal(id, name, date, checkIn, checkOut, status, b1Start, b1End, b2Start, b2End) {
  document.getElementById('edit-attendance-id').value = id;
  document.getElementById('edit-attendance-name').value = name;
  document.getElementById('edit-attendance-date').value = date;
  document.getElementById('edit-attendance-in').value = checkIn;
  document.getElementById('edit-attendance-out').value = checkOut;
  document.getElementById('edit-attendance-status').value = status;
  document.getElementById('edit-attendance-break1-start').value = b1Start || '';
  document.getElementById('edit-attendance-break1-end').value = b1End || '';
  document.getElementById('edit-attendance-break2-start').value = b2Start || '';
  document.getElementById('edit-attendance-break2-end').value = b2End || '';

  const modal = new bootstrap.Modal(document.getElementById('attendanceEditModal'));
  modal.show();
}

// Submit Attendance Edit Override form
async function handleAttendanceEditSubmit(e) {
  e.preventDefault();

  const id = document.getElementById('edit-attendance-id').value;
  const check_in = document.getElementById('edit-attendance-in').value;
  const check_out = document.getElementById('edit-attendance-out').value;
  const status = document.getElementById('edit-attendance-status').value;
  const break_1_start = document.getElementById('edit-attendance-break1-start').value;
  const break_1_end = document.getElementById('edit-attendance-break1-end').value;
  const break_2_start = document.getElementById('edit-attendance-break2-start').value;
  const break_2_end = document.getElementById('edit-attendance-break2-end').value;

  try {
    const data = await apiRequest(`/admin/attendance/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ 
        check_in, 
        check_out, 
        status,
        break_1_start: break_1_start || null,
        break_1_end: break_1_end || null,
        break_2_start: break_2_start || null,
        break_2_end: break_2_end || null
      })
    });

    showAlert(data.message, 'success');

    // Close Modal
    const modalEl = document.getElementById('attendanceEditModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();

    // Refresh logs
    loadGlobalAttendance();
    loadOverviewStats();
  } catch (err) {
    showAlert(err.message, 'danger');
  }
}

// Open Add Manual Attendance Modal
function openAddAttendanceModal() {
  const userSelect = document.getElementById('manual-attendance-user');
  userSelect.innerHTML = '<option value="" disabled selected>Select Employee</option>';

  const employeesOnly = employeesListGlobal.filter(e => e.role === 'employee' && e.status === 'active');
  employeesOnly.forEach(emp => {
    userSelect.innerHTML += `<option value="${emp.id}">${emp.name} (${emp.department || 'N/A'})</option>`;
  });

  document.getElementById('attendanceManualForm').reset();
  const todayStr = new Date().toISOString().split('T')[0];
  document.getElementById('manual-attendance-date').value = todayStr;

  const modal = new bootstrap.Modal(document.getElementById('attendanceManualModal'));
  modal.show();
}

// Submit Manual Attendance log
async function handleAttendanceManualSubmit(e) {
  e.preventDefault();

  const user_id = document.getElementById('manual-attendance-user').value;
  const date = document.getElementById('manual-attendance-date').value;
  const check_in = document.getElementById('manual-attendance-in').value;
  const check_out = document.getElementById('manual-attendance-out').value;
  const status = document.getElementById('manual-attendance-status').value;
  const break_1_start = document.getElementById('manual-attendance-break1-start').value;
  const break_1_end = document.getElementById('manual-attendance-break1-end').value;
  const break_2_start = document.getElementById('manual-attendance-break2-start').value;
  const break_2_end = document.getElementById('manual-attendance-break2-end').value;

  try {
    const data = await apiRequest('/admin/attendance', {
      method: 'POST',
      body: JSON.stringify({ 
        user_id, 
        date, 
        check_in, 
        check_out, 
        status,
        break_1_start: break_1_start || null,
        break_1_end: break_1_end || null,
        break_2_start: break_2_start || null,
        break_2_end: break_2_end || null
      })
    });

    showAlert(data.message, 'success');

    const modalEl = document.getElementById('attendanceManualModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();

    loadGlobalAttendance();
    loadOverviewStats();
  } catch (err) {
    showAlert(err.message, 'danger');
  }
}

// Trigger auto-calculation logic for salary
async function triggerAutoCalculation() {
  const userId = document.getElementById('payout_user_id').value;
  const month = document.getElementById('payout_month').value;
  const summaryBox = document.getElementById('calc-summary-box');
  const deductionInput = document.getElementById('payout_deductions');

  if (!userId || !month) {
    showAlert('Please select both Employee and Payout Month first.', 'warning');
    return;
  }

  summaryBox.classList.remove('d-none');
  summaryBox.innerHTML = '<span class="text-muted"><i class="fa-solid fa-spinner fa-spin me-2"></i>Analyzing shift logs...</span>';

  try {
    const res = await apiRequest(`/admin/salaries/calculate?user_id=${userId}&month=${month}`);

    // Store breakdown summary for salary slip
    activeBreakdownText =
      `Auto-Calc | Present: ${res.presentDays}d | Leaves: ${res.leaveDays}d | ` +
      `Half: ${res.halfDays || 0}d | Absent: ${res.absentDays}d | ` +
      `Late-in: ${res.lateInMinutes}min (2x: ${formatCurrency(res.lateInDeductions)}) | ` +
      `Early-out: ${res.earlyOutMinutes}min (2x: ${formatCurrency(res.earlyOutDeductions)}) | ` +
      `Extra Break: ${res.extraBreakMinutes}min (2x: ${formatCurrency(res.breakDeductions)}) | ` +
      `Overtime: ${res.overtimeMinutes}min (1.5x bonus: +${formatCurrency(res.overtimeBonus)}) | ` +
      `No-checkout penalty: ${formatCurrency(res.penaltyDeductions)}`;

    // Populate deduction input field (deductions only, bonus handled server-side)
    deductionInput.value = res.totalDeductions;

    // Append security deposit details to breakdown if applied
    if (res.depositDeduction > 0) {
      activeBreakdownText += ` | Security Deposit Deduction: ${formatCurrency(res.depositDeduction)} (Rule: ${res.depositDeductionType === 'first_month' ? 'First Month' : '₹2,000/mo'})`;
    }

    // Helper to format minutes nicely
    function fmtMin(m) {
      if (m === 0) return '<span class="text-muted">0 min</span>';
      const h = Math.floor(m / 60);
      const mins = m % 60;
      return h > 0
        ? `<strong>${h}h ${mins}m</strong>`
        : `<strong>${mins} min</strong>`;
    }

    // Display formatted breakdown
    summaryBox.innerHTML = `
      <div class="fw-bold text-primary mb-2"><i class="fa-solid fa-wand-magic-sparkles me-1"></i>Shift Auto-Calc Log:</div>
      <div>Month Calendar Days: <strong>${res.workingDays + res.sundays + (res.holidays || 0)}</strong></div>
      <div>Working Shift Days (Mon–Sat): <strong>${res.workingDays}</strong></div>
      <div>Paid Sundays Off: <strong>${res.sundays}</strong></div>
      <div>Paid Holidays Off: <strong>${res.holidays || 0}</strong></div>
      <hr class="my-2">
      <div>Marked Present: <strong class="text-success">${res.presentDays} days</strong></div>
      <div>Approved Leaves: <strong class="text-info">${res.leaveDays} days</strong></div>
      <div>Half Days Logged: <strong class="text-warning">${res.halfDays || 0} days</strong></div>
      <div>Absent / No Log: <strong class="text-danger">${res.absentDays} days</strong></div>
      <hr class="my-2">

      <div class="fw-semibold text-danger mb-1"><i class="fa-solid fa-circle-minus me-1"></i>Deductions</div>

      <div class="d-flex justify-content-between">
        <span>Absent Deductions</span>
        <strong class="text-danger">- ${formatCurrency(res.absentDeductions)}</strong>
      </div>
      <div class="d-flex justify-content-between">
        <span>Leave Deductions (Unpaid)</span>
        <strong class="text-danger">- ${formatCurrency(res.leaveDeductions || 0)}</strong>
      </div>
      <div class="d-flex justify-content-between">
        <span>Half Day Deductions (50%)</span>
        <strong class="text-danger">- ${formatCurrency(res.halfDayDeductions || 0)}</strong>
      </div>
      <div class="d-flex justify-content-between align-items-start mt-1">
        <span>
          Late Check-in <span class="badge bg-danger ms-1" style="font-size:0.68rem;">${res.lateInMinutes} min</span>
          <small class="text-muted d-block" style="font-size:0.72rem;">2× per-minute penalty</small>
        </span>
        <strong class="text-danger">- ${formatCurrency(res.lateInDeductions)}</strong>
      </div>
      <div class="d-flex justify-content-between align-items-start mt-1">
        <span>
          Early Check-out <span class="badge bg-danger ms-1" style="font-size:0.68rem;">${res.earlyOutMinutes} min</span>
          <small class="text-muted d-block" style="font-size:0.72rem;">2× per-minute penalty</small>
        </span>
        <strong class="text-danger">- ${formatCurrency(res.earlyOutDeductions)}</strong>
      </div>
      <div class="d-flex justify-content-between align-items-start mt-1">
        <span>
          Extra Break Time <span class="badge bg-warning text-dark ms-1" style="font-size:0.68rem;">${res.extraBreakMinutes} min</span>
          <small class="text-muted d-block" style="font-size:0.72rem;">2× per-minute penalty</small>
        </span>
        <strong class="text-danger">- ${formatCurrency(res.breakDeductions || 0)}</strong>
      </div>
      <div class="d-flex justify-content-between align-items-start mt-1">
        <span>
          Missing Check-out Penalty
          <small class="text-muted d-block" style="font-size:0.72rem;">Full day rate per missing day</small>
        </span>
        <strong class="text-danger">- ${formatCurrency(res.penaltyDeductions)}</strong>
      </div>
      ${res.depositDeduction > 0 ? `
      <div class="d-flex justify-content-between align-items-start mt-1">
        <span>
          Security Deposit Deduction
          <small class="text-muted d-block" style="font-size:0.72rem;">Deduction rule: ${res.depositDeductionType === 'first_month' ? 'First Month Full' : '₹2,000 Monthly'}</small>
        </span>
        <strong class="text-danger">- ${formatCurrency(res.depositDeduction)}</strong>
      </div>` : ''}

      <hr class="my-2">

      <div class="fw-semibold text-success mb-1"><i class="fa-solid fa-circle-plus me-1"></i>Overtime Bonus</div>
      <div class="d-flex justify-content-between align-items-start">
        <span>
          Overtime Worked <span class="badge bg-success ms-1" style="font-size:0.68rem;">${res.overtimeMinutes} min</span>
          <small class="text-muted d-block" style="font-size:0.72rem;">1.5× per-minute bonus</small>
        </span>
        <strong class="text-success">+ ${formatCurrency(res.overtimeBonus)}</strong>
      </div>

      <hr class="my-2">
      <div class="d-flex justify-content-between fw-bold text-dark">
        <span>Total Deductions</span>
        <span class="text-danger">- ${formatCurrency(res.totalDeductions)}</span>
      </div>
      <div class="d-flex justify-content-between fw-bold text-success fs-6 mt-1">
        <span>Calculated Net Salary</span>
        <span>${formatCurrency(res.netSalary)}</span>
      </div>
    `;
  } catch (err) {
    console.error(err);
    summaryBox.classList.add('d-none');
    showAlert(err.message, 'danger');
  }
}

// Global variable to hold calculation breakdown description
let activeBreakdownText = '';

// Toggle between automatic and manual payout calculation modes
function togglePayoutCalcMode() {
  const mode = document.getElementById('payout_calc_mode').value;
  const autoBtnContainer = document.getElementById('auto-calc-btn-container');
  const manualInputsContainer = document.getElementById('manual-calc-inputs');
  const summaryBox = document.getElementById('calc-summary-box');
  const deductionInput = document.getElementById('payout_deductions');

  // Reset values
  deductionInput.value = '0';
  summaryBox.classList.add('d-none');
  summaryBox.innerHTML = '';
  activeBreakdownText = '';

  // Reset manual form fields
  document.getElementById('man_absent_days').value = '0';
  document.getElementById('man_half_days').value = '0';
  document.getElementById('man_late_hours').value = '0';
  document.getElementById('man_late_minutes').value = '0';
  document.getElementById('man_missing_checkout').value = '0';

  if (mode === 'manual') {
    autoBtnContainer.classList.add('d-none');
    manualInputsContainer.classList.remove('d-none');
    calculateManualSalary();
  } else {
    autoBtnContainer.classList.remove('d-none');
    manualInputsContainer.classList.add('d-none');
  }
}

// Compute salary deductions dynamically from manual details inputs
function calculateManualSalary() {
  const empId = parseInt(document.getElementById('payout_user_id').value);
  const monthVal = document.getElementById('payout_month').value;
  const summaryBox = document.getElementById('calc-summary-box');
  const deductionInput = document.getElementById('payout_deductions');

  if (!empId) {
    showAlert('Please select an Employee first.', 'warning');
    document.getElementById('payout_calc_mode').value = 'auto';
    togglePayoutCalcMode();
    return;
  }

  if (!monthVal) {
    showAlert('Please select Payout Month first.', 'warning');
    document.getElementById('payout_calc_mode').value = 'auto';
    togglePayoutCalcMode();
    return;
  }

  const emp = employeesListGlobal.find(e => e.id === empId);
  if (!emp) return;

  const basicSalary = emp.salary;
  const [year, monthNum] = monthVal.split('-').map(Number);
  
  // Calculate exact working days in the month (Mon-Sat, excluding Sundays)
  const totalDays = new Date(year, monthNum, 0).getDate();
  let workingDaysCount = 0;
  let sundaysCount = 0;

  for (let day = 1; day <= totalDays; day++) {
    const dateObj = new Date(year, monthNum - 1, day);
    if (dateObj.getDay() === 0) {
      sundaysCount++;
    } else {
      workingDaysCount++;
    }
  }

  const dailyRate = workingDaysCount > 0 ? basicSalary / workingDaysCount : 0;
  const hourlyRate = dailyRate / 9;

  // Retrieve manual details input values
  const absentDays = parseInt(document.getElementById('man_absent_days').value) || 0;
  const halfDays = parseInt(document.getElementById('man_half_days').value) || 0;
  const lateHours = parseFloat(document.getElementById('man_late_hours').value) || 0;
  const lateMinutes = parseFloat(document.getElementById('man_late_minutes').value) || 0;
  const missingCheckouts = parseInt(document.getElementById('man_missing_checkout').value) || 0;

  // Compute deductions based on rules
  const absentDeductions = absentDays * dailyRate;
  const halfDayDeductions = halfDays * (dailyRate / 2);
  const totalLateHours = lateHours + (lateMinutes / 60);
  const lateDeductions = (totalLateHours * 2) * hourlyRate; // 2x late time penalty
  const penaltyDeductions = missingCheckouts * dailyRate; // full day penalty

  // Calculate remaining security deposit deduction
  const depositTotal = emp.deposit_total || 0;
  const depositPaid = emp.deposit_paid || 0;
  const remainingDeposit = Math.max(0, depositTotal - depositPaid);
  let depositDeduction = 0;
  if (remainingDeposit > 0) {
    if (emp.deposit_deduction_type === 'first_month') {
      depositDeduction = remainingDeposit;
    } else {
      depositDeduction = Math.min(2000, remainingDeposit);
    }
  }

  const totalDeductions = absentDeductions + halfDayDeductions + lateDeductions + penaltyDeductions + depositDeduction;
  const netSalary = Math.max(0, basicSalary - totalDeductions);

  // Populate deduction input field
  deductionInput.value = Math.round(totalDeductions * 100) / 100;

  // Store breakdown summary description globally
  activeBreakdownText = `Manual input: Present: ${workingDaysCount - absentDays - halfDays} days, Leaves: 0 days, Half: ${halfDays} days, Absent: ${absentDays} days, Late delay penalty: ${lateHours} hrs ${lateMinutes} mins (deducted 2x), No checkouts count: ${missingCheckouts}`;
  if (depositDeduction > 0) {
    activeBreakdownText += `, Security Deposit Deduction: ${formatCurrency(depositDeduction)} (Rule: ${emp.deposit_deduction_type === 'first_month' ? 'First Month' : '₹2,000/mo'})`;
  }

  summaryBox.classList.remove('d-none');
  summaryBox.innerHTML = `
    <div class="fw-bold text-primary mb-2"><i class="fa-solid fa-calculator me-1"></i>Manual Detail Calc:</div>
    <div>Basic Salary: <strong>${formatCurrency(basicSalary)}</strong></div>
    <div>Working Days: <strong>${workingDaysCount}</strong> (Sundays: ${sundaysCount})</div>
    <hr class="my-2">
    <div>Absent Days: <strong>${absentDays}</strong> (${formatCurrency(absentDeductions)})</div>
    <div>Half Days: <strong>${halfDays}</strong> (${formatCurrency(halfDayDeductions)})</div>
    <div>Late delay penalty: <strong>${lateHours} hrs ${lateMinutes} mins</strong> (2x: ${formatCurrency(lateDeductions)})</div>
    <div>No checkouts: <strong>${missingCheckouts}</strong> (${formatCurrency(penaltyDeductions)})</div>
    ${depositDeduction > 0 ? `
    <div class="d-flex justify-content-between align-items-start mt-1">
      <span>
        Security Deposit Deduction
        <small class="text-muted d-block" style="font-size:0.72rem;">Deduction rule: ${emp.deposit_deduction_type === 'first_month' ? 'First Month Full' : '₹2,000 Monthly'}</small>
      </span>
      <strong class="text-danger">- ${formatCurrency(depositDeduction)}</strong>
    </div>` : ''}
    <hr class="my-2">
    <div class="fw-bold text-dark">Total Auto Deductions: <span class="float-end">${formatCurrency(totalDeductions)}</span></div>
    <div class="fw-bold text-success fs-6 mt-1">Calculated Net Salary: <span class="float-end">${formatCurrency(netSalary)}</span></div>
  `;
}

// Load holidays list
async function loadHolidays() {
  const tbody = document.getElementById('admin-holidays-table');
  tbody.innerHTML = '<tr><td colspan="3" class="text-center py-4 text-muted"><i class="fa-solid fa-spinner fa-spin me-2"></i>Loading holidays...</td></tr>';

  try {
    const data = await apiRequest('/admin/holidays');
    tbody.innerHTML = '';

    if (data.holidays.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" class="text-center py-4 text-muted">No holidays declared yet.</td></tr>';
      return;
    }

    data.holidays.forEach(item => {
      tbody.innerHTML += `
        <tr>
          <td class="fw-semibold">${item.date}</td>
          <td>${item.name}</td>
          <td>
            <button class="btn btn-sm btn-outline-danger" onclick="deleteHoliday(${item.id})">
              <i class="fa-solid fa-trash"></i>
            </button>
          </td>
        </tr>
      `;
    });
  } catch (err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="3" class="text-center text-danger py-4">Error loading holidays.</td></tr>';
  }
}

// Add a holiday
async function addHoliday(e) {
  e.preventDefault();
  
  const date = document.getElementById('holiday_date').value;
  const name = document.getElementById('holiday_name').value;

  try {
    const data = await apiRequest('/admin/holidays', {
      method: 'POST',
      body: JSON.stringify({ date, name })
    });

    showAlert(data.message, 'success');
    document.getElementById('holidayForm').reset();
    loadHolidays();
  } catch (err) {
    showAlert(err.message, 'danger');
  }
}

// Delete a holiday
async function deleteHoliday(id) {
  if (!confirm('Are you sure you want to delete this holiday?')) return;

  try {
    const data = await apiRequest(`/admin/holidays/${id}`, {
      method: 'DELETE'
    });

    showAlert(data.message, 'success');
    loadHolidays();
  } catch (err) {
    showAlert(err.message, 'danger');
  }
}

// Approve an attendance record
async function approveAttendance(id) {
  if (!confirm('Are you sure you want to approve this attendance record?')) return;

  try {
    const data = await apiRequest(`/admin/attendance/${id}/approve`, {
      method: 'PUT'
    });

    showAlert(data.message, 'success');
    loadGlobalAttendance();
  } catch (err) {
    showAlert(err.message, 'danger');
  }
}

// Load Settings page data
async function loadSettingsPage() {
  const select = document.getElementById('reset-employee-select');
  select.innerHTML = '<option value="">-- Choose Employee --</option>';
  
  try {
    const data = await apiRequest('/admin/employees');
    data.employees.forEach(emp => {
      select.innerHTML += `<option value="${emp.id}">${emp.name} (${emp.email})</option>`;
    });
  } catch (err) {
    console.error(err);
    showAlert('Error loading employees list for select.', 'danger');
  }
}

// Change Admin Password
async function changeAdminPassword(e) {
  e.preventDefault();
  const currentPassword = document.getElementById('admin-current-pwd').value;
  const newPassword = document.getElementById('admin-new-pwd').value;
  const confirmPassword = document.getElementById('admin-confirm-pwd').value;

  if (newPassword !== confirmPassword) {
    showAlert('New passwords do not match.', 'danger');
    return;
  }

  try {
    const data = await apiRequest('/admin/profile/change-password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword })
    });
    showAlert(data.message, 'success');
    document.getElementById('adminChangePasswordForm').reset();
  } catch (err) {
    showAlert(err.message, 'danger');
  }
}

// Reset Employee Password
async function resetEmployeePassword(e) {
  e.preventDefault();
  const employeeId = document.getElementById('reset-employee-select').value;
  const newPassword = document.getElementById('reset-employee-new-pwd').value;

  try {
    const data = await apiRequest(`/admin/employees/${employeeId}/reset-password`, {
      method: 'PUT',
      body: JSON.stringify({ newPassword })
    });
    showAlert(data.message, 'success');
    document.getElementById('adminResetEmployeePasswordForm').reset();
  } catch (err) {
    showAlert(err.message, 'danger');
  }
}


