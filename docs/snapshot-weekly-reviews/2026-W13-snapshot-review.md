# Snapshot Reason Weekly Review Record

This record includes the quarterly required-check failure drill execution.

## 1) Review Metadata
- Review date (JST): `2026-03-23`
- Reviewer: `codex + createmabot`
- Environment: `prod` (GitHub required check operation)
- Target period (JST, last 7 days): `2026-03-16` to `2026-03-23`
- SQL used: `backend/scripts/snapshot-weekly-review.sql`

## 2) Observations (Primary 4 Reasons)
Fill from SQL output (`daily trend`, `week-over-week`, `days_over_threshold`).

| Reason code | Current 7d count | Previous 7d count | WoW delta | Days over threshold | Notes |
| --- | ---: | ---: | ---: | ---: | --- |
| `open_but_stale` | N/A | N/A | N/A | N/A | Drill-only update (no metrics review in this entry) |
| `freshness_invalid` | N/A | N/A | N/A | N/A | Drill-only update (no metrics review in this entry) |
| `freshness_expired` | N/A | N/A | N/A | N/A | Drill-only update (no metrics review in this entry) |
| `candidate_unknown` | N/A | N/A | N/A | N/A | Drill-only update (no metrics review in this entry) |

Optional reference reasons (if needed):
- `jp_market_holiday`
- `jp_market_weekend`
- `outside_jp_session`

## 3) Weekly Assessment
- Overall trend summary (1-3 lines): This update is for required-check drill evidence only.
- Source skew detected (`source_name` bias): N/A
- Priority investigation targets:
  - [ ] parser / timestamp anomaly (`freshness_invalid`)
  - [ ] source latency (`open_but_stale`)
  - [ ] inference/source quality (`candidate_unknown`)
  - [x] no critical anomaly

## 4) Threshold Decision (env only)
- Env change required?: `no`
- If `no`, reason: This entry is a CI/ruleset drill. No threshold tuning was performed.
- If `yes`, record all changed values:

| Env name | Before | After | Reason |
| --- | ---: | ---: | --- |
| `SNAPSHOT_THRESHOLD_OPEN_BUT_STALE_DAILY` | - | - | no change |
| `SNAPSHOT_THRESHOLD_FRESHNESS_INVALID_DAILY` | - | - | no change |
| `SNAPSHOT_THRESHOLD_FRESHNESS_EXPIRED_DAILY` | - | - | no change |
| `SNAPSHOT_THRESHOLD_CANDIDATE_UNKNOWN_DAILY` | - | - | no change |

Rules:
- Always leave a record even when there is no env change.
- If source anomaly is suspected, prioritize investigation before threshold increase.
- `0` means warning disabled for that reason (metrics/logging still continue).

## 5) Next Review Actions
- Action owner: `createmabot`
- Action items until next review:
  1. Run normal weekly SQL review and fill reason metrics.
  2. Re-run required-check failure drill in next quarter or after ruleset updates.
- Expected verification at next review: required check still blocks on failure and recovers on restore.

## 6) Required-check Failure Drill Evidence
- Target PR: [#1 CI verify: snapshot required check blocks PR](https://github.com/createmabot/Project-polaris/pull/1)
- Required checks in scope:
  - `snapshot-review-generator-json-check`
  - `symbol-snapshot-db-integration`
- Temporary break commit: `31a7c08` (`scripts/check-snapshot-weekly-review-json.mjs` required key intentionally changed)
- Failure run: [Actions run 23408547958](https://github.com/createmabot/Project-polaris/actions/runs/23408547958)
  - `snapshot-review-generator-json-check`: **FAIL**
  - `symbol-snapshot-db-integration`: PASS
  - PR merge state observed: `BLOCKED`
- Restore commit: `2a40e93` (revert of temporary break)
- Recovery run: [Actions run 23408564546](https://github.com/createmabot/Project-polaris/actions/runs/23408564546)
  - `snapshot-review-generator-json-check`: PASS
  - `symbol-snapshot-db-integration`: PASS
