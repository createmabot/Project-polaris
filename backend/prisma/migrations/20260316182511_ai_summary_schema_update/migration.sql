-- AlterTable
ALTER TABLE "ai_jobs" ADD COLUMN     "errorMessage" TEXT,
ALTER COLUMN "status" SET DEFAULT 'queued',
ALTER COLUMN "jobType" SET DEFAULT 'generate_alert_summary';

-- AlterTable
ALTER TABLE "ai_summaries" ADD COLUMN     "generatedAt" TIMESTAMP(3),
ADD COLUMN     "generationContextJson" JSONB,
ADD COLUMN     "modelName" TEXT,
ADD COLUMN     "promptVersion" TEXT,
ADD COLUMN     "title" TEXT,
ADD COLUMN     "userId" TEXT,
ALTER COLUMN "summaryScope" SET DEFAULT 'alert_reason';
