-- CreateTable
CREATE TABLE "external_references" (
    "id" TEXT NOT NULL,
    "symbolId" TEXT,
    "alertEventId" TEXT,
    "referenceType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceName" TEXT,
    "sourceUrl" TEXT,
    "publishedAt" TIMESTAMP(3),
    "summaryText" TEXT,
    "metadataJson" JSONB,
    "dedupeKey" TEXT NOT NULL,
    "relevanceScore" INTEGER DEFAULT 50,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_references_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "external_references_dedupeKey_key" ON "external_references"("dedupeKey");

-- CreateIndex
CREATE INDEX "external_references_symbolId_idx" ON "external_references"("symbolId");

-- CreateIndex
CREATE INDEX "external_references_alertEventId_idx" ON "external_references"("alertEventId");

-- CreateIndex
CREATE INDEX "external_references_referenceType_idx" ON "external_references"("referenceType");

-- CreateIndex
CREATE INDEX "external_references_publishedAt_idx" ON "external_references"("publishedAt");

-- AddForeignKey
ALTER TABLE "external_references" ADD CONSTRAINT "external_references_symbolId_fkey" FOREIGN KEY ("symbolId") REFERENCES "symbols"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_references" ADD CONSTRAINT "external_references_alertEventId_fkey" FOREIGN KEY ("alertEventId") REFERENCES "alert_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
