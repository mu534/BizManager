"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformAdmin, updatePlanCommercials } from "@server/services/platform-admin.service";
import { parseMoneyStrict, SaleMathError } from "@shared/sale-math";
import { isAppError } from "@shared/errors";
import type { FormState } from "@shared/form-state";

const schema = z.object({
  planId: z.string().uuid(),
  price: z.string(),
  discount: z.string().regex(/^\d{1,3}(\.\d{1,2})?$/, "Discount must be a percentage like 20 or 12.5."),
});

export async function updatePlanAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = schema.safeParse({
    planId: formData.get("planId"),
    price: formData.get("price"),
    discount: formData.get("discount"),
  });
  if (!parsed.success) {
    const fe = parsed.error.flatten().fieldErrors;
    return { ok: false, message: fe.discount?.[0] ?? "Invalid request.", nonce: Date.now() };
  }
  try {
    const admin = await requirePlatformAdmin(["SUPER_ADMIN"]);
    // Plans are priced in ETB; the price field is in birr, stored as cents.
    const monthlyPriceMinor = parseMoneyStrict(parsed.data.price, "ETB", "Monthly price");
    const annualDiscountBps = Math.round(Number(parsed.data.discount) * 100);
    await updatePlanCommercials(admin, {
      planId: parsed.data.planId,
      monthlyPriceMinor,
      annualDiscountBps,
      isActive: formData.get("isActive") === "on",
    });
    revalidatePath("/admin/plans");
    return { ok: true, message: "Saved.", nonce: Date.now() };
  } catch (err) {
    if (err instanceof SaleMathError) return { ok: false, message: err.message, nonce: Date.now() };
    return { ok: false, message: isAppError(err) ? err.message : "Something went wrong.", nonce: Date.now() };
  }
}
