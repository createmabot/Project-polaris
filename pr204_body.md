# 疑似送信で direct type が alert summary context / 本文に入ることを記録

- docs/35 に `2148` / `2026-05-01T06:00:00Z` の TradingView payload互換疑似送信結果を追記
- `collect_references_for_alert` の `source_breakdown = { news: 5, disclosure: 2, earnings: 2 }` と direct type の context / summary 反映を記録
- docs/39 / docs/44 を更新し、残課題を「direct type が入るか」から「同条件を実送信側でも再確認する必要があるかの判断」へ変更

## 読んだ docs 一覧
- docs/0.目次.md
- README.md
- docs/walkthrough.md
- docs/32.北極星 TradingView実送信 webhook運用手順（MVP）.md
- docs/33.北極星 references供給状況整理と運用課題（MVP）.md
- docs/35.北極星 実データAI品質確認メモ（MVP）.md
- docs/38.北極星 MVP完了報告（MVP）.md
- docs/39.北極星 MVP後ロードマップ・バックログ整理.md
- docs/44.北極星 MVP後P2完了整理とP3着手判断.md

## 確認した実装ファイル一覧
- backend/src/routes/webhooks.ts
- backend/src/routes/alerts.ts
- backend/src/queue/handlers.ts
- backend/src/references/collector.ts
- backend/src/ai/context-builder.ts
- backend/src/ai/home-ai-service.ts
- frontend/src/pages/Home.tsx
- frontend/src/pages/SymbolDetail.tsx

## 作成・更新したファイル一覧
- docs/35.北極星 実データAI品質確認メモ（MVP）.md
- docs/39.北極星 MVP後ロードマップ・バックログ整理.md
- docs/44.北極星 MVP後P2完了整理とP3着手判断.md

## 実送信ではなく疑似送信であること
- 今回は TradingView からの実送信ではありません
- TradingView payload互換の疑似送信です
- 固定 `triggered_at` を使って `2148` の開示日近傍コンテキストを再現しました

## 対象銘柄と固定 triggered_at
- symbol: `2148`
- tradingview_symbol: `TSE:2148`
- alert_name: `PSEUDO_2148_direct_type_check`
- triggered_at: `2026-05-01T06:00:00Z`
- trigger_price: `1334`

## webhook_receipts / alert_events / ai_jobs 結果
- `webhook_receipts`
  - `authResult: success`
  - `parseResult: success_json`
  - `symbolResolutionResult: success`
  - `dedupeResult: success_inserted`
- `alert_events`
  - `processingStatus: completed`
- `ai_jobs`
  - `collect_references_for_alert: succeeded`
  - `generate_alert_summary: succeeded`

## disclosure / earnings direct type の context 反映結果
- `collect_references_for_alert`
  - `saved_count: 4`
  - `skipped_count: 5`
  - `source_breakdown: { news: 5, disclosure: 2, earnings: 2 }`
- TDnet diagnostics
  - `disclosure.reason: null`
  - `earnings.reason: null`
- alert summary context
  - `referenceCount: 4`
  - `reference_ids` に `disclosure` 2件、`earnings` 2件が入ることを確認

## Alert summary 本文確認結果、または未確認理由
- 本文生成まで確認済み
- `insufficient_context = false`
- content 空 / reasoning のみはなし
- `watch-only signal` として評価しつつ、背景材料として決算短信 / 決算補足説明資料の存在を参照
- direct type が本文に載るケースは確認できた
- ただし、参照しているのは開示タイトルと資料存在レベルで、数値や詳細論点の抽出までは行っていません

## Home / SymbolDetail 反映結果
- current local runtime では `GET /api/home` / `GET /api/symbols/:id` の `recent_alerts` 再確認はできませんでした
- 一方で DB 上は、対象 symbol `2148` の最新 alert として `PSEUDO_2148_direct_type_check` が保存されていることを確認しました
- この PR では、確認できた範囲を context / summary 反映までに限定して docs へ記録しています

## 今回やらなかったこと
- TradingView 実アラートの追加発火待ち
- collector lookback ロジック変更
- prompt 改修
- API shape 変更
- DB 構造変更
- UI 改修
- browser-based E2E 導入

## 実行した build / test
- pnpm --filter backend build
- pnpm --filter frontend build

## secret非露出確認
- token / shared_secret / API key の実値は docs / PR / log に含めていません
- raw webhook URL / raw payload / raw external response 全文も掲載していません
