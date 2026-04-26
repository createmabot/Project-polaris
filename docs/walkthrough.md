# 北極星 walkthrough（Rule Lab / Backtest 一巡）

更新日: 2026-04-26

本資料は、Rule Lab から Pine 生成・TradingView 一次検証・CSV 取込・Backtest AI 総評・比較までの一巡導線を、現行MVP実装に合わせて確認するための手順です。  
正本 docs は `docs/0` から参照し、本資料は実施手順のクイックチェック用途として扱います。

## 0. 事前準備

1. 依存起動
```bash
pnpm run up
```
2. DB 反映と seed
```bash
cd backend
pnpm exec prisma migrate deploy
pnpm exec prisma generate
pnpm exec prisma db seed
```
3. アプリ起動
```bash
cd ..
pnpm run dev
```

## 1. Strategy 作成

1. `http://localhost:5173/strategy-lab` を開く。
2. 自然言語ルールを入力し strategy を作成する。
3. `POST /api/strategies` が成功し、strategy id が発行されることを確認する。

## 2. Strategy Version 作成

1. 同画面または version 作成導線で strategy version を作成する。
2. `POST /api/strategies/:strategyId/versions` が成功することを確認する。
3. `market` と `timeframe` が version に保存されていることを確認する。

## 3. 自然言語 -> Pine 生成

1. `StrategyVersionDetail` で `Pine を生成` を実行する。
2. `POST /api/strategy-versions/:versionId/pine/generate` 成功を確認する。
3. `GET /api/strategy-versions/:versionId/pine` で `status=available` と `generated_script` を確認する。
4. Pine 表示付近の `コピー` ボタンで、TradingView 貼り付け用に全文コピーできることを確認する。

## 4. TradingView 一次検証

1. 生成した Pine を TradingView へ貼り付けて一次検証する。
2. compile error や改善点がある場合はメモを残す。

## 5. Pine 修正再生成（regenerate）

1. `StrategyVersionDetail` の修正入力欄に以下を入力して再生成する。
   - `revision_request`（必須）
   - `compile_error_text`（任意）
   - `validation_note`（任意）
2. `POST /api/strategy-versions/:versionId/pine/regenerate` が成功することを確認する。
3. 失敗時は `failure_reason` / `invalid_reason_codes` / `repair_attempts` を確認する。
4. 再生成後も `generated pine` の `コピー` ボタンが有効であることを確認する。

## 6. Pine lineage / revision input 確認

1. `GET /api/strategy-versions/:versionId/pine` で以下を確認する。
   - `parent_pine_script_id`
   - `source_pine_script_id`
   - `latest_revision_input`
2. 親子関係と修正理由が追跡できることを確認する。

## 7. Backtest 作成と CSV 取込

1. Backtest を作成する。
   - `POST /api/backtests`
2. CSV を取込む。
   - `POST /api/backtests/:backtestId/imports`
3. 受け入れ形式を確認する。
   - Performance Summary（英語ヘッダー）
   - List of Trades（日本語ヘッダー）
   - List of Trades（英語ヘッダー）
4. 失敗時は `parse_error` に不足列が表示されることを確認する。
5. 失敗時の補助文言で、次に修正すべき内容（想定形式 / 必須列 / 空CSV など）が分かることを確認する。
6. HTTP エラー時は、以下のユーザー向け文言になることを確認する。
   - 400: 入力内容・CSV形式・必須項目不足の確認を促す
   - 413: サイズ超過（ファイル/入力が大きすぎる）を案内
   - 415: 送信形式（Content-Type）不一致の可能性を案内

## 8. Backtest Detail 表示

1. `http://localhost:5173/backtests/:backtestId` を開く。
2. 以下を確認する。
   - `used_strategy.snapshot`
   - `latest_import`
   - `imports`
   - parse 成功時の `parsed_summary`

## 9. Backtest AI 総評生成

1. `BacktestDetail` から AI 総評生成を実行する。
2. `POST /api/backtests/:backtestId/summary/generate` が成功し、`ai_jobs` が `queued -> running -> succeeded|failed` で遷移することを確認する。
3. `GET /api/backtests/:backtestId` の `ai_review` を確認する。
   - `status=available|unavailable`
   - `title`
   - `body_markdown`

## 10. inline comparison

1. 同一 backtest 内で parsed import が2件以上ある状態にする。
2. `BacktestDetail` の inline 比較で差分が表示されることを確認する。

## 11. saved pairwise comparison

1. `この2件で比較を保存する` を実行する。
2. `保存済み比較を見る` から `GET /api/backtest-comparisons/:comparisonId` が表示できることを確認する。
3. `metrics_diff` / `tradeoff_summary` / `ai_summary` を再訪可能であることを確認する。

## 12. seed 固定IDでの最小確認

seed 後は以下で最小動作確認が可能です。

1. version一覧  
`http://localhost:5173/strategies/00000000-0000-4000-8000-000000000201/versions`
2. version詳細  
`http://localhost:5173/strategy-versions/00000000-0000-4000-8000-000000000202`
3. backtest詳細  
`http://localhost:5173/backtests/00000000-0000-4000-8000-000000000401`

## 13. 運用メモ

1. TradingView は表示・監視・一次検証を担う。
2. 北極星は保存・比較・履歴管理・AI要約を担う。
3. 一巡導線で破綻があれば、まず docs 契約との差分を確認してから実装を修正する。
