-- AlterTable
ALTER TABLE "ai_jobs" ADD COLUMN     "durationMs" INTEGER,
ADD COLUMN     "escalated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "escalationReason" TEXT,
ADD COLUMN     "estimatedCostUsd" DOUBLE PRECISION,
ADD COLUMN     "estimatedTokens" INTEGER,
ADD COLUMN     "finalModel" TEXT,
ADD COLUMN     "initialModel" TEXT,
ADD COLUMN     "retryCount" INTEGER NOT NULL DEFAULT 0;
