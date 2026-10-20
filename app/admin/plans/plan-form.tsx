"use client";

import { useActionState } from "react";
import { Button } from "@components/ui/button";
import { Field, Input } from "@components/ui/field";
import { INITIAL_FORM_STATE } from "@shared/form-state";
import { updatePlanAction } from "./actions";

export function PlanForm({ planId, name, priceMajor, discountPercent, isActive, canEdit }: {
  planId: string; name: string; priceMajor: string; discountPercent: string; isActive: boolean; canEdit: boolean;
}) {
  const [state, action, pending] = useActionState(updatePlanAction, INITIAL_FORM_STATE);
  return (
    <form action={action} className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto_auto]">
      <input type="hidden" name="planId" value={planId} />
      <Field label={`${name} — monthly price (ETB)`} htmlFor={`price-${planId}`}>
        <Input id={`price-${planId}`} name="price" defaultValue={priceMajor} inputMode="decimal" disabled={!canEdit} required />
      </Field>
      <Field label="Yearly discount (%)" htmlFor={`disc-${planId}`}>
        <Input id={`disc-${planId}`} name="discount" defaultValue={discountPercent} inputMode="decimal" disabled={!canEdit} required />
      </Field>
      <label className="flex h-10 items-center gap-2 text-sm text-ink-700">
        <input type="checkbox" name="isActive" defaultChecked={isActive} disabled={!canEdit} className="size-4 accent-brand-600" />
        Available
      </label>
      {canEdit && <Button type="submit" size="sm" loading={pending}>Save</Button>}
      {state.message && (
        <p role={state.ok ? "status" : "alert"} className={`text-xs sm:col-span-4 ${state.ok ? "text-success-700" : "text-danger-600"}`}>{state.message}</p>
      )}
    </form>
  );
}
