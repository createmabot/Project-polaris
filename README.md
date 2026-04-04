# Project Polaris（北極星）

株価評価AIツール「北極星」の開発リポジトリです。  
仕様の正本は `docs/` 配下のドキュメントです。

## 技術スタック
- Node.js 22
- pnpm workspaces（monorepo）
- Frontend: Vite + React + TypeScript
- Backend: Fastify + TypeScript
- DB: PostgreSQL（Prisma）
- Queue/Cache: Redis（BullMQ）
- Infra: Docker Compose

## セットアップ
1. リポジトリをクローン
2. 依存関係をインストール

```bash
pnpm install
```

3. 環境変数を準備

```bash
cp .env.example .env
```

4. Docker で PostgreSQL / Redis を起動

```bash
docker compose up -d
```

5. DB マイグレーションと seed（必要時）

```bash
cd backend
pnpm exec prisma migrate dev
pnpm exec prisma db seed
```

## よく使うコマンド
```bash
pnpm run dev
pnpm run build
pnpm run test
pnpm run up
pnpm run down
```

## ルール検証ラボ（MVP）
- 画面: `/strategy-lab`
- 現在の対応範囲:
  - 自然言語ルール入力
  - strategy 作成
  - strategy version 作成
  - Pine 生成
  - generated pine / warnings / assumptions 表示
  - backtest 作成
  - CSV 取込
  - parseStatus / parseError / 最小 summary 表示
  - backtest 詳細表示（`/backtests/:backtestId`）
- まだ未対応:
  - 本格レポート分析（グラフ等）
  - 高度な比較機能
  - 北極星内バックテストエンジン本体（未実装）

### 北極星内バックテストエンジン（最小実装 + 段階固定）
- 次フェーズ着手前の最小責務のみ固定済み:
  - execution job（状態遷移の正本）
  - execution input snapshot（実行条件固定）
  - execution result summary（主要指標）
  - execution artifact pointer（詳細結果参照）
- 最小 API は `start / status / result` を基準とし、状態遷移は `queued -> running -> succeeded|failed|canceled` を正とする
- 実装土台（最小）:
  - `POST /api/internal-backtests/executions`（`queued` で job 作成 + queue enqueue）
  - `GET /api/internal-backtests/executions/:executionId`（status 取得）
  - `GET /api/internal-backtests/executions/:executionId/result`（`succeeded` 時のみ結果取得）
  - `GET /api/internal-backtests/observability/data-source-unavailable-summary?window=24h|7d`（内部運用向け: reason code 別件数と直近失敗 execution を確認）
  - `POST` では execution input snapshot の最小検証を実施（`strategy_rule_version_id` と `data_range` は必須、`market/timeframe` は optional）
  - `market/timeframe` は request 値を優先し、未指定時は strategy version 側の値で補完
  - worker 骨組みで `queued -> running -> succeeded|failed` を最小遷移
  - 成功時に `resultSummaryJson` / `artifactPointerJson` を最小保存（`schema_version: \"1.0\"` の summary）
  - `artifactPointerJson` は `type` / `execution_id` / `path` の最小 shape を採用
  - worker は status 遷移と永続化に責務を限定し、実行処理本体は service/adapter 境界へ分離
- 実データ接続（最小）:
  - `engine_estimated` は日足 OHLCV（`JP_STOCK` / `D`）の最小 provider 経路を利用
  - provider 応答は adapter 層で normalize し、再現性情報として `data_source_snapshot`（`source_kind` / `market` / `timeframe` / `from` / `to` / `fetched_at` / `data_revision` / `bar_count`）を保存
  - provider failure / unsupported は `DATA_SOURCE_UNAVAILABLE` に統一
  - 内部観測性として provider failure reason を構造化ログ + DB永続化イベントで保持し、summary API は DB 集計を返す（consumer 向け契約は変更しない）
  - `INTERNAL_BACKTEST_MARKET_DATA_PROVIDER` 未指定時は `test=stub`, `development/production=stooq`
- 役割分担は維持:
  - TradingView: 表示 / 監視 / 一次検証
  - 北極星: 自然言語変換 / 履歴保存 / レポート / 内製実行結果管理

### ルール version 再閲覧（MVP最小）
- API:
  - `GET /api/strategies/:strategyId/versions`
  - `GET /api/strategy-versions/:versionId`
  - `POST /api/strategy-versions/:versionId/pine/generate`（既存 version の再生成）
- 画面:
  - `/strategies/:strategyId/versions` で version 一覧表示
  - `/strategy-versions/:versionId` で version 詳細（自然言語原文 / generated pine / warnings / assumptions / status）表示
  - `/strategy-versions/:versionId` で「次の検証ノート（フォワード検証ノート）」を保存・更新可能（Strategy Version 単位）
  - `/strategy-versions/:versionId` のノートセクションで「ノート更新目安」を表示し、`forward_validation_note_updated_at` に基づく最終更新時点を確認可能
  - `/strategy-lab` から一覧・詳細へ遷移可能
  - version 一覧は `natural_language_rule` の部分一致検索に対応（`q`）
  - status フィルタ、sort/order（`created_at|updated_at` × `asc|desc`）に対応
  - version 一覧で `要確認差分`（派生かつ差分あり）を最小強調表示
  - version 一覧で `検証ノートあり`（フォワード検証ノート有無）を最小表示
  - version 一覧で `検証ノートあり` 行に「ノート更新目安」を最小表示し、`forward_validation_note_updated_at` ベースで鮮度判断を補助
  - version 一覧で「このページ内の最新ノート」を件数サマリ・行バッジで最小表示し、先に読むべきノートを判別しやすくする
  - version 一覧で `要確認差分` かつ `検証ノートあり` を `最優先確認` として最小強調表示
  - version 一覧で `最優先確認` かつ `最新ノート` を `今読む候補` として最小表示し、優先読了対象を一目で拾える
  - `今読む候補` がある場合、件数サマリから先頭へ移動可能
  - `今読む候補` が複数件ある場合、件数サマリから `次の今読む候補へ` で順送り確認が可能
  - version 一覧ヘッダで `要確認差分` / `検証ノートあり` / `要確認差分かつ検証ノートあり` のページ内件数を表示
  - `要確認差分かつ検証ノートあり` がある場合、件数サマリからページ内の最初の対象へジャンプ可能
  - `最優先確認` が複数件ある場合、件数サマリから `次の最優先確認へ` で順送り確認が可能
  - ジャンプ直後は対象カードを一時ハイライトし、位置把握後に自動解除
  - `StrategyVersionDetail` でも、同一一覧文脈に `最優先確認` が複数ある場合は `次の最優先確認へ` で順送り可能
  - 一覧URLは `q/page/status/sort/order` をクエリ同期し、詳細から `return` で同じ一覧状態に復帰可能

### CSV取込（MVPでサポートする形式）
- 1行ヘッダ + 1行データの CSV
- 必須列:
  - `Net Profit`
  - `Total Closed Trades`
  - `Percent Profitable`
  - `Profit Factor`
  - `Max Drawdown`
  - `From`
  - `To`
- 主なステータス:
  - `pending`: 解析待ち
  - `parsed`: 解析成功
  - `failed`: 解析失敗（`parseError` に理由）

### backtest 詳細（最小レポート表示）
- URL: `/backtests/:backtestId`
- 表示項目:
  - 基本情報（id / strategy_version_id / execution_source / market / timeframe / status）
  - 使用した Strategy（実行時 snapshot）
  - 次アクション（Rule Lab）:
    - この version を Rule Lab で見直す
    - 同一 Strategy の version 一覧を見る
  - 取込状態（parsed / failed / pending / 未取込）
  - parse failed 時の `parse_error`
  - 主要指標（総取引数 / 勝率 / Profit Factor / 最大ドローダウン / 純利益 / 対象期間）

### backtest 履歴一覧
- URL: `/backtests`
- createdAt 降順の直近一覧
- title 部分一致検索（`q`）
- status フィルタ
- sort/order（`created_at|updated_at` × `asc|desc`）
- ページネーション
- URL クエリ同期（`/backtests?q=...&page=...&status=...&sort=...&order=...`）
- 一覧→詳細の遷移は `return` クエリで復帰先を保持
  - 許可する戻り先は `/backtests` の `q/page/status/sort/order` のみ
- 表示項目:
  - タイトル / 作成日時
  - market / timeframe / executionSource / backtest status
  - 実行時 Strategy / Version の最小表示
  - Rule Lab で見直す導線（version 詳細への最小リンク）
  - 最新 parse 状態（parsed / failed / pending / 未取込）
  - 詳細リンク

## Snapshot 運用コマンド
- 生成（当週/JST）
  - `pnpm run create:snapshot-weekly-review`
- 日付指定生成（JST日付）
  - `pnpm run create:snapshot-weekly-review -- --date=YYYY-MM-DD`
- 明示上書き
  - `pnpm run create:snapshot-weekly-review -- --date=YYYY-MM-DD --force`
- dry-run（書き込みなし）
  - `pnpm run create:snapshot-weekly-review -- --dry-run`
- dry-run JSON 出力
  - `pnpm run create:snapshot-weekly-review -- --dry-run --output-format=json`
- JSON 出力契約チェック
  - `pnpm run check:snapshot-weekly-review-json`

## current_snapshot 契約（公開API）
- 返却フィールド:
  - `last_price`
  - `change`
  - `change_percent`
  - `volume`
  - `as_of`
  - `market_status`（`open | closed | unknown`）
  - `source_name`
- failover:
  - primary: `stooq_daily`
  - secondary: `yahoo_chart`
  - 全失敗時: `current_snapshot: null`

## Integration test（DB 実接続）
```bash
pnpm run test:integration:symbol-snapshot-db
```

このテストでは以下を確認します。
- `GET /api/symbols/:symbolId` の snapshot failover 3ケース
  - 主系成功
  - 主系失敗 + 予備系成功
  - 主系失敗 + 予備系失敗（`current_snapshot: null`）
- snapshot shape 契約
  - `last_price`, `change`, `change_percent`, `volume`, `as_of`, `market_status`, `source_name`

## CI
GitHub Actions で以下のチェックを運用しています。
- `strategy-versions-return-flow-e2e-check`
- `backtests-return-flow-e2e-check`
- `snapshot-review-generator-json-check`
- `symbol-snapshot-db-integration`

`main` の required checks は ruleset で管理しています。

## Required-check failure drill（運用確認）
目的:
- required check failure 時に merge が block されることを定期確認する

対象:
- `snapshot-review-generator-json-check`
- `backtests-return-flow-e2e-check`
- `strategy-versions-return-flow-e2e-check`

対象 workflow:
- `Symbol Snapshot DB Integration`

対象 ruleset:
- `protect-main-required-checks`

推奨頻度:
- 四半期に1回（または ruleset / branch protection 変更時）

最小手順:
1. `main` から検証ブランチを作成（例: `ops/drill-<check-name>-YYYYMMDD`）
2. 対象 check が確実に落ちる最小の一時破壊を入れる
3. PR を作成し、`pending -> failure` を確認
4. required check 未通過で PR が BLOCKED になることを確認
5. 一時破壊コミットを revert して復元
6. `pending -> success` に戻ることを確認
7. 結果を `docs/snapshot-weekly-reviews/` の運用記録へ残す

### Drill: `snapshot-review-generator-json-check`
一時破壊例:
- `scripts/check-snapshot-weekly-review-json.mjs` の必須キー期待を 1 箇所だけ崩す

### Drill: `backtests-return-flow-e2e-check`
一時破壊例:
- `frontend/src/pages/BacktestsReturnFlow.e2e.test.ts` の期待値を 1 箇所だけ意図的に崩す
- 例: `page: 2` の期待を `page: 999` に変更して failure を発生させる

ローカル再現コマンド:
- `npm --prefix frontend run test:e2e:backtests-return-flow`
- `npm --prefix frontend run test -- src/pages/BacktestList.test.tsx`

確認観点（最新）:
- 一覧→詳細→一覧の `q/page/status/sort/order` 復帰
- 一覧復帰後の `実行時Strategy` / `実行時Version` 最小表示
- Backtest List / Detail から Rule Lab（version 詳細）へ戻る導線URLが維持されること

### Drill: `strategy-versions-return-flow-e2e-check`
一時破壊例:
- `frontend/src/pages/StrategyVersionsReturnFlow.e2e.test.ts` の期待値を 1 箇所だけ意図的に崩す
- 例: 一覧復帰 URL の期待を `/strategies/xxx/versions?page=2` から存在しない値に変更して failure を発生させる

確認観点（最新）:
- 一覧→詳細→一覧の `q/page/status/sort/order` 復帰
- `要確認差分` を含む一覧状態の保持
- `検証ノートあり` 行（フォワード検証ノートあり）を含む一覧状態の保持
- `StrategyVersionDetail` でのフォワード検証ノート編集文脈を含む return-flow の保持
- `StrategyVersionDetail` の internal-backtests 最小表示分岐（`not_ready` / `success_no_data` / `data_source_unavailable` / `success_with_data`）の回帰固定

確認ポイント:
1. PR checks で対象 check が `pending` になる
2. 一時破壊コミット後、対象 check が `failure` になる
3. PR 画面が `BLOCKED`（required checks 未通過）になる
4. restore 後、対象 check が `success` に戻る

`Expected — Waiting for status to be reported` の場合:
- ruleset の required check 名と、GitHub Actions の実際の check 名が一致しているか確認する
- 対象 workflow が PR トリガー（`pull_request`）で起動しているか確認する
- 必要なら最新コミットを push して checks を再発火し、pending/failure/success の遷移を再確認する

実施記録テンプレート（運用メモへ記録）:
- 実施日:
- 実施者:
- 対象PR:
- 対象check:
- failure run URL:
- success run URL:
- pending確認: yes / no
- failure確認: yes / no
- blocked確認: yes / no
- restore確認: yes / no
- 備考:

注意事項:
- 検証用の破壊コミットは `main` に merge しない
- 復元後に check が success に戻ることを確認する

## 参照ドキュメント
- 目次: `docs/0.目次.md`
- セットアップ手順: `docs/24.北極星 開発着手用 README セットアップ手順書（MVP）.md`
- ホーム供給仕様: `docs/25.補助資料_1 北極星 ホームデータ供給仕様（MVP）.md`
- API設計: `docs/3.北極星 API ユースケース単位の入出力設計（MVP）.md`
