"use server";

import { redirect } from "next/navigation";
import { resolveContext } from "@server/auth/resolve-context";
import { createCustomer, receiveCustomerPayment, updateCustomer } from "@server/services/customer.service";
import { assertSubscriptionActive } from "@server/services/subscription.service";
import { prisma } from "@server/db/prisma";
import { createCustomerSchema, receiveCustomerPaymentSchema } from "@shared/validation/customer.schema";
import { isAppError } from "@shared/errors";
import { Money } from "@shared/money";
import type { FormState } from "@shared/form-state";

const str = (v: FormDataEntryValue | null): string => (typeof v === "string" ? v : "");
const fail = (message: string, extra: Partial<FormState> = {}): FormState => ({
  ok: false,
  message,
  nonce: Date.now(),
  ...extra,
});

export async function createCustomerAction(
  businessId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const raw = { name: str(formData.get("name")), phone: str(formData.get("phone")), notes: str(formData.get("notes")) };
  const parsed = createCustomerSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("Please fix the errors below.", {
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      values: raw,
    });
  }

  let customerId: string;
  try {
    const ctx = await resolveContext(businessId);
    if (ctx.role === "STAFF") return fail("Only owners and managers can add customers.", { values: raw });
    await assertSubscriptionActive(ctx);
    const customer = await createCustomer(ctx, parsed.data);
    customerId = customer.id;
  } catch (err) {
    return fail(isAppError(err) ? err.message : "Something went wrong. Please try again.", { values: raw });
  }
  redirect(`/app/${businessId}/customers/${customerId}`);
}

export async function receivePaymentAction(
  businessId: string,
  customerId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const raw = {
    accountId: str(formData.get("accountId")),
    amount: str(formData.get("amount")),
    operationId: str(formData.get("operationId")),
    notes: str(formData.get("notes")),
  };
  const parsed = receiveCustomerPaymentSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("Please fix the errors below.", {
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      values: raw,
    });
  }

  try {
    const ctx = await resolveContext(businessId);
    const business = await prisma.business.findUnique({ where: { id: businessId }, select: { currency: true } });
    const amountMinor = Money.parseInput(parsed.data.amount, business?.currency ?? "ETB");
    if (amountMinor === null || amountMinor <= 0) {
      return fail("Enter an amount greater than zero.", { fieldErrors: { amount: ["Enter a valid amount"] }, values: raw });
    }
    await receiveCustomerPayment(ctx, {
      customerId,
      accountId: parsed.data.accountId,
      amountMinor,
      operationId: parsed.data.operationId,
      notes: parsed.data.notes,
    });
  } catch (err) {
    return fail(isAppError(err) ? err.message : "Something went wrong. Please try again.", { values: raw });
  }
  redirect(`/app/${businessId}/customers/${customerId}`);
}

export async function updateCustomerAction(
  businessId: string,
  customerId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const raw = { name: str(formData.get("name")), phone: str(formData.get("phone")), notes: str(formData.get("notes")) };
  const parsed = createCustomerSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("Please fix the errors below.", {
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      values: raw,
    });
  }
  try {
    const ctx = await resolveContext(businessId);
    await assertSubscriptionActive(ctx);
    await updateCustomer(ctx, customerId, parsed.data);
  } catch (err) {
    return fail(isAppError(err) ? err.message : "Something went wrong. Please try again.", { values: raw });
  }
  redirect(`/app/${businessId}/customers/${customerId}`);
}