-- CreateTable
CREATE TABLE "backtest_comparisons" (
    "id" TEXT NOT NULL,
    "base_backtest_id" TEXT NOT NULL,
    "base_import_id" TEXT NOT NULL,
    "target_backtest_id" TEXT NOT NULL,
    "target_import_id" TEXT NOT NULL,
    "metrics_diff_json" JSONB NOT NULL,
    "tradeoff_summary" TEXT NOT NULL,
    "ai_summary" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "backtest_comparisons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "backtest_comparisons_base_backtest_id_created_at_idx" ON "backtest_comparisons"("base_backtest_id", "created_at");

-- CreateIndex
CREATE INDEX "backtest_comparisons_target_backtest_id_created_at_idx" ON "backtest_comparisons"("target_backtest_id", "created_at");

-- CreateIndex
CREATE INDEX "backtest_comparisons_created_at_idx" ON "backtest_comparisons"("created_at");

-- AddForeignKey
ALTER TABLE "backtest_comparisons" ADD CONSTRAINT "backtest_comparisons_base_backtest_id_fkey" FOREIGN KEY ("base_backtest_id") REFERENCES "backtests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backtest_comparisons" ADD CONSTRAINT "backtest_comparisons_target_backtest_id_fkey" FOREIGN KEY ("target_backtest_id") REFERENCES "backtests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
