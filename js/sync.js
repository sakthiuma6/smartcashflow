/**
 * SmartCashflow Client Sync Module - Primary MySQL Server Synchronizer (localhost:3306)
 * Strict Ground Truth: Clean MySQL server states completely clear local IndexedDB.
 */

window.SyncModule = (() => {
  const SERVER_URL = 'http://localhost:8081';
  let isServerOnline = false;
  let syncInProgress = false;

  /**
   * Healthcheck to test if Primary MySQL Server Gateway is online
   */
  async function checkServerStatus() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${SERVER_URL}/api/status`, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        isServerOnline = data.status === 'online';
        updateSyncBadge(true, data.database, data.engine);
        return true;
      }
    } catch (err) {
      isServerOnline = false;
      updateSyncBadge(false);
      return false;
    }
  }

  /**
   * Update Status Badge in Header UI & Reset DB button visibility (ADMIN ONLY)
   */
  function updateSyncBadge(online, dbName = 'smartcashflow_db', engine = 'MySQL Server 9.x (localhost:3306)') {
    const badge = document.getElementById('sql-sync-badge');
    const resetBtn = document.getElementById('btn-clear-db');

    // Reset DB button is strictly restricted to Admin users when online
    const isAdminUser = window.AuthModule ? window.AuthModule.isAdmin() : false;
    if (resetBtn) {
      resetBtn.style.display = (online && isAdminUser) ? 'inline-flex' : 'none';
    }

    if (!badge) return;
    badge.style.display = 'none'; // MySQL info hidden from header as requested

    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  /**
   * Wipes remote MySQL database tables completely (Admin Only)
   */
  async function clearAllRemote() {
    try {
      await fetch(`${SERVER_URL}/api/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expenses: [], accounts: [], settings: {} })
      });
      console.log('🧹 Remote MySQL database cleared!');
    } catch (err) {
      console.warn('Error clearing remote MySQL database:', err);
    }
  }

  /**
   * Pushes full imported dataset directly to MySQL Server
   */
  async function pushImportedData(payload) {
    if (!isServerOnline) await checkServerStatus();
    try {
      const res = await fetch(`${SERVER_URL}/api/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        console.log('✅ Imported data pushed to MySQL server database!');
      }
    } catch (err) {
      console.warn('Error pushing imported data to MySQL:', err);
    }
  }

  /**
   * Full Sync: PULLS MySQL Server -> IndexedDB first.
   */
  async function fullSync() {
    if (syncInProgress) return;
    syncInProgress = true;

    try {
      const online = await checkServerStatus();
      if (!online) {
        syncInProgress = false;
        return;
      }

      // 1. PULL MySQL Server data FIRST as ground truth
      const pullRes = await fetch(`${SERVER_URL}/api/sync`);
      if (pullRes.ok) {
        const serverData = await pullRes.json();
        
        // Handle Expenses Ground Truth
        if (Array.isArray(serverData.expenses)) {
          if (serverData.expenses.length === 0) {
            await window.DBModule.clearAllExpenses();
          } else {
            const localExpenses = await window.DBModule.getAllExpenses();
            for (const item of serverData.expenses) {
              const exists = localExpenses.some(x => String(x.id) === String(item.id));
              if (!exists) {
                await window.DBModule.addExpense(item);
              }
            }
          }
        }

        // Handle Bank Accounts Ground Truth
        if (Array.isArray(serverData.accounts)) {
          if (serverData.accounts.length === 0) {
            const localAccounts = await window.DBModule.getAccounts();
            for (const acc of localAccounts) {
              await window.DBModule.deleteAccount(acc.id);
            }
          } else {
            const localAccounts = await window.DBModule.getAccounts();
            for (const acc of serverData.accounts) {
              const exists = localAccounts.some(x => String(x.id) === String(acc.id));
              if (!exists) {
                await window.DBModule.updateAccount(acc);
              }
            }
          }
        }
      }

      // 2. Gather local IndexedDB records after pull
      const localExpenses = await window.DBModule.getAllExpenses();
      const localAccounts = await window.DBModule.getAccounts();
      const localBudgets = await window.DBModule.getBudgets();
      const activeCurr = window.CurrencyModule.getActiveCurrency();

      const payload = {
        expenses: localExpenses,
        accounts: localAccounts,
        settings: {
          budgets: localBudgets,
          activeCurrency: activeCurr
        }
      };

      // 3. Push current state to MySQL Server
      const pushRes = await fetch(`${SERVER_URL}/api/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (pushRes.ok) {
        console.log('✅ Synchronized state with Primary MySQL Database (smartcashflow_db)');
      }
    } catch (err) {
      console.warn('MySQL Sync encounter:', err);
    } finally {
      syncInProgress = false;
    }
  }

  /**
   * Push single expense change to MySQL Server
   */
  async function pushExpense(expenseItem) {
    if (!isServerOnline) return;
    try {
      await fetch(`${SERVER_URL}/api/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(expenseItem)
      });
    } catch (err) {
      console.warn('MySQL expense push error:', err);
    }
  }

  /**
   * Push single expense deletion to MySQL Server
   */
  async function deleteExpense(expenseId) {
    if (!isServerOnline) return;
    try {
      await fetch(`${SERVER_URL}/api/expenses/${expenseId}`, {
        method: 'DELETE'
      });
    } catch (err) {
      console.warn('MySQL expense deletion push error:', err);
    }
  }

  /**
   * Push single account change to MySQL Server
   */
  async function pushAccount(accountItem) {
    if (!isServerOnline) return;
    try {
      await fetch(`${SERVER_URL}/api/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(accountItem)
      });
    } catch (err) {
      console.warn('MySQL account push error:', err);
    }
  }

  /**
   * Push single account deletion to MySQL Server
   */
  async function deleteAccount(accountId) {
    if (!isServerOnline) return;
    try {
      await fetch(`${SERVER_URL}/api/accounts/${accountId}`, {
        method: 'DELETE'
      });
    } catch (err) {
      console.warn('MySQL account deletion push error:', err);
    }
  }

  return {
    checkServerStatus,
    fullSync,
    pushImportedData,
    clearAllRemote,
    pushExpense,
    deleteExpense,
    pushAccount,
    deleteAccount,
    isOnline: () => isServerOnline
  };
})();
