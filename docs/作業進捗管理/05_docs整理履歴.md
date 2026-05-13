# 北極星 docs 整理履歴

更新日: 2026-05-13
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

## 5. 今回やらないこと

- 既存番号 docs の削除。
- 既存番号 docs の bulk rename。
- 実装コード、API、backend、frontend、DB、Prisma schema、tests の変更。
- walkthrough の大規模分割。
- 旧 docs 全面書き換え。

## 6. 今後の docs 更新ルール

- 現行仕様は `docs/仕様書/` に追加・更新する。
- 開発・確認・運用手順は `docs/運用ドキュメント/` に追加・更新する。
- roadmap / backlog / completion summary / decision log は `docs/作業進捗管理/` に追加・更新する。
- 詳細な履歴資料は削除せず、必要に応じて入口 docs からリンクする。
- docs-only PR では `git diff --check` と secret/local path scan を実行する。
- PR 本文は ASCII English only、docs 本文は UTF-8 日本語で保存する。

## 7. 関連 docs

- `docs/0.目次.md`
- `docs/57.北極星 docs正本整理・読む順番（現行）.md`
- `docs/作業進捗管理/00_現在地.md`
- `docs/作業進捗管理/01_ロードマップ.md`
