-- CreateTable
CREATE TABLE "pine_scripts" (
  "id" TEXT NOT NULL,
  "strategyRuleVersionId" TEXT NOT NULL,
  "scriptName" TEXT NOT NULL,
  "pineVersion" TEXT NOT NULL,
  "scriptBody" TEXT NOT NULL,
  "generationNoteJson" JSONB,
  "status" TEXT NOT NULL DEFAULT 'ready',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "pine_scripts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pine_scripts_strategyRuleVersionId_createdAt_idx" ON "pine_scripts"("strategyRuleVersionId", "createdAt");

-- CreateIndex
CREATE INDEX "pine_scripts_status_idx" ON "pine_scripts"("status");

-- AddForeignKey
ALTER TABLE "pine_scripts"
ADD CONSTRAINT "pine_scripts_strategyRuleVersionId_fkey"
FOREIGN KEY ("strategyRuleVersionId")
REFERENCES "strategy_rule_versions"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
