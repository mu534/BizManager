import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { adminPageGuard } from "@server/auth/require-admin-page";
import { adminGetTicket } from "@server/services/support.service";
import { PageHeader } from "@components/ui/primitives";
import { StatusBadge, TicketThread } from "@components/support/ticket-thread";
import { isAppError } from "@shared/errors";
import { AdminReplyForm, StatusButtons } from "../controls";

export const metadata: Metadata = { title: "Support request" };
export const instant = false;

export default async function AdminTicketPage({ params }: { params: Promise<{ ticketId: string }> }) {
  await adminPageGuard(["SUPPORT"]);
  const { ticketId } = await params;
  if (!z.string().uuid().safeParse(ticketId).success) notFound();
  const ticket = await adminGetTicket(ticketId).catch((err: unknown) => {
    if (isAppError(err) && err.code === "NOT_FOUND") return null;
    throw err;
  });
  if (!ticket) notFound();

  return (
    <div className="max-w-3xl space-y-6">
      <p className="text-sm"><Link href="/admin/support" className="text-brand-700 hover:underline">← All requests</Link></p>
      <PageHeader title={ticket.subject} description={`${ticket.businessName} · opened by ${ticket.createdByName}`} actions={<StatusBadge status={ticket.status} />} />
      <StatusButtons ticketId={ticket.id} status={ticket.status} />
      <TicketThread messages={ticket.messages} />
      <AdminReplyForm ticketId={ticket.id} disabled={ticket.status === "CLOSED"} />
    </div>
  );
}
