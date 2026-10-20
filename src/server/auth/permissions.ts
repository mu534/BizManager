/**
 * Authorization permission helpers — SERVER ONLY.
 *
 * All these functions take a TenantContext that has already been
 * verified by resolveContext(). They are thin wrappers around the
 * role hierarchy check to make authorization intent explicit.
 *
 * Usage in a service function:
 *   requireOwner(ctx);              // throws if not OWNER
 *   requireOwnerOrManager(ctx);     // throws if STAFF
 *   if (canApplyPriceOverride(ctx)) { ... }
 */
import "server-only";
import type { TenantContext } from "@shared/types/auth.types";
import { UserRole } from "@shared/types/auth.types";
import { assertMinimumRole } from "@server/services/business.service";
import { hasFinancialReportAccess } from "@shared/team-rules";
import { appError } from "@shared/errors";

/** Require OWNER role. Throws FORBIDDEN otherwise. */
export function requireOwner(ctx: TenantContext): void {
  assertMinimumRole(ctx.role, UserRole.OWNER);
}

/** Require OWNER or MANAGER role. Throws FORBIDDEN for STAFF. */
export function requireOwnerOrManager(ctx: TenantContext): void {
  assertMinimumRole(ctx.role, UserRole.MANAGER);
}

/** Require at least STAFF role (i.e. any authenticated member). */
export function requireAnyRole(ctx: TenantContext): void {
  assertMinimumRole(ctx.role, UserRole.STAFF);
}

// ── Granular capability checks ────────────────────────────────

/** Only OWNER and MANAGER can override product prices during a sale. */
export function canApplyPriceOverride(ctx: TenantContext): boolean {
  return ctx.role === UserRole.OWNER || ctx.role === UserRole.MANAGER;
}

/**
 * Financial reports, account balances and transaction history.
 * OWNER always; MANAGER only with an explicit owner grant; STAFF never.
 */
export function canViewFinancialReports(ctx: TenantContext): boolean {
  return hasFinancialReportAccess(ctx.role, ctx.financialReportGrant);
}

/** Throws FORBIDDEN unless the member may see financial data. */
export function requireFinancialReports(ctx: TenantContext): void {
  if (!canViewFinancialReports(ctx)) {
    throw appError.forbidden("The business owner has not given you access to financial reports.");
  }
}

/** Only OWNER can manage users, roles, and business settings. */
export function canManageUsers(ctx: TenantContext): boolean {
  return ctx.role === UserRole.OWNER;
}

/** Only OWNER can manage the subscription. */
export function canManageSubscription(ctx: TenantContext): boolean {
  return ctx.role === UserRole.OWNER;
}

/** OWNER and MANAGER can manage financial accounts. */
export function canManageFinancialAccounts(ctx: TenantContext): boolean {
  return ctx.role === UserRole.OWNER || ctx.role === UserRole.MANAGER;
}

/** All roles can record sales. */
export function canRecordSales(_ctx: TenantContext): boolean {
  return true;
}

/** Only OWNER and MANAGER can record expenses. */
export function canRecordExpenses(ctx: TenantContext): boolean {
  return ctx.role === UserRole.OWNER || ctx.role === UserRole.MANAGER;
}

/** OWNER and MANAGER can process returns. */
export function canProcessReturns(ctx: TenantContext): boolean {
  return ctx.role === UserRole.OWNER || ctx.role === UserRole.MANAGER;
}
