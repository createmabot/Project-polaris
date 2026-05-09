-- CreateTable
CREATE TABLE "symbol_strategy_applications" (
  "id" TEXT NOT NULL,
  "symbolId" TEXT NOT NULL,
  "strategyRuleId" TEXT NOT NULL,
  "strategyRuleVersionId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "source" TEXT NOT NULL DEFAULT 'manual',
  "memo" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "symbol_strategy_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "symbol_strategy_application_runs" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "runType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "backtestId" TEXT,
  "backtestImportId" TEXT,
  "internalBacktestExecutionId" TEXT,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "symbol_strategy_application_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "symbol_strategy_applications_symbolId_status_updatedAt_idx"
ON "symbol_strategy_applications"("symbolId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "symbol_strategy_applications_strategyRuleId_status_idx"
ON "symbol_strategy_applications"("strategyRuleId", "status");

-- CreateIndex
CREATE INDEX "symbol_strategy_applications_strategyRuleVersionId_idx"
ON "symbol_strategy_applications"("strategyRuleVersionId");

-- CreateIndex
CREATE INDEX "symbol_strategy_applications_symbolId_strategyRuleVersionId_status_idx"
ON "symbol_strategy_applications"("symbolId", "strategyRuleVersionId", "status");

-- CreateIndex
CREATE INDEX "symbol_strategy_application_runs_applicationId_createdAt_idx"
ON "symbol_strategy_application_runs"("applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "symbol_strategy_application_runs_applicationId_status_idx"
ON "symbol_strategy_application_runs"("applicationId", "status");

-- CreateIndex
CREATE INDEX "symbol_strategy_application_runs_runType_status_idx"
ON "symbol_strategy_application_runs"("runType", "status");

-- CreateIndex
CREATE INDEX "symbol_strategy_application_runs_backtestId_idx"
ON "symbol_strategy_application_runs"("backtestId");

-- CreateIndex
CREATE INDEX "symbol_strategy_application_runs_backtestImportId_idx"
ON "symbol_strategy_application_runs"("backtestImportId");

-- CreateIndex
CREATE INDEX "symbol_strategy_application_runs_internalBacktestExecutionId_idx"
ON "symbol_strategy_application_runs"("internalBacktestExecutionId");

-- AddForeignKey
ALTER TABLE "symbol_strategy_applications"
ADD CONSTRAINT "symbol_strategy_applications_symbolId_fkey"
FOREIGN KEY ("symbolId")
REFERENCES "symbols"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "symbol_strategy_applications"
ADD CONSTRAINT "symbol_strategy_applications_strategyRuleId_fkey"
FOREIGN KEY ("strategyRuleId")
REFERENCES "strategy_rules"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "symbol_strategy_applications"
ADD CONSTRAINT "symbol_strategy_applications_strategyRuleVersionId_fkey"
FOREIGN KEY ("strategyRuleVersionId")
REFERENCES "strategy_rule_versions"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "symbol_strategy_application_runs"
ADD CONSTRAINT "symbol_strategy_application_runs_applicationId_fkey"
FOREIGN KEY ("applicationId")
REFERENCES "symbol_strategy_applications"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "symbol_strategy_application_runs"
ADD CONSTRAINT "symbol_strategy_application_runs_backtestId_fkey"
FOREIGN KEY ("backtestId")
REFERENCES "backtests"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "symbol_strategy_application_runs"
ADD CONSTRAINT "symbol_strategy_application_runs_backtestImportId_fkey"
FOREIGN KEY ("backtestImportId")
REFERENCES "backtest_imports"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "symbol_strategy_application_runs"
ADD CONSTRAINT "symbol_strategy_application_runs_internalBacktestExecutionId_fkey"
FOREIGN KEY ("internalBacktestExecutionId")
REFERENCES "internal_backtest_executions"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
