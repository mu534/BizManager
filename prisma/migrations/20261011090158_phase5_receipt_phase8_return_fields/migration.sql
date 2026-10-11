-- CreateEnum
CREATE TYPE "ReturnStatus" AS ENUM ('COMPLETED', 'PENDING');

-- CreateEnum
CREATE TYPE "StockDisposition" AS ENUM ('RESTOCK', 'DAMAGED');

-- AlterTable
ALTER TABLE "sale_return_items" ADD COLUMN     "stockDisposition" "StockDisposition" NOT NULL DEFAULT 'RESTOCK';

-- AlterTable
ALTER TABLE "sale_returns" ADD COLUMN     "refundAccountId" TEXT,
ADD COLUMN     "status" "ReturnStatus" NOT NULL DEFAULT 'COMPLETED';

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "receiptNumber" TEXT;
