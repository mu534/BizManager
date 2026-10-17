/**
 * Business-day handling — pure functions.
 *
 * Previously every "today" / daily bucket used UTC, so for an Ethiopian
 * business (UTC+3, no DST) the "day" rolled over at 03:00 local time and
 * sales between 00:00–03:00 were attributed to the previous day.
 *
 * The schema has no per-business timezone, so a fixed UTC offset is derived
 * from the business country. Countries not listed fall back to UTC. If a
 * timezone column is added later, only businessUtcOffsetMinutes() changes.
 */

const OFFSET_MINUTES_BY_COUNTRY: Readonly<Record<string, number>> = {
  ET: 180, // Ethiopia (EAT)
  KE: 180, // Kenya
  UG: 180, // Uganda
  TZ: 180, // Tanzania
  NG: 60, // Nigeria (WAT)
  ZA: 120, // South Africa (SAST)
};

export function businessUtcOffsetMinutes(country: string | null | undefined): number {
  return OFFSET_MINUTES_BY_COUNTRY[(country ?? "").toUpperCase()] ?? 0;
}

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDayKey(value: string | undefined | null): value is string {
  if (!value || !DAY_KEY_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value);
}

/** Local calendar date (YYYY-MM-DD) of an instant in the business timezone. */
export function businessDayKey(instant: Date, offsetMinutes: number): string {
  return new Date(instant.getTime() + offsetMinutes * MS_PER_MINUTE)
    .toISOString()
    .slice(0, 10);
}

/** The UTC instant at which a local calendar day begins. */
export function startOfBusinessDay(dayKey: string, offsetMinutes: number): Date {
  return new Date(
    new Date(`${dayKey}T00:00:00.000Z`).getTime() - offsetMinutes * MS_PER_MINUTE,
  );
}

/** The last millisecond of a local calendar day, as a UTC instant. */
export function endOfBusinessDay(dayKey: string, offsetMinutes: number): Date {
  return new Date(startOfBusinessDay(dayKey, offsetMinutes).getTime() + MS_PER_DAY - 1);
}

export function addDays(dayKey: string, days: number): string {
  return new Date(new Date(`${dayKey}T00:00:00.000Z`).getTime() + days * MS_PER_DAY)
    .toISOString()
    .slice(0, 10);
}

/** Inclusive list of day keys from `fromKey` to `toKey`. */
export function enumerateDays(fromKey: string, toKey: string): string[] {
  const days: string[] = [];
  for (let d = fromKey; d <= toKey; d = addDays(d, 1)) days.push(d);
  return days;
}

export type ReportRange = "today" | "7days" | "month" | "custom";

export interface ResolvedPeriod {
  fromKey: string;
  toKey: string;
  /** Inclusive UTC instants for timestamp columns (createdAt). */
  from: Date;
  to: Date;
  /** UTC-midnight dates for @db.Date columns (expenseDate). */
  fromDate: Date;
  toDate: Date;
}

export const MAX_REPORT_DAYS = 366;

/**
 * Resolve a report range into inclusive business-day bounds.
 * Invalid or oversized custom ranges fall back to "today" rather than
 * throwing, so a malformed query string never produces a 500.
 */
export function resolvePeriod(
  input: { range?: ReportRange; from?: string; to?: string },
  offsetMinutes: number,
  now: Date = new Date(),
): ResolvedPeriod {
  const todayKey = businessDayKey(now, offsetMinutes);
  let fromKey = todayKey;
  let toKey = todayKey;

  if (input.range === "7days") {
    fromKey = addDays(todayKey, -6);
  } else if (input.range === "month") {
    fromKey = `${todayKey.slice(0, 8)}01`;
  } else if (input.range === "custom" && isDayKey(input.from) && isDayKey(input.to)) {
    const [a, b] = input.from <= input.to ? [input.from, input.to] : [input.to, input.from];
    const span = enumerateDaysCount(a, b);
    if (span <= MAX_REPORT_DAYS) {
      fromKey = a;
      toKey = b;
    }
  }

  return {
    fromKey,
    toKey,
    from: startOfBusinessDay(fromKey, offsetMinutes),
    to: endOfBusinessDay(toKey, offsetMinutes),
    fromDate: new Date(`${fromKey}T00:00:00.000Z`),
    toDate: new Date(`${toKey}T00:00:00.000Z`),
  };
}

function enumerateDaysCount(fromKey: string, toKey: string): number {
  return (
    Math.round(
      (new Date(`${toKey}T00:00:00.000Z`).getTime() -
        new Date(`${fromKey}T00:00:00.000Z`).getTime()) /
        MS_PER_DAY,
    ) + 1
  );
}
