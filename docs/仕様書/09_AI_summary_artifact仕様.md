# 北極星 AI summary / artifact 現行仕様

更新日: 2026-05-15
分類: 仕様書

## 1. 目的

本資料は、Backtest AI summary と artifact metadata の現行仕様を整理する。AI summary auto-generation の運用判断は `docs/56`、phase 1 の運用確認手順は `docs/運用ドキュメント/08_AI_summary自動生成運用.md`、artifact metadata / retention / file access boundary の運用確認は `docs/運用ドキュメント/09_artifact_metadata_retention運用.md`、phase 完了整理は `docs/作業進捗管理/07_AI_summary自動生成phase1完了.md` と `docs/53` を参照する。

Artifact metadata / retention policy phase は、metadata 正本仕様、path 系 metadata 非表示、raw JSON sanitization、ApplicationDetail の artifact path 非表示 note まで完了扱いである。artifact file access phase 1 は既存 internal_backtests engine_actual trades / equity JSON read endpoint に限定し、新規 download / diff / retention job は未実装のまま残す。

## 2. Backtest AI summary

- 状態は `ai_jobs`、生成物は `ai_summaries` を使う。
- Backtest summary は `summary_scope=backtest_review`、`target_entity_type=backtest` を基本とする。
- provider boundary は Home / Symbol / Comparison / Backtest と同じ `HOME_AI_PROVIDER=stub|local_llm|openai_api` を使う。
- `AI_ENABLE_STUB_FALLBACK=false` が既定で、fallback は明示時のみ許可する。
- 手動生成 endpoint / BacktestDetail button は維持する。
- `GET /api/backtests/:backtestId` は `ai_review` に加え、optional read-only field として `latest_ai_summary_job` を返す。値がない場合は `null` または未指定として扱う。
- `latest_ai_summary_job` は最新 `generate_backtest_review_summary` job の `status=queued|running|succeeded|failed`、`trigger`、作成/開始/完了時刻、`duration_ms`、`estimated_cost_usd`、sanitized error summary のみを返す。
- `latest_ai_summary_job` では `requestPayload` 全体、`responsePayload`、raw prompt、provider endpoint、secret、local path、stack trace を返さない。

## 3. auto enqueue 現行範囲

- CSV import report: direct CSV import route と application 起点 CSV import route の `parse_status=parsed` 直後に auto enqueue する。
- internal backtest report: succeeded execution が新規 internal_backtest Backtest report に変換された直後だけ auto enqueue する。
- 既存 report を返す idempotent path、guarded update 競合で既存 report を返す path、display-triggered enqueue、batch / scheduled job は対象外。
- 同一 input snapshot hash の succeeded summary、queued / running job、failed job がある場合は auto enqueue しない。
- failed job の自動 retry は行わず、手動生成に委ねる。
- phase 2 では latest job status visibility を追加したが、failed job auto retry、polling / live update、display-triggered enqueue は実装しない。

phase 1 は PR #319 / #320 / #332 により、CSV import parsed report、application 起点 CSV import、internal backtest report conversion の auto enqueue と read-only visibility 整理まで完了扱いである。route 別の確認手順は `docs/運用ドキュメント/08_AI_summary自動生成運用.md` を参照する。

### 3-1. quality / cost operations boundary

AI summary の quality / cost operations は、自動生成対象を広げる前に運用境界を固定するための設計整理である。

- 現行 auto enqueue は CSV import parsed report と新規 internal backtest report conversion に限定する。
- BacktestDetail / ApplicationDetail の表示、polling、batch、scheduled job を起点に provider call を増やさない。
- failed job は自動 retry せず、既存の手動生成 / 再生成導線で扱う。
- `latest_ai_summary_job` は read-only snapshot であり、live status tracking ではない。
- `openai_api` を拡張する場合は、explicit opt-in、prompt length guard、rate limit、cost cap、retry upper bound を別設計する。
- real provider 依存 test は required check に入れない。
- raw prompt、provider response、endpoint、model 実値、secret、local path、stack trace は API / UI / docs / PR に出さない。

## 4. CSV import report と internal backtest report の違い

| report source | 主 input | BacktestImport | artifact |
|---|---|---|---|
| `csv_import` | `BacktestImport` / parsed summary / comparison diff / TradingView文脈 | 作成する | 基本は CSV import metadata / parsed summary 文脈 |
| `internal_backtest` | `strategySnapshotJson.result_summary` / `artifact_pointer` / `internal_backtest_execution_id` | 作成しない | artifact pointer metadata を表示。file read / download / diff はしない |

AI summary comparison UX phase 2 では、この input 差を明示したうえで保存済み summary を read-only に並べる。CSV import report の summary と internal backtest report の summary は、同じ `backtest_review` でも入力文脈が異なるため、本文や欠損項目を機械的に同一条件として比較しない。

| source | summary input の中心 | 欠損時の扱い |
|---|---|---|
| CSV import report | `BacktestImport.parsedSummaryJson`、parsed metrics、TradingView report 文脈 | artifact pointer がなくても正常。CSV にない metrics は `-` または補足 note で扱う |
| internal backtest report | `strategySnapshotJson.result_summary`、`artifact_pointer` metadata、execution ID | `BacktestImport` がなくても正常。CSV parsed summary 前提の項目は `-` または補足 note で扱う |

## 5. artifact_pointer metadata

`artifact_pointer` は、artifact 本体ではなく、保存済み artifact への参照 metadata である。現行画面では metadata summary と raw JSON を read-only に表示するが、BacktestDetail では artifact file content の読込、download、diff は行わない。

代表 metadata:

- `kind`: artifact の種類。例: internal backtest result。
- `type`: artifact の表現形式。例: json。
- `execution_id`: 関連する internal execution ID。
- `path`: artifact 参照情報。UI / docs / PR では絶対 local path をそのまま出さない。
- `summary_mode`: result summary の生成モード。
- `source`: artifact 作成元の識別。
- `generated_at` または `created_at`: artifact metadata 作成時刻または生成時刻。

UI に表示してよい metadata:

- `kind`
- `type`
- `execution_id`
- `source`
- `summary_mode`
- `generated_at` / `created_at`
- report / execution と紐づく safe な識別子

`path` は内部参照として保存されていても、UI では絶対 local path や file system structure をそのまま表示しない。BacktestDetail の artifact metadata summary では path 系 metadata を非表示または sanitized 表示に限定する。

UI / docs / PR に表示してはいけない metadata:

- absolute local path。
- local filesystem の directory structure。
- secret、token、shared secret、API key。
- provider endpoint。
- raw prompt。
- signed URL や file token の実値。
- stack trace や file system internals。

raw artifact JSON:

- BacktestDetail の raw artifact JSON は、保存済み pointer metadata の確認用である。
- raw artifact JSON は artifact file content ではない。
- raw artifact JSON は JSON diff / file diff の入力ではない。
- raw artifact JSON の表示でも、`path` など file location を推測できる path 系値は非表示または sanitized 表示にする。

artifact_pointer がない場合:

- report に artifact metadata が保存されていない状態を示す。
- CSV import report など、artifact pointer を持たない source では正常な欠損として扱う。
- internal backtest report でも、artifact metadata が未保存または未生成の場合は absence explanation を表示し、file read を試みない。

artifact file が未保存または存在確認できない場合:

- 現行 UI は file existence を保証しない。
- artifact_pointer があっても、artifact file の永続保存、download 可能性、diff 可能性は保証しない。
- file content が必要な場合は、将来の access boundary 設計と実装を待つ。

## 6. retention policy 現在地

現時点では retention job、hard delete、artifact cleanup は未実装である。自動削除される、または削除済みであるように docs / UI で表現しない。

現行仕様として保証すること:

- 保存済み `artifact_pointer` metadata は report / execution の read-only context として扱う。
- BacktestDetail は metadata がある場合に summary / raw JSON を表示できる。
- metadata がない場合は、artifact absence として説明する。

現行仕様として保証しないこと:

- artifact file content の保存。
- artifact file の存在確認。
- artifact file の download。
- artifact file / JSON diff。
- retention period。
- automatic cleanup。
- hard delete。
- restore。

将来 retention を設計する場合の候補単位:

- execution 単位。
- report 単位。
- symbol application 単位。
- provider / artifact source 単位。

retention を実装する場合は、削除対象、metadata の扱い、UI 表示、audit log、復旧可否を同時に固定する。現行フェーズでは実装しない。

## 7. file read / download boundary

現行の artifact file access は、internal_backtests の `engine_actual` trades / equity JSON を返す既存 read-only endpoint に限定する。新規 download endpoint、file token、signed URL、backend proxy の本格実装は見送る。

phase 1 で維持する範囲:

- execution ID を入口にする。
- succeeded execution を前提にする。
- stored artifact existence を前提にする。
- artifact path suffix は既知 endpoint に対応する whitelist のみ許可する。
- response は read-only JSON として扱う。

境界:

- frontend に raw path、local path、absolute path を渡さない。
- UI link は execution ID と既知 route から導く。
- arbitrary route、path traversal、local path leakage を避ける。
- BacktestDetail には download 導線を追加せず、metadata 表示に留める。
- 詳細 artifact file access は StrategyVersionDetail / existing internal_backtests route の範囲に限定する。

将来 download API を作る場合の候補:

- backend proxy 経由で file content を返す。
- 短命 signed URL を発行する。
- file token を発行し、raw path を隠蔽する。

将来実装時の必須境界:

- path traversal 対策。
- frontend へ raw path を渡さない。
- access control。
- file token / signed URL の短命化。
- audit log。
- log sanitization。
- secret / token / local path の redaction。
- artifact source ごとの許可範囲。

## 8. artifact diff boundary

artifact diff / JSON diff は後続判断であり、現行仕様では実装しない。

比較の違い:

- metrics diff: report summary の数値指標を比較する。現行の comparison helper / saved comparison で扱う範囲。
- JSON diff: saved metadata や structured JSON の key / value 差分を比較する候補。現時点では未実装。
- file diff: artifact file content 同士を比較する候補。file access boundary が未実装のため対象外。

report comparison UX との関係:

- BacktestComparisonDetail は保存済み pairwise comparison の再訪画面である。
- 将来 artifact diff / JSON diff を扱う候補画面ではあるが、現時点では artifact diff 画面ではない。
- AI summary 同士の比較、artifact diff、metrics normalization、comparison entity 拡張は別判断にする。

## 8-1. AI summary comparison boundary

AI summary comparison UX phase 2 は、同一 application 内の current / related Backtest report に紐づく既存 AI summary を、BacktestDetail で read-only に並べて理解する補助に限定する。

phase 2 で扱うこと:

- 保存済み AI summary の有無と状態を current / related report ごとに表示する。
- `available` summary は本文を read-only に表示する。
- `unavailable`、missing、failed、stale は read-only status / note として表示する。
- 必要な場合は既存 manual generate 導線に進める。
- CSV import report と internal backtest report の input 差を説明する。

phase 2 で扱わないこと:

- provider を呼び出して AI summary 同士の比較文を自動生成すること。
- missing / failed / stale を画面表示起点で再生成すること。
- polling / live update による状態追跡。
- comparison entity の追加または拡張。
- metrics normalization table。
- artifact diff、JSON diff、file diff。
- BacktestComparisonDetail の本格 AI summary comparison 画面化。

## 9. 画面責務

- BacktestDetail: 個別 report detail、AI summary、artifact metadata summary、path 系値を非表示化した raw JSON、absence explanation、同一 application 内の current / related AI summary comparison helper を担当する。
- BacktestDetail: `latest_ai_summary_job` がある場合は最新 job status を read-only に表示する。これは手動再読み込み時点の snapshot であり、polling / live update ではない。
- ApplicationDetail: report history の入口。AI summary / artifact 詳細と詳細比較は BacktestDetail へ送り、report row に artifact path、summary 本文、job status は表示しない。
- BacktestComparisonDetail: 保存済み pairwise comparison の再訪画面。AI summary 同士の自動比較、本格 AI summary comparison、artifact diff は後続判断。
- SymbolDetail: latest report / application 入口を担当し、artifact 詳細は持たせない。

## 10. 後続判断

- display-triggered enqueue。
- batch / scheduled enqueue。
- polling 本格化。
- AI summary 同士の比較。
- 本格 AI summary comparison UX。
- artifact file access の本格化。
- artifact download。
- artifact diff / JSON diff。
- artifact retention job / cleanup。
- artifact metadata schema の拡張。
- provider cost control の本格化。
