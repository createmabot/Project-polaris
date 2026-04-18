-- CreateEnum
CREATE TYPE "TransactionSide" AS ENUM ('buy', 'sell');

-- CreateTable
CREATE TABLE "portfolios" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "baseCurrency" TEXT NOT NULL DEFAULT 'JPY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portfolios_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "portfolios_userId_createdAt_idx" ON "portfolios"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "portfolios_userId_name_key" ON "portfolios"("userId", "name");

-- AddForeignKey
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: one default portfolio per user
INSERT INTO "portfolios" ("id", "userId", "name", "isDefault", "baseCurrency", "createdAt", "updatedAt")
SELECT CONCAT('default-', u."id"), u."id", 'default', true, 'JPY', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "users" u
WHERE NOT EXISTS (
  SELECT 1
  FROM "portfolios" p
  WHERE p."userId" = u."id" AND p."name" = 'default'
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "symbolId" TEXT NOT NULL,
    "side" "TransactionSide" NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "price" DECIMAL(18,6) NOT NULL,
    "feeAmount" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "executedAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transactions_portfolioId_symbolId_executedAt_id_idx" ON "transactions"("portfolioId", "symbolId", "executedAt", "id");

-- CreateIndex
CREATE INDEX "transactions_userId_executedAt_idx" ON "transactions"("userId", "executedAt");

-- CreateIndex
CREATE INDEX "transactions_symbolId_executedAt_idx" ON "transactions"("symbolId", "executedAt");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_symbolId_fkey" FOREIGN KEY ("symbolId") REFERENCES "symbols"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable positions
ALTER TABLE "positions" ADD COLUMN "portfolioId" TEXT;

-- Backfill portfolioId from default portfolio
UPDATE "positions" pos
SET "portfolioId" = p."id"
FROM "portfolios" p
WHERE pos."userId" = p."userId"
  AND p."name" = 'default'
  AND p."isDefault" = true;

-- Make non-null after backfill
ALTER TABLE "positions" ALTER COLUMN "portfolioId" SET NOT NULL;

-- Replace unique/index for new read-model key
DROP INDEX "positions_userId_symbolId_key";
CREATE UNIQUE INDEX "positions_portfolioId_symbolId_key" ON "positions"("portfolioId", "symbolId");
CREATE INDEX "positions_portfolioId_createdAt_idx" ON "positions"("portfolioId", "createdAt");

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;