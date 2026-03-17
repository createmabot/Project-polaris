/*
  Warnings:

  - You are about to drop the column `alertEventId` on the `ai_jobs` table. All the data in the column will be lost.
  - You are about to drop the column `result` on the `ai_jobs` table. All the data in the column will be lost.
  - You are about to drop the column `summary` on the `ai_summaries` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `alert_events` table. All the data in the column will be lost.
  - You are about to drop the column `payload` on the `alert_events` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[dedupeKey]` on the table `alert_events` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tradingviewSymbol]` on the table `symbols` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `targetEntityId` to the `ai_jobs` table without a default value. This is not possible if the table is not empty.
  - Added the required column `targetEntityType` to the `ai_jobs` table without a default value. This is not possible if the table is not empty.
  - Added the required column `bodyMarkdown` to the `ai_summaries` table without a default value. This is not possible if the table is not empty.
  - Added the required column `targetEntityId` to the `ai_summaries` table without a default value. This is not possible if the table is not empty.
  - Added the required column `targetEntityType` to the `ai_summaries` table without a default value. This is not possible if the table is not empty.
  - Added the required column `alertName` to the `alert_events` table without a default value. This is not possible if the table is not empty.
  - Added the required column `dedupeKey` to the `alert_events` table without a default value. This is not possible if the table is not empty.
  - Added the required column `triggerPayloadJson` to the `alert_events` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "ai_jobs" DROP CONSTRAINT "ai_jobs_alertEventId_fkey";

-- DropForeignKey
ALTER TABLE "ai_summaries" DROP CONSTRAINT "ai_summaries_aiJobId_fkey";

-- DropForeignKey
ALTER TABLE "alert_events" DROP CONSTRAINT "alert_events_symbolId_fkey";

-- AlterTable
ALTER TABLE "ai_jobs" DROP COLUMN "alertEventId",
DROP COLUMN "result",
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "jobType" TEXT NOT NULL DEFAULT 'summarize_alert',
ADD COLUMN     "modelName" TEXT,
ADD COLUMN     "promptVersion" TEXT,
ADD COLUMN     "requestPayload" JSONB,
ADD COLUMN     "responsePayload" JSONB,
ADD COLUMN     "startedAt" TIMESTAMP(3),
ADD COLUMN     "targetEntityId" TEXT NOT NULL,
ADD COLUMN     "targetEntityType" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "ai_summaries" DROP COLUMN "summary",
ADD COLUMN     "bodyMarkdown" TEXT NOT NULL,
ADD COLUMN     "inputSnapshotHash" TEXT,
ADD COLUMN     "structuredJson" JSONB,
ADD COLUMN     "summaryScope" TEXT NOT NULL DEFAULT 'alert',
ADD COLUMN     "targetEntityId" TEXT NOT NULL,
ADD COLUMN     "targetEntityType" TEXT NOT NULL,
ALTER COLUMN "aiJobId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "alert_events" DROP COLUMN "createdAt",
DROP COLUMN "payload",
ADD COLUMN     "alertName" TEXT NOT NULL,
ADD COLUMN     "alertType" TEXT,
ADD COLUMN     "dedupeKey" TEXT NOT NULL,
ADD COLUMN     "eventId" TEXT,
ADD COLUMN     "processingStatus" TEXT NOT NULL DEFAULT 'received',
ADD COLUMN     "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "sourceType" TEXT NOT NULL DEFAULT 'tradingview',
ADD COLUMN     "timeframe" TEXT,
ADD COLUMN     "triggerPayloadJson" JSONB NOT NULL,
ADD COLUMN     "triggerPrice" DOUBLE PRECISION,
ADD COLUMN     "triggeredAt" TIMESTAMP(3),
ADD COLUMN     "userId" TEXT,
ALTER COLUMN "symbolId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "symbols" ADD COLUMN     "displayName" TEXT,
ADD COLUMN     "marketCode" TEXT,
ADD COLUMN     "symbolCode" TEXT,
ADD COLUMN     "tradingviewSymbol" TEXT;

-- CreateTable
CREATE TABLE "webhook_receipts" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'tradingview',
    "requestHeadersJson" JSONB NOT NULL,
    "rawBodyText" TEXT NOT NULL,
    "remoteIp" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authResult" TEXT,
    "parseResult" TEXT,
    "symbolResolutionResult" TEXT,
    "dedupeResult" TEXT,
    "errorReason" TEXT,
    "alertEventId" TEXT,

    CONSTRAINT "webhook_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "alert_events_dedupeKey_key" ON "alert_events"("dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "symbols_tradingviewSymbol_key" ON "symbols"("tradingviewSymbol");

-- AddForeignKey
ALTER TABLE "webhook_receipts" ADD CONSTRAINT "webhook_receipts_alertEventId_fkey" FOREIGN KEY ("alertEventId") REFERENCES "alert_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_symbolId_fkey" FOREIGN KEY ("symbolId") REFERENCES "symbols"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_summaries" ADD CONSTRAINT "ai_summaries_aiJobId_fkey" FOREIGN KEY ("aiJobId") REFERENCES "ai_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
