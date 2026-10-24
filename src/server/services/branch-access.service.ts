/**
 * Branch access enforcement — SERVER ONLY.
 *
 * The single place that answers "may this member use this branch?". Every
 * service that accepts a branch id calls requireBranchAccess(), so a forged or
 * stale branch id (another business's, or one the member was not granted)
 * cannot reach data or write a transaction. Rules live in @shared/branch-rules.
 *
 *   read  access: owner, or a granted member (single-branch businesses: everyone)
 *   write access: the above AND the branch is ACTIVE
 */
import "server-only";
import type { Branch } from "@prisma/client";
import { prisma } from "@server/db/prisma";
import { appError } from "@shared/errors";
import type { TenantContext } from "@shared/types/auth.types";
import { accessibleBranches, canWriteToBranch, type BranchLite } from "@shared/branch-rules";

export type BranchActor = Pick<TenantContext, "businessId" | "membershipId" | "role">;

/** Branches the actor may use (inactive ones included, for history). Deleted are never returned. */
export async function listAccessibleBranches(actor: BranchActor): Promise<BranchLite[]> {
  const branches = await prisma.branch.findMany({
    where: { businessId: actor.businessId, status: { not: "DELETED" } },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    select: { id: true, name: true, status: true, isDefault: true },
  });
  let granted = new Set<string>();
  if (actor.role !== "OWNER" && branches.length > 1) {
    const rows = await prisma.branchAccess.findMany({
      where: { businessMemberId: actor.membershipId },
      select: { branchId: true },
    });
    granted = new Set(rows.map((r) => r.branchId));
  }
  return accessibleBranches(actor.role, branches, granted);
}

export async function requireBranchAccess(
  actor: BranchActor,
  branchId: string,
  opts: { write?: boolean } = {},
): Promise<Branch> {
  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch || branch.status === "DELETED") throw appError.notFound("Branch not found.");
  if (branch.businessId !== actor.businessId) {
    throw appError.tenantViolation("Branch does not belong to this business.");
  }

  if (actor.role !== "OWNER") {
    const total = await prisma.branch.count({
      where: { businessId: actor.businessId, status: { not: "DELETED" } },
    });
    if (total > 1) {
      const grant = await prisma.branchAccess.findUnique({
        where: { businessMemberId_branchId: { businessMemberId: actor.membershipId, branchId } },
      });
      if (!grant) throw appError.forbidden("You have not been given access to this branch.");
    }
  }

  if (opts.write && !canWriteToBranch(branch)) {
    throw appError.validationError("This branch is inactive. Transactions can no longer be recorded in it.");
  }
  return branch;
}
