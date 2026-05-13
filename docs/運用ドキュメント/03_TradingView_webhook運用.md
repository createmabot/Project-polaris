# 北極星 TradingView webhook 運用

更新日: 2026-05-13
分類: 運用ドキュメント

## 1. 目的

本資料は、TradingView から北極星へ webhook を送る運用の入口である。詳細 runbook は `docs/32.北極星 TradingView実送信 webhook運用手順（MVP）.md` を正本とし、本資料では通常運用で確認する順序と注意点をまとめる。

## 2. 役割分担

- TradingView: alert 条件、チャート監視、webhook 送信。
- 北極星: webhook 受信、認証、payload parse、symbol 解決、dedupe、alert event 保存、references 収集、AI summary 生成、Home / SymbolDetail 反映。

## 3. endpoint

- 正式 endpoint: `POST /api/integrations/tradingview/webhook`
- 互換 endpoint: `POST /api/webhooks/tradingview/webhook`

認証 token は query または `Authorization: Bearer` header で送る。実値は docs / PR / log に残さない。

## 4. payload 作成時の注意

- `trigger_price` は number として送る。
- `triggered_at` は TradingView の `{{time}}` を使う。
- `shared_secret` は任意。追加照合が必要な場合のみ使う。
- placeholder 例には `<WEBHOOK_TOKEN>` や `<YOUR_SHARED_SECRET>` を使い、実値を書かない。

代表的な失敗は `trigger_price` を文字列にしてしまうことである。この場合、payload validation で落ち、alert event が作成されない。

## 5. 受信後の確認順

1. `webhook_receipts` で `authResult`、`parseResult`、`symbolResolutionResult`、`dedupeResult`、`alertEventId` を確認する。
2. `alert_events` で `processing_status`、`symbol_id`、`triggered_at`、`received_at` を確認する。
3. `ai_jobs` で `collect_references_for_alert` と `generate_alert_summary` の状態を確認する。
4. `GET /api/alerts/:alertId` と `GET /api/alerts/:alertId/summary` を確認する。
5. Home と SymbolDetail の recent alerts 表示を確認する。

## 6. 失敗時の切り分け

- auth failure: token の設定ミスを疑う。ただし実値は表示・貼り付けしない。
- shared secret mismatch: payload に `shared_secret` を入れた場合のみ確認する。
- missing required fields: 必須 field、型、TradingView placeholder 展開を確認する。
- symbol unresolved: `tradingview_symbol`、`market_code`、`symbol`、DB 登録値の対応を確認する。
- duplicate ignored: dedupe key が同一の再送である可能性を確認する。
- summary failed: `GET /api/alerts/:alertId/summary` の latest job を確認し、provider 生エラーや secret は外部に出さない。

## 7. references の見方

references が 0 件でも alert summary が生成されることがある。品質判断では summary 本文だけでなく、`reference_count`、source breakdown、`insufficient_context`、collector diagnostics を併せて見る。

TDnet disclosure / earnings が 0 件の場合は、`docs/walkthrough.md` の references 供給状況確認と `docs/33.北極星 references供給状況整理と運用課題（MVP）.md` を参照する。

## 8. 関連 docs

- `docs/32.北極星 TradingView実送信 webhook運用手順（MVP）.md`
- `docs/33.北極星 references供給状況整理と運用課題（MVP）.md`
- `docs/walkthrough.md`
- `docs/運用ドキュメント/05_AI_provider運用.md`
