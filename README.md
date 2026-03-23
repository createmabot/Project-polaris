# Project-polaris（北極星）

株価評価AIツール「北極星」の開発用リポジトリです。  
このリポジトリでは、詳細仕様の正本は `docs/` 配下のドキュメントです。

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

3. 環境変数を作成

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

## ルール検証ラボ（MVP最小）
- 画面: `/strategy-lab`
- 今回の到達点:
  - 自然言語入力
  - strategy 作成
  - strategy version 作成
  - Pine 生成
  - generated pine / warnings / assumptions の表示
  - backtest 作成
  - CSV取込
  - parseStatus / parseError / 最小summary表示
  - backtest詳細表示（`/backtests/:backtestId`）
- まだ未対応（次フェーズ）:
  - 本格レポート分析（比較・可視化）
  - 比較高度化

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
- 主要ステータス:
  - `pending`: 受理直後
  - `parsed`: パース成功
  - `failed`: パース失敗（`parseError` に理由）

### backtest 詳細（最小表示）
- URL: `/backtests/:backtestId`
- 表示項目:
  - 基本情報（id / strategy_version_id / execution_source / market / timeframe / status）
  - 取込状態（`parsed` / `failed` / `pending` / 未取込）
  - parse failed 時は `parse_error` を強調表示
  - 主要指標カード（総取引数 / 勝率 / Profit Factor / 最大ドローダウン / 純利益 / 対象期間）

### backtest 履歴一覧（直近）
- URL: `/backtests`
- 直近の検証履歴を createdAt 降順で表示（最小ページネーション対応）
- 表示項目:
  - タイトル / 作成日時
  - market / timeframe / executionSource / backtest status
  - 最新 parse 状態（parsed / failed / pending / 取込なし）
  - 詳細画面へのリンク
- ページ移動:
  - `前へ` / `次へ` ボタンで履歴を遡る
- 今回未対応:
  - 検索、フィルタ、高度ソート、比較分析

### Snapshot 週次レビュー記録
- 生成（当週/JST）
  - `pnpm run create:snapshot-weekly-review`
- 任意週生成（JST日付指定）
  - `pnpm run create:snapshot-weekly-review -- --date=YYYY-MM-DD`
- 上書き（明示時のみ）
  - `pnpm run create:snapshot-weekly-review -- --date=YYYY-MM-DD --force`
- 事前確認（書き込みなし）
  - `pnpm run create:snapshot-weekly-review -- --dry-run`
- 機械可読（JSON）
  - `pnpm run create:snapshot-weekly-review -- --dry-run --output-format=json`
- JSON契約チェック
  - `pnpm run check:snapshot-weekly-review-json`

## current_snapshot 関連の運用要点
- 公開API契約は維持
  - `last_price`
  - `change`
  - `change_percent`
  - `volume`
  - `as_of`
  - `market_status`（`open | closed | unknown`）
  - `source_name`
- failover
  - primary: `stooq_daily`
  - secondary: `yahoo_chart`
  - 全失敗時: `current_snapshot: null`
- `market_status` は日本市場の休日判定を考慮（外部休日APIには依存しない）

## Integration test（DB 必須）
```bash
pnpm run test:integration:symbol-snapshot-db
```

このテストでは次を確認します。
- `GET /api/symbols/:symbolId` の snapshot failover 3ケース
  - 主系成功
  - 主系失敗 + 予備系成功
  - 主系失敗 + 予備系失敗（`current_snapshot: null`）
- snapshot shape 契約
  - `last_price`, `change`, `change_percent`, `volume`, `as_of`, `market_status`, `source_name`

## CI
GitHub Actions の `Symbol Snapshot DB Integration` で以下を実行します。
- `snapshot-review-generator-json-check`
- `symbol-snapshot-db-integration`

`main` の required checks は ruleset 管理で、上記2件を必須化しています。

## Required-check failure drill（定期監査）
目的:
- `snapshot-review-generator-json-check` が失敗したときに PR merge が確実に block されることを定期確認する

推奨頻度:
- 四半期に1回（または ruleset / branch protection 変更後）

最小手順:
1. `main` から検証ブランチを作成（例: `codex/ops-drill-snapshot-json-failure-YYYYMMDD`）
2. `scripts/check-snapshot-weekly-review-json.mjs` の必須キー期待値を一時的に壊す
3. PR を作成し、`snapshot-review-generator-json-check` が red になることを確認
4. PR が required check 未通過で block されることを確認
5. 破壊コミットを revert して復元
6. 両 required checks が green 復帰することを確認
7. 実施結果を `docs/snapshot-weekly-reviews/` の週次記録へ残す

注意:
- 検証変更は `main` に merge しない
- 破壊は最小・可逆にする

## 参考ドキュメント
- 目次: `docs/0.目次.md`
- セットアップ詳細: `docs/24.北極星 開発着手用 README セットアップ手順書（MVP）.md`
- ホーム供給仕様: `docs/25. 補助資料_1 北極星 ホームデータ供給仕様（MVP）.md`
- API設計: `docs/3.北極星 API ユースケース単位の入出力設計（MVP）.md`
