-- CreateTable
CREATE TABLE "backtests" (
    "id" TEXT NOT NULL,
    "strategyRuleVersionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "executionSource" TEXT NOT NULL DEFAULT 'tradingview',
    "market" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "backtests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backtest_imports" (
    "id" TEXT NOT NULL,
    "backtestId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "contentType" TEXT,
    "rawCsvText" TEXT NOT NULL,
    "parseStatus" TEXT NOT NULL DEFAULT 'pending',
    "parseError" TEXT,
    "parsedSummaryJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "backtest_imports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "backtests_strategyRuleVersionId_createdAt_idx" ON "backtests"("strategyRuleVersionId", "createdAt");

-- CreateIndex
CREATE INDEX "backtests_status_idx" ON "backtests"("status");

-- CreateIndex
CREATE INDEX "backtest_imports_backtestId_createdAt_idx" ON "backtest_imports"("backtestId", "createdAt");

-- CreateIndex
CREATE INDEX "backtest_imports_parseStatus_idx" ON "backtest_imports"("parseStatus");

-- AddForeignKey
ALTER TABLE "backtests" ADD CONSTRAINT "backtests_strategyRuleVersionId_fkey" FOREIGN KEY ("strategyRuleVersionId") REFERENCES "strategy_rule_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backtest_imports" ADD CONSTRAINT "backtest_imports_backtestId_fkey" FOREIGN KEY ("backtestId") REFERENCES "backtests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
