"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@components/ui/cn";
import type { NavGroup } from "./nav-config";

/** Desktop sidebar navigation with active state from the current URL. */
export function SidebarNav({ groups, base }: { groups: NavGroup[]; base: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {groups.map((g) => (
        <div key={g.label}>
          <p className="px-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-400">{g.label}</p>
          <ul className="space-y-0.5">
            {g.items.map((item) => {
              const active = item.match(pathname, base);
              const Icon = item.icon;
              return (
                <li key={item.path}>
                  <Link
                    href={`${base}${item.path}`}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-control px-2.5 py-2 text-sm font-medium transition",
                      active ? "bg-brand-50 text-brand-800" : "text-ink-600 hover:bg-ink-100 hover:text-ink-900",
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
