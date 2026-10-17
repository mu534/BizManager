"use client";

import Link from "next/link";
import { createContext, useActionState, useContext, useState, useTransition, type ReactNode } from "react";
import { INITIAL_FORM_STATE, type FormState } from "@shared/form-state";
import { Button, buttonClasses } from "@components/ui/button";
import { Alert } from "@components/ui/primitives";
import { Field, Input, Select, Textarea } from "@components/ui/field";
import { ConfirmDialog } from "@components/ui/dialog";
import { useToast } from "@components/ui/toast";

const Ctx = createContext<FormState>(INITIAL_FORM_STATE);

export type FormAction = (prev: FormState, formData: FormData) => Promise<FormState>;

export function ActionForm({ action, children, submitLabel = "Save", cancelHref, className }: {
  action: FormAction; children: ReactNode; submitLabel?: string; cancelHref?: string; className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL_FORM_STATE);
  return (
    <form action={formAction} className={className ?? "space-y-5"} noValidate>
      <Ctx.Provider value={state}>
        {state.message && !state.ok && <Alert tone="danger" title="Couldn't save">{state.message}</Alert>}
        {children}
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <Button type="submit" loading={pending}>{pending ? "Saving…" : submitLabel}</Button>
          {cancelHref && <Link href={cancelHref} className={buttonClasses("ghost")}>Cancel</Link>}
        </div>
      </Ctx.Provider>
    </form>
  );
}

interface BaseProps { name: string; label: string; hint?: string; required?: boolean; defaultValue?: string; className?: string }

function useFieldState(name: string, defaultValue?: string) {
  const s = useContext(Ctx);
  return { error: s.fieldErrors?.[name]?.[0] ?? null, value: s.values?.[name] ?? defaultValue ?? "", key: `${name}-${s.nonce ?? 0}` };
}
const describe = (id: string, error: string | null, hint?: string) => (error ? `${id}-error` : hint ? `${id}-hint` : undefined);

export function TextField({ name, label, hint, required, defaultValue, className, type = "text", placeholder, inputMode }: BaseProps & { type?: string; placeholder?: string; inputMode?: "text" | "numeric" | "decimal" }) {
  const f = useFieldState(name, defaultValue);
  const id = `f-${name}`;
  return (
    <Field label={label} htmlFor={id} hint={hint} error={f.error} required={required} className={className}>
      <Input key={f.key} id={id} name={name} type={type} defaultValue={f.value} placeholder={placeholder} inputMode={inputMode}
        invalid={!!f.error} aria-describedby={describe(id, f.error, hint)} aria-required={required || undefined} />
    </Field>
  );
}

export function SelectField({ name, label, hint, required, defaultValue, className, options, placeholder }: BaseProps & { options: { value: string; label: string }[]; placeholder?: string }) {
  const f = useFieldState(name, defaultValue);
  const id = `f-${name}`;
  return (
    <Field label={label} htmlFor={id} hint={hint} error={f.error} required={required} className={className}>
      <Select key={f.key} id={id} name={name} defaultValue={f.value} aria-invalid={!!f.error || undefined} aria-describedby={describe(id, f.error, hint)} aria-required={required || undefined}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Select>
    </Field>
  );
}

export function TextAreaField({ name, label, hint, defaultValue, className, placeholder }: BaseProps & { placeholder?: string }) {
  const f = useFieldState(name, defaultValue);
  const id = `f-${name}`;
  return (
    <Field label={label} htmlFor={id} hint={hint} error={f.error} className={className}>
      <Textarea key={f.key} id={id} name={name} defaultValue={f.value} placeholder={placeholder} aria-describedby={describe(id, f.error, hint)} />
    </Field>
  );
}

/** Destructive/irreversible action behind a confirmation dialog. */
export function ConfirmActionButton({ action, label, title, description, confirmLabel, successMessage }: {
  action: () => Promise<FormState | void>; label: string; title: string; description: string; confirmLabel: string; successMessage?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>{label}</Button>
      <ConfirmDialog open={open} onCancel={() => setOpen(false)} title={title} description={description} confirmLabel={confirmLabel} tone="danger" loading={pending}
        onConfirm={() => start(async () => {
          const res = await action();
          setOpen(false);
          if (res && !res.ok) toast.show(res.message ?? "Could not complete that.", "danger");
          else if (successMessage) toast.show(successMessage, "success");
        })} />
    </>
  );
}
