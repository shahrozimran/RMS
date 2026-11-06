/**
 * Currency formatting utilities.
 * Reads the global currency setting from system_settings.
 */

export interface CurrencyConfig {
  code: string     // e.g. "USD"
  symbol: string   // e.g. "$"
  locale: string   // e.g. "en-US"
}

/** Supported currency options for admin selection */
export const SUPPORTED_CURRENCIES: CurrencyConfig[] = [
  { code: 'USD', symbol: '$',  locale: 'en-US' },
  { code: 'EUR', symbol: '€',  locale: 'de-DE' },
  { code: 'GBP', symbol: '£',  locale: 'en-GB' },
  { code: 'INR', symbol: '₹',  locale: 'en-IN' },
  { code: 'SAR', symbol: 'SR', locale: 'ar-SA' },
  { code: 'AED', symbol: 'د.إ',locale: 'ar-AE' },
  { code: 'JPY', symbol: '¥',  locale: 'ja-JP' },
  { code: 'CAD', symbol: 'CA$',locale: 'en-CA' },
  { code: 'AUD', symbol: 'A$', locale: 'en-AU' },
  { code: 'CHF', symbol: 'Fr', locale: 'de-CH' },
  { code: 'MYR', symbol: 'RM', locale: 'ms-MY' },
  { code: 'SGD', symbol: 'S$', locale: 'en-SG' },
  { code: 'PKR', symbol: '₨',  locale: 'ur-PK' },
  { code: 'BDT', symbol: '৳',  locale: 'bn-BD' },
  { code: 'TRY', symbol: '₺',  locale: 'tr-TR' },
  { code: 'EGP', symbol: 'E£', locale: 'ar-EG' },
]

/** Default fallback */
export const DEFAULT_CURRENCY: CurrencyConfig = SUPPORTED_CURRENCIES[0]

// Formatter construction is expensive. Reuse the formatter, never formatted
// amounts or restaurant data. Bound the cache for arbitrary saved settings.
const formatters = new Map<string, Intl.NumberFormat>()

/**
 * Format a numeric amount as a currency string.
 * @param amount - The number to format
 * @param currency - CurrencyConfig (from system_settings or default)
 */
export function formatCurrency(
  amount: number | string | null | undefined,
  currency: CurrencyConfig = DEFAULT_CURRENCY
): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : (amount ?? 0)
  if (isNaN(num)) return `${currency.symbol}0.00`

  try {
    const key = JSON.stringify([currency.locale, currency.code])
    let formatter = formatters.get(key)
    if (!formatter) {
      formatter = new Intl.NumberFormat(currency.locale, {
        style: 'currency',
        currency: currency.code,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
      if (formatters.size >= 32) formatters.clear()
      formatters.set(key, formatter)
    }
    return formatter.format(num)
  } catch {
    return `${currency.symbol}${num.toFixed(2)}`
  }
}

/**
 * Parse a currency string back to a number.
 */
export function parseCurrencyAmount(value: string): number {
  return parseFloat(value.replace(/[^0-9.-]+/g, '')) || 0
}
