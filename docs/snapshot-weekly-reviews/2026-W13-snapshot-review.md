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

## 7) Required-check Failure Drill Evidence (`strategy-versions-return-flow-e2e-check`)
- Target PR: [#23 Drill: strategy versions required check (pending/failure/restore/success)](https://github.com/createmabot/Project-polaris/pull/23)
- Ruleset: `protect-main-required-checks`
- Required checks in scope:
  - `strategy-versions-return-flow-e2e-check`
  - `backtests-return-flow-e2e-check`
  - `snapshot-review-generator-json-check`
  - `symbol-snapshot-db-integration`
- Baseline commit: `3d8bb38` (empty commit to start drill)
- Baseline run: [Actions run 23608794591](https://github.com/createmabot/Project-polaris/actions/runs/23608794591)
  - `strategy-versions-return-flow-e2e-check`: pending -> PASS
- Temporary break commit: `1e1e332` (`frontend/src/pages/StrategyVersionsReturnFlow.e2e.test.ts` expected return URL intentionally changed)
- Failure run: [Actions run 23608842171](https://github.com/createmabot/Project-polaris/actions/runs/23608842171)
  - `strategy-versions-return-flow-e2e-check`: FAIL
  - Other required checks: PASS
  - PR merge state observed: `BLOCKED`
- Restore commit: `09bc782` (revert of temporary break)
- Recovery run: [Actions run 23608888781](https://github.com/createmabot/Project-polaris/actions/runs/23608888781)
  - `strategy-versions-return-flow-e2e-check`: pending -> PASS
  - PR merge state observed: `CLEAN`
- Scope update note (post-drill):
  - PR: [#41](https://github.com/createmabot/Project-polaris/pull/41) (merged on 2026-03-28)
  - Update: `StrategyVersionList -> StrategyVersionDetail（forward_validation_note edit context）-> List` return-flow scenario added to `StrategyVersionsReturnFlow.e2e.test.ts`
  - Check result: `strategy-versions-return-flow-e2e-check` PASS in PR #41 required checks
  - PR: [#45](https://github.com/createmabot/Project-polaris/pull/45) (merged on 2026-03-29 JST)
  - Update: `検証ノートあり` 行を起点にした `StrategyVersionList -> StrategyVersionDetail -> List` return-flow scenario を追加
  - Check result: [Actions run 23688550598](https://github.com/createmabot/Project-polaris/actions/runs/23688550598) で `strategy-versions-return-flow-e2e-check` PASS（required checks 全体 PASS）
  - PR: [#47](https://github.com/createmabot/Project-polaris/pull/47) (merged on 2026-03-29 JST)
  - Update: `要確認差分` かつ `検証ノートあり`（`最優先確認`）行を起点にした `StrategyVersionList -> StrategyVersionDetail -> List` return-flow 固定化スコープを運用確認対象へ拡張
  - Check result: [Actions run 23689884904](https://github.com/createmabot/Project-polaris/actions/runs/23689884904) で `strategy-versions-return-flow-e2e-check` PASS（required checks 全体 PASS）
  - PR: [#49](https://github.com/createmabot/Project-polaris/pull/49) (merged on 2026-03-29 JST)
  - Update: `最優先確認` 件数サマリからページ内先頭対象へジャンプする最小導線を追加し、`要確認差分` × `検証ノートあり` の優先対象へ到達しやすい return-flow 文脈を固定化
  - Check result: [Actions run 23691713097](https://github.com/createmabot/Project-polaris/actions/runs/23691713097) で `strategy-versions-return-flow-e2e-check` PASS（required checks 全体 PASS）
  - PR: [#51](https://github.com/createmabot/Project-polaris/pull/51) (merged on 2026-03-29 JST)
  - Update: `最優先確認` 件数サマリからジャンプした直後に対象カードを一時ハイライトする最小視認補助を追加し、ページ内到達後の見失いにくさを return-flow 文脈に含めて固定化
  - Check result: [Actions run 23692242218](https://github.com/createmabot/Project-polaris/actions/runs/23692242218) で `strategy-versions-return-flow-e2e-check` PASS（required checks 全体 PASS）
  - PR: [#53](https://github.com/createmabot/Project-polaris/pull/53) (merged on 2026-03-29 JST)
  - Update: `最優先確認` 対象が複数件ある場合に `次の最優先確認へ` の順送り導線を追加し、`StrategyVersionList -> StrategyVersionDetail -> List` の return-flow 文脈で 2件目以降へ継続到達できることを固定化
  - Check result: [Actions run 23692592489](https://github.com/createmabot/Project-polaris/actions/runs/23692592489) で `strategy-versions-return-flow-e2e-check` PASS（required checks 全体 PASS）
  - PR: [#56](https://github.com/createmabot/Project-polaris/pull/56) (open; checks passed on 2026-03-29 JST)
  - Update: `StrategyVersionDetail` に `次の最優先確認へ` の最小導線を追加し、`最優先確認` 複数件時に detail 文脈から次対象へ順送りしつつ `StrategyVersionList -> StrategyVersionDetail -> List` の return-flow 文脈を維持する固定化を追加
  - Check result: [Actions run 23693272766](https://github.com/createmabot/Project-polaris/actions/runs/23693272766) で `strategy-versions-return-flow-e2e-check` PASS（required checks 全体 PASS）
  - PR: [#58](https://github.com/createmabot/Project-polaris/pull/58) (merged on 2026-03-29 JST)
  - Update: `StrategyVersionDetail` の Pine 差分抜粋に「確認順（変更 → 追加 → 削除）」と区分ごとの件数表示を追加し、clone 元との差分を読む順序を return-flow 文脈の確認対象として固定化
  - Check result: [Actions run 23701551085](https://github.com/createmabot/Project-polaris/actions/runs/23701551085) で `strategy-versions-return-flow-e2e-check` PASS（required checks 全体 PASS）

## 8) Required-check Failure Drill Evidence (`backtests-return-flow-e2e-check`)
- Target PR: [#30 drill: backtests-return-flow-e2e-check pending/failure/restore/success](https://github.com/createmabot/Project-polaris/pull/30)
- Ruleset: `protect-main-required-checks`
- Required checks in scope:
  - `backtests-return-flow-e2e-check`
  - `strategy-versions-return-flow-e2e-check`
  - `snapshot-review-generator-json-check`
  - `symbol-snapshot-db-integration`
- Baseline commit: `d2001af` (empty commit to start drill)
- Baseline run: [Actions run 23677850790](https://github.com/createmabot/Project-polaris/actions/runs/23677850790)
  - `backtests-return-flow-e2e-check`: pending observed
- Temporary break commit: `107e8eb` (`frontend/src/pages/BacktestsReturnFlow.e2e.test.ts` expected API path intentionally changed)
- Failure run: [Actions run 23677855789](https://github.com/createmabot/Project-polaris/actions/runs/23677855789)
  - `backtests-return-flow-e2e-check`: FAIL
  - Other required checks: PASS / IN_PROGRESS
  - PR merge state observed: `BLOCKED`
- Restore commit: `979e24a` (revert of temporary break)
- Recovery run: [Actions run 23677865984](https://github.com/createmabot/Project-polaris/actions/runs/23677865984)
  - `backtests-return-flow-e2e-check`: pending -> PASS
  - Related required checks: PASS
  - PR merge state observed: `CLEAN`
- PR cleanup:
  - Drill PR closed without merge after recovery confirmation.
