# 北極星 Symbol Strategy Application 現行仕様

更新日: 2026-05-13
分類: 仕様書

## 1. 目的

本資料は、Symbol Strategy Application / run / ApplicationDetail の現行仕様を整理する。詳細な DB / API 設計は `docs/52` を正本として参照する。

## 2. 概念

Symbol Strategy Application は、銘柄に strategy version を適用する親概念である。run / report 履歴を application 配下に保持し、SymbolDetail では概要と操作、ApplicationDetail では履歴を確認する。

## 3. status

- `active`: 現在有効な application。
- `archived`: 履歴保持のため通常表示から整理された application。
- hard delete は実装しない。
- archive / restore は application parent の status 操作であり、runs / reports は削除しない。
- restore 時に同じ symbol / strategy version の active application がある場合は conflict とする。

## 4. run

- `csv_import`: CSV import 由来の run。
- `internal_backtest`: internal backtest execution 由来の run。
- run status は `queued` / `running` / `succeeded` / `failed` / `canceled` を扱う。
- SymbolDetail の list filter では `run_type` / `run_status` は latest_run 基準。
- any-run history search は application-specific runs endpoint の後続改善候補。

## 5. report

- CSV import report と internal backtest report を Backtest report として扱う。
- CSV import report は `BacktestImport` を持つ。
- internal backtest report は `BacktestImport` を持たない。
- source別 latest pair は `latest_reports_by_source` として SymbolDetail に表示する。
- 同一 application の detailed report history は ApplicationDetail で確認する。

## 6. 操作導線

- application 作成は SymbolDetail から行う。
- archive / restore は SymbolDetail の application card から行う。
- CSV import は SymbolDetail の application card から行う。internal backtest start / internal report conversion の主要 UI 導線は PR #433 で閉じ、既存 internal report は read-only legacy として扱う。
- SymbolDetail の `この銘柄でストラテジー提案` は StrategyLab へ symbol context を渡す入口であり、application を自動作成しない。
- StrategyLab で strategy / version を保存した後の `この銘柄に適用` は、ユーザーの明示操作として既存 application 作成 API を呼ぶ。proposal selection、Pine generation、strategy save、backtest、AI summary を自動連鎖させない。
- SymbolDetail の application row に置く `改善版を作る` は、既存 strategy version clone flow へ進む明示操作とする。clone 後の改善版適用も既存 application 作成 API を使い、旧 application は active のまま残す。
- ApplicationDetail は履歴確認専用であり、実行、変換、削除は行わない。

## 7. ApplicationDetail

- application detail route は read-only foundation。
- runs / reports list は filter / pagination を持つ。
- runs list は execution / import / backtest link を表示する。
- reports list は source、status、run type、metrics summary を表示する。
- metrics 欠損値は source に応じて短く説明する。

## 8. 後続候補

- application-specific runs / reports の further UX。
- any-run history search。
- archived application 本格一覧 UI。
- strategy / strategy version filter の拡張。
- improvement lineage の永続化。
- 改善版適用時に旧 application を transaction で archive する replace flow。
- 新旧 application / report の比較導線強化。
