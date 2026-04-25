-- AlterTable
ALTER TABLE "pine_scripts"
ADD COLUMN "parentPineScriptId" TEXT;

-- CreateTable
CREATE TABLE "pine_revision_inputs" (
  "id" TEXT NOT NULL,
  "strategyRuleVersionId" TEXT NOT NULL,
  "sourcePineScriptId" TEXT NOT NULL,
  "generatedPineScriptId" TEXT,
  "compileErrorText" TEXT,
  "validationNote" TEXT,
  "revisionRequest" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "pine_revision_inputs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pine_scripts_parentPineScriptId_idx" ON "pine_scripts"("parentPineScriptId");

-- CreateIndex
CREATE UNIQUE INDEX "pine_revision_inputs_generatedPineScriptId_key" ON "pine_revision_inputs"("generatedPineScriptId");

-- CreateIndex
CREATE INDEX "pine_revision_inputs_strategyRuleVersionId_createdAt_idx" ON "pine_revision_inputs"("strategyRuleVersionId", "createdAt");

-- CreateIndex
CREATE INDEX "pine_revision_inputs_sourcePineScriptId_createdAt_idx" ON "pine_revision_inputs"("sourcePineScriptId", "createdAt");

-- AddForeignKey
ALTER TABLE "pine_scripts"
ADD CONSTRAINT "pine_scripts_parentPineScriptId_fkey"
FOREIGN KEY ("parentPineScriptId")
REFERENCES "pine_scripts"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pine_revision_inputs"
ADD CONSTRAINT "pine_revision_inputs_strategyRuleVersionId_fkey"
FOREIGN KEY ("strategyRuleVersionId")
REFERENCES "strategy_rule_versions"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pine_revision_inputs"
ADD CONSTRAINT "pine_revision_inputs_sourcePineScriptId_fkey"
FOREIGN KEY ("sourcePineScriptId")
REFERENCES "pine_scripts"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pine_revision_inputs"
ADD CONSTRAINT "pine_revision_inputs_generatedPineScriptId_fkey"
FOREIGN KEY ("generatedPineScriptId")
REFERENCES "pine_scripts"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
