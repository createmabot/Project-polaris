# 北極星 docs 整理履歴

更新日: 2026-05-15
分類: 作業進捗管理

## 1. 目的

本資料は、docs 整理の履歴と今後の更新ルールを記録する。詳細な読む順番は `docs/0.目次.md`、分類の正本は `docs/57.北極星 docs正本整理・読む順番（現行）.md` を参照する。

## 2. source-of-truth cleanup

完了扱い:

- `docs/0.目次.md` を docs の読む順番の入口にした。
- `docs/57.北極星 docs正本整理・読む順番（現行）.md` を docs 分類の正本として追加した。
- README は開発者向け入口、walkthrough は動作確認・受け入れ確認の正本として位置づけた。
- MVP初期 docs は削除せず、履歴資料または参照資料として扱う方針にした。

## 3. docs architecture refactor

完了扱い:

- `docs/仕様書/` を現行仕様の入口にした。
- `docs/運用ドキュメント/` を開発・起動・テスト・運用・確認・トラブルシュート手順の置き場にした。
- `docs/作業進捗管理/` をロードマップ、完了整理、残課題、decision log、docs整理履歴の置き場にした。
- `README.md`、`docs/0.目次.md`、`docs/57` から新体系へ辿れるようにした。

## 4. 今回の PR 3 整理範囲

追加した運用 docs:

- `docs/運用ドキュメント/01_ローカル開発環境.md`
- `docs/運用ドキュメント/02_起動と確認手順.md`
- `docs/運用ドキュメント/03_TradingView_webhook運用.md`
- `docs/運用ドキュメント/04_CSV取込運用.md`
- `docs/運用ドキュメント/05_AI_provider運用.md`
- `docs/運用ドキュメント/06_テストとCI.md`
- `docs/運用ドキュメント/07_トラブルシュート.md`

追加した進捗 docs:

- `docs/作業進捗管理/01_ロードマップ.md`
- `docs/作業進捗管理/02_完了フェーズ.md`
- `docs/作業進捗管理/03_残課題_Backlog.md`
- `docs/作業進捗管理/04_設計判断ログ.md`
- `docs/作業進捗管理/05_docs整理履歴.md`

## 5. legacy numbered docs cleanup PR 1

今回の cleanup PR 1 では、番号付き docs の実削除は行わず、削除判断 checklist と候補分類を `docs/作業進捗管理/06_番号付きdocs削除整理.md` に追加した。削除可否は PR 2 以降で分類単位に確認する。

追加した進捗 docs:

- `docs/作業進捗管理/06_番号付きdocs削除整理.md`

## 6. legacy numbered docs cleanup PR 2

今回の cleanup PR 2 では、data / API / sample 系のうち移管済みでリンク影響が小さい MVP初期 API sample docs と DB migration 順序案を削除した。

移管先:

- API response / sample 判断: `docs/仕様書/03_API仕様.md`、`docs/仕様書/10_テスト仕様.md`、実装 routes / tests。
- DB / migration 判断: `docs/仕様書/02_データモデル.md`、Prisma schema、migrations。
- 削除理由と保留理由: `docs/作業進捗管理/06_番号付きdocs削除整理.md`。

削除保留:

- `docs/2`
- `docs/3`

保留理由は、README や複数履歴資料からの参照影響が大きく、data / API 現行正本への要点移管確認をもう一段行う必要があるため。

## 7. legacy numbered docs cleanup PR 3

今回の cleanup PR 3 では、screen / UI / task 系のうち現行正本へ移管済みの MVP初期画面 sample、初期開発 checklist、component split、frontend task docs を削除した。

移管先:

- 画面導線 / 画面仕様: `docs/仕様書/04_画面導線_IA.md`、`docs/仕様書/05_画面仕様.md`、`docs/walkthrough.md`、frontend tests。
- 起動確認 / 受け入れ確認: `docs/運用ドキュメント/02_起動と確認手順.md`、`docs/walkthrough.md`。
- UI component 判断: `docs/仕様書/06_UIコンポーネント仕様.md`、`docs/46`、`docs/53`。
- frontend task / 残課題判断: `docs/作業進捗管理/00_現在地.md`、`docs/作業進捗管理/03_残課題_Backlog.md`、`docs/53`。
- 削除理由と保留理由: `docs/作業進捗管理/06_番号付きdocs削除整理.md`。

削除保留:

- なし。

## 8. legacy numbered docs cleanup PR 4

今回の cleanup PR 4 では、progress 系のうち現行 progress docs または現行 API 仕様 / tests へ移管済みの MVP初期タスク分解、スプリント計画案、API response 差分棚卸し docs を削除した。

移管先:

- roadmap / 完了フェーズ / backlog / decision log: `docs/作業進捗管理/01_ロードマップ.md`、`02_完了フェーズ.md`、`03_残課題_Backlog.md`、`04_設計判断ログ.md`。
- API response / 差分判断: `docs/仕様書/03_API仕様.md`、`docs/仕様書/10_テスト仕様.md`、実装 routes / tests。
- 削除理由と保留理由: `docs/作業進捗管理/06_番号付きdocs削除整理.md`。

削除保留:

- `docs/36`〜`docs/38`
- `docs/39`
- `docs/44`
- `docs/53`

保留理由は、MVP受入記録としての履歴価値、または現行 progress 詳細正本としての役割が残るため。

## 9. legacy numbered docs cleanup 完了整理

PR #327〜#330 で、legacy numbered docs cleanup の初期削除フェーズは完了扱いにする。

削除済み:

- PR #328: `docs/16`, `docs/21`
- PR #329: `docs/17`, `docs/20`, `docs/22`, `docs/26`, `docs/27`
- PR #330: `docs/15`, `docs/19`, `docs/31`

移管先:

- data / API / sample 系: `docs/仕様書/02_データモデル.md`, `docs/仕様書/03_API仕様.md`, `docs/仕様書/10_テスト仕様.md`, Prisma schema / migrations, implementation routes / tests。
- screen / UI / task 系: `docs/仕様書/04_画面導線_IA.md`, `docs/仕様書/05_画面仕様.md`, `docs/仕様書/06_UIコンポーネント仕様.md`, `docs/walkthrough.md`, frontend tests, `docs/作業進捗管理/03_残課題_Backlog.md`。
- progress 系: `docs/作業進捗管理/01_ロードマップ.md`, `02_完了フェーズ.md`, `03_残課題_Backlog.md`, `04_設計判断ログ.md`, `docs/仕様書/03_API仕様.md`, `docs/仕様書/10_テスト仕様.md`。

保留中:

- `docs/2` / `docs/3`: data / API 初期設計。参照が多く、現行正本への移管十分性を追加確認してから判断する。
- `docs/29` / `docs/30`: Rule Lab MVP fixed docs。Rule Lab 仕様を `docs/仕様書/` 側へ抽出後に再判断する。
- `docs/36`〜`docs/38`: MVP受入記録。履歴価値があるため保持する。
- `docs/39` / `docs/44` / `docs/53`: current / progress detailed canonical docs。現時点では保持する。

後続判断:

- data / API 系残件 `docs/2` / `docs/3` の再確認。
- Rule Lab 系 `docs/29` / `docs/30` の正本抽出。
- MVP受入記録 `docs/36`〜`docs/38` の移管 / 保持判断。
- progress 詳細 docs `docs/39` / `docs/44` / `docs/53` の統合可否。

## 10. 今回やらないこと

- `docs/2` / `docs/3` の削除。
- 既存番号 docs の bulk rename。
- 実装コード、API、backend、frontend、DB、Prisma schema、tests の変更。
- walkthrough の大規模分割。
- 旧 docs 全面書き換え。

## 11. AI summary auto-generation phase 1 runbook / completion docs

今回の docs-only 整理では、PR #319 / #320 / #332 で完了済みの AI summary auto-generation phase 1 を運用手順と完了整理に固定した。

追加した運用 docs:

- `docs/運用ドキュメント/08_AI_summary自動生成運用.md`

追加した進捗 docs:

- `docs/作業進捗管理/07_AI_summary自動生成phase1完了.md`

更新した入口:

- `docs/0.目次.md`
- `docs/57.北極星 docs正本整理・読む順番（現行）.md`
- `docs/仕様書/09_AI_summary_artifact仕様.md`
- `docs/56.北極星 AI summary 自動生成運用設計（次フェーズ）.md`
- `docs/walkthrough.md`

実装コード、API、backend、frontend、DB、Prisma schema、tests は変更しない。

## 12. Artifact metadata / retention policy phase completion

PR #334 / #335 により、Artifact metadata / retention policy phase は完了扱いにする。

完了範囲:

- `docs/仕様書/09_AI_summary_artifact仕様.md` に artifact_pointer metadata、UI表示可否、retention policy 現在地、file read / download boundary、artifact diff boundary を正本化した。
- `docs/運用ドキュメント/09_artifact_metadata_retention運用.md` を runbook として追加した。
- BacktestDetail の artifact path 系 metadata 非表示、raw artifact JSON の path 系値非表示、ApplicationDetail report row では artifact path を出さない説明を反映した。
- 画面責務は BacktestDetail、ApplicationDetail、BacktestComparisonDetail、SymbolDetail に分けて整理した。

未実装として残す範囲:

- artifact file read。
- download。
- artifact diff / JSON diff。
- retention job / cleanup job / hard delete。
- signed URL / file token。
- backend proxy。
- permission boundary 本格実装。
- audit log 本格化。

実装コード、API、backend、frontend、DB、Prisma schema、tests はこの docs-only completion PR では変更しない。

## 13. 今後の docs 更新ルール

- 現行仕様は `docs/仕様書/` に追加・更新する。
- 開発・確認・運用手順は `docs/運用ドキュメント/` に追加・更新する。
- roadmap / backlog / completion summary / decision log は `docs/作業進捗管理/` に追加・更新する。
- 詳細な履歴資料は削除せず、必要に応じて入口 docs からリンクする。
- docs-only PR では `git diff --check` と secret/local path scan を実行する。
- PR 本文は ASCII English only、docs 本文は UTF-8 日本語で保存する。

## 14. 関連 docs

- `docs/0.目次.md`
- `docs/57.北極星 docs正本整理・読む順番（現行）.md`
- `docs/作業進捗管理/00_現在地.md`
- `docs/作業進捗管理/01_ロードマップ.md`
- `docs/作業進捗管理/06_番号付きdocs削除整理.md`
