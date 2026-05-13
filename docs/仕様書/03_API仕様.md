# 北極星 API 現行仕様

更新日: 2026-05-13
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
  - engine actual artifact を返す。

## 7. AI summary

- Backtest AI summary generation は既存 generate endpoint / button を維持する。
- CSV import parsed report 作成直後と internal backtest report conversion 完了直後は、最小 auto enqueue 対象。
- display-triggered enqueue、batch / scheduled enqueue、failed job auto retry は現時点では対象外。

## 8. 参照

- Symbol Strategy Application API: `docs/52.北極星 Symbol Strategy Application DB・API設計（P3）.md`
- application-specific endpoints: `docs/54.北極星 application-specific runs endpoint 設計（次フェーズ）.md`, `docs/55.北極星 application-specific reports endpoint 設計（次フェーズ）.md`
- AI summary auto-generation: `docs/56.北極星 AI summary 自動生成運用設計（次フェーズ）.md`
