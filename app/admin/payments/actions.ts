"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@server/services/platform-admin.service";
import { approvePayment, rejectPayment } from "@server/services/subscription-payment.service";
import { rejectPaymentSchema } from "@shared/validation/subscription.schema";
import { isAppError } from "@shared/errors";
import type { FormState } from "@shared/form-state";
import { z } from "zod";

const idSchema = z.string().uuid();

/** The reviewer is always resolved from the session — never from the form. */
export async function approveAction(paymentId: string, _prev: FormState): Promise<FormState> {
  if (!idSchema.safeParse(paymentId).success) return { ok: false, message: "Invalid payment." };
  try {
    const admin = await requirePlatformAdmin(["FINANCE"]);
    const r = await approvePayment(admin, paymentId);
    revalidatePath("/admin/payments");
    revalidatePath("/admin");
    return {
      ok: true,
      message: r.applied ? "Approved. The subscription is active." : "Already approved — nothing changed.",
      nonce: Date.now(),
    };
  } catch (err) {
    return { ok: false, message: isAppError(err) ? err.message : "Something went wrong.", nonce: Date.now() };
  }
}

export async function rejectAction(paymentId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = rejectPaymentSchema.safeParse({ paymentId, reason: formData.get("reason") });
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.flatten().fieldErrors.reason?.[0] ?? "Invalid request.",
      values: { reason: String(formData.get("reason") ?? "") },
      nonce: Date.now(),
    };
  }
  try {
    const admin = await requirePlatformAdmin(["FINANCE"]);
    await rejectPayment(admin, parsed.data.paymentId, parsed.data.reason);
    revalidatePath("/admin/payments");
    revalidatePath("/admin");
    return { ok: true, message: "Rejected. The customer can see your reason and resubmit.", nonce: Date.now() };
  } catch (err) {
    return { ok: false, message: isAppError(err) ? err.message : "Something went wrong.", nonce: Date.now() };
  }
}
