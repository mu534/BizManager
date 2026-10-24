import Link from "next/link";

const TABS = [
  { key: "sales", label: "Sales" },
  { key: "profit", label: "Profit" },
  { key: "products", label: "Products" },
  { key: "inventory", label: "Inventory" },
  { key: "expenses", label: "Expenses" },
  { key: "branches", label: "Branches" },
] as const;

export type ReportTab = (typeof TABS)[number]["key"];

/** Shared tab bar for every report page. */
export function ReportNav({
  businessId,
  active,
  showBranches = false,
}: {
  businessId: string;
  active: ReportTab;
  /** The Branches tab is only useful (and shown) in a multi-branch business. */
  showBranches?: boolean;
}) {
  return (
    <nav aria-label="Reports" className="flex gap-1 overflow-x-auto border-b border-line">
      {TABS.filter((t) => t.key !== "branches" || showBranches || active === "branches").map((t) => (
        <Link
          key={t.key}
          href={`/app/${businessId}/reports/${t.key}`}
          aria-current={active === t.key ? "page" : undefined}
          className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition ${
            active === t.key ? "border-brand-600 text-brand-800" : "border-transparent text-ink-600 hover:text-ink-900"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
