/**
 * Platform administration — SERVER ONLY.
 *
 * Platform administrators are BizManager operators. Their grant lives in the
 * `platform_admins` table and is completely separate from business roles
 * (OWNER / MANAGER / STAFF). Holding it gives NO access to any tenant's
 * sales, expenses or financial reports — only the subscription, payment and
 * business-status operations exposed here. Any exception must be explicit and
 * is written to the audit log.
 */
import "server-only";
import { Prisma } from "@prisma/client";
import type { PlatformAdminRole, BusinessStatus } from "@prisma/client";
import { prisma } from "@server/db/prisma";
import { getSessionUserId } from "@server/auth/session";
import { appError } from "@shared/errors";
import { decideAccess } from "@shared/subscription-access";
import { isPlanCode } from "@shared/plans";

export interface PlatformAdminContext {
  userId: string;
  role: PlatformAdminRole;
}

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Resolve the signed-in platform admin or throw. Fails closed: no session,
 * no grant, or a revoked grant all result in an error.
 */
export async function requirePlatformAdmin(
  allowed?: readonly PlatformAdminRole[],
): Promise<PlatformAdminContext> {
  const userId = await getSessionUserId();
  if (!userId) throw appError.unauthorized("You must be signed in to continue.");

  const grant = await prisma.platformAdmin.findUnique({ where: { userId } });
  if (!grant || grant.revokedAt !== null) {
    throw appError.forbidden("You do not have access to the platform console.");
  }
  // SUPER_ADMIN may do everything any other role may.
  if (allowed && grant.role !== "SUPER_ADMIN" && !allowed.includes(grant.role)) {
    throw appError.forbidden("Your platform role does not permit this action.");
  }
  return { userId, role: grant.role };
}

export async function isPlatformAdmin(userId: string): Promise<boolean> {
  const grant = await prisma.platformAdmin.findUnique({ where: { userId } });
  return !!grant && grant.revokedAt === null;
}

export interface AuditEntry {
  actorUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  businessId?: string | null;
  metadata?: Prisma.InputJsonValue;
}

/** Append an audit row. Pass `tx` so it commits atomically with the change. */
export async function writePlatformAudit(db: Db, entry: AuditEntry): Promise<void> {
  await db.platformAuditLog.create({
    data: {
      actorUserId: entry.actorUserId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      businessId: entry.businessId ?? null,
      metadata: entry.metadata ?? Prisma.JsonNull,
    },
  });
}

// ─── Metrics (recorded facts only; no estimates, no revenue totals) ─────────

export interface PlatformMetrics {
  registeredBusinesses: number;
  suspendedBusinesses: number;
  /** Businesses whose subscription currently permits recording (active or grace). */
  activeSubscriptions: number;
  inGrace: number;
  readOnlyOrNoSubscription: number;
  pendingPaymentReviews: number;
  oldestPendingAt: Date | null;
  planDistribution: { plan: string; count: number }[];
  /** Subscriptions whose period ends within the next 7 days. */
  expiringWithin7Days: number;
  /** Sync operations the server recorded as failed in the last 7 days. */
  failedSyncOperations7d: number;
  /** Open support tickets waiting for a response. */
  openSupportRequests: number;
  generatedAt: Date;
}

export async function getPlatformMetrics(now: Date = new Date()): Promise<PlatformMetrics> {
  await requirePlatformAdmin();
  const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [businesses, subs, pending, oldest, failedSync, openTickets] = await Promise.all([
    prisma.business.findMany({ select: { id: true, status: true } }),
    prisma.subscription.findMany({
      select: {
        businessId: true,
        status: true,
        currentPeriodEnd: true,
        trialEndsAt: true,
        plan: { select: { name: true } },
      },
    }),
    prisma.subscriptionPayment.count({ where: { status: "PENDING" } }),
    prisma.subscriptionPayment.findFirst({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
    prisma.syncOperation.count({ where: { status: "FAILED", createdAt: { gte: weekAgo } } }),
    prisma.supportTicket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }),
  ]);

  const statusById = new Map(businesses.map((b) => [b.id, b.status] as const));
  let active = 0;
  let grace = 0;
  let readOnly = 0;
  let expiring = 0;
  const plans = new Map<string, number>();

  const subscribed = new Set<string>();
  for (const s of subs) {
    subscribed.add(s.businessId);
    const d = decideAccess(s, statusById.get(s.businessId) !== "ACTIVE", now);
    if (d.state === "ACTIVE") active += 1;
    else if (d.state === "GRACE") grace += 1;
    else readOnly += 1;
    if (d.state === "ACTIVE" && d.periodEndsAt && d.periodEndsAt <= weekAhead) expiring += 1;
    if (d.canWrite) {
      const key = isPlanCode(s.plan.name) ? s.plan.name : "UNKNOWN";
      plans.set(key, (plans.get(key) ?? 0) + 1);
    }
  }
  const withoutSub = businesses.filter((b) => !subscribed.has(b.id)).length;

  return {
    registeredBusinesses: businesses.length,
    suspendedBusinesses: businesses.filter((b) => b.status === "SUSPENDED").length,
    activeSubscriptions: active + grace,
    inGrace: grace,
    readOnlyOrNoSubscription: readOnly + withoutSub,
    pendingPaymentReviews: pending,
    oldestPendingAt: oldest?.createdAt ?? null,
    planDistribution: [...plans.entries()].map(([plan, count]) => ({ plan, count })),
    expiringWithin7Days: expiring,
    failedSyncOperations7d: failedSync,
    openSupportRequests: openTickets,
    generatedAt: now,
  };
}

// ─── Business management ──────────────────────────────────────────────────

export interface BusinessRow {
  id: string;
  name: string;
  status: BusinessStatus;
  country: string;
  createdAt: Date;
  ownerEmail: string | null;
  planName: string | null;
  accessState: string;
  periodEndsAt: Date | null;
}

export async function listBusinesses(take = 100, now: Date = new Date()): Promise<BusinessRow[]> {
  await requirePlatformAdmin();
  const rows = await prisma.business.findMany({
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      name: true,
      status: true,
      country: true,
      createdAt: true,
      subscription: { select: { status: true, currentPeriodEnd: true, trialEndsAt: true, plan: { select: { name: true } } } },
      members: { where: { role: "OWNER" }, take: 1, select: { user: { select: { email: true } } } },
    },
  });
  return rows.map((b) => {
    const d = decideAccess(b.subscription, b.status !== "ACTIVE", now);
    return {
      id: b.id,
      name: b.name,
      status: b.status,
      country: b.country,
      createdAt: b.createdAt,
      ownerEmail: b.members[0]?.user.email ?? null,
      planName: b.subscription?.plan.name ?? null,
      accessState: d.state,
      periodEndsAt: d.periodEndsAt,
    };
  });
}

/** Suspend or reactivate a business. SUPER_ADMIN only; always audited with a reason. */
export async function setBusinessStatus(
  admin: PlatformAdminContext,
  businessId: string,
  status: "ACTIVE" | "SUSPENDED",
  reason: string,
): Promise<void> {
  if (admin.role !== "SUPER_ADMIN") {
    throw appError.forbidden("Only a super administrator can change business status.");
  }
  const trimmed = reason.trim();
  if (trimmed.length < 5 || trimmed.length > 500) {
    throw appError.validationError("Enter a reason between 5 and 500 characters.");
  }
  await prisma.$transaction(async (tx) => {
    const biz = await tx.business.findUnique({ where: { id: businessId }, select: { status: true } });
    if (!biz) throw appError.notFound("Business not found.");
    if (biz.status === "DELETED") throw appError.conflict("A deleted business cannot be changed.");
    if (biz.status === status) return;
    await tx.business.update({ where: { id: businessId }, data: { status } });
    await writePlatformAudit(tx, {
      actorUserId: admin.userId,
      action: status === "SUSPENDED" ? "BUSINESS_SUSPENDED" : "BUSINESS_REACTIVATED",
      targetType: "Business",
      targetId: businessId,
      businessId,
      metadata: { from: biz.status, to: status, reason: trimmed },
    });
  });
}

// ─── Plan management ──────────────────────────────────────────────────────

export interface UpdatePlanInput {
  planId: string;
  monthlyPriceMinor: number;
  annualDiscountBps: number;
  isActive: boolean;
}

/** Edit price / discount / availability. SUPER_ADMIN only; audited with old values. */
export async function updatePlanCommercials(
  admin: PlatformAdminContext,
  input: UpdatePlanInput,
): Promise<void> {
  if (admin.role !== "SUPER_ADMIN") {
    throw appError.forbidden("Only a super administrator can change plan pricing.");
  }
  if (!Number.isSafeInteger(input.monthlyPriceMinor) || input.monthlyPriceMinor < 0) {
    throw appError.validationError("Price must be zero or more.");
  }
  if (
    !Number.isInteger(input.annualDiscountBps) ||
    input.annualDiscountBps < 0 ||
    input.annualDiscountBps > 10_000
  ) {
    throw appError.validationError("Annual discount must be between 0% and 100%.");
  }
  await prisma.$transaction(async (tx) => {
    const before = await tx.plan.findUnique({ where: { id: input.planId } });
    if (!before) throw appError.notFound("Plan not found.");
    await tx.plan.update({
      where: { id: input.planId },
      data: {
        monthlyPriceMinor: input.monthlyPriceMinor,
        annualDiscountBps: input.annualDiscountBps,
        isActive: input.isActive,
      },
    });
    await writePlatformAudit(tx, {
      actorUserId: admin.userId,
      action: "PLAN_UPDATED",
      targetType: "Plan",
      targetId: input.planId,
      metadata: {
        plan: before.name,
        before: {
          monthlyPriceMinor: before.monthlyPriceMinor,
          annualDiscountBps: before.annualDiscountBps,
          isActive: before.isActive,
        },
        after: {
          monthlyPriceMinor: input.monthlyPriceMinor,
          annualDiscountBps: input.annualDiscountBps,
          isActive: input.isActive,
        },
      },
    });
  });
}

// ─── Read-only listings for the console ───────────────────────────────────

export async function listAllPlans() {
  await requirePlatformAdmin();
  return prisma.plan.findMany({ orderBy: { sortOrder: "asc" } });
}

export async function listAuditLog(take = 100) {
  await requirePlatformAdmin(["FINANCE", "SUPPORT"]);
  return prisma.platformAuditLog.findMany({ orderBy: { createdAt: "desc" }, take });
}
