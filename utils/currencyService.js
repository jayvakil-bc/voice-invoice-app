const axios = require('axios');

/**
 * Currency Service
 * Handles currency conversion and exchange rates
 */

// Cache exchange rates to avoid excessive API calls
let cachedRates = null;
let cacheTimestamp = null;
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

/**
 * Supported currencies with symbols
 */
const CURRENCIES = {
  USD: { symbol: '$', name: 'US Dollar' },
  EUR: { symbol: '€', name: 'Euro' },
  GBP: { symbol: '£', name: 'British Pound' },
  INR: { symbol: '₹', name: 'Indian Rupee' },
  CAD: { symbol: 'C$', name: 'Canadian Dollar' },
  AUD: { symbol: 'A$', name: 'Australian Dollar' },
  JPY: { symbol: '¥', name: 'Japanese Yen' },
  CNY: { symbol: '¥', name: 'Chinese Yuan' },
  CHF: { symbol: 'Fr', name: 'Swiss Franc' },
  SGD: { symbol: 'S$', name: 'Singapore Dollar' },
  HKD: { symbol: 'HK$', name: 'Hong Kong Dollar' },
  NZD: { symbol: 'NZ$', name: 'New Zealand Dollar' },
  SEK: { symbol: 'kr', name: 'Swedish Krona' },
  NOK: { symbol: 'kr', name: 'Norwegian Krone' },
  MXN: { symbol: '$', name: 'Mexican Peso' },
  BRL: { symbol: 'R$', name: 'Brazilian Real' },
  ZAR: { symbol: 'R', name: 'South African Rand' },
  AED: { symbol: 'د.إ', name: 'UAE Dirham' }
};

/**
 * Get exchange rates from API
 * Uses exchangerate-api.io (free tier: 1500 requests/month)
 * @param {string} baseCurrency - Base currency code (default: USD)
 * @returns {Promise<Object>} Exchange rates
 */
const getExchangeRates = async (baseCurrency = 'USD') => {
  // Check cache
  const now = Date.now();
  if (cachedRates && cacheTimestamp && (now - cacheTimestamp < CACHE_DURATION)) {
    return cachedRates;
  }

  try {
    const apiKey = process.env.EXCHANGE_RATE_API_KEY;
    let url;

    if (apiKey) {
      // Use API key if provided
      url = `https://v6.exchangerate-api.com/v6/${apiKey}/latest/${baseCurrency}`;
    } else {
      // Use free endpoint (limited to 1500 requests/month)
      url = `https://open.er-api.com/v6/latest/${baseCurrency}`;
    }

    const response = await axios.get(url, { timeout: 5000 });
    
    if (response.data && response.data.rates) {
      cachedRates = response.data.rates;
      cacheTimestamp = now;
      console.log(`✅ Fetched exchange rates (base: ${baseCurrency})`);
      return cachedRates;
    } else {
      throw new Error('Invalid API response');
    }
  } catch (error) {
    console.error('❌ Error fetching exchange rates:', error.message);
    
    // Return cached rates if available, even if expired
    if (cachedRates) {
      console.warn('⚠️  Using expired exchange rates');
      return cachedRates;
    }
    
    // Fallback: return basic rates with USD = 1
    console.warn('⚠️  Using fallback exchange rates');
    return {
      USD: 1,
      EUR: 0.92,
      GBP: 0.79,
      INR: 83.12,
      CAD: 1.36,
      AUD: 1.53,
      JPY: 149.5,
      CNY: 7.24
    };
  }
};

/**
 * Convert amount from one currency to another
 * @param {number} amount - Amount to convert
 * @param {string} fromCurrency - Source currency
 * @param {string} toCurrency - Target currency
 * @returns {Promise<number>} Converted amount
 */
const convertCurrency = async (amount, fromCurrency, toCurrency) => {
  if (fromCurrency === toCurrency) {
    return amount;
  }

  try {
    const rates = await getExchangeRates(fromCurrency);
    const rate = rates[toCurrency];
    
    if (!rate) {
      throw new Error(`Exchange rate not found for ${toCurrency}`);
    }

    return amount * rate;
  } catch (error) {
    console.error('❌ Currency conversion error:', error);
    throw error;
  }
};

/**
 * Get currency symbol
 * @param {string} currencyCode - Currency code (e.g., 'USD')
 * @returns {string} Currency symbol
 */
const getCurrencySymbol = (currencyCode) => {
  return CURRENCIES[currencyCode]?.symbol || currencyCode;
};

/**
 * Get currency name
 * @param {string} currencyCode - Currency code
 * @returns {string} Currency name
 */
const getCurrencyName = (currencyCode) => {
  return CURRENCIES[currencyCode]?.name || currencyCode;
};

/**
 * Get list of supported currencies
 * @returns {Array} List of currency objects
 */
const getSupportedCurrencies = () => {
  return Object.keys(CURRENCIES).map(code => ({
    code,
    symbol: CURRENCIES[code].symbol,
    name: CURRENCIES[code].name
  }));
};

/**
 * Format amount with currency symbol
 * @param {number} amount - Amount to format
 * @param {string} currencyCode - Currency code
 * @returns {string} Formatted amount
 */
const formatCurrency = (amount, currencyCode = 'USD') => {
  const symbol = getCurrencySymbol(currencyCode);
  const formatted = amount.toFixed(2);
  
  // Some currencies have symbol after amount
  if (['EUR', 'SEK', 'NOK'].includes(currencyCode)) {
    return `${formatted} ${symbol}`;
  }
  
  return `${symbol}${formatted}`;
};

/**
 * Validate currency code
 * @param {string} currencyCode - Currency code to validate
 * @returns {boolean} True if valid
 */
const isValidCurrency = (currencyCode) => {
  return CURRENCIES.hasOwnProperty(currencyCode);
};

module.exports = {
  getExchangeRates,
  convertCurrency,
  getCurrencySymbol,
  getCurrencyName,
  getSupportedCurrencies,
  formatCurrency,
  isValidCurrency,
  CURRENCIES
};
