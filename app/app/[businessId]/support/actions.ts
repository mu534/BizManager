"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { resolveContext } from "@server/auth/resolve-context";
import { createTicket, replyAsCustomer } from "@server/services/support.service";
import { createTicketSchema, replySchema } from "@shared/validation/support.schema";
import { isAppError } from "@shared/errors";
import type { FormState } from "@shared/form-state";

const fail = (err: unknown): string => (isAppError(err) ? err.message : "Something went wrong. Please try again.");

/** The business and the author come from the verified session — never from the form. */
export async function createTicketAction(businessId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = createTicketSchema.safeParse({ subject: formData.get("subject"), body: formData.get("body") });
  if (!parsed.success) {
    const fe = parsed.error.flatten().fieldErrors;
    return {
      ok: false,
      message: fe.subject?.[0] ?? fe.body?.[0] ?? "Please check the form.",
      values: { subject: String(formData.get("subject") ?? ""), body: String(formData.get("body") ?? "") },
      nonce: Date.now(),
    };
  }
  let ticketId: string;
  try {
    ticketId = (await createTicket(await resolveContext(businessId), parsed.data)).id;
  } catch (err) {
    return { ok: false, message: fail(err), values: { subject: parsed.data.subject, body: parsed.data.body }, nonce: Date.now() };
  }
  revalidatePath(`/app/${businessId}/support`);
  redirect(`/app/${businessId}/support/${ticketId}`);
}

export async function replyAction(businessId: string, ticketId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = replySchema.safeParse({ ticketId, body: formData.get("body") });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.flatten().fieldErrors.body?.[0] ?? "Invalid message.", nonce: Date.now() };
  }
  try {
    await replyAsCustomer(await resolveContext(businessId), parsed.data.ticketId, parsed.data.body);
  } catch (err) {
    return { ok: false, message: fail(err), values: { body: parsed.data.body }, nonce: Date.now() };
  }
  revalidatePath(`/app/${businessId}/support/${ticketId}`);
  return { ok: true, message: "Message sent.", nonce: Date.now() };
}
