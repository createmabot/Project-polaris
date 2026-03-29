-- CreateEnum
CREATE TYPE "InternalBacktestExecutionStatus" AS ENUM ('queued', 'running', 'succeeded', 'failed', 'canceled');

-- CreateTable
CREATE TABLE "internal_backtest_executions" (
    "id" TEXT NOT NULL,
    "strategy_rule_version_id" TEXT NOT NULL,
    "status" "InternalBacktestExecutionStatus" NOT NULL DEFAULT 'queued',
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "input_snapshot_json" JSONB NOT NULL,
    "result_summary_json" JSONB,
    "artifact_pointer_json" JSONB,
    "error_code" TEXT,
    "error_message" TEXT,
    "engine_version" TEXT NOT NULL DEFAULT 'ibtx-v0',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "internal_backtest_executions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "internal_backtest_executions_strategy_rule_version_id_reques_idx" ON "internal_backtest_executions"("strategy_rule_version_id", "requested_at");

-- CreateIndex
CREATE INDEX "internal_backtest_executions_status_requested_at_idx" ON "internal_backtest_executions"("status", "requested_at");

-- AddForeignKey
ALTER TABLE "internal_backtest_executions" ADD CONSTRAINT "internal_backtest_executions_strategy_rule_version_id_fkey" FOREIGN KEY ("strategy_rule_version_id") REFERENCES "strategy_rule_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
