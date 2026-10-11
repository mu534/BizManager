/**
 * Firebase ID token verification — SERVER ONLY.
 *
 * Wraps Firebase Admin's token verification and maps Firebase errors
 * to typed AppErrors. The verified DecodedIdToken is the authoritative
 * identity proof — never trust a UID sent directly by the client.
 */
import "server-only";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";
import { adminApp } from "./firebase-admin";
import { appError } from "@shared/errors";

/**
 * Verify a Firebase ID token and return the decoded payload.
 * Throws AppError(UNAUTHORIZED) if the token is missing, expired, or invalid.
 */
export async function verifyFirebaseToken(
  idToken: string | undefined | null,
): Promise<DecodedIdToken> {
  if (!idToken) {
    throw appError.unauthorized("No authentication token provided.");
  }

  try {
    const decoded = await getAuth(adminApp).verifyIdToken(idToken);
    return decoded;
  } catch (err) {
    // Firebase Admin throws objects with a `code` property.
    const code =
      err instanceof Object && "code" in err ? String(err.code) : "";

    if (
      code === "auth/id-token-expired" ||
      code === "auth/session-cookie-expired"
    ) {
      throw appError.unauthorized(
        "Your session has expired. Please sign in again.",
      );
    }

    if (
      code === "auth/id-token-revoked" ||
      code === "auth/session-cookie-revoked"
    ) {
      throw appError.unauthorized(
        "Your session has been revoked. Please sign in again.",
      );
    }

    // Any other Firebase error — treat as invalid/unauthorized.
    throw appError.unauthorized("Invalid authentication token.");
  }
}
