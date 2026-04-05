-- DropForeignKey
ALTER TABLE "comparison_results" DROP CONSTRAINT "comparison_results_comparisonSessionId_fkey";

-- DropForeignKey
ALTER TABLE "comparison_symbols" DROP CONSTRAINT "comparison_symbols_comparisonSessionId_fkey";

-- RenameForeignKey
ALTER TABLE "internal_backtest_executions" RENAME CONSTRAINT "internal_backtest_executions_strategy_rule_version_id_fkey" TO "internal_backtest_executions_strategyRuleVersionId_fkey";

-- AddForeignKey
ALTER TABLE "comparison_symbols" ADD CONSTRAINT "comparison_symbols_comparisonSessionId_fkey" FOREIGN KEY ("comparisonSessionId") REFERENCES "comparison_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comparison_results" ADD CONSTRAINT "comparison_results_comparisonSessionId_fkey" FOREIGN KEY ("comparisonSessionId") REFERENCES "comparison_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "internal_backtest_data_source_failure_events_internal_reason_co" RENAME TO "internal_backtest_data_source_failure_events_internal_reaso_idx";

-- RenameIndex
ALTER INDEX "internal_backtest_data_source_retry_outcome_events_internal_rea" RENAME TO "internal_backtest_data_source_retry_outcome_events_internal_idx";

-- RenameIndex
ALTER INDEX "internal_backtest_data_source_retry_outcome_events_occurred_at_" RENAME TO "internal_backtest_data_source_retry_outcome_events_occurred_idx";

-- RenameIndex
ALTER INDEX "internal_backtest_data_source_retry_outcome_events_provider_nam" RENAME TO "internal_backtest_data_source_retry_outcome_events_provider_idx";

-- RenameIndex
ALTER INDEX "internal_backtest_executions_status_requested_at_idx" RENAME TO "internal_backtest_executions_status_requestedAt_idx";

-- RenameIndex
ALTER INDEX "internal_backtest_executions_strategy_rule_version_id_reques_id" RENAME TO "internal_backtest_executions_strategyRuleVersionId_requeste_idx";

-- RenameIndex
ALTER INDEX "snapshot_reason_daily_metrics_metric_date_source_name_reason_co" RENAME TO "snapshot_reason_daily_metrics_metric_date_source_name_reaso_key";
