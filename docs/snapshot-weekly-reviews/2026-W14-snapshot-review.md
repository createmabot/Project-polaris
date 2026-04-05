# Snapshot Reason Weekly Review Record (Template)

This template is for operational records of `snapshot_reason_daily_metrics`.
Public API contracts are unchanged. Threshold tuning is done via env values only.
Save filled records to `docs/snapshot-weekly-reviews/` with:
`YYYY-Www-snapshot-review.md` (JST week, e.g. `2026-W12-snapshot-review.md`).

## 1) Review Metadata
- Review date (JST): `2026-04-05`
- Reviewer: `codex + createmabot`
- Environment: `local`
- Target period (JST, last 7 days): `2026-03-29` to `2026-04-05`
- SQL used: `backend/scripts/snapshot-weekly-review.sql` (snapshot metrics section), internal-backtests observability summary (`window=24h|7d`) for section 6

## 2) Observations (Primary 4 Reasons)
Fill from SQL output (`daily trend`, `week-over-week`, `days_over_threshold`).

| Reason code | Current 7d count | Previous 7d count | WoW delta | Days over threshold | Notes |
| --- | ---: | ---: | ---: | ---: | --- |
| `open_but_stale` | N/A | N/A | N/A | N/A | This entry focuses on internal-backtests observability cycle |
| `freshness_invalid` | N/A | N/A | N/A | N/A | This entry focuses on internal-backtests observability cycle |
| `freshness_expired` | N/A | N/A | N/A | N/A | This entry focuses on internal-backtests observability cycle |
| `candidate_unknown` | N/A | N/A | N/A | N/A | This entry focuses on internal-backtests observability cycle |

Optional reference reasons (if needed):
- `jp_market_holiday`
- `jp_market_weekend`
- `outside_jp_session`

## 3) Weekly Assessment
- Overall trend summary (1-3 lines): This cycle validated internal-backtests observability summary on DB-persisted events with measured windows `24h` and `7d`.
- Source skew detected (`source_name` bias): N/A (snapshot metrics not reviewed in this cycle)
- Priority investigation targets:
  - [ ] parser / timestamp anomaly (`freshness_invalid`)
  - [ ] source latency (`open_but_stale`)
  - [ ] inference/source quality (`candidate_unknown`)
  - [x] no critical anomaly

## 4) Threshold Decision (env only)
- Env change required?: `no`
- If `no`, reason: No snapshot threshold tuning was performed in this cycle (internal-backtests observability-only review).
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
  1. Continue weekly observation with `window=24h|7d` and keep recording retry_effect counters.
  2. Re-evaluate 429 gate only when threshold conditions are met from measured data.
- Expected verification at next review: Confirm whether 429 re-evaluation gate remains unmet or needs escalation task.

## 6) Internal-backtests Observability (Optional)
Use when `internal_backtest_data_source_failure_events` operation is in scope for the week.

- Window checked: `24h` and `7d` (measured at `2026-04-05T08:09:29.588Z`)
- `DATA_SOURCE_UNAVAILABLE` total failures:
  - `24h`: `0`
  - `7d`: `0`
- Top `by_reason`:
  - `provider_http_error`: `0` (24h), `0` (7d)
  - `provider_timeout`: `0` (24h), `0` (7d)
  - `provider_network_error`: `0` (24h), `0` (7d)
  - `provider_invalid_response`: `0` (24h), `0` (7d)
  - `provider_parse_error`: `0` (24h), `0` (7d)
  - `provider_not_configured`: `0` (24h), `0` (7d)
  - `provider_unsupported_target`: `0` (24h), `0` (7d)
- `retry_effect`:
  - `retry_targeted_count`: `0` (24h), `0` (7d)
  - `retry_attempted_count`: `0` (24h), `0` (7d)
  - `retried_and_succeeded_count`: `0` (24h), `0` (7d)
  - `retried_and_failed_count`: `0` (24h), `0` (7d)
  - `not_retried_failed_count`: `0` (24h), `0` (7d)
- Recent failure execution IDs:
  1. none
  2. none
- 429 re-evaluation gate check:
  - 7d 429 count `>= 5`: no (`0`)
  - 429 share in `provider_http_error` `>= 20%`: no (`0/0`, treated as unmet due to no events)
  - 429 observed on `>= 3` separate days: no (`0 day`)
  - Decision: keep non-retry
