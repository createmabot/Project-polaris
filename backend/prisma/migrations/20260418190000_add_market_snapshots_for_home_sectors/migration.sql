CREATE TABLE "market_snapshots" (
    "id" TEXT NOT NULL,
    "snapshot_type" TEXT NOT NULL,
    "target_code" TEXT NOT NULL,
    "snapshot_date" TIMESTAMP(3),
    "snapshot_timeframe" TEXT,
    "price" DECIMAL(18,6) NOT NULL,
    "change_value" DECIMAL(18,6),
    "change_rate" DECIMAL(18,6),
    "volume" DECIMAL(20,6),
    "extra_json" JSONB,
    "as_of" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "market_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "market_snapshots_snapshot_type_target_code_as_of_idx"
    ON "market_snapshots"("snapshot_type", "target_code", "as_of");

CREATE INDEX "market_snapshots_snapshot_type_as_of_idx"
    ON "market_snapshots"("snapshot_type", "as_of");
