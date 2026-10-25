"use client";

import { useActionState, useTransition } from "react";
import { Button } from "@components/ui/button";
import { Alert } from "@components/ui/primitives";
import { useToast } from "@components/ui/toast";
import { INITIAL_FORM_STATE } from "@shared/form-state";
import { canAdminTransition, type TicketStatus } from "@shared/support-rules";
import { adminReplyAction, adminStatusAction } from "./actions";

const LABEL: Record<TicketStatus, string> = { OPEN: "Reopen", IN_PROGRESS: "Mark in progress", RESOLVED: "Mark resolved", CLOSED: "Close" };

export function AdminReplyForm({ ticketId, disabled }: { ticketId: string; disabled: boolean }) {
  const [state, action, pending] = useActionState(adminReplyAction.bind(null, ticketId), INITIAL_FORM_STATE);
  return (
    <form action={action} className="space-y-3" key={state.ok ? state.nonce : "form"}>
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      <label htmlFor="admin-reply" className="sr-only">Reply to the customer</label>
      <textarea
        id="admin-reply"
        name="body"
        rows={4}
        maxLength={4000}
        required
        disabled={disabled}
        defaultValue={state.values?.body}
        placeholder="Write a reply to the customer…"
        className="block w-full rounded-control border border-line-strong bg-surface px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-brand-600 disabled:opacity-60"
      />
      <Button type="submit" loading={pending} disabled={disabled}>Send reply</Button>
    </form>
  );
}

export function StatusButtons({ ticketId, status }: { ticketId: string; status: TicketStatus }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const targets = (["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const).filter((to) => canAdminTransition(status, to));
  if (targets.length === 0) return <span className="text-xs text-ink-500">Closed requests cannot be changed.</span>;
  return (
    <div className="flex flex-wrap gap-2">
      {targets.map((to) => (
        <Button
          key={to}
          size="sm"
          variant={to === "CLOSED" ? "danger" : "secondary"}
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await adminStatusAction(ticketId, to);
              toast.show(r.message, r.ok ? "success" : "danger");
            })
          }
        >
          {LABEL[to]}
        </Button>
      ))}
    </div>
  );
}
