/**
 * Support tickets — SERVER ONLY.
 *
 * Customer side: any active member of a business can raise a ticket and reply.
 * It deliberately does NOT depend on the subscription: a business whose
 * subscription lapsed must still be able to ask for help.
 *   - The business always comes from the verified TenantContext.
 *   - Owners see every ticket of their business; other members see only their own.
 *
 * Support side: platform admins with the SUPPORT role (or SUPER_ADMIN). They see
 * ticket text the customer chose to write — nothing else about the business —
 * and every status change or reply is written to the platform audit log.
 */
import "server-only";
import { prisma } from "@server/db/prisma";
import { appError } from "@shared/errors";
import type { TenantContext } from "@shared/types/auth.types";
import { requirePlatformAdmin, writePlatformAudit, type PlatformAdminContext } from "@server/services/platform-admin.service";
import {
  MAX_TICKETS_PER_DAY,
  canAdminTransition,
  canCustomerReply,
  statusAfterAdminReply,
  statusAfterCustomerReply,
  type TicketStatus,
} from "@shared/support-rules";
import type { CreateTicketInput } from "@shared/validation/support.schema";

export interface TicketSummary {
  id: string;
  subject: string;
  status: TicketStatus;
  createdAt: Date;
  updatedAt: Date;
  businessName?: string;
  createdByName?: string;
}

export interface TicketMessageView {
  id: string;
  authorKind: "CUSTOMER" | "SUPPORT";
  authorName: string;
  body: string;
  createdAt: Date;
}

export interface TicketDetail extends TicketSummary {
  messages: TicketMessageView[];
}

type TicketRow = {
  id: string;
  subject: string;
  status: TicketStatus;
  createdAt: Date;
  updatedAt: Date;
  business?: { name: string };
  createdBy?: { name: string };
};
const toSummary = (t: TicketRow): TicketSummary => ({
  id: t.id,
  subject: t.subject,
  status: t.status,
  createdAt: t.createdAt,
  updatedAt: t.updatedAt,
  businessName: t.business?.name,
  createdByName: t.createdBy?.name,
});

// ─── Customer side ────────────────────────────────────────────────────────

export async function createTicket(ctx: TenantContext, input: CreateTicketInput): Promise<{ id: string }> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recent = await prisma.supportTicket.count({ where: { businessId: ctx.businessId, createdAt: { gte: since } } });
  if (recent >= MAX_TICKETS_PER_DAY) {
    throw appError.conflict("You have opened many requests today. Please add to an existing one, or try again tomorrow.");
  }
  return prisma.$transaction(async (tx) => {
    const ticket = await tx.supportTicket.create({
      data: { businessId: ctx.businessId, createdById: ctx.userId, subject: input.subject },
    });
    await tx.supportTicketMessage.create({
      data: { ticketId: ticket.id, authorId: ctx.userId, authorKind: "CUSTOMER", body: input.body },
    });
    return { id: ticket.id };
  });
}

/** Owner: all of the business's tickets. Others: only the ones they opened. */
export async function listMyTickets(ctx: TenantContext): Promise<TicketSummary[]> {
  const rows = await prisma.supportTicket.findMany({
    where: { businessId: ctx.businessId, ...(ctx.role === "OWNER" ? {} : { createdById: ctx.userId }) },
    orderBy: { updatedAt: "desc" },
    take: 50,
    include: { createdBy: { select: { name: true } } },
  });
  return rows.map(toSummary);
}

export async function getMyTicket(ctx: TenantContext, ticketId: string): Promise<TicketDetail> {
  // Tenant + visibility enforced in the query itself; a miss is indistinguishable from "not found".
  const t = await prisma.supportTicket.findFirst({
    where: { id: ticketId, businessId: ctx.businessId, ...(ctx.role === "OWNER" ? {} : { createdById: ctx.userId }) },
    include: {
      createdBy: { select: { name: true } },
      messages: { orderBy: { createdAt: "asc" }, include: { author: { select: { name: true } } } },
    },
  });
  if (!t) throw appError.notFound("Request not found.");
  return {
    ...toSummary(t),
    messages: t.messages.map((m) => ({
      id: m.id,
      authorKind: m.authorKind,
      authorName: m.authorKind === "SUPPORT" ? "BizManager support" : m.author.name,
      body: m.body,
      createdAt: m.createdAt,
    })),
  };
}

export async function replyAsCustomer(ctx: TenantContext, ticketId: string, body: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const t = await tx.supportTicket.findFirst({
      where: { id: ticketId, businessId: ctx.businessId, ...(ctx.role === "OWNER" ? {} : { createdById: ctx.userId }) },
    });
    if (!t) throw appError.notFound("Request not found.");
    if (!canCustomerReply(t.status)) {
      throw appError.conflict("This request is closed. Please open a new one.");
    }
    await tx.supportTicketMessage.create({
      data: { ticketId: t.id, authorId: ctx.userId, authorKind: "CUSTOMER", body },
    });
    const next = statusAfterCustomerReply(t.status);
    await tx.supportTicket.update({
      where: { id: t.id },
      data: { status: next, ...(next !== t.status ? { resolvedAt: null } : {}) },
    });
  });
}

// ─── Support side ─────────────────────────────────────────────────────────

export async function adminListTickets(status?: TicketStatus): Promise<TicketSummary[]> {
  await requirePlatformAdmin(["SUPPORT"]);
  const rows = await prisma.supportTicket.findMany({
    where: status ? { status } : { status: { not: "CLOSED" } },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    take: 100,
    include: { business: { select: { name: true } }, createdBy: { select: { name: true } } },
  });
  return rows.map(toSummary);
}

export async function adminGetTicket(ticketId: string): Promise<TicketDetail> {
  await requirePlatformAdmin(["SUPPORT"]);
  const t = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    include: {
      business: { select: { name: true } },
      createdBy: { select: { name: true } },
      messages: { orderBy: { createdAt: "asc" }, include: { author: { select: { name: true } } } },
    },
  });
  if (!t) throw appError.notFound("Request not found.");
  return {
    ...toSummary(t),
    messages: t.messages.map((m) => ({
      id: m.id,
      authorKind: m.authorKind,
      authorName: m.authorKind === "SUPPORT" ? "BizManager support" : m.author.name,
      body: m.body,
      createdAt: m.createdAt,
    })),
  };
}

function assertSupportRole(admin: PlatformAdminContext): void {
  if (admin.role !== "SUPER_ADMIN" && admin.role !== "SUPPORT") {
    throw appError.forbidden("Your platform role cannot handle support requests.");
  }
}

export async function adminReply(admin: PlatformAdminContext, ticketId: string, body: string): Promise<void> {
  assertSupportRole(admin);
  await prisma.$transaction(async (tx) => {
    const t = await tx.supportTicket.findUnique({ where: { id: ticketId } });
    if (!t) throw appError.notFound("Request not found.");
    if (t.status === "CLOSED") throw appError.conflict("This request is closed.");
    await tx.supportTicketMessage.create({
      data: { ticketId: t.id, authorId: admin.userId, authorKind: "SUPPORT", body },
    });
    await tx.supportTicket.update({ where: { id: t.id }, data: { status: statusAfterAdminReply(t.status) } });
    // The message body is NOT copied into the audit log — only that a reply happened.
    await writePlatformAudit(tx, {
      actorUserId: admin.userId,
      action: "TICKET_REPLIED",
      targetType: "SupportTicket",
      targetId: t.id,
      businessId: t.businessId,
    });
  });
}

export async function adminSetStatus(admin: PlatformAdminContext, ticketId: string, to: TicketStatus): Promise<void> {
  assertSupportRole(admin);
  await prisma.$transaction(async (tx) => {
    const t = await tx.supportTicket.findUnique({ where: { id: ticketId } });
    if (!t) throw appError.notFound("Request not found.");
    const from = t.status; // captured before the update so the audit record is exact
    if (from === to) return; // idempotent
    if (!canAdminTransition(from, to)) {
      throw appError.conflict(from === "CLOSED" ? "A closed request cannot be changed." : "That status change is not allowed.");
    }
    await tx.supportTicket.update({
      where: { id: t.id },
      data: { status: to, resolvedAt: to === "RESOLVED" || to === "CLOSED" ? new Date() : null },
    });
    await writePlatformAudit(tx, {
      actorUserId: admin.userId,
      action: "TICKET_STATUS_CHANGED",
      targetType: "SupportTicket",
      targetId: t.id,
      businessId: t.businessId,
      metadata: { from, to },
    });
  });
}
