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
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2 9m5-9v9m4-9v9m1-10h.01" />
      </svg>
    ),
  },
  {
    segment: "products",
    label: "Products",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
  },
  {
    segment: "expenses",
    label: "Expenses",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    segment: "reports",
    label: "Reports",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
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
      className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-200 md:hidden"
      aria-label="Mobile navigation"
    >
      <div className="grid grid-cols-4">
        {LINKS.map(({ segment, label, icon }) => {
          const href =
            segment === "reports" ? `${base}/reports/sales` : `${base}/${segment}`;
          const active = pathname.startsWith(`${base}/${segment}`);
          return (
            <Link
              key={segment}
              href={href}
              className={`flex flex-col items-center gap-0.5 py-2 px-1 min-h-[56px] justify-center text-xs font-medium transition-colors ${
                active ? "text-blue-600" : "text-gray-500 hover:text-gray-900"
              }`}
              aria-current={active ? "page" : undefined}
            >
              <span className={active ? "text-blue-600" : "text-gray-400"}>
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
