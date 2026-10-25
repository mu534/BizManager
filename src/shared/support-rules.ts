/**
 * Support ticket rules — pure.
 *
 *   OPEN ─▶ IN_PROGRESS ─▶ RESOLVED ─▶ CLOSED
 *     ▲          │             │
 *     └──────────┴─────────────┘   (a customer reply or admin reopen returns it to OPEN/IN_PROGRESS)
 *
 * A CLOSED ticket is final: customers open a new one instead, so a long-finished
 * conversation cannot be revived by a stray reply.
 */
export const TICKET_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const SUBJECT_MAX = 120;
export const BODY_MAX = 4000;
/** Abuse guard: tickets one business may open in a rolling 24 h window. */
export const MAX_TICKETS_PER_DAY = 10;

const ADMIN_TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  OPEN: ["IN_PROGRESS", "RESOLVED", "CLOSED"],
  IN_PROGRESS: ["OPEN", "RESOLVED", "CLOSED"],
  RESOLVED: ["OPEN", "IN_PROGRESS", "CLOSED"],
  CLOSED: [],
};

export function canAdminTransition(from: TicketStatus, to: TicketStatus): boolean {
  return ADMIN_TRANSITIONS[from].includes(to);
}

export function canCustomerReply(status: TicketStatus): boolean {
  return status !== "CLOSED";
}

/** Status after a customer replies: a resolved ticket goes back to OPEN for the team. */
export function statusAfterCustomerReply(status: TicketStatus): TicketStatus {
  return status === "RESOLVED" ? "OPEN" : status;
}

/** Status after the team replies: an OPEN ticket is now being worked on. */
export function statusAfterAdminReply(status: TicketStatus): TicketStatus {
  return status === "OPEN" ? "IN_PROGRESS" : status;
}

export function isTicketStatus(v: unknown): v is TicketStatus {
  return typeof v === "string" && (TICKET_STATUSES as readonly string[]).includes(v);
}
