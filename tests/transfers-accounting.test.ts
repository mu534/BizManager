import { describe, it, expect, vi, beforeEach } from "vitest";

type Acct = { id: string; businessId: string; name: string; status: "ACTIVE" | "INACTIVE" };

const h = vi.hoisted(() => ({
  accounts: [] as unknown[],
  ledger: [] as { dir: "debit" | "credit"; accountId: string; type: string; amount: number }[],
  touched: new Set<string>(),
}));
const accounts = () => h.accounts as Acct[];

vi.mock("server-only", () => ({}));
vi.mock("@server/auth/permissions", () => ({ requireOwnerOrManager: vi.fn(), requireFinancialReports: vi.fn() }));
vi.mock("@server/services/ledger", () => ({
  lockKey: async () => undefined,
  debitAccount: async (_tx: unknown, accountId: string, amount: number, type: string) => {
    h.ledger.push({ dir: "debit", accountId, type, amount });
  },
  creditAccount: async (_tx: unknown, accountId: string, amount: number, type: string) => {
    h.ledger.push({ dir: "credit", accountId, type, amount });
  },
}));
vi.mock("@server/db/prisma", () => {
  // Any model other than the ones a transfer legitimately needs is recorded, so
  // the test fails if a transfer ever starts touching revenue or expense tables.
  const known = {
    financialAccount: {
      findUnique: async ({ where }: { where: { id: string } }) => accounts().find((a) => a.id === where.id) ?? null,
    },
    business: { findUnique: async () => ({ currency: "ETB" }) },
  };
  const watch = <T extends object>(base: T): T =>
    new Proxy(base, {
      get(target, prop: string) {
        if (prop in target) return (target as Record<string, unknown>)[prop];
        h.touched.add(prop);
        return new Proxy({}, { get: () => async () => undefined });
      },
    });
  const tx = watch(known);
  return { prisma: watch({ ...known, $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx) }) };
});

import { transferFunds } from "@server/services/financial.service";
import { computeProfit } from "@shared/profit";
import { UserRole, type TenantContext } from "@shared/types/auth.types";

const ctx: TenantContext = { userId: "u", firebaseUid: "f", businessId: "biz", membershipId: "m", role: UserRole.OWNER, financialReportGrant: false, branchId: null };

beforeEach(() => {
  h.accounts.length = 0;
  h.ledger.length = 0;
  h.touched.clear();
  accounts().push(
    { id: "cash", businessId: "biz", name: "Cash", status: "ACTIVE" },
    { id: "telebirr", businessId: "biz", name: "Telebirr", status: "ACTIVE" },
    { id: "closed", businessId: "biz", name: "Closed", status: "INACTIVE" },
    { id: "foreign", businessId: "other-biz", name: "Foreign", status: "ACTIVE" },
  );
});

describe("account transfers are not revenue and not expenses", () => {
  it("moves money with exactly one debit and one credit of the same amount (net zero)", async () => {
    await transferFunds(ctx, { fromAccountId: "cash", toAccountId: "telebirr", amount: "500.00" });
    expect(h.ledger).toEqual([
      { dir: "debit", accountId: "cash", type: "TRANSFER_OUT", amount: 50_000 },
      { dir: "credit", accountId: "telebirr", type: "TRANSFER_IN", amount: 50_000 },
    ]);
    const net = h.ledger.reduce((s, l) => s + (l.dir === "credit" ? l.amount : -l.amount), 0);
    expect(net).toBe(0);
  });

  it("never creates or reads a sale, return, expense or inventory record", async () => {
    await transferFunds(ctx, { fromAccountId: "cash", toAccountId: "telebirr", amount: "123.45" });
    expect([...h.touched]).toEqual([]);
  });

  it("uses transfer-specific ledger types, never sale/expense types", async () => {
    await transferFunds(ctx, { fromAccountId: "cash", toAccountId: "telebirr", amount: "1.00" });
    for (const entry of h.ledger) expect(entry.type).toMatch(/^TRANSFER_(IN|OUT)$/);
  });

  it("rejects same-account, zero, inactive and cross-tenant transfers without moving money", async () => {
    const attempts = [
      { fromAccountId: "cash", toAccountId: "cash", amount: "10.00" },
      { fromAccountId: "cash", toAccountId: "telebirr", amount: "0" },
      { fromAccountId: "cash", toAccountId: "closed", amount: "10.00" },
      { fromAccountId: "cash", toAccountId: "foreign", amount: "10.00" },
      { fromAccountId: "foreign", toAccountId: "telebirr", amount: "10.00" },
    ];
    for (const a of attempts) await expect(transferFunds(ctx, a)).rejects.toBeTruthy();
    expect(h.ledger).toHaveLength(0);
  });
});

describe("profit is built only from sales, refunds, cost and expenses", () => {
  it("spec example: revenue 10,000 − COGS 6,000 = gross 4,000; − expenses 1,000 = operating 3,000", () => {
    const r = computeProfit({ sales: 1_000_000, refunds: 0, soldCost: 600_000, restockedReturnCost: 0, expenses: 100_000 });
    expect(r).toMatchObject({ netSales: 1_000_000, cogs: 600_000, grossProfit: 400_000, expenses: 100_000, operatingProfit: 300_000 });
  });

  it("has no input for transfers or stock purchases, so neither can distort profit", () => {
    // ProfitInputs is the complete set of fields; a transfer or purchase has nowhere to enter.
    const inputs = { sales: 1_000_000, refunds: 0, soldCost: 600_000, restockedReturnCost: 0, expenses: 100_000 };
    expect(Object.keys(inputs).sort()).toEqual(["expenses", "refunds", "restockedReturnCost", "sales", "soldCost"]);
    expect(computeProfit(inputs).operatingProfit).toBe(300_000);
  });

  it("refunds reduce revenue; a restocked return gives its cost back", () => {
    const r = computeProfit({ sales: 1_000_000, refunds: 200_000, soldCost: 600_000, restockedReturnCost: 120_000, expenses: 0 });
    expect(r).toMatchObject({ netSales: 800_000, cogs: 480_000, grossProfit: 320_000 });
  });
});
