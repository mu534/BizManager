"use client";

import { useActionState, useState } from "react";
import { Button } from "@components/ui/button";
import { Input } from "@components/ui/field";
import { ConfirmDialog } from "@components/ui/dialog";
import { INITIAL_FORM_STATE, type FormState } from "@shared/form-state";
import { approveAction, rejectAction } from "./actions";

export function ReviewControls({ paymentId, summary }: { paymentId: string; summary: string }) {
  const [confirming, setConfirming] = useState(false);
  const [approveState, approve, approving] = useActionState(approveAction.bind(null, paymentId), INITIAL_FORM_STATE);
  const [rejectState, reject, rejecting] = useActionState(rejectAction.bind(null, paymentId), INITIAL_FORM_STATE);
  const note = (s: FormState) =>
    s.message ? (
      <p role={s.ok ? "status" : "alert"} className={`text-xs ${s.ok ? "text-success-700" : "text-danger-600"}`}>
        {s.message}
      </p>
    ) : null;

  return (
    <div className="flex min-w-64 flex-col gap-2">
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => setConfirming(true)} loading={approving}>
          Approve
        </Button>
      </div>
      {note(approveState)}
      <form
        action={reject}
        className="flex items-start gap-2"
        aria-label="Reject payment"
      >
        <Input
          name="reason"
          placeholder="Reason shown to customer"
          maxLength={500}
          required
          aria-label="Rejection reason"
          className="h-8 text-[13px]"
          defaultValue={rejectState.values?.reason}
          key={rejectState.nonce}
        />
        <Button type="submit" size="sm" variant="danger" loading={rejecting}>
          Reject
        </Button>
      </form>
      {note(rejectState)}

      <ConfirmDialog
        open={confirming}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          // useActionState action must run inside a transition; a form submit is simplest.
          const f = document.getElementById(`approve-${paymentId}`);
          if (f instanceof HTMLFormElement) f.requestSubmit();
        }}
        title="Approve this payment?"
        description={`${summary} Approving grants the subscription period immediately. Only approve after confirming the money arrived.`}
        confirmLabel="Approve and activate"
      />
      <form id={`approve-${paymentId}`} action={approve} hidden />
    </div>
  );
}
