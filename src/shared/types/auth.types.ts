
export enum UserRole {
  OWNER = "OWNER",
  MANAGER = "MANAGER",
  STAFF = "STAFF",
}


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
   * True when the owner has explicitly granted this member access to financial
   * reports. Only meaningful for MANAGER; use hasFinancialReportAccess() rather
   * than reading it directly.
   */
  financialReportGrant: boolean;

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
