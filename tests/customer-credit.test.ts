/**
 * Tests for customer service — debt repayment, credit, and idempotency.
 *
 * Uses vi.mock to fully mock @server/db/prisma and @server/services/ledger.
 * prisma.$transaction is mocked to call the callback with a fake tx object.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

// ─── Mocks ─────────────────────────────────────────────────

// Mock ledger before importing customer service
vi.mock("@server/services/ledger", () => ({
  lockKey: vi.fn(async () => undefined),
}));

// Mock prisma entirely
vi.mock("@server/db/prisma", () => ({
  prisma: {
    customer: { create: vi.fn(), findUnique: vi.fn() },
    customerDebt: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    customerDebtRepayment: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    customerCredit: { findUnique: vi.fn(), create: vi.fn() },
    customerCreditApplication: { findUnique: vi.fn(), create: vi.fn(), findMany: vi.fn() },
    sale: { create: vi.fn() },
    financialTransaction: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { recordRepayment, verifyRepayment, applyCustomerCredit, createCustomerCredit } from "@server/services/customer.service";
import { prisma } from "@server/db/prisma";
import type { TenantContext } from "@shared/types/auth.types";
import { UserRole } from "@shared/types/auth.types";
import type { Tx } from "@server/services/ledger";

// ─── Helpers ───────────────────────────────────────────────

const BUSINESS_ID = "biz-0000-0000-0000-000000000001";
const CUSTOMER_ID = "cust-000-0000-0000-000000000001";
const DEBT_ID = "debt-000-0000-0000-000000000001";
const CREDIT_ID = "cred-000-0000-0000-000000000001";
const SALE_ID = "sale-000-0000-0000-000000000001";
const USER_ID = "user-000-0000-0000-000000000001";
const REPAYMENT_ID = "repay-00-0000-0000-000000000001";

const ctx: TenantContext = {
  businessId: BUSINESS_ID,
  userId: USER_ID,
  branchId: null,
  role: UserRole.OWNER,
  membershipId: "member-000-0000-0000-000000000001",
  firebaseUid: "firebase-uid-001",
  financialReportGrant: true,
};

/** Build a fake debt object */
function makeDebt(outstandingMinor: number) {
  return {
    id: DEBT_ID,
    businessId: BUSINESS_ID,
    customerId: CUSTOMER_ID,
    saleId: SALE_ID,
    originalAmountMinor: outstandingMinor,
    outstandingMinor,
    operationId: "op-001",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/** Build a fake repayment object */
function makeRepayment(
  amountMinor: number,
  verificationStatus: "PENDING_VERIFICATION" | "VERIFIED" | "FAILED" = "PENDING_VERIFICATION",
) {
  return {
    id: REPAYMENT_ID,
    businessId: BUSINESS_ID,
    customerId: CUSTOMER_ID,
    debtId: DEBT_ID,
    amountMinor,
    paymentMethod: "CASH" as const,
    verificationStatus,
    operationId: "rep-op-001",
    notes: null,
    createdAt: new Date(),
  };
}

/**
 * Build a fake tx that matches the shape customer.service expects.
 * Each property is a fresh vi.fn() we can configure per test.
 */
function makeFakeTx() {
  return {
    customerDebt: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    customerDebtRepayment: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    customerCredit: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    customerCreditApplication: {
      findUnique: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
    },
    customer: {
      findUnique: vi.fn(),
    },
    $executeRaw: vi.fn(async () => undefined),
  } as unknown as Tx;
}

// ─── recordRepayment tests ─────────────────────────────────

describe("recordRepayment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("full verified repayment: outstanding drops to 0", async () => {
    const debt = makeDebt(1000);
    const fakeTx = makeFakeTx();

    // repayment doesn't already exist
    (fakeTx.customerDebtRepayment.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const createdRepayment = makeRepayment(1000, "VERIFIED");
    (fakeTx.customerDebtRepayment.create as ReturnType<typeof vi.fn>).mockResolvedValue(createdRepayment);
    (fakeTx.customerDebt.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(debt);
    const updatedDebt = { ...debt, outstandingMinor: 0 };
    (fakeTx.customerDebt.update as ReturnType<typeof vi.fn>).mockResolvedValue(updatedDebt);

    // prisma.$transaction calls the callback with fakeTx
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (cb: (tx: Tx) => Promise<unknown>) => cb(fakeTx),
    );

    const result = await recordRepayment(ctx, {
      debtId: DEBT_ID,
      payments: [
        {
          amountMinor: 1000,
          paymentMethod: "CASH",
          verificationStatus: "VERIFIED",
          operationId: "rep-op-001",
        },
      ],
    });

    expect(result.updatedDebt.outstandingMinor).toBe(0);
    expect(result.overpaymentCredit).toBeNull();
    expect(result.repayments).toHaveLength(1);
  });

  it("partial verified + pending: outstanding = originalAmount - verifiedSum only", async () => {
    const debt = makeDebt(1000);
    const fakeTx = makeFakeTx();

    (fakeTx.customerDebtRepayment.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    // Two payments — one verified (400), one pending (600)
    const rep1 = makeRepayment(400, "VERIFIED");
    const rep2 = makeRepayment(600, "PENDING_VERIFICATION");
    (fakeTx.customerDebtRepayment.create as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(rep1)
      .mockResolvedValueOnce(rep2);
    (fakeTx.customerDebt.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(debt);
    const updatedDebt = { ...debt, outstandingMinor: 600 };
    (fakeTx.customerDebt.update as ReturnType<typeof vi.fn>).mockResolvedValue(updatedDebt);

    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (cb: (tx: Tx) => Promise<unknown>) => cb(fakeTx),
    );

    const result = await recordRepayment(ctx, {
      debtId: DEBT_ID,
      payments: [
        { amountMinor: 400, paymentMethod: "CASH", verificationStatus: "VERIFIED", operationId: "rep-op-001" },
        { amountMinor: 600, paymentMethod: "TELEBIRR", verificationStatus: "PENDING_VERIFICATION", operationId: "rep-op-002" },
      ],
    });

    // verified sum = 400, outstanding = 1000 - 400 = 600
    expect(result.updatedDebt.outstandingMinor).toBe(600);
    expect(result.overpaymentCredit).toBeNull();

    // Confirm the update was called with the right outstanding value
    const updateCall = (fakeTx.customerDebt.update as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(updateCall?.data?.outstandingMinor).toBe(600);
  });

  it("overpayment: outstanding=0, CustomerCredit created for excess, sourceType=OVERPAYMENT", async () => {
    const debt = makeDebt(500);
    const fakeTx = makeFakeTx();

    (fakeTx.customerDebtRepayment.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const rep = makeRepayment(800, "VERIFIED");
    (fakeTx.customerDebtRepayment.create as ReturnType<typeof vi.fn>).mockResolvedValue(rep);
    (fakeTx.customerDebt.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(debt);

    const creditCreated = {
      id: "credit-001",
      businessId: BUSINESS_ID,
      customerId: CUSTOMER_ID,
      amountMinor: 300,
      reason: "Overpayment on debt repayment",
      sourceType: "OVERPAYMENT",
      sourceId: DEBT_ID,
      operationId: "rep-op-001-overpay",
      createdAt: new Date(),
    };
    (fakeTx.customerCredit.create as ReturnType<typeof vi.fn>).mockResolvedValue(creditCreated);
    const updatedDebt = { ...debt, outstandingMinor: 0 };
    (fakeTx.customerDebt.update as ReturnType<typeof vi.fn>).mockResolvedValue(updatedDebt);

    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (cb: (tx: Tx) => Promise<unknown>) => cb(fakeTx),
    );

    const result = await recordRepayment(ctx, {
      debtId: DEBT_ID,
      payments: [
        { amountMinor: 800, paymentMethod: "CASH", verificationStatus: "VERIFIED", operationId: "rep-op-001" },
      ],
    });

    expect(result.updatedDebt.outstandingMinor).toBe(0);
    expect(result.overpaymentCredit).not.toBeNull();
    expect(result.overpaymentCredit?.amountMinor).toBe(300);
    expect(result.overpaymentCredit?.sourceType).toBe("OVERPAYMENT");

    // Confirm CustomerCredit was created with excess amount
    const creditCall = (fakeTx.customerCredit.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(creditCall?.data?.amountMinor).toBe(300);
    expect(creditCall?.data?.sourceType).toBe("OVERPAYMENT");
  });

  it("PENDING-only: outstanding unchanged", async () => {
    const debt = makeDebt(1000);
    const fakeTx = makeFakeTx();

    (fakeTx.customerDebtRepayment.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const rep = makeRepayment(1000, "PENDING_VERIFICATION");
    (fakeTx.customerDebtRepayment.create as ReturnType<typeof vi.fn>).mockResolvedValue(rep);
    (fakeTx.customerDebt.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(debt);
    const updatedDebt = { ...debt, outstandingMinor: 1000 };
    (fakeTx.customerDebt.update as ReturnType<typeof vi.fn>).mockResolvedValue(updatedDebt);

    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (cb: (tx: Tx) => Promise<unknown>) => cb(fakeTx),
    );

    const result = await recordRepayment(ctx, {
      debtId: DEBT_ID,
      payments: [
        { amountMinor: 1000, paymentMethod: "BANK", verificationStatus: "PENDING_VERIFICATION", operationId: "rep-op-001" },
      ],
    });

    // verifiedSum = 0, so outstanding stays at 1000
    expect(result.updatedDebt.outstandingMinor).toBe(1000);
    expect(result.overpaymentCredit).toBeNull();

    const updateCall = (fakeTx.customerDebt.update as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(updateCall?.data?.outstandingMinor).toBe(1000);
  });
});

// ─── applyCustomerCredit tests ─────────────────────────────

describe("applyCustomerCredit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates CustomerCreditApplication without touching Sale or FinancialTransaction", async () => {
    const fakeTx = makeFakeTx();

    const credit = {
      id: CREDIT_ID,
      businessId: BUSINESS_ID,
      customerId: CUSTOMER_ID,
      amountMinor: 1000,
      reason: "Overpayment",
      sourceType: "OVERPAYMENT",
      sourceId: null,
      operationId: "credit-op-001",
      createdAt: new Date(),
    };

    (fakeTx.customerCredit.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(credit);
    (fakeTx.customerCreditApplication.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (fakeTx.customerCreditApplication.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const application = {
      id: "app-001",
      businessId: BUSINESS_ID,
      customerId: CUSTOMER_ID,
      creditId: CREDIT_ID,
      saleId: SALE_ID,
      amountMinor: 200,
      approvedById: USER_ID,
      operationId: "apply-op-001",
      createdAt: new Date(),
    };
    (fakeTx.customerCreditApplication.create as ReturnType<typeof vi.fn>).mockResolvedValue(application);

    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (cb: (tx: Tx) => Promise<unknown>) => cb(fakeTx),
    );

    const result = await applyCustomerCredit(ctx, {
      customerId: CUSTOMER_ID,
      creditId: CREDIT_ID,
      saleId: SALE_ID,
      amountMinor: 200,
      approvedById: USER_ID,
      operationId: "apply-op-001",
    });

    expect(result.amountMinor).toBe(200);
    expect(result.creditId).toBe(CREDIT_ID);

    // Must NOT touch Sale or FinancialTransaction
    expect((prisma.sale.create as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    expect((prisma.financialTransaction.create as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it("throws validationError when amountMinor exceeds remaining balance", async () => {
    const fakeTx = makeFakeTx();

    const credit = {
      id: CREDIT_ID,
      businessId: BUSINESS_ID,
      customerId: CUSTOMER_ID,
      amountMinor: 500,
      reason: "Overpayment",
      sourceType: "OVERPAYMENT",
      sourceId: null,
      operationId: "credit-op-001",
      createdAt: new Date(),
    };
    (fakeTx.customerCredit.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(credit);
    // Already applied 400
    (fakeTx.customerCreditApplication.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "prev-app", amountMinor: 400 },
    ]);

    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (cb: (tx: Tx) => Promise<unknown>) => cb(fakeTx),
    );

    await expect(
      applyCustomerCredit(ctx, {
        customerId: CUSTOMER_ID,
        creditId: CREDIT_ID,
        saleId: SALE_ID,
        amountMinor: 200, // only 100 remaining
        approvedById: USER_ID,
        operationId: "apply-op-002",
      }),
    ).rejects.toMatchObject({ message: "Insufficient credit balance" });
  });
});

// ─── Idempotency tests ─────────────────────────────────────

describe("idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("recordRepayment: second call with same operationId returns existing record", async () => {
    const debt = makeDebt(1000);
    const fakeTx = makeFakeTx();

    const existingRepayment = makeRepayment(500, "VERIFIED");
    // findUnique returns existing on second call
    (fakeTx.customerDebtRepayment.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(existingRepayment);
    (fakeTx.customerDebt.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(debt);
    const updatedDebt = { ...debt, outstandingMinor: 500 };
    (fakeTx.customerDebt.update as ReturnType<typeof vi.fn>).mockResolvedValue(updatedDebt);

    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (cb: (tx: Tx) => Promise<unknown>) => cb(fakeTx),
    );

    const result = await recordRepayment(ctx, {
      debtId: DEBT_ID,
      payments: [
        { amountMinor: 500, paymentMethod: "CASH", verificationStatus: "VERIFIED", operationId: "rep-op-001" },
      ],
    });

    // Should return the existing repayment without creating a new one
    expect(result.repayments).toHaveLength(1);
    expect(result.repayments[0]?.id).toBe(existingRepayment.id);
    // create should NOT have been called
    expect((fakeTx.customerDebtRepayment.create as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it("replay with same operationId but changed verificationStatus leaves outstanding unchanged", async () => {
    // Scenario: first call stored the payment as PENDING_VERIFICATION.
    // Caller retries with verificationStatus: "VERIFIED" on the same operationId.
    // The stored record is PENDING, so verifiedSum must be 0 and outstanding
    // must not change — no creditAccount was ever called for this payment.
    const debt = makeDebt(1000);
    const fakeTx = makeFakeTx();

    // The idempotency lookup returns the original PENDING record
    const existingPendingRepayment = makeRepayment(1000, "PENDING_VERIFICATION");
    (fakeTx.customerDebtRepayment.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(existingPendingRepayment);
    (fakeTx.customerDebt.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(debt);
    const updatedDebt = { ...debt, outstandingMinor: 1000 };
    (fakeTx.customerDebt.update as ReturnType<typeof vi.fn>).mockResolvedValue(updatedDebt);

    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (cb: (tx: Tx) => Promise<unknown>) => cb(fakeTx),
    );

    const result = await recordRepayment(ctx, {
      debtId: DEBT_ID,
      payments: [
        // Caller now claims VERIFIED, but the stored record is still PENDING
        { amountMinor: 1000, paymentMethod: "CASH", verificationStatus: "VERIFIED", operationId: "rep-op-001" },
      ],
    });

    // verifiedSum must be derived from the stored record (PENDING), so 0
    // outstanding must not change
    expect(result.updatedDebt.outstandingMinor).toBe(1000);
    expect(result.overpaymentCredit).toBeNull();

    const updateCall = (fakeTx.customerDebt.update as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(updateCall?.data?.outstandingMinor).toBe(1000);

    // No new repayment row was created
    expect((fakeTx.customerDebtRepayment.create as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it("createCustomerCredit: returns existing record when operationId matches", async () => {
    const fakeTx = makeFakeTx();

    const existing = {
      id: CREDIT_ID,
      businessId: BUSINESS_ID,
      customerId: CUSTOMER_ID,
      amountMinor: 300,
      reason: "Overpayment",
      sourceType: "OVERPAYMENT" as const,
      sourceId: DEBT_ID,
      operationId: "credit-op-dup",
      createdAt: new Date(),
    };
    (fakeTx.customerCredit.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(existing);

    const result = await createCustomerCredit(fakeTx as unknown as Tx, ctx, {
      customerId: CUSTOMER_ID,
      amountMinor: 300,
      reason: "Overpayment",
      sourceType: "OVERPAYMENT",
      sourceId: DEBT_ID,
      operationId: "credit-op-dup",
    });

    expect(result.id).toBe(CREDIT_ID);
    // create should NOT have been called
    expect((fakeTx.customerCredit.create as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it("applyCustomerCredit: returns existing application when operationId matches", async () => {
    const fakeTx = makeFakeTx();

    const credit = {
      id: CREDIT_ID,
      businessId: BUSINESS_ID,
      customerId: CUSTOMER_ID,
      amountMinor: 1000,
      reason: "Overpayment",
      sourceType: "OVERPAYMENT",
      sourceId: null,
      operationId: "credit-op-001",
      createdAt: new Date(),
    };
    (fakeTx.customerCredit.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(credit);
    (fakeTx.customerCreditApplication.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const existing = {
      id: "app-dup",
      businessId: BUSINESS_ID,
      customerId: CUSTOMER_ID,
      creditId: CREDIT_ID,
      saleId: SALE_ID,
      amountMinor: 200,
      approvedById: USER_ID,
      operationId: "apply-op-dup",
      createdAt: new Date(),
    };
    (fakeTx.customerCreditApplication.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(existing);

    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (cb: (tx: Tx) => Promise<unknown>) => cb(fakeTx),
    );

    const result = await applyCustomerCredit(ctx, {
      customerId: CUSTOMER_ID,
      creditId: CREDIT_ID,
      saleId: SALE_ID,
      amountMinor: 200,
      approvedById: USER_ID,
      operationId: "apply-op-dup",
    });

    expect(result.id).toBe("app-dup");
    expect((fakeTx.customerCreditApplication.create as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });
});

// ─── verifyRepayment tests ─────────────────────────────────

describe("verifyRepayment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when repayment is not PENDING_VERIFICATION", async () => {
    const fakeTx = makeFakeTx();
    const alreadyVerified = makeRepayment(500, "VERIFIED");
    (fakeTx.customerDebtRepayment.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(alreadyVerified);

    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (cb: (tx: Tx) => Promise<unknown>) => cb(fakeTx),
    );

    await expect(verifyRepayment(ctx, REPAYMENT_ID, "VERIFIED")).rejects.toMatchObject({
      message: "Repayment is not pending verification",
    });
  });

  it("verifying a PENDING repayment reduces outstanding", async () => {
    const debt = makeDebt(500);
    const fakeTx = makeFakeTx();
    const pendingRepayment = makeRepayment(500, "PENDING_VERIFICATION");
    (fakeTx.customerDebtRepayment.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(pendingRepayment);
    (fakeTx.customerDebt.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(debt);
    (fakeTx.customerDebt.update as ReturnType<typeof vi.fn>).mockResolvedValue({ ...debt, outstandingMinor: 0 });
    const verifiedRepayment = { ...pendingRepayment, verificationStatus: "VERIFIED" as const };
    (fakeTx.customerDebtRepayment.update as ReturnType<typeof vi.fn>).mockResolvedValue(verifiedRepayment);

    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (cb: (tx: Tx) => Promise<unknown>) => cb(fakeTx),
    );

    const result = await verifyRepayment(ctx, REPAYMENT_ID, "VERIFIED");
    expect(result.verificationStatus).toBe("VERIFIED");

    const updateCall = (fakeTx.customerDebt.update as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(updateCall?.data?.outstandingMinor).toBe(0);
  });
});
