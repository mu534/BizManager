import { describe, it, expect, vi, beforeEach } from "vitest";

type T = { id: string; businessId: string; createdById: string; subject: string; status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED"; createdAt: Date; updatedAt: Date; resolvedAt: Date | null };
type Msg = { id: string; ticketId: string; authorId: string; authorKind: "CUSTOMER" | "SUPPORT"; body: string; createdAt: Date };

const db = vi.hoisted(() => ({ tickets: [] as unknown[], messages: [] as unknown[], audits: [] as { action: string; metadata?: unknown }[], seq: 0 }));
const tickets = () => db.tickets as T[];
const messages = () => db.messages as Msg[];
function first(): T {
  const t = tickets()[0];
  if (!t) throw new Error("expected a ticket");
  return t;
}

vi.mock("server-only", () => ({}));
vi.mock("@server/services/platform-admin.service", () => ({
  requirePlatformAdmin: vi.fn(),
  writePlatformAudit: async (_db: unknown, e: { action: string; metadata?: unknown }) => void db.audits.push({ action: e.action, metadata: e.metadata }),
}));
vi.mock("@server/db/prisma", () => {
  const matches = (t: T, w: { id?: string; businessId?: string; createdById?: string; createdAt?: { gte: Date } }) =>
    (!w.id || t.id === w.id) && (!w.businessId || t.businessId === w.businessId) && (!w.createdById || t.createdById === w.createdById) && (!w.createdAt || t.createdAt >= w.createdAt.gte);
  const tx = {
    supportTicket: {
      count: async ({ where }: { where: Parameters<typeof matches>[1] }) => tickets().filter((t) => matches(t, where)).length,
      create: async ({ data }: { data: { businessId: string; createdById: string; subject: string } }) => {
        const t: T = { id: `t${++db.seq}`, status: "OPEN", createdAt: new Date(), updatedAt: new Date(), resolvedAt: null, ...data };
        tickets().push(t);
        return t;
      },
      findMany: async ({ where }: { where: Parameters<typeof matches>[1] }) => tickets().filter((t) => matches(t, where)).map((t) => ({ ...t, createdBy: { name: "U" } })),
      findFirst: async ({ where }: { where: Parameters<typeof matches>[1] }) => {
        const t = tickets().find((x) => matches(x, where));
        return t ? { ...t, createdBy: { name: "U" }, messages: messages().filter((m) => m.ticketId === t.id).map((m) => ({ ...m, author: { name: "U" } })) } : null;
      },
      findUnique: async ({ where }: { where: { id: string } }) => tickets().find((t) => t.id === where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Partial<T> }) => Object.assign(tickets().find((t) => t.id === where.id) as T, data),
    },
    supportTicketMessage: {
      create: async ({ data }: { data: Omit<Msg, "id" | "createdAt"> }) => void messages().push({ id: `m${++db.seq}`, createdAt: new Date(), ...data }),
    },
  };
  return { prisma: { ...tx, $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx) } };
});

import { adminReply, adminSetStatus, createTicket, getMyTicket, listMyTickets, replyAsCustomer } from "@server/services/support.service";
import { UserRole, type TenantContext } from "@shared/types/auth.types";
import { MAX_TICKETS_PER_DAY } from "@shared/support-rules";

const ctxFor = (userId: string, role: UserRole, businessId = "biz-1"): TenantContext => ({ userId, firebaseUid: "f", businessId, membershipId: "m", role, financialReportGrant: false, branchId: null });
const owner = ctxFor("u-owner", UserRole.OWNER);
const staff = ctxFor("u-staff", UserRole.STAFF);
const otherBizOwner = ctxFor("u-other", UserRole.OWNER, "biz-2");
const support = { userId: "admin-1", role: "SUPPORT" as const };

beforeEach(() => {
  db.tickets.length = 0;
  db.messages.length = 0;
  db.audits.length = 0;
});

describe("customer side", () => {
  it("creates a ticket with its first message, scoped to the caller's business", async () => {
    const { id } = await createTicket(staff, { subject: "Cannot print", body: "The receipt does not print." });
    expect(tickets()[0]).toMatchObject({ id, businessId: "biz-1", createdById: "u-staff", status: "OPEN" });
    expect(messages()).toHaveLength(1);
    expect(messages()[0]).toMatchObject({ authorKind: "CUSTOMER", authorId: "u-staff" });
  });

  it("works for any member, including when the subscription has lapsed (no subscription dependency)", async () => {
    await expect(createTicket(staff, { subject: "Renewal help", body: "My plan ended, please help." })).resolves.toBeTruthy();
  });

  it("owner sees every ticket of the business; others only their own", async () => {
    await createTicket(staff, { subject: "Staff question", body: "From staff member." });
    await createTicket(owner, { subject: "Owner question", body: "From the owner." });
    expect((await listMyTickets(owner)).map((t) => t.subject).sort()).toEqual(["Owner question", "Staff question"]);
    expect((await listMyTickets(staff)).map((t) => t.subject)).toEqual(["Staff question"]);
  });

  it("never exposes another business's tickets — or a colleague's — even by id", async () => {
    const { id: ownersId } = await createTicket(owner, { subject: "Private", body: "Owner only matter." });
    await expect(getMyTicket(otherBizOwner, ownersId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getMyTicket(staff, ownersId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(replyAsCustomer(otherBizOwner, ownersId, "hi")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(messages()).toHaveLength(1);
  });

  it("limits how many tickets a business can open per day", async () => {
    for (let i = 0; i < MAX_TICKETS_PER_DAY; i++) await createTicket(owner, { subject: `Q ${i}`, body: "Some question." });
    await expect(createTicket(owner, { subject: "One more", body: "Too many." })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("a customer reply reopens a resolved ticket; a closed ticket takes no replies", async () => {
    const { id } = await createTicket(owner, { subject: "Help", body: "Need help." });
    first().status = "RESOLVED";
    await replyAsCustomer(owner, id, "Still broken");
    expect(first().status).toBe("OPEN");
    first().status = "CLOSED";
    await expect(replyAsCustomer(owner, id, "Hello?")).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("support side", () => {
  it("a reply moves OPEN to IN_PROGRESS and is audited without copying the message text", async () => {
    const { id } = await createTicket(owner, { subject: "Help", body: "Need help." });
    await adminReply(support, id, "We are looking into it — secret detail");
    expect(first().status).toBe("IN_PROGRESS");
    expect(messages().at(-1)).toMatchObject({ authorKind: "SUPPORT", authorId: "admin-1" });
    expect(db.audits).toEqual([{ action: "TICKET_REPLIED", metadata: undefined }]);
    expect(JSON.stringify(db.audits)).not.toContain("secret detail");
  });

  it("status changes follow the rules, are idempotent, and are audited with before/after", async () => {
    const { id } = await createTicket(owner, { subject: "Help", body: "Need help." });
    await adminSetStatus(support, id, "RESOLVED");
    expect(tickets()[0]).toMatchObject({ status: "RESOLVED" });
    expect(db.audits).toEqual([{ action: "TICKET_STATUS_CHANGED", metadata: { from: "OPEN", to: "RESOLVED" } }]);
    await adminSetStatus(support, id, "RESOLVED");
    expect(db.audits).toHaveLength(1);
    await adminSetStatus(support, id, "CLOSED");
    await expect(adminSetStatus(support, id, "OPEN")).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("finance-only admins cannot handle support; super admins can", async () => {
    const { id } = await createTicket(owner, { subject: "Help", body: "Need help." });
    await expect(adminReply({ userId: "f", role: "FINANCE" }, id, "x")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(adminSetStatus({ userId: "f", role: "FINANCE" }, id, "RESOLVED")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(adminReply({ userId: "s", role: "SUPER_ADMIN" }, id, "ok")).resolves.toBeUndefined();
  });

  it("cannot reply to a closed ticket or an unknown one", async () => {
    const { id } = await createTicket(owner, { subject: "Help", body: "Need help." });
    first().status = "CLOSED";
    await expect(adminReply(support, id, "late")).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(adminReply(support, "nope", "x")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
