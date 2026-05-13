# 北極星 現行仕様 overview

更新日: 2026-05-13
分類: specs

## 1. 目的

本資料は、北極星の現行仕様を読むための入口である。MVP初期docsの履歴やPR経緯ではなく、現時点のシステム責務、主要データ、画面、AI summary / artifact の関係を短く固定する。

詳細な実装経緯やフェーズ完了整理は `docs/progress/00_current_status.md` と `docs/53.北極星 P3現在地と残課題整理（P3）.md` を参照する。

## 2. システム責務

北極星は、TradingView を表示・監視・一次検証に使い、北極星側では次を担う。

- 銘柄情報と Home / SideRail の日次確認導線。
- 自然言語 strategy から strategy version / Pine / validation / Backtest report へつなぐ履歴管理。
- Symbol Strategy Application により、銘柄へ strategy version を適用し、run / report 履歴を保持する。
- CSV import report と internal backtest report を Backtest report として扱い、BacktestDetail / ApplicationDetail から確認する。
- Backtest AI summary と artifact metadata を report 文脈で確認する。

## 3. 現行の主要概念

- `StrategyRule`: strategy definition の親。
- `StrategyRuleVersion`: strategy version。Pine生成、validation、Backtest、application の起点。
- `SymbolStrategyApplication`: 銘柄に strategy version を適用した親概念。
- `SymbolStrategyApplicationRun`: application 配下の実行単位。`csv_import` / `internal_backtest` を保持する。
- `Backtest`: CSV import または internal backtest 由来の report detail。
- `BacktestImport`: CSV import 専用。internal backtest report では作成しない。
- `InternalBacktestExecution`: internal engine 実行結果。succeeded execution は Backtest report 化できる。
- `ai_jobs` / `ai_summaries`: AI summary の状態と生成物。

## 4. 現行仕様 docs

- DB / API / relation: `docs/52.北極星 Symbol Strategy Application DB・API設計（P3）.md`
- screen / IA: `docs/specs/04_screen_ia.md`
- UI components: `docs/specs/05_ui_components.md`
- AI summary / artifact: `docs/specs/06_ai_summary_artifact.md`
- current status / backlog: `docs/progress/00_current_status.md`
- operational checks: `docs/operations/00_developer_guide.md`

## 5. 今回まとめないもの

- MVP初期API sample の全面更新。
- 既存 docs の削除 / rename。
- OpenAPI / ERD / Docusaurus / MkDocs 導入。
- 実装コード変更。
