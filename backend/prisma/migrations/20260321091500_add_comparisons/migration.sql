-- CreateTable
CREATE TABLE "comparison_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT,
    "comparisonType" TEXT NOT NULL DEFAULT 'symbol',
    "status" TEXT NOT NULL DEFAULT 'ready',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comparison_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comparison_symbols" (
    "id" TEXT NOT NULL,
    "comparisonSessionId" TEXT NOT NULL,
    "symbolId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comparison_symbols_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comparison_results" (
    "id" TEXT NOT NULL,
    "comparisonSessionId" TEXT NOT NULL,
    "comparedMetricJson" JSONB,
    "generatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comparison_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "comparison_sessions_createdAt_idx" ON "comparison_sessions"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "comparison_symbols_comparisonSessionId_symbolId_key" ON "comparison_symbols"("comparisonSessionId", "symbolId");

-- CreateIndex
CREATE INDEX "comparison_symbols_comparisonSessionId_sortOrder_idx" ON "comparison_symbols"("comparisonSessionId", "sortOrder");

-- CreateIndex
CREATE INDEX "comparison_symbols_symbolId_idx" ON "comparison_symbols"("symbolId");

-- CreateIndex
CREATE INDEX "comparison_results_comparisonSessionId_generatedAt_idx" ON "comparison_results"("comparisonSessionId", "generatedAt");

-- AddForeignKey
ALTER TABLE "comparison_sessions" ADD CONSTRAINT "comparison_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comparison_symbols" ADD CONSTRAINT "comparison_symbols_comparisonSessionId_fkey" FOREIGN KEY ("comparisonSessionId") REFERENCES "comparison_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comparison_symbols" ADD CONSTRAINT "comparison_symbols_symbolId_fkey" FOREIGN KEY ("symbolId") REFERENCES "symbols"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comparison_results" ADD CONSTRAINT "comparison_results_comparisonSessionId_fkey" FOREIGN KEY ("comparisonSessionId") REFERENCES "comparison_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
