/**
 * Subscription access rules — pure, no I/O, no clock access.
 *
 * Callers pass `now`. On the server this is the server clock, never a value
 * supplied by the browser, so a client cannot extend access by changing its
 * device date.
 *
 * Lifecycle:
 *   ACTIVE  ──(period end)──▶  GRACE (3 days, writes still allowed, notice shown)
 *   GRACE   ──(grace end)───▶  READ_ONLY (reads + export only, no new transactions)
 *   NONE    : no paid (or legacy-trial) period has ever been approved → READ_ONLY
 *   CANCELLED / SUSPENDED : read-only immediately
 * Business data is never deleted by any of these transitions.
 */

export const GRACE_PERIOD_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

export type AccessState = "NONE" | "ACTIVE" | "GRACE" | "READ_ONLY" | "CANCELLED" | "SUSPENDED";

export interface SubscriptionSnapshot {
  /** Stored status. TRIAL is a legacy value honoured until its end date. */
  status: "TRIAL" | "ACTIVE" | "PAST_DUE" | "CANCELLED" | "EXPIRED";
  currentPeriodEnd: Date;
  trialEndsAt: Date | null;
}

export interface AccessDecision {
  state: AccessState;
  /** New business transactions (sales, expenses, stock changes, products). */
  canWrite: boolean;
  /** Viewing records and exporting data is allowed in every state. */
  canRead: true;
  canExport: true;
  periodEndsAt: Date | null;
  graceEndsAt: Date | null;
  /** Whole days left in the current period (ACTIVE) or grace window (GRACE). */
  daysRemaining: number | null;
}

export function graceEnd(periodEnd: Date): Date {
  return new Date(periodEnd.getTime() + GRACE_PERIOD_DAYS * DAY_MS);
}

function wholeDaysUntil(target: Date, now: Date): number {
  return Math.max(0, Math.ceil((target.getTime() - now.getTime()) / DAY_MS));
}

export function decideAccess(
  sub: SubscriptionSnapshot | null,
  businessSuspended: boolean,
  now: Date,
): AccessDecision {
  const base = { canRead: true, canExport: true } as const;

  if (businessSuspended) {
    return { ...base, state: "SUSPENDED", canWrite: false, periodEndsAt: null, graceEndsAt: null, daysRemaining: null };
  }
  if (!sub) {
    return { ...base, state: "NONE", canWrite: false, periodEndsAt: null, graceEndsAt: null, daysRemaining: null };
  }
  if (sub.status === "CANCELLED") {
    return { ...base, state: "CANCELLED", canWrite: false, periodEndsAt: sub.currentPeriodEnd, graceEndsAt: null, daysRemaining: null };
  }

  const periodEnd = sub.status === "TRIAL" && sub.trialEndsAt ? sub.trialEndsAt : sub.currentPeriodEnd;
  const graceEndsAt = graceEnd(periodEnd);

  if (now.getTime() < periodEnd.getTime()) {
    return { ...base, state: "ACTIVE", canWrite: true, periodEndsAt: periodEnd, graceEndsAt, daysRemaining: wholeDaysUntil(periodEnd, now) };
  }
  if (now.getTime() < graceEndsAt.getTime()) {
    return { ...base, state: "GRACE", canWrite: true, periodEndsAt: periodEnd, graceEndsAt, daysRemaining: wholeDaysUntil(graceEndsAt, now) };
  }
  return { ...base, state: "READ_ONLY", canWrite: false, periodEndsAt: periodEnd, graceEndsAt, daysRemaining: 0 };
}

// ─── Period arithmetic ────────────────────────────────────────────────────

/** Add calendar months in UTC, clamping the day (31 Jan + 1 month = 28/29 Feb). */
export function addMonthsUtc(date: Date, months: number): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + months;
  const targetYear = y + Math.floor(m / 12);
  const targetMonth = ((m % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const day = Math.min(date.getUTCDate(), lastDay);
  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      day,
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
}

export interface NextPeriod {
  start: Date;
  end: Date;
}

/**
 * Period granted by an approved payment.
 *  - Renewing before expiry or inside the grace window continues from the old
 *    period end (no paid days are lost, no free days are gained).
 *  - After the grace window, or with no history, the period starts at `now`.
 */
export function computeNextPeriod(
  previousPeriodEnd: Date | null,
  months: 1 | 12,
  now: Date,
): NextPeriod {
  let start = now;
  if (previousPeriodEnd && now.getTime() < graceEnd(previousPeriodEnd).getTime()) {
    start = previousPeriodEnd;
  }
  return { start, end: addMonthsUtc(start, months) };
}

export function billingMonths(period: "MONTHLY" | "YEARLY"): 1 | 12 {
  return period === "MONTHLY" ? 1 : 12;
}
