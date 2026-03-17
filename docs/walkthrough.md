# フロントエンド画面接続 ウォークスルー (Home / Alerts)

## 実施内容の概要

MVP仕様 (docs/3, docs/19) に基づき、先日構築したバックエンドAPI (`/api/home`, `/api/alerts/:alertId`) をフロントエンドから接続し、最低限の「ホーム画面」と「アラート詳細画面」を成立させました。

### 1. 参照した docs 一覧
- [docs/0.目次.md](file:///g:/Projects/hokkyokusei/docs/0.%E7%9B%AE%E6%AC%A1.md)
- [docs/3.北極星 API ユースケース単位の入出力設計（MVP）.md](file:///g:/Projects/hokkyokusei/docs/3.%E5%8C%97%E6%A5%B5%E6%98%9F%20API%20%E3%83%A6%E3%83%BC%E3%82%B9%E3%82%B1%E3%83%BC%E3%82%B9%E5%8D%98%E4%BD%8D%E3%81%AE%E5%85%A5%E5%87%BA%E5%8A%9B%E8%A8%AD%E8%A8%88%EF%BC%88MVP%EF%BC%89.md)
- [docs/19.北極星 スプリント計画案（MVP）.md](file:///g:/Projects/hokkyokusei/docs/19.%E5%8C%97%E6%A5%B5%E6%98%9F%20%E3%82%B9%E3%83%97%E3%83%AA%E3%83%B3%E3%83%88%E8%A8%88%E7%94%BB%E6%A1%88%EF%BC%88MVP%EF%BC%89.md)

### 2. docs から採用した画面 / API 接続方針
- **責務の分離**: フロントエンドではAPIの `{ data, meta, error }` を共通 [fetchApi](file:///g:/Projects/hokkyokusei/frontend/src/api/client.ts#15-54) で開梱し、コンポーネントには `data` のみを渡すシンプルな作りにしました。
- **Graceful な UI**: AIサマリ未生成時はプレースホルダーを表示、関連情報が存在しない時は「ありません」と表示するなど、エラーで画面が真っ白に落ちない設計で実装しました。存在しないアラートへアクセスした際は専用の404メッセージ画面を出します。
- **開発効率化**: Vite の `proxy` 機能を利用し、フロント側 (`/api/*`) へのリクエストを透過的にバックエンド (`localhost:3000`) へ転送して CORS エラーを回避しています。

### 3. 追加・変更ファイル一覧
| ファイル | 用途 |
|---|---|
| [frontend/package.json](file:///g:/Projects/hokkyokusei/frontend/package.json) | `wouter` (ルーティング), [swr](file:///g:/Projects/hokkyokusei/frontend/src/api/client.ts#55-59) (データ取得) パッケージの追加 |
| [frontend/vite.config.ts](file:///g:/Projects/hokkyokusei/frontend/vite.config.ts) | `/api` proxy設定の追加 |
| [frontend/src/api/types.ts](file:///g:/Projects/hokkyokusei/frontend/src/api/types.ts) | [NEW] BEと同期したレスポンスの型定義（[AlertEventDto](file:///g:/Projects/hokkyokusei/frontend/src/api/types.ts#29-41), [HomeData](file:///g:/Projects/hokkyokusei/frontend/src/api/types.ts#52-60) 等） |
| [frontend/src/api/client.ts](file:///g:/Projects/hokkyokusei/frontend/src/api/client.ts) | [NEW] 共通APIクライアント、エラーハンドラ、および SWR Fetcher |
| [frontend/src/pages/Home.tsx](file:///g:/Projects/hokkyokusei/frontend/src/pages/Home.tsx) | [NEW] `GET /api/home` を接続したホーム画面 |
| [frontend/src/pages/AlertDetail.tsx](file:///g:/Projects/hokkyokusei/frontend/src/pages/AlertDetail.tsx) | [NEW] `GET /api/alerts/:alertId` を接続したアラート詳細画面 |
| [frontend/src/App.tsx](file:///g:/Projects/hokkyokusei/frontend/src/App.tsx) | ルーティング設定による各画面へのディスパッチ |

### 4. 追加した画面 / Route 一覧
- **`/` (Home)**: 直近のアラート発生状況と日次サマリーを確認する初期画面。
- **`/alerts/:alertId` (Alert Detail)**: 個別のアラート理由（AI要約）と関連情報を深掘りする画面。

### 5. Home 画面で表示する項目
- 本日のサマリー（AI）
- 直近稼働したアラートの一覧
  - 銘柄名 / ティッカー
  - アラート名
  - 発生時刻
  - 処理ステータス (`completed`, `unresolved_symbol`, `failed` など)
  - 個別AI要約のプレビュー（あれば）

### 6. Alert Detail 画面で表示する項目
- アラートの基本情報とステータス
- 🤖「今日なぜ動いたのか」AIの分析 (Markdownレンダリング)
- 📰 関連する適時開示・ニュース情報のリンクとタイムスタンプ
- ⚙️ アラート設定の生情報(JSONプレビュー)

### 7. ローディング / エラー / 空状態の扱い
- **Loading**: SWR の `isLoading` を利用し、描画前に `読み込み中...` を表示。
- **Error**: バックエンドが [error](file:///g:/Projects/hokkyokusei/backend/src/utils/response.ts#15-40) を返した場合や 500 レベルのエラーの場合、SWRの [error](file:///g:/Projects/hokkyokusei/backend/src/utils/response.ts#15-40) ステートからメッセージを抽出し表示するように構成。404 の場合は専用メッセージへハンドリング。
- **Empty**: `recent_alerts` が 0件であったり、`related_ai_summary` が null である場合は、それぞれ「アラートはありません」「要約はまだ生成されていません」といった補助メッセージを出します。

### 8. まだ未実装として残した UI 項目
今回は MVP 段階で、以下の項目は Home 画面に静的プレースホルダーとして枠だけ残しています。（バックエンドAPIでも空配列やnullを返す仕様です）
- マーケット概況 (Indices, FX, Sectors)
- ウォッチリスト連携
- ポジション表示
- キーイベント

### 9. 次に着手すべき最優先タスク
これにて「TradingView 検知 → バックエンド要約 → フロント表示」の一連の縦導線（Sprint 2 相当）が最低限成立しました。（※現在はモック要約にて動作）

次のステップとしては**「Sprint 3: 銘柄研究とノート機能の成立」**、特に以下の実装が推奨されます。
1. **銘柄詳細 API と画面の実装**: 個別銘柄に紐づく過去全てのアラートや、AI論点カード（Thesis）を集約するビュー。
2. **研究ノート機能**: ユーザー自身が画面上から仮説や条件を記録・更新する CRUD 機能。

---

## 追補: Sprint 3-1 「銘柄詳細 API と銘柄詳細画面」

### 実装日
- 2026-03-18

### 追加した API
- `GET /api/symbols/:symbolId`
  - `symbol` 基本情報
  - `recent_alerts`（新しい順、最大5件）
  - 各 `alert` に紐づく `related_ai_summary.key_points`
  - `related_references`（最大20件）
  - `latest_ai_thesis_summary`
  - `latest_processing_status`
  - 共通形式 `{ data, meta, error }`
  - 不正な `symbolId` は `404 + NOT_FOUND`

### 追加した画面
- `frontend/src/pages/SymbolDetail.tsx`
  - ルート: `/symbols/:symbolId`
  - 表示: 銘柄ヘッダ、最近のアラート、主要なAI論点、関連情報リンク
  - Loading / Error / Empty を個別表示

### 既存導線への接続
- Home (`/`) の最近アラート行に銘柄リンクを追加
- Alert Detail (`/alerts/:alertId`) の銘柄名から銘柄詳細へ遷移可能に変更
- 既存 `GET /api/home` / `GET /api/alerts/:alertId` の契約は維持
