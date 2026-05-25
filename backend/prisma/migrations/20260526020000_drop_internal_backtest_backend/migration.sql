-- Stage 2C: remove legacy internal backtest execution backend storage only.
ALTER TABLE "symbol_strategy_application_runs"
  DROP CONSTRAINT IF EXISTS "symbol_strategy_application_runs_internalBacktestExecutionId_fkey";

DROP INDEX IF EXISTS "symbol_strategy_application_runs_internalBacktestExecutionId_idx";

ALTER TABLE "symbol_strategy_application_runs"
  DROP COLUMN IF EXISTS "internalBacktestExecutionId";

DROP TABLE IF EXISTS "internal_backtest_execution_artifacts";
DROP TABLE IF EXISTS "internal_backtest_data_source_retry_outcome_events";
DROP TABLE IF EXISTS "internal_backtest_data_source_failure_events";
DROP TABLE IF EXISTS "internal_backtest_executions";

DROP TYPE IF EXISTS "InternalBacktestExecutionStatus";
