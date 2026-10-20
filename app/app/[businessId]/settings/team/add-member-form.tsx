"use client";

import { useActionState } from "react";
import { Button } from "@components/ui/button";
import { Field, Input, Select } from "@components/ui/field";
import { Alert } from "@components/ui/primitives";
import { INITIAL_FORM_STATE } from "@shared/form-state";
import { addMemberAction } from "./actions";

export function AddMemberForm({ businessId, disabled }: { businessId: string; disabled: boolean }) {
  const [state, action, pending] = useActionState(addMemberAction.bind(null, businessId), INITIAL_FORM_STATE);
  return (
    <form action={action} className="space-y-4" key={state.ok ? state.nonce : "form"}>
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      <div className="grid gap-4 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
        <Field label="Email address" htmlFor="member-email" required hint="They must already have a BizManager account.">
          <Input id="member-email" name="email" type="email" autoComplete="off" defaultValue={state.values?.email} disabled={disabled} required />
        </Field>
        <Field label="Role" htmlFor="member-role" required>
          <Select id="member-role" name="role" defaultValue="STAFF" disabled={disabled}>
            <option value="STAFF">Staff</option>
            <option value="MANAGER">Manager</option>
          </Select>
        </Field>
        <Button type="submit" loading={pending} disabled={disabled}>Add member</Button>
      </div>
    </form>
  );
}
