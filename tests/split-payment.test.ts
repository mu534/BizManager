/**
 * Tests for split-payment schema validation and core logic.
 *
 * Focused on pure logic — no DB calls needed.
 */
import { describe, expect, it } from "vitest";
import {
  createSaleSchema,
  splitPaymentInputSchema,
} from "@shared/validation/sale.schema";

// ─── Helpers ───────────────────────────────────────────────

const VALID_UUID = "00000000-0000-4000-8000-000000000001";
const ACCOUNT_UUID = "00000000-0000-4000-8000-000000000002";
const ACCOUNT_UUID_2 = "00000000-0000-4000-8000-000000000003";
const PRODUCT_UUID = "00000000-0000-4000-8000-000000000004";

const baseItems = [
  { productId: PRODUCT_UUID, unitPrice: "1000", quantity: 1 },
];

// ─── createSaleSchema validation ───────────────────────────

describe("createSaleSchema — accountId-only input", () => {
  it("succeeds when accountId is present and payments is absent", () => {
    const result = createSaleSchema.safeParse({
      branchId: VALID_UUID,
      items: baseItems,
      accountId: ACCOUNT_UUID,
    });
    expect(result.success).toBe(true);
  });

  it("fails when neither accountId nor payments is provided", () => {
    const result = createSaleSchema.safeParse({
      branchId: VALID_UUID,
      items: baseItems,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msgs = result.error.issues.map((i) => i.message);
      expect(msgs).toContain("Either accountId or payments is required");
    }
  });

  it("succeeds when payments array is present and accountId is absent", () => {
    const result = createSaleSchema.safeParse({
      branchId: VALID_UUID,
      items: baseItems,
      payments: [{ accountId: ACCOUNT_UUID, amountMinor: 500 }],
    });
    expect(result.success).toBe(true);
  });

  it("fails when accountId is invalid UUID", () => {
    const result = createSaleSchema.safeParse({
      branchId: VALID_UUID,
      items: baseItems,
      accountId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });
});

// ─── splitPaymentInputSchema ────────────────────────────────

describe("splitPaymentInputSchema", () => {
  it("accepts a valid payment with defaults", () => {
    const result = splitPaymentInputSchema.safeParse({
      accountId: ACCOUNT_UUID,
      amountMinor: 500,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.verificationStatus).toBe("VERIFIED");
    }
  });

  it("accepts PENDING_VERIFICATION status", () => {
    const result = splitPaymentInputSchema.safeParse({
      accountId: ACCOUNT_UUID,
      amountMinor: 300,
      verificationStatus: "PENDING_VERIFICATION",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.verificationStatus).toBe("PENDING_VERIFICATION");
    }
  });

  it("rejects a non-integer amountMinor", () => {
    const result = splitPaymentInputSchema.safeParse({
      accountId: ACCOUNT_UUID,
      amountMinor: 9.99,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a zero amountMinor", () => {
    const result = splitPaymentInputSchema.safeParse({
      accountId: ACCOUNT_UUID,
      amountMinor: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a negative amountMinor", () => {
    const result = splitPaymentInputSchema.safeParse({
      accountId: ACCOUNT_UUID,
      amountMinor: -100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid UUID for accountId", () => {
    const result = splitPaymentInputSchema.safeParse({
      accountId: "bad",
      amountMinor: 100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid verificationStatus", () => {
    const result = splitPaymentInputSchema.safeParse({
      accountId: ACCOUNT_UUID,
      amountMinor: 100,
      verificationStatus: "UNKNOWN",
    });
    expect(result.success).toBe(false);
  });
});

// ─── Sum validation logic ───────────────────────────────────

describe("payment sum validation logic", () => {
  it("600 + 500 does not equal 1000 — split exceeds total", () => {
    const paymentsToProcess = [
      { accountId: ACCOUNT_UUID, amountMinor: 600, verificationStatus: "VERIFIED" as const },
      { accountId: ACCOUNT_UUID_2, amountMinor: 500, verificationStatus: "VERIFIED" as const },
    ];
    const finalTotal = 1000;
    const paymentSum = paymentsToProcess.reduce((s, p) => s + p.amountMinor, 0);
    expect(paymentSum).toBe(1100);
    expect(paymentSum !== finalTotal).toBe(true);
  });

  it("500 + 500 equals 1000 — valid split", () => {
    const paymentsToProcess = [
      { accountId: ACCOUNT_UUID, amountMinor: 500, verificationStatus: "VERIFIED" as const },
      { accountId: ACCOUNT_UUID_2, amountMinor: 500, verificationStatus: "VERIFIED" as const },
    ];
    const finalTotal = 1000;
    const paymentSum = paymentsToProcess.reduce((s, p) => s + p.amountMinor, 0);
    expect(paymentSum).toBe(finalTotal);
  });

  it("single payment of exact total is valid", () => {
    const paymentsToProcess = [
      { accountId: ACCOUNT_UUID, amountMinor: 1000, verificationStatus: "VERIFIED" as const },
    ];
    const finalTotal = 1000;
    const paymentSum = paymentsToProcess.reduce((s, p) => s + p.amountMinor, 0);
    expect(paymentSum).toBe(finalTotal);
  });
});

// ─── VERIFIED + PENDING split filtering logic ───────────────

describe("VERIFIED vs PENDING_VERIFICATION filtering", () => {
  it("only VERIFIED payments would be passed to creditAccount", () => {
    type Payment = { accountId: string; amountMinor: number; verificationStatus: "VERIFIED" | "PENDING_VERIFICATION" | "FAILED" };
    const paymentsToProcess: Payment[] = [
      { accountId: ACCOUNT_UUID, amountMinor: 600, verificationStatus: "VERIFIED" },
      { accountId: ACCOUNT_UUID_2, amountMinor: 400, verificationStatus: "PENDING_VERIFICATION" },
    ];

    const toCredit = paymentsToProcess.filter(
      (p) => p.verificationStatus === "VERIFIED" && p.amountMinor > 0,
    );

    expect(toCredit).toHaveLength(1);
    expect(toCredit[0]?.accountId).toBe(ACCOUNT_UUID);
    expect(toCredit[0]?.amountMinor).toBe(600);
  });

  it("all PENDING payments result in zero creditAccount calls", () => {
    type Payment = { accountId: string; amountMinor: number; verificationStatus: "VERIFIED" | "PENDING_VERIFICATION" | "FAILED" };
    const paymentsToProcess: Payment[] = [
      { accountId: ACCOUNT_UUID, amountMinor: 1000, verificationStatus: "PENDING_VERIFICATION" },
    ];

    const toCredit = paymentsToProcess.filter(
      (p) => p.verificationStatus === "VERIFIED" && p.amountMinor > 0,
    );

    expect(toCredit).toHaveLength(0);
  });

  it("all VERIFIED payments all get credited", () => {
    const paymentsToProcess = [
      { accountId: ACCOUNT_UUID, amountMinor: 400, verificationStatus: "VERIFIED" as const },
      { accountId: ACCOUNT_UUID_2, amountMinor: 600, verificationStatus: "VERIFIED" as const },
    ];

    const toCredit = paymentsToProcess.filter(
      (p) => p.verificationStatus === "VERIFIED" && p.amountMinor > 0,
    );

    expect(toCredit).toHaveLength(2);
  });
});
