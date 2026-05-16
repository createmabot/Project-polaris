CREATE TABLE "strategy_proposal_runs" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'succeeded',
    "provider_name" TEXT NOT NULL,
    "provider_mode" TEXT NOT NULL,
    "selected_by" TEXT NOT NULL,
    "input_json" JSONB NOT NULL,
    "user_hint" VARCHAR(1000),
    "provider_observation_json" JSONB,
    "candidate_count" INTEGER NOT NULL DEFAULT 0,
    "selected_candidate_id" TEXT,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strategy_proposal_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "strategy_proposal_candidates" (
    "id" TEXT NOT NULL,
    "proposal_run_id" TEXT NOT NULL,
    "provider_candidate_id" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "candidate_json" JSONB NOT NULL,
    "selected_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strategy_proposal_candidates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "strategy_proposal_runs_created_at_idx" ON "strategy_proposal_runs"("created_at");
CREATE INDEX "strategy_proposal_runs_status_created_at_idx" ON "strategy_proposal_runs"("status", "created_at");
CREATE INDEX "strategy_proposal_runs_selected_candidate_id_idx" ON "strategy_proposal_runs"("selected_candidate_id");
CREATE UNIQUE INDEX "strategy_proposal_candidates_proposal_run_id_provider_candidate_id_key" ON "strategy_proposal_candidates"("proposal_run_id", "provider_candidate_id");
CREATE INDEX "strategy_proposal_candidates_proposal_run_id_rank_idx" ON "strategy_proposal_candidates"("proposal_run_id", "rank");
CREATE INDEX "strategy_proposal_candidates_selected_at_idx" ON "strategy_proposal_candidates"("selected_at");

ALTER TABLE "strategy_proposal_candidates" ADD CONSTRAINT "strategy_proposal_candidates_proposal_run_id_fkey" FOREIGN KEY ("proposal_run_id") REFERENCES "strategy_proposal_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
