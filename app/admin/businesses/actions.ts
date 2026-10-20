"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformAdmin, setBusinessStatus } from "@server/services/platform-admin.service";
import { isAppError } from "@shared/errors";
import type { FormState } from "@shared/form-state";

const schema = z.object({
  businessId: z.string().uuid(),
  status: z.enum(["ACTIVE", "SUSPENDED"]),
  reason: z.string().trim().min(5, "Enter a reason (at least 5 characters).").max(500),
});

export async function setStatusAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = schema.safeParse({
    businessId: formData.get("businessId"),
    status: formData.get("status"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.flatten().fieldErrors.reason?.[0] ?? "Invalid request.", nonce: Date.now() };
  }
  try {
    const admin = await requirePlatformAdmin(["SUPPORT"]);
    await setBusinessStatus(admin, parsed.data.businessId, parsed.data.status, parsed.data.reason);
    revalidatePath("/admin/businesses");
    return { ok: true, message: parsed.data.status === "SUSPENDED" ? "Business suspended." : "Business reactivated.", nonce: Date.now() };
  } catch (err) {
    return { ok: false, message: isAppError(err) ? err.message : "Something went wrong.", nonce: Date.now() };
  }
}
