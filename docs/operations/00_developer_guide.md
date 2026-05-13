# 北極星 operations developer guide

更新日: 2026-05-13
分類: operations

## 1. 目的

本資料は、開発・起動・確認・トラブルシュートの入口である。仕様判断は `docs/specs/`、進捗判断は `docs/progress/` を参照する。

## 2. 基本入口

- セットアップと主要コマンド: `README.md`
- 動作確認・受け入れ確認: `docs/walkthrough.md`
- browser smoke / e2e 方針: `docs/45.北極星 browser-based E2E導入方針（P3）.md`
- 詳細セットアップ履歴: `docs/24.北極星 開発着手用 README セットアップ手順書（MVP）.md`

## 3. よく使う確認コマンド

```bash
pnpm --filter frontend build
pnpm --filter backend build
pnpm --filter backend exec prisma validate
pnpm test:e2e:browser
git diff --check
```

タスクごとの対象 test は、該当画面 / backend route の test に絞って追加する。

## 4. docs / PR hygiene

- PR本文は ASCII English only。
- docs本文は UTF-8 日本語で保存する。
- local path、secret、token、shared_secret、API key の実値を残さない。
- docs-only PR でも `git diff --check` を実行する。
- 実装変更がない場合は build / e2e を無理に実行しないが、PR本文には docs-only scope を明記する。

## 5. 旧docsの扱い

MVP初期docsは履歴資料として残す。現行仕様の判断には `docs/specs/` と現行実装 / tests を優先する。
