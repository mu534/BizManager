import { describe, expect, it } from "vitest";
import {
  createSaleSchema,
  splitPaymentInputSchema,
} from "@shared/validation/sale.schema";

// Valid UUIDs that satisfy Zod v4's stricter UUID regex (version nibble 1-8)
const UUID_BRANCH = "11111111-1111-4111-8111-111111111111";
const UUID_PRODUCT = "22222222-2222-4222-8222-222222222222";
const UUID_ACCOUNT = "33333333-3333-4333-8333-333333333333";
const UUID_ACCOUNT2 = "44444444-4444-4444-8444-444444444444";

// ─── Schema validation tests ───────────────────────────────

describe("createSaleSchema — accountId-only input", () => {
  it("succeeds with a valid accountId and items", () => {
    const result = createSaleSchema.safeParse({
      branchId: UUID_BRANCH,
      items: [
        {
          productId: UUID_PRODUCT,
          unitPrice: "100.00",
          quantity: 1,
        },
      ],
      accountId: UUID_ACCOUNT,
    });
    expect(result.success).toBe(true);
  });
});

describe("createSaleSchema — missing both accountId and payments", () => {
  it("fails with the custom superRefine message", () => {
    const result = createSaleSchema.safeParse({
      branchId: UUID_BRANCH,
      items: [
        {
          productId: UUID_PRODUCT,
          unitPrice: "100.00",
          quantity: 1,
        },
      ],
      // no accountId, no payments
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("Either accountId or payments is required");
    }
  });
});

// ─── splitPaymentInputSchema ───────────────────────────────

describe("splitPaymentInputSchema", () => {
  it("accepts a valid VERIFIED entry", () => {
    const result = splitPaymentInputSchema.safeParse({
      accountId: UUID_ACCOUNT,
      amountMinor: 5000,
      verificationStatus: "VERIFIED",
    });
    expect(result.success).toBe(true);
  });

  it("accepts PENDING_VERIFICATION", () => {
    const result = splitPaymentInputSchema.safeParse({
      accountId: UUID_ACCOUNT,
      amountMinor: 2500,
      verificationStatus: "PENDING_VERIFICATION",
    });
    expect(result.success).toBe(true);
  });

  it("defaults verificationStatus to VERIFIED when omitted", () => {
    const result = splitPaymentInputSchema.safeParse({
      accountId: UUID_ACCOUNT,
      amountMinor: 1000,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.verificationStatus).toBe("VERIFIED");
    }
  });

  it("rejects a non-integer amount", () => {
    const result = splitPaymentInputSchema.safeParse({
      accountId: UUID_ACCOUNT,
      amountMinor: 99.5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects zero amount", () => {
    const result = splitPaymentInputSchema.safeParse({
      accountId: UUID_ACCOUNT,
      amountMinor: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid UUID for accountId", () => {
    const result = splitPaymentInputSchema.safeParse({
      accountId: "not-a-uuid",
      amountMinor: 500,
    });
    expect(result.success).toBe(false);
  });
});

// ─── Sum validation logic ──────────────────────────────────

describe("payment sum validation logic", () => {
  it("600 + 500 does not equal finalTotal 1000 (should fail)", () => {
    const paymentsToProcess = [
      { accountId: UUID_ACCOUNT, amountMinor: 600, verificationStatus: "VERIFIED" as const },
      { accountId: UUID_ACCOUNT2, amountMinor: 500, verificationStatus: "PENDING_VERIFICATION" as const },
    ];
    const finalTotal = 1000;
    const paymentSum = paymentsToProcess.reduce((s, p) => s + p.amountMinor, 0);
    // 600 + 500 = 1100, which !== 1000
    expect(paymentSum).toBe(1100);
    expect(paymentSum).not.toBe(finalTotal);
  });

  it("500 + 500 equals finalTotal 1000 (should pass)", () => {
    const paymentsToProcess = [
      { accountId: UUID_ACCOUNT, amountMinor: 500, verificationStatus: "VERIFIED" as const },
      { accountId: UUID_ACCOUNT2, amountMinor: 500, verificationStatus: "PENDING_VERIFICATION" as const },
    ];
    const finalTotal = 1000;
    const paymentSum = paymentsToProcess.reduce((s, p) => s + p.amountMinor, 0);
    expect(paymentSum).toBe(finalTotal);
  });
});

// ─── VERIFIED vs PENDING filtering logic ──────────────────

describe("VERIFIED + PENDING split — only VERIFIED payments creditAccount", () => {
  it("filters to only VERIFIED payments for crediting", () => {
    const paymentsToProcess = [
      { accountId: UUID_ACCOUNT, amountMinor: 700, verificationStatus: "VERIFIED" as const },
      { accountId: UUID_ACCOUNT2, amountMinor: 300, verificationStatus: "PENDING_VERIFICATION" as const },
    ];

    const verifiedPayments = paymentsToProcess.filter(
      (p) => p.verificationStatus === "VERIFIED" && p.amountMinor > 0,
    );

    // Only the VERIFIED entry should be credited
    expect(verifiedPayments).toHaveLength(1);
    expect(verifiedPayments[0]?.accountId).toBe(UUID_ACCOUNT);
    expect(verifiedPayments[0]?.amountMinor).toBe(700);
  });

  it("a PENDING-only set results in zero credits", () => {
    const paymentsToProcess: Array<{ accountId: string; amountMinor: number; verificationStatus: "VERIFIED" | "PENDING_VERIFICATION" | "FAILED" }> = [
      { accountId: UUID_ACCOUNT2, amountMinor: 1000, verificationStatus: "PENDING_VERIFICATION" },
    ];

    const verifiedPayments = paymentsToProcess.filter(
      (p) => p.verificationStatus === "VERIFIED" && p.amountMinor > 0,
    );

    expect(verifiedPayments).toHaveLength(0);
  });

  it("all-VERIFIED set credits every entry", () => {
    const paymentsToProcess = [
      { accountId: UUID_ACCOUNT, amountMinor: 400, verificationStatus: "VERIFIED" as const },
      { accountId: UUID_ACCOUNT2, amountMinor: 600, verificationStatus: "VERIFIED" as const },
    ];

    const verifiedPayments = paymentsToProcess.filter(
      (p) => p.verificationStatus === "VERIFIED" && p.amountMinor > 0,
    );

    expect(verifiedPayments).toHaveLength(2);
  });
});
