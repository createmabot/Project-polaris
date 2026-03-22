# Snapshot Reason Weekly Review Record (Template)

This template is for operational records of `snapshot_reason_daily_metrics`.
Public API contracts are unchanged. Threshold tuning is done via env values only.
Save filled records to `docs/snapshot-weekly-reviews/` with:
`YYYY-Www-snapshot-review.md` (JST week, e.g. `2026-W12-snapshot-review.md`).

## 1) Review Metadata
- Review date (JST):
- Reviewer:
- Environment: `local` / `staging` / `prod`
- Target period (JST, last 7 days): `YYYY-MM-DD` to `YYYY-MM-DD`
- SQL used: `backend/scripts/snapshot-weekly-review.sql`

## 2) Observations (Primary 4 Reasons)
Fill from SQL output (`daily trend`, `week-over-week`, `days_over_threshold`).

| Reason code | Current 7d count | Previous 7d count | WoW delta | Days over threshold | Notes |
| --- | ---: | ---: | ---: | ---: | --- |
| `open_but_stale` |  |  |  |  |  |
| `freshness_invalid` |  |  |  |  |  |
| `freshness_expired` |  |  |  |  |  |
| `candidate_unknown` |  |  |  |  |  |

Optional reference reasons (if needed):
- `jp_market_holiday`
- `jp_market_weekend`
- `outside_jp_session`

## 3) Weekly Assessment
- Overall trend summary (1-3 lines):
- Source skew detected (`source_name` bias):
- Priority investigation targets:
  - [ ] parser / timestamp anomaly (`freshness_invalid`)
  - [ ] source latency (`open_but_stale`)
  - [ ] inference/source quality (`candidate_unknown`)
  - [ ] no critical anomaly

## 4) Threshold Decision (env only)
- Env change required?: `yes` / `no`
- If `no`, reason:
- If `yes`, record all changed values:

| Env name | Before | After | Reason |
| --- | ---: | ---: | --- |
| `SNAPSHOT_THRESHOLD_OPEN_BUT_STALE_DAILY` |  |  |  |
| `SNAPSHOT_THRESHOLD_FRESHNESS_INVALID_DAILY` |  |  |  |
| `SNAPSHOT_THRESHOLD_FRESHNESS_EXPIRED_DAILY` |  |  |  |
| `SNAPSHOT_THRESHOLD_CANDIDATE_UNKNOWN_DAILY` |  |  |  |

Rules:
- Always leave a record even when there is no env change.
- If source anomaly is suspected, prioritize investigation before threshold increase.
- `0` means warning disabled for that reason (metrics/logging still continue).

## 5) Next Review Actions
- Action owner:
- Action items until next review:
  1.
  2.
- Expected verification at next review:
