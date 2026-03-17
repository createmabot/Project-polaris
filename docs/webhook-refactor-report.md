# Webhook 基盤リファクタリング完了報告

指示に基づき、データモデル設計および webhook 受信仕様（MVP）を正本として、バックエンド基盤の大幅な改修を行いました。

## 1. 変更したファイル一覧
- `backend/prisma/schema.prisma` (データモデルの大幅修正)
- `backend/prisma/seed.ts` (Symbolダミーデータを仕様準拠・拡充)
- `backend/src/index.ts` (BullMQワーカー起動、エラーハンドラ登録、互換route登録)
- `backend/src/routes/webhooks.ts` (Zod validation変更, webhook_receipts追加, dedupeロジック変更)
- `backend/src/queue/index.ts` [新規] (BullMQ キューと最小ワーカー基盤)
- `backend/src/utils/response.ts` [新規] (リクエストID付きの共通エラー・成功フォーマッタ)
- `backend/src/redis.ts` (BullMQ互換オプション追加)
- `fixtures/tradingview-webhook.json` (External Payload v1 準拠のサンプルに修正)
- `docs/webhook.md` (仕様準拠の記載に修正)

## 2. migration の一覧
- `init` (前回作成)
- `align_mvp_specs` (今回適用: WebhookReceiptの追加、AlertEventの再定義、汎用AiJobへの変更)
  *※ カラム変更に伴うデータの整合性担保のため、一度DBをリセット(reset --force)した上で適用しました。*

## 3. 追加/変更したテーブルと主要カラム
- **[NEW] `webhook_receipts`**
  - `provider`, `requestHeadersJson`, `rawBodyText`, `authResult`, `parseResult`, `dedupeResult`, `alertEventId`
- **[MODIFY] `alert_events`**
  - `userId`, `symbolId` (nullable化), `sourceType`, `alertType`, `alertName`, `timeframe`, `triggerPrice`, `triggerPayloadJson`, `dedupeKey` (ハッシュ一意), `processingStatus`
- **[MODIFY] `symbols`**
  - `tradingviewSymbol`, `marketCode`, `symbolCode`, `displayName` (解決精度向上のため)
- **[MODIFY] `ai_jobs`, `ai_summaries`**
  - `alertEventId` 依存を廃止し、`targetEntityType`, `targetEntityId` による汎用設計に変更

## 4. webhook の正式仕様
- **Endpoint**: `POST /api/integrations/tradingview/webhook` (※ `/api/webhooks/tradingview` も互換用として稼働)
- **認証方式**: 
  - メイン: URL Query パラメータ `?token=<your-token>`
  - 互換: Header `Authorization: Bearer <your-token>`
- **Content-Type**: `application/json` および `text/plain` 双方に対応
- **必須Payload (External Payload v1)**:
  `alert_name`, `alert_type`, `timeframe`, `triggered_at`, およびシンボル解決用の中核項目（`tradingview_symbol` または `symbol` / `market_code`）
- **共通レスポンス形式**:
  - 成功例: `{"data": {"accepted": true, "status": "received"}, "meta": {"request_id": "xxx-yyy"}, "error": null}`
  - エラー例: `{"data": null, "meta": {"request_id": "xxx-yyy"}, "error": {"code": "EXTERNAL_PAYLOAD_INVALID", ...}}`

## 5. docs を正として実装を直した箇所
1. バリデーション仕様: `eventId` 必須を撤廃し、`alert_name` などの組み合わせから自前で安定した `dedupeKey` ハッシュを生成して重複排除を行うようにしました。
2. 監査対応: 受信直後にまず `webhook_receipts` に生データを保存する仕様へ変更しました。
3. シンボル未解決時の挙動: 400エラーにせず、`processing_status = 'unresolved_symbol'` として一旦 `alert_events` に受け入れる仕様としました。
4. エラーレスポンス: metaレイヤ（`request_id`等）と dataレイヤを分離する共通レスポンス構造に寄せました。
5. Queue基盤: Redis を利用する `BullMQ` を導入し、受信直後にバックグラウンドで状態遷移（`queued_for_enrichment`）をシミュレートする最小の Worker ロジックを構成しました。

## 6. 例外的に実装を正として docs 補正対象にした箇所
特筆すべき変更はありませんが、DBの安全なマイグレーション進行という観点から、「段階的な導入」としての表現を `webhook.md` 等に残しています。

## 7. まだ未実装として残したもの
- **AI 要約の本体連携**: OpenAIやGeminiを呼び出す実体ロジックは Mock Worker を構築したのみで、結合はしていません。
- **Slack などの外部通知連携**: Job は Completed となりますが実際の通知配信基盤はありません。
- **シンボル解決の高度化**: 表記の揺れや、DB非存在時の動的補完などの複雑な解決ロジックまでは網羅していません（今はDB登録一致のみ）。

## 8. 現時点で Sprint 1 のどこまで達成したか
Sprint 1 のチェックリストのうち、「**1. バックエンド基盤構築（DB移行、API基盤）**」と「**2. Webhook受信・保存（TradingView通信疎通）**」が MVP 設計書類の定義に準拠する形で**完全に完了**しています。（重複排除、安定処理、Queueの最低基盤も構築済）

## 9. 次に着手すべき最優先タスク
1. **AI 要約基盤（AI Jobs / LLM）の実装**
   - BullMQ の Worker を起点として、保存された `alert_events` を LLM (Gemini 等) に流し込み、サマリを生成して `ai_summaries` に保存するプロセス。
2. もしくは、**フロントエンド（Dashboard / ホーム画面）の実装**
   - データベースに正常に溜まり始めた `alert_events` デモデータを閲覧できる簡単な画面の実装に着手することも可能です。
