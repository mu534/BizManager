import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  createSaleSchema,
  splitPaymentInputSchema,
} from "@shared/validation/sale.schema";
import { UserRole } from "@shared/types/auth.types";

// ─── Mocks for service tests ──────────────────────────────

vi.mock("@server/db/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
    branch: { findUnique: vi.fn() },
    product: { findMany: vi.fn() },
    sale: { findUnique: vi.fn(), count: vi.fn(), create: vi.fn() },
    saleItem: { createMany: vi.fn() },
    payment: { createMany: vi.fn() },
    financialAccount: { findUnique: vi.fn() },
    inventoryMovement: { createMany: vi.fn() },
    stockSnapshot: { updateMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn() },
    financialTransaction: { create: vi.fn() },
    financialAccount_update: vi.fn(),
  },
}));

vi.mock("@server/services/ledger", () => ({
  lockKey: vi.fn(async () => undefined),
  creditAccount: vi.fn(async () => 0),
  debitAccount: vi.fn(async () => undefined),
  decrementStock: vi.fn(async () => undefined),
  incrementStock: vi.fn(async () => undefined),
}));

// Branch-access + subscription + business-time mocks needed by createSale
vi.mock("@server/services/branch-access.service", () => ({
  requireBranchAccess: vi.fn(async () => undefined),
}));

vi.mock("@server/services/subscription.service", () => ({
  assertWithinLimit: vi.fn(async (_ctx: unknown, _key: unknown, fn: () => Promise<number>) => {
    await fn();
  }),
  LIMIT_KEYS: { MAX_TRANSACTIONS_MONTH: "MAX_TRANSACTIONS_MONTH" },
}));

vi.mock("@server/services/business-time", () => ({
  getBusinessTime: vi.fn(async () => ({
    currency: "ETB",
    offsetMinutes: 180,
  })),
}));

// ─── Imports (after mocks) ────────────────────────────────

import { prisma } from "@server/db/prisma";
import { creditAccount } from "@server/services/ledger";
import { createSale } from "@server/services/sale.service";

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

// ─── createSale service test: PENDING_VERIFICATION invariant ─

describe("createSale — PENDING_VERIFICATION payments never call creditAccount", () => {
  const UUID_BRANCH_SVC = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const UUID_PRODUCT_SVC = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const UUID_ACCOUNT_VERIFIED = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const UUID_ACCOUNT_PENDING = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

  const ctx = {
    userId: "user-svc",
    firebaseUid: "fb-svc",
    businessId: "biz-svc",
    membershipId: "mem-svc",
    role: UserRole.OWNER,
    financialReportGrant: false,
    branchId: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not call creditAccount for a PENDING_VERIFICATION payment", async () => {
    // Build a minimal fake transaction client
    const fakeSale = {
      id: "sale-svc-1",
      branchId: UUID_BRANCH_SVC,
      createdById: ctx.userId,
      status: "COMPLETED",
      subtotal: 10000,
      discountAmount: 0,
      finalTotal: 10000,
      receiptNumber: "BRN-20240101-0001",
      syncOperationId: null,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    const fakeSaleWithDetails = {
      ...fakeSale,
      items: [],
      payments: [],
      returns: [],
      branch: { name: "Main" },
      createdBy: { name: "User" },
    };

    const fakeTx = {
      sale: {
        findUnique: vi.fn(async () => null), // no idempotency match
        count: vi.fn(async () => 0),
        create: vi.fn(async () => fakeSale),
        findUniqueOrThrow: vi.fn(async () => fakeSaleWithDetails),
        update: vi.fn(),
      },
      branch: {
        findUnique: vi.fn(async () => ({
          id: UUID_BRANCH_SVC,
          businessId: ctx.businessId,
          status: "ACTIVE",
          name: "Main",
        })),
      },
      product: {
        findMany: vi.fn(async () => [
          {
            id: UUID_PRODUCT_SVC,
            businessId: ctx.businessId,
            name: "Widget",
            sku: null,
            sellingPrice: 10000,
            costPrice: 5000,
            status: "ACTIVE",
          },
        ]),
      },
      saleItem: { createMany: vi.fn(async () => ({ count: 1 })) },
      payment: { createMany: vi.fn(async () => ({ count: 2 })) },
      financialAccount: {
        findUnique: vi.fn(async (args: { where: { id: string } }) => ({
          id: args.where.id,
          businessId: ctx.businessId,
          status: "ACTIVE",
          name: args.where.id === UUID_ACCOUNT_VERIFIED ? "Cash" : "TeleBirr",
        })),
      },
      inventoryMovement: { createMany: vi.fn(async () => ({ count: 1 })) },
      stockSnapshot: {
        updateMany: vi.fn(async () => ({ count: 1 })),
        findUnique: vi.fn(async () => ({ quantity: 100 })),
        upsert: vi.fn(async () => ({})),
      },
      financialTransaction: { create: vi.fn(async () => ({})) },
      financialAccount_update: vi.fn(),
    };

    vi.mocked(prisma.$transaction).mockImplementation(async (fn) =>
      (fn as (tx: unknown) => Promise<unknown>)(fakeTx),
    );

    await createSale(ctx, {
      branchId: UUID_BRANCH_SVC,
      discountAmount: "0",
      creditAmountMinor: 0,
      items: [{ productId: UUID_PRODUCT_SVC, unitPrice: "100.00", quantity: 1, discountAmount: "0" }],
      payments: [
        { accountId: UUID_ACCOUNT_VERIFIED, amountMinor: 7000, verificationStatus: "VERIFIED" },
        { accountId: UUID_ACCOUNT_PENDING, amountMinor: 3000, verificationStatus: "PENDING_VERIFICATION" },
      ],
    });

    // creditAccount must have been called exactly once — only for the VERIFIED payment
    expect(vi.mocked(creditAccount)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(creditAccount)).toHaveBeenCalledWith(
      expect.anything(),
      UUID_ACCOUNT_VERIFIED,
      7000,
      "SALE_PAYMENT",
      expect.anything(),
    );
    // Confirm the PENDING account was never credited
    const calls = vi.mocked(creditAccount).mock.calls;
    const pendingCall = calls.find((c) => c[1] === UUID_ACCOUNT_PENDING);
    expect(pendingCall).toBeUndefined();
  });
});
