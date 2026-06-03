CREATE TABLE "strategy_version_annotations" (
    "id" TEXT NOT NULL,
    "strategy_rule_version_id" TEXT NOT NULL,
    "label" VARCHAR(80),
    "note" VARCHAR(240),
    "is_favorite" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strategy_version_annotations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "strategy_version_annotations_strategy_rule_version_id_key" ON "strategy_version_annotations"("strategy_rule_version_id");
CREATE INDEX "strategy_version_annotations_is_favorite_updated_at_idx" ON "strategy_version_annotations"("is_favorite", "updated_at");

ALTER TABLE "strategy_version_annotations"
ADD CONSTRAINT "strategy_version_annotations_strategy_rule_version_id_fkey"
FOREIGN KEY ("strategy_rule_version_id") REFERENCES "strategy_rule_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
