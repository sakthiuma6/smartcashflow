/**
 * SmartCashflow Application Controller - Multi-User Scoping & Admin Privileges
 */

document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Initialize Local Database
    await window.DBModule.initDatabase();

    // Check & Connect to Primary MySQL Server
    if (window.SyncModule) {
      await window.SyncModule.checkServerStatus();
      await window.SyncModule.fullSync();
    }

    // Load Saved Currency Preference
    const savedCurrency = await window.DBModule.getSetting('activeCurrency', 'INR');
    window.CurrencyModule.setActiveCurrency(savedCurrency);
    
    const currencySelect = document.getElementById('global-currency');
    if (currencySelect) {
      currencySelect.value = savedCurrency;
      const prefixEl = document.getElementById('form-currency-prefix');
      if (prefixEl) prefixEl.textContent = window.CurrencyModule.getCurrencySymbol(savedCurrency);
    }

    // Load Saved Active Account Filter Preference (Defaults to ALL)
    activeAccountFilter = await window.DBModule.getSetting('activeAccount', 'ALL');

    // Load Saved Timeframe Preference (Defaults to THIS_MONTH)
    activeTimeframeFilter = await window.DBModule.getSetting('activeTimeframe', 'THIS_MONTH');
    const timeframeSelect = document.getElementById('global-timeframe');
    if (timeframeSelect) timeframeSelect.value = activeTimeframeFilter;

    // Set Default Month Picker to current month (YYYY-MM)
    const monthPicker = document.getElementById('filter-month-picker');
    if (monthPicker) {
      const now = new Date();
      monthPicker.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    // Initial UI Render
    initEventListeners();
    renderApp();
  } catch (err) {
    console.error("Initialization error:", err);
  }
});

let currentExpenses = [];
let currentAccounts = [];
let activeAccountFilter = 'ALL';
let activeAdminUserFilter = 'ALL';
let activeTimeframeFilter = 'THIS_MONTH'; // DEFAULT: Monthly
let activeSectorFilter = 'ALL';
let activeTypeFilter = 'ALL';
let searchTerm = '';
let sortBy = 'date-desc';

/**
 * Main Render Loop
 */
async function renderApp() {
  try {
    currentExpenses = await window.DBModule.getAllExpenses();
    currentAccounts = await window.DBModule.getAccounts();
    const globalCurrency = window.CurrencyModule.getActiveCurrency();

    // Render Top Header User Session & Admin Controls
    renderUserHeader();
    await renderAdminUserSelector();

    const currentUser = window.AuthModule ? window.AuthModule.getCurrentUser() : null;

    const landingView = document.getElementById('landing-view');
    const mainDashboard = document.getElementById('main-dashboard-content');
    const headerTimeframe = document.querySelector('.timeframe-selector-wrapper');
    const headerAccount = document.querySelector('.account-selector-wrapper');
    const headerCurrency = document.querySelector('.currency-selector-wrapper');
    const headerActionBtns = document.querySelector('.btn-group');
    const btnCustomLayout = document.getElementById('btn-open-dashboard-builder');
    const btnTransfer = document.getElementById('btn-open-transfer-modal');
    const btnLogEntry = document.getElementById('btn-open-modal');
    const btnSqlConfig = document.getElementById('btn-open-mysql-config');
    const btnUserMgmt = document.getElementById('btn-open-user-management');
    const userHeaderContainer = document.getElementById('user-header-container');

    const isAdmin = window.AuthModule ? window.AuthModule.isAdmin() : false;

    if (!currentUser) {
      // Hide all header action controls & CTA buttons on Login Landing View
      if (landingView) landingView.style.display = 'flex';
      if (mainDashboard) mainDashboard.style.display = 'none';
      if (headerTimeframe) headerTimeframe.style.display = 'none';
      if (headerAccount) headerAccount.style.display = 'none';
      if (headerCurrency) headerCurrency.style.display = 'none';
      if (headerActionBtns) headerActionBtns.style.display = 'none';
      if (btnCustomLayout) btnCustomLayout.style.display = 'none';
      if (btnTransfer) btnTransfer.style.display = 'none';
      if (btnLogEntry) btnLogEntry.style.display = 'none';
      if (btnSqlConfig) btnSqlConfig.style.display = 'none';
      if (btnUserMgmt) btnUserMgmt.style.display = 'none';
      if (userHeaderContainer) userHeaderContainer.style.display = 'none';
      if (window.lucide) window.lucide.createIcons();
      return;
    } else {
      // Show main dashboard & all header action controls when authenticated
      if (landingView) landingView.style.display = 'none';
      if (mainDashboard) mainDashboard.style.display = 'block';
      if (headerTimeframe) headerTimeframe.style.display = 'flex';
      if (headerAccount) headerAccount.style.display = 'flex';
      if (headerCurrency) headerCurrency.style.display = 'flex';
      if (headerActionBtns) headerActionBtns.style.display = 'flex';
      if (btnCustomLayout) btnCustomLayout.style.display = 'inline-flex';
      if (btnTransfer) btnTransfer.style.display = 'inline-flex';
      if (btnLogEntry) btnLogEntry.style.display = 'inline-flex';
      if (btnSqlConfig) btnSqlConfig.style.display = isAdmin ? 'inline-flex' : 'none';
      if (btnUserMgmt) btnUserMgmt.style.display = isAdmin ? 'inline-flex' : 'none';
      if (userHeaderContainer) userHeaderContainer.style.display = 'flex';
    }

    // Strict User Data Scoping & Isolation
    let userExpenses = currentExpenses;
    let userAccounts = currentAccounts;

    if (isAdmin) {
      // Admin: View ALL users' records or filter by selected user in header dropdown
      if (activeAdminUserFilter !== 'ALL') {
        userExpenses = currentExpenses.filter(e => (e.userId || e.user_id) === activeAdminUserFilter);
        userAccounts = currentAccounts.filter(a => (a.userId || a.user_id) === activeAdminUserFilter);
      }
    } else if (currentUser) {
      // Logged in Regular User: Strictly see ONLY their own records
      const uid = currentUser.id;
      userExpenses = currentExpenses.filter(e => (e.userId || e.user_id) === uid);
      userAccounts = currentAccounts.filter(a => (a.userId || a.user_id) === uid);
    } else {
      // Unauthenticated / Guest Session: Access guest data
      userExpenses = currentExpenses.filter(e => (e.userId || e.user_id) === 'guest' || !e.userId);
      userAccounts = currentAccounts.filter(a => (a.userId || a.user_id) === 'guest' || !a.userId);
    }

    // Ensure selected activeAccountFilter exists in accounts list, else reset to ALL
    if (activeAccountFilter !== 'ALL') {
      const accExists = userAccounts.some(a => a.id === activeAccountFilter);
      if (!accExists) {
        activeAccountFilter = 'ALL';
        await window.DBModule.saveSetting('activeAccount', 'ALL');
      }
    }

    // Load Saved Dashboard Layout Configuration safely
    const defaultLayout = {
      graphs: ['donut', 'bar', 'payment', 'accounts'],
      kpis: ['transfers', 'investments', 'topsector']
    };
    let layout = await window.DBModule.getSetting('dashboardLayout', defaultLayout);
    if (!layout || !Array.isArray(layout.graphs) || !Array.isArray(layout.kpis)) {
      layout = defaultLayout;
    }
    applyDashboardLayout(layout);

    // Populate Bank Account Dropdowns across Header, Forms & Transfer Modals
    renderAccountDropdowns(userAccounts);

    // Show/Hide Edit Account Button based on selected session
    const btnEditAcc = document.getElementById('btn-edit-account');
    if (btnEditAcc) {
      btnEditAcc.style.display = activeAccountFilter !== 'ALL' ? 'inline-flex' : 'none';
    }

    // Show/Hide Reset Account Filter Button
    const btnResetAccFilter = document.getElementById('btn-reset-account-filter');
    if (btnResetAccFilter) {
      btnResetAccFilter.style.display = activeAccountFilter !== 'ALL' ? 'inline-flex' : 'none';
    }

    // Ensure Currency Dropdown UI is synchronized
    const currencySelect = document.getElementById('global-currency');
    if (currencySelect && currencySelect.value !== globalCurrency) {
      currencySelect.value = globalCurrency;
    }
    const prefixEl = document.getElementById('form-currency-prefix');
    if (prefixEl) {
      prefixEl.textContent = window.CurrencyModule.getCurrencySymbol(globalCurrency);
    }

    // 1. Filter expenses by Bank Account Session
    let accountExpenses = userExpenses.filter(e => {
      if (activeAccountFilter === 'ALL') return true;
      const itemAcc = e.accountId || 'acc_primary';
      return itemAcc === activeAccountFilter;
    });

    // 2. Filter expenses by Advanced Date & Timeframe Filter
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonthNum = now.getMonth() + 1;
    const currentMonthStr = String(currentMonthNum).padStart(2, '0');
    const monthPrefix = `${currentYear}-${currentMonthStr}`;

    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthPrefix = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;

    const monthPicker = document.getElementById('filter-month-picker');
    const customRangeContainer = document.getElementById('custom-date-range-container');
    const startDateInput = document.getElementById('filter-start-date');
    const endDateInput = document.getElementById('filter-end-date');

    if (monthPicker) {
      monthPicker.style.display = activeTimeframeFilter === 'SPECIFIC_MONTH' ? 'inline-block' : 'none';
    }
    if (customRangeContainer) {
      customRangeContainer.style.display = activeTimeframeFilter === 'CUSTOM_RANGE' ? 'inline-flex' : 'none';
    }

    let timeframeExpenses = accountExpenses.filter(item => {
      if (!item.date) return true;

      if (activeTimeframeFilter === 'THIS_MONTH') {
        return item.date.startsWith(monthPrefix);
      }
      if (activeTimeframeFilter === 'LAST_MONTH') {
        return item.date.startsWith(lastMonthPrefix);
      }
      if (activeTimeframeFilter === 'SPECIFIC_MONTH' && monthPicker && monthPicker.value) {
        return item.date.startsWith(monthPicker.value);
      }
      if (activeTimeframeFilter === 'THIS_YEAR') {
        return item.date.startsWith(`${currentYear}`);
      }
      if (activeTimeframeFilter === 'CUSTOM_RANGE') {
        const startVal = startDateInput ? startDateInput.value : '';
        const endVal = endDateInput ? endDateInput.value : '';
        if (startVal && item.date < startVal) return false;
        if (endVal && item.date > endVal) return false;
        return true;
      }
      return true; // ALL
    });

    // Update Account KPI Header Title
    const kpiTitleAcc = document.getElementById('kpi-title-account');
    if (kpiTitleAcc) {
      if (activeAccountFilter === 'ALL') {
        kpiTitleAcc.textContent = 'Net Bank Balance (All Accounts)';
      } else {
        const selectedAccObj = userAccounts.find(a => a.id === activeAccountFilter);
        kpiTitleAcc.textContent = `Balance (${selectedAccObj ? selectedAccObj.name : 'Account'})`;
      }
    }

    // Dynamic Income & Spent Card Titles based on selected timeframe
    const titleIncome = document.getElementById('kpi-title-income');
    const titleSpent = document.getElementById('kpi-title-spent');
    const titleGraphDonut = document.getElementById('title-graph-donut');

    if (activeTimeframeFilter === 'THIS_MONTH' || activeTimeframeFilter === 'LAST_MONTH' || activeTimeframeFilter === 'SPECIFIC_MONTH') {
      if (titleIncome) titleIncome.textContent = 'Monthly Income';
      if (titleSpent) titleSpent.textContent = 'Monthly Expenses';
      if (titleGraphDonut) titleGraphDonut.textContent = 'Monthly Expense by Sector';
    } else if (activeTimeframeFilter === 'THIS_YEAR') {
      if (titleIncome) titleIncome.textContent = 'Yearly Income';
      if (titleSpent) titleSpent.textContent = 'Yearly Expenses';
      if (titleGraphDonut) titleGraphDonut.textContent = 'Yearly Expense by Sector';
    } else if (activeTimeframeFilter === 'CUSTOM_RANGE') {
      if (titleIncome) titleIncome.textContent = 'Period Income';
      if (titleSpent) titleSpent.textContent = 'Period Expenses';
      if (titleGraphDonut) titleGraphDonut.textContent = 'Period Expense by Sector';
    } else {
      if (titleIncome) titleIncome.textContent = 'Total Income';
      if (titleSpent) titleSpent.textContent = 'Total Spent';
      if (titleGraphDonut) titleGraphDonut.textContent = 'All-Time Expense by Sector';
    }

    // 3. Calculate Financial & KPI Metrics
    renderKPIs(timeframeExpenses, userAccounts, globalCurrency);

    // 4. Render Analytics Charts
    const expenseList = timeframeExpenses.filter(e => {
      const isExpense = (e.type || 'Expense') === 'Expense';
      const isSelfTransfer = e.title && (e.title.startsWith('Transfer OUT ->') || e.title.startsWith('Transfer IN <-'));
      return isExpense && !(activeAccountFilter === 'ALL' && isSelfTransfer);
    });

    const sectorTotals = calculateSectorTotals(expenseList, globalCurrency);

    if (layout.graphs.includes('donut')) window.ChartModule.updateSectorDonutChart(sectorTotals);
    if (layout.graphs.includes('bar')) window.ChartModule.updateSectorBarChart(sectorTotals);
    if (layout.graphs.includes('payment')) window.ChartModule.updatePaymentMethodChart(timeframeExpenses, globalCurrency);
    if (layout.graphs.includes('accounts')) window.ChartModule.updateAccountBalanceChart(userAccounts, userExpenses, globalCurrency);

    // 5. Render Inter-Account Self-Transfers Widget
    renderTransferWidget(timeframeExpenses, userAccounts, globalCurrency);

    // 6. Render Credit Card Bills Widget
    renderCreditCardWidget(timeframeExpenses, globalCurrency);

    // 7. Render Sector Budget Progress Bars
    await renderBudgetWidget(sectorTotals, globalCurrency);

    // 8. Render Sector Filter Chips
    renderSectorChips();

    // 9. Render Data Table
    renderExpenseTable(timeframeExpenses, userAccounts, globalCurrency);

    // Refresh Lucide Icons
    if (window.lucide) {
      window.lucide.createIcons();
    }
  } catch (err) {
    console.error("Error in renderApp:", err);
  }
}

/**
 * Render Header User Session Badge / Sign In CTA
 */
function renderUserHeader() {
  const container = document.getElementById('user-header-container');
  if (!container || !window.AuthModule) return;

  const user = window.AuthModule.getCurrentUser();
  if (user) {
    const isAdminRole = window.AuthModule.isAdmin();
    const avatarHtml = user.avatar_url 
      ? `<img src="${escapeHTML(user.avatar_url)}" style="width:24px;height:24px;border-radius:50%;object-fit:cover;">`
      : `<span style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:${isAdminRole ? 'rgba(234, 179, 8, 0.3)' : 'rgba(16,185,129,0.3)'};color:${isAdminRole ? '#f59e0b' : '#10b981'};font-weight:700;font-size:0.75rem;">${escapeHTML(user.name.charAt(0).toUpperCase())}</span>`;

    container.innerHTML = `
      <div class="badge ${isAdminRole ? 'badge-amber' : 'badge-emerald'}" style="display:flex;align-items:center;gap:0.4rem;padding:0.4rem 0.75rem;cursor:pointer;" title="Signed in as ${escapeHTML(user.email)}">
        ${avatarHtml}
        <span style="font-weight:600;font-size:0.82rem;">${escapeHTML(user.name)} ${isAdminRole ? '👑 (Admin)' : ''}</span>
        <button id="btn-user-logout" class="btn-icon" style="margin-left:0.25rem;color:var(--color-rose);" title="Sign Out">
          <i data-lucide="log-out" style="width:14px;height:14px;"></i>
        </button>
      </div>
    `;

    const logoutBtn = document.getElementById('btn-user-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        window.AuthModule.logout();
        window.isGuestModeActive = false;
        clearAuthModalInputs();
        activeAdminUserFilter = 'ALL';
        renderApp();
      });
    }
  } else {
    container.innerHTML = `
      <button id="btn-open-auth-modal" class="btn btn-secondary text-indigo">
        <i data-lucide="user"></i>
        <span>Sign In / Register</span>
      </button>
    `;

    const openBtn = document.getElementById('btn-open-auth-modal');
    if (openBtn) {
      openBtn.addEventListener('click', () => openAuthModal('login'));
    }
  }

  if (window.lucide) window.lucide.createIcons();
}

/**
 * Render Admin User Selector Dropdown in Header when logged in as Admin
 */
async function renderAdminUserSelector() {
  const wrapper = document.getElementById('admin-user-selector-wrapper');
  const select = document.getElementById('global-admin-user-filter');
  if (!wrapper || !select || !window.AuthModule) return;

  if (window.AuthModule.isAdmin()) {
    wrapper.style.display = 'inline-flex';
    const users = await window.AuthModule.getAllUsers();
    let optionsHtml = `<option value="ALL" ${activeAdminUserFilter === 'ALL' ? 'selected' : ''}>👑 Admin View: All Users' Data</option>`;
    optionsHtml += users.map(u => {
      const isSel = activeAdminUserFilter === u.id ? 'selected' : '';
      return `<option value="${u.id}" ${isSel}>👤 ${escapeHTML(u.name)} (${escapeHTML(u.username)})</option>`;
    }).join('');
    select.innerHTML = optionsHtml;
  } else {
    wrapper.style.display = 'none';
  }
}

/**
 * Auth Modal Handlers (Login / Signup / Forgot Password / Google SSO)
 */
function clearAuthModalInputs() {
  ['form-auth-login', 'form-auth-signup', 'form-auth-reset'].forEach(id => {
    const f = document.getElementById(id);
    if (f && typeof f.reset === 'function') f.reset();
  });
  const inputIds = [
    'login-identifier', 'login-password',
    'signup-name', 'signup-username', 'signup-email', 'signup-password',
    'reset-email', 'reset-code', 'reset-new-password'
  ];
  inputIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const feedback = document.getElementById('auth-feedback');
  if (feedback) {
    feedback.style.display = 'none';
    feedback.textContent = '';
  }
}

function openAuthModal(tab = 'login') {
  const modal = document.getElementById('auth-modal');
  if (!modal) return;
  clearAuthModalInputs();
  setAuthTab(tab);
  modal.classList.add('active');
}

function closeAuthModal() {
  const modal = document.getElementById('auth-modal');
  if (modal) modal.classList.remove('active');
  clearAuthModalInputs();
}

function setAuthTab(tab = 'login') {
  clearAuthModalInputs();

  const tabLogin = document.getElementById('tab-auth-login');
  const tabSignup = document.getElementById('tab-auth-signup');
  const tabReset = document.getElementById('tab-auth-reset');

  const formLogin = document.getElementById('form-auth-login');
  const formSignup = document.getElementById('form-auth-signup');
  const formReset = document.getElementById('form-auth-reset');

  const titleEl = document.getElementById('auth-modal-title');
  const feedback = document.getElementById('auth-feedback');
  if (feedback) feedback.style.display = 'none';

  [tabLogin, tabSignup, tabReset].forEach(t => t && t.classList.remove('active'));
  [formLogin, formSignup, formReset].forEach(f => f && (f.style.display = 'none'));

  if (tab === 'signup') {
    if (tabSignup) tabSignup.classList.add('active');
    if (formSignup) formSignup.style.display = 'block';
    if (titleEl) titleEl.innerHTML = '<i data-lucide="user-plus" class="text-indigo"></i> Create Account';
  } else if (tab === 'reset') {
    if (tabReset) tabReset.classList.add('active');
    if (formReset) formReset.style.display = 'block';
    document.getElementById('reset-step-1').style.display = 'block';
    document.getElementById('reset-step-2').style.display = 'none';
    if (titleEl) titleEl.innerHTML = '<i data-lucide="key-round" class="text-indigo"></i> Reset Password';
  } else {
    if (tabLogin) tabLogin.classList.add('active');
    if (formLogin) formLogin.style.display = 'block';
    if (titleEl) titleEl.innerHTML = '<i data-lucide="shield-check" class="text-indigo"></i> Account Access';
  }

  if (window.lucide) window.lucide.createIcons();
}

/**
 * Apply Dashboard Customization Layout Visibility Safely
 */
function applyDashboardLayout(layout) {
  const defaultGraphs = ['donut', 'bar', 'payment', 'accounts'];
  const defaultKPIs = ['transfers', 'investments', 'topsector'];
  const graphs = (layout && Array.isArray(layout.graphs)) ? layout.graphs : defaultGraphs;
  const kpis = (layout && Array.isArray(layout.kpis)) ? layout.kpis : defaultKPIs;

  const cardDonut = document.getElementById('card-graph-donut');
  const cardBar = document.getElementById('card-graph-bar');
  const cardPayment = document.getElementById('card-graph-payment');
  const cardAccounts = document.getElementById('card-graph-accounts');

  if (cardDonut) cardDonut.style.display = graphs.includes('donut') ? 'block' : 'none';
  if (cardBar) cardBar.style.display = graphs.includes('bar') ? 'block' : 'none';
  if (cardPayment) cardPayment.style.display = graphs.includes('payment') ? 'block' : 'none';
  if (cardAccounts) cardAccounts.style.display = graphs.includes('accounts') ? 'block' : 'none';

  const kpiTransfers = document.getElementById('kpi-card-transfers');
  const kpiInvestments = document.getElementById('kpi-card-investments');
  const kpiTopSector = document.getElementById('kpi-card-topsector');

  if (kpiTransfers) kpiTransfers.style.display = kpis.includes('transfers') ? 'block' : 'none';
  if (kpiInvestments) kpiInvestments.style.display = kpis.includes('investments') ? 'block' : 'none';
  if (kpiTopSector) kpiTopSector.style.display = kpis.includes('topsector') ? 'block' : 'none';
}

/**
 * Populate Bank Account Select Dropdowns
 */
function renderAccountDropdowns(userAccounts) {
  const headerFilter = document.getElementById('global-account-filter');
  const formSelect = document.getElementById('form-account');
  const transferFromSelect = document.getElementById('transfer-from-account');
  const transferToSelect = document.getElementById('transfer-to-account');

  let headerHtml = `<option value="ALL" ${activeAccountFilter === 'ALL' ? 'selected' : ''}>🏦 All Bank Accounts</option>`;
  headerHtml += userAccounts.map(acc => {
    const isSelected = acc.id === activeAccountFilter ? 'selected' : '';
    return `<option value="${acc.id}" ${isSelected}>💳 ${escapeHTML(acc.name)} (${escapeHTML(acc.bank)})</option>`;
  }).join('');
  if (headerFilter) headerFilter.innerHTML = headerHtml;

  const formHtml = userAccounts.map(acc => {
    return `<option value="${acc.id}">💳 ${escapeHTML(acc.name)} (${escapeHTML(acc.bank)})</option>`;
  }).join('');

  if (formSelect) formSelect.innerHTML = formHtml;
  if (transferFromSelect) transferFromSelect.innerHTML = formHtml;
  if (transferToSelect) transferToSelect.innerHTML = formHtml;
}

/**
 * KPI Metric Calculations
 */
function renderKPIs(expenses, accounts, globalCurrency) {
  let totalIncome = 0;
  let totalSpent = 0;
  let totalInvestments = 0;
  let totalCreditCards = 0;
  let ccPendingCount = 0;
  let incomeCount = 0;
  let expenseCount = 0;
  let totalTransfersVolume = 0;
  let transferCount = 0;
  const sectorMap = {};

  let openingBalanceSum = 0;
  if (activeAccountFilter === 'ALL') {
    accounts.forEach(a => {
      const accNativeCurr = a.currency || 'USD';
      openingBalanceSum += window.CurrencyModule.convertCurrency(a.initialBalance || 0, accNativeCurr, globalCurrency);
    });
  } else {
    const targetAcc = accounts.find(a => a.id === activeAccountFilter);
    if (targetAcc) {
      const accNativeCurr = targetAcc.currency || 'USD';
      openingBalanceSum = window.CurrencyModule.convertCurrency(targetAcc.initialBalance || 0, accNativeCurr, globalCurrency);
    }
  }

  expenses.forEach(item => {
    const type = item.type || 'Expense';
    const isSelfTransfer = item.title && (item.title.startsWith('Transfer OUT ->') || item.title.startsWith('Transfer IN <-'));

    if (isSelfTransfer) {
      if (activeAccountFilter === 'ALL') {
        if (item.title.startsWith('Transfer OUT ->')) {
          const converted = window.CurrencyModule.convertCurrency(item.amount, item.currency || 'USD', globalCurrency);
          totalTransfersVolume += converted;
          transferCount++;
        }
      } else {
        const converted = window.CurrencyModule.convertCurrency(item.amount, item.currency || 'USD', globalCurrency);
        totalTransfersVolume += converted;
        transferCount++;
      }
    }

    if (activeAccountFilter === 'ALL' && isSelfTransfer) {
      return;
    }

    const convertedAmount = window.CurrencyModule.convertCurrency(item.amount, item.currency || 'USD', globalCurrency);

    if (type === 'Income') {
      totalIncome += convertedAmount;
      incomeCount++;
    } else {
      totalSpent += convertedAmount;
      expenseCount++;

      const sector = item.sector || 'Others';
      sectorMap[sector] = (sectorMap[sector] || 0) + convertedAmount;

      if (sector === 'Investments') {
        totalInvestments += convertedAmount;
      }

      if (sector === 'Credit Card Bills') {
        totalCreditCards += convertedAmount;
        if (item.status === 'Pending') {
          ccPendingCount++;
        }
      }
    }
  });

  const netBalance = openingBalanceSum + totalIncome - totalSpent;
  const balanceCard = document.getElementById('kpi-card-balance');
  const netBalanceEl = document.getElementById('kpi-net-balance');

  if (netBalanceEl) {
    netBalanceEl.textContent = window.CurrencyModule.formatCurrency(netBalance, globalCurrency);
    if (netBalance >= 0) {
      netBalanceEl.className = 'kpi-value text-emerald';
      if (balanceCard) balanceCard.className = 'kpi-card glass-card border-emerald';
    } else {
      netBalanceEl.className = 'kpi-value text-rose';
      if (balanceCard) balanceCard.className = 'kpi-card glass-card border-rose';
    }
  }

  const openingStr = openingBalanceSum > 0 
    ? ` (Incl. ${window.CurrencyModule.formatCurrency(openingBalanceSum, globalCurrency)} opening balance)` 
    : '';
  const subtextEl = document.getElementById('kpi-balance-subtext');
  if (subtextEl) {
    subtextEl.textContent = (netBalance >= 0 
      ? 'Positive cashflow surplus' 
      : 'Deficit balance (Expenses exceed income)') + openingStr;
  }

  const incomeEl = document.getElementById('kpi-total-income');
  const incomeSubEl = document.getElementById('kpi-income-subtext');
  if (incomeEl) incomeEl.textContent = window.CurrencyModule.formatCurrency(totalIncome, globalCurrency);
  if (incomeSubEl) incomeSubEl.textContent = `${incomeCount} income deposit${incomeCount === 1 ? '' : 's'} logged`;

  const spentEl = document.getElementById('kpi-total-spent');
  const spentSubEl = document.getElementById('kpi-count-subtext');
  if (spentEl) spentEl.textContent = window.CurrencyModule.formatCurrency(totalSpent, globalCurrency);
  if (spentSubEl) spentSubEl.textContent = `${expenseCount} expense transaction${expenseCount === 1 ? '' : 's'}`;

  const transfersVolEl = document.getElementById('kpi-transfers-volume');
  const transfersSubtextEl = document.getElementById('kpi-transfers-subtext');
  if (transfersVolEl) transfersVolEl.textContent = window.CurrencyModule.formatCurrency(totalTransfersVolume, globalCurrency);
  if (transfersSubtextEl) transfersSubtextEl.textContent = `${transferCount} account transfer${transferCount === 1 ? '' : 's'}`;

  const investEl = document.getElementById('kpi-investments');
  const investSubEl = document.getElementById('kpi-investments-share');
  if (investEl) investEl.textContent = window.CurrencyModule.formatCurrency(totalInvestments, globalCurrency);
  const investPct = totalSpent > 0 ? ((totalInvestments / totalSpent) * 100).toFixed(1) : 0;
  if (investSubEl) investSubEl.textContent = `${investPct}% of spending invested`;

  let topSectorName = 'None';
  let topSectorMax = 0;
  Object.entries(sectorMap).forEach(([sec, val]) => {
    if (val > topSectorMax) {
      topSectorMax = val;
      topSectorName = sec;
    }
  });

  const topSectorEl = document.getElementById('kpi-top-sector');
  const topSectorAmtEl = document.getElementById('kpi-top-sector-amount');
  if (topSectorEl) topSectorEl.textContent = topSectorName;
  if (topSectorAmtEl) topSectorAmtEl.textContent = window.CurrencyModule.formatCurrency(topSectorMax, globalCurrency);
}

/**
 * Inter-Account Transfers Widget Rendering
 */
function renderTransferWidget(expenses, accounts, globalCurrency) {
  const container = document.getElementById('transfer-widget-list');
  const countBadge = document.getElementById('transfer-widget-count');
  if (!container) return;

  const transferList = expenses.filter(e => e.title && (e.title.startsWith('Transfer OUT ->') || e.title.startsWith('Transfer IN <-')));
  
  const displayList = activeAccountFilter === 'ALL' 
    ? transferList.filter(e => e.title.startsWith('Transfer OUT ->'))
    : transferList;

  if (countBadge) countBadge.textContent = `${displayList.length} Move${displayList.length === 1 ? '' : 's'}`;

  if (displayList.length === 0) {
    const isAccountFiltered = activeAccountFilter !== 'ALL';
    container.innerHTML = `<div class="empty-state">No inter-account transfers logged ${isAccountFiltered ? 'for this account session' : 'yet'}. Click <strong>"Transfer"</strong> in the header to move funds.</div>`;
    return;
  }

  const accMap = {};
  accounts.forEach(a => { accMap[a.id] = a.name; });

  container.innerHTML = displayList.map(item => {
    const amt = window.CurrencyModule.formatCurrency(
      window.CurrencyModule.convertCurrency(item.amount, item.currency || 'USD', globalCurrency),
      globalCurrency
    );

    let sourceAcc = accMap[item.accountId] || 'Account';
    let destAcc = 'Account';

    if (item.title.startsWith('Transfer OUT ->')) {
      destAcc = item.title.replace('Transfer OUT -> ', '').trim();
    } else if (item.title.startsWith('Transfer IN <-')) {
      destAcc = sourceAcc;
      sourceAcc = item.title.replace('Transfer IN <- ', '').trim();
    }

    return `
      <div class="transfer-item">
        <div class="transfer-info">
          <div class="transfer-flow-badge">
            <span>💳 ${escapeHTML(sourceAcc)}</span>
            <i data-lucide="arrow-right" style="width:14px;height:14px;"></i>
            <span>💳 ${escapeHTML(destAcc)}</span>
          </div>
          <div class="text-muted" style="font-size: 0.75rem; margin-top: 2px;">${item.date} ${item.notes ? '• ' + escapeHTML(item.notes) : ''}</div>
        </div>
        <div class="text-right">
          <div style="font-weight: 700; font-size: 0.95rem; color: var(--color-indigo);">${amt}</div>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Calculates sector spend totals in global currency
 */
function calculateSectorTotals(expenseList, globalCurrency) {
  const map = {};
  if (window.DBModule && window.DBModule.SECTORS) {
    Object.keys(window.DBModule.SECTORS).forEach(sec => { map[sec] = 0; });
  }

  expenseList.forEach(item => {
    const sec = item.sector || 'Others';
    const converted = window.CurrencyModule.convertCurrency(item.amount, item.currency || 'USD', globalCurrency);
    map[sec] = (map[sec] || 0) + converted;
  });

  return map;
}

/**
 * Credit Card Bills Widget
 */
function renderCreditCardWidget(expenses, globalCurrency) {
  const container = document.getElementById('cc-widget-list');
  const countBadge = document.getElementById('cc-widget-count');
  if (!container) return;

  const ccExpenses = expenses.filter(e => e.sector === 'Credit Card Bills');
  if (countBadge) countBadge.textContent = `${ccExpenses.length} Active`;

  if (ccExpenses.length === 0) {
    container.innerHTML = `<div class="empty-state">No credit card bills logged yet for this account session.</div>`;
    return;
  }

  container.innerHTML = ccExpenses.map(item => {
    const amt = window.CurrencyModule.formatCurrency(
      window.CurrencyModule.convertCurrency(item.amount, item.currency || 'USD', globalCurrency),
      globalCurrency
    );
    const isPending = item.status === 'Pending';
    const statusBadgeClass = isPending ? 'badge-rose' : 'badge-emerald';

    return `
      <div class="cc-item">
        <div class="cc-info">
          <h4>${escapeHTML(item.title)}</h4>
          <p>${item.date} • ${item.paymentMethod || 'Credit Card'} ${item.notes ? '• ' + escapeHTML(item.notes) : ''}</p>
        </div>
        <div class="text-right">
          <div style="font-weight: 700; font-size: 0.95rem;">${amt}</div>
          <button class="badge ${statusBadgeClass} btn-toggle-status" data-id="${item.id}" style="cursor: pointer; border: none; margin-top: 4px;">
            ${item.status || 'Completed'}
          </button>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Sector Budget Limits Widget
 */
async function renderBudgetWidget(sectorTotals, globalCurrency) {
  const container = document.getElementById('budget-widget-list');
  if (!container) return;
  const budgets = await window.DBModule.getBudgets();

  const sectorEntries = Object.keys(window.DBModule.SECTORS);

  container.innerHTML = sectorEntries.map(sector => {
    const spent = sectorTotals[sector] || 0;
    const limitInUSD = budgets[sector] || 500;
    const limitConverted = window.CurrencyModule.convertCurrency(limitInUSD, 'USD', globalCurrency);
    const pct = Math.min(Math.round((spent / limitConverted) * 100), 100);

    let colorClass = 'var(--color-emerald)';
    if (pct > 80 && pct <= 100) colorClass = 'var(--color-amber)';
    if (pct >= 100) colorClass = 'var(--color-rose)';

    const spentFmt = window.CurrencyModule.formatCurrency(spent, globalCurrency);
    const limitFmt = window.CurrencyModule.formatCurrency(limitConverted, globalCurrency);

    return `
      <div class="budget-item">
        <div class="budget-item-header">
          <span><strong>${sector}</strong></span>
          <span class="text-muted">${spentFmt} / ${limitFmt} (${pct}%)</span>
        </div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" style="width: ${pct}%; background: ${colorClass};"></div>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Sector Filter Chips Bar
 */
function renderSectorChips() {
  const container = document.getElementById('sector-chips-bar');
  if (!container) return;
  const allSectors = ['ALL', ...Object.keys(window.DBModule.SECTORS), ...Object.keys(window.DBModule.INCOME_SECTORS)];

  container.innerHTML = allSectors.map(sec => {
    const active = sec === activeSectorFilter ? 'active' : '';
    return `<button class="chip ${active}" data-sector="${sec}">${sec}</button>`;
  }).join('');
}

/**
 * Expense & Income Register Data Table Rendering
 */
function renderExpenseTable(expenses, accounts, globalCurrency) {
  const tbody = document.getElementById('expense-table-body');
  const countBadge = document.getElementById('table-count-badge');
  if (!tbody) return;

  const accMap = {};
  accounts.forEach(a => { accMap[a.id] = a.name; });

  let filtered = expenses.filter(item => {
    const itemType = item.type || 'Expense';
    const matchType = activeTypeFilter === 'ALL' || itemType === activeTypeFilter;
    const matchSector = activeSectorFilter === 'ALL' || item.sector === activeSectorFilter;
    const matchSearch = !searchTerm || 
      item.title.toLowerCase().includes(searchTerm) ||
      (item.notes && item.notes.toLowerCase().includes(searchTerm)) ||
      item.sector.toLowerCase().includes(searchTerm);
    return matchType && matchSector && matchSearch;
  });

  filtered.sort((a, b) => {
    if (sortBy === 'date-desc') return new Date(b.date) - new Date(a.date);
    if (sortBy === 'date-asc') return new Date(a.date) - new Date(b.date);
    if (sortBy === 'amount-desc') return b.amount - a.amount;
    if (sortBy === 'amount-asc') return a.amount - b.amount;
    return 0;
  });

  if (countBadge) countBadge.textContent = `${filtered.length} item${filtered.length === 1 ? '' : 's'}`;

  if (filtered.length === 0) {
    const isAccountFiltered = activeAccountFilter !== 'ALL';
    const selectedAccObj = accounts.find(a => a.id === activeAccountFilter);
    const accNameStr = selectedAccObj ? selectedAccObj.name : 'this bank account';
    const timeframeStr = activeTimeframeFilter === 'THIS_MONTH' ? 'this month' : (activeTimeframeFilter === 'THIS_YEAR' ? 'this year' : 'in selected timeframe');

    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center py-4 text-muted">
          No records found ${timeframeStr} ${isAccountFiltered ? `specifically for <strong>${escapeHTML(accNameStr)}</strong>` : ''}.<br>
          Click <strong>"Log Entry"</strong> to add a transaction, or select <strong>"📅 All Time"</strong> in the top bar.
        </td>
      </tr>
    `;
    return;
  }

  const defaultExpenseSec = { icon: 'package', badgeClass: 'badge-slate', color: '#94a3b8' };
  const defaultIncomeSec = { icon: 'coins', badgeClass: 'badge-slate', color: '#64748b' };

  tbody.innerHTML = filtered.map(item => {
    const isIncome = (item.type || 'Expense') === 'Income';
    const secConfig = isIncome 
      ? (window.DBModule.INCOME_SECTORS[item.sector] || defaultIncomeSec)
      : (window.DBModule.SECTORS[item.sector] || defaultExpenseSec);

    const accountName = accMap[item.accountId] || 'Primary Account';
    const convertedAmount = window.CurrencyModule.convertCurrency(item.amount, item.currency || 'USD', globalCurrency);
    const formattedAmt = (isIncome ? '+ ' : '- ') + window.CurrencyModule.formatCurrency(convertedAmount, globalCurrency);
    const amtColorClass = isIncome ? 'text-emerald' : 'text-main';

    return `
      <tr>
        <td class="text-muted" style="white-space: nowrap;">${item.date}</td>
        <td><span class="badge badge-indigo">💳 ${escapeHTML(accountName)}</span></td>
        <td>
          <div style="font-weight: 600;">${escapeHTML(item.title)}</div>
          <span class="badge ${secConfig.badgeClass}" style="margin-top: 2px;">
            <i data-lucide="${secConfig.icon}" style="width:12px;height:12px;"></i> ${item.sector}
          </span>
          ${item.notes ? `<div class="text-muted" style="font-size: 0.75rem; margin-top: 2px;">${escapeHTML(item.notes)}</div>` : ''}
        </td>
        <td>
          <span class="badge ${isIncome ? 'badge-emerald' : 'badge-rose'}">
            ${isIncome ? '💰 Income' : '💸 Expense'}
          </span>
        </td>
        <td><span class="badge badge-slate">${item.paymentMethod || 'Bank Transfer'}</span></td>
        <td style="font-weight: 700; font-size: 0.95rem;" class="${amtColorClass}">${formattedAmt}</td>
        <td>
          <span class="badge ${item.status === 'Pending' ? 'badge-amber' : 'badge-emerald'}">
            ${item.recurring !== 'One-time' ? '🔄 ' + item.recurring : item.status || 'Completed'}
          </span>
        </td>
        <td class="text-right">
          <div class="action-btn-group">
            <button class="btn-icon btn-edit" data-id="${item.id}" title="Edit"><i data-lucide="edit-3"></i></button>
            <button class="btn-icon btn-icon-danger btn-delete" data-id="${item.id}" title="Delete"><i data-lucide="trash-2"></i></button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * Update Form Sectors Dropdown based on Type selection
 */
function updateFormSectorOptions(type = 'Expense', selectedSector = null) {
  const select = document.getElementById('form-sector');
  if (!select) return;
  const sectorMap = type === 'Income' ? window.DBModule.INCOME_SECTORS : window.DBModule.SECTORS;

  select.innerHTML = Object.keys(sectorMap).map(sec => {
    const isSelected = selectedSector === sec ? 'selected' : '';
    return `<option value="${sec}" ${isSelected}>${sec}</option>`;
  }).join('');
}

/**
 * Event Listeners Initialization
 */
function initEventListeners() {
  // Admin User Filter Dropdown Listener
  const adminUserFilterSelect = document.getElementById('global-admin-user-filter');
  if (adminUserFilterSelect) {
    adminUserFilterSelect.addEventListener('change', (e) => {
      activeAdminUserFilter = e.target.value;
      renderApp();
    });
  }

  // Auth Modal Event Listeners
  const btnCloseAuthModal = document.getElementById('btn-close-auth-modal');
  if (btnCloseAuthModal) btnCloseAuthModal.addEventListener('click', closeAuthModal);

  document.getElementById('tab-auth-login')?.addEventListener('click', () => setAuthTab('login'));
  document.getElementById('tab-auth-signup')?.addEventListener('click', () => setAuthTab('signup'));
  document.getElementById('tab-auth-reset')?.addEventListener('click', () => setAuthTab('reset'));

  document.getElementById('btn-cancel-auth-login')?.addEventListener('click', closeAuthModal);
  document.getElementById('btn-cancel-auth-signup')?.addEventListener('click', closeAuthModal);
  document.getElementById('btn-cancel-auth-reset')?.addEventListener('click', closeAuthModal);

  document.getElementById('link-forgot-password')?.addEventListener('click', (e) => {
    e.preventDefault();
    setAuthTab('reset');
  });

  document.getElementById('btn-back-reset-step1')?.addEventListener('click', () => {
    document.getElementById('reset-step-1').style.display = 'block';
    document.getElementById('reset-step-2').style.display = 'none';
  });

  function showAuthFeedback(msg, isSuccess = false) {
    const fb = document.getElementById('auth-feedback');
    if (!fb) return;
    fb.style.display = 'block';
    fb.style.background = isSuccess ? 'rgba(16, 185, 129, 0.2)' : 'rgba(244, 63, 94, 0.2)';
    fb.style.color = isSuccess ? 'var(--color-emerald)' : 'var(--color-rose)';
    fb.textContent = (isSuccess ? '✅ ' : '❌ ') + msg;
  }

  // 1. SIGN IN Form Submission
  const formLogin = document.getElementById('form-auth-login');
  if (formLogin) {
    formLogin.addEventListener('submit', async (e) => {
      e.preventDefault();
      const identifier = document.getElementById('login-identifier').value.trim();
      const password = document.getElementById('login-password').value;

      try {
        const data = await window.AuthModule.login(identifier, password);
        showAuthFeedback(data.message || 'Signed in successfully!', true);
        setTimeout(() => {
          closeAuthModal();
          renderApp();
        }, 800);
      } catch (err) {
        showAuthFeedback(err.message || 'Login failed');
      }
    });
  }

  // 2. SIGN UP Form Submission
  const formSignup = document.getElementById('form-auth-signup');
  if (formSignup) {
    formSignup.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('signup-name').value.trim();
      const username = document.getElementById('signup-username').value.trim();
      const email = document.getElementById('signup-email').value.trim();
      const password = document.getElementById('signup-password').value;

      try {
        const data = await window.AuthModule.register(username, email, password, name);
        showAuthFeedback(data.message || 'Account created successfully!', true);
        setTimeout(() => {
          closeAuthModal();
          renderApp();
        }, 1000);
      } catch (err) {
        showAuthFeedback(err.message || 'Registration failed');
      }
    });
  }

  // 3. FORGOT PASSWORD Step 1 Trigger
  const btnSendResetCode = document.getElementById('btn-send-reset-code');
  if (btnSendResetCode) {
    btnSendResetCode.addEventListener('click', async () => {
      const email = document.getElementById('reset-email').value.trim();
      if (!email) {
        showAuthFeedback('Please enter your account email address');
        return;
      }

      try {
        const data = await window.AuthModule.forgotPassword(email);
        showAuthFeedback(`${data.message} ${data.resetCode ? '(Verification Code: ' + data.resetCode + ')' : ''}`, true);
        
        if (data.resetCode) {
          const resetCodeInp = document.getElementById('reset-code');
          if (resetCodeInp) resetCodeInp.value = data.resetCode;
        }

        document.getElementById('reset-step-1').style.display = 'none';
        document.getElementById('reset-step-2').style.display = 'block';
      } catch (err) {
        showAuthFeedback(err.message || 'Forgot password failed');
      }
    });
  }

  // 4. RESET PASSWORD Step 2 Execution
  const formReset = document.getElementById('form-auth-reset');
  if (formReset) {
    formReset.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('reset-email').value.trim();
      const resetToken = document.getElementById('reset-code').value.trim();
      const newPassword = document.getElementById('reset-new-password').value;

      try {
        const data = await window.AuthModule.resetPassword(email, resetToken, newPassword);
        showAuthFeedback(data.message || 'Password reset successfully!', true);
        setTimeout(() => {
          setAuthTab('login');
        }, 1200);
      } catch (err) {
        showAuthFeedback(err.message || 'Password reset failed');
      }
    });
  }

  // 5. GOOGLE / GMAIL SIGN IN Trigger
  const btnGoogleLogin = document.getElementById('btn-google-login');
  if (btnGoogleLogin) {
    btnGoogleLogin.addEventListener('click', async () => {
      const simulatedEmail = prompt('Enter your Gmail address for Google Sign-In:', 'user@gmail.com');
      if (!simulatedEmail) return;

      const name = simulatedEmail.split('@')[0].replace('.', ' ');
      const googleId = 'g_' + btoa(simulatedEmail).substring(0, 16);
      const avatarUrl = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(simulatedEmail)}`;

      try {
        const data = await window.AuthModule.googleSignIn(googleId, simulatedEmail, name, avatarUrl);
        showAuthFeedback(data.message || `Signed in as ${simulatedEmail}!`, true);
        setTimeout(() => {
          closeAuthModal();
          renderApp();
        }, 900);
      } catch (err) {
        showAuthFeedback(err.message || 'Google Sign-In failed');
      }
    });
  }

  // MySQL Configuration Settings Modal Open/Close/Submit Handlers
  const mysqlModal = document.getElementById('mysql-config-modal');
  const btnOpenMysqlCfg = document.getElementById('btn-open-mysql-config');
  const sqlSyncBadge = document.getElementById('sql-sync-badge');

  async function openMySQLConfigModal() {
    if (!mysqlModal) return;
    const isAdmin = window.AuthModule ? window.AuthModule.isAdmin() : false;
    if (!isAdmin) {
      alert('Access Denied: SQL Configuration is restricted exclusively to Admin users.');
      return;
    }
    const feedback = document.getElementById('mysql-config-feedback');
    if (feedback) feedback.style.display = 'none';

    try {
      const res = await fetch('http://localhost:8081/api/config');
      if (res.ok) {
        const cfg = await res.json();
        document.getElementById('cfg-sql-host').value = cfg.host || '127.0.0.1';
        document.getElementById('cfg-sql-port').value = cfg.port || 3306;
        document.getElementById('cfg-sql-dbname').value = cfg.database || 'smartcashflow_db';
        document.getElementById('cfg-sql-user').value = cfg.user || 'root';
        document.getElementById('cfg-sql-pass').value = '';
      }
    } catch (e) {
      console.warn('Config fetch error:', e);
    }
    mysqlModal.classList.add('active');
  }

  if (btnOpenMysqlCfg) btnOpenMysqlCfg.addEventListener('click', openMySQLConfigModal);
  if (sqlSyncBadge) sqlSyncBadge.addEventListener('click', openMySQLConfigModal);

  document.getElementById('btn-close-mysql-config').addEventListener('click', () => mysqlModal.classList.remove('active'));
  document.getElementById('btn-cancel-mysql-config').addEventListener('click', () => mysqlModal.classList.remove('active'));

  const mysqlForm = document.getElementById('mysql-config-form');
  if (mysqlForm) {
    mysqlForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const feedback = document.getElementById('mysql-config-feedback');
      const btnSave = document.getElementById('btn-save-mysql-config');

      btnSave.classList.add('loading');
      if (feedback) {
        feedback.style.display = 'block';
        feedback.style.background = 'rgba(6, 182, 212, 0.15)';
        feedback.style.color = 'var(--color-cyan)';
        feedback.textContent = 'Testing connection to MySQL Host...';
      }

      const payload = {
        host: document.getElementById('cfg-sql-host').value.trim(),
        port: Number(document.getElementById('cfg-sql-port').value) || 3306,
        database: document.getElementById('cfg-sql-dbname').value.trim(),
        user: document.getElementById('cfg-sql-user').value.trim(),
        password: document.getElementById('cfg-sql-pass').value
      };

      try {
        const res = await fetch('http://localhost:8081/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        btnSave.classList.remove('loading');

        if (res.ok) {
          if (feedback) {
            feedback.style.background = 'rgba(16, 185, 129, 0.2)';
            feedback.style.color = 'var(--color-emerald)';
            feedback.textContent = '✅ ' + data.message;
          }
          setTimeout(async () => {
            mysqlModal.classList.remove('active');
            if (window.SyncModule) {
              await window.SyncModule.checkServerStatus();
              await window.SyncModule.fullSync();
            }
            renderApp();
          }, 1200);
        } else {
          if (feedback) {
            feedback.style.background = 'rgba(244, 63, 94, 0.2)';
            feedback.style.color = 'var(--color-rose)';
            feedback.textContent = '❌ ' + (data.message || 'Connection failed');
          }
        }
      } catch (err) {
        btnSave.classList.remove('loading');
        if (feedback) {
          feedback.style.background = 'rgba(244, 63, 94, 0.2)';
          feedback.style.color = 'var(--color-rose)';
          feedback.textContent = '❌ Server Gateway unreachable. Verify mysql_server.py is running.';
        }
      }
    });
  }

  async function openUserManagementModal() {
    const isAdmin = window.AuthModule ? window.AuthModule.isAdmin() : false;
    if (!isAdmin) {
      alert('Access Denied: User Management is restricted exclusively to Admin users.');
      return;
    }
    const modal = document.getElementById('user-management-modal');
    if (modal) {
      modal.classList.add('active');
    } else {
      console.warn('user-management-modal element not found in DOM');
    }
    await loadUserManagementDirectory();
  }
  window.openUserManagementModal = openUserManagementModal;

  function closeUserManagementModal() {
    const modal = document.getElementById('user-management-modal');
    if (modal) modal.classList.remove('active');
  }
  window.closeUserManagementModal = closeUserManagementModal;

  async function loadUserManagementDirectory() {
    const tbody = document.getElementById('user-management-table-body');
    const feedback = document.getElementById('user-management-feedback');
    if (!tbody) return;
    if (feedback) feedback.style.display = 'none';

    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:2rem;"><i data-lucide="loader" class="animate-spin"></i> Fetching users directory...</td></tr>';
    if (window.lucide) window.lucide.createIcons();

    try {
      const res = await fetch('http://localhost:8081/api/auth/users');
      if (!res.ok) throw new Error('Failed to load registered users');
      const data = await res.json();
      const users = data.users || [];

      if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-muted" style="text-align:center; padding:2rem;">No registered users found.</td></tr>';
        return;
      }

      const currentUser = window.AuthModule ? window.AuthModule.getCurrentUser() : null;

      tbody.innerHTML = users.map(u => {
        const isSelf = currentUser && currentUser.id === u.id;
        const isUserAdmin = u.role === 'admin' || u.username === 'admin' || u.email === 'sakthiumamaheswarit@gmail.com';
        
        return `
          <tr>
            <td>
              <div style="display:flex; align-items:center; gap:0.75rem;">
                <div style="width:36px; height:36px; border-radius:50%; background:linear-gradient(135deg, #6366f1, #4f46e5); color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:0.9rem; flex-shrink:0;">
                  ${(u.name || u.username || 'U').charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style="font-weight:700; color:var(--text-main); font-size:0.92rem;">${u.name || u.username} ${isSelf ? '<span class="badge badge-indigo" style="font-size:0.65rem; padding:0.15rem 0.4rem;">YOU</span>' : ''}</div>
                  <div style="font-size:0.78rem; color:var(--text-muted);">@${u.username}</div>
                </div>
              </div>
            </td>
            <td style="font-size:0.88rem; color:var(--text-main); font-weight:500;">
              ${u.email}
            </td>
            <td>
              <span class="badge ${isUserAdmin ? 'badge-amber' : 'badge-indigo'}" style="font-size:0.78rem;">
                ${isUserAdmin ? '👑 Admin' : '👤 User'}
              </span>
            </td>
            <td style="font-size:0.85rem; color:var(--text-muted);">
              <strong>${u.expense_count || 0}</strong> Expenses, <strong>${u.account_count || 0}</strong> Accounts
            </td>
            <td>
              <span class="badge badge-ghost" style="font-size:0.75rem;">
                ${u.auth_provider === 'google' ? '🌐 Google SSO' : '🔒 Local DB'}
              </span>
            </td>
            <td style="text-align:right;">
              <div style="display:inline-flex; gap:0.4rem;">
                <button type="button" class="btn btn-ghost btn-sm text-indigo btn-toggle-user-role" data-id="${u.id}" data-role="${u.role || 'user'}" title="Toggle Admin/User Role" ${u.id === 'usr_admin' ? 'disabled' : ''}>
                  <i data-lucide="${isUserAdmin ? 'user-check' : 'shield-alert'}" style="width:14px;height:14px;"></i> Role
                </button>
                <button type="button" class="btn btn-ghost btn-sm text-amber btn-admin-reset-pwd" data-id="${u.id}" data-user="${u.username}" title="Reset Password">
                  <i data-lucide="key-round" style="width:14px;height:14px;"></i> Reset
                </button>
                <button type="button" class="btn btn-ghost btn-sm text-rose btn-admin-delete-user" data-id="${u.id}" data-user="${u.username}" title="Delete Account" ${u.id === 'usr_admin' || isSelf ? 'disabled' : ''}>
                  <i data-lucide="trash-2" style="width:14px;height:14px;"></i> Purge
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');

      if (window.lucide) window.lucide.createIcons();

    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-rose" style="text-align:center; padding:2rem;">Failed to load users directory: ${err.message}</td></tr>`;
    }
  }

  const btnOpenUserMgmt = document.getElementById('btn-open-user-management');
  if (btnOpenUserMgmt) btnOpenUserMgmt.addEventListener('click', openUserManagementModal);
  const btnCloseUserMgmt = document.getElementById('btn-close-user-management-modal');
  if (btnCloseUserMgmt) btnCloseUserMgmt.addEventListener('click', closeUserManagementModal);
  const btnCancelUserMgmt = document.getElementById('btn-cancel-user-management-modal');
  if (btnCancelUserMgmt) btnCancelUserMgmt.addEventListener('click', closeUserManagementModal);

  const btnAdminAddUser = document.getElementById('btn-admin-add-user');
  if (btnAdminAddUser) {
    btnAdminAddUser.addEventListener('click', () => {
      closeUserManagementModal();
      openAuthModal('signup');
    });
  }

  // Delegated Event Handlers for User Table Actions (Role Toggle, Password Reset, Delete User)
  const userMgmtTableBody = document.getElementById('user-management-table-body');
  if (userMgmtTableBody) {
    userMgmtTableBody.addEventListener('click', async (e) => {
      const roleBtn = e.target.closest('.btn-toggle-user-role');
      const resetBtn = e.target.closest('.btn-admin-reset-pwd');
      const deleteBtn = e.target.closest('.btn-admin-delete-user');

      if (roleBtn) {
        const userId = roleBtn.getAttribute('data-id');
        const currentRole = roleBtn.getAttribute('data-role');
        const newRole = currentRole === 'admin' ? 'user' : 'admin';

        if (confirm(`Are you sure you want to change this user's role to ${newRole.toUpperCase()}?`)) {
          const res = await fetch('http://localhost:8081/api/users/update-role', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, role: newRole })
          });
          const data = await res.json();
          if (res.ok) {
            await loadUserManagementDirectory();
            await renderApp();
          } else {
            alert(data.message || 'Failed to update role');
          }
        }
      }

      if (resetBtn) {
        const userId = resetBtn.getAttribute('data-id');
        const username = resetBtn.getAttribute('data-user');
        const newPassword = prompt(`Enter a new password for user @${username}:`);
        if (newPassword && newPassword.trim().length >= 6) {
          const res = await fetch('http://localhost:8081/api/users/admin-reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, newPassword: newPassword.trim() })
          });
          const data = await res.json();
          if (res.ok) {
            alert(`Password for @${username} reset successfully!`);
          } else {
            alert(data.message || 'Failed to reset password');
          }
        } else if (newPassword !== null) {
          alert('Password must be at least 6 characters long.');
        }
      }

      if (deleteBtn) {
        const userId = deleteBtn.getAttribute('data-id');
        const username = deleteBtn.getAttribute('data-user');

        if (confirm(`CAUTION: Delete user @${username} and PURGE all their expenses and bank accounts from the database? This cannot be undone.`)) {
          const res = await fetch('http://localhost:8081/api/users/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId })
          });
          const data = await res.json();
          if (res.ok) {
            await loadUserManagementDirectory();
            await renderApp();
          } else {
            alert(data.message || 'Failed to delete user');
          }
        }
      }
    });
  }

  // Monthly vs Yearly vs Custom Date Range Filter Switcher Listener
  const timeframeSelect = document.getElementById('global-timeframe');
  if (timeframeSelect) {
    timeframeSelect.addEventListener('change', async (e) => {
      activeTimeframeFilter = e.target.value;
      await window.DBModule.saveSetting('activeTimeframe', activeTimeframeFilter);
      renderApp();
    });
  }

  // Month Picker Change Listener
  const monthPicker = document.getElementById('filter-month-picker');
  if (monthPicker) {
    monthPicker.addEventListener('change', () => renderApp());
  }

  // Custom Date Range Inputs Change Listeners
  const startDateInput = document.getElementById('filter-start-date');
  const endDateInput = document.getElementById('filter-end-date');
  if (startDateInput) startDateInput.addEventListener('change', () => renderApp());
  if (endDateInput) endDateInput.addEventListener('change', () => renderApp());

  // Dashboard Layout Builder Modal Handlers
  const builderModal = document.getElementById('dashboard-builder-modal');
  const btnOpenBuilder = document.getElementById('btn-open-dashboard-builder');
  if (btnOpenBuilder && builderModal) {
    btnOpenBuilder.addEventListener('click', async () => {
      const layout = await window.DBModule.getSetting('dashboardLayout', {
        graphs: ['donut', 'bar', 'payment', 'accounts'],
        kpis: ['transfers', 'investments', 'topsector']
      });

      document.getElementById('chk-graph-donut').checked = layout.graphs.includes('donut');
      document.getElementById('chk-graph-bar').checked = layout.graphs.includes('bar');
      document.getElementById('chk-graph-payment').checked = layout.graphs.includes('payment');
      document.getElementById('chk-graph-accounts').checked = layout.graphs.includes('accounts');

      document.getElementById('chk-kpi-transfers').checked = layout.kpis.includes('transfers');
      document.getElementById('chk-kpi-investments').checked = layout.kpis.includes('investments');
      document.getElementById('chk-kpi-topsector').checked = layout.kpis.includes('topsector');

      builderModal.classList.add('active');
    });

    document.getElementById('btn-close-dashboard-builder').addEventListener('click', () => builderModal.classList.remove('active'));
    document.getElementById('btn-cancel-dashboard-builder').addEventListener('click', () => builderModal.classList.remove('active'));

    document.getElementById('btn-save-dashboard-builder').addEventListener('click', async () => {
      const graphs = [];
      if (document.getElementById('chk-graph-donut').checked) graphs.push('donut');
      if (document.getElementById('chk-graph-bar').checked) graphs.push('bar');
      if (document.getElementById('chk-graph-payment').checked) graphs.push('payment');
      if (document.getElementById('chk-graph-accounts').checked) graphs.push('accounts');

      const kpis = [];
      if (document.getElementById('chk-kpi-transfers').checked) kpis.push('transfers');
      if (document.getElementById('chk-kpi-investments').checked) kpis.push('investments');
      if (document.getElementById('chk-kpi-topsector').checked) kpis.push('topsector');

      const newLayout = { graphs, kpis };
      await window.DBModule.saveSetting('dashboardLayout', newLayout);
      builderModal.classList.remove('active');
      renderApp();
    });
  }

  // Bank Account Session Switcher Header Dropdown
  const accountFilter = document.getElementById('global-account-filter');
  if (accountFilter) {
    accountFilter.addEventListener('change', async (e) => {
      activeAccountFilter = e.target.value;
      await window.DBModule.saveSetting('activeAccount', activeAccountFilter);
      renderApp();
    });
  }

  // Reset Account Filter Button
  const btnResetAccFilter = document.getElementById('btn-reset-account-filter');
  if (btnResetAccFilter) {
    btnResetAccFilter.addEventListener('click', async () => {
      activeAccountFilter = 'ALL';
      await window.DBModule.saveSetting('activeAccount', 'ALL');
      renderApp();
    });
  }

  // Add Bank Account Button
  const btnAddAcc = document.getElementById('btn-add-account');
  if (btnAddAcc) btnAddAcc.addEventListener('click', () => openAccountModal(null));

  // Edit Bank Account Button
  const btnEditAcc = document.getElementById('btn-edit-account');
  if (btnEditAcc) {
    btnEditAcc.addEventListener('click', () => {
      if (activeAccountFilter !== 'ALL') {
        const accToEdit = currentAccounts.find(a => a.id === activeAccountFilter);
        if (accToEdit) openAccountModal(accToEdit);
      }
    });
  }

  // Account Currency dropdown listener inside Account Modal
  const accCurrencySelect = document.getElementById('acc-currency');
  if (accCurrencySelect) {
    accCurrencySelect.addEventListener('change', (e) => {
      const prefixEl = document.getElementById('acc-currency-prefix');
      if (prefixEl) prefixEl.textContent = window.CurrencyModule.getCurrencySymbol(e.target.value);
    });
  }

  const btnCloseAccModal = document.getElementById('btn-close-account-modal');
  if (btnCloseAccModal) btnCloseAccModal.addEventListener('click', closeAccountModal);
  const btnCancelAccModal = document.getElementById('btn-cancel-account-modal');
  if (btnCancelAccModal) btnCancelAccModal.addEventListener('click', closeAccountModal);
  
  // Delete Bank Account Button Handler
  const btnDeleteAcc = document.getElementById('btn-delete-account');
  if (btnDeleteAcc) {
    btnDeleteAcc.addEventListener('click', async () => {
      const idToDelete = document.getElementById('acc-id-hidden').value;
      if (!idToDelete) return;

      if (confirm('Are you sure you want to delete this bank account profile from your database?')) {
        await window.DBModule.deleteAccount(idToDelete);
        if (window.SyncModule) window.SyncModule.deleteAccount(idToDelete);
        
        activeAccountFilter = 'ALL';
        await window.DBModule.saveSetting('activeAccount', 'ALL');
        closeAccountModal();
        if (window.SyncModule) window.SyncModule.fullSync();
        renderApp();
      }
    });
  }

  const accForm = document.getElementById('account-form');
  if (accForm) {
    accForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const currentUser = window.AuthModule ? window.AuthModule.getCurrentUser() : null;
      const idHidden = document.getElementById('acc-id-hidden').value;

      const accData = {
        userId: currentUser ? currentUser.id : 'usr_admin',
        name: document.getElementById('acc-name').value.trim(),
        bank: document.getElementById('acc-bank').value.trim(),
        type: document.getElementById('acc-type').value,
        currency: document.getElementById('acc-currency').value,
        initialBalance: Number(document.getElementById('acc-initial-balance').value) || 0
      };

      if (idHidden) {
        accData.id = idHidden;
        await window.DBModule.updateAccount(accData);
        if (window.SyncModule) window.SyncModule.pushAccount(accData);
      } else {
        const created = await window.DBModule.addAccount(accData);
        activeAccountFilter = created.id;
        await window.DBModule.saveSetting('activeAccount', activeAccountFilter);
        if (window.SyncModule) window.SyncModule.pushAccount(created);
      }

      closeAccountModal();
      if (window.SyncModule) window.SyncModule.fullSync();
      renderApp();
    });
  }

  // Inter-Account Transfer Modal Open / Close & Submit Handlers
  const btnOpenTransfer = document.getElementById('btn-open-transfer-modal');
  if (btnOpenTransfer) btnOpenTransfer.addEventListener('click', openTransferModal);
  const btnCloseTransfer = document.getElementById('btn-close-transfer-modal');
  if (btnCloseTransfer) btnCloseTransfer.addEventListener('click', closeTransferModal);
  const btnCancelTransfer = document.getElementById('btn-cancel-transfer-modal');
  if (btnCancelTransfer) btnCancelTransfer.addEventListener('click', closeTransferModal);

  const transferForm = document.getElementById('transfer-form');
  if (transferForm) {
    transferForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const currentUser = window.AuthModule ? window.AuthModule.getCurrentUser() : null;
      const fromId = document.getElementById('transfer-from-account').value;
      const toId = document.getElementById('transfer-to-account').value;

      if (fromId === toId) {
        alert('Source and Destination accounts cannot be the same! Please pick two different accounts.');
        return;
      }

      const payload = {
        userId: currentUser ? currentUser.id : 'usr_admin',
        fromAccountId: fromId,
        toAccountId: toId,
        amount: Number(document.getElementById('transfer-amount').value),
        currency: document.getElementById('transfer-currency').value,
        date: document.getElementById('transfer-date').value,
        notes: document.getElementById('transfer-notes').value.trim()
      };

      await window.DBModule.addTransfer(payload);
      closeTransferModal();
      if (window.SyncModule) window.SyncModule.fullSync();
      renderApp();
    });
  }

  // Global Currency Switcher
  const currencySelect = document.getElementById('global-currency');
  if (currencySelect) {
    currencySelect.addEventListener('change', async (e) => {
      const newCurrency = e.target.value;
      window.CurrencyModule.setActiveCurrency(newCurrency);
      await window.DBModule.saveSetting('activeCurrency', newCurrency);
      if (window.SyncModule) window.SyncModule.fullSync();
      renderApp();
    });
  }

  const btnOpenLogModal = document.getElementById('btn-open-modal');
  if (btnOpenLogModal) btnOpenLogModal.addEventListener('click', () => openExpenseModal());

  const btnCloseLogModal = document.getElementById('btn-close-modal');
  if (btnCloseLogModal) btnCloseLogModal.addEventListener('click', closeExpenseModal);
  const btnCancelLogModal = document.getElementById('btn-cancel-modal');
  if (btnCancelLogModal) btnCancelLogModal.addEventListener('click', closeExpenseModal);

  const btnExpense = document.getElementById('btn-type-expense');
  if (btnExpense) btnExpense.addEventListener('click', () => setModalType('Expense'));
  const btnIncome = document.getElementById('btn-type-income');
  if (btnIncome) btnIncome.addEventListener('click', () => setModalType('Income'));

  const expenseForm = document.getElementById('expense-form');
  if (expenseForm) {
    expenseForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleFormSubmit();
    });
  }

  const typeFilter = document.getElementById('table-type-filter');
  if (typeFilter) {
    typeFilter.addEventListener('change', (e) => {
      activeTypeFilter = e.target.value;
      renderApp();
    });
  }

  const tableSearch = document.getElementById('table-search');
  if (tableSearch) {
    tableSearch.addEventListener('input', (e) => {
      searchTerm = e.target.value.toLowerCase().trim();
      renderApp();
    });
  }

  const sectorFilter = document.getElementById('table-sector-filter');
  if (sectorFilter) {
    sectorFilter.addEventListener('change', (e) => {
      activeSectorFilter = e.target.value;
      renderApp();
    });
  }

  const sortBySelect = document.getElementById('table-sort-by');
  if (sortBySelect) {
    sortBySelect.addEventListener('change', (e) => {
      sortBy = e.target.value;
      renderApp();
    });
  }

  const chipsBar = document.getElementById('sector-chips-bar');
  if (chipsBar) {
    chipsBar.addEventListener('click', (e) => {
      if (e.target.classList.contains('chip')) {
        activeSectorFilter = e.target.getAttribute('data-sector');
        const secSelect = document.getElementById('table-sector-filter');
        if (secSelect) secSelect.value = activeSectorFilter;
        renderApp();
      }
    });
  }

  const tableBody = document.getElementById('expense-table-body');
  if (tableBody) {
    tableBody.addEventListener('click', async (e) => {
      const editBtn = e.target.closest('.btn-edit');
      const deleteBtn = e.target.closest('.btn-delete');

      if (editBtn) {
        const rawId = editBtn.getAttribute('data-id');
        const id = isNaN(rawId) ? rawId : Number(rawId);
        const item = currentExpenses.find(x => String(x.id) === String(id));
        if (item) openExpenseModal(item);
      }

      if (deleteBtn) {
        const rawId = deleteBtn.getAttribute('data-id');
        const id = isNaN(rawId) ? rawId : Number(rawId);
        await window.DBModule.deleteExpense(id);
        if (window.SyncModule) window.SyncModule.deleteExpense(id);
        await renderApp();
      }
    });
  }

  // Reset DB Modal Handlers
  const resetModal = document.getElementById('confirm-reset-modal');
  const btnClearDb = document.getElementById('btn-clear-db');
  if (btnClearDb && resetModal) {
    btnClearDb.addEventListener('click', () => resetModal.classList.add('active'));
    document.getElementById('btn-close-reset-modal').addEventListener('click', () => resetModal.classList.remove('active'));
    document.getElementById('btn-cancel-reset-modal').addEventListener('click', () => resetModal.classList.remove('active'));
    document.getElementById('btn-confirm-reset-db').addEventListener('click', async () => {
      await window.DBModule.clearAllData();
      if (window.SyncModule) await window.SyncModule.clearAllRemote();
      resetModal.classList.remove('active');
      activeAccountFilter = 'ALL';
      await renderApp();
    });
  }

  // Export Modal Handlers
  const exportModal = document.getElementById('export-modal');
  const btnExportDb = document.getElementById('btn-export-db');
  if (btnExportDb && exportModal) {
    btnExportDb.addEventListener('click', () => exportModal.classList.add('active'));
    document.getElementById('btn-close-export-modal').addEventListener('click', () => exportModal.classList.remove('active'));
    document.getElementById('btn-cancel-export-modal').addEventListener('click', () => exportModal.classList.remove('active'));

    const btnJsonAction = document.getElementById('btn-export-json-action');
    if (btnJsonAction) {
      btnJsonAction.addEventListener('click', () => {
        window.DBModule.exportDatabaseJSON();
        exportModal.classList.remove('active');
      });
    }

    const btnCsvAction = document.getElementById('btn-export-csv-action');
    if (btnCsvAction) {
      btnCsvAction.addEventListener('click', () => {
        window.DBModule.exportTransactionsCSV();
        exportModal.classList.remove('active');
      });
    }
  }

  // Import JSON File
  const importInput = document.getElementById('import-file-input');
  const btnImportDb = document.getElementById('btn-import-db');
  if (btnImportDb && importInput) {
    btnImportDb.addEventListener('click', () => {
      importInput.value = '';
      importInput.click();
    });
    importInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = async (evt) => {
          try {
            await window.DBModule.importDatabaseJSON(evt.target.result);
            if (window.SyncModule) await window.SyncModule.fullSync();
            alert('Database restored successfully and synchronized with MySQL Server!');
            await renderApp();
          } catch (err) {
            alert('Failed to import backup file: ' + err.message);
          } finally {
            importInput.value = '';
          }
        };
        reader.readAsText(file);
      }
    });
  }

  // Landing Page Form Handlers
  const landingFormLogin = document.getElementById('landing-form-login');
  const landingFormSignup = document.getElementById('landing-form-signup');
  const btnLandingGuest = document.getElementById('btn-landing-guest-explore');
  const btnLandingGoogle = document.getElementById('btn-landing-google');
  const btnRegisterToggle = document.getElementById('btn-landing-register-toggle');
  const linkForgotLanding = document.getElementById('link-forgot-password-landing');

  if (btnRegisterToggle) {
    btnRegisterToggle.addEventListener('click', () => {
      const isShowingLogin = landingFormLogin.style.display !== 'none';
      if (isShowingLogin) {
        landingFormLogin.style.display = 'none';
        landingFormSignup.style.display = 'block';
        btnRegisterToggle.textContent = 'SIGN IN';
      } else {
        landingFormLogin.style.display = 'block';
        landingFormSignup.style.display = 'none';
        btnRegisterToggle.textContent = 'REGISTER';
      }
    });
  }

  if (linkForgotLanding) {
    linkForgotLanding.addEventListener('click', (e) => {
      e.preventDefault();
      openAuthModal('reset');
    });
  }

  if (btnLandingGoogle) {
    btnLandingGoogle.addEventListener('click', () => {
      openAuthModal('login');
    });
  }

  if (landingFormLogin) {
    landingFormLogin.addEventListener('submit', async (e) => {
      e.preventDefault();
      const identifier = document.getElementById('landing-login-id').value.trim();
      const password = document.getElementById('landing-login-pwd').value;
      const feedback = document.getElementById('landing-auth-feedback');
      try {
        await window.AuthModule.login(identifier, password);
        window.isGuestModeActive = false;
        renderApp();
      } catch (err) {
        if (feedback) {
          feedback.style.display = 'block';
          feedback.className = 'badge badge-rose mb-3';
          feedback.textContent = err.message;
        }
      }
    });
  }

  if (landingFormSignup) {
    landingFormSignup.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('landing-signup-name').value.trim();
      const username = document.getElementById('landing-signup-user').value.trim();
      const email = document.getElementById('landing-signup-email').value.trim();
      const password = document.getElementById('landing-signup-pwd').value;
      const feedback = document.getElementById('landing-auth-feedback');
      try {
        await window.AuthModule.register(username, email, password, name);
        window.isGuestModeActive = false;
        renderApp();
      } catch (err) {
        if (feedback) {
          feedback.style.display = 'block';
          feedback.className = 'badge badge-rose mb-3';
          feedback.textContent = err.message;
        }
      }
    });
  }

  // Budget Modal Open/Close & Save
  const btnEditBudgets = document.getElementById('btn-edit-budgets');
  if (btnEditBudgets) {
    btnEditBudgets.addEventListener('click', openBudgetModal);
    document.getElementById('btn-close-budget-modal').addEventListener('click', closeBudgetModal);
    document.getElementById('btn-save-budgets').addEventListener('click', async () => {
      const inputs = document.getElementById('budget-inputs-list').querySelectorAll('.input-budget-sector');
      const newBudgets = {};
      inputs.forEach(inp => {
        newBudgets[inp.getAttribute('data-sector')] = Number(inp.value) || 0;
      });
      await window.DBModule.saveBudgets(newBudgets);
      if (window.SyncModule) window.SyncModule.fullSync();
      closeBudgetModal();
      renderApp();
    });
  }
}

/**
 * Transfer Modal Handlers
 */
function openTransferModal() {
  const form = document.getElementById('transfer-form');
  if (!form) return;
  form.reset();
  document.getElementById('transfer-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('transfer-currency').value = window.CurrencyModule.getActiveCurrency();
  document.getElementById('transfer-currency-prefix').textContent = window.CurrencyModule.getCurrencySymbol();

  const fromSelect = document.getElementById('transfer-from-account');
  const toSelect = document.getElementById('transfer-to-account');

  if (activeAccountFilter !== 'ALL') {
    fromSelect.value = activeAccountFilter;
  }

  const otherAcc = currentAccounts.find(a => a.id !== fromSelect.value);
  if (otherAcc) {
    toSelect.value = otherAcc.id;
  }

  document.getElementById('transfer-modal').classList.add('active');
}

function closeTransferModal() {
  const el = document.getElementById('transfer-modal');
  if (el) el.classList.remove('active');
}

/**
 * Account Modal Handlers (Add or Edit)
 */
function openAccountModal(accountToEdit = null) {
  const form = document.getElementById('account-form');
  if (!form) return;
  form.reset();

  const activeGlobalCurrency = window.CurrencyModule.getActiveCurrency();
  const accCurrencySelect = document.getElementById('acc-currency');
  const btnDelete = document.getElementById('btn-delete-account');

  if (accountToEdit) {
    const nativeCurr = accountToEdit.currency || activeGlobalCurrency;
    document.getElementById('acc-modal-title').textContent = 'Edit Bank Account Details';
    document.getElementById('acc-id-hidden').value = accountToEdit.id;
    document.getElementById('acc-name').value = accountToEdit.name;
    document.getElementById('acc-bank').value = accountToEdit.bank;
    document.getElementById('acc-type').value = accountToEdit.type || 'Checking';
    accCurrencySelect.value = nativeCurr;
    document.getElementById('acc-currency-prefix').textContent = window.CurrencyModule.getCurrencySymbol(nativeCurr);
    document.getElementById('acc-initial-balance').value = accountToEdit.initialBalance || 0;
    document.getElementById('btn-submit-acc').textContent = 'Update Account Details';
    if (btnDelete) btnDelete.style.display = 'inline-flex';
  } else {
    document.getElementById('acc-modal-title').textContent = 'Add New Bank Account Profile';
    document.getElementById('acc-id-hidden').value = '';
    accCurrencySelect.value = activeGlobalCurrency;
    document.getElementById('acc-currency-prefix').textContent = window.CurrencyModule.getCurrencySymbol(activeGlobalCurrency);
    document.getElementById('acc-initial-balance').value = 0;
    document.getElementById('btn-submit-acc').textContent = 'Create Account Profile';
    if (btnDelete) btnDelete.style.display = 'none';
  }

  document.getElementById('account-modal').classList.add('active');
}

function closeAccountModal() {
  const el = document.getElementById('account-modal');
  if (el) el.classList.remove('active');
}

/**
 * Set modal transaction type (Expense vs Income)
 */
function setModalType(type = 'Expense') {
  document.getElementById('form-type').value = type;

  const btnExpense = document.getElementById('btn-type-expense');
  const btnIncome = document.getElementById('btn-type-income');

  if (type === 'Income') {
    if (btnIncome) btnIncome.classList.add('active');
    if (btnExpense) btnExpense.classList.remove('active');
  } else {
    if (btnExpense) btnExpense.classList.add('active');
    if (btnIncome) btnIncome.classList.remove('active');
  }

  updateFormSectorOptions(type);
}

/**
 * Modal Handling
 */
function openExpenseModal(expenseToEdit = null) {
  const modal = document.getElementById('expense-modal');
  const form = document.getElementById('expense-form');
  if (!modal || !form) return;

  form.reset();
  document.getElementById('form-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('form-currency').value = window.CurrencyModule.getActiveCurrency();
  document.getElementById('form-currency-prefix').textContent = window.CurrencyModule.getCurrencySymbol();

  if (activeAccountFilter !== 'ALL') {
    document.getElementById('form-account').value = activeAccountFilter;
  }

  if (expenseToEdit) {
    const type = expenseToEdit.type || 'Expense';
    document.getElementById('modal-title').textContent = type === 'Income' ? 'Edit Income Deposit' : 'Edit Expense Record';
    document.getElementById('form-id').value = expenseToEdit.id;
    setModalType(type);

    document.getElementById('form-account').value = expenseToEdit.accountId || 'acc_primary';
    document.getElementById('form-title').value = expenseToEdit.title;
    document.getElementById('form-amount').value = expenseToEdit.amount;
    document.getElementById('form-currency').value = expenseToEdit.currency || 'USD';
    updateFormSectorOptions(type, expenseToEdit.sector);
    document.getElementById('form-sector').value = expenseToEdit.sector;
    document.getElementById('form-payment').value = expenseToEdit.paymentMethod || 'Bank Transfer';
    document.getElementById('form-date').value = expenseToEdit.date;
    document.getElementById('form-recurring').value = expenseToEdit.recurring || 'One-time';
    document.getElementById('form-status').value = expenseToEdit.status || 'Completed';
    document.getElementById('form-notes').value = expenseToEdit.notes || '';
  } else {
    document.getElementById('modal-title').textContent = 'Log Financial Entry';
    document.getElementById('form-id').value = '';
    setModalType('Expense');
  }

  modal.classList.add('active');
}

function closeExpenseModal() {
  const el = document.getElementById('expense-modal');
  if (el) el.classList.remove('active');
}

async function handleFormSubmit() {
  const currentUser = window.AuthModule ? window.AuthModule.getCurrentUser() : null;
  const idStr = document.getElementById('form-id').value;

  const payload = {
    userId: currentUser ? currentUser.id : 'usr_admin',
    accountId: document.getElementById('form-account').value,
    title: document.getElementById('form-title').value.trim(),
    amount: Number(document.getElementById('form-amount').value),
    currency: document.getElementById('form-currency').value,
    type: document.getElementById('form-type').value,
    sector: document.getElementById('form-sector').value,
    paymentMethod: document.getElementById('form-payment').value,
    date: document.getElementById('form-date').value,
    recurring: document.getElementById('form-recurring').value,
    status: document.getElementById('form-status').value,
    notes: document.getElementById('form-notes').value.trim()
  };

  let saved;
  if (idStr) {
    payload.id = isNaN(idStr) ? idStr : Number(idStr);
    saved = await window.DBModule.updateExpense(payload);
  } else {
    saved = await window.DBModule.addExpense(payload);
  }

  if (window.SyncModule) {
    window.SyncModule.pushExpense(saved || payload);
  }

  closeExpenseModal();
  renderApp();
}

/**
 * Budget Modal Handlers
 */
async function openBudgetModal() {
  const container = document.getElementById('budget-inputs-list');
  if (!container) return;
  const budgets = await window.DBModule.getBudgets();
  const symbol = window.CurrencyModule.getCurrencySymbol('USD');

  container.innerHTML = Object.keys(window.DBModule.SECTORS).map(sec => {
    const val = budgets[sec] || 500;
    return `
      <div class="form-group">
        <label>${sec} Limit (${symbol})</label>
        <input type="number" min="0" class="input-text input-budget-sector" data-sector="${sec}" value="${val}">
      </div>
    `;
  }).join('');

  document.getElementById('budget-modal').classList.add('active');
}

function closeBudgetModal() {
  const el = document.getElementById('budget-modal');
  if (el) el.classList.remove('active');
}

/**
 * Helper: XSS Security Escape
 */
function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}
