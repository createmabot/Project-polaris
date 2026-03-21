-- AlterTable
ALTER TABLE "comparison_results"
ADD COLUMN "aiJobId" TEXT,
ADD COLUMN "title" TEXT,
ADD COLUMN "bodyMarkdown" TEXT,
ADD COLUMN "structuredJson" JSONB,
ADD COLUMN "modelName" TEXT,
ADD COLUMN "promptVersion" TEXT;

-- CreateIndex
CREATE INDEX "comparison_results_aiJobId_idx" ON "comparison_results"("aiJobId");

-- AddForeignKey
ALTER TABLE "comparison_results"
ADD CONSTRAINT "comparison_results_aiJobId_fkey"
FOREIGN KEY ("aiJobId") REFERENCES "ai_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
