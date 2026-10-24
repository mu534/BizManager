"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@components/ui/button";
import { Field, Input } from "@components/ui/field";
import { Alert } from "@components/ui/primitives";
import { ConfirmDialog } from "@components/ui/dialog";
import { useToast } from "@components/ui/toast";
import { INITIAL_FORM_STATE } from "@shared/form-state";
import { createBranchAction, renameBranchAction, setBranchStatusAction, setMemberBranchAccessAction } from "./actions";

export function AddBranchForm({ businessId, disabled }: { businessId: string; disabled: boolean }) {
  const [state, action, pending] = useActionState(createBranchAction.bind(null, businessId), INITIAL_FORM_STATE);
  return (
    <form action={action} className="space-y-4" key={state.ok ? state.nonce : "form"}>
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      <div className="grid gap-4 sm:grid-cols-[1fr_1fr_12rem_auto] sm:items-end">
        <Field label="Branch name" htmlFor="branch-name" required>
          <Input id="branch-name" name="name" maxLength={80} disabled={disabled} required />
        </Field>
        <Field label="Address" htmlFor="branch-address" hint="Optional">
          <Input id="branch-address" name="address" maxLength={200} disabled={disabled} />
        </Field>
        <Field label="Phone" htmlFor="branch-phone" hint="Optional">
          <Input id="branch-phone" name="phone" maxLength={30} disabled={disabled} />
        </Field>
        <Button type="submit" loading={pending} disabled={disabled}>Add branch</Button>
      </div>
    </form>
  );
}

export function BranchRowControls({
  businessId,
  branchId,
  name,
  status,
  isDefault,
}: {
  businessId: string;
  branchId: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  isDefault: boolean;
}) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [value, setValue] = useState(name);
  const [confirmClose, setConfirmClose] = useState(false);

  const run = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      const r = await fn();
      toast.show(r.message, r.ok ? "success" : "danger");
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={`rename-${branchId}`}>Branch name</label>
      <Input id={`rename-${branchId}`} value={value} onChange={(e) => setValue(e.target.value)} maxLength={80} className="h-8 w-44 text-[13px]" disabled={pending} />
      <Button
        size="sm"
        variant="secondary"
        disabled={pending || value.trim() === name}
        onClick={() => run(() => renameBranchAction(businessId, { branchId, name: value }))}
      >
        Rename
      </Button>
      {status === "ACTIVE" ? (
        !isDefault && (
          <Button size="sm" variant="danger" disabled={pending} onClick={() => setConfirmClose(true)}>
            Close branch
          </Button>
        )
      ) : (
        <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => setBranchStatusAction(businessId, branchId, "ACTIVE"))}>
          Reopen
        </Button>
      )}
      <ConfirmDialog
        open={confirmClose}
        onCancel={() => setConfirmClose(false)}
        onConfirm={() => {
          setConfirmClose(false);
          run(() => setBranchStatusAction(businessId, branchId, "INACTIVE"));
        }}
        title={`Close ${name}?`}
        description="No new sales, expenses or stock changes can be recorded in a closed branch. All its history stays and still counts in your reports. You can reopen it later."
        confirmLabel="Close branch"
      />
    </div>
  );
}

export function MemberBranchAccess({
  businessId,
  memberId,
  memberName,
  branches,
  initial,
}: {
  businessId: string;
  memberId: string;
  memberName: string;
  branches: { id: string; name: string; inactive: boolean }[];
  initial: string[];
}) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<string[]>(initial);
  const dirty = [...selected].sort().join() !== [...initial].sort().join();

  return (
    <div className="space-y-2">
      <fieldset className="flex flex-wrap gap-x-4 gap-y-1.5" disabled={pending}>
        <legend className="sr-only">Branches {memberName} can use</legend>
        {branches.map((b) => (
          <label key={b.id} className="flex items-center gap-2 text-sm text-ink-800">
            <input
              type="checkbox"
              className="size-4 accent-brand-600"
              checked={selected.includes(b.id)}
              onChange={(e) => setSelected((cur) => (e.target.checked ? [...cur, b.id] : cur.filter((x) => x !== b.id)))}
            />
            {b.name}
            {b.inactive && <span className="text-xs text-ink-500">(closed)</span>}
          </label>
        ))}
      </fieldset>
      {selected.length === 0 && <p className="text-xs text-warning-700">With no branch selected, {memberName} cannot record anything.</p>}
      {dirty && (
        <Button
          size="sm"
          loading={pending}
          onClick={() =>
            start(async () => {
              const r = await setMemberBranchAccessAction(businessId, memberId, selected);
              toast.show(r.message, r.ok ? "success" : "danger");
            })
          }
        >
          Save access
        </Button>
      )}
    </div>
  );
}
