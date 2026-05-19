ALTER TABLE "strategy_proposal_runs" ADD COLUMN "archived_at" TIMESTAMP(3);

CREATE INDEX "strategy_proposal_runs_archived_at_created_at_idx" ON "strategy_proposal_runs"("archived_at", "created_at");
