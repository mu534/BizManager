import { describe, expect, it, vi, beforeEach } from "vitest";
import type { CustomerDebt, CustomerDebtRepayment, CustomerCredit } from "@prisma/client";
import { UserRole } from "@shared/types/auth.types";

// ─── Mocks ──────────────────────────────────────────────────

vi.mock("@server/db/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
    customer: { create: vi.fn(), findUnique: vi.fn() },
    customerDebt: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    customerDebtRepayment: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    customerCredit: { findUnique: vi.fn(), create: vi.fn(), findMany: vi.fn() },
    customerCreditApplication: { findUnique: vi.fn(), create: vi.fn(), findMany: vi.fn() },
  },
}));

vi.mock("@server/services/ledger", () => ({
  lockKey: vi.fn(async () => undefined),
}));

// ─── Imports (after mocks) ─────────────────────────────────

import { prisma } from "@server/db/prisma";
import { lockKey } from "@server/services/ledger";
import {
  recordRepayment,
  verifyRepayment,
  applyCustomerCredit,
} from "@server/services/customer.service";

// ─── Helpers ───────────────────────────────────────────────

const ctx = {
  userId: "user-1",
  firebaseUid: "fb-uid-1",
  businessId: "biz-1",
  membershipId: "mem-1",
  role: UserRole.OWNER,
  financialReportGrant: false,
  branchId: null,
};

function makeDebt(overrides: Partial<CustomerDebt> = {}): CustomerDebt {
  return {
    id: "debt-1",
    businessId: "biz-1",
    customerId: "customer-1",
    saleId: "sale-1",
    originalAmountMinor: 10000,
    outstandingMinor: 10000,
    operationId: "op-debt-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeRepayment(overrides: Partial<CustomerDebtRepayment> = {}): CustomerDebtRepayment {
  return {
    id: "repayment-1",
    businessId: "biz-1",
    customerId: "customer-1",
    debtId: "debt-1",
    amountMinor: 5000,
    paymentMethod: "CASH",
    verificationStatus: "PENDING_VERIFICATION",
    operationId: "op-repay-1",
    notes: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeCredit(overrides: Partial<CustomerCredit> = {}): CustomerCredit {
  return {
    id: "credit-1",
    businessId: "biz-1",
    customerId: "customer-1",
    amountMinor: 5000,
    reason: "Overpayment",
    sourceType: "OVERPAYMENT",
    sourceId: "debt-1",
    operationId: "op-credit-1",
    createdAt: new Date(),
    ...overrides,
  };
}

/** Build a fake tx object that mimics the Prisma transaction client. */
function makeFakeTx(opts: {
  debt?: CustomerDebt | null;
  repaymentFindResult?: CustomerDebtRepayment | null;
  repaymentCreated?: CustomerDebtRepayment;
  updatedDebt?: CustomerDebt;
  creditCreated?: CustomerCredit;
}) {
  return {
    customerDebt: {
      findUnique: vi.fn(async () => opts.debt ?? null),
      update: vi.fn(async () => opts.updatedDebt ?? makeDebt({ outstandingMinor: 0 })),
    },
    customerDebtRepayment: {
      findUnique: vi.fn(async () => opts.repaymentFindResult ?? null),
      create: vi.fn(async () => opts.repaymentCreated ?? makeRepayment({ verificationStatus: "VERIFIED" })),
      update: vi.fn(async (args: { data: { verificationStatus: string } }) =>
        makeRepayment({ verificationStatus: args.data.verificationStatus as "VERIFIED" | "PENDING_VERIFICATION" | "FAILED" }),
      ),
    },
    customerCredit: {
      findUnique: vi.fn(async () => null),
      create: vi.fn(async () => opts.creditCreated ?? makeCredit()),
      findMany: vi.fn(async () => []),
    },
    customerCreditApplication: {
      findUnique: vi.fn(async () => null),
      create: vi.fn(async (args: unknown) => ({ id: "app-1", ...(args as object) })),
      findMany: vi.fn(async () => []),
    },
    $executeRaw: vi.fn(async () => undefined),
  };
}

// ─── recordRepayment tests ─────────────────────────────────

describe("recordRepayment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. full verified repayment: outstanding drops to 0", async () => {
    const debt = makeDebt({ outstandingMinor: 10000 });
    const updatedDebt = makeDebt({ outstandingMinor: 0 });
    const fakeTx = makeFakeTx({ debt, updatedDebt });

    vi.mocked(prisma.$transaction).mockImplementation(async (fn) =>
      fn(fakeTx as never),
    );

    const result = await recordRepayment(ctx, {
      debtId: "debt-1",
      payments: [
        {
          amountMinor: 10000,
          paymentMethod: "CASH",
          verificationStatus: "VERIFIED",
          operationId: "op-repay-full",
        },
      ],
    });

    expect(result.updatedDebt.outstandingMinor).toBe(0);
    expect(result.overpaymentCredit).toBeNull();
    expect(fakeTx.customerDebt.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { outstandingMinor: 0 } }),
    );
  });

  it("2. partial verified + pending: outstanding = original - verifiedSum only", async () => {
    const debt = makeDebt({ outstandingMinor: 10000 });
    const updatedDebt = makeDebt({ outstandingMinor: 6000 });
    const fakeTx = makeFakeTx({ debt, updatedDebt });

    vi.mocked(prisma.$transaction).mockImplementation(async (fn) =>
      fn(fakeTx as never),
    );

    const result = await recordRepayment(ctx, {
      debtId: "debt-1",
      payments: [
        {
          amountMinor: 4000,
          paymentMethod: "CASH",
          verificationStatus: "VERIFIED",
          operationId: "op-repay-partial",
        },
        {
          amountMinor: 3000,
          paymentMethod: "TELEBIRR",
          verificationStatus: "PENDING_VERIFICATION",
          operationId: "op-repay-pending",
        },
      ],
    });

    // Only verified 4000 reduces outstanding: 10000 - 4000 = 6000
    expect(result.updatedDebt.outstandingMinor).toBe(6000);
    expect(result.overpaymentCredit).toBeNull();
    expect(fakeTx.customerDebt.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { outstandingMinor: 6000 } }),
    );
  });

  it("3. overpayment: outstanding=0, CustomerCredit created for excess with sourceType=OVERPAYMENT", async () => {
    const debt = makeDebt({ outstandingMinor: 5000 });
    const updatedDebt = makeDebt({ outstandingMinor: 0 });
    const overpayCredit = makeCredit({ amountMinor: 3000, sourceType: "OVERPAYMENT" });
    const fakeTx = makeFakeTx({ debt, updatedDebt, creditCreated: overpayCredit });

    vi.mocked(prisma.$transaction).mockImplementation(async (fn) =>
      fn(fakeTx as never),
    );

    const result = await recordRepayment(ctx, {
      debtId: "debt-1",
      payments: [
        {
          amountMinor: 8000, // 3000 over the outstanding 5000
          paymentMethod: "CASH",
          verificationStatus: "VERIFIED",
          operationId: "op-repay-overpay",
        },
      ],
    });

    expect(result.updatedDebt.outstandingMinor).toBe(0);
    expect(result.overpaymentCredit).not.toBeNull();
    expect(result.overpaymentCredit?.sourceType).toBe("OVERPAYMENT");
    expect(fakeTx.customerCredit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amountMinor: 3000,
          sourceType: "OVERPAYMENT",
        }),
      }),
    );
  });

  it("4. PENDING-only: outstanding unchanged", async () => {
    const debt = makeDebt({ outstandingMinor: 10000 });
    const updatedDebt = makeDebt({ outstandingMinor: 10000 });
    const fakeTx = makeFakeTx({ debt, updatedDebt });

    vi.mocked(prisma.$transaction).mockImplementation(async (fn) =>
      fn(fakeTx as never),
    );

    const result = await recordRepayment(ctx, {
      debtId: "debt-1",
      payments: [
        {
          amountMinor: 5000,
          paymentMethod: "TELEBIRR",
          verificationStatus: "PENDING_VERIFICATION",
          operationId: "op-repay-pending-only",
        },
      ],
    });

    expect(result.updatedDebt.outstandingMinor).toBe(10000);
    expect(result.overpaymentCredit).toBeNull();
    expect(fakeTx.customerDebt.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { outstandingMinor: 10000 } }),
    );
  });

  it("6. idempotency: second call with same operationId returns existing record", async () => {
    const debt = makeDebt({ outstandingMinor: 10000 });
    const existingRepayment = makeRepayment({ operationId: "op-repay-idem", verificationStatus: "VERIFIED" });
    const updatedDebt = makeDebt({ outstandingMinor: 5000 });
    const fakeTx = makeFakeTx({ debt, repaymentFindResult: existingRepayment, updatedDebt });

    vi.mocked(prisma.$transaction).mockImplementation(async (fn) =>
      fn(fakeTx as never),
    );

    await recordRepayment(ctx, {
      debtId: "debt-1",
      payments: [
        {
          amountMinor: 5000,
          paymentMethod: "CASH",
          verificationStatus: "VERIFIED",
          operationId: "op-repay-idem",
        },
      ],
    });

    // findUnique was called for operationId — create should NOT be called
    expect(fakeTx.customerDebtRepayment.create).not.toHaveBeenCalled();
  });
});

// ─── applyCustomerCredit tests ─────────────────────────────

describe("applyCustomerCredit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("5. creates CustomerCreditApplication, does NOT call prisma.sale.create or prisma.financialTransaction.create", async () => {
    const credit = makeCredit({ amountMinor: 10000 });
    const fakeTx = {
      customerCredit: {
        findUnique: vi.fn(async () => credit),
      },
      customerCreditApplication: {
        findMany: vi.fn(async () => []),
        findUnique: vi.fn(async () => null),
        create: vi.fn(async () => ({
          id: "app-1",
          businessId: "biz-1",
          customerId: "customer-1",
          creditId: "credit-1",
          saleId: "sale-1",
          amountMinor: 5000,
          approvedById: "user-1",
          operationId: "op-apply-1",
          createdAt: new Date(),
        })),
      },
      // These must NOT be called
      sale: { create: vi.fn() },
      financialTransaction: { create: vi.fn() },
      $executeRaw: vi.fn(async () => undefined),
    };

    vi.mocked(prisma.$transaction).mockImplementation(async (fn) =>
      fn(fakeTx as never),
    );

    const result = await applyCustomerCredit(ctx, {
      customerId: "customer-1",
      creditId: "credit-1",
      saleId: "sale-1",
      amountMinor: 5000,
      approvedById: "user-1",
      operationId: "op-apply-1",
    });

    expect(result).toBeDefined();
    expect(fakeTx.customerCreditApplication.create).toHaveBeenCalledOnce();
    // Confirm no sale or financial transaction creation
    expect(fakeTx.sale.create).not.toHaveBeenCalled();
    expect(fakeTx.financialTransaction.create).not.toHaveBeenCalled();
  });

  it("5b. idempotency: second call with same operationId returns existing application", async () => {
    const credit = makeCredit({ amountMinor: 10000 });
    const existingApp = {
      id: "app-existing",
      businessId: "biz-1",
      customerId: "customer-1",
      creditId: "credit-1",
      saleId: "sale-1",
      amountMinor: 5000,
      approvedById: "user-1",
      operationId: "op-apply-idem",
      createdAt: new Date(),
    };
    const fakeTx = {
      customerCredit: {
        findUnique: vi.fn(async () => credit),
      },
      customerCreditApplication: {
        findMany: vi.fn(async () => []),
        findUnique: vi.fn(async () => existingApp),
        create: vi.fn(),
      },
      $executeRaw: vi.fn(async () => undefined),
    };

    vi.mocked(prisma.$transaction).mockImplementation(async (fn) =>
      fn(fakeTx as never),
    );

    const result = await applyCustomerCredit(ctx, {
      customerId: "customer-1",
      creditId: "credit-1",
      saleId: "sale-1",
      amountMinor: 5000,
      approvedById: "user-1",
      operationId: "op-apply-idem",
    });

    expect(result).toEqual(existingApp);
    expect(fakeTx.customerCreditApplication.create).not.toHaveBeenCalled();
  });

  it("throws when amountMinor exceeds remaining credit balance", async () => {
    const credit = makeCredit({ amountMinor: 5000 });
    const existingApplications = [{ amountMinor: 4000 }]; // 4000 already applied, 1000 remaining
    const fakeTx = {
      customerCredit: {
        findUnique: vi.fn(async () => credit),
      },
      customerCreditApplication: {
        findMany: vi.fn(async () => existingApplications),
        findUnique: vi.fn(async () => null),
        create: vi.fn(),
      },
      $executeRaw: vi.fn(async () => undefined),
    };

    vi.mocked(prisma.$transaction).mockImplementation(async (fn) =>
      fn(fakeTx as never),
    );

    await expect(
      applyCustomerCredit(ctx, {
        customerId: "customer-1",
        creditId: "credit-1",
        saleId: "sale-1",
        amountMinor: 2000, // more than 1000 remaining
        approvedById: "user-1",
        operationId: "op-apply-exceed",
      }),
    ).rejects.toMatchObject({ message: "Insufficient credit balance" });
  });
});

// ─── verifyRepayment tests ─────────────────────────────────

describe("verifyRepayment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects when repayment is not PENDING_VERIFICATION", async () => {
    const alreadyVerified = makeRepayment({ verificationStatus: "VERIFIED" });
    const fakeTx = {
      customerDebtRepayment: {
        findUnique: vi.fn(async () => alreadyVerified),
        update: vi.fn(),
      },
      customerDebt: { findUnique: vi.fn(), update: vi.fn() },
      customerCredit: { create: vi.fn() },
      $executeRaw: vi.fn(async () => undefined),
    };

    vi.mocked(prisma.$transaction).mockImplementation(async (fn) =>
      fn(fakeTx as never),
    );

    await expect(verifyRepayment(ctx, "repayment-1", "VERIFIED")).rejects.toMatchObject({
      message: "Repayment is not pending verification",
    });
  });

  it("VERIFIED status: reduces outstanding when amount <= outstanding", async () => {
    const repayment = makeRepayment({
      verificationStatus: "PENDING_VERIFICATION",
      amountMinor: 3000,
    });
    const debt = makeDebt({ outstandingMinor: 5000 });
    const fakeTx = {
      customerDebtRepayment: {
        findUnique: vi.fn(async () => repayment),
        update: vi.fn(async () => makeRepayment({ verificationStatus: "VERIFIED" })),
      },
      customerDebt: {
        findUnique: vi.fn(async () => debt),
        update: vi.fn(async () => makeDebt({ outstandingMinor: 2000 })),
      },
      customerCredit: { create: vi.fn() },
      $executeRaw: vi.fn(async () => undefined),
    };

    vi.mocked(prisma.$transaction).mockImplementation(async (fn) =>
      fn(fakeTx as never),
    );

    await verifyRepayment(ctx, "repayment-1", "VERIFIED");

    expect(fakeTx.customerDebt.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { outstandingMinor: 2000 } }),
    );
    // No overpayment credit needed
    expect(fakeTx.customerCredit.create).not.toHaveBeenCalled();
  });

  it("FAILED status: does not change outstanding or create credit", async () => {
    const repayment = makeRepayment({ verificationStatus: "PENDING_VERIFICATION" });
    const fakeTx = {
      customerDebtRepayment: {
        findUnique: vi.fn(async () => repayment),
        update: vi.fn(async () => makeRepayment({ verificationStatus: "FAILED" })),
      },
      customerDebt: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      customerCredit: { create: vi.fn() },
      $executeRaw: vi.fn(async () => undefined),
    };

    vi.mocked(prisma.$transaction).mockImplementation(async (fn) =>
      fn(fakeTx as never),
    );

    const result = await verifyRepayment(ctx, "repayment-1", "FAILED");

    expect(result.verificationStatus).toBe("FAILED");
    expect(fakeTx.customerDebt.findUnique).not.toHaveBeenCalled();
    expect(fakeTx.customerDebt.update).not.toHaveBeenCalled();
    expect(fakeTx.customerCredit.create).not.toHaveBeenCalled();
  });

  it("lockKey is called for the debt", async () => {
    const repayment = makeRepayment({ verificationStatus: "PENDING_VERIFICATION" });
    const debt = makeDebt({ outstandingMinor: 5000 });
    const fakeTx = {
      customerDebtRepayment: {
        findUnique: vi.fn(async () => repayment),
        update: vi.fn(async () => makeRepayment({ verificationStatus: "VERIFIED" })),
      },
      customerDebt: {
        findUnique: vi.fn(async () => debt),
        update: vi.fn(async () => makeDebt({ outstandingMinor: 0 })),
      },
      customerCredit: { create: vi.fn() },
      $executeRaw: vi.fn(async () => undefined),
    };

    vi.mocked(prisma.$transaction).mockImplementation(async (fn) =>
      fn(fakeTx as never),
    );

    await verifyRepayment(ctx, "repayment-1", "VERIFIED");

    expect(lockKey).toHaveBeenCalledWith(expect.anything(), "debt:debt-1");
  });
});
