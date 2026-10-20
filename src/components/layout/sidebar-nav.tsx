"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@components/ui/cn";
import {
  IconBox, IconCart, IconChart, IconDashboard, IconReceipt,
  IconSettings, IconTag, IconUsers, IconWallet,
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
  users:     IconUsers,
};

/** Desktop sidebar navigation with active state from the current URL. */
export function SidebarNav({ groups, base }: { groups: SerializedNavGroup[]; base: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {groups.map((g) => (
        <div key={g.label}>
          <p className="px-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-400">
            {g.label}
          </p>
          <ul className="space-y-0.5">
            {g.items.map((item) => {
              const href = `${base}${item.path}`;
              const active = item.exact
                ? pathname === href
                : pathname === href || pathname.startsWith(`${href}/`);
              const Icon = ICON_MAP[item.iconKey];
              return (
                <li key={item.path}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-control px-2.5 py-2 text-sm font-medium transition",
                      active
                        ? "bg-brand-50 text-brand-800"
                        : "text-ink-600 hover:bg-ink-100 hover:text-ink-900",
                    )}
                  >
                    <Icon size={18} className={active ? "text-brand-600" : "text-ink-400"} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
