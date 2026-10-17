"use client";

import Link from "next/link";
import { Dropdown } from "@components/ui/dropdown";
import { IconChevronDown } from "@components/ui/icons";
import SignOutButton from "./sign-out-button";

export interface BusinessOption { id: string; name: string }

export function AccountMenu({ name, email, roleLabel, businesses, currentId }: {
  name: string; email: string | null; roleLabel: string; businesses: BusinessOption[]; currentId: string;
}) {
  const initials = name.split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase() || "U";
  return (
    <Dropdown
      label="Account menu"
      trigger={
        <span className="flex items-center gap-2 py-1 pl-1 pr-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-800 text-xs font-semibold text-white">{initials}</span>
          <IconChevronDown size={14} className="text-ink-500" />
        </span>
      }
    >
      <div className="border-b border-line px-3 pb-2.5 pt-1.5">
        <p className="truncate text-sm font-semibold text-ink-900">{name}</p>
        {email && <p className="truncate text-xs text-ink-500">{email}</p>}
        <p className="mt-0.5 text-xs text-ink-500">{roleLabel}</p>
      </div>
      {businesses.length > 1 && (
        <div className="border-b border-line py-1.5">
          <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-400">Switch business</p>
          {businesses.map((b) => (
            <Link key={b.id} role="menuitem" href={`/app/${b.id}/dashboard`} className="block rounded px-3 py-1.5 text-sm text-ink-800 hover:bg-ink-50" aria-current={b.id === currentId ? "true" : undefined}>
              {b.name}{b.id === currentId && " ✓"}
            </Link>
          ))}
        </div>
      )}
      <div className="px-3 pt-2"><SignOutButton /></div>
    </Dropdown>
  );
}
