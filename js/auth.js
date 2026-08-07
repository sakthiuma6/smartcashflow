/**
 * SmartCashflow Client Auth Module - Handles Registration, PBKDF2 Encrypted Login,
 * Forgot Password Code Verification, Google/Gmail OAuth Sign-In & Strict Session Management
 */

window.AuthModule = (() => {
  const SERVER_URL = 'http://localhost:8081';
  let currentUser = null; // DEFAULT NULL: No automatic login on refresh after logout

  /**
   * Load active user session from LocalStorage
   */
  function init() {
    try {
      const stored = localStorage.getItem('smartcashflow_user');
      if (stored) {
        currentUser = JSON.parse(stored);
      } else {
        currentUser = null;
      }
    } catch (err) {
      console.warn('Auth state load error:', err);
      currentUser = null;
    }
  }

  // Auto-initialize auth state from localStorage on module load
  init();

  function getCurrentUser() {
    return currentUser;
  }

  function isLoggedIn() {
    return currentUser !== null && Boolean(currentUser.id);
  }

  function isAdmin() {
    return currentUser !== null && (
      currentUser.role === 'admin' || 
      currentUser.username === 'admin' || 
      currentUser.email === 'sakthiumamaheswarit@gmail.com'
    );
  }

  function setCurrentUser(user) {
    currentUser = user;
    if (user) {
      localStorage.setItem('smartcashflow_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('smartcashflow_user');
    }
  }

  /**
   * Register New Account
   */
  async function register(username, email, password, name) {
    const res = await fetch(`${SERVER_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password, name })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Registration failed');
    setCurrentUser(data.user);
    return data;
  }

  /**
   * Login with Username/Email & Password
   */
  async function login(identifier, password) {
    const res = await fetch(`${SERVER_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Login failed');
    setCurrentUser(data.user);
    return data;
  }

  /**
   * Request Forgot Password Reset Code
   */
  async function forgotPassword(email) {
    const res = await fetch(`${SERVER_URL}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Forgot password request failed');
    return data;
  }

  /**
   * Execute Password Reset with Verification Code
   */
  async function resetPassword(email, resetToken, newPassword) {
    const res = await fetch(`${SERVER_URL}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, resetToken, newPassword })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Password reset failed');
    return data;
  }

  /**
   * Google / Gmail Sign-In Endpoint Handler
   */
  async function googleSignIn(googleId, email, name, avatarUrl) {
    const res = await fetch(`${SERVER_URL}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ googleId, email, name, avatarUrl })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Google Sign-In failed');
    setCurrentUser(data.user);
    return data;
  }

  /**
   * Fetch All Registered Users (Admin feature)
   */
  async function getAllUsers() {
    try {
      const res = await fetch(`${SERVER_URL}/api/auth/users`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to fetch users');
      return data.users || [];
    } catch (e) {
      console.warn('getAllUsers error:', e);
      return [];
    }
  }

  /**
   * Log out active user and end session cleanly
   */
  function logout() {
    setCurrentUser(null);
  }

  // Auto-init on script load
  init();

  return {
    init,
    getCurrentUser,
    isLoggedIn,
    isAdmin,
    register,
    login,
    forgotPassword,
    resetPassword,
    googleSignIn,
    getAllUsers,
    logout
  };
})();
