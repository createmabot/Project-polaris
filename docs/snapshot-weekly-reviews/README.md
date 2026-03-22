# Snapshot Weekly Review Logs

This directory stores completed weekly review records for `snapshot_reason_daily_metrics`.

## Storage rule
- Keep all weekly records in this directory.
- Do not overwrite or delete past records; keep chronological history.

## Naming rule
- Use JST week-based name: `YYYY-Www-snapshot-review.md`
- Example: `2026-W12-snapshot-review.md`

## How to create a new record
1. Run:
   - `pnpm run create:snapshot-weekly-review`
   - optional: `pnpm run create:snapshot-weekly-review -- --date=YYYY-MM-DD` (JST)
   - overwrite only when explicit: `pnpm run create:snapshot-weekly-review -- --date=YYYY-MM-DD --force`
2. Confirm generated file in this directory (`YYYY-Www-snapshot-review.md`, JST ISO week).
3. Fill all required sections.
4. If threshold env changed, record `before / after / reason`.
5. By default, if the target file already exists, the script exits without overwrite.
6. Use `--force` only when explicit regeneration is intended.

Manual fallback:
1. Copy `docs/snapshot-weekly-review-record-template.md`
2. Save into this directory with the naming rule above

## Minimum operating rules
- Record once per week even when no env changes were made.
- If source anomaly is suspected, investigate first; do not raise threshold before root-cause check.
- Threshold tuning is env-only operation (no code change for normal adjustments).
