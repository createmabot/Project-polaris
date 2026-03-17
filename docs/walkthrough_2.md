# AI要約基盤 実装ウォークスルー（Sprint 2）

## 参照した docs

| doc | 利用箇所 |
|---|---|
| `docs/0.目次` | 参照対象の特定 |
| `docs/2.北極星 データモデル設計（MVP）` | ai_summaries カラム設計の根拠 |
| `docs/5.北極星 AI要約フロー設計（MVP）` | job_type / status値 / 処理フロー |
| `docs/10.北極星 AI出力 JSON schema 詳細設計（MVP）` | structured_json 共通ラッパー設計 |
| `docs/19.北極星 スプリント計画案（MVP）` | Sprint 2 スコープ確認 |

---

## 変更ファイル一覧

| ファイル | 区分 | 内容 |
|---|---|---|
| [prisma/schema.prisma](file:///g:/Projects/hokkyokusei/backend/prisma/schema.prisma) | MODIFY | AiJob / AiSummary を仕様準拠に更新 |
| [src/ai/adapter.ts](file:///g:/Projects/hokkyokusei/backend/src/ai/adapter.ts) | NEW | AiAdapter interface + MockAiAdapter 実装 |
| [src/ai/context-builder.ts](file:///g:/Projects/hokkyokusei/backend/src/ai/context-builder.ts) | NEW | AlertSummaryContext 構築ロジック |
| [src/queue/index.ts](file:///g:/Projects/hokkyokusei/backend/src/queue/index.ts) | MODIFY | Worker を全面的に本実装化 |
| [src/routes/webhooks.ts](file:///g:/Projects/hokkyokusei/backend/src/routes/webhooks.ts) | MODIFY | jobType / status 初期値の修正 |

---

## Migration

**`20260316182511_ai_summary_schema_update`**

### AiJob の変更
- `jobType` デフォルト: `"summarize_alert"` → `"generate_alert_summary"`
- `status` デフォルト: `"PENDING"` → `"queued"`
- `errorMessage String?` 追加

### AiSummary の追加カラム
- `userId String?`
- `title String?`
- `modelName String?`
- `promptVersion String?`
- `generatedAt DateTime?`
- `generationContextJson Json?`
- `summaryScope` デフォルト: `"alert"` → `"alert_reason"`

---

## ai_job の status 遷移

```
webhook 受信
  └─ ai_job.status = "queued"    ← BullMQ enqueue
       └─ worker 起動
            ├─ ai_job.status = "running"    (startedAt 記録)
            │
            ├─ [SUCCESS] ai_summaries 作成
            │      └─ ai_job.status = "succeeded"  (completedAt 記録)
            │
            └─ [FAILURE] catch
                   └─ ai_job.status = "failed"  (errorMessage 保存)
```

スキップ条件（変更なし）:
- `processingStatus = "unresolved_symbol"` → ai_job 起票なし
- `processingStatus = "needs_review"` → ai_job 起票なし

---

## 保存される ai_summary の実例

```json
{
  "id": "...",
  "summaryScope": "alert_reason",
  "targetEntityType": "alert_event",
  "title": "[Mock] MA25 breakout — トヨタ自動車(7203)",
  "modelName": "mock-v1",
  "promptVersion": "v1.0.0-mock",
  "generatedAt": "2026-03-17T...",
  "inputSnapshotHash": "sha256:...",
  "structuredJson": {
    "schema_name": "alert_reason_summary",
    "schema_version": "1.0",
    "confidence": "low",
    "insufficient_context": true,
    "payload": {
      "what_happened": "MA25 breakout アラートが TSE:7203 で発火した。",
      "fact_points": ["設定されたアラート条件が成立した。", "トリガー価格: 3100"],
      "reason_hypotheses": [{ "text": "外部参照情報が存在しないため...", "confidence": "low", "reference_ids": [] }],
      "watch_points": ["翌営業日の値動きを確認する。"],
      "next_actions": ["関連ニュース・開示情報を確認する。"],
      "reference_ids": []
    }
  }
}
```

---

## 確認した動作

| ケース | 結果 |
|---|---|
| 正常 webhook → ai_job(queued→succeeded) → ai_summary 作成 | ✅ |
| unresolved_symbol → ai_job_id = null | ✅ |
| needs_review (純テキスト) → ai_job_id = null | ✅ |
| 重複 event → duplicate_ignored | ✅ |
| 同一入力への ai_summary 二重作成防止 (inputSnapshotHash) | ✅ |

---

## まだ mock のまま残したもの

| 項目 | 現状 | 次フェーズ |
|---|---|---|
| AI API 呼び出し | [MockAiAdapter](file:///g:/Projects/hokkyokusei/backend/src/ai/adapter.ts#66-140) (50ms スリープ) | OpenAI / Gemini adapter に差し替え |
| `confidence` | 常に `"low"`, `insufficient_context: true` | 実 AI 出力に基づいて変動 |
| `external_references` 参照 | なし | Sprint 2 後半で T-029 実装後に織り込む |
| `userId` | null | alertEvent.userId から伝播 |
| retry 設計 | なし | BullMQ `attempts` オプションで実装予定 |

---

## 次に着手すべきタスク

1. **external_references 収集ジョブ** (T-029) — ✅ 完了
2. **MockAiAdapter → 実 AI adapter** — Gemini/OpenAI adapter に差し替え
3. **GET /api/home** (T-047) — ai_summaries の最新を返すホーム API
4. **ホーム画面 UI** (T-048) — daily summary と最新アラート要約の表示

---

# External References 収集基盤 実装ウォークスルー (Sprint 2, T-029)

## 参照した docs

| doc | 利用箇所 |
|---|---|
| `docs/0.目次` | 参照対象の特定 |
| `docs/2.北極星 データモデル設計（MVP）` | ExternalReference カラム仕様 |
| `docs/5.北極星 AI要約フロー設計（MVP）` | 和影する AI フロー |
| `docs/6.北極星 external references 収集フロー設計（MVP）` | 主要仕様情報源 |
| `docs/3.北極星 API ユースケース単位の入出力設計（MVP）` | 関連 API 確認 |
| `docs/19.北極星 スプリント計画案（MVP）` | Sprint 2 スコープ確認 |

## 変更ファイル一覧

| ファイル | 区分 | 内容 |
|---|---|---|
| [prisma/schema.prisma](file:///g:/Projects/hokkyokusei/backend/prisma/schema.prisma) | MODIFY | ExternalReference モデル追加、Symbol/AlertEvent に relation |
| [src/references/collector.ts](file:///g:/Projects/hokkyokusei/backend/src/references/collector.ts) | **NEW** | [ReferenceCollector](file:///g:/Projects/hokkyokusei/backend/src/references/collector.ts#39-42) interface + [MockReferenceCollector](file:///g:/Projects/hokkyokusei/backend/src/references/collector.ts#67-111) |
| [src/queue/index.ts](file:///g:/Projects/hokkyokusei/backend/src/queue/index.ts) | MODIFY | `collect_references_for_alert` ハンドラ追加、サマリー job へのチェーン |
| [src/ai/adapter.ts](file:///g:/Projects/hokkyokusei/backend/src/ai/adapter.ts) | MODIFY | `referenceIds` / `references` を context に追加、mock 出力を参照情報連動 |
| [src/ai/context-builder.ts](file:///g:/Projects/hokkyokusei/backend/src/ai/context-builder.ts) | MODIFY | ExternalReferences DB 読み迼み、関連度順ソート |
| [src/routes/webhooks.ts](file:///g:/Projects/hokkyokusei/backend/src/routes/webhooks.ts) | MODIFY | トゥージョブパイプライン (collect → summary) |

## Migration

**`add_external_references`**

追加テーブル / カラム:
- `external_references` テーブル 全カラム
- `symbols.externalReferences` relation
- `alert_events.externalReferences` relation

## 収集ジョブの処理フロー

```
webhook 受信
  ├─ ai_job[collect_references_for_alert].status = queued
  └─ ai_job[generate_alert_summary].status = queued
        ↓ BullMQ enqueue
worker: collect_references_for_alert
  ├─ status → running
  ├─ MockReferenceCollector.collectForAlert()
  ├─ ExternalReference 保存 (dedupeKey unique 制約で重複スキップ)
  ├─ status → succeeded
  └─ BullMQ enqueue: process_alert_event
        ↓
worker: process_alert_event
  ├─ status → running
  ├─ buildAlertSummaryContext() ← ExternalReferences 読み込み
  ├─ MockAiAdapter.generateAlertSummary()
  ├─ ai_summaries 保存 (reference_ids を structured_json に埋め込み)
  └─ status → succeeded
```

## dedupe の方法

- `ExternalReference.dedupeKey` カラム (`@unique`) 
- `sourceUrl` あり: `sha256("url:" + sourceUrl)` の先頭 64文字
- `sourceUrl` なし: `sha256(symbolId + ":" + type + ":" + title)` 
- Prisma unique 制約違反 (`P2002`) を catch してスキップ

## AI要約への接続状況

- `structured_json.payload.reference_ids` に `ExternalReference.id` 一覧を埋め込み ✅
- `reason_hypotheses[].reference_ids` に各参照 ID を映している ✅
- 参照なし: `confidence=low`, `insufficient_context=true` ✅
- 参照あり: `confidence=medium`, 参照候補をに `reason_hypotheses` に列挙 ✅

## 確認した動作

| ケース | 結果 |
|---|---|
| webhook → collect job(succeeded) → external_references 保存(2件) | ✅ |
| collect 完了後 → summary job 自動起動 | ✅ |
| ai_summaries に reference_ids が入った structured_json | ✅ |
| unresolved_symbol → 両 job とも起票なし | ✅ |
| 同一 sourceUrl のエントリは重複保存されない | ✅ |

## まだ mock のまま残したもの

| 項目 | 現状 | 次フェーズ |
|---|---|---|
| ニュース収集 | [MockReferenceCollector](file:///g:/Projects/hokkyokusei/backend/src/references/collector.ts#67-111) | 実 NewsAPI / スクレイピング adapter |
| 開示収集 | [MockReferenceCollector](file:///g:/Projects/hokkyokusei/backend/src/references/collector.ts#67-111) | TDnet / EDINET adapter |
| AI 要約 | [MockAiAdapter](file:///g:/Projects/hokkyokusei/backend/src/ai/adapter.ts#66-140) | Gemini / OpenAI adapter |
| 関連度スコア | 固定値 (40/70) | キーワードマッチングロジック |

## 次に着手すべきタスク

1. **`GET /api/symbols/:symbolId/references`** (T-044) — docs/3 §4.3.3 の API 実装
2. **`GET /api/alerts/:alertId`** (T-067) — alert + related_references + related_summary 返却
3. **MockAiAdapter → 実 AI adapter** (Gemini/OpenAI)
4. **シンボル起点収集** (`collect_references_for_symbol`) — Sprint 3 向けai_summaries の最新を返すホーム API
4. **ホーム画面 UI** (T-048) — daily summary と最新アラート要約の表示
