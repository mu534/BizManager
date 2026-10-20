"use client";

import { useActionState } from "react";
import { Button } from "@components/ui/button";
import { Input } from "@components/ui/field";
import { INITIAL_FORM_STATE } from "@shared/form-state";
import { setStatusAction } from "./actions";

export function StatusForm({ businessId, current }: { businessId: string; current: "ACTIVE" | "SUSPENDED" | "DELETED" }) {
  const [state, action, pending] = useActionState(setStatusAction, INITIAL_FORM_STATE);
  if (current === "DELETED") return <span className="text-xs text-ink-500">Deleted</span>;
  const next = current === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
  return (
    <form action={action} className="flex min-w-60 items-start gap-2">
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="status" value={next} />
      <Input name="reason" required maxLength={500} placeholder="Reason (audited)" aria-label="Reason" className="h-8 text-[13px]" />
      <Button type="submit" size="sm" variant={next === "SUSPENDED" ? "danger" : "secondary"} loading={pending}>
        {next === "SUSPENDED" ? "Suspend" : "Reactivate"}
      </Button>
      {state.message && (
        <span role={state.ok ? "status" : "alert"} className={`self-center text-xs ${state.ok ? "text-success-700" : "text-danger-600"}`}>
          {state.message}
        </span>
      )}
    </form>
  );
}
