import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { resolveContext } from "@server/auth/resolve-context";
import { getMyTicket } from "@server/services/support.service";
import { Alert, PageHeader } from "@components/ui/primitives";
import { StatusBadge, TicketThread } from "@components/support/ticket-thread";
import { canCustomerReply } from "@shared/support-rules";
import { isAppError } from "@shared/errors";
import { ReplyForm } from "../forms";

export const metadata: Metadata = { title: "Support request" };
// Reads session + business-scoped DB data on every request — cannot prerender.
export const instant = false;

export default async function TicketPage({ params }: { params: Promise<{ businessId: string; ticketId: string }> }) {
  const { businessId, ticketId } = await params;
  if (!z.string().uuid().safeParse(ticketId).success) notFound();
  const ctx = await resolveContext(businessId).catch(() => null);
  if (!ctx) redirect("/sign-in");

  const ticket = await getMyTicket(ctx, ticketId).catch((err: unknown) => {
    if (isAppError(err) && err.code === "NOT_FOUND") return null;
    throw err;
  });
  if (!ticket) notFound();

  return (
    <div className="max-w-3xl space-y-6">
      <p className="text-sm"><Link href={`/app/${businessId}/support`} className="text-brand-700 hover:underline">← All requests</Link></p>
      <PageHeader title={ticket.subject} description={undefined} actions={<StatusBadge status={ticket.status} />} />
      <TicketThread messages={ticket.messages} />
      {canCustomerReply(ticket.status) ? (
        <ReplyForm businessId={businessId} ticketId={ticket.id} />
      ) : (
        <Alert tone="info">This request is closed. If you still need help, please open a new one.</Alert>
      )}
    </div>
  );
}
