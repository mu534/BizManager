/**
 * User service — SERVER ONLY.
 *
 * Manages the application-level User record in PostgreSQL.
 * Firebase proves identity; this service creates/retrieves the
 * corresponding internal user record.
 */
import "server-only";
import type { DecodedIdToken } from "firebase-admin/auth";
import type { User } from "@prisma/client";
import { prisma } from "@server/db/prisma";
import { appError } from "@shared/errors";
import type { UserIdentityContext } from "@shared/types/auth.types";

/**
 * Find or create the application User for a verified Firebase identity.
 *
 * This is idempotent: calling it multiple times with the same firebaseUid
 * returns the same User record. The `upsert` ensures that concurrent
 * sign-ins (e.g. two tabs) do not create duplicate users.
 *
 * The name and email are updated on each sign-in to keep them current
 * with the Firebase profile (e.g. after a Google account name change).
 */
export async function upsertUserFromFirebase(
  decoded: DecodedIdToken,
): Promise<User> {
  const firebaseUid = decoded.uid;
  const email = decoded.email ?? null;
  const name = decoded.name ?? decoded.email ?? "User";

  const user = await prisma.user.upsert({
    where: { firebaseUid },
    update: {
      // Refresh display name and email on every sign-in.
      name,
      email,
    },
    create: {
      firebaseUid,
      name,
      email,
    },
  });

  return user;
}

/**
 * Load an application User by internal userId.
 * Throws NOT_FOUND if the user does not exist or is deleted.
 */
export async function getUserById(userId: string): Promise<User> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user || user.status === "DELETED") {
    throw appError.notFound("User not found.");
  }

  if (user.status === "SUSPENDED") {
    throw appError.forbidden(
      "Your account has been suspended. Contact support.",
    );
  }

  return user;
}

/**
 * Resolve a lightweight UserIdentityContext from an internal userId.
 * Used during onboarding and business-selection before a TenantContext exists.
 */
export async function resolveUserIdentity(
  userId: string,
): Promise<UserIdentityContext> {
  const user = await getUserById(userId);
  return {
    userId: user.id,
    firebaseUid: user.firebaseUid,
    name: user.name,
    email: user.email,
  };
}
