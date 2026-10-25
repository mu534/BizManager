"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface BottomNavProps {
  businessId: string;
}

const LINKS = [
  {
    segment: "sell",
    label: "Sell",
    href: (base: string) => `${base}/sell`,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2 9m5-9v9m4-9v9m1-10h.01" />
      </svg>
    ),
  },
  {
    segment: "products",
    label: "Products",
    href: (base: string) => `${base}/products`,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
  },
  {
    segment: "inventory",
    label: "Inventory",
    href: (base: string) => `${base}/inventory`,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
      </svg>
    ),
  },
  {
    segment: "expenses",
    label: "Expenses",
    href: (base: string) => `${base}/expenses`,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    segment: "reports",
    label: "Reports",
    href: (base: string) => `${base}/reports/sales`,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
];

export function BottomNav({ businessId }: BottomNavProps) {
  const pathname = usePathname();
  const base = `/app/${businessId}`;

  return (
    <nav
      role="navigation"
      aria-label="Mobile navigation"
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white md:hidden"
    >
      <div className="grid grid-cols-5">
        {LINKS.map(({ segment, label, href, icon }) => {
          const linkHref = href(base);
          const active = pathname.startsWith(`${base}/${segment}`);
          return (
            <Link
              key={segment}
              href={linkHref}
              className={`flex min-h-[44px] flex-col items-center justify-center gap-0.5 px-1 py-2 text-xs font-medium transition-colors ${
                active ? "text-blue-700" : "text-gray-500 hover:text-gray-900"
              }`}
              aria-current={active ? "page" : undefined}
            >
              <span className={active ? "text-blue-700" : "text-gray-400"}>
                {icon}
              </span>
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
