-- CreateTable
CREATE TABLE "internal_backtest_data_source_failure_events" (
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
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "internal_backtest_data_source_failure_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "internal_backtest_data_source_failure_events_occurred_at_idx" ON "internal_backtest_data_source_failure_events"("occurred_at");

-- CreateIndex
CREATE INDEX "internal_backtest_data_source_failure_events_internal_reason_code_idx" ON "internal_backtest_data_source_failure_events"("internal_reason_code");

-- CreateIndex
CREATE INDEX "internal_backtest_data_source_failure_events_provider_name_idx" ON "internal_backtest_data_source_failure_events"("provider_name");
