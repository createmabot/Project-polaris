CREATE TABLE "strategy_optimization_sessions" (
    "id" TEXT NOT NULL,
    "symbol_id" TEXT,
    "strategy_rule_id" TEXT NOT NULL,
    "base_strategy_version_id" TEXT NOT NULL,
    "source_backtest_id" TEXT,
    "source_ai_summary_id" TEXT,
    "objective_type" TEXT NOT NULL DEFAULT 'balanced',
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strategy_optimization_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "strategy_refinement_candidates" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "source_backtest_id" TEXT,
    "parent_strategy_version_id" TEXT NOT NULL,
    "created_strategy_rule_version_id" TEXT,
    "candidate_index" INTEGER NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "target_area" VARCHAR(40) NOT NULL,
    "rationale" TEXT NOT NULL,
    "change_summary" TEXT NOT NULL,
    "entry_change" TEXT,
    "exit_change" TEXT,
    "risk_change" TEXT,
    "validation_plan" TEXT,
    "expected_metric_effect_json" JSONB,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "selected_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strategy_refinement_candidates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "strategy_optimization_sessions_symbol_id_created_at_idx" ON "strategy_optimization_sessions"("symbol_id", "created_at");
CREATE INDEX "strategy_optimization_sessions_strategy_rule_id_created_at_idx" ON "strategy_optimization_sessions"("strategy_rule_id", "created_at");
CREATE INDEX "strategy_optimization_sessions_base_strategy_version_id_created_at_idx" ON "strategy_optimization_sessions"("base_strategy_version_id", "created_at");
CREATE INDEX "strategy_optimization_sessions_source_backtest_id_created_at_idx" ON "strategy_optimization_sessions"("source_backtest_id", "created_at");
CREATE INDEX "strategy_optimization_sessions_source_ai_summary_id_idx" ON "strategy_optimization_sessions"("source_ai_summary_id");
CREATE INDEX "strategy_optimization_sessions_objective_type_created_at_idx" ON "strategy_optimization_sessions"("objective_type", "created_at");
CREATE INDEX "strategy_optimization_sessions_status_created_at_idx" ON "strategy_optimization_sessions"("status", "created_at");

CREATE INDEX "strategy_refinement_candidates_session_id_candidate_index_idx" ON "strategy_refinement_candidates"("session_id", "candidate_index");
CREATE INDEX "strategy_refinement_candidates_source_backtest_id_created_at_idx" ON "strategy_refinement_candidates"("source_backtest_id", "created_at");
CREATE INDEX "strategy_refinement_candidates_parent_strategy_version_id_created_at_idx" ON "strategy_refinement_candidates"("parent_strategy_version_id", "created_at");
CREATE INDEX "strategy_refinement_candidates_created_strategy_rule_version_id_idx" ON "strategy_refinement_candidates"("created_strategy_rule_version_id");
CREATE INDEX "strategy_refinement_candidates_status_created_at_idx" ON "strategy_refinement_candidates"("status", "created_at");

ALTER TABLE "strategy_optimization_sessions" ADD CONSTRAINT "strategy_optimization_sessions_symbol_id_fkey" FOREIGN KEY ("symbol_id") REFERENCES "symbols"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "strategy_optimization_sessions" ADD CONSTRAINT "strategy_optimization_sessions_strategy_rule_id_fkey" FOREIGN KEY ("strategy_rule_id") REFERENCES "strategy_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "strategy_optimization_sessions" ADD CONSTRAINT "strategy_optimization_sessions_base_strategy_version_id_fkey" FOREIGN KEY ("base_strategy_version_id") REFERENCES "strategy_rule_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "strategy_optimization_sessions" ADD CONSTRAINT "strategy_optimization_sessions_source_backtest_id_fkey" FOREIGN KEY ("source_backtest_id") REFERENCES "backtests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "strategy_refinement_candidates" ADD CONSTRAINT "strategy_refinement_candidates_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "strategy_optimization_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "strategy_refinement_candidates" ADD CONSTRAINT "strategy_refinement_candidates_source_backtest_id_fkey" FOREIGN KEY ("source_backtest_id") REFERENCES "backtests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "strategy_refinement_candidates" ADD CONSTRAINT "strategy_refinement_candidates_parent_strategy_version_id_fkey" FOREIGN KEY ("parent_strategy_version_id") REFERENCES "strategy_rule_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "strategy_refinement_candidates" ADD CONSTRAINT "strategy_refinement_candidates_created_strategy_rule_version_id_fkey" FOREIGN KEY ("created_strategy_rule_version_id") REFERENCES "strategy_rule_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
