/**
 * Team management — SERVER ONLY. Owner-only.
 *
 *  - Employee accounts and report-access grants are a PRO+ feature
 *    (FEATURE_KEYS.MULTI_USER). Revoking access or deactivating a member is
 *    always allowed, even if the plan has lapsed — an owner must never be unable
 *    to cut off access.
 *  - The business always comes from the verified TenantContext; a memberId from
 *    the client is only ever looked up WITHIN that business.
 *  - Members are added by email and must already have a BizManager account (no
 *    invitation emails are sent — there is no mail infrastructure yet).
 *  - Every change is written to the business audit log.
 */
import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@server/db/prisma";
import { appError } from "@shared/errors";
import type { TenantContext } from "@shared/types/auth.types";
import { requireOwner } from "@server/auth/permissions";
import {
  FEATURE_KEYS,
  LIMIT_KEYS,
  assertSubscriptionActive,
  requireFeature,
} from "@server/services/subscription.service";
import { UNLIMITED, planLimit } from "@shared/plans";
import {
  hasFinancialReportAccess,
  planMemberUpdate,
  type MemberChange,
  type TeamRuleError,
} from "@shared/team-rules";
import type { AddMemberInput } from "@shared/validation/team.schema";

export interface TeamMember {
  memberId: string;
  userId: string;
  name: string;
  email: string | null;
  role: "OWNER" | "MANAGER" | "STAFF";
  status: "ACTIVE" | "INACTIVE" | "REVOKED";
  /** Effective access: true for the owner and for granted managers. */
  canSeeFinancialReports: boolean;
  isSelf: boolean;
}

export async function listTeam(ctx: TenantContext): Promise<TeamMember[]> {
  requireOwner(ctx);
  const rows = await prisma.businessMember.findMany({
    where: { businessId: ctx.businessId },
    include: { user: { select: { name: true, email: true } } },
    orderBy: [{ createdAt: "asc" }],
  });
  return rows.map((m) => ({
    memberId: m.id,
    userId: m.userId,
    name: m.user.name,
    email: m.user.email,
    role: m.role,
    status: m.status,
    canSeeFinancialReports: m.status === "ACTIVE" && hasFinancialReportAccess(m.role, m.canViewFinancialReports),
    isSelf: m.userId === ctx.userId,
  }));
}

const RULE_MESSAGES: Record<TeamRuleError, string> = {
  OWNER_IMMUTABLE: "The owner’s access cannot be changed.",
  SELF_CHANGE: "You cannot change your own access.",
  GRANT_REQUIRES_MANAGER: "Only managers can be given access to financial reports.",
  REVOKED_MEMBER: "This member was removed and cannot be edited.",
  NO_CHANGE: "Nothing to change.",
};

async function activeLimit(ctx: TenantContext): Promise<number> {
  const access = await assertSubscriptionActive(ctx);
  return planLimit(access.planCode ?? "BASIC", LIMIT_KEYS.MAX_USERS);
}

/** Serialize concurrent team changes for one business so the user cap is exact. */
async function lockBusiness(tx: Prisma.TransactionClient, businessId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM businesses WHERE id = ${businessId} FOR UPDATE`;
}

export async function addMember(ctx: TenantContext, input: AddMemberInput): Promise<void> {
  requireOwner(ctx);
  await requireFeature(ctx, FEATURE_KEYS.MULTI_USER);
  const limit = await activeLimit(ctx);

  const user = await prisma.user.findFirst({
    where: { email: { equals: input.email, mode: "insensitive" } },
    select: { id: true },
  });
  if (!user) {
    throw appError.validationError(
      "No BizManager account uses that email. Ask them to create an account first, then add them here.",
    );
  }

  await prisma.$transaction(async (tx) => {
    await lockBusiness(tx, ctx.businessId);

    if (limit !== UNLIMITED) {
      const active = await tx.businessMember.count({ where: { businessId: ctx.businessId, status: "ACTIVE" } });
      if (active >= limit) {
        throw appError.subscriptionLimit(
          `Your plan allows ${limit} team member${limit === 1 ? "" : "s"}. Upgrade to add more.`,
        );
      }
    }

    const existing = await tx.businessMember.findUnique({
      where: { userId_businessId: { userId: user.id, businessId: ctx.businessId } },
    });
    if (existing?.status === "ACTIVE") throw appError.conflict("This person is already on your team.");
    if (existing?.status === "REVOKED") {
      throw appError.conflict("This person was removed from the business. Contact support to add them again.");
    }

    const member = existing
      ? await tx.businessMember.update({
          where: { id: existing.id },
          data: { status: "ACTIVE", role: input.role, canViewFinancialReports: false },
        })
      : await tx.businessMember.create({
          data: { userId: user.id, businessId: ctx.businessId, role: input.role, canViewFinancialReports: false },
        });

    await tx.auditLog.create({
      data: {
        businessId: ctx.businessId,
        userId: ctx.userId,
        action: existing ? "MEMBER_REACTIVATED" : "MEMBER_ADDED",
        entityType: "BusinessMember",
        entityId: member.id,
        metadata: { role: input.role },
      },
    });
  });
}

export async function updateMember(
  ctx: TenantContext,
  memberId: string,
  change: MemberChange,
): Promise<void> {
  requireOwner(ctx);

  // Granting access or bringing someone back needs the plan feature and an
  // active subscription; cutting access never does.
  const grows = change.financialReportAccess === true || change.status === "ACTIVE";
  let limit = UNLIMITED;
  if (grows) {
    await requireFeature(ctx, FEATURE_KEYS.MULTI_USER);
    limit = await activeLimit(ctx);
  }

  await prisma.$transaction(async (tx) => {
    await lockBusiness(tx, ctx.businessId);

    // Tenant isolation: the member must belong to THIS business.
    const member = await tx.businessMember.findFirst({ where: { id: memberId, businessId: ctx.businessId } });
    if (!member) throw appError.notFound("Team member not found.");

    const plan = planMemberUpdate(
      { role: member.role, status: member.status, financialReportAccess: member.canViewFinancialReports },
      change,
      member.userId === ctx.userId,
    );
    if (!plan.ok) {
      if (plan.error === "NO_CHANGE") return;
      throw appError.validationError(RULE_MESSAGES[plan.error]);
    }

    if (member.status !== "ACTIVE" && plan.next.status === "ACTIVE" && limit !== UNLIMITED) {
      const active = await tx.businessMember.count({ where: { businessId: ctx.businessId, status: "ACTIVE" } });
      if (active >= limit) {
        throw appError.subscriptionLimit(`Your plan allows ${limit} team member${limit === 1 ? "" : "s"}. Upgrade to add more.`);
      }
    }

    await tx.businessMember.update({
      where: { id: member.id },
      data: {
        role: plan.next.role,
        status: plan.next.status === "REVOKED" ? "REVOKED" : plan.next.status,
        canViewFinancialReports: plan.next.financialReportAccess,
      },
    });

    for (const action of plan.events) {
      await tx.auditLog.create({
        data: {
          businessId: ctx.businessId,
          userId: ctx.userId,
          action,
          entityType: "BusinessMember",
          entityId: member.id,
          metadata: {
            from: { role: member.role, status: member.status, financialReportAccess: member.canViewFinancialReports },
            to: {
              role: plan.next.role,
              status: plan.next.status,
              financialReportAccess: plan.next.financialReportAccess,
            },
          },
        },
      });
    }
  });
}
