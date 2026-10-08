/**
 * Application error codes.
 *
 * These are the canonical error identifiers used throughout the entire
 * codebase — services, API handlers, and the client. Keep them stable:
 * once a code is in production, changing it is a breaking change for any
 * client that pattern-matches on the code.
 *
 * Ordering: auth/access → input → business rules → infrastructure
 */
export enum AppErrorCode {
  // ── Authentication / Authorization ──────────────────────────
  /** Request carries no valid identity token. */
  UNAUTHORIZED = "UNAUTHORIZED",
  /** Identity is valid but the user is not allowed to perform this action. */
  FORBIDDEN = "FORBIDDEN",
  /** Attempted to access data belonging to a different business. */
  TENANT_VIOLATION = "TENANT_VIOLATION",

  // ── Input / Validation ───────────────────────────────────────
  /** One or more input fields failed schema validation. */
  VALIDATION_ERROR = "VALIDATION_ERROR",
  /** A referenced resource does not exist (or is not visible to this tenant). */
  NOT_FOUND = "NOT_FOUND",

  // ── Business rules ───────────────────────────────────────────
  /** A unique constraint was violated (e.g. duplicate SKU, duplicate sync op). */
  CONFLICT = "CONFLICT",
  /** Attempted to sell or transfer more stock than is available. */
  INSUFFICIENT_STOCK = "INSUFFICIENT_STOCK",
  /** Action blocked because the business subscription is expired or limited. */
  SUBSCRIPTION_LIMIT = "SUBSCRIPTION_LIMIT",
  /** Return quantity exceeds the original sale quantity. */
  INVALID_RETURN = "INVALID_RETURN",
  /** Attempted a financial operation on an inactive or non-existent account. */
  INVALID_ACCOUNT = "INVALID_ACCOUNT",

  // ── Sync / Offline ───────────────────────────────────────────
  /** A sync operation could not be processed on the server. */
  SYNC_ERROR = "SYNC_ERROR",
  /** The client is offline and the operation requires a server round-trip. */
  OFFLINE = "OFFLINE",

  // ── Infrastructure ───────────────────────────────────────────
  /** An unexpected server-side error occurred. Do not leak details to the client. */
  SERVER_ERROR = "SERVER_ERROR",
}

/**
 * HTTP status codes that correspond to each AppErrorCode.
 * Used by API route handlers to set the response status.
 */
export const APP_ERROR_HTTP_STATUS: Record<AppErrorCode, number> = {
  [AppErrorCode.UNAUTHORIZED]: 401,
  [AppErrorCode.FORBIDDEN]: 403,
  [AppErrorCode.TENANT_VIOLATION]: 403,
  [AppErrorCode.VALIDATION_ERROR]: 422,
  [AppErrorCode.NOT_FOUND]: 404,
  [AppErrorCode.CONFLICT]: 409,
  [AppErrorCode.INSUFFICIENT_STOCK]: 422,
  [AppErrorCode.SUBSCRIPTION_LIMIT]: 402,
  [AppErrorCode.INVALID_RETURN]: 422,
  [AppErrorCode.INVALID_ACCOUNT]: 422,
  [AppErrorCode.SYNC_ERROR]: 422,
  [AppErrorCode.OFFLINE]: 503,
  [AppErrorCode.SERVER_ERROR]: 500,
};

/**
 * A structured application error that carries a typed error code,
 * a human-readable message, an HTTP status hint, and optional detail payload.
 *
 * Rules:
 * - Service functions throw `AppError`, never raw `Error`.
 * - API handlers catch `AppError` and return structured JSON.
 * - The `details` field may contain validation issues or other safe-to-expose
 *   context. It must NEVER contain stack traces, SQL, or internal identifiers.
 * - SERVER_ERROR must never include the original error message in the client response.
 */
export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(
    code: AppErrorCode,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = APP_ERROR_HTTP_STATUS[code];
    this.details = details;

    // Restore the prototype chain — required when extending built-in classes in TS.
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Serialises the error into a JSON-safe shape for API responses.
   * Never call this for SERVER_ERROR without sanitising first.
   */
  toJSON(): AppErrorResponse {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
      },
    };
  }

  /**
   * Returns a sanitised server error safe for any client.
   * Use this instead of toJSON() when the code is SERVER_ERROR.
   */
  toSafeJSON(): AppErrorResponse {
    if (this.code === AppErrorCode.SERVER_ERROR) {
      return {
        error: {
          code: AppErrorCode.SERVER_ERROR,
          message: "An unexpected error occurred. Please try again.",
        },
      };
    }
    return this.toJSON();
  }
}

/** Shape of the JSON body returned by API handlers on error. */
export interface AppErrorResponse {
  error: {
    code: AppErrorCode;
    message: string;
    details?: unknown;
  };
}

/**
 * Type guard — narrows an unknown caught value to `AppError`.
 *
 * @example
 * try {
 *   await createSale(ctx, input);
 * } catch (err) {
 *   if (isAppError(err)) {
 *     // err.code is typed as AppErrorCode
 *   }
 * }
 */
export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

/**
 * Convenience factory for the most common throw patterns.
 *
 * @example
 * throw appError.notFound("Product not found");
 * throw appError.forbidden("Only owners can change prices");
 * throw appError.validationError("Invalid input", zodIssues);
 */
export const appError = {
  unauthorized: (message = "Authentication required") =>
    new AppError(AppErrorCode.UNAUTHORIZED, message),

  forbidden: (message = "You do not have permission to perform this action") =>
    new AppError(AppErrorCode.FORBIDDEN, message),

  tenantViolation: (message = "Access to this resource is not permitted") =>
    new AppError(AppErrorCode.TENANT_VIOLATION, message),

  notFound: (message = "The requested resource was not found") =>
    new AppError(AppErrorCode.NOT_FOUND, message),

  validationError: (message = "Validation failed", details?: unknown) =>
    new AppError(AppErrorCode.VALIDATION_ERROR, message, details),

  conflict: (message: string, details?: unknown) =>
    new AppError(AppErrorCode.CONFLICT, message, details),

  insufficientStock: (
    message = "Insufficient stock to complete this operation",
  ) => new AppError(AppErrorCode.INSUFFICIENT_STOCK, message),

  subscriptionLimit: (message = "Your plan does not include this feature") =>
    new AppError(AppErrorCode.SUBSCRIPTION_LIMIT, message),

  invalidReturn: (message: string) =>
    new AppError(AppErrorCode.INVALID_RETURN, message),

  invalidAccount: (message: string) =>
    new AppError(AppErrorCode.INVALID_ACCOUNT, message),

  syncError: (message: string, details?: unknown) =>
    new AppError(AppErrorCode.SYNC_ERROR, message, details),

  serverError: (message = "Internal server error") =>
    new AppError(AppErrorCode.SERVER_ERROR, message),
} as const;
