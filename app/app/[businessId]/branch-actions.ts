"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { resolveContext } from "@server/auth/resolve-context";
import { branchCookieName } from "@server/branch/current-branch";
import { isAppError } from "@shared/errors";

/**
 * Remember which branch the member is working in. resolveContext() verifies the
 * branch belongs to this business AND that the member may use it before the
 * preference is saved; the preference is re-verified on every request anyway.
 */
export async function switchBranchAction(
  businessId: string,
  branchId: string,
): Promise<{ ok: boolean; message?: string }> {
  if (!z.string().uuid().safeParse(branchId).success) return { ok: false, message: "Invalid branch." };
  try {
    await resolveContext(businessId, branchId);
  } catch (err) {
    return { ok: false, message: isAppError(err) ? err.message : "Could not switch branch." };
  }
  (await cookies()).set(branchCookieName(businessId), branchId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath(`/app/${businessId}`, "layout");
  return { ok: true };
}
