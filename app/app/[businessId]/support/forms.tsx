"use client";

import { useActionState } from "react";
import { Button } from "@components/ui/button";
import { Field, Input } from "@components/ui/field";
import { Alert } from "@components/ui/primitives";
import { INITIAL_FORM_STATE } from "@shared/form-state";
import { createTicketAction, replyAction } from "./actions";

const textarea =
  "block w-full rounded-control border border-line-strong bg-surface px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus-visible:outline-2 focus-visible:outline-brand-600";

export function NewTicketForm({ businessId }: { businessId: string }) {
  const [state, action, pending] = useActionState(createTicketAction.bind(null, businessId), INITIAL_FORM_STATE);
  return (
    <form action={action} className="space-y-4">
      {state.message && !state.ok && <Alert tone="danger">{state.message}</Alert>}
      <Field label="What do you need help with?" htmlFor="subject" required>
        <Input id="subject" name="subject" maxLength={120} defaultValue={state.values?.subject} required />
      </Field>
      <Field label="Details" htmlFor="body" required hint="Please do not include passwords or full account numbers.">
        <textarea id="body" name="body" rows={6} maxLength={4000} defaultValue={state.values?.body} required className={textarea} />
      </Field>
      <Button type="submit" loading={pending}>Send request</Button>
    </form>
  );
}

export function ReplyForm({ businessId, ticketId }: { businessId: string; ticketId: string }) {
  const [state, action, pending] = useActionState(replyAction.bind(null, businessId, ticketId), INITIAL_FORM_STATE);
  return (
    <form action={action} className="space-y-3" key={state.ok ? state.nonce : "form"}>
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      <label htmlFor="reply" className="sr-only">Your reply</label>
      <textarea id="reply" name="body" rows={4} maxLength={4000} defaultValue={state.values?.body} required placeholder="Write a reply…" className={textarea} />
      <Button type="submit" loading={pending}>Send reply</Button>
    </form>
  );
}
