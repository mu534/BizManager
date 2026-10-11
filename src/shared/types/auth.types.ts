/**
 * Shared auth and tenant types.
 *
 * Safe to import from both server and client code (no server-only imports here).
 * Keep this file free of Prisma, Firebase Admin, or next/headers imports.
 */

/**
 * User roles within a business.
 * Must stay in sync with the Prisma UserRole enum.
 */
export enum UserRole {
  OWNER = "OWNER",
  MANAGER = "MANAGER",
  STAFF = "STAFF",
}

/**
 * The resolved, server-side tenant context for a request.
 *
 * This is constructed server-side from:
 *   1. The session cookie → userId
 *   2. PostgreSQL lookup → role, businessId, membershipId
 *   3. Optional branchId from the request context
 *
 * NEVER accept a TenantContext from the browser.
 * NEVER trust a businessId, branchId, or role sent by the client.
 */
export interface TenantContext {
  /** Internal PostgreSQL User.id (UUID). */
  userId: string;

  /** Firebase UID — used when Firebase Admin calls are needed. */
  firebaseUid: string;

  /** The business this request is scoped to. */
  businessId: string;

  /** The BusinessMember.id for this user+business pair. */
  membershipId: string;

  /** The user's role within this business. */
  role: UserRole;

  /**
   * The active branch for this request, if applicable.
   * null means the context is business-wide (no branch selected yet).
   */
  branchId: string | null;
}

/**
 * Partial context available before a business is selected.
 * Used during onboarding and business-selection flows.
 */
export interface UserIdentityContext {
  userId: string;
  firebaseUid: string;
  name: string;
  email: string | null;
}
