/**
 * Team and financial-report access rules — pure, no I/O.
 *
 * Financial reports are visible to:
 *   - the OWNER, always; and
 *   - a MANAGER only when the owner has explicitly granted access.
 * STAFF never see financial reports, and a grant cannot exist on STAFF.
 *
 * Everything the owner can change about a member is decided here so that it can
 * be tested without a database and cannot drift from the server enforcement.
 */

export type MemberRole = "OWNER" | "MANAGER" | "STAFF";
export type AssignableRole = "MANAGER" | "STAFF";
export type EditableStatus = "ACTIVE" | "INACTIVE";

export function hasFinancialReportAccess(role: MemberRole, granted: boolean): boolean {
  return role === "OWNER" || (role === "MANAGER" && granted);
}

export interface MemberState {
  role: MemberRole;
  status: "ACTIVE" | "INACTIVE" | "REVOKED";
  financialReportAccess: boolean;
}

export interface MemberChange {
  role?: AssignableRole;
  financialReportAccess?: boolean;
  status?: EditableStatus;
}

export type TeamRuleError =
  | "OWNER_IMMUTABLE"
  | "SELF_CHANGE"
  | "GRANT_REQUIRES_MANAGER"
  | "REVOKED_MEMBER"
  | "NO_CHANGE";

export type AuditEvent =
  | "MEMBER_ROLE_CHANGED"
  | "REPORT_ACCESS_GRANTED"
  | "REPORT_ACCESS_REVOKED"
  | "MEMBER_DEACTIVATED"
  | "MEMBER_REACTIVATED";

export type MemberPlan =
  | { ok: true; next: MemberState; events: AuditEvent[] }
  | { ok: false; error: TeamRuleError };

export function planMemberUpdate(current: MemberState, change: MemberChange, isSelf: boolean): MemberPlan {
  if (current.role === "OWNER") return { ok: false, error: "OWNER_IMMUTABLE" };
  if (isSelf) return { ok: false, error: "SELF_CHANGE" };
  if (current.status === "REVOKED") return { ok: false, error: "REVOKED_MEMBER" };

  const next: MemberState = { ...current };
  const events: AuditEvent[] = [];

  if (change.role !== undefined && change.role !== current.role) {
    next.role = change.role;
    events.push("MEMBER_ROLE_CHANGED");
  }
  if (change.status !== undefined && change.status !== current.status) {
    next.status = change.status;
    events.push(change.status === "INACTIVE" ? "MEMBER_DEACTIVATED" : "MEMBER_REACTIVATED");
  }

  const wantsGrant = change.financialReportAccess;
  if (wantsGrant !== undefined) next.financialReportAccess = wantsGrant;

  // A grant can only exist on an active manager. Demotion or deactivation clears
  // it, so re-promoting or reactivating never silently restores report access.
  if (next.financialReportAccess && next.role !== "MANAGER") {
    if (wantsGrant === true) return { ok: false, error: "GRANT_REQUIRES_MANAGER" };
    next.financialReportAccess = false;
  }
  if (next.status === "INACTIVE") next.financialReportAccess = false;

  if (next.financialReportAccess !== current.financialReportAccess) {
    events.push(next.financialReportAccess ? "REPORT_ACCESS_GRANTED" : "REPORT_ACCESS_REVOKED");
  }

  if (events.length === 0) return { ok: false, error: "NO_CHANGE" };
  return { ok: true, next, events };
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}
