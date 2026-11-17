-- Phase 13: Business rules — customer credit/debt, payment verification, cash rounding
-- ADDITIVE ONLY. No existing tables are dropped or columns removed.

-- Enums
CREATE TYPE "PaymentVerificationStatus" AS ENUM ('VERIFIED', 'PENDING_VERIFICATION', 'FAILED');
CREATE TYPE "DebtRepaymentMethod" AS ENUM ('CASH', 'TELEBIRR', 'BANK');
CREATE TYPE "CustomerCreditSourceType" AS ENUM ('OVERPAYMENT', 'RETURN', 'MANUAL');

-- Add verificationStatus to Payment (non-destructive, default VERIFIED so all existing rows are valid)
ALTER TABLE "payments"
  ADD COLUMN "verificationStatus" "PaymentVerificationStatus" NOT NULL DEFAULT 'VERIFIED';

-- Customer
CREATE TABLE "customers" (
  "id"          TEXT NOT NULL,
  "businessId"  TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "phone"       TEXT,
  "email"       TEXT,
  "notes"       TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "customers_businessId_idx" ON "customers"("businessId");

-- CustomerDebt
CREATE TABLE "customer_debts" (
  "id"                  TEXT NOT NULL,
  "businessId"          TEXT NOT NULL,
  "customerId"          TEXT NOT NULL,
  "saleId"              TEXT NOT NULL,
  "originalAmountMinor" INTEGER NOT NULL,
  "outstandingMinor"    INTEGER NOT NULL,
  "operationId"         TEXT NOT NULL,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customer_debts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "customer_debts_operationId_key" ON "customer_debts"("operationId");
CREATE INDEX "customer_debts_businessId_idx" ON "customer_debts"("businessId");
CREATE INDEX "customer_debts_customerId_idx" ON "customer_debts"("customerId");
ALTER TABLE "customer_debts"
  ADD CONSTRAINT "customer_debts_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CustomerDebtRepayment
CREATE TABLE "customer_debt_repayments" (
  "id"                 TEXT NOT NULL,
  "businessId"         TEXT NOT NULL,
  "customerId"         TEXT NOT NULL,
  "debtId"             TEXT NOT NULL,
  "amountMinor"        INTEGER NOT NULL,
  "paymentMethod"      "DebtRepaymentMethod" NOT NULL,
  "verificationStatus" "PaymentVerificationStatus" NOT NULL DEFAULT 'VERIFIED',
  "operationId"        TEXT NOT NULL,
  "notes"              TEXT,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_debt_repayments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "customer_debt_repayments_operationId_key" ON "customer_debt_repayments"("operationId");
CREATE INDEX "customer_debt_repayments_businessId_idx" ON "customer_debt_repayments"("businessId");
CREATE INDEX "customer_debt_repayments_debtId_idx" ON "customer_debt_repayments"("debtId");
ALTER TABLE "customer_debt_repayments"
  ADD CONSTRAINT "customer_debt_repayments_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_debt_repayments"
  ADD CONSTRAINT "customer_debt_repayments_debtId_fkey"
  FOREIGN KEY ("debtId") REFERENCES "customer_debts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CustomerCredit
CREATE TABLE "customer_credits" (
  "id"          TEXT NOT NULL,
  "businessId"  TEXT NOT NULL,
  "customerId"  TEXT NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "reason"      TEXT NOT NULL,
  "sourceType"  "CustomerCreditSourceType" NOT NULL,
  "sourceId"    TEXT,
  "operationId" TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_credits_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "customer_credits_operationId_key" ON "customer_credits"("operationId");
CREATE INDEX "customer_credits_businessId_idx" ON "customer_credits"("businessId");
CREATE INDEX "customer_credits_customerId_idx" ON "customer_credits"("customerId");
ALTER TABLE "customer_credits"
  ADD CONSTRAINT "customer_credits_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CustomerCreditApplication
CREATE TABLE "customer_credit_applications" (
  "id"           TEXT NOT NULL,
  "businessId"   TEXT NOT NULL,
  "customerId"   TEXT NOT NULL,
  "creditId"     TEXT NOT NULL,
  "saleId"       TEXT,
  "amountMinor"  INTEGER NOT NULL,
  "approvedById" TEXT,
  "operationId"  TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_credit_applications_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "customer_credit_applications_operationId_key" ON "customer_credit_applications"("operationId");
CREATE INDEX "customer_credit_applications_businessId_idx" ON "customer_credit_applications"("businessId");
CREATE INDEX "customer_credit_applications_customerId_idx" ON "customer_credit_applications"("customerId");
ALTER TABLE "customer_credit_applications"
  ADD CONSTRAINT "customer_credit_applications_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_credit_applications"
  ADD CONSTRAINT "customer_credit_applications_creditId_fkey"
  FOREIGN KEY ("creditId") REFERENCES "customer_credits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- SaleRounding
CREATE TABLE "sale_roundings" (
  "id"                 TEXT NOT NULL,
  "saleId"             TEXT NOT NULL,
  "businessId"         TEXT NOT NULL,
  "originalTotalMinor" INTEGER NOT NULL,
  "roundedTotalMinor"  INTEGER NOT NULL,
  "roundingDifference" INTEGER NOT NULL,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sale_roundings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sale_roundings_saleId_key" ON "sale_roundings"("saleId");
CREATE INDEX "sale_roundings_businessId_idx" ON "sale_roundings"("businessId");
