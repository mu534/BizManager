import { Money } from "@shared/money";

/** Format minor-unit integers for display, e.g. 123450 → "ETB 1,234.50". */
export function formatMoney(minor: number, currency: string): string {
  return Money.format(minor, currency);
}

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Addis_Ababa" });
const TIME = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Africa/Addis_Ababa" });

export const formatDate = (d: Date | string | number): string => DATE.format(new Date(d));
export const formatTime = (d: Date | string | number): string => TIME.format(new Date(d));
export const formatDateTime = (d: Date | string | number): string => `${formatDate(d)}, ${formatTime(d)}`;
