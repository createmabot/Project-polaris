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
   - `pnpm run create:snapshot-weekly-review -- --dry-run`
   - machine-readable preview: `pnpm run create:snapshot-weekly-review -- --dry-run --output-format=json`
   - `pnpm run create:snapshot-weekly-review`
   - optional: `pnpm run create:snapshot-weekly-review -- --date=YYYY-MM-DD` (JST)
   - overwrite only when explicit: `pnpm run create:snapshot-weekly-review -- --date=YYYY-MM-DD --force`
   - safe preview before overwrite: `pnpm run create:snapshot-weekly-review -- --date=YYYY-MM-DD --force --dry-run`
2. Confirm generated file in this directory (`YYYY-Www-snapshot-review.md`, JST ISO week).
3. Fill all required sections.
4. If threshold env changed, record `before / after / reason`.
5. By default, if the target file already exists, the script exits without overwrite.
6. Use `--force` only when explicit regeneration is intended.
7. `--dry-run` never writes files; use it as pre-check before create/overwrite.

Manual fallback:
1. Copy `docs/snapshot-weekly-review-record-template.md`
2. Save into this directory with the naming rule above

## Minimum operating rules
- Record once per week even when no env changes were made.
- If source anomaly is suspected, investigate first; do not raise threshold before root-cause check.
- Threshold tuning is env-only operation (no code change for normal adjustments).

## Required check failure drill (quarterly)
- Purpose: verify required checks (`snapshot-review-generator-json-check`, `backtests-return-flow-e2e-check`, `strategy-versions-return-flow-e2e-check`) still block PR merge when failing.
- Frequency: run at least once per quarter, or after ruleset/required-check updates.
- See runbook in root `README.md` section:
  - `Required-check failure drill（運用確認）`
- Record drill date/result in the weekly review log when executed.

## Internal-backtests observability weekly check (minimum)
- Endpoint:
  - `GET /api/internal-backtests/observability/data-source-unavailable-summary?window=24h|7d`
- Weekly required fields:
  - `total_failures`
  - `by_reason`
  - `retry_effect`:
    - `retry_targeted_count`
    - `retry_attempted_count`
    - `retried_and_succeeded_count`
    - `retried_and_failed_count`
    - `not_retried_failed_count`
  - `recent_failures`
- Window usage:
  - `24h`: current-state check
  - `7d`: trend and re-evaluation gate check
- `provider_http_error(429)` re-evaluation gate (all required):
  1. 429 count in `window=7d` is `>= 5`
  2. 429 share in `provider_http_error` is `>= 20%`
  3. 429 appears on `>= 3` separate days in the week
- If the gate is not met, keep 429 as non-retry and record the reason in the weekly review.
