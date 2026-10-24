"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@components/ui/toast";
import { switchBranchAction } from "../../../app/app/[businessId]/branch-actions";

export interface BranchOption {
  id: string;
  name: string;
}

/**
 * Branch selector. Rendered only when the member can use several branches. The
 * choice is a saved preference; the server re-checks access on every request.
 * Needs a connection (it is a server action) — offline, the current branch stays.
 */
export function BranchSwitcher({
  businessId,
  branches,
  currentId,
}: {
  businessId: string;
  branches: BranchOption[];
  currentId: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();

  return (
    <div className="min-w-0">
      <label htmlFor="branch-switcher" className="sr-only">
        Branch
      </label>
      <select
        id="branch-switcher"
        value={currentId}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          start(async () => {
            try {
              const r = await switchBranchAction(businessId, next);
              if (!r.ok) toast.show(r.message ?? "Could not switch branch.", "danger");
              router.refresh();
            } catch {
              toast.show("Reconnect to the internet to switch branch.", "danger");
            }
          });
        }}
        className="h-8 max-w-[11rem] truncate rounded-control border border-line-strong bg-surface px-2 text-[13px] font-medium text-ink-800 focus-visible:outline-2 focus-visible:outline-brand-600 disabled:opacity-60 sm:max-w-[14rem]"
      >
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
    </div>
  );
}
