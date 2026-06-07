CREATE TABLE "market_price_bars" (
    "id" TEXT NOT NULL,
    "symbol_id" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "bar_time" TIMESTAMP(3) NOT NULL,
    "open" DECIMAL(18,6) NOT NULL,
    "high" DECIMAL(18,6) NOT NULL,
    "low" DECIMAL(18,6) NOT NULL,
    "close" DECIMAL(18,6) NOT NULL,
    "volume" DECIMAL(20,6),
    "adjusted_open" DECIMAL(18,6),
    "adjusted_high" DECIMAL(18,6),
    "adjusted_low" DECIMAL(18,6),
    "adjusted_close" DECIMAL(18,6),
    "adjusted" BOOLEAN NOT NULL DEFAULT false,
    "source_type" TEXT NOT NULL DEFAULT 'manual_csv',
    "source_name" TEXT,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "market_price_bars_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "market_data_imports" (
    "id" TEXT NOT NULL,
    "symbol_id" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "source_type" TEXT NOT NULL DEFAULT 'manual_csv',
    "source_name" TEXT,
    "file_name" TEXT,
    "row_count" INTEGER NOT NULL DEFAULT 0,
    "inserted_count" INTEGER NOT NULL DEFAULT 0,
    "updated_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_count" INTEGER NOT NULL DEFAULT 0,
    "period_from" TIMESTAMP(3),
    "period_to" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'succeeded',
    "error_code" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "market_data_imports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "market_price_bars_symbol_id_timeframe_bar_time_source_type_key" ON "market_price_bars"("symbol_id", "timeframe", "bar_time", "source_type");
CREATE INDEX "market_price_bars_symbol_id_timeframe_bar_time_idx" ON "market_price_bars"("symbol_id", "timeframe", "bar_time");
CREATE INDEX "market_price_bars_symbol_id_timeframe_source_type_bar_time_idx" ON "market_price_bars"("symbol_id", "timeframe", "source_type", "bar_time");
CREATE INDEX "market_price_bars_source_type_fetched_at_idx" ON "market_price_bars"("source_type", "fetched_at");

CREATE INDEX "market_data_imports_symbol_id_timeframe_created_at_idx" ON "market_data_imports"("symbol_id", "timeframe", "created_at");
CREATE INDEX "market_data_imports_source_type_created_at_idx" ON "market_data_imports"("source_type", "created_at");
CREATE INDEX "market_data_imports_status_created_at_idx" ON "market_data_imports"("status", "created_at");

ALTER TABLE "market_price_bars" ADD CONSTRAINT "market_price_bars_symbol_id_fkey" FOREIGN KEY ("symbol_id") REFERENCES "symbols"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "market_data_imports" ADD CONSTRAINT "market_data_imports_symbol_id_fkey" FOREIGN KEY ("symbol_id") REFERENCES "symbols"("id") ON DELETE CASCADE ON UPDATE CASCADE;
