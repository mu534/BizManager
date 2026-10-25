"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@server/services/platform-admin.service";
import { adminReply, adminSetStatus } from "@server/services/support.service";
import { replySchema, ticketStatusSchema } from "@shared/validation/support.schema";
import { isAppError } from "@shared/errors";
import type { FormState } from "@shared/form-state";

const fail = (err: unknown): string => (isAppError(err) ? err.message : "Something went wrong.");

/** The acting admin always comes from the session; the role is re-checked here and in the service. */
export async function adminReplyAction(ticketId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = replySchema.safeParse({ ticketId, body: formData.get("body") });
  if (!parsed.success) return { ok: false, message: parsed.error.flatten().fieldErrors.body?.[0] ?? "Invalid message.", nonce: Date.now() };
  try {
    const admin = await requirePlatformAdmin(["SUPPORT"]);
    await adminReply(admin, parsed.data.ticketId, parsed.data.body);
  } catch (err) {
    return { ok: false, message: fail(err), values: { body: parsed.data.body }, nonce: Date.now() };
  }
  revalidatePath(`/admin/support/${ticketId}`);
  revalidatePath("/admin/support");
  return { ok: true, message: "Reply sent.", nonce: Date.now() };
}

export async function adminStatusAction(ticketId: string, status: string): Promise<{ ok: boolean; message: string }> {
  const parsed = ticketStatusSchema.safeParse({ ticketId, status });
  if (!parsed.success) return { ok: false, message: "Invalid request." };
  try {
    const admin = await requirePlatformAdmin(["SUPPORT"]);
    await adminSetStatus(admin, parsed.data.ticketId, parsed.data.status);
  } catch (err) {
    return { ok: false, message: fail(err) };
  }
  revalidatePath(`/admin/support/${ticketId}`);
  revalidatePath("/admin/support");
  revalidatePath("/admin");
  return { ok: true, message: "Status updated." };
}
