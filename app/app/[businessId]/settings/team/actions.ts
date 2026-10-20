"use server";

import { revalidatePath } from "next/cache";
import { resolveContext } from "@server/auth/resolve-context";
import { addMember, updateMember } from "@server/services/team.service";
import { addMemberSchema, updateMemberSchema } from "@shared/validation/team.schema";
import { isAppError } from "@shared/errors";
import type { FormState } from "@shared/form-state";

/**
 * The business always comes from the URL-bound argument and is verified against
 * the signed-in user's membership by resolveContext(); the service then requires
 * the OWNER role. Nothing about the actor is read from the form.
 */
export async function addMemberAction(businessId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = addMemberSchema.safeParse({ email: formData.get("email"), role: formData.get("role") });
  if (!parsed.success) {
    const fe = parsed.error.flatten().fieldErrors;
    return {
      ok: false,
      message: fe.email?.[0] ?? fe.role?.[0] ?? "Please check the form.",
      values: { email: String(formData.get("email") ?? "") },
      nonce: Date.now(),
    };
  }
  try {
    const ctx = await resolveContext(businessId);
    await addMember(ctx, parsed.data);
  } catch (err) {
    return {
      ok: false,
      message: isAppError(err) ? err.message : "Something went wrong. Please try again.",
      values: { email: parsed.data.email },
      nonce: Date.now(),
    };
  }
  revalidatePath(`/app/${businessId}/settings/team`);
  return { ok: true, message: "Team member added. They have no access to financial reports until you grant it.", nonce: Date.now() };
}

export async function updateMemberAction(
  businessId: string,
  input: { memberId: string; role?: "MANAGER" | "STAFF"; financialReportAccess?: boolean; status?: "ACTIVE" | "INACTIVE" },
): Promise<{ ok: boolean; message: string }> {
  const parsed = updateMemberSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid request." };
  try {
    const ctx = await resolveContext(businessId);
    const { memberId, ...change } = parsed.data;
    await updateMember(ctx, memberId, change);
  } catch (err) {
    return { ok: false, message: isAppError(err) ? err.message : "Something went wrong. Please try again." };
  }
  revalidatePath(`/app/${businessId}/settings/team`);
  return { ok: true, message: "Saved." };
}
