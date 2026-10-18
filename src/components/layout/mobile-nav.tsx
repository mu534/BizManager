"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@components/ui/cn";
import { Dialog } from "@components/ui/dialog";
import {
  IconBox, IconCart, IconDashboard, IconMore, IconReceipt,
  IconSettings, IconTag, IconWallet, IconChart,
} from "@components/ui/icons";
import type { IconProps } from "@components/ui/icons";
import type { SerializedNavGroup, IconKey } from "./nav-config";
import type { ComponentType } from "react";

const ICON_MAP: Record<IconKey, ComponentType<IconProps>> = {
  dashboard: IconDashboard,
  cart:      IconCart,
  receipt:   IconReceipt,
  box:       IconBox,
  tag:       IconTag,
  wallet:    IconWallet,
  chart:     IconChart,
  settings:  IconSettings,
};

const PRIMARY: { label: string; path: string; iconKey: IconKey; exact?: boolean }[] = [
  { label: "Home",  path: "/dashboard",    iconKey: "dashboard" },
  { label: "Sell",  path: "/sell",         iconKey: "cart", exact: true },
  { label: "Sales", path: "/sell/history", iconKey: "receipt" },
  { label: "Stock", path: "/inventory",    iconKey: "box" },
];

/** Compact bottom bar: four daily tasks + a "More" sheet with everything else. */
export function MobileNav({ groups, base }: { groups: SerializedNavGroup[]; base: string }) {
  const pathname = usePathname();
  const [more, setMore] = useState(false);
  const cell = "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium";

  return (
    <>
      <nav
        aria-label="Primary"
        className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur lg:hidden"
      >
        <ul className="flex">
          {PRIMARY.map((i) => {
            const href = `${base}${i.path}`;
            const active = i.exact
              ? pathname === href
              : pathname === href || pathname.startsWith(`${href}/`);
            const Icon = ICON_MAP[i.iconKey];
            return (
              <li key={i.path} className="flex flex-1">
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(cell, active ? "text-brand-700" : "text-ink-500")}
                >
                  <Icon size={21} />
                  {i.label}
                </Link>
              </li>
            );
          })}
          <li className="flex flex-1">
            <button
              type="button"
              onClick={() => setMore(true)}
              className={cn(cell, "text-ink-500")}
              aria-haspopup="dialog"
            >
              <IconMore size={21} />More
            </button>
          </li>
        </ul>
      </nav>

      <Dialog open={more} onClose={() => setMore(false)} title="All sections" className="max-h-[80dvh] overflow-y-auto">
        <div
          className="space-y-4"
          onClick={(e) => { if ((e.target as HTMLElement).closest("a")) setMore(false); }}
        >
          {groups.map((g) => (
            <div key={g.label}>
              <p className="pb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-400">
                {g.label}
              </p>
              <ul>
                {g.items.map((item) => {
                  const Icon = ICON_MAP[item.iconKey];
                  return (
                    <li key={item.path}>
                      <Link
                        href={`${base}${item.path}`}
                        className="flex items-center gap-3 rounded-control px-2 py-2.5 text-sm font-medium text-ink-800 hover:bg-ink-50"
                      >
                        <Icon size={18} className="text-ink-400" />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </Dialog>
    </>
  );
}
