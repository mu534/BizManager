/**
 * Business service — SERVER ONLY.
 *
 * Handles business creation and membership queries.
 * Business creation is a single atomic Prisma transaction —
 * if any step fails, nothing is committed.
 */
import "server-only";
import type {
  Business,
  Branch,
  BusinessMember,
  FinancialAccount,
} from "@prisma/client";
import { prisma } from "@server/db/prisma";
import { appError } from "@shared/errors";
import type { CreateBusinessInput } from "@shared/validation/business.schema";
import type { TenantContext } from "@shared/types/auth.types";
import { UserRole } from "@shared/types/auth.types";

/**
 * Shape returned from createBusiness — the full set of records created
 * in the onboarding transaction.
 */
export interface NewBusinessResult {
  business: Business;
  branch: Branch;
  membership: BusinessMember;
  defaultAccounts: FinancialAccount[];
}

/**
 * Create a new business, its initial branch, the owner membership, and
 * default financial accounts — all in a single Prisma transaction.
 *
 * @param userId   The internal PostgreSQL User.id (not Firebase UID).
 * @param input    Validated onboarding form data.
 */
export async function createBusiness(
  userId: string,
  input: CreateBusinessInput,
): Promise<NewBusinessResult> {
  return prisma.$transaction(async (tx) => {
    // 1. Create the business.
    const business = await tx.business.create({
      data: {
        name: input.businessName,
        businessType: input.businessType,
        country: input.country,
        currency: input.currency,
        phone: input.phone,
      },
    });

    // 2. Create the initial (default) branch.
    const branch = await tx.branch.create({
      data: {
        businessId: business.id,
        name: input.branchName,
        isDefault: true,
      },
    });

    // 3. Create the owner membership.
    const membership = await tx.businessMember.create({
      data: {
        userId,
        businessId: business.id,
        role: "OWNER",
        status: "ACTIVE",
      },
    });

    // 4. Create default financial accounts (business-wide: branchId = null).
    const defaultAccountData = [
      { name: "Cash", type: "CASH" as const, isDefault: true },
      { name: "Telebirr", type: "MOBILE_MONEY" as const, isDefault: false },
    ];

    const defaultAccounts: FinancialAccount[] = [];
    for (const acct of defaultAccountData) {
      const account = await tx.financialAccount.create({
        data: {
          businessId: business.id,
          branchId: null, // business-wide
          name: acct.name,
          type: acct.type,
          isDefault: acct.isDefault,
          currentBalance: 0,
        },
      });
      defaultAccounts.push(account);
    }

    // 5. Create default expense categories.
    const defaultCategories = [
      "Rent",
      "Electricity",
      "Water",
      "Internet",
      "Transport",
      "Salary",
      "Supplies",
      "Maintenance",
      "Other",
    ];
    await tx.expenseCategory.createMany({
      data: defaultCategories.map((name) => ({
        businessId: business.id,
        name,
        isDefault: true,
      })),
    });

    return { business, branch, membership, defaultAccounts };
  });
}

/**
 * Load all businesses that a user is an active member of.
 * Returns lightweight records suitable for a business-selection screen.
 */
export async function getBusinessesForUser(userId: string): Promise<
  Array<{
    business: Business;
    membership: BusinessMember;
  }>
> {
  const memberships = await prisma.businessMember.findMany({
    where: {
      userId,
      status: "ACTIVE",
      business: { status: "ACTIVE" },
    },
    include: { business: true },
    orderBy: { createdAt: "asc" },
  });

  return memberships.map((m) => ({
    business: m.business,
    membership: m,
  }));
}

/**
 * Verify that a user is an active member of a specific business and
 * return their membership. Throws FORBIDDEN if not.
 *
 * This is the primary cross-tenant guard — never skip it.
 */
export async function requireBusinessMembership(
  userId: string,
  businessId: string,
): Promise<BusinessMember> {
  const membership = await prisma.businessMember.findUnique({
    where: {
      userId_businessId: { userId, businessId },
    },
  });

  if (!membership || membership.status !== "ACTIVE") {
    // Use FORBIDDEN, not NOT_FOUND — do not reveal whether the business exists.
    throw appError.forbidden(
      "You do not have access to this business.",
    );
  }

  return membership;
}

/**
 * Load a branch, verifying it belongs to the expected business.
 * Throws FORBIDDEN if the branch belongs to a different business (IDOR guard).
 */
export async function requireBranch(
  branchId: string,
  businessId: string,
): Promise<Branch> {
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
  });

  if (!branch || branch.status === "DELETED") {
    throw appError.notFound("Branch not found.");
  }

  if (branch.businessId !== businessId) {
    throw appError.tenantViolation(
      "Branch does not belong to the specified business.",
    );
  }

  return branch;
}

/**
 * Check the user's role meets a minimum required level.
 * Role hierarchy: OWNER > MANAGER > STAFF.
 */
export function assertMinimumRole(
  actualRole: string,
  requiredRole: UserRole,
): void {
  const hierarchy: Record<UserRole, number> = {
    [UserRole.OWNER]: 3,
    [UserRole.MANAGER]: 2,
    [UserRole.STAFF]: 1,
  };

  const actual = hierarchy[actualRole as UserRole] ?? 0;
  const required = hierarchy[requiredRole];

  if (actual < required) {
    throw appError.forbidden(
      `This action requires at least the ${requiredRole} role.`,
    );
  }
}
