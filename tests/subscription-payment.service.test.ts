import { describe, it, expect, vi, beforeEach } from "vitest";

// ── In-memory fake database implementing just what the service touches ─────
type PaymentRow = {
  id: string;
  businessId: string;
  planId: string;
  billingPeriod: "MONTHLY" | "YEARLY";
  amountMinor: number;
  currency: string;
  method: "TELEBIRR" | "BANK_TRANSFER";
  reference: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  rejectionReason: string | null;
  reviewedById: string | null;
  reviewedAt: Date | null;
  periodStart: Date | null;
  periodEnd: Date | null;
};
type SubRow = {
  businessId: string;
  planId: string;
  status: string;
  billingPeriod: string | null;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  trialEndsAt: Date | null;
  cancelledAt: Date | null;
};

const db = vi.hoisted(() => ({
  payments: new Map<string, unknown>(),
  subs: new Map<string, unknown>(),
  audits: [] as { action: string; targetId: string; metadata?: unknown }[],
  /** Simulates another reviewer winning the race between our read and our UPDATE. */
  stealOnFlip: false,
}));

vi.mock("server-only", () => ({}));

vi.mock("@server/db/prisma", () => {
  const payments = db.payments as Map<string, PaymentRow>;
  const subs = db.subs as Map<string, SubRow>;
  const tx = {
    subscriptionPayment: {
      findUnique: async ({ where }: { where: { id: string } }) => payments.get(where.id) ?? null,
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; status: PaymentRow["status"] };
        data: Partial<PaymentRow>;
      }) => {
        const row = payments.get(where.id);
        if (db.stealOnFlip && row) {
          row.status = "APPROVED"; // someone else committed first
          db.stealOnFlip = false;
        }
        if (!row || row.status !== where.status) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
    subscription: {
      findUnique: async ({ where }: { where: { businessId: string } }) => subs.get(where.businessId) ?? null,
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { businessId: string };
        create: SubRow;
        update: Partial<SubRow>;
      }) => {
        const cur = subs.get(where.businessId);
        if (cur) Object.assign(cur, update);
        else subs.set(where.businessId, { ...create, trialEndsAt: null, cancelledAt: null });
      },
    },
  };
  return {
    prisma: {
      ...tx,
      $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    },
  };
});

vi.mock("@server/services/platform-admin.service", () => ({
  requirePlatformAdmin: vi.fn(),
  writePlatformAudit: async (_db: unknown, e: { action: string; targetId: string; metadata?: unknown }) => {
    db.audits.push({ action: e.action, targetId: e.targetId, metadata: e.metadata });
  },
}));
vi.mock("@server/storage/evidence-storage", () => ({
  saveEvidence: vi.fn(),
  deleteEvidenceQuietly: vi.fn(),
  evidenceKeyFor: () => "k",
}));
vi.mock("@server/auth/permissions", () => ({ requireOwner: vi.fn() }));

import { approvePayment, rejectPayment } from "@server/services/subscription-payment.service";
import { isAppError } from "@shared/errors";

function must<T>(v: T | undefined): T {
  if (v === undefined) throw new Error("expected value to exist");
  return v;
}

const admin = { userId: "admin-1", role: "FINANCE" as const };
const NOW = new Date("2026-10-18T10:00:00.000Z");

function seedPayment(over: Partial<PaymentRow> = {}): PaymentRow {
  const row: PaymentRow = {
    id: "pay-1",
    businessId: "biz-1",
    planId: "plan-basic",
    billingPeriod: "MONTHLY",
    amountMinor: 50_000,
    currency: "ETB",
    method: "TELEBIRR",
    reference: "FT123456",
    status: "PENDING",
    rejectionReason: null,
    reviewedById: null,
    reviewedAt: null,
    periodStart: null,
    periodEnd: null,
    ...over,
  };
  (db.payments as Map<string, PaymentRow>).set(row.id, row);
  return row;
}

beforeEach(() => {
  db.payments.clear();
  db.subs.clear();
  db.audits.length = 0;
  db.stealOnFlip = false;
});

describe("approvePayment", () => {
  it("grants a period, activates the subscription and writes an audit row", async () => {
    seedPayment();
    const r = await approvePayment(admin, "pay-1", NOW);
    expect(r.applied).toBe(true);
    expect(r.periodStart).toEqual(NOW);
    expect(r.periodEnd.toISOString()).toBe("2026-11-18T10:00:00.000Z");

    const sub = must((db.subs as Map<string, SubRow>).get("biz-1"));
    expect(sub.status).toBe("ACTIVE");
    expect(sub.planId).toBe("plan-basic");
    expect(sub.currentPeriodEnd).toEqual(r.periodEnd);

    const pay = must((db.payments as Map<string, PaymentRow>).get("pay-1"));
    expect(pay.status).toBe("APPROVED");
    expect(pay.reviewedById).toBe("admin-1");
    expect(db.audits.map((a) => a.action)).toEqual(["PAYMENT_APPROVED"]);
  });

  it("is idempotent: a retry returns the original period and does not extend again", async () => {
    seedPayment();
    const first = await approvePayment(admin, "pay-1", NOW);
    const later = new Date("2026-10-19T10:00:00.000Z");
    const retry = await approvePayment(admin, "pay-1", later);

    expect(retry.applied).toBe(false);
    expect(retry.periodEnd).toEqual(first.periodEnd);
    expect(must((db.subs as Map<string, SubRow>).get("biz-1")).currentPeriodEnd).toEqual(first.periodEnd);
    expect(db.audits).toHaveLength(1); // no duplicate audit entry
  });

  it("loses a reviewer race safely: no second period, clear conflict error", async () => {
    seedPayment();
    db.stealOnFlip = true;
    await expect(approvePayment(admin, "pay-1", NOW)).rejects.toSatisfy(isAppError);
    expect((db.subs as Map<string, SubRow>).has("biz-1")).toBe(false);
    expect(db.audits).toHaveLength(0);
  });

  it("renewing during an active period continues from the old end date", async () => {
    const oldEnd = new Date("2026-11-01T00:00:00.000Z");
    (db.subs as Map<string, SubRow>).set("biz-1", {
      businessId: "biz-1",
      planId: "plan-basic",
      status: "ACTIVE",
      billingPeriod: "MONTHLY",
      currentPeriodStart: new Date("2026-10-01T00:00:00.000Z"),
      currentPeriodEnd: oldEnd,
      trialEndsAt: null,
      cancelledAt: null,
    });
    seedPayment({ id: "pay-2", billingPeriod: "YEARLY" });
    const r = await approvePayment(admin, "pay-2", NOW);
    expect(r.periodStart).toEqual(oldEnd);
    expect(r.periodEnd.toISOString()).toBe("2027-11-01T00:00:00.000Z");
  });

  it("a rejected payment cannot be approved", async () => {
    seedPayment({ status: "REJECTED", rejectionReason: "Amount mismatch" });
    await expect(approvePayment(admin, "pay-1", NOW)).rejects.toSatisfy(isAppError);
    expect((db.subs as Map<string, SubRow>).has("biz-1")).toBe(false);
  });

  it("support-role admins cannot approve", async () => {
    seedPayment();
    await expect(approvePayment({ userId: "s", role: "SUPPORT" }, "pay-1", NOW)).rejects.toSatisfy(isAppError);
    expect(must((db.payments as Map<string, PaymentRow>).get("pay-1")).status).toBe("PENDING");
  });

  it("unknown payment is not found", async () => {
    await expect(approvePayment(admin, "nope", NOW)).rejects.toSatisfy(isAppError);
  });
});

describe("rejectPayment", () => {
  it("stores the reason, audits it, and grants nothing", async () => {
    seedPayment();
    await rejectPayment(admin, "pay-1", "Amount does not match the plan price", NOW);
    const pay = must((db.payments as Map<string, PaymentRow>).get("pay-1"));
    expect(pay.status).toBe("REJECTED");
    expect(pay.rejectionReason).toBe("Amount does not match the plan price");
    expect((db.subs as Map<string, SubRow>).has("biz-1")).toBe(false);
    expect(db.audits.map((a) => a.action)).toEqual(["PAYMENT_REJECTED"]);
  });

  it("requires a meaningful reason", async () => {
    seedPayment();
    await expect(rejectPayment(admin, "pay-1", "no", NOW)).rejects.toSatisfy(isAppError);
    expect(must((db.payments as Map<string, PaymentRow>).get("pay-1")).status).toBe("PENDING");
  });

  it("cannot reject an approved payment", async () => {
    seedPayment({ status: "APPROVED", periodStart: NOW, periodEnd: NOW, reviewedById: "a", reviewedAt: NOW });
    await expect(rejectPayment(admin, "pay-1", "Changed my mind", NOW)).rejects.toSatisfy(isAppError);
  });

  it("is idempotent for an already-rejected payment", async () => {
    seedPayment({ status: "REJECTED", rejectionReason: "Blurry receipt" });
    await rejectPayment(admin, "pay-1", "Blurry receipt", NOW);
    expect(db.audits).toHaveLength(0);
  });
});
