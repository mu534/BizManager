import type { Metadata } from "next";
import Link from "next/link";
import { adminPageGuard } from "@server/auth/require-admin-page";
import { adminListTickets } from "@server/services/support.service";
import { Card, EmptyState, PageHeader } from "@components/ui/primitives";
import { formatDateTime } from "@components/ui/format";
import { StatusBadge } from "@components/support/ticket-thread";
import { isTicketStatus } from "@shared/support-rules";

export const metadata: Metadata = { title: "Support" };
export const instant = false;

const FILTERS = [
  { key: "", label: "Active" },
  { key: "OPEN", label: "Open" },
  { key: "IN_PROGRESS", label: "In progress" },
  { key: "RESOLVED", label: "Resolved" },
  { key: "CLOSED", label: "Closed" },
] as const;

export default async function AdminSupportPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await adminPageGuard(["SUPPORT"]);
  const sp = await searchParams;
  const status = isTicketStatus(sp.status) ? sp.status : undefined;
  const tickets = await adminListTickets(status);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Support requests"
        description="You see only what the customer wrote in the request — not their sales, stock or financial reports."
      />
      <nav aria-label="Filter" className="flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key ? `/admin/support?status=${f.key}` : "/admin/support"}
            aria-current={(status ?? "") === f.key ? "true" : undefined}
            className={`rounded-control px-3 py-1.5 text-[13px] font-medium ${(status ?? "") === f.key ? "bg-ink-900 text-white" : "border border-line-strong text-ink-700 hover:bg-ink-50"}`}
          >
            {f.label}
          </Link>
        ))}
      </nav>
      <Card>
        {tickets.length === 0 ? (
          <EmptyState title="No requests" description="Nothing matches this filter." />
        ) : (
          <ul className="divide-y divide-line">
            {tickets.map((t) => (
              <li key={t.id}>
                <Link href={`/admin/support/${t.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-ink-50 sm:px-5">
                  <span>
                    <span className="block font-medium text-ink-900">{t.subject}</span>
                    <span className="block text-xs text-ink-500">{t.businessName} · {t.createdByName} · updated {formatDateTime(t.updatedAt)}</span>
                  </span>
                  <StatusBadge status={t.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
