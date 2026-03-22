-- CreateTable
CREATE TABLE "strategy_rules" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strategy_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strategy_rule_versions" (
    "id" TEXT NOT NULL,
    "strategyRuleId" TEXT NOT NULL,
    "naturalLanguageRule" TEXT NOT NULL,
    "normalizedRuleJson" JSONB,
    "generatedPine" TEXT,
    "warningsJson" JSONB,
    "assumptionsJson" JSONB,
    "market" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strategy_rule_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "strategy_rules_userId_idx" ON "strategy_rules"("userId");

-- CreateIndex
CREATE INDEX "strategy_rules_createdAt_idx" ON "strategy_rules"("createdAt");

-- CreateIndex
CREATE INDEX "strategy_rule_versions_strategyRuleId_createdAt_idx" ON "strategy_rule_versions"("strategyRuleId", "createdAt");

-- CreateIndex
CREATE INDEX "strategy_rule_versions_status_idx" ON "strategy_rule_versions"("status");

-- AddForeignKey
ALTER TABLE "strategy_rules" ADD CONSTRAINT "strategy_rules_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strategy_rule_versions" ADD CONSTRAINT "strategy_rule_versions_strategyRuleId_fkey" FOREIGN KEY ("strategyRuleId") REFERENCES "strategy_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
