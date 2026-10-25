/** CSV primitives — pure. */

/** Neutralise spreadsheet formula injection and quote per RFC 4180. */
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

export function csvCell(value: string | number | null): string {
  if (value === null) return "";
  let s = String(value);
  // A plain (possibly negative) number such as "-5.00" cannot be a formula and must
  // stay numeric — a loss must not turn into text. Anything else that starts with a
  // formula character ("-2+3", "=A1", "+x", "@SUM") is neutralised.
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s) && !PLAIN_NUMBER.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Major-unit decimal string from minor units, without floating point. */
export function minorToDecimal(minor: number): string {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Basis points as a percentage string with two decimals ("12.50"); "" for null. */
export function bpsToPercent(bps: number | null): string {
  if (bps === null) return "";
  const sign = bps < 0 ? "-" : "";
  const abs = Math.abs(bps);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function csvRow(cells: readonly (string | number | null)[]): string {
  return cells.map(csvCell).join(",");
}

export const MANAGEMENT_REPORT_NOTE = "Management report - not a certified accounting statement";
