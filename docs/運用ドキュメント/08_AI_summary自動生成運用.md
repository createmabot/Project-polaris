# 北極星 AI summary 自動生成 phase 1 運用 runbook

更新日: 2026-05-15
分類: 運用ドキュメント

## 1. 目的

本資料は、Backtest AI summary auto-generation phase 1 の運用確認手順をまとめる。仕様判断は `docs/仕様書/09_AI_summary_artifact仕様.md` と `docs/56.北極星 AI summary 自動生成運用設計（次フェーズ）.md`、完了整理は `docs/作業進捗管理/07_AI_summary自動生成phase1完了.md` を参照する。

## 2. phase 1 の対象

auto enqueue 対象:

- direct CSV import route で、CSV parse が `parsed` になり Backtest report に紐づいた直後。
- application 起点 CSV import route で、CSV parse が `parsed` になり application report が作成された直後。
- internal backtest report conversion で、succeeded execution から新規 internal_backtest Backtest report が作成された直後。

対象外:

- BacktestDetail 初回表示起点 enqueue。
- ApplicationDetail report history 表示起点 enqueue。
- batch / scheduled enqueue。
- failed job auto retry。
- polling / live update。
- AI summary 同士の比較。
- artifact diff / download。

## 3. 確認する保存先

DB / job:

- `ai_jobs.status`: `queued`、`running`、`succeeded`、`failed`。
- `ai_jobs.requestPayload.trigger`: `csv_import_auto` または `internal_backtest_report_auto`。
- `ai_jobs.requestPayload.input_snapshot_hash`: duplicate guard の確認軸。
- `ai_jobs.requestPayload.source_import_id`: CSV import auto enqueue の識別。
- `ai_jobs.requestPayload.source_internal_backtest_execution_id`: internal backtest report auto enqueue の識別。
- `ai_summaries`: `summary_scope=backtest_review`、`target_entity_type=backtest`、対象 Backtest ID、input snapshot hash。

画面:

- BacktestDetail は生成済み summary を read-only 表示する。
- BacktestDetail が受け取る AI summary 状態は `available` / `unavailable` のみであり、未生成・queued・running・failed は `unavailable` として見える場合がある。
- BacktestDetail は polling / live update を行わない。必要に応じて手動再読み込みで確認する。
- ApplicationDetail は report history の入口であり、report row で AI summary status を表示しない。本文や artifact metadata は BacktestDetail で確認する。

Prisma Studio / log:

- Prisma Studio では `ai_jobs` と `ai_summaries` の target、trigger、status、input snapshot hash を見る。
- log では enqueue された trigger、target Backtest、provider failure / timeout の sanitized message を見る。
- provider endpoint、API key、token、shared secret、raw prompt、local path、stack trace の実値を docs / PR / log に残さない。

## 4. duplicate guard の確認

同一 input snapshot hash に対して次が存在する場合、auto enqueue は新規 job を作らない。

- succeeded summary。
- queued job。
- running job。
- failed job。

route 別の確認:

- direct CSV import route: parsed import 作成直後だけ auto enqueue する。parse failed import では enqueue しない。
- application 起点 CSV import route: application report 作成直後だけ auto enqueue する。parse failed import では enqueue しない。
- internal backtest report conversion 新規作成 path: 新規 Backtest report 作成直後だけ auto enqueue する。
- internal backtest report conversion idempotent path: 既存 report を返す場合は auto enqueue しない。
- guarded conflict path: 競合回避で既存 report を返す場合は auto enqueue しない。

確認時は、同じ input snapshot hash で job / summary が増えていないことを `ai_jobs` / `ai_summaries` で見る。provider を実際に呼ぶ必要がある場合は、secret 実値を出さない設定で実行する。

## 5. direct CSV import 経由の確認手順

1. BacktestDetail または既存 API 操作で CSV import を実行する。
2. import の `parse_status` が `parsed` であることを確認する。
3. Backtest report と `BacktestImport.parsedSummaryJson` が紐づいていることを確認する。
4. `ai_jobs` に `requestPayload.trigger=csv_import_auto` の job が作られることを確認する。
5. `ai_summaries` に Backtest review summary が作られるか、provider failure の場合は `ai_jobs.status=failed` になることを確認する。
6. BacktestDetail を手動再読み込みし、生成済みであれば `available` と本文、未完了または失敗であれば `unavailable` と手動生成導線を確認する。

## 6. application 起点 CSV import 経由の確認手順

1. SymbolDetail / ApplicationDetail の導線から application 起点 CSV import を実行する。
2. application report が作成され、CSV parse が `parsed` であることを確認する。
3. `ai_jobs` に `requestPayload.trigger=csv_import_auto` と `source_import_id` が保存されることを確認する。
4. direct CSV import route と同じ duplicate guard が効くことを確認する。
5. ApplicationDetail では report history と BacktestDetail link を確認し、AI summary 本文や status は BacktestDetail で確認する。

## 7. internal backtest report conversion 経由の確認手順

1. succeeded internal backtest execution を用意する。
2. application 起点の report conversion を実行し、新規 internal_backtest Backtest report が作成されることを確認する。
3. `BacktestImport` が作成されない importless report であることを確認する。
4. `ai_jobs` に `requestPayload.trigger=internal_backtest_report_auto` と `source_internal_backtest_execution_id` が保存されることを確認する。
5. input に `strategySnapshotJson.result_summary`、`artifact_pointer`、`internal_backtest_execution_id` の文脈が含まれることを確認する。
6. report conversion を再実行し、既存 report を返す場合は新しい auto enqueue が発生しないことを確認する。

## 8. NG 系の確認手順

parse failed:

- CSV import が `failed` の場合、import は保存されるが auto enqueue しない。
- 過去 parsed import がある場合でも、auto enqueue は今回の failed import 起点では行わない。

existing report idempotent return:

- internal backtest report conversion が既存 report を返す場合、新しい auto enqueue は行わない。

guarded conflict path:

- concurrent request や guarded update の競合で既存 report を返す場合、新しい auto enqueue は行わない。

duplicate queued / running:

- 同一 input snapshot hash の queued / running job がある場合、新しい auto enqueue は行わない。

duplicate succeeded:

- 同一 input snapshot hash の succeeded summary がある場合、新しい auto enqueue は行わない。

failed job existing:

- 同一 input snapshot hash の failed job がある場合、auto retry は行わない。
- 必要な場合は既存手動生成 / 再生成を使う。

## 9. 失敗時の運用

provider failure / timeout:

- `ai_jobs.status=failed` として扱う。
- CSV import response や report conversion response は、保存済み import / report を優先し、AI summary generation 失敗で壊さない。
- `ai_jobs` の sanitized error、provider 種別、fallback 設定、local LLM 起動状態を確認する。
- provider endpoint、API key、token、raw prompt、local path、stack trace の実値を docs / PR / log に残さない。

UI 上で見せる範囲:

- BacktestDetail は生成済み summary があれば read-only 表示する。
- 未生成・queued・running・failed は `unavailable` として見える場合がある。
- failed の場合も、既存の手動生成 / 再生成導線に進める。
- failed job auto retry、polling、live update、表示起点 enqueue は行わない。

## 10. 関連 docs

- `docs/仕様書/09_AI_summary_artifact仕様.md`
- `docs/56.北極星 AI summary 自動生成運用設計（次フェーズ）.md`
- `docs/運用ドキュメント/09_artifact_metadata_retention運用.md`
- `docs/運用ドキュメント/05_AI_provider運用.md`
- `docs/運用ドキュメント/04_CSV取込運用.md`
- `docs/作業進捗管理/07_AI_summary自動生成phase1完了.md`
- `docs/walkthrough.md`
