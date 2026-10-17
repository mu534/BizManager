/**
 * Money utility — the ONLY place in the codebase that converts between
 * integer database values and display strings (UD-005).
 *
 * Storage convention:
 *   All monetary amounts in the database are integers representing the
 *   smallest currency unit. For ETB: 1 ETB = 100 units (santim).
 *   Example: 100.50 ETB is stored as 10050.
 *
 * Rules:
 *   1. No code outside this module may divide or multiply amounts by a
 *      currency's subunit factor. Always call Money.* functions.
 *   2. All arithmetic uses integer operations — no floats.
 *   3. Formatting (toDisplayString, format) is purely presentational.
 *      Formatted strings must never be parsed back into DB values.
 *   4. When receiving user input (e.g. "100.50" in a form), convert
 *      to integer units via Money.fromMajorUnits() before storing.
 */

/**
 * The number of subunits per major unit for each supported currency.
 * Add entries here as new markets are supported — do not hard-code
 * this factor anywhere else in the codebase.
 */
const SUBUNITS_PER_MAJOR: Record<string, number> = {
  ETB: 100, // Ethiopian Birr → santim
  USD: 100, // US Dollar → cent
  EUR: 100, // Euro → cent
  GBP: 100, // British Pound → penny
  KES: 100, // Kenyan Shilling → cent
  UGX: 1, // Ugandan Shilling (no subunit in practice)
  TZS: 100, // Tanzanian Shilling → cent
  NGN: 100, // Nigerian Naira → kobo
  ZAR: 100, // South African Rand → cent
};

/**
 * Returns the subunit factor for a currency (e.g. 100 for ETB).
 * Defaults to 100 for unknown currencies.
 */
function getSubunitFactor(currency: string): number {
  return SUBUNITS_PER_MAJOR[currency.toUpperCase()] ?? 100;
}

/**
 * Converts a major-unit value (from user input) to the integer storage unit.
 *
 * @example
 * Money.fromMajorUnits(100.50, 'ETB') // → 10050
 * Money.fromMajorUnits(1,     'ETB') // → 100
 *
 * Uses Math.round to avoid floating-point artifacts (e.g. 100.1 * 100 = 10009.999...).
 */
function fromMajorUnits(amount: number, currency: string): number {
  const factor = getSubunitFactor(currency);
  return Math.round(amount * factor);
}

/**
 * Converts an integer storage value to major units (for display or decimal math).
 *
 * Avoid using the result in further monetary arithmetic — stay in integer space.
 * This is intended only for formatting.
 *
 * @example
 * Money.toMajorUnits(10050, 'ETB') // → 100.50
 */
function toMajorUnits(amount: number, currency: string): number {
  const factor = getSubunitFactor(currency);
  return amount / factor;
}

/**
 * Formats an integer storage value as a human-readable currency string.
 *
 * @example
 * Money.format(10050, 'ETB') // → "ETB 100.50"  (or locale-appropriate)
 * Money.format(0,     'ETB') // → "ETB 0.00"
 *
 * @param amount   Integer storage value (e.g. 10050 for 100.50 ETB)
 * @param currency ISO 4217 currency code (e.g. "ETB")
 * @param locale   BCP 47 locale string (defaults to "en-ET" for ETB, "en-US" otherwise)
 */
function format(
  amount: number,
  currency: string,
  locale?: string,
): string {
  const resolvedLocale = locale ?? (currency === "ETB" ? "en-ET" : "en-US");
  const majorValue = toMajorUnits(amount, currency);
  try {
    return new Intl.NumberFormat(resolvedLocale, {
      style: "currency",
      currency: currency.toUpperCase(),
      minimumFractionDigits: getSubunitFactor(currency) === 1 ? 0 : 2,
      maximumFractionDigits: getSubunitFactor(currency) === 1 ? 0 : 2,
    }).format(majorValue);
  } catch {
    // Fallback for unsupported currency codes in Intl
    const decimals = getSubunitFactor(currency) === 1 ? 0 : 2;
    return `${currency.toUpperCase()} ${majorValue.toFixed(decimals)}`;
  }
}

/**
 * Formats an integer storage value as a plain decimal string (no currency symbol).
 * Useful for form inputs, exports, and contexts where the symbol is shown separately.
 *
 * @example
 * Money.toDecimalString(10050, 'ETB') // → "100.50"
 * Money.toDecimalString(100,   'ETB') // → "1.00"
 */
function toDecimalString(amount: number, currency: string): string {
  const decimals = getSubunitFactor(currency) === 1 ? 0 : 2;
  return toMajorUnits(amount, currency).toFixed(decimals);
}

/**
 * Parses a decimal string from user input into an integer storage value.
 * Returns null if the input is not a valid non-negative number.
 *
 * @example
 * Money.parseInput("100.50", 'ETB') // → 10050
 * Money.parseInput("100",    'ETB') // → 10000
 * Money.parseInput("abc",    'ETB') // → null
 * Money.parseInput("-5",     'ETB') // → null
 */
function parseInput(input: string, currency: string): number | null {
  const trimmed = input.trim().replace(/,/g, "");
  const parsed = parseFloat(trimmed);
  if (isNaN(parsed) || parsed < 0 || !isFinite(parsed)) return null;
  return fromMajorUnits(parsed, currency);
}

// ── Integer arithmetic (all inputs and outputs are integer storage values) ──

/**
 * Adds two integer storage amounts.
 * @example Money.add(10050, 5025) // → 15075
 */
function add(a: number, b: number): number {
  return a + b;
}

/**
 * Subtracts b from a (integer storage values).
 * @example Money.subtract(10050, 5025) // → 5025
 */
function subtract(a: number, b: number): number {
  return a - b;
}

/**
 * Multiplies an integer storage amount by a plain integer quantity.
 * Use this for price × quantity calculations.
 *
 * @example
 * Money.multiply(2500, 3) // → 7500  (25.00 ETB × 3 items = 75.00 ETB)
 */
function multiply(amount: number, quantity: number): number {
  return Math.round(amount * quantity);
}

/**
 * Calculates a percentage of an integer storage amount, rounded to the
 * nearest integer storage unit.
 *
 * @param amount     Integer storage value (e.g. 10050)
 * @param percentage Percentage as a plain number (e.g. 10 for 10%)
 *
 * @example
 * Money.percentage(10050, 10) // → 1005  (10% of 100.50 = 10.05)
 * Money.percentage(10050, 5)  // →  503  (5%  of 100.50 =  5.025, rounded to 5.03)
 */
function percentage(amount: number, pct: number): number {
  return Math.round((amount * pct) / 100);
}

/**
 * Returns true if the amount is zero.
 */
function isZero(amount: number): boolean {
  return amount === 0;
}

/**
 * Returns true if the amount is negative (e.g. a refund or correction).
 */
function isNegative(amount: number): boolean {
  return amount < 0;
}

/**
 * Clamps an amount to a minimum of zero.
 * Useful when calculating final totals where discounts could otherwise go negative.
 */
function clampPositive(amount: number): number {
  return Math.max(0, amount);
}

/**
 * Calculates the sum of an array of integer storage values.
 * @example Money.sum([10050, 5025, 2000]) // → 17075
 */
function sum(amounts: number[]): number {
  return amounts.reduce((acc, n) => acc + n, 0);
}

// ── Named export object ───────────────────────────────────────────────────────

/**
 * The canonical Money utility.
 *
 * Import as: `import { Money } from '@shared/money'`
 *
 * All functions that touch monetary values in this codebase must route
 * through this object. No inline division by 100, no `parseFloat` on
 * amounts, no `toFixed` on amounts outside of this module.
 */
export const Money = {
  fromMajorUnits,
  toMajorUnits,
  format,
  toDecimalString,
  parseInput,
  add,
  subtract,
  multiply,
  percentage,
  isZero,
  isNegative,
  clampPositive,
  sum,
  getSubunitFactor,
} as const;
