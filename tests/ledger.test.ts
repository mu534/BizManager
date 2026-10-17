import { describe, expect, it, vi } from "vitest";
import { creditAccount, debitAccount, decrementStock, incrementStock, type Tx } from "@server/services/ledger";

/** Minimal fake of the Prisma transaction client surface used by ledger.ts. */
function fakeTx(opts: { updateManyCount?: number; balance?: number; stock?: number } = {}) {
  const calls = {
    accountUpdate: vi.fn(async (a: unknown) => { void a; return { currentBalance: opts.balance ?? 1000 }; }),
    accountUpdateMany: vi.fn(async (a: unknown) => { void a; return { count: opts.updateManyCount ?? 1 }; }),
    accountFind: vi.fn(async () => ({ currentBalance: opts.balance ?? 1000 })),
    txCreate: vi.fn(async (a: unknown) => { void a; return {}; }),
    stockUpdateMany: vi.fn(async (a: unknown) => { void a; return { count: opts.updateManyCount ?? 1 }; }),
    stockFind: vi.fn(async () => (opts.stock === undefined ? null : { quantity: opts.stock })),
    stockUpsert: vi.fn(async (a: unknown) => { void a; return {}; }),
  };
  const tx = {
    financialAccount: { update: calls.accountUpdate, updateMany: calls.accountUpdateMany, findUniqueOrThrow: calls.accountFind },
    financialTransaction: { create: calls.txCreate },
    stockSnapshot: { updateMany: calls.stockUpdateMany, findUnique: calls.stockFind, upsert: calls.stockUpsert },
  } as unknown as Tx;
  return { tx, calls };
}

describe("decrementStock — regression: concurrent sales must not oversell", () => {
  it("guards the UPDATE itself with quantity >= requested", async () => {
    const { tx, calls } = fakeTx();
    await decrementStock(tx, "p1", "b1", 3, "Sugar");
    expect(calls.stockUpdateMany).toHaveBeenCalledWith({
      where: { productId: "p1", branchId: "b1", quantity: { gte: 3 } },
      data: { quantity: { decrement: 3 } },
    });
  });

  it("rejects when the guarded update affects no row (someone else took the stock)", async () => {
    const { tx } = fakeTx({ updateManyCount: 0, stock: 1 });
    await expect(decrementStock(tx, "p1", "b1", 2, "Sugar")).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
  });

  it("rejects when the product was never stocked", async () => {
    const { tx } = fakeTx({ updateManyCount: 0 });
    await expect(decrementStock(tx, "p1", "b1", 1, "Sugar")).rejects.toThrow(/Available: 0/);
  });

  it("incrementStock uses an atomic increment, not a read-modify-write", async () => {
    const { tx, calls } = fakeTx();
    await incrementStock(tx, "p1", "b1", 5);
    const arg = calls.stockUpsert.mock.calls[0]?.[0] as { update: unknown };
    expect(arg.update).toEqual({ quantity: { increment: 5 } });
  });
});

describe("account balances — regression: lost updates and overdrafts", () => {
  it("credit increments atomically and records the balance read back after the update", async () => {
    const { tx, calls } = fakeTx({ balance: 7500 });
    const after = await creditAccount(tx, "a1", 2500, "SALE_PAYMENT", { referenceId: "s1", referenceType: "Sale" });
    expect(after).toBe(7500);
    expect(calls.accountUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { currentBalance: { increment: 2500 } } }));
    expect(calls.txCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ amount: 2500, balanceAfter: 7500, type: "SALE_PAYMENT" }) });
  });

  it("debit is guarded by balance >= amount and refuses to overdraw", async () => {
    const ok = fakeTx({ balance: 400 });
    await debitAccount(ok.tx, "a1", 600, "REFUND", "Cash");
    expect(ok.calls.accountUpdateMany).toHaveBeenCalledWith({
      where: { id: "a1", currentBalance: { gte: 600 } },
      data: { currentBalance: { decrement: 600 } },
    });
    const broke = fakeTx({ updateManyCount: 0 });
    await expect(debitAccount(broke.tx, "a1", 600, "REFUND", "Cash")).rejects.toThrow(/Insufficient balance in "Cash"/);
    expect(broke.calls.txCreate).not.toHaveBeenCalled(); // no ledger row for a failed debit
  });

  it("rejects zero, negative and fractional amounts", async () => {
    const { tx } = fakeTx();
    for (const bad of [0, -5, 1.5]) {
      await expect(creditAccount(tx, "a1", bad, "MANUAL_CREDIT")).rejects.toThrow();
      await expect(debitAccount(tx, "a1", bad, "MANUAL_DEBIT", "x")).rejects.toThrow();
    }
  });
});
