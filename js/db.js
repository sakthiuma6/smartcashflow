/**
 * SmartCashflow Local Database Module - IndexedDB Persistence via Dexie.js
 * Supports Multi-Account Profiles, Double-Entry Transfers, Sector Budgets, Dynamic Settings & Backups
 */

const SECTORS = {
  'Shopping': { icon: 'shopping-cart', color: '#ec4899', badgeClass: 'badge-pink' },
  'Investments': { icon: 'trending-up', color: '#6366f1', badgeClass: 'badge-indigo' },
  'Rent': { icon: 'home', color: '#f59e0b', badgeClass: 'badge-amber' },
  'Credit Card Bills': { icon: 'credit-card', color: '#f43f5e', badgeClass: 'badge-rose' },
  'Utilities': { icon: 'zap', color: '#06b6d4', badgeClass: 'badge-cyan' },
  'Food & Dining': { icon: 'utensils', color: '#10b981', badgeClass: 'badge-emerald' },
  'Travel': { icon: 'plane', color: '#3b82f6', badgeClass: 'badge-blue' },
  'Healthcare': { icon: 'activity', color: '#8b5cf6', badgeClass: 'badge-purple' },
  'Entertainment': { icon: 'film', color: '#a855f7', badgeClass: 'badge-purple' },
  'Others': { icon: 'package', color: '#94a3b8', badgeClass: 'badge-slate' }
};

const INCOME_SECTORS = {
  'Salary': { icon: 'briefcase', color: '#10b981', badgeClass: 'badge-emerald' },
  'Investment Returns': { icon: 'trending-up', color: '#6366f1', badgeClass: 'badge-indigo' },
  'Freelance & Side Hustle': { icon: 'laptop', color: '#06b6d4', badgeClass: 'badge-cyan' },
  'Bonus & Grants': { icon: 'gift', color: '#ec4899', badgeClass: 'badge-pink' },
  'Refunds & Cashbacks': { icon: 'rotate-ccw', color: '#3b82f6', badgeClass: 'badge-blue' },
  'Other Income': { icon: 'coins', color: '#64748b', badgeClass: 'badge-slate' }
};

let db = null;

/**
 * Initialize Dexie IndexedDB Database
 */
async function initDatabase() {
  try {
    if (window.Dexie) {
      db = new window.Dexie('SmartCashflowDB');
      db.version(4).stores({
        expenses: 'id, userId, accountId, date, sector, type, currency, amount, paymentMethod, status',
        accounts: 'id, userId, name, bank, type, currency',
        budgets: 'sector',
        settings: 'key'
      });
      await db.open();
      console.log('✅ IndexedDB (SmartCashflowDB) initialized cleanly.');

      // Ensure default Primary Bank Account exists
      const accountsCount = await db.accounts.count();
      if (accountsCount === 0) {
        await db.accounts.add({
          id: 'acc_primary',
          userId: 'usr_admin',
          name: 'Primary Checking',
          bank: 'Default Bank',
          type: 'Checking',
          currency: 'INR',
          initialBalance: 0
        });
      }
    }
  } catch (err) {
    console.warn('IndexedDB initialization fallback to LocalStorage:', err);
    db = null;
  }
}

/**
 * Expense Data Access Methods
 */
async function getAllExpenses() {
  if (db) {
    const items = await db.expenses.toArray();
    return items.map(item => ({
      ...item,
      amount: Number(item.amount) || 0
    }));
  }
  const stored = localStorage.getItem('expenses');
  return stored ? JSON.parse(stored) : [];
}

async function addExpense(expenseData) {
  const currentUser = window.AuthModule ? window.AuthModule.getCurrentUser() : null;
  const currentUserId = currentUser ? currentUser.id : 'usr_admin';

  const newItem = {
    id: expenseData.id || ('exp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4)),
    userId: expenseData.userId || expenseData.user_id || currentUserId,
    accountId: expenseData.accountId || 'acc_primary',
    title: expenseData.title,
    amount: Number(expenseData.amount) || 0,
    currency: expenseData.currency || window.CurrencyModule.getActiveCurrency(),
    type: expenseData.type || 'Expense',
    sector: expenseData.sector || 'Others',
    paymentMethod: expenseData.paymentMethod || 'Bank Transfer',
    date: expenseData.date || new Date().toISOString().split('T')[0],
    recurring: expenseData.recurring || 'One-time',
    status: expenseData.status || 'Completed',
    notes: expenseData.notes || ''
  };

  if (db) {
    await db.expenses.put(newItem);
  } else {
    const list = await getAllExpenses();
    list.unshift(newItem);
    localStorage.setItem('expenses', JSON.stringify(list));
  }
  return newItem;
}

async function updateExpense(expenseData) {
  const currentUser = window.AuthModule ? window.AuthModule.getCurrentUser() : null;
  const currentUserId = currentUser ? currentUser.id : 'usr_admin';

  const updatedItem = {
    ...expenseData,
    userId: expenseData.userId || expenseData.user_id || currentUserId,
    amount: Number(expenseData.amount) || 0
  };

  if (db) {
    await db.expenses.put(updatedItem);
  } else {
    const list = await getAllExpenses();
    const idx = list.findIndex(x => String(x.id) === String(updatedItem.id));
    if (idx !== -1) {
      list[idx] = updatedItem;
      localStorage.setItem('expenses', JSON.stringify(list));
    }
  }
  return updatedItem;
}

async function deleteExpense(id) {
  if (db) {
    await db.expenses.delete(id);
  } else {
    const list = await getAllExpenses();
    const filtered = list.filter(x => String(x.id) !== String(id));
    localStorage.setItem('expenses', JSON.stringify(filtered));
  }
}

async function clearAllExpenses() {
  if (db) {
    await db.expenses.clear();
  } else {
    localStorage.removeItem('expenses');
  }
}

async function clearAllData() {
  if (db) {
    await db.expenses.clear();
    await db.accounts.clear();
  }
  localStorage.removeItem('expenses');
  localStorage.removeItem('accounts');
}

/**
 * Bank Account Profile Methods
 */
async function getAccounts() {
  if (db) {
    const list = await db.accounts.toArray();
    if (list.length === 0) {
      const defaultAcc = {
        id: 'acc_primary',
        userId: 'usr_admin',
        name: 'Primary Checking',
        bank: 'Default Bank',
        type: 'Checking',
        currency: 'INR',
        initialBalance: 0
      };
      await db.accounts.add(defaultAcc);
      return [defaultAcc];
    }
    return list.map(a => ({
      ...a,
      initialBalance: Number(a.initialBalance) || 0
    }));
  }
  const stored = localStorage.getItem('accounts');
  if (!stored) {
    const defaultAccs = [{
      id: 'acc_primary',
      userId: 'usr_admin',
      name: 'Primary Checking',
      bank: 'Default Bank',
      type: 'Checking',
      currency: 'INR',
      initialBalance: 0
    }];
    localStorage.setItem('accounts', JSON.stringify(defaultAccs));
    return defaultAccs;
  }
  return JSON.parse(stored);
}

async function addAccount(accData) {
  const currentUser = window.AuthModule ? window.AuthModule.getCurrentUser() : null;
  const currentUserId = currentUser ? currentUser.id : 'usr_admin';

  const newAcc = {
    id: accData.id || ('acc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4)),
    userId: accData.userId || accData.user_id || currentUserId,
    name: accData.name,
    bank: accData.bank,
    type: accData.type || 'Checking',
    currency: accData.currency || window.CurrencyModule.getActiveCurrency(),
    initialBalance: Number(accData.initialBalance) || 0
  };

  if (db) {
    await db.accounts.put(newAcc);
  } else {
    const list = await getAccounts();
    list.push(newAcc);
    localStorage.setItem('accounts', JSON.stringify(list));
  }
  return newAcc;
}

async function updateAccount(acc) {
  const currentUser = window.AuthModule ? window.AuthModule.getCurrentUser() : null;
  const currentUserId = currentUser ? currentUser.id : 'usr_admin';

  const updatedAcc = {
    ...acc,
    userId: acc.userId || acc.user_id || currentUserId,
    initialBalance: Number(acc.initialBalance) || 0
  };

  if (db) {
    await db.accounts.put(updatedAcc);
  } else {
    const list = await getAccounts();
    const idx = list.findIndex(x => String(x.id) === String(acc.id));
    if (idx !== -1) list[idx] = updatedAcc;
    localStorage.setItem('accounts', JSON.stringify(list));
  }
  return updatedAcc;
}

async function deleteAccount(accId) {
  if (db) {
    await db.accounts.delete(accId);
  } else {
    const list = await getAccounts();
    const filtered = list.filter(x => String(x.id) !== String(accId));
    localStorage.setItem('accounts', JSON.stringify(filtered));
  }
}

/**
 * Double-Entry Inter-Account Transfers
 */
async function addTransfer(transferData) {
  const { fromAccountId, toAccountId, amount, currency, date, notes } = transferData;

  const accounts = await getAccounts();
  const fromAcc = accounts.find(a => a.id === fromAccountId);
  const toAcc = accounts.find(a => a.id === toAccountId);

  const fromName = fromAcc ? fromAcc.name : 'Source Account';
  const toName = toAcc ? toAcc.name : 'Destination Account';

  const transferOutItem = {
    id: 'tr_out_' + Date.now(),
    accountId: fromAccountId,
    title: `Transfer OUT -> ${toName}`,
    amount: amount,
    currency: currency,
    type: 'Expense',
    sector: 'Others',
    paymentMethod: 'Bank Transfer',
    date: date,
    recurring: 'One-time',
    status: 'Completed',
    notes: notes ? `Self-transfer: ${notes}` : `Self-transfer to ${toName}`
  };

  const transferInItem = {
    id: 'tr_in_' + Date.now() + '_2',
    accountId: toAccountId,
    title: `Transfer IN <- ${fromName}`,
    amount: amount,
    currency: currency,
    type: 'Income',
    sector: 'Other Income',
    paymentMethod: 'Bank Transfer',
    date: date,
    recurring: 'One-time',
    status: 'Completed',
    notes: notes ? `Self-transfer: ${notes}` : `Self-transfer from ${fromName}`
  };

  await addExpense(transferOutItem);
  await addExpense(transferInItem);
  return { transferOutItem, transferInItem };
}

/**
 * Budget & Monthly Income Allocation Methods
 */
async function getBudgets() {
  if (db) {
    const list = await db.budgets.toArray();
    const map = {};
    list.forEach(b => { map[b.sector] = b.limit; });
    return map;
  }
  return JSON.parse(localStorage.getItem('budgets') || '{}');
}

async function saveBudgets(budgetMap) {
  if (db) {
    await db.budgets.clear();
    const items = Object.entries(budgetMap).map(([sector, limit]) => ({ sector, limit }));
    await db.budgets.bulkPut(items);
  } else {
    localStorage.setItem('budgets', JSON.stringify(budgetMap));
  }
}

async function getMonthlyBudgetPlan(monthKey) {
  const key = monthKey || new Date().toISOString().slice(0, 7);
  const plan = await getSetting('budget_plan_' + key, null);
  if (plan) return plan;

  const legacyBudgets = await getBudgets();
  const plannedIncome = await getSetting('planned_income_' + key, 0);
  return {
    month: key,
    plannedIncome: plannedIncome || 0,
    budgets: legacyBudgets
  };
}

async function saveMonthlyBudgetPlan(monthKey, plan) {
  const key = monthKey || new Date().toISOString().slice(0, 7);
  await saveSetting('budget_plan_' + key, plan);
  if (plan.budgets) {
    await saveBudgets(plan.budgets);
  }
  if (plan.plannedIncome !== undefined) {
    await saveSetting('planned_income_' + key, plan.plannedIncome);
  }
}

/**
 * Setting Persistence Methods
 */
async function getSetting(key, defaultValue = null) {
  if (db) {
    const res = await db.settings.get(key);
    return res ? res.value : defaultValue;
  }
  const val = localStorage.getItem('setting_' + key);
  return val !== null ? JSON.parse(val) : defaultValue;
}

async function saveSetting(key, value) {
  if (db) {
    await db.settings.put({ key, value });
  } else {
    localStorage.setItem('setting_' + key, JSON.stringify(value));
  }
}

/**
 * Clean JSON Export & Import Backup Methods
 */
async function exportDatabaseJSON() {
  const expenses = await getAllExpenses();
  const accounts = await getAccounts();
  const budgets = await getBudgets();

  const exportData = {
    app: 'SmartCashflow',
    version: '2.5.0',
    exportDate: new Date().toISOString(),
    accounts,
    expenses,
    budgets
  };

  const jsonStr = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `SmartCashflow_Backup_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * CSV Spreadsheet Export
 */
async function exportTransactionsCSV() {
  const expenses = await getAllExpenses();
  const accounts = await getAccounts();
  const accMap = {};
  accounts.forEach(a => { accMap[a.id] = a.name; });

  const headers = ['Date', 'Account', 'Title', 'Type', 'Sector', 'Payment Method', 'Amount', 'Currency', 'Status', 'Notes'];
  
  const rows = expenses.map(item => [
    `"${item.date || ''}"`,
    `"${accMap[item.accountId] || 'Primary Account'}"`,
    `"${(item.title || '').replace(/"/g, '""')}"`,
    `"${item.type || 'Expense'}"`,
    `"${item.sector || 'Others'}"`,
    `"${item.paymentMethod || 'Bank Transfer'}"`,
    item.amount || 0,
    `"${item.currency || 'INR'}"`,
    `"${item.status || 'Completed'}"`,
    `"${(item.notes || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const downloadAnchor = document.createElement('a');
  downloadAnchor.href = url;
  downloadAnchor.download = `SmartCashflow_Transactions_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

/**
 * Robust JSON Data Backup Import Function
 */
async function importDatabaseJSON(jsonString) {
  const data = (typeof jsonString === 'object') ? jsonString : JSON.parse(jsonString);

  const currentUser = window.AuthModule ? window.AuthModule.getCurrentUser() : null;
  const currentUserId = currentUser ? currentUser.id : 'usr_admin';

  let formattedExpenses = [];
  let formattedAccounts = [];

  if (data.expenses && Array.isArray(data.expenses)) {
    formattedExpenses = data.expenses.map(item => ({
      ...item,
      id: item.id || ('exp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4)),
      userId: currentUserId,
      user_id: currentUserId,
      amount: Number(item.amount) || 0
    }));

    if (db) {
      await db.expenses.clear();
      await db.expenses.bulkPut(formattedExpenses);
    } else {
      localStorage.setItem('expenses', JSON.stringify(formattedExpenses));
    }
  }

  if (data.accounts && Array.isArray(data.accounts)) {
    formattedAccounts = data.accounts.map(acc => ({
      ...acc,
      id: acc.id || ('acc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4)),
      userId: currentUserId,
      user_id: currentUserId,
      initialBalance: Number(acc.initialBalance) || 0
    }));

    if (db) {
      await db.accounts.clear();
      await db.accounts.bulkPut(formattedAccounts);
    } else {
      localStorage.setItem('accounts', JSON.stringify(formattedAccounts));
    }
  }

  if (data.budgets && typeof data.budgets === 'object') {
    await saveBudgets(data.budgets);
  }

  if (data.settings && typeof data.settings === 'object') {
    for (const [key, value] of Object.entries(data.settings)) {
      await saveSetting(key, value);
    }
  }

  // Auto-detect & update active global currency from imported records (Defaults to INR)
  let detectedCurrency = 'INR';
  if (data.settings && data.settings.activeCurrency) {
    detectedCurrency = data.settings.activeCurrency;
  } else if (data.accounts && data.accounts.length > 0 && data.accounts[0].currency) {
    detectedCurrency = data.accounts[0].currency;
  } else if (data.expenses && data.expenses.length > 0 && data.expenses[0].currency) {
    detectedCurrency = data.expenses[0].currency;
  }

  if (window.CurrencyModule) {
    window.CurrencyModule.setActiveCurrency(detectedCurrency);
  }
  await saveSetting('activeCurrency', detectedCurrency);

  const payloadToSync = {
    expenses: formattedExpenses,
    accounts: formattedAccounts,
    settings: {
      activeCurrency: detectedCurrency,
      budgets: data.budgets || {}
    }
  };

  // Push imported data to remote MySQL server gateway FIRST, then fullSync
  if (window.SyncModule) {
    await window.SyncModule.pushImportedData(payloadToSync);
    await window.SyncModule.fullSync();
  }
}

window.DBModule = {
  SECTORS,
  INCOME_SECTORS,
  initDatabase,
  getAllExpenses,
  addExpense,
  updateExpense,
  deleteExpense,
  clearAllExpenses,
  clearAllData,
  getAccounts,
  addAccount,
  updateAccount,
  deleteAccount,
  addTransfer,
  getBudgets,
  saveBudgets,
  getMonthlyBudgetPlan,
  saveMonthlyBudgetPlan,
  getSetting,
  saveSetting,
  exportDatabaseJSON,
  exportTransactionsCSV,
  importDatabaseJSON
};
