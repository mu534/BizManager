import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { resolveContext } from "@server/auth/resolve-context";
import { listMyTickets } from "@server/services/support.service";
import { Card, CardHeader, EmptyState, PageHeader } from "@components/ui/primitives";
import { formatDateTime } from "@components/ui/format";
import { StatusBadge } from "@components/support/ticket-thread";
import { NewTicketForm } from "./forms";

export const metadata: Metadata = { title: "Support" };
// Reads session + business-scoped DB data on every request — cannot prerender.
export const instant = false;

export default async function SupportPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const ctx = await resolveContext(businessId).catch(() => null);
  if (!ctx) redirect("/sign-in");
  const tickets = await listMyTickets(ctx);

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Support" description="Ask the BizManager team for help. You can do this even if your subscription has ended." />

      <Card>
        <CardHeader title="New request" />
        <div className="px-4 py-4 sm:px-5">
          <NewTicketForm businessId={businessId} />
        </div>
      </Card>

      <Card>
        <CardHeader title="Your requests" description={ctx.role === "OWNER" ? "Everyone in your business." : "Requests you opened."} />
        {tickets.length === 0 ? (
          <EmptyState title="No requests yet" description="When you ask for help it will appear here." />
        ) : (
          <ul className="divide-y divide-line">
            {tickets.map((t) => (
              <li key={t.id}>
                <Link href={`/app/${businessId}/support/${t.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-ink-50 sm:px-5">
                  <span>
                    <span className="block font-medium text-ink-900">{t.subject}</span>
                    <span className="block text-xs text-ink-500">
                      {t.createdByName ? `${t.createdByName} · ` : ""}updated {formatDateTime(t.updatedAt)}
                    </span>
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
