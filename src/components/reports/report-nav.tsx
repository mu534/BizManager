import Link from "next/link";

const NAV_ITEMS = [
  { key: "sales", label: "Sales", href: (id: string) => `/app/${id}/reports/sales` },
  { key: "expenses", label: "Expenses", href: (id: string) => `/app/${id}/reports/expenses` },
  { key: "profit", label: "Profit", href: (id: string) => `/app/${id}/reports/profit` },
  { key: "inventory", label: "Inventory", href: (id: string) => `/app/${id}/reports/inventory` },
  { key: "products", label: "Products", href: (id: string) => `/app/${id}/reports/products` },
] as const;

type NavKey = (typeof NAV_ITEMS)[number]["key"];

interface ReportNavProps {
  businessId: string;
  active: NavKey;
}

export function ReportNav({ businessId, active }: ReportNavProps) {
  return (
    <nav
      aria-label="Report sections"
      className="flex gap-1 overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 p-1"
    >
      {NAV_ITEMS.map((item) => {
        const isActive = item.key === active;
        return (
          <Link
            key={item.key}
            href={item.href(businessId)}
            aria-current={isActive ? "page" : undefined}
            className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              isActive
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
