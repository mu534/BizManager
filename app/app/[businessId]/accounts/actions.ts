"use server";

import { redirect } from "next/navigation";
import { resolveContext } from "@server/auth/resolve-context";
import { createAccount } from "@server/services/financial.service";
import { createAccountSchema } from "@shared/validation/financial.schema";
import { isAppError } from "@shared/errors";
import type { FormState } from "@shared/form-state";

export async function createAccountAction(
  businessId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const raw = {
    name: formData.get("name"),
    type: formData.get("type"),
    openingBalance: formData.get("openingBalance") || "0",
  };

  const parsed = createAccountSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors as Record<string, string[]>;
    return {
      ok: false,
      message: "Please fix the errors below.",
      fieldErrors,
      values: { name: String(raw.name ?? ""), type: String(raw.type ?? ""), openingBalance: String(raw.openingBalance ?? "0") },
      nonce: Date.now(),
    };
  }

  try {
    const ctx = await resolveContext(businessId);
    await createAccount(ctx, parsed.data);
  } catch (err) {
    if (isAppError(err)) {
      return { ok: false, message: err.message, nonce: Date.now() };
    }
    return { ok: false, message: "Something went wrong. Please try again.", nonce: Date.now() };
  }

  redirect(`/app/${businessId}/accounts`);
}
