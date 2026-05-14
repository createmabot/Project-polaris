# 北極星 Backtest Report 現行仕様

更新日: 2026-05-15
分類: 仕様書

## 1. 目的

本資料は、CSV import report / internal backtest report / comparison helper の現行仕様を整理する。

## 2. report type

### CSV import report

- TradingView 実行結果を保存する report。
- `BacktestImport` / parsed summary を持つ。
- `execution_source` は TradingView 由来として扱う。
- 実運用に近い外部検証結果として扱う。
- parsed report 作成直後に Backtest AI summary auto enqueue の対象になる。

### internal backtest report

- Polaris engine 実行結果を保存する report。
- `BacktestImport` を持たない importless report。
- `execution_source` は `internal_backtest` として扱う。
- `strategySnapshotJson.result_summary` / `artifact_pointer` / `internal_backtest_execution_id` を持つ。
- report conversion 完了直後に Backtest AI summary auto enqueue の対象になる。

## 3. BacktestDetail

- 個別 report detail の正本画面。
- source / status / metrics / AI summary / artifact を表示する。
- used strategy snapshot を表示し、report が参照した strategy version / Pine / assumptions を確認できるようにする。
- 同一 application の related reports と current / related metrics 横並び比較補助を表示する。
- metrics 欠損時は、取得元に該当 metric がないことを短く説明する。

## 4. report history

- BacktestList は report 全体の一覧入口として扱う。
- ApplicationDetail reports tab は application-specific report history として扱う。
- SymbolDetail は latest report と source別 latest pair を表示し、詳細履歴は ApplicationDetail に送る。

## 5. AI summary / artifact

- Backtest AI summary は manual generate と auto enqueue の両方で作成される。
- CSV import report は parsed CSV summary を AI context に含める。
- internal backtest report は result summary と artifact pointer を AI context に含める。
- artifact pointer は metadata として表示し、存在しない場合は欠損として説明する。
- artifact file read / download / diff / retention job は未実装であり、詳細境界は `docs/仕様書/09_AI_summary_artifact仕様.md` を正本とする。

## 6. comparison UX

- 新規 comparison entity は作らない。
- metrics normalization table は作らない。
- artifact diff / AI summary 同士の比較は後続判断。
- BacktestComparisonDetail は保存済み comparison の再訪画面として維持する。

## 7. 参照

- Backtest AI summary / artifact: `docs/仕様書/09_AI_summary_artifact仕様.md`
- report comparison 現在地: `docs/53.北極星 P3現在地と残課題整理（P3）.md`
