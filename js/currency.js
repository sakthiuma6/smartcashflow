/**
 * SmartCashflow Currency & Exchange Module - INR (₹) Default Base
 */

const CURRENCY_CONFIG = {
  INR: { symbol: '₹', name: 'Indian Rupee', rateToUSD: 0.012 },
  USD: { symbol: '$', name: 'US Dollar', rateToUSD: 1.0 },
  EUR: { symbol: '€', name: 'Euro', rateToUSD: 1.08 },
  GBP: { symbol: '£', name: 'British Pound', rateToUSD: 1.27 },
  JPY: { symbol: '¥', name: 'Japanese Yen', rateToUSD: 0.0066 },
  CAD: { symbol: '$', name: 'Canadian Dollar', rateToUSD: 0.74 },
  AUD: { symbol: '$', name: 'Australian Dollar', rateToUSD: 0.65 }
};

// Instantly load from localStorage if available (DEFAULT: INR)
let activeGlobalCurrency = localStorage.getItem('omni_active_currency') || 'INR';

/**
 * Gets the current active currency symbol
 */
function getCurrencySymbol(code = activeGlobalCurrency) {
  return CURRENCY_CONFIG[code]?.symbol || '₹';
}

/**
 * Sets the active global currency & persists to localStorage
 */
function setActiveCurrency(code) {
  if (CURRENCY_CONFIG[code]) {
    activeGlobalCurrency = code;
    try {
      localStorage.setItem('omni_active_currency', code);
    } catch (e) {
      console.warn('LocalStorage error:', e);
    }
  }
}

/**
 * Gets active currency code
 */
function getActiveCurrency() {
  return activeGlobalCurrency;
}

/**
 * Convert an expense amount from its item currency into the target global currency
 */
function convertCurrency(amount, fromCurrency = 'INR', toCurrency = activeGlobalCurrency) {
  if (!amount || isNaN(amount)) return 0;
  if (fromCurrency === toCurrency) return Number(amount);

  const fromRate = CURRENCY_CONFIG[fromCurrency]?.rateToUSD || 0.012;
  const toRate = CURRENCY_CONFIG[toCurrency]?.rateToUSD || 0.012;

  // Convert to USD first, then convert to target currency
  const usdAmount = Number(amount) * fromRate;
  const targetAmount = usdAmount / toRate;
  return targetAmount;
}

/**
 * Format currency value with symbol and regional number separators
 */
function formatCurrency(amount, code = activeGlobalCurrency) {
  const symbol = getCurrencySymbol(code);
  const val = Number(amount) || 0;
  
  if (code === 'INR') {
    return symbol + ' ' + val.toLocaleString('en-IN', {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2
    });
  }

  return symbol + ' ' + val.toLocaleString('en-US', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2
  });
}

window.CurrencyModule = {
  CURRENCY_CONFIG,
  getCurrencySymbol,
  setActiveCurrency,
  getActiveCurrency,
  convertCurrency,
  formatCurrency
};
