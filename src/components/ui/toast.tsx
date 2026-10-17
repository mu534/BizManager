"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { cn } from "./cn";
import { IconAlert, IconCheck, IconClose, IconInfo } from "./icons";

type ToastTone = "success" | "danger" | "info";
interface ToastItem { id: number; tone: ToastTone; message: string }
interface ToastApi { show: (message: string, tone?: ToastTone) => void }

const Ctx = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(Ctx);
  if (!api) throw new Error("useToast must be used inside <ToastProvider>.");
  return api;
}

const STYLES: Record<ToastTone, string> = {
  success: "border-success-600/30 bg-success-50 text-success-700",
  danger: "border-danger-600/30 bg-danger-50 text-danger-700",
  info: "border-info-600/30 bg-info-50 text-info-700",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), []);
  const show = useCallback((message: string, tone: ToastTone = "info") => {
    const id = Date.now() + Math.random();
    setItems((l) => [...l.slice(-3), { id, tone, message }]);
    setTimeout(() => dismiss(id), tone === "danger" ? 8000 : 4500);
  }, [dismiss]);
  const api = useMemo(() => ({ show }), [show]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:items-end lg:px-6">
        {items.map((t) => {
          const Icon = t.tone === "success" ? IconCheck : t.tone === "danger" ? IconAlert : IconInfo;
          return (
            <div key={t.id} className={cn("pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-card border px-3.5 py-3 text-sm shadow-pop", STYLES[t.tone])}>
              <Icon size={18} className="mt-0.5 shrink-0" />
              <p className="flex-1">{t.message}</p>
              <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss" className="rounded p-0.5 hover:bg-black/5"><IconClose size={16} /></button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}
