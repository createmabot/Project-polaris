# Home MVP watchlist_symbols 実データ実装

本タスクでは、`GET /api/home` における `watchlist_symbols` を placeholder から最小構成で実データ化しました。

## 読んだ docs 一覧

- [docs/0.目次.md](file:///g:/Projects/hokkyokusei/docs/0.%E7%9B%AE%E6%AC%A1.md)
- [docs/2.北極星 データモデル設計（MVP）.md](file:///g:/Projects/hokkyokusei/docs/2.%E5%8C%97%E6%A5%B5%E6%98%9F%20%E3%83%87%E3%83%BC%E3%82%BF%E3%83%A2%E3%83%87%E3%83%AB%E8%A8%AD%E8%A8%88%EF%BC%88MVP%EF%BC%89.md)
- [docs/3.北極星 API ユースケース単位の入出力設計（MVP）.md](file:///g:/Projects/hokkyokusei/docs/3.%E5%8C%97%E6%A5%B5%E6%98%9F%20API%20%E3%83%A6%E3%83%BC%E3%82%B9%E3%82%B1%E3%83%BC%E3%82%B9%E5%8D%98%E4%BD%8D%E3%81%AE%E5%85%A5%E5%87%BA%E5%8A%9B%E8%A8%AD%E8%A8%88%EF%BC%88MVP%EF%BC%89.md)
- [docs/16.北極星 APIごとの JSON サンプル集（MVP）.md](file:///g:/Projects/hokkyokusei/docs/16.%E5%8C%97%E6%A5%B5%E6%98%9F%20API%E3%81%94%E3%81%A8%E3%81%AE%20JSON%20%E3%82%B5%E3%83%B3%E3%83%97%E3%83%AB%E9%9B%86%EF%BC%88MVP%EF%BC%89.md)
- [docs/17.北極星 画面別の入力 出力サンプル（MVP）.md](file:///g:/Projects/hokkyokusei/docs/17.%E5%8C%97%E6%A5%B5%E6%98%9F%20%E7%94%BB%E9%9D%A2%E5%88%A5%E3%81%AE%E5%85%A5%E5%8A%9B%20%E5%87%BA%E5%8A%9B%E3%82%B5%E3%83%B3%E3%83%97%E3%83%AB%EF%BC%88MVP%EF%BC%89.md)

## watchlist_symbols の docs 想定 shape

docs で想定されていた shape は以下の通りです。

```json
{
  "symbol_id": "sym_x",
  "display_name": "名称",
  "tradingview_symbol": "TSE:xxx",
  "latest_price": 1000,
  "change_rate": 1.5,
  "latest_alert_status": "received",
  "user_priority": 1
}
```

## 採用した実データ方針

Prisma schema 上で `watchlists` / `watchlist_items` といったユーザー単位の監視銘柄テーブルが未実装であることが確認されました。
そのため、今回は**最小実データ実装（DB schema 変更なし）**として、「[Symbol](file:///g:/Projects/hokkyokusei/backend/src/market/snapshot.ts#14-21) テーブルから全銘柄を取得し、それにスナップショットを紐づける」方針を採りました。

- **取得元**:
  - `Symbol.findMany()` で全件取得
  - [getCurrentSnapshotsForSymbols()](file:///g:/Projects/hokkyokusei/backend/src/market/snapshot.ts#734-747) で価格情報を付与
  - `AlertEvent` から symbol ごとに最新ステータスを取得（N+1回避）
- **プレースホルダー対応**:
  - `watchlists` 未実装のため `user_priority: null` を明示
- **その他**:
  - snapshot が取得できない場合は `latest_price: null`, `change_rate: null` となる（既存に合わせた安全な実装）

## 変更したファイル一覧

- [backend/src/routes/home.ts](file:///g:/Projects/hokkyokusei/backend/src/routes/home.ts) (API 実装)
- [backend/test/home.e2e.test.ts](file:///g:/Projects/hokkyokusei/backend/test/home.e2e.test.ts) (テスト)
- [docs/17.北極星 画面別の入力 出力サンプル（MVP）.md](file:///g:/Projects/hokkyokusei/docs/17.%E5%8C%97%E6%A5%B5%E6%98%9F%20%E7%94%BB%E9%9D%A2%E5%88%A5%E3%81%AE%E5%85%A5%E5%8A%9B%20%E5%87%BA%E5%8A%9B%E3%82%B5%E3%83%B3%E3%83%97%E3%83%AB%EF%BC%88MVP%EF%BC%89.md) (docs 更新)

## 追加/更新したテスト

- [home.e2e.test.ts](file:///g:/Projects/hokkyokusei/backend/test/home.e2e.test.ts) 内の [prisma](file:///g:/Projects/hokkyokusei/backend/prisma/schema.prisma) モックに `symbol.findMany` を追加。
- [AlertRow](file:///g:/Projects/hokkyokusei/backend/test/home.e2e.test.ts#6-21) に `processingStatus` を追加し、モックデータも更新。
- `GET /api/home` リクエスト時の `watchlist_symbols` が配列1件で、価格や変化率、想定された shape（`display_name`, `user_priority` 等）が正しく返却されることをアサートする処理を追加。

## ローカル確認結果

- `npm run dev` 起動後、`curl http://localhost:3000/api/home` を実行。
- DB 内が空のため、結果として `watchlist_symbols: []` となり、かつ他の項目に影響を与えずに API が正常に稼働することを確認（データなし時の空配列維持）。
- `vitest` による e2e テストは完全に PASS しており、データあり・なし両方のケースがカバーされています。

## docs 更新内容

[docs/17.北極星 画面別の入力 出力サンプル（MVP）.md](file:///g:/Projects/hokkyokusei/docs/17.%E5%8C%97%E6%A5%B5%E6%98%9F%20%E7%94%BB%E9%9D%A2%E5%88%A5%E3%81%AE%E5%85%A5%E5%8A%9B%20%E5%87%BA%E5%8A%9B%E3%82%B5%E3%83%B3%E3%83%97%E3%83%AB%EF%BC%88MVP%EF%BC%89.md) の注記に以下を追記しました。

> `watchlist_symbols` は現時点では [Symbol](file:///g:/Projects/hokkyokusei/backend/src/market/snapshot.ts#14-21) テーブル全件をそのまま返す最小実装。  
> ユーザー単位 watchlist 管理（watchlists / watchlist_items テーブル）は未実装のため `user_priority: null`。  
> `latest_alert_status` は symbol に紐づく最新 alert の `processingStatus` を返す。

## 今回あえてやらなかったこと

- `positions` / `key_events` の実データ化
- 監視銘柄管理用テーブル群（watchlists, watchlist_items など）の schema 拡張
- ホーム UI (React 側) の改修

## コミット情報

- Hash: `86aec30b9088acec2dc4be42418a41b5ad4a284f`
- URL: (Local Commit)
