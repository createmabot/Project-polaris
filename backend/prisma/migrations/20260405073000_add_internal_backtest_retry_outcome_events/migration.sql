CREATE TABLE "internal_backtest_data_source_retry_outcome_events" (
  "id" TEXT NOT NULL,
  "execution_id" TEXT,
  "provider_name" TEXT,
  "internal_reason_code" TEXT,
  "symbol" TEXT,
  "market" TEXT,
  "timeframe" TEXT,
  "range_from" TEXT,
  "range_to" TEXT,
  "elapsed_ms" INTEGER,
  "http_status" INTEGER,
  "endpoint_kind" TEXT,
  "retry_target" BOOLEAN NOT NULL DEFAULT false,
  "retry_attempted" BOOLEAN NOT NULL DEFAULT false,
  "retry_attempts" INTEGER NOT NULL DEFAULT 1,
  "outcome" TEXT NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "internal_backtest_data_source_retry_outcome_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "internal_backtest_data_source_retry_outcome_events_occurred_at_idx"
  ON "internal_backtest_data_source_retry_outcome_events"("occurred_at");
CREATE INDEX "internal_backtest_data_source_retry_outcome_events_internal_reason_code_idx"
  ON "internal_backtest_data_source_retry_outcome_events"("internal_reason_code");
CREATE INDEX "internal_backtest_data_source_retry_outcome_events_provider_name_idx"
  ON "internal_backtest_data_source_retry_outcome_events"("provider_name");
CREATE INDEX "internal_backtest_data_source_retry_outcome_events_outcome_idx"
  ON "internal_backtest_data_source_retry_outcome_events"("outcome");
