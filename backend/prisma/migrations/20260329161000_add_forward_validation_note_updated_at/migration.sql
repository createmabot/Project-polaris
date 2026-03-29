ALTER TABLE "strategy_rule_versions"
  ADD COLUMN "forward_validation_note_updated_at" TIMESTAMP(3);

UPDATE "strategy_rule_versions"
SET "forward_validation_note_updated_at" = "updated_at"
WHERE "forward_validation_note" IS NOT NULL
  AND BTRIM("forward_validation_note") <> '';
