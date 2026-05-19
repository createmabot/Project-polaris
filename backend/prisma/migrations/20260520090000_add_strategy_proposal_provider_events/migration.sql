CREATE TABLE "strategy_proposal_provider_events" (
    "id" TEXT NOT NULL,
    "proposal_run_id" TEXT,
    "event_type" TEXT NOT NULL,
    "provider_name" TEXT NOT NULL,
    "provider_mode" TEXT,
    "selected_by" TEXT,
    "status" TEXT NOT NULL,
    "invalid_reason" TEXT,
    "latency_bucket" TEXT,
    "elapsed_ms" INTEGER,
    "candidate_count" INTEGER,
    "validation_error_count" INTEGER,
    "retry_used" BOOLEAN NOT NULL DEFAULT false,
    "retry_reason" TEXT,
    "retry_succeeded" BOOLEAN,
    "rate_limited" BOOLEAN NOT NULL DEFAULT false,
    "rate_limit_key_source" TEXT,
    "manual_import" BOOLEAN NOT NULL DEFAULT false,
    "benchmark" BOOLEAN NOT NULL DEFAULT false,
    "metadata_json" JSONB,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "strategy_proposal_provider_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "strategy_proposal_provider_events_occurred_at_idx" ON "strategy_proposal_provider_events"("occurred_at");
CREATE INDEX "strategy_proposal_provider_events_provider_name_occurred_at_idx" ON "strategy_proposal_provider_events"("provider_name", "occurred_at");
CREATE INDEX "strategy_proposal_provider_events_event_type_occurred_at_idx" ON "strategy_proposal_provider_events"("event_type", "occurred_at");
CREATE INDEX "strategy_proposal_provider_events_status_occurred_at_idx" ON "strategy_proposal_provider_events"("status", "occurred_at");
CREATE INDEX "strategy_proposal_provider_events_proposal_run_id_idx" ON "strategy_proposal_provider_events"("proposal_run_id");

ALTER TABLE "strategy_proposal_provider_events"
ADD CONSTRAINT "strategy_proposal_provider_events_proposal_run_id_fkey"
FOREIGN KEY ("proposal_run_id") REFERENCES "strategy_proposal_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
