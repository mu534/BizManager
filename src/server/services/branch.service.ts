/**
 * Branch management — SERVER ONLY. Owner-only.
 *
 *  - Creating branches is a BUSINESS-plan feature (FEATURE_KEYS.MULTI_BRANCH) and
 *    capped by the plan's MAX_BRANCHES, checked inside a transaction under a
 *    business row lock so two simultaneous requests cannot exceed it.
 *  - When a business gets its SECOND branch, every existing non-owner member is
 *    granted the original branch first, so nobody silently loses access.
 *  - The default branch and the last active branch cannot be deactivated.
 *    Deactivating keeps all history; it only stops new transactions.
 *  - Assigning branch access validates every branch id against THIS business.
 *  - Every change is written to the business audit log.
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@server/db/prisma";
import { appError } from "@shared/errors";
import type { TenantContext } from "@shared/types/auth.types";
import { requireOwner } from "@server/auth/permissions";
import { FEATURE_KEYS, LIMIT_KEYS, assertSubscriptionActive, requireFeature } from "@server/services/subscription.service";
import { UNLIMITED, planLimit } from "@shared/plans";
import {
  planBranchAssignment,
  planBranchStatusChange,
  type AssignmentError,
  type BranchLite,
  type BranchRuleError,
} from "@shared/branch-rules";
import type { CreateBranchInput, UpdateBranchInput } from "@shared/validation/branch.schema";

export interface BranchRow extends BranchLite {
  address: string | null;
  phone: string | null;
}

export interface MemberAccessRow {
  memberId: string;
  name: string;
  email: string | null;
  role: "MANAGER" | "STAFF";
  status: "ACTIVE" | "INACTIVE";
  branchIds: string[];
}

export interface BranchOverview {
  branches: BranchRow[];
  members: MemberAccessRow[];
}

async function lockBusiness(tx: Prisma.TransactionClient, businessId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM businesses WHERE id = ${businessId} FOR UPDATE`;
}

export async function getBranchOverview(ctx: TenantContext): Promise<BranchOverview> {
  requireOwner(ctx);
  const [branches, members] = await Promise.all([
    prisma.branch.findMany({
      where: { businessId: ctx.businessId, status: { not: "DELETED" } },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    }),
    prisma.businessMember.findMany({
      where: { businessId: ctx.businessId, role: { not: "OWNER" }, status: { in: ["ACTIVE", "INACTIVE"] } },
      include: { user: { select: { name: true, email: true } }, branchAccess: { select: { branchId: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  return {
    branches: branches.map((b) => ({
      id: b.id,
      name: b.name,
      status: b.status,
      isDefault: b.isDefault,
      address: b.address,
      phone: b.phone,
    })),
    members: members.map((m) => ({
      memberId: m.id,
      name: m.user.name,
      email: m.user.email,
      role: m.role === "MANAGER" ? "MANAGER" : "STAFF",
      status: m.status === "ACTIVE" ? "ACTIVE" : "INACTIVE",
      branchIds: m.branchAccess.map((a) => a.branchId),
    })),
  };
}

export async function createBranch(ctx: TenantContext, input: CreateBranchInput): Promise<{ id: string }> {
  requireOwner(ctx);
  await requireFeature(ctx, FEATURE_KEYS.MULTI_BRANCH);
  const access = await assertSubscriptionActive(ctx);
  const limit = planLimit(access.planCode ?? "BASIC", LIMIT_KEYS.MAX_BRANCHES);

  return prisma.$transaction(async (tx) => {
    await lockBusiness(tx, ctx.businessId);

    const existing = await tx.branch.findMany({
      where: { businessId: ctx.businessId, status: { not: "DELETED" } },
      select: { id: true, name: true, isDefault: true },
    });
    if (limit !== UNLIMITED && existing.length >= limit) {
      throw appError.subscriptionLimit(`Your plan allows ${limit} branch${limit === 1 ? "" : "es"}. Upgrade to add more.`);
    }
    if (existing.some((b) => b.name.trim().toLowerCase() === input.name.trim().toLowerCase())) {
      throw appError.conflict("You already have a branch with that name.");
    }

    // Going from one branch to several: keep every existing member's access to
    // the original branch so nobody is locked out by the upgrade.
    if (existing.length === 1 && existing[0]) {
      const original = existing[0];
      const members = await tx.businessMember.findMany({
        where: { businessId: ctx.businessId, role: { not: "OWNER" }, status: { in: ["ACTIVE", "INACTIVE"] } },
        select: { id: true },
      });
      if (members.length > 0) {
        await tx.branchAccess.createMany({
          data: members.map((m) => ({ businessMemberId: m.id, branchId: original.id })),
          skipDuplicates: true,
        });
      }
    }

    const branch = await tx.branch.create({
      data: { businessId: ctx.businessId, name: input.name, address: input.address, phone: input.phone },
    });
    await tx.auditLog.create({
      data: {
        businessId: ctx.businessId,
        userId: ctx.userId,
        action: "BRANCH_CREATED",
        entityType: "Branch",
        entityId: branch.id,
        metadata: { name: input.name },
      },
    });
    return { id: branch.id };
  });
}

export async function updateBranch(ctx: TenantContext, input: UpdateBranchInput): Promise<void> {
  requireOwner(ctx);
  await prisma.$transaction(async (tx) => {
    // Tenant isolation: the branch must belong to THIS business.
    const branch = await tx.branch.findFirst({
      where: { id: input.branchId, businessId: ctx.businessId, status: { not: "DELETED" } },
    });
    if (!branch) throw appError.notFound("Branch not found.");

    if (input.name && input.name.toLowerCase() !== branch.name.toLowerCase()) {
      const clash = await tx.branch.findFirst({
        where: {
          businessId: ctx.businessId,
          status: { not: "DELETED" },
          id: { not: branch.id },
          name: { equals: input.name, mode: "insensitive" },
        },
        select: { id: true },
      });
      if (clash) throw appError.conflict("You already have a branch with that name.");
    }

    await tx.branch.update({
      where: { id: branch.id },
      data: {
        ...(input.name ? { name: input.name } : {}),
        address: input.address ?? null,
        phone: input.phone ?? null,
      },
    });
    await tx.auditLog.create({
      data: {
        businessId: ctx.businessId,
        userId: ctx.userId,
        action: "BRANCH_UPDATED",
        entityType: "Branch",
        entityId: branch.id,
        metadata: { name: input.name ?? branch.name },
      },
    });
  });
}

const STATUS_MESSAGES: Record<BranchRuleError, string> = {
  DEFAULT_BRANCH_PROTECTED: "The main branch cannot be deactivated.",
  LAST_ACTIVE_BRANCH: "You need at least one active branch.",
  DELETED_BRANCH: "This branch was removed.",
  NO_CHANGE: "Nothing to change.",
};

export async function setBranchStatus(
  ctx: TenantContext,
  branchId: string,
  next: "ACTIVE" | "INACTIVE",
): Promise<void> {
  requireOwner(ctx);
  // Closing a branch is always allowed; reopening one needs the Business plan.
  if (next === "ACTIVE") await requireFeature(ctx, FEATURE_KEYS.MULTI_BRANCH);

  await prisma.$transaction(async (tx) => {
    await lockBusiness(tx, ctx.businessId);
    const branch = await tx.branch.findFirst({ where: { id: branchId, businessId: ctx.businessId } });
    if (!branch) throw appError.notFound("Branch not found.");

    const activeCount = await tx.branch.count({ where: { businessId: ctx.businessId, status: "ACTIVE" } });
    const plan = planBranchStatusChange(
      { id: branch.id, name: branch.name, status: branch.status, isDefault: branch.isDefault },
      next,
      activeCount,
    );
    if (!plan.ok) {
      if (plan.error === "NO_CHANGE") return;
      throw appError.validationError(STATUS_MESSAGES[plan.error]);
    }

    await tx.branch.update({ where: { id: branch.id }, data: { status: next } });
    await tx.auditLog.create({
      data: {
        businessId: ctx.businessId,
        userId: ctx.userId,
        action: next === "INACTIVE" ? "BRANCH_DEACTIVATED" : "BRANCH_REACTIVATED",
        entityType: "Branch",
        entityId: branch.id,
        metadata: { name: branch.name },
      },
    });
  });
}

const ASSIGNMENT_MESSAGES: Record<AssignmentError, string> = {
  OWNER_HAS_ALL: "The owner can already use every branch.",
  UNKNOWN_BRANCH: "One of the selected branches does not exist.",
  INACTIVE_MEMBER: "This member was removed and cannot be assigned.",
};

/** Replace the set of branches a member may use. Always allowed to the owner. */
export async function setMemberBranchAccess(
  ctx: TenantContext,
  memberId: string,
  branchIds: string[],
): Promise<void> {
  requireOwner(ctx);
  await prisma.$transaction(async (tx) => {
    await lockBusiness(tx, ctx.businessId);

    // Tenant isolation: the member and every branch must belong to THIS business.
    const member = await tx.businessMember.findFirst({ where: { id: memberId, businessId: ctx.businessId } });
    if (!member) throw appError.notFound("Team member not found.");
    const branches = await tx.branch.findMany({
      where: { businessId: ctx.businessId },
      select: { id: true, name: true, status: true, isDefault: true },
    });

    const plan = planBranchAssignment({ role: member.role, status: member.status }, branchIds, branches);
    if (!plan.ok) throw appError.validationError(ASSIGNMENT_MESSAGES[plan.error]);

    const before = await tx.branchAccess.findMany({
      where: { businessMemberId: member.id },
      select: { branchId: true },
    });
    const beforeIds = before.map((b) => b.branchId).sort();
    const afterIds = [...plan.branchIds].sort();
    if (beforeIds.join() === afterIds.join()) return;

    await tx.branchAccess.deleteMany({ where: { businessMemberId: member.id } });
    if (plan.branchIds.length > 0) {
      await tx.branchAccess.createMany({
        data: plan.branchIds.map((branchId) => ({ businessMemberId: member.id, branchId })),
      });
    }
    await tx.auditLog.create({
      data: {
        businessId: ctx.businessId,
        userId: ctx.userId,
        action: "BRANCH_ACCESS_CHANGED",
        entityType: "BusinessMember",
        entityId: member.id,
        metadata: { from: beforeIds, to: afterIds },
      },
    });
  });
}
