/**
 * Expense Manager — Centralized Country & Currency Registry
 * Phase 2: User Preferences & Multi-Country Configuration Layer
 * 
 * Defines sovereign country configurations, currency rules, flag graphics,
 * starter wallets, and standard categories for JP (Japan), IN (India), and DE (Germany).
 */

(function (global) {
    'use strict';

    const COUNTRY_CONFIG = Object.freeze({
        JP: Object.freeze({
            code: 'JP',
            name: 'Japan',
            nativeName: '日本',
            currency: '¥',
            currencyCode: 'JPY',
            locale: 'ja-JP',
            fractionDigits: 0,
            symbolPosition: 'before', // '¥1,000'
            flagSvg: '<svg class="country-flag-svg flag-jp" viewBox="0 0 640 480" width="18" height="13.5" style="border-radius:2px;box-shadow:0 0 0 1px rgba(255,255,255,0.14);vertical-align:middle;display:inline-block;flex-shrink:0;" aria-label="Japan"><rect width="640" height="480" fill="#ffffff"/><circle cx="320" cy="240" r="120" fill="#bc002d"/></svg>',
            defaultWallets: Object.freeze([
                { id: 'Salary Account', name: 'Salary Account', type: 'bank', region: 'JP', currency: '¥', color: '#009944' },
                { id: 'Cash', name: 'Cash', type: 'cash', region: 'JP', currency: '¥', color: '#d4af37' },
                { id: 'PayPay', name: 'PayPay', type: 'digital', region: 'JP', currency: '¥', color: '#ff0033' }
            ]),
            defaultCategories: Object.freeze([
                { id: 'jp-food', name: 'Food & Groceries', icon: 'shopping-basket', budget: 0 },
                { id: 'jp-dining', name: 'Dining Out', icon: 'utensils', budget: 0 },
                { id: 'jp-transport', name: 'Transport', icon: 'train-front', budget: 0 },
                { id: 'jp-utility-electric', name: 'Electricity', icon: 'zap', budget: 0 },
                { id: 'jp-utility-gas', name: 'Gas', icon: 'flame', budget: 0 },
                { id: 'jp-utility-water', name: 'Water', icon: 'droplet', budget: 0 },
                { id: 'jp-utility-internet', name: 'Internet', icon: 'wifi', budget: 0 },
                { id: 'jp-shopping', name: 'Shopping', icon: 'shopping-bag', budget: 0 },
                { id: 'jp-entertainment', name: 'Entertainment', icon: 'gamepad-2', budget: 0 },
                { id: 'jp-health', name: 'Health', icon: 'heart-pulse', budget: 0 },
                { id: 'jp-personal-care', name: 'Personal Care', icon: 'scissors', budget: 0 },
                { id: 'jp-subscriptions', name: 'Subscriptions', icon: 'smartphone', budget: 0 },
                { id: 'jp-tax', name: 'Tax & Fees', icon: 'file-text', budget: 0 },
                { id: 'jp-misc', name: 'Miscellaneous', icon: 'wrench', budget: 0 }
            ])
        }),

        IN: Object.freeze({
            code: 'IN',
            name: 'India',
            nativeName: 'भारत',
            currency: '₹',
            currencyCode: 'INR',
            locale: 'en-IN',
            fractionDigits: 2,
            symbolPosition: 'before', // '₹1,000.00'
            flagSvg: '<svg class="country-flag-svg flag-in" viewBox="0 0 640 480" width="18" height="13.5" style="border-radius:2px;box-shadow:0 0 0 1px rgba(255,255,255,0.14);vertical-align:middle;display:inline-block;flex-shrink:0;" aria-label="India"><path fill="#f4f5f8" d="M0 160h640v160H0z"/><path fill="#ff9933" d="M0 0h640v160H0z"/><path fill="#138808" d="M0 320h640v160H0z"/><circle cx="320" cy="240" r="40" fill="#000080"/><circle cx="320" cy="240" r="32" fill="#ffffff"/><circle cx="320" cy="240" r="8" fill="#000080"/></svg>',
            defaultWallets: Object.freeze([
                { id: 'Bank Account', name: 'Bank Account', type: 'bank', region: 'IN', currency: '₹', color: '#97144d' },
                { id: 'Cash', name: 'Cash', type: 'cash', region: 'IN', currency: '₹', color: '#d4af37' }
            ]),
            defaultCategories: Object.freeze([
                { id: 'in-petrol', name: 'Petrol & Fuel', icon: 'fuel', budget: 0 },
                { id: 'in-loan', name: 'Loan EMI', icon: 'landmark', budget: 0 },
                { id: 'in-home', name: 'Home Needs', icon: 'home', budget: 0 },
                { id: 'in-rent', name: 'Rent', icon: 'home', budget: 0 },
                { id: 'in-medicine', name: 'Medicine & Health', icon: 'pill', budget: 0 },
                { id: 'in-eb', name: 'EB / Utility Bills', icon: 'zap', budget: 0 },
                { id: 'in-recharge', name: 'Mobile Recharge', icon: 'smartphone', budget: 0 },
                { id: 'in-ration', name: 'Ration & Groceries', icon: 'shopping-basket', budget: 0 },
                { id: 'in-misc', name: 'Miscellaneous', icon: 'wrench', budget: 0 }
            ])
        }),

        DE: Object.freeze({
            code: 'DE',
            name: 'Germany',
            nativeName: 'Deutschland',
            currency: '€',
            currencyCode: 'EUR',
            locale: 'de-DE',
            fractionDigits: 2,
            symbolPosition: 'before', // '€1.234,50' or '1.234,50 €'
            flagSvg: '<svg class="country-flag-svg flag-de" viewBox="0 0 640 480" width="18" height="13.5" style="border-radius:2px;box-shadow:0 0 0 1px rgba(255,255,255,0.14);vertical-align:middle;display:inline-block;flex-shrink:0;" aria-label="Germany"><rect width="640" height="160" y="0" fill="#000000"/><rect width="640" height="160" y="160" fill="#dd0000"/><rect width="640" height="160" y="320" fill="#ffce00"/></svg>',
            defaultWallets: Object.freeze([
                { id: 'Girokonto', name: 'Girokonto (Checking)', type: 'bank', region: 'DE', currency: '€', color: '#1e3a8a' },
                { id: 'Bargeld', name: 'Bargeld (Cash)', type: 'cash', region: 'DE', currency: '€', color: '#d4af37' }
            ]),
            defaultCategories: Object.freeze([
                { id: 'de-groceries', name: 'Groceries & Supermarket', icon: 'shopping-basket', budget: 0 },
                { id: 'de-dining', name: 'Dining & Cafes', icon: 'utensils', budget: 0 },
                { id: 'de-transport', name: 'Public Transit & DB', icon: 'train-front', budget: 0 },
                { id: 'de-rent', name: 'Rent & Warmmiete', icon: 'home', budget: 0 },
                { id: 'de-utilities', name: 'Electricity & Heating', icon: 'zap', budget: 0 },
                { id: 'de-internet', name: 'Internet & Mobile', icon: 'wifi', budget: 0 },
                { id: 'de-insurance', name: 'Insurance (Versicherung)', icon: 'shield-check', budget: 0 },
                { id: 'de-health', name: 'Health & Pharmacy', icon: 'pill', budget: 0 },
                { id: 'de-leisure', name: 'Leisure & Subscriptions', icon: 'gamepad-2', budget: 0 },
                { id: 'de-shopping', name: 'Shopping & Household', icon: 'shopping-bag', budget: 0 },
                { id: 'de-misc', name: 'Miscellaneous', icon: 'wrench', budget: 0 }
            ])
        })
    });

    const CountryConfig = {
        /**
         * The frozen sovereign configurations for JP, IN, DE.
         */
        REGISTRY: COUNTRY_CONFIG,

        /**
         * Get configuration for a specific country code.
         * @param {string} code - 'JP', 'IN', 'DE'
         * @returns {Object|null}
         */
        get(code) {
            if (!code || typeof code !== 'string') return null;
            return COUNTRY_CONFIG[code.toUpperCase()] || null;
        },

        /**
         * Get array of all supported country configurations.
         * @returns {Array<Object>}
         */
        getAll() {
            return Object.values(COUNTRY_CONFIG);
        },

        /**
         * Get array of all supported country codes.
         * @returns {Array<string>} ['JP', 'IN', 'DE']
         */
        getSupportedCodes() {
            return Object.keys(COUNTRY_CONFIG);
        },

        /**
         * Check if a country code is supported.
         * @param {string} code
         * @returns {boolean}
         */
        isValidCountry(code) {
            return typeof code === 'string' && Object.prototype.hasOwnProperty.call(COUNTRY_CONFIG, code.toUpperCase());
        },

        /**
         * Resolve ISO-like currency code from country code or currency symbol.
         * @param {string} identifier - 'JP', 'JPY', 'IN', 'INR', 'DE', 'EUR', '¥', '₹', '€'
         * @returns {string} Currency code 'JPY', 'INR', 'EUR'
         */
        getCurrencyCode(identifier) {
            if (!identifier) return 'JPY';
            const clean = identifier.trim().toUpperCase();
            if (clean === 'JP' || clean === 'JPY' || clean === '¥') return 'JPY';
            if (clean === 'IN' || clean === 'INR' || clean === '₹') return 'INR';
            if (clean === 'DE' || clean === 'EUR' || clean === '€') return 'EUR';
            return clean;
        },

        /**
         * Resolve currency symbol from country code or currency code.
         * @param {string} identifier - 'JP', 'JPY', 'IN', 'INR', 'DE', 'EUR', '¥', '₹', '€'
         * @returns {string} Currency symbol
         */
        getCurrency(identifier) {
            if (!identifier) return '¥';
            const clean = identifier.trim().toUpperCase();
            if (clean === 'JP' || clean === 'JPY' || clean === '¥') return '¥';
            if (clean === 'IN' || clean === 'INR' || clean === '₹') return '₹';
            if (clean === 'DE' || clean === 'EUR' || clean === '€') return '€';
            return identifier;
        },

        /**
         * Resolve country code from currency symbol or currency code.
         * @param {string} currencyOrSymbol
         * @returns {string} Country code 'JP', 'IN', 'DE'
         */
        getCountryFromCurrency(currencyOrSymbol) {
            if (!currencyOrSymbol) return 'JP';
            const clean = currencyOrSymbol.trim().toUpperCase();
            if (clean === '¥' || clean === 'JPY') return 'JP';
            if (clean === '₹' || clean === 'INR') return 'IN';
            if (clean === '€' || clean === 'EUR') return 'DE';
            return 'JP';
        },

        /**
         * Format a financial amount according to sovereign currency precision rules.
         * @param {number} amount
         * @param {string} countryOrCurrency - 'JP', 'IN', 'DE', '¥', '₹', '€'
         * @param {Object} [options]
         * @param {string} [options.prefix] - e.g. '+' or '-'
         * @param {boolean} [options.hideCurrency] - omit symbol
         * @returns {string}
         */
        formatAmount(amount, countryOrCurrency = 'JP', options = {}) {
            const num = Number(amount) || 0;
            const country = this.get(countryOrCurrency) || this.get(this.getCountryFromCurrency(countryOrCurrency)) || COUNTRY_CONFIG.JP;
            const prefix = options.prefix || '';
            const symbol = options.hideCurrency ? '' : country.currency;

            let formattedNumber;
            if (country.fractionDigits === 0) {
                formattedNumber = Math.round(num).toLocaleString(country.locale);
            } else {
                formattedNumber = num.toLocaleString(country.locale, {
                    minimumFractionDigits: country.fractionDigits,
                    maximumFractionDigits: country.fractionDigits
                });
            }

            return `${prefix}${symbol}${formattedNumber}`;
        },

        /**
         * Return deep copy of default starter wallets for a country.
         * @param {string} countryCode
         * @returns {Array<Object>}
         */
        getDefaultWallets(countryCode) {
            const c = this.get(countryCode);
            if (!c) return [];
            return JSON.parse(JSON.stringify(c.defaultWallets));
        },

        /**
         * Return deep copy of default starter categories for a country.
         * @param {string} countryCode
         * @returns {Array<Object>}
         */
        getDefaultCategories(countryCode) {
            const c = this.get(countryCode);
            if (!c) return [];
            return JSON.parse(JSON.stringify(c.defaultCategories));
        },

        /**
         * Return SVG flag markup for a country.
         * @param {string} countryCode
         * @param {number} [width=18]
         * @param {number} [height=13.5]
         * @returns {string}
         */
        getFlagSvg(countryCode, width = 18, height = 13.5) {
            const c = this.get(countryCode);
            if (!c) return '';
            return c.flagSvg
                .replace(/width="[0-9.]+"/, `width="${width}"`)
                .replace(/height="[0-9.]+"/, `height="${height}"`);
        }
    };

    // Expose to window global scope
    global.CountryConfig = CountryConfig;

    // CommonJS / Node export for isolated test runners
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { COUNTRY_CONFIG, CountryConfig };
    }

})(typeof window !== 'undefined' ? window : globalThis);
