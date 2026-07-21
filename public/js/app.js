// Common Utilities for TrueTwist

const API_BASE_URL = '/api';

// Retrieve auth token from LocalStorage
function getToken() {
  return localStorage.getItem('token');
}

// Retrieve user info from LocalStorage
function getUser() {
  const userStr = localStorage.getItem('user');
  try {
    return userStr ? JSON.parse(userStr) : null;
  } catch (e) {
    return null;
  }
}

// Check authorization status
function checkAuth(requiredRole = null) {
  const token = getToken();
  const user = getUser();

  if (!token || !user) {
    logout();
    return;
  }

  if (requiredRole && user.role !== requiredRole) {
    if (user.role === 'admin') {
      window.location.href = '/admin.html';
    } else {
      window.location.href = '/dashboard.html';
    }
  }
}

// Log out user
function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = '/login.html';
}

// Show feedback alert toast
function showAlert(message, type = 'success') {
  // Remove existing alert if any
  const oldAlert = document.getElementById('hub-global-alert');
  if (oldAlert) {
    oldAlert.remove();
  }

  // Create alert container
  const alertContainer = document.createElement('div');
  alertContainer.id = 'hub-global-alert';
  alertContainer.className = `hub-alert hub-alert-${type}`;
  
  // Set icon based on alert type
  let icon = 'fa-check-circle';
  if (type === 'danger') icon = 'fa-exclamation-circle';
  if (type === 'warning') icon = 'fa-exclamation-triangle';
  if (type === 'info') icon = 'fa-info-circle';

  alertContainer.innerHTML = `
    <i class="fas ${icon} me-3" style="font-size: 1.25rem;"></i>
    <div>${message}</div>
  `;

  document.body.appendChild(alertContainer);

  // Trigger reflow to apply transition
  alertContainer.offsetHeight;
  alertContainer.classList.add('show');

  // Auto remove after 4 seconds
  setTimeout(() => {
    alertContainer.classList.remove('show');
    setTimeout(() => {
      alertContainer.remove();
    }, 300);
  }, 4000);
}

// Global API request helper
async function apiRequest(endpoint, options = {}) {
  const token = getToken();
  
  const headers = {
    ...(options.headers || {})
  };

  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  } else if (!options.body) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config = {
    ...options,
    headers
  };

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
    const data = await response.json();

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        logout();
        return;
      }
      throw new Error(data.error || 'Something went wrong.');
    }

    return data;
  } catch (error) {
    console.error(`API Error for ${endpoint}:`, error.message);
    throw error;
  }
}

// Initial initialization when loaded
document.addEventListener('DOMContentLoaded', () => {
  // Setup toggle sidebar for mobile layout
  const toggleBtn = document.querySelector('.navbar-toggle-btn');
  const sidebar = document.querySelector('.sidebar');
  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
    });
  }

  // Populate global avatar initial block
  const user = getUser();
  if (user) {
    const userInitials = document.querySelectorAll('.user-initials');
    const initials = user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    userInitials.forEach(el => {
      el.textContent = initials;
    });

    const userNameEls = document.querySelectorAll('.user-fullname');
    userNameEls.forEach(el => {
      el.textContent = user.name;
    });
  }
});

// Toggle password input visibility (switches between password and text types)
function togglePasswordVisibility(inputId, iconEl) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    iconEl.classList.remove('fa-eye-slash');
    iconEl.classList.add('fa-eye');
  } else {
    input.type = 'password';
    iconEl.classList.remove('fa-eye');
    iconEl.classList.add('fa-eye-slash');
  }
}
