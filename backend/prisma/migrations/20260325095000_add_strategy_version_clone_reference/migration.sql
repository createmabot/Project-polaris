-- AlterTable
ALTER TABLE "strategy_rule_versions"
ADD COLUMN "clonedFromVersionId" TEXT;

-- CreateIndex
CREATE INDEX "strategy_rule_versions_clonedFromVersionId_idx" ON "strategy_rule_versions"("clonedFromVersionId");

-- AddForeignKey
ALTER TABLE "strategy_rule_versions"
ADD CONSTRAINT "strategy_rule_versions_clonedFromVersionId_fkey"
FOREIGN KEY ("clonedFromVersionId") REFERENCES "strategy_rule_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
