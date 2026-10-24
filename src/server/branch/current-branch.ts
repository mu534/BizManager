import "server-only";
import { cookies } from "next/headers";
import { listAccessibleBranches, type BranchActor } from "@server/services/branch-access.service";
import { pickCurrentBranch, type BranchLite } from "@shared/branch-rules";

/** One cookie per business, so switching in one business never affects another. */
export function branchCookieName(businessId: string): string {
  return `bm_branch_${businessId}`;
}

/**
 * The branch the member is working in. The cookie is only a PREFERENCE: it is
 * re-checked against the member's real branch access on every call, so editing
 * it cannot reach a branch they are not allowed to use. Reads cookies, so
 * callers must be dynamic pages/actions.
 */
export async function getCurrentBranch(actor: BranchActor): Promise<BranchLite | null> {
  const accessible = await listAccessibleBranches(actor);
  const preferred = (await cookies()).get(branchCookieName(actor.businessId))?.value;
  return pickCurrentBranch(accessible, preferred);
}

export async function getCurrentBranchId(actor: BranchActor): Promise<string | null> {
  return (await getCurrentBranch(actor))?.id ?? null;
}
