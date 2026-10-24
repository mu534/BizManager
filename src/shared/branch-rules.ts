/**
 * Branch access rules — pure, no I/O.
 *
 *  - OWNER sees and works in every branch.
 *  - A business with a single branch gives everyone access to it, so existing
 *    single-shop businesses behave exactly as before.
 *  - In a multi-branch business, MANAGER and STAFF only get the branches the
 *    owner has explicitly granted (BranchAccess rows).
 *  - INACTIVE branches keep their history (readable) but accept no new
 *    transactions. DELETED branches are invisible.
 *  - The default branch cannot be deactivated, and neither can the last active
 *    branch, so a business can never end up with nowhere to record sales.
 */
import type { MemberRole } from "./team-rules";

export type BranchStatusValue = "ACTIVE" | "INACTIVE" | "DELETED";

export interface BranchLite {
  id: string;
  name: string;
  status: BranchStatusValue;
  isDefault: boolean;
}

export function accessibleBranches(
  role: MemberRole,
  branches: readonly BranchLite[],
  granted: ReadonlySet<string>,
): BranchLite[] {
  const visible = branches.filter((b) => b.status !== "DELETED");
  if (role === "OWNER") return visible;
  if (visible.length <= 1) return visible;
  return visible.filter((b) => granted.has(b.id));
}

export function canWriteToBranch(branch: Pick<BranchLite, "status">): boolean {
  return branch.status === "ACTIVE";
}

/**
 * Branch to work in: the person's saved choice if they may still use it, else
 * the default branch, else the first active one. Null when nothing is usable.
 */
export function pickCurrentBranch(
  accessible: readonly BranchLite[],
  preferredId?: string | null,
): BranchLite | null {
  const active = accessible.filter(canWriteToBranch);
  return (
    active.find((b) => b.id === preferredId) ??
    active.find((b) => b.isDefault) ??
    active[0] ??
    null
  );
}

export type BranchRuleError =
  | "DEFAULT_BRANCH_PROTECTED"
  | "LAST_ACTIVE_BRANCH"
  | "DELETED_BRANCH"
  | "NO_CHANGE";

export type BranchStatusPlan = { ok: true } | { ok: false; error: BranchRuleError };

export function planBranchStatusChange(
  branch: BranchLite,
  next: "ACTIVE" | "INACTIVE",
  activeBranchCount: number,
): BranchStatusPlan {
  if (branch.status === "DELETED") return { ok: false, error: "DELETED_BRANCH" };
  if (branch.status === next) return { ok: false, error: "NO_CHANGE" };
  if (next === "INACTIVE") {
    if (branch.isDefault) return { ok: false, error: "DEFAULT_BRANCH_PROTECTED" };
    if (activeBranchCount <= 1) return { ok: false, error: "LAST_ACTIVE_BRANCH" };
  }
  return { ok: true };
}

export type AssignmentError = "OWNER_HAS_ALL" | "UNKNOWN_BRANCH" | "INACTIVE_MEMBER";

export type AssignmentPlan =
  | { ok: true; branchIds: string[] }
  | { ok: false; error: AssignmentError };

/** Validate an owner's branch assignment for one member and normalise it (unique ids). */
export function planBranchAssignment(
  member: { role: MemberRole; status: "ACTIVE" | "INACTIVE" | "REVOKED" },
  requestedIds: readonly string[],
  branches: readonly BranchLite[],
): AssignmentPlan {
  if (member.role === "OWNER") return { ok: false, error: "OWNER_HAS_ALL" };
  if (member.status === "REVOKED") return { ok: false, error: "INACTIVE_MEMBER" };
  const valid = new Set(branches.filter((b) => b.status !== "DELETED").map((b) => b.id));
  const unique = [...new Set(requestedIds)];
  if (unique.some((id) => !valid.has(id))) return { ok: false, error: "UNKNOWN_BRANCH" };
  return { ok: true, branchIds: unique };
}
