"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "./button";
import { cn } from "./cn";

/**
 * Accessible modal built on the native <dialog>: focus trap, Esc to close and
 * inert background come from the platform.
 */
export function Dialog({
  open, onClose, title, description, children, footer, className,
}: { open: boolean; onClose: () => void; title: string; description?: string; children?: ReactNode; footer?: ReactNode; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      aria-labelledby="dlg-title"
      className={cn("m-auto w-[calc(100%-2rem)] max-w-md rounded-hero border border-line bg-surface p-0 text-ink-900 shadow-pop backdrop:bg-ink-950/50", className)}
    >
      <div className="p-5">
        <h2 id="dlg-title" className="text-base font-semibold">{title}</h2>
        {description && <p className="mt-1 text-sm text-ink-500">{description}</p>}
        {children && <div className="mt-4">{children}</div>}
      </div>
      {footer && <div className="flex justify-end gap-2 border-t border-line bg-ink-50 px-5 py-3">{footer}</div>}
    </dialog>
  );
}

/** Confirmation flow for destructive or irreversible actions. */
export function ConfirmDialog({
  open, onCancel, onConfirm, title, description, confirmLabel = "Confirm", tone = "primary", loading,
}: { open: boolean; onCancel: () => void; onConfirm: () => void; title: string; description: string; confirmLabel?: string; tone?: "primary" | "danger"; loading?: boolean }) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={loading}>Cancel</Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
        </>
      }
    />
  );
}
