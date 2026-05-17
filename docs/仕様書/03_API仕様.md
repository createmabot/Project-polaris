# 北極星 API 現行仕様

更新日: 2026-05-15
分類: 仕様書

## 1. 目的

本資料は、現行 REST API の仕様入口である。詳細な request / response は実装 routes と tests を確認し、本資料では主要 endpoint、責務、互換方針を整理する。

## 2. 基本方針

- 既存 response shape は後方互換を優先する。
- read-only 拡張は optional field として追加する。
- DB / Prisma schema change を伴う API 拡張は別途設計判断にする。
- invalid query は既存 validation 方針に合わせ、`VALIDATION_ERROR` を返す。
- pagination は `page` / `limit` / `total` / `has_next` / `has_prev` を基本形にする。

## 3. Symbol Strategy Application

- `GET /api/symbols/:symbolId/strategy-applications`
  - default: `status=active`, `page=1`, `limit=20`, `sort=updated_at`, `order=desc`
  - filters: `status=active|archived|all`, `report_presence=with_reports|without_reports`, `report_source=csv_import|internal_backtest`, `run_type=csv_import|internal_backtest`, `run_status=queued|running|succeeded|failed|canceled`, `strategy_id`, `strategy_version_id`
  - `run_type` / `run_status` は latest_run 基準。
  - response は `latest_run` / `latest_backtest_report` / `latest_reports_by_source` / pagination meta を維持する。
- `POST /api/symbols/:symbolId/strategy-applications`
  - symbol に strategy version を適用する。
  - active duplicate は conflict として扱う。
- `PATCH /api/symbol-strategy-applications/:applicationId/archive`
  - parent application を archived にする。runs / reports は削除しない。
- `PATCH /api/symbol-strategy-applications/:applicationId/restore`
  - archived application を active に戻す。active duplicate がある場合は conflict とする。
- `GET /api/symbol-strategy-applications/:applicationId/runs`
  - application-specific run history。`run_type` / `run_status` / pagination / sort を持つ。
- `GET /api/symbol-strategy-applications/:applicationId/reports`
  - application-specific report history。`execution_source` / `run_type` / `status` / `with_metrics` / pagination / sort を持つ。

## 4. Backtest report

- `GET /api/backtests`
  - Backtest list。`q` / `status` / pagination / sort を持つ。
- `POST /api/backtests`
  - strategy version 起点の Backtest parent を作成する。
- `POST /api/backtests/:backtestId/imports`
  - TradingView CSV を parse し、`BacktestImport` を作成し、Backtest status を更新する。
- `POST /api/backtests/:backtestId/summary/generate`
  - Backtest AI summary generation を enqueue する既存 manual endpoint。
- `GET /api/backtests/:backtestId`
  - BacktestDetail の正本 API。
  - `backtest` / `used_strategy` / `latest_import` / `imports` / `ai_review` / `symbol_strategy_application` を返す。
  - 同一 application 配下の related reports と metrics summary は `symbol_strategy_application` 配下の補助情報として扱う。
- `GET /api/backtests/:backtestId/imports`
  - BacktestImport history を返す。

## 5. application 起点の実行 API

- `POST /api/symbol-strategy-applications/:applicationId/csv-import`
  - active application に対して CSV import run / Backtest / BacktestImport を作成する。
  - parse success 時は Backtest AI summary auto enqueue の対象になる。
- `POST /api/symbol-strategy-applications/:applicationId/internal-backtests`
  - active application に対して internal backtest execution と run を作成する。
- `POST /api/symbol-strategy-applications/:applicationId/internal-backtests/:executionId/report`
  - succeeded execution から importless Backtest report を作成、または既存 report を返す。
  - conversion success 時は Backtest AI summary auto enqueue の対象になる。

## 6. internal backtest

- `GET /api/internal-backtests/data-source-failures`
  - data source failure summary を返す。
- `POST /api/internal-backtests/executions`
  - strategy version 起点の internal backtest execution を作成する。
- `GET /api/internal-backtests/executions/:executionId`
  - execution detail を返す。
- `GET /api/internal-backtests/executions/:executionId/result`
  - execution result を返す。
- `GET /api/internal-backtests/executions/:executionId/artifacts/engine_actual/trades-and-equity`
  - engine actual の trades / equity artifact を read-only JSON として返す。
  - execution ID、succeeded execution、stored artifact existence を前提にする。
  - artifact path suffix は既知 endpoint に対応する whitelist に限定し、arbitrary route や path traversal を許可しない。
  - frontend へ local path / absolute path を返さず、UI link は execution ID と既知 route から導く。
  - 新規 download endpoint、file token、signed URL、backend proxy の本格実装は現時点では対象外。

## 7. AI summary

- Backtest AI summary generation は既存 generate endpoint / button を維持する。
- CSV import parsed report 作成直後と internal backtest report conversion 完了直後は、最小 auto enqueue 対象。
- display-triggered enqueue、batch / scheduled enqueue、failed job auto retry は現時点では対象外。

## 7-0. Strategy proposal

- LLM strategy proposal の初回実装は `POST /api/strategy-lab/proposals` とする。
- request は `market` / `timeframe` / `symbol_code` / `risk_preference` / `strategy_type_bias` / `proposal_count` / `user_hint` を候補にする。
- response は `strategy_proposal_candidates` schema を返し、候補選択は StrategyLab の natural language spec への反映に留める。
- proposal history は backend persistence / API の最小範囲を実装済み。Strategy / StrategyVersion への自動保存、Pine generation への自動連鎖は行わない。
- Web search / deep research を使う provider は後続判断とし、初回実装は deterministic stub provider に限定する。

Proposal history / selected proposal lineage の最小 API:

- `POST /api/strategy-lab/proposals` は後方互換を維持する。
- history 保存を実装する場合も、既存 response の `schema_name` / `schema_version` / `input` / `provider` / `provider_observation` / `candidates` / `disclaimer` は壊さない。
- success response には optional `proposal_run_id` と `history.proposal_run_id` を追加する。
- `GET /api/strategy-lab/proposals` は最近の proposal run 一覧を limit 上限付きで返す。
- `GET /api/strategy-lab/proposals/:proposalRunId` は run detail と candidates を返す。
- `POST /api/strategy-lab/proposals/:proposalRunId/select` は selected candidate を記録する。
- select request は `candidate_id` を優先し、未指定の場合は `proposal_candidate_id` を読む。`candidate_id` は provider candidate id または internal candidate id、`proposal_candidate_id` は detail API の `candidates[].id` に対応する internal candidate id として扱う。
- selection API は StrategyLab input 反映の履歴だけを扱い、Strategy / StrategyVersion 保存、Pine generation、backtest、AI summary を起動しない。

- `POST /api/strategy-lab/proposals` は短時間の連続実行に対して in-memory per-process rate guard を適用する。上限超過時は HTTP 429 / `RATE_LIMITED` を返し、proposal run は保存しない。error details は retry_after / limit / window / provider mode / key source 程度の sanitized metadata に限定し、actual IP、forwarded header value、internal key、raw prompt / raw provider response / endpoint / model 実値は返さない。
- filter / pagination / large history management は後続判断とし、初回 UI は recent list 程度に留める。

Provider quality trend aggregation の最小 API:

- `GET /api/strategy-lab/proposals/provider-quality-trend` は、保存済み proposal history から provider 品質傾向を read-only 集計して返す。
- query は `limit` のみを受け、上限付き recent runs を集計対象にする。
- response は `summary` / `by_provider` / `by_market` / `by_strategy_type_bias` / `candidate_distribution` / `recent_failures` / `meta` に限定する。
- `meta` では `source=strategy_proposal_history`、`sanitized=true`、`raw_prompt_included=false`、`raw_response_included=false` を返す。
- response には raw `inputJson`、user_hint 全文、candidate title / summary / suggested_natural_language_spec、raw provider response、provider endpoint、model 実値、secret、local path、stack trace を含めない。
- trend aggregation は provider 運用品質の確認補助であり、投資判断、candidate ranking、Strategy / StrategyVersion 自動保存、Pine generation 自動起動には使わない。

## 7-1. Symbol references

- `POST /api/symbols/:symbolId/references/refresh`
  - SymbolDetail の関連参照情報をユーザー操作起点で手動再取得する。
  - 画面表示起点、自動定期取得、batch 起点では実行しない。
  - 既存 `referenceCollector.collectForSymbol` と `external_references.dedupeKey` を使い、重複 reference は追加しない。
  - response は `job_id`、`status`、`saved_count`、`skipped_count`、`reference_count`、`source_breakdown` を返す。
  - 既に `collect_references_for_symbol` の `queued|running` job がある場合は、追加実行せず既存 job status を返す。
  - 失敗時は provider endpoint、secret、stack trace を response に含めない。

## 7-2. Watchlist / positions management

- `POST /api/watchlist-items` と `POST /api/positions` は `symbol_code` だけの追加を受け付ける。
- 既存 `symbols` に一致する `symbol_code` / `symbol` / `tradingview_symbol` がある場合、既存の `displayName` / `marketCode` / `tradingviewSymbol` を利用する。
- request で `display_name` / `name` / `market_code` / `market` / `exchange` / `tradingview_symbol` を明示した場合は、既存の空欄補完または新規作成時にその値を優先する。
- 既存 Symbol が無い4桁数字の `symbol_code` は、既存 seed 慣例に合わせて `marketCode=JP_STOCK`、`tradingviewSymbol=TSE:<symbol_code>` で最小作成する。
- 上記以外の未登録 `symbol_code` は外部 API を使わず、`symbol_code` と同じ表示名の最小 Symbol として安全に作成する。
- SideRail 削除は watchlist item ID / position ID を使い、成功後は watchlist 操作で home + watchlist、positions 操作で home + positions を refresh する。

## 8. 参照

- Symbol Strategy Application API: `docs/52.北極星 Symbol Strategy Application DB・API設計（P3）.md`
- application-specific endpoints: `docs/54.北極星 application-specific runs endpoint 設計（次フェーズ）.md`, `docs/55.北極星 application-specific reports endpoint 設計（次フェーズ）.md`
- AI summary auto-generation: `docs/56.北極星 AI summary 自動生成運用設計（次フェーズ）.md`
