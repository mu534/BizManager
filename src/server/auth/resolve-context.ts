/**
 * TenantContext resolution — SERVER ONLY.
 *
 * Builds the authoritative TenantContext from the session cookie and
 * PostgreSQL membership records. Every Server Action and Route Handler
 * that needs business-scoped access starts with resolveContext().
 *
 * Flow:
 *   session cookie → userId → BusinessMember lookup → TenantContext
 *
 * Never returns a partial context. If any step fails, throws AppError.
 */
import "server-only";
import { getSessionUserId } from "./session";
import { getUserById } from "@server/services/user.service";
import {
  requireBusinessMembership,
  requireBranch,
} from "@server/services/business.service";
import { appError } from "@shared/errors";
import type { TenantContext, UserIdentityContext } from "@shared/types/auth.types";
import { UserRole } from "@shared/types/auth.types";

/**
 * Resolve a full TenantContext for the current request.
 *
 * @param businessId  The business to scope the context to. Must be provided
 *                    by the application (e.g. from the URL or stored selection),
 *                    NOT from the request body.
 * @param branchId    Optional branch ID. If provided, verified to belong to
 *                    the business. Pass null for business-wide operations.
 */
export async function resolveContext(
  businessId: string,
  branchId?: string | null,
): Promise<TenantContext> {
  // 1. Read the session — fail if no session exists.
  const userId = await getSessionUserId();
  if (!userId) {
    throw appError.unauthorized("You must be signed in to continue.");
  }

  // 2. Load and validate the application user.
  const user = await getUserById(userId);

  // 3. Verify the user is an active member of the requested business.
  //    This is the primary cross-tenant guard.
  const membership = await requireBusinessMembership(userId, businessId);

  // 4. Optionally verify branch access.
  let resolvedBranchId: string | null = null;
  if (branchId) {
    const branch = await requireBranch(branchId, businessId);
    resolvedBranchId = branch.id;
  }

  return {
    userId: user.id,
    firebaseUid: user.firebaseUid,
    businessId,
    membershipId: membership.id,
    role: membership.role as UserRole,
    branchId: resolvedBranchId,
  };
}

/**
 * Resolve just the authenticated user identity — no business context.
 * Used for onboarding flows and business-selection screens where the
 * user is signed in but hasn't selected a business yet.
 *
 * Throws UNAUTHORIZED if no session exists.
 */
export async function resolveUserIdentityFromSession(): Promise<UserIdentityContext> {
  const userId = await getSessionUserId();
  if (!userId) {
    throw appError.unauthorized("You must be signed in to continue.");
  }
  const user = await getUserById(userId);
  return {
    userId: user.id,
    firebaseUid: user.firebaseUid,
    name: user.name,
    email: user.email,
  };
}

/**
 * Return the current session userId without throwing.
 * Returns null if no session exists.
 * Use for layouts that render differently for authenticated vs guest users.
 */
export async function getOptionalSessionUserId(): Promise<string | null> {
  return getSessionUserId();
}
