-- AlterTable
ALTER TABLE "internal_backtest_execution_artifacts" ALTER COLUMN "updated_at" DROP DEFAULT;

-- RenameIndex
ALTER INDEX "internal_backtest_execution_artifacts_execution_id_created_at_i" RENAME TO "internal_backtest_execution_artifacts_execution_id_created__idx";
