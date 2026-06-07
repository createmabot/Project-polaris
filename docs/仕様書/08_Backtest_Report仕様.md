# 北極星 Backtest Report 現行仕様

更新日: 2026-05-26
分類: 仕様書

## 1. 目的

本資料は、CSV import report / internal backtest report / comparison helper の現行仕様を整理する。AI summary comparison UX phase 2 は、既存 Backtest AI summary を read-only に並べて理解する補助に限定し、生成・差分算出・正規化・新規 entity 追加は扱わない。

## 2. report type

### CSV import report

- TradingView 実行結果を保存する report。
- `BacktestImport` / parsed summary を持つ。
- `execution_source` は TradingView 由来として扱う。
- 実運用に近い外部検証結果として扱う。
- parsed report 作成直後に Backtest AI summary auto enqueue の対象になる。
- AI summary input は `BacktestImport.parsedSummaryJson`、CSV parsed summary、TradingView report 文脈、既存 comparison diff 文脈を中心に組み立てる。
- artifact pointer は基本要件ではなく、artifact がないことは正常な欠損として扱う。

### internal backtest report

- Polaris Internal Backtest Engine v1 または historical internal execution result を保存した importless report。
- `BacktestImport` を持たない importless report。
- `execution_source` は `internal_backtest` として扱う。
- `strategySnapshotJson.result_summary` / `artifact_pointer` / `internal_backtest_execution_id` を持つ。
- StrategyVersionDetail の `内部バックテスト` は、保存済み normalized spec と `MarketPriceBar` を使い、明示クリック時だけ新しい `Backtest` を作成できる。application 起点 internal start / report conversion endpoint、execution relation、artifact table は復活させない。
- conversion 完了直後の Backtest AI summary auto enqueue は新規には使われない。既存 AI summary と manual generation は generic Backtest report として維持する。
- AI summary input は `strategySnapshotJson.result_summary`、`artifact_pointer` metadata、`internal_backtest_execution_id`、importless report 文脈を中心に組み立てる。
- `BacktestImport` がないため、CSV parsed summary 前提の項目は欠損として扱う。ただし BacktestDetail の `主要指標` は `strategySnapshotJson.result_summary.metrics` / `period` / `trade_period` から総取引数、勝率、Profit Factor、最大ドローダウン、純利益、総リターン率、検証データ期間、取引発生期間を表示する。
- Internal Backtest Engine v1 の `result_summary` は、約定単位の `trades` と `trade_summary` を保存する。BacktestDetail はこの `trades` を最大 50 件の read-only preview として表示し、entry / exit 時刻、価格、exit reason、数量、損益、return、bars held を確認できるようにする。

### input 差分

| source | summary input | metrics root | artifact の扱い |
|---|---|---|---|
| CSV import report | `BacktestImport.parsedSummaryJson` / parsed summary / TradingView 文脈 / 既存 comparison diff 文脈 | CSV parsed summary | artifact pointer は基本なし。欠損は正常扱い |
| internal backtest report | `strategySnapshotJson.result_summary` / `artifact_pointer` / `internal_backtest_execution_id` / importless report 文脈 | `strategySnapshotJson.result_summary` | artifact pointer metadata を read-only 表示。file read / download / diff はしない |

## 3. BacktestDetail

- 個別 report detail の正本画面。
- source / status / metrics / AI summary / artifact を表示する。
- `主要指標` は CSV import report では `BacktestImport.parsedSummaryJson`、internal backtest report では `strategySnapshotJson.result_summary.metrics` / `period` / `trade_period` を読む。CSV import report の parsed period は取引発生期間として表示し、internal backtest report の `period` は使用した MarketPriceBar の検証データ期間、`trade_period` は first entry / last exit の取引発生期間として表示する。trade がない場合は `取引なし` と表示する。internal backtest report で `BacktestImport` がないことは正常扱いにする。
- CSV import report は Performance Summary CSV では summary metrics のみを保存する。TradingView Strategy Tester の List of Trades CSV では、raw CSV 本文を API / UI に返さず、`BacktestImport.parsedSummaryJson.trades` / `trade_summary` に正規化済みの trade_no、entry / exit、price、quantity、profit、return を保存できる。BacktestDetail はこの正規化済み取引明細を最大 50 件の preview として表示する。取引明細がない CSV では、CSV取引明細がない旨を表示する。
- used strategy snapshot を表示し、report が参照した strategy version / Pine / assumptions を確認できるようにする。
- 同一 application の related reports と current / related metrics 横並び比較補助を表示する。CSV import report と internal backtest report の両方に正規化済み取引明細がある場合は、trade_no / 表示順で `取引明細比較` を表示する。これは診断補助であり、厳密な約定照合や優劣判定ではない。
- metrics 欠損時は、取得元に該当 metric がないことを短く説明する。
- 同一 application 内の current report と related report の既存 AI summary を read-only に並べる comparison helper を担当する。
- summary missing / failed / stale は polling ではなく、read-only status / note と既存 manual generate 導線で扱う。保存済み summary がある場合も、ユーザーが明示的に `AI総評を再生成` を押したときだけ `force=true` の manual regeneration を行う。
- `BacktestDetail` 表示を契機に自動 AI 比較生成、summary 再生成、comparison entity 作成、artifact diff を行わない。
- `symbol_strategy_application` を持つ report では、明示 action `この検証結果をもとに改善版を作る` から既存 strategy version clone flow へ進める。clone 後の StrategyVersionDetail は `source_backtest_id` を read-only context として取得し、表示可能な metrics / AI summary excerpt から改善メモを作る。BacktestDetail 表示だけでは clone、Pine generation、save、backtest、AI summary generation、apply を起動しない。

## 4. report history

- BacktestList は report 全体の一覧入口として扱う。
- ApplicationDetail reports tab は application-specific report history として扱う。
- SymbolDetail は latest report と source別 latest pair を表示し、詳細履歴は ApplicationDetail に送る。
- ApplicationDetail は report history の入口であり、詳細比較や AI summary comparison helper は BacktestDetail へ送る。
- ApplicationDetail の report row では、AI summary 本文、artifact path、詳細 diff を表示しない。

## 5. AI summary / artifact

- Backtest AI summary は manual generate と auto enqueue の両方で作成される。
- CSV import report は parsed CSV summary を AI context に含める。
- historical internal backtest report は Backtest snapshot 内の result summary と artifact pointer metadata を AI context に含める。
- Backtest AI summary は単なる成績レビューではなく、strategy improvement loop に使う総評として扱う。本文は概要、主要メトリクス、成績評価、問題の切り分け、改善仮説、自然言語ルール改善案、Pine修正依頼に入れるべきではない注意、次に試す検証案、注意点を含める。`backtest_review_summary` の `schema_version=1.0` は維持し、改善向けの具体 action は既存 `payload.next_actions`、自然言語ルール改善案として使いやすいメモは `payload.overall_view` に寄せる。自然言語ルール本文に直接反映しやすい entry / exit / risk / filter の改善候補は optional `payload.rule_refinement_candidates` に格納できる。`revision_request` は compile error / validation note / TradingView 上の挙動調整に限定する。
- StrategyVersionDetail の改善 context では、保存済み Backtest AI summary の `rule_refinement_candidates` と主要 metrics を優先して LLM rewrite draft の入力 context に使える。ただし raw CSV / raw import text は使わず、rewrite 結果は natural_language_rule textarea の draft としてだけ反映する。表示や rewrite 実行だけで保存、Pine generation、backtest、application apply は起動しない。
- AI summary 生成では CSV全文、取込本文、raw prompt、provider response、generated Pine 全文を扱わない。AI summary 生成だけで strategy clone、Pine generation、backtest、application apply は起動しない。
- artifact pointer は snapshot metadata として表示し、存在しない場合は欠損として説明する。Stage 2C cleanup 後は artifact read endpoint / table は存在しない。
- artifact file read / download / diff / retention job は未実装であり、詳細境界は `docs/仕様書/09_AI_summary_artifact仕様.md` を正本とする。
- AI summary comparison helper は保存済み summary の表示補助であり、summary の優劣判定、自動比較文生成、provider 呼び出しを行わない。

## 6. comparison UX

- 新規 comparison entity は作らない。
- metrics normalization table は作らない。
- artifact diff / AI summary 同士の本格比較は後続判断。
- 自動 AI 比較生成は行わない。
- BacktestComparisonDetail は保存済み pairwise comparison の再訪画面として維持する。
- BacktestComparisonDetail は将来の本格 AI summary comparison / artifact diff 画面候補だが、phase 2 では実装対象外。

## 7. 参照

- Backtest AI summary / artifact: `docs/仕様書/09_AI_summary_artifact仕様.md`
- report comparison 現在地: `docs/53.北極星 P3現在地と残課題整理（P3）.md`
