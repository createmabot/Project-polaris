# Internal backtest cleanup audit runbook

更新日: 2026-05-26
分類: 運用ドキュメント

## 1. 目的

Internal backtest backend deprecation Stage 2C の前に、残存 DB data を read-only に集計し、table / column / relation cleanup の可否を判断するための監査手順を固定する。

Stage 2C-1 は data audit tooling の追加だけを扱う。Prisma schema、migration、DB table、route、queue / worker / service、frontend UI、既存 410 behavior は変更しない。

## 2. 実行コマンド

backend workspace で次を実行する。

```bash
pnpm --filter backend internal-backtest:audit
```

出力は sanitized JSON のみで、既存 DB data の write / update / delete は行わない。

## 3. 出力項目

監査 JSON は次を含む。

- `audit_name` / `schema_version` / `generated_at`
- `counts.internal_backtest_executions.total` / `by_status` / `result_summary_non_null` / `artifact_pointer_non_null`
- `counts.internal_backtest_artifacts.total` / `by_kind` / `orphan_count`
- `counts.backtests.internal_backtest_reports` / `tradingview_reports`
- `counts.backtests.internal_reports_with_execution_id_snapshot`
- `counts.backtests.internal_reports_with_result_summary_snapshot`
- `counts.backtests.internal_reports_with_artifact_pointer_snapshot`
- `counts.backtests.internal_report_sample_ids_missing_required_snapshot`
- `counts.symbol_strategy_application_runs.internal_runs`
- `counts.symbol_strategy_application_runs.internal_execution_reference_count`
- `counts.symbol_strategy_application_runs.backtest_reference_count`
- `counts.symbol_strategy_application_runs.both_internal_execution_and_backtest`
- `counts.symbol_strategy_application_runs.internal_execution_only`
- `counts.symbol_strategy_application_runs.backtest_only`
- `counts.symbol_strategy_application_runs.neither_internal_execution_nor_backtest`
- `counts.ai_summary.internal_backtest_report_ai_summaries`
- `counts.ai_summary.ai_jobs_for_internal_backtest_reports`
- `counts.ai_summary.ai_jobs_with_internal_execution_dependency`
- `risk_summary.can_drop_execution_tables_without_losing_report_display`
- `risk_summary.needs_snapshot_retention_migration`
- `risk_summary.notes`
- `meta.read_only=true` / `meta.sanitized=true`

## 4. 読み方

- `risk_summary.needs_snapshot_retention_migration=true` の場合、historical internal report の read-only 表示に必要な snapshot が不足している可能性がある。
- `counts.symbol_strategy_application_runs.internal_execution_only > 0` の場合、Backtest report に紐づかず internal execution だけを参照する application run が残っている。
- `counts.symbol_strategy_application_runs.internal_execution_reference_count > 0` の場合、`SymbolStrategyApplicationRun.internalBacktestExecutionId` を drop すると historical execution relation metadata が失われる。
- `counts.internal_backtest_artifacts.orphan_count > 0` の場合、artifact と execution の参照整合性を cleanup 前に確認する。
- `counts.ai_summary.internal_backtest_report_ai_summaries > 0` の場合、Backtest report ID と既存 AI summary 表示の read-only 互換を維持する。
- `can_drop_execution_tables_without_losing_report_display=false` は、Stage 2C の drop を止める signal として扱い、snapshot retention migration または historical relation 方針を先に決める。

## 5. 非表示境界

監査出力には raw snapshot、raw artifact payload、CSV 本文、artifact path、provider endpoint、model 実値、secret、token、credential、local path、stack trace を含めない。

PR / issue / docs に貼る場合も、監査 JSON が sanitized aggregate であることを確認し、個別 payload や path を追記しない。

## 6. Stage 2C への接続

Stage 2C で判断する候補:

- internal backtest execution / artifact tables を drop するか。
- `SymbolStrategyApplicationRun.internalBacktestExecutionId` を drop するか。
- historical internal report 表示を `Backtest.strategySnapshotJson` snapshot だけで維持できるか。
- service / queue / worker / route tests を削除するか。
- legacy docs の internal backtest execution / conversion 手順を cleanup するか。

Stage 2C の実装前に、本 audit の出力と historical internal report 表示の browser / backend read-only 確認を合わせて判断する。
