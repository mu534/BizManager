import Link from "next/link";
import { FEATURE_KEYS, hasFeature } from "@server/services/subscription.service";

/**
 * "Export CSV" for a report. Shown as a button only when the plan includes
 * exports (the export route enforces this again on the server); otherwise a
 * short note points to the plan page. The link carries the page's filters.
 */
export async function ExportButton({
  businessId,
  kind,
  range,
  from,
  to,
  branch,
}: {
  businessId: string;
  kind: "sales" | "profit" | "expenses" | "inventory";
  range?: string;
  from?: string;
  to?: string;
  branch?: string;
}) {
  const entitled = await hasFeature(businessId, FEATURE_KEYS.REPORT_EXPORTS).catch(() => false);
  if (!entitled) {
    return (
      <p className="text-xs text-ink-500">
        CSV export is part of the Pro plan.{" "}
        <Link href={`/app/${businessId}/settings/subscription`} className="font-medium text-brand-700 underline">
          View plans
        </Link>
      </p>
    );
  }
  const q = new URLSearchParams();
  if (range) q.set("range", range);
  if (from) q.set("from", from);
  if (to) q.set("to", to);
  if (branch) q.set("branch", branch);
  return (
    <a
      href={`/api/${businessId}/reports/${kind}/export?${q.toString()}`}
      className="inline-flex h-9 items-center rounded-control border border-line-strong bg-surface px-3 text-[13px] font-medium text-ink-800 hover:bg-ink-50 focus-visible:outline-2 focus-visible:outline-brand-600"
    >
      Export CSV
    </a>
  );
}
