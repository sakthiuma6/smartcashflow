/**
 * OmniExpense Chart.js Visualizations Module - Modular Graph Engine
 */

let donutChartInstance = null;
let barChartInstance = null;
let paymentChartInstance = null;
let accountChartInstance = null;

/**
 * Initializes or updates the Sector Donut Chart
 */
function updateSectorDonutChart(sectorTotals) {
  const canvas = document.getElementById('chart-sector-donut');
  if (!canvas || !window.Chart) return;

  const labels = Object.keys(sectorTotals);
  const data = Object.values(sectorTotals);
  const colors = labels.map(sector => window.DBModule.SECTORS[sector]?.color || '#94a3b8');

  // If no data logged, show a placeholder ring
  const hasData = data.some(val => val > 0);
  const chartLabels = hasData ? labels : ['No Data Logged'];
  const chartData = hasData ? data : [1];
  const chartColors = hasData ? colors : ['rgba(255, 255, 255, 0.08)'];

  if (donutChartInstance) {
    donutChartInstance.destroy();
  }

  const ctx = canvas.getContext('2d');
  donutChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: chartLabels,
      datasets: [{
        data: chartData,
        backgroundColor: chartColors,
        borderWidth: 2,
        borderColor: '#0b0f17',
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '72%',
      plugins: {
        legend: {
          display: true,
          position: 'right',
          labels: {
            color: '#94a3b8',
            font: { family: 'Plus Jakarta Sans', size: 12 },
            padding: 12,
            usePointStyle: true,
            pointStyle: 'circle'
          }
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.9)',
          titleColor: '#f8fafc',
          bodyColor: '#94a3b8',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          padding: 12,
          displayColors: true,
          callbacks: {
            label: function(context) {
              if (!hasData) return ' Log expenses to view breakdown';
              const val = context.raw || 0;
              const formatted = window.CurrencyModule.formatCurrency(val);
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const pct = ((val / total) * 100).toFixed(1);
              return ` ${context.label}: ${formatted} (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

/**
 * Initializes or updates the Sector Spend Bar Chart
 */
function updateSectorBarChart(sectorTotals) {
  const canvas = document.getElementById('chart-sector-bar');
  if (!canvas || !window.Chart) return;

  const labels = Object.keys(sectorTotals);
  const data = Object.values(sectorTotals);
  const colors = labels.map(sector => window.DBModule.SECTORS[sector]?.color || '#6366f1');

  if (barChartInstance) {
    barChartInstance.destroy();
  }

  const ctx = canvas.getContext('2d');
  barChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Total Spent',
        data: data,
        backgroundColor: colors.map(c => c + 'CC'),
        borderColor: colors,
        borderWidth: 1.5,
        borderRadius: 6,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.9)',
          titleColor: '#f8fafc',
          bodyColor: '#94a3b8',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          padding: 12,
          callbacks: {
            label: function(context) {
              return ` Amount: ${window.CurrencyModule.formatCurrency(context.raw)}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#94a3b8', font: { family: 'Plus Jakarta Sans', size: 11 } }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: {
            color: '#94a3b8',
            font: { family: 'Plus Jakarta Sans', size: 11 },
            callback: function(val) {
              return window.CurrencyModule.getCurrencySymbol() + val;
            }
          }
        }
      }
    }
  });
}

/**
 * Initializes or updates Payment Method Breakdown Donut Chart
 */
function updatePaymentMethodChart(expenses, globalCurrency) {
  const canvas = document.getElementById('chart-payment-method');
  if (!canvas || !window.Chart) return;

  const map = {};
  expenses.forEach(e => {
    if ((e.type || 'Expense') === 'Expense') {
      const pm = e.paymentMethod || 'Bank Transfer';
      const converted = window.CurrencyModule.convertCurrency(e.amount, e.currency || 'USD', globalCurrency);
      map[pm] = (map[pm] || 0) + converted;
    }
  });

  const labels = Object.keys(map).length > 0 ? Object.keys(map) : ['No Data'];
  const data = Object.values(map).length > 0 ? Object.values(map) : [1];
  const colors = ['#6366f1', '#10b981', '#f59e0b', '#06b6d4', '#ec4899', '#a855f7'];

  if (paymentChartInstance) paymentChartInstance.destroy();

  const ctx = canvas.getContext('2d');
  paymentChartInstance = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: colors,
        borderWidth: 2,
        borderColor: '#0b0f17'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'right', labels: { color: '#94a3b8' } }
      }
    }
  });
}

/**
 * Initializes or updates Account Balances Comparison Chart
 */
function updateAccountBalanceChart(accounts, expenses, globalCurrency) {
  const canvas = document.getElementById('chart-account-balances');
  if (!canvas || !window.Chart) return;

  const labels = accounts.map(a => a.name);
  const data = accounts.map(acc => {
    let opening = window.CurrencyModule.convertCurrency(acc.initialBalance || 0, acc.currency || 'USD', globalCurrency);
    let net = opening;
    expenses.forEach(e => {
      if ((e.accountId || 'acc_primary') === acc.id) {
        const amt = window.CurrencyModule.convertCurrency(e.amount, e.currency || 'USD', globalCurrency);
        if ((e.type || 'Expense') === 'Income') net += amt;
        else net -= amt;
      }
    });
    return net;
  });

  if (accountChartInstance) accountChartInstance.destroy();

  const ctx = canvas.getContext('2d');
  accountChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Net Balance',
        data: data,
        backgroundColor: data.map(v => v >= 0 ? '#10b981CC' : '#f43f5eCC'),
        borderColor: data.map(v => v >= 0 ? '#10b981' : '#f43f5e'),
        borderWidth: 1.5,
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#94a3b8' } },
        y: { ticks: { color: '#94a3b8' } }
      }
    }
  });
}

// Export Chart utilities
window.ChartModule = {
  updateSectorDonutChart,
  updateSectorBarChart,
  updatePaymentMethodChart,
  updateAccountBalanceChart
};
