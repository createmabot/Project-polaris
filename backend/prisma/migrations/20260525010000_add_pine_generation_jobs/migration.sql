-- CreateTable
CREATE TABLE "pine_generation_jobs" (
    "id" TEXT NOT NULL,
    "strategy_version_id" TEXT,
    "request_kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "current_stage" TEXT NOT NULL,
    "stage_history_json" JSONB NOT NULL,
    "result_pine_script_id" TEXT,
    "error_code" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "pine_generation_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pine_generation_jobs_strategy_version_id_created_at_idx" ON "pine_generation_jobs"("strategy_version_id", "created_at");

-- CreateIndex
CREATE INDEX "pine_generation_jobs_status_created_at_idx" ON "pine_generation_jobs"("status", "created_at");

-- AddForeignKey
ALTER TABLE "pine_generation_jobs" ADD CONSTRAINT "pine_generation_jobs_strategy_version_id_fkey"
    FOREIGN KEY ("strategy_version_id") REFERENCES "strategy_rule_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pine_generation_jobs" ADD CONSTRAINT "pine_generation_jobs_strategy_version_id_fkey"
    FOREIGN KEY ("strategy_version_id") REFERENCES "strategy_rule_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
