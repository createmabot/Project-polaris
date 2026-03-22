-- CreateTable
CREATE TABLE "snapshot_reason_daily_metrics" (
    "id" TEXT NOT NULL,
    "metric_date" TIMESTAMP(3) NOT NULL,
    "source_name" TEXT NOT NULL,
    "reason_code" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "snapshot_reason_daily_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "snapshot_reason_daily_metrics_metric_date_idx" ON "snapshot_reason_daily_metrics"("metric_date");

-- CreateIndex
CREATE INDEX "snapshot_reason_daily_metrics_reason_code_idx" ON "snapshot_reason_daily_metrics"("reason_code");

-- CreateIndex
CREATE UNIQUE INDEX "snapshot_reason_daily_metrics_metric_date_source_name_reason_cod_key" ON "snapshot_reason_daily_metrics"("metric_date", "source_name", "reason_code");
