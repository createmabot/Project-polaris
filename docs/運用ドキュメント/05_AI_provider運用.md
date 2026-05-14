# 北極星 AI provider 運用

更新日: 2026-05-13
分類: 運用ドキュメント

## 1. 目的

本資料は、北極星の AI summary / Pine 生成 / comparison summary で利用する provider 境界の運用をまとめる。Backtest AI summary auto-generation phase 1 の route 別確認手順は `docs/運用ドキュメント/08_AI_summary自動生成運用.md`、仕様詳細は `README.md`、`docs/56.北極星 AI summary 自動生成運用設計（次フェーズ）.md`、`docs/仕様書/09_AI_summary_artifact仕様.md` を参照する。

## 2. provider の種類

`HOME_AI_PROVIDER` で次の provider を切り替える。

- `stub`: local / test の deterministic 確認用。
- `local_llm`: 既定 provider。ローカル LLM が利用できる環境で使う。
- `openai_api`: 明示設定時のみ利用する外部 API provider。

`AI_ENABLE_STUB_FALLBACK=false` を既定とし、provider failure は failed job として残す。fallback を有効にする場合は、品質確認ではなく疎通確認として扱う。

## 3. 主な対象

- Home daily summary
- Symbol AI 論点カード
- Alert summary
- Comparison AI 総評
- Backtest AI 総評
- 自然言語から Pine 生成

Backtest AI summary は、CSV import report と internal backtest report で input 文脈が異なる。CSV は TradingView CSV import、internal は internal execution result summary と artifact metadata を主 input として扱う。

## 4. job 状態の見方

`ai_jobs.status` は次を正とする。

- `queued`
- `running`
- `succeeded`
- `failed`

確認時は、job type、target、request payload の trigger、input snapshot hash、error message の sanitized 内容を見る。provider endpoint、API key、raw prompt、local path、stack trace を PR や docs に出さない。

## 5. 自動生成の運用境界

現行の Backtest AI summary auto enqueue は次を対象にする。

- CSV import が `parsed` になり、Backtest report に紐づいた直後。
- succeeded internal backtest execution が新規 Backtest report に変換された直後。

対象外:

- parse failed import
- 既存 report を返す idempotent path
- BacktestDetail 初回表示
- ApplicationDetail report history 表示
- batch / scheduled job

同一 input の succeeded summary、queued / running job、failed job がある場合、自動 enqueue は重複作成や自動 retry をしない。手動生成 endpoint / button は維持する。

## 6. 失敗時の運用

1. UI では短い失敗表示だけを確認する。
2. API response の `status=unavailable` や latest job を確認する。
3. `ai_jobs` の sanitized error を確認する。
4. provider 設定、local LLM 起動状態、fallback 設定を確認する。
5. 同一 input の failed job がある場合、自動 retry ではなく手動生成または別タスクで retry 方針を判断する。

## 7. cost / latency 注意

- `openai_api` は明示設定時のみ使う。
- 自動生成対象を広げる前に cost cap / rate limit / opt-in 条件を設計する。
- page view 起点の生成は過剰 enqueue になりやすいため現行では採用しない。
- polling 本格化、batch retry、scheduled job は後続判断とする。

## 8. 関連 docs

- `README.md`
- `docs/56.北極星 AI summary 自動生成運用設計（次フェーズ）.md`
- `docs/仕様書/09_AI_summary_artifact仕様.md`
- `docs/運用ドキュメント/08_AI_summary自動生成運用.md`
- `docs/運用ドキュメント/04_CSV取込運用.md`
