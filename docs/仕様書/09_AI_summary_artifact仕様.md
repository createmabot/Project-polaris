# 北極星 AI summary / artifact 現行仕様

更新日: 2026-05-13
分類: 仕様書

## 1. 目的

本資料は、Backtest AI summary と artifact metadata の現行仕様を整理する。運用判断の詳細は `docs/56`、phase 完了整理は `docs/53` を参照する。

## 2. Backtest AI summary

- 状態は `ai_jobs`、生成物は `ai_summaries` を使う。
- Backtest summary は `summary_scope=backtest_review`、`target_entity_type=backtest` を基本とする。
- provider boundary は Home / Symbol / Comparison / Backtest と同じ `HOME_AI_PROVIDER=stub|local_llm|openai_api` を使う。
- `AI_ENABLE_STUB_FALLBACK=false` が既定で、fallback は明示時のみ許可する。
- 手動生成 endpoint / BacktestDetail button は維持する。

## 3. auto enqueue 現行範囲

- CSV import report: direct CSV import route と application 起点 CSV import route の `parse_status=parsed` 直後に auto enqueue する。
- internal backtest report: succeeded execution が新規 internal_backtest Backtest report に変換された直後だけ auto enqueue する。
- 既存 report を返す idempotent path、guarded update 競合で既存 report を返す path、display-triggered enqueue、batch / scheduled job は対象外。
- 同一 input snapshot hash の succeeded summary、queued / running job、failed job がある場合は auto enqueue しない。
- failed job の自動 retry は行わず、手動生成に委ねる。

## 4. CSV import report と internal backtest report の違い

| report source | 主 input | BacktestImport | artifact |
|---|---|---|---|
| `csv_import` | `BacktestImport` / parsed summary / comparison diff / TradingView文脈 | 作成する | 基本は CSV import metadata / parsed summary 文脈 |
| `internal_backtest` | `strategySnapshotJson.result_summary` / `artifact_pointer` / `internal_backtest_execution_id` | 作成しない | artifact pointer metadata を表示。file read / download / diff はしない |

## 5. 画面責務

- BacktestDetail: 個別 report の AI summary、artifact metadata、raw JSON 表示。
- ApplicationDetail: report history の入口。AI summary / artifact 詳細は BacktestDetail へ送る。
- BacktestComparisonDetail: 保存済み pairwise comparison の再訪画面。AI summary 同士の自動比較や artifact diff は後続判断。

## 6. 後続判断

- display-triggered enqueue。
- batch / scheduled enqueue。
- polling 本格化。
- AI summary 同士の比較。
- artifact file read / download。
- artifact diff / JSON diff。
- provider cost control の本格化。
