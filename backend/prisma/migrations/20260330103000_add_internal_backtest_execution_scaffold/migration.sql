-- CreateEnum
CREATE TYPE "InternalBacktestExecutionStatus" AS ENUM ('queued', 'running', 'succeeded', 'failed', 'canceled');

-- CreateTable
CREATE TABLE "internal_backtest_executions" (
    "id" TEXT NOT NULL,
    "strategyRuleVersionId" TEXT NOT NULL,
    "status" "InternalBacktestExecutionStatus" NOT NULL DEFAULT 'queued',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "inputSnapshotJson" JSONB NOT NULL,
    "resultSummaryJson" JSONB,
    "artifactPointerJson" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "engineVersion" TEXT NOT NULL DEFAULT 'ibtx-v0',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "internal_backtest_executions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "internal_backtest_executions_strategy_rule_version_id_reques_idx" ON "internal_backtest_executions"("strategyRuleVersionId", "requestedAt");

-- CreateIndex
CREATE INDEX "internal_backtest_executions_status_requested_at_idx" ON "internal_backtest_executions"("status", "requestedAt");

-- AddForeignKey
ALTER TABLE "internal_backtest_executions" ADD CONSTRAINT "internal_backtest_executions_strategy_rule_version_id_fkey" FOREIGN KEY ("strategyRuleVersionId") REFERENCES "strategy_rule_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
