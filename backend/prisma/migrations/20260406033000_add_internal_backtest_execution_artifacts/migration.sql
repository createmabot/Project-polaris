CREATE TABLE "internal_backtest_execution_artifacts" (
  "id" TEXT NOT NULL,
  "execution_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "payload_json" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "internal_backtest_execution_artifacts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "internal_backtest_execution_artifacts_execution_id_fkey"
    FOREIGN KEY ("execution_id") REFERENCES "internal_backtest_executions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "internal_backtest_execution_artifacts_execution_id_kind_key"
  ON "internal_backtest_execution_artifacts"("execution_id", "kind");

CREATE UNIQUE INDEX "internal_backtest_execution_artifacts_path_key"
  ON "internal_backtest_execution_artifacts"("path");

CREATE INDEX "internal_backtest_execution_artifacts_execution_id_created_at_idx"
  ON "internal_backtest_execution_artifacts"("execution_id", "created_at");