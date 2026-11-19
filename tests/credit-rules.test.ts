import { describe, expect, it } from "vitest";
import {
  CreditRuleError,
  allocateRepayment,
  resolveSalePayments,
  splitReturnRefund,
} from "@shared/credit-rules";

const ACC = "00000000-0000-4000-8000-000000000001";

describe("resolveSalePayments", () => {
  it("pays everything now when there is no credit", () => {
    const r = resolveSalePayments({ finalTotal: 1000, creditMinor: 0, accountId: ACC });
    expect(r.payments).toEqual([{ accountId: ACC, amountMinor: 1000, verificationStatus: "VERIFIED" }]);
    expect(r.creditMinor).toBe(0);
  });
  it("splits a part-paid sale between the account and the tab", () => {
    const r = resolveSalePayments({ finalTotal: 1000, creditMinor: 400, accountId: ACC });
    expect(r.payments[0]?.amountMinor).toBe(600);
    expect(r.creditMinor).toBe(400);
  });
  it("allows a fully unpaid sale with no account", () => {
    const r = resolveSalePayments({ finalTotal: 1000, creditMinor: 1000 });
    expect(r.payments).toEqual([]);
  });
  it("rejects credit above the total, negatives and fractions", () => {
    expect(() => resolveSalePayments({ finalTotal: 1000, creditMinor: 1001, accountId: ACC })).toThrow(CreditRuleError);
    expect(() => resolveSalePayments({ finalTotal: 1000, creditMinor: -1, accountId: ACC })).toThrow(CreditRuleError);
    expect(() => resolveSalePayments({ finalTotal: 1000, creditMinor: 1.5, accountId: ACC })).toThrow(CreditRuleError);
  });
  it("needs an account when something is paid now", () => {
    expect(() => resolveSalePayments({ finalTotal: 1000, creditMinor: 100 })).toThrow(CreditRuleError);
  });
  it("requires split payments plus credit to equal the total", () => {
    const p = [{ accountId: ACC, amountMinor: 500, verificationStatus: "VERIFIED" as const }];
    expect(resolveSalePayments({ finalTotal: 1000, creditMinor: 500, payments: p }).creditMinor).toBe(500);
    expect(() => resolveSalePayments({ finalTotal: 1000, creditMinor: 400, payments: p })).toThrow(CreditRuleError);
  });
});

describe("allocateRepayment", () => {
  const d = (id: string, outstandingMinor: number, day: number) => ({
    id,
    outstandingMinor,
    createdAt: new Date(2026, 0, day),
  });
  it("clears the oldest debt first and carries the rest on", () => {
    const out = allocateRepayment([d("b", 300, 2), d("a", 500, 1)], 600);
    expect(out).toEqual([
      { debtId: "a", amountMinor: 500 },
      { debtId: "b", amountMinor: 100 },
    ]);
  });
  it("ignores settled debts", () => {
    expect(allocateRepayment([d("a", 0, 1), d("b", 200, 2)], 200)).toEqual([{ debtId: "b", amountMinor: 200 }]);
  });
  it("rejects zero, fractions and more than is owed", () => {
    expect(() => allocateRepayment([d("a", 100, 1)], 0)).toThrow(CreditRuleError);
    expect(() => allocateRepayment([d("a", 100, 1)], 10.5)).toThrow(CreditRuleError);
    expect(() => allocateRepayment([d("a", 100, 1)], 101)).toThrow(CreditRuleError);
  });
});

describe("splitReturnRefund", () => {
  it("cancels unpaid credit before refunding cash", () => {
    expect(splitReturnRefund(700, 300)).toEqual({ debtReductionMinor: 300, cashRefundMinor: 400 });
  });
  it("refunds nothing in cash when the tab covers the whole return", () => {
    expect(splitReturnRefund(200, 500)).toEqual({ debtReductionMinor: 200, cashRefundMinor: 0 });
  });
  it("refunds in full when nothing is owed", () => {
    expect(splitReturnRefund(200, 0)).toEqual({ debtReductionMinor: 0, cashRefundMinor: 200 });
  });
});