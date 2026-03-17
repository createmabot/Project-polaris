# バックエンドAPI実装 ウォークスルー (Home / Alerts)

## 実施内容の概要

フロントエンドとの接続に向けて、`docs/3` などの仕様に基づき、**読み取り専用のBFF的なAPI** として `GET /api/home` と `GET /api/alerts/:alertId` を実装しました。

### 1. 参照した docs 一覧
- [docs/0.目次.md](file:///g:/Projects/hokkyokusei/docs/0.%E7%9B%AE%E6%AC%A1.md)
- [docs/3.北極星 API ユースケース単位の入出力設計（MVP）.md](file:///g:/Projects/hokkyokusei/docs/3.%E5%8C%97%E6%A5%B5%E6%98%9F%20API%20%E3%83%A6%E3%83%BC%E3%82%B9%E3%82%B1%E3%83%BC%E3%82%B9%E5%8D%98%E4%BD%8D%E3%81%AE%E5%85%A5%E5%87%BA%E5%8A%9B%E8%A8%AD%E8%A8%88%EF%BC%88MVP%EF%BC%89.md)
- [docs/19.北極星 スプリント計画案（MVP）.md](file:///g:/Projects/hokkyokusei/docs/19.%E5%8C%97%E6%A5%B5%E6%98%9F%20%E3%82%B9%E3%83%97%E3%83%AA%E3%83%B3%E3%83%88%E8%A8%88%E7%94%BB%E6%A1%88%EF%BC%88MVP%EF%BC%89.md)
- [docs/2.北極星 データモデル設計（MVP）.md](file:///g:/Projects/hokkyokusei/docs/2.%E5%8C%97%E6%A5%B5%E6%98%9F%20%E3%83%87%E3%83%BC%E3%82%BF%E3%83%A2%E3%83%87%E3%83%AB%E8%A8%AD%E8%A8%88%EF%BC%88MVP%EF%BC%89.md)
- [docs/5.北極星 AI要約フロー設計（MVP）.md](file:///g:/Projects/hokkyokusei/docs/5.%E5%8C%97%E6%A5%B5%E6%98%9F%20AI%E8%A6%81%E7%B4%84%E3%83%95%E3%83%AD%E3%83%BC%E8%A8%AD%E8%A8%88%EF%BC%88MVP%EF%BC%89.md)

### 2. docs から採用した設計方針
- **Response Format**: 全API共通で `{ data, meta, error }` のフォーマット（`docs/3 §2.3`）を採用。[src/utils/response.ts](file:///g:/Projects/hokkyokusei/backend/src/utils/response.ts) にフォーマッタとエラハンを実装。
- **データ取得範囲**: 
  - Home: `recent_alerts` (最新アラートと関連AIサマリ、シンボル紐づけ), `daily_summary` (最新の日次サマリ) を取得。
  - Alerts: `alert_event` 本体にくわえ、`symbol`, 関連する `external_references`, `related_ai_summary` (スコープ: `alert_reason`) を Join。
- **未生成状態への耐性**: AI要約がまだ生成されていない（あるいは `unresolved_symbol` 等で生成対象外の）アラートでも、`related_ai_summary: null` として安全に情報を返す設計（`docs/3 §4.6.2`）。

### 3. 追加・変更ファイル
- [backend/src/routes/home.ts](file:///g:/Projects/hokkyokusei/backend/src/routes/home.ts) (新規追加)
- [backend/src/routes/alerts.ts](file:///g:/Projects/hokkyokusei/backend/src/routes/alerts.ts) (新規追加)
- [backend/src/index.ts](file:///g:/Projects/hokkyokusei/backend/src/index.ts) (ルーティング登録)
- [backend/scripts/test-api.ts](file:///g:/Projects/hokkyokusei/backend/scripts/test-api.ts) (検証用スクリプトとして追加)

### 4. 未実装として残した Home API 項目
MVP の当段階では、下記項目は空配列 `[]` としてプレースホルダー返却としています（`docs/19` の次以降のスプリントで統合予定）。
- `watchlist_symbols`
- `positions`
- `key_events`
- `market_overview.indices / fx / sectors`

### 5. 次に frontend 接続で着手すべき最優先タスク
バックエンドの読み取りAPIが成立したため、**フロントエンド（Next.js側）で `GET /api/home` を叩き、アラート一覧と「今日動いた理由」を画面に表示する実装** が最優先タスクとなります。

---

## Response 例

### GET /api/home
```json
{
  "data": {
    "market_overview": { "indices": [], "fx": [], "sectors": [] },
    "watchlist_symbols": [],
    "positions": [],
    "recent_alerts": [
      {
        "id": "a9fa4f06-d7c4-4458-b241-36d4320eb0d7",
        "processingStatus": "queued_for_enrichment",
        "symbol": {
          "symbol": "7203",
          "displayName": "7203"
        },
        "related_ai_summary": null
      }
    ],
    "daily_summary": null,
    "key_events": []
  },
  "meta": {
    "request_id": "req-1"
  },
  "error": null
}
```

### GET /api/alerts/:alertId (404時)
```json
{
  "data": null,
  "meta": {
    "request_id": "req-3"
  },
  "error": {
    "code": "ALERT_NOT_FOUND",
    "message": "The specified alert was not found."
  }
}
```
