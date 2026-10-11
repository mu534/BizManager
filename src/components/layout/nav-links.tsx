"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavLinksProps {
  businessId: string;
}

const LINKS = [
  { segment: "dashboard", label: "Dashboard" },
  { segment: "sell", label: "Sell" },
  { segment: "products", label: "Products" },
  { segment: "inventory", label: "Inventory" },
  { segment: "expenses", label: "Expenses" },
  { segment: "accounts", label: "Accounts" },
  { segment: "reports", label: "Reports" },
];

export function NavLinks({ businessId }: NavLinksProps) {
  const pathname = usePathname();
  const base = `/app/${businessId}`;

  return (
    <nav className="flex items-center gap-1 overflow-x-auto">
      {LINKS.map(({ segment, label }) => {
        const href = `${base}/${segment}`;
        const active = pathname.startsWith(`${base}/${segment}`);
        return (
          <Link
            key={segment}
            href={segment === "reports" ? `${base}/reports/sales` : href}
            className={`whitespace-nowrap px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              active
                ? "bg-blue-50 text-blue-700"
                : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
