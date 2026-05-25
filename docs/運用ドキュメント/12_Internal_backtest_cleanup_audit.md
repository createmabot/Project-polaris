# Internal backtest cleanup audit record

更新日: 2026-05-26
分類: 運用ドキュメント

## 1. 目的

Internal backtest backend deprecation Stage 2C の前に実施した read-only data audit の履歴と判断結果を残す。

Stage 2C cleanup 後は audit script / package command / helper test は削除済みであり、本資料は再実行 runbook ではなく cleanup 判断の記録として扱う。

## 2. 実行済み audit

Stage 2C 前に read-only audit command を実行し、sanitized summary のみで判断した。audit 結果 JSON は commit しない方針とした。

sanitized summary:

- internal backtest executions: 5
- internal backtest execution artifacts: 3
- internal backtest reports: 1
- tradingview reports: 96
- internal report snapshot: `internal_backtest_execution_id` / `result_summary` / `artifact_pointer` がすべて存在
- internal application runs: 2
- internal execution only run: 1
- internal Backtest AI summary: 0
- AI jobs for internal backtest reports: 0
- `can_drop_execution_tables_without_losing_report_display=true`
- `needs_snapshot_retention_migration=false`

## 3. 判断

Stage 2C cleanup では次を実施した。

- internal backtest execution / artifact / data source event tables を drop。
- `SymbolStrategyApplicationRun.internalBacktestExecutionId` relation / column を drop。
- internal backtest route / queue / worker / service / market data provider / audit tooling を削除。
- historical internal report は `Backtest.strategySnapshotJson` snapshot で read-only 表示を維持。

`internal_execution_only=1` の run は report 化されていない legacy run であり、execution relation drop により execution への link は失われる。Backtest report になっていないため historical report 表示への影響はない。

## 4. 非表示境界

監査出力には raw snapshot、raw artifact payload、CSV 本文、artifact path、provider endpoint、model 実値、secret、token、credential、local path、stack trace を含めない。

PR / issue / docs に貼る場合も、監査 JSON が sanitized aggregate であることを確認し、個別 payload や path を追記しない。
