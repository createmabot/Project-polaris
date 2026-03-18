-- CreateTable
CREATE TABLE "research_notes" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "symbolId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "thesisText" TEXT,
    "scenarioText" TEXT,
    "entryConditionText" TEXT,
    "takeProfitText" TEXT,
    "stopLossText" TEXT,
    "invalidationText" TEXT,
    "nextReviewAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "research_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "note_revisions" (
    "id" TEXT NOT NULL,
    "researchNoteId" TEXT NOT NULL,
    "revisionNo" INTEGER NOT NULL,
    "snapshotJson" JSONB NOT NULL,
    "changeSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "note_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "note_revisions_researchNoteId_revisionNo_key" ON "note_revisions"("researchNoteId", "revisionNo");

-- AddForeignKey
ALTER TABLE "research_notes" ADD CONSTRAINT "research_notes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_notes" ADD CONSTRAINT "research_notes_symbolId_fkey" FOREIGN KEY ("symbolId") REFERENCES "symbols"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_revisions" ADD CONSTRAINT "note_revisions_researchNoteId_fkey" FOREIGN KEY ("researchNoteId") REFERENCES "research_notes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
