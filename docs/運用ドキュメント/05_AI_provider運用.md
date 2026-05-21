# 北極星 AI provider 運用

更新日: 2026-05-18
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
- LLM strategy proposal

Backtest AI summary は、CSV import report と internal backtest report で input 文脈が異なる。CSV は TradingView CSV import、internal は internal execution result summary と artifact metadata を主 input として扱う。

LLM strategy proposal は、投資助言ではなく StrategyLab で検証候補を作るための補助として扱う。現行は deterministic `stub` を default とし、`STRATEGY_PROPOSAL_PROVIDER=local_llm` の明示設定時だけ local_llm provider を使える。Proposal history は sanitized run / candidate / selection の最小 backend persistence まで実装済み。Web search / deep research、citation 保存、provider cost cap の本格実装は後続判断とする。

Strategy proposal provider expansion では、まず provider boundary を docs 上で固定する。`local_llm` / `openai_api` を使う場合も、proposal は StrategyLab の一時候補生成に限定し、Strategy / StrategyVersion 保存、Pine generation、backtest、AI summary を自動起動しない。

Codex CLI manual JSON import は AI provider ではなく、ユーザーが手動で外部生成した `strategy_proposal_candidates` JSON の取り込み workflow として扱う。backend は Codex CLI を起動せず、`openai_api` provider とも扱わない。取り込んだ JSON は既存 schema validation を通し、success 時だけ normalized candidates と sanitized provider observation を proposal history に保存する。raw Codex output、Codex CLI に渡した raw prompt、provider endpoint、model 実値、secret、local path、stack trace は保存・表示しない。

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

## 7-1. LLM strategy proposal provider 運用境界

現行:

- `POST /api/strategy-lab/proposals` はユーザー操作起点の同期 API として扱う。
- provider boundary は実装済みで、`STRATEGY_PROPOSAL_PROVIDER=stub|local_llm` を選択できる。未指定 default は deterministic `stub`。DB 保存は sanitized proposal history の最小範囲に限定し、job 化は行わない。
- route 層で request validation と response validation を行い、invalid provider output は generic failure として扱う。
- Web search / deep research は行わない。`source_type=web` は将来予約であり、現行 response では citation / freshness を主張しない。

provider expansion 時の必須条件:

- request validation は route 層で行う。`proposal_count` は 1〜10、risk / strategy type enum は仕様書の値に限定する。
- `user_hint` は request parsing 境界で安全な長さに丸める。投資助言風 wording を含んでも request validation では reject しない。type validation と length bounding は維持する。
- provider response は `strategy_proposal_candidates` schema に正規化し、未知 enum、schema / type / format 不正、必須項目欠落、candidate count 不正、Web search 未実装時の web research basis は invalid output として扱う。投資助言風 wording だけでは provider invalid にしない。0 candidates は UI の EmptyState で扱えるため、provider failure とは分ける。
- timeout を必ず設定し、timeout / invalid output / provider failure は proposal section の generic failure に閉じる。
- provider endpoint、raw prompt、raw response、stack trace、credential、local path は response / UI / docs / PR に出さない。
- fallback は silent に行わない。stub fallback を有効にする場合は opt-in とし、provider metadata と UI 文言で分かるようにする。
- 有料 provider は明示 opt-in、rate limit、cost cap、prompt length guard の設計後に広げる。
- 画面表示、typing、polling、batch、scheduled job を契機に proposal を自動生成しない。
- proposal は投資助言ではなく検証候補であり、backtest と user review を前提にする。安全のために検証候補を狭めすぎず、利益保証、売買推奨、検証不要と読める表現は UI / docs の disclaimer と運用確認で抑制する。

local_llm provider 運用:

- proposal 専用 provider selector は `STRATEGY_PROPOSAL_PROVIDER=stub|local_llm` とし、未指定 default は `stub` とする。
- local_llm endpoint / model / timeout / max output は proposal 専用設定で分離する。実値は docs / PR / UI / response に出さない。
- local_llm は StrategyLab の一時 proposal candidates を返すだけで、Strategy / StrategyVersion 保存、Pine generation、backtest、AI summary を起動しない。
- local_llm response は既存 `strategy_proposal_candidates` schema に正規化し、UI に出す前に既存 request / provider response validation を必ず通す。
- local_llm request では JSON mode 相当を利用できる場合は利用し、prompt で JSON object のみ、英語 key 固定、array field は配列、`source_type=web` 不使用を要求する。
- local_llm response は `message.content` から取り出し、code fence や前後説明文が混ざる軽微な出力は最初の JSON object / array を抽出して処理する。raw response は保存・表示・通常 log に出さない。
- schema_invalid / required_field_missing 低減のため、root metadata 補完、string array の配列化、enum 表記揺れの snake_case 化、common alias normalization など機械的で安全な normalization だけを行う。重要本文の欠落は backend が生成して補わず、local_llm では missing field names だけを使った最大 1 回の bounded retry に留める。
- timeout、provider unavailable、malformed JSON、schema / type / format 不正、必須項目欠落、candidate count 不正、Web search 未実装時の web research basis は provider error として扱う。
- local_llm は silent stub fallback を行わない。必要になった場合のみ、後続で opt-in fallback と fallback metadata を設計する。
- provider endpoint、raw prompt、raw response、stack trace、credential、local path は response / UI / docs / PR に出さない。
- Proposal history は sanitized generation run / candidates / selected candidate の最小保存と StrategyLab の recent UI までに限定する。filter、pagination、search、retention UI、full history management、StrategyVersion created-from-proposal relation は後続候補として残す。
- `openai_api`、Web search / deep research、request-time provider selection、auto Pine generation / auto save は後続候補として残す。

## 7-2. LLM strategy proposal quality evaluation

Strategy proposal quality evaluation は、required check ではなく manual runbook として扱う。`stub` は deterministic baseline、`local_llm` は明示 opt-in の比較対象であり、local_llm 実体依存 test は required check に入れない。

確認観点:

- schema validity、candidate count、required fields、enum validity は自動検査しやすい項目として見る。
- diversity、user_hint alignment、market / timeframe assumption、entry / exit、risk management、invalidation condition、Pine feasibility、backtest caution、uncertainty、unsupported claim risk は手動評価する。
- 投資助言風 wording は一律 reject しない。proposal が売買推奨ではなく、backtest / user review 前提の検証候補として提示されているかを見る。
- latency、timeout、invalid JSON、schema invalid、provider unavailable は provider ごとに記録する。
- 現行 StrategyLab proposal flow は `provider_observation`、proposal history、provider quality trend、sanitized provider event log で観測する。quality evaluation では UI / API から観測できる success / empty / provider_error / validation_error と latency bucket を確認し、低レイヤーの failure / retry / rate limit は provider event log で確認する。
- 評価記録には raw prompt、raw response、endpoint、model 実値、credential、local path、stack trace を残さない。

詳細手順と記録テンプレートは `docs/運用ドキュメント/11_Strategy_proposal品質評価運用.md` を参照する。

## 7-3. LLM strategy proposal instrumentation / cost guard

現行 instrumentation は、`POST /api/strategy-lab/proposals` の optional `provider_observation` metadata、proposal history の sanitized DB 保存、provider quality trend aggregation の read-only 集計、sanitized provider event log persistence で扱う。job 化、benchmark result DB persistence、provider quality trend materialization は行わない。

記録してよい sanitized metadata:

- provider name: `stub` / `local_llm`。
- selected_by: `env` / `config` / `default`。
- elapsed_ms または latency bucket。
- status: succeeded / validation_failed / provider_unavailable / timeout / invalid_response / provider_error。
- candidate_count。
- invalid_reason。
- validation_error_count。
- schema_valid。
- fallback_used / fallback_reason。
- model category: configured / default / unknown。

response / UI:

- success response は `data.provider_observation` に返す。
- provider error response は返す場合でも `error.details.provider_observation` の sanitized enum / count / bucket に限定する。
- StrategyLab は provider status、latency、fallback、schema の最小 note と、provider error / timeout が分かる短い error note だけを表示する。
- StrategyLab の「最近の提案」内に provider quality trend の compact note を表示する。これは sanitized history からの運用品質集計であり、候補ランキングや投資判断ではない。
- `GET /api/strategy-lab/proposals/provider-quality-trend` は recent runs を read-only 集計し、summary / provider 別 count / candidate distribution / recent failures を返す。

記録しないもの:

- raw prompt。
- raw response。
- provider endpoint。
- model 実値。
- secret、token、credential。
- local path。
- stack trace。
- user_hint 全文。
- candidate title / summary / suggested_natural_language_spec。
- raw `inputJson` / raw `candidateJson` / raw `providerObservationJson` 全体。

運用方針:

- raw request started at timestamp は client response に出さず、必要な場合も sanitized logs に限定する。
- model は実値ではなく configured / default / unknown などの category で扱う。
- UI 表示は最小 provider note に留める。
- local_llm は latency / timeout / max output を主な guard とする。
- openai_api を導入する場合は、明示 opt-in、max candidates、max output、rate limit、cost cap、prompt length guard、retry なしまたは bounded retry を先に固定する。
- request-time provider selection は cost / abuse / consistency の観点から、別設計を経て導入判断する。
- Web search / deep research は同期 API ではなく job 化候補として扱う。
- CI は mock / fake response で metadata 分類を検査し、real local_llm endpoint 依存 test は required check に入れない。
- provider quality trend aggregation は既存 history の read-only 集計として完了済み。sanitized provider event log persistence は低レイヤー event 保存として完了済み。DB materialization、event-log based trend upgrade、p50 / p95 は後続判断とする。


### 7-3-1. Strategy proposal provider guard hardening

Strategy proposal provider guard hardening 後の運用境界:

- `STRATEGY_PROPOSAL_PROVIDER` 未指定時は `stub`。`local_llm` は明示 opt-in のみ。
- `STRATEGY_PROPOSAL_LOCAL_LLM_TIMEOUT_PROFILE` は default / long_context を扱う。default は通常の local model 向け、long_context は重い local model や長文 context model の manual smoke 向けの明示 opt-in。
- `STRATEGY_PROPOSAL_LOCAL_LLM_TIMEOUT_MS` と `STRATEGY_PROPOSAL_LOCAL_LLM_MAX_OUTPUT_CHARS` は backend 側で下限・上限に丸める。timeout の上限は profile により変わる。極端な値を設定しても raw 設定値は response / UI / docs に出さない。
- UI に `provider status: timeout / reason: timeout / latency: timeout` が出る場合は、local LLM process の起動状況、provider 専用 timeout profile、timeout、max output を確認し、必要なら long_context profile を local env で明示して backend を再起動する。endpoint / model 実値は docs、PR、screenshot、log に残さない。
- `local_llm` の retry は `required_field_missing` に対する最大 1 回だけ。retry prompt は missing field names だけを使い、raw response は含めない。
- `POST /api/strategy-lab/proposals` は in-memory per-process rate guard を持つ。上限超過時は 429 / `RATE_LIMITED` とし、proposal history は保存しない。
- rate guard は accidental load と連打抑止が目的であり、multi-process 環境の厳密な abuse prevention ではない。
- rate guard key は user id が使える場合は user、trusted forwarded IP opt-in 時のみ forwarded client IP、それ以外は request IP を使う。default では forwarded header を信頼しない。
- reverse proxy / tunnel 配下で全利用者が同じ bucket になる場合のみ、proxy が forwarded header を上書きまたは制御していることを確認してから strategy proposal 用の forwarded IP opt-in を有効にする。opt-in 時も valid IPv4 / IPv6 として検証できない先頭値は request IP に fallback する。actual IP や forwarded header value は response / UI / docs / PR に残さない。
- 429 時の UI は短い再試行案内に留め、limit / window / provider 設定の実値をユーザー向けに強調しない。
- silent stub fallback は引き続き行わない。fallback が必要になった場合は explicit opt-in と metadata 表示を別 PR で設計する。

future provider の前提:

- `openai_api` provider は未実装。実装前に explicit opt-in、prompt length guard、max candidates、max output、rate limit、cost cap、retry policy を固定する。
- Web search / deep research は同期 proposal API ではなく job 化候補とし、citation / freshness / timeout / cancellation / cost を別設計する。
- request-time provider selection は今回対象外であり、cost / abuse / consistency を別途設計してから判断する。

### 7-3-2. Strategy proposal provider event log 運用

Sanitized provider event log は、provider call / manual import / retry / rate limit / validation failure の発生を低レイヤーの運用観測として残す。Proposal history は生成された候補と selection lineage、provider quality trend は history からの集計、benchmark record は manual optional benchmark の local summary であり、event log はこれらと責務を分ける。

確認対象:

- proposal generation success / failure。
- local_llm timeout / schema_invalid / required_field_missing。
- bounded retry attempted / succeeded / failed。
- proposal generation rate limited。
- Codex CLI manual import success / failure / rate limited。

event で見る値:

- event type。
- provider name / mode / selected_by。
- status / invalid reason。
- latency bucket / rounded elapsed ms。
- candidate count / validation error count。
- retry used / reason / succeeded。
- rate limited flag / rate limit key source。
- manual import flag。
- sanitized metadata の count / enum / bucket。

event に残してはいけない値:

- raw prompt。
- raw provider response。
- raw Codex output。
- provider endpoint。
- model 実値。
- secret / token / credential。
- local path。
- stack trace。
- user_hint 全文。
- candidate title / summary / suggested_natural_language_spec / entry_logic / exit_logic / risk_management などの自由文本文。
- actual IP / forwarded header value / internal rate-limit key。

運用方針:

- event log は投資判断や candidate ranking には使わない。
- read API を使う場合も sanitized event summary と pagination / filter のみを見る。
- event write が失敗しても、proposal generation / manual import 本体を不要に失敗させない。実装では sanitized warning に留め、raw error object や stack trace を response / UI / docs / PR に出さない。
- rate limited event は proposal run が存在しないため、`proposal_run_id` なしの event として扱う。
- provider quality trend を event log based に拡張する場合は後続設計とし、初回では history based trend を維持する。

## 7-4. LLM strategy proposal benchmark 運用境界

Strategy proposal prompt regression / provider benchmark は、required check ではなく manual / optional 運用として扱う。

PR #365 の benchmark design / fixed scenario set と PR #366 の code fixture / optional benchmark script / tests をもって、benchmark phase は完了扱いにする。DB / Prisma schema は変更していない。

対象:

- `stub`: deterministic baseline。
- `local_llm`: opt-in provider。
- future `openai_api`: cost / rate guard 固定後の候補。
- future Web search / deep research: 同期 API ではなく job 化候補。

運用方針:

- automated validation は schema、candidate count、required fields、enum、malformed JSON、timeout / unavailable 分類を mock / fake response で確認する。
- manual / optional benchmark は real provider の latency、invalid response、candidate diversity、user_hint alignment、Pine feasibility、unsupported claim risk を見る。
- `provider_observation` の status、latency_bucket、candidate_count、invalid_reason、validation_error_count、schema_valid、fallback_used を記録する。
- 投資助言風 wording は wording だけで reject しない。benchmark では、検証候補として提示され、backtest / user review 前提が維持されているかを見る。
- 実測 raw output は原則 commit しない。必要な場合は sanitized summary のみを progress docs に残す。
- optional script / fixture / package script として `pnpm --filter backend strategy-proposal:benchmark` を追加済み。script default は env に依存しない `stub` とし、required check には入れず、real provider は manual optional とする。
- output は raw prompt、raw response、provider endpoint、model 実値、secret、token、credential、local path、stack trace、user_hint 全文、candidate 自由文本文を出さない。
- `--output=<file>.json` 指定時だけ、gitignore 済み benchmark record directory 配下へ sanitized summary record を出力する。actual benchmark record は commit しない。
- sanitized summary record は provider / scenario / status / latency bucket / candidate count / enum distribution / safety flags に限定し、candidate title / summary / suggested natural language spec は含めない。

残課題:

- benchmark result DB table / prompt regression automation。
- `openai_api` provider。
- Web search / deep research job 化。
- StrategyVersion created-from-proposal relation。
- proposal history archive / retention / hard delete / export。
- provider event log based quality trend upgrade。
- prompt regression automation。
- auto Pine / auto save は引き続き out of scope。

## 7-5. LLM strategy proposal history / lineage 運用境界

Proposal history / selected proposal lineage は、PR #368 の design、PR #369 の backend persistence / API、PR #370 の StrategyLab minimal UI をもって最小範囲を実装済み。provider 運用の原則は維持する。

保存してよいもの:

- request parameters。
- bounded / sanitized user_hint。
- normalized candidate JSON。
- selected candidate id / selected_at。
- sanitized provider metadata。
- sanitized `provider_observation`。

保存しないもの:

- raw prompt。
- raw provider response。
- provider endpoint。
- model 実値。
- secret、token、credential。
- local path。
- stack trace。

failure の扱い:

- local_llm timeout / unavailable / malformed JSON / invalid schema は、sanitized failed run として残す。
- 0 candidates は failure ではなく succeeded run with zero candidates として扱う。
- request validation error は履歴保存対象外にする。

運用方針:

- history は provider quality と user selection lineage の補助であり、投資判断や automatic ranking には使わない。
- real local_llm 実体依存 test は required check に入れない。
- history UI は StrategyLab の compact proposal history management として扱う。provider / status / selected / search / pagination / archived filter で保存済み run を探せる。
- soft archive は proposal run を削除せず通常一覧から隠すだけの状態である。archived run も detail 確認と candidate selection は可能で、selection しても自動 unarchive はしない。
- provider event log は archive しない。event log は運用観測ログであり、proposal run の archive と独立して保持する。
- retention job / hard delete / export / materialized trend aggregation は後続判断とする。
- selection は StrategyLab input 反映の記録であり、Strategy / StrategyVersion 保存、Pine generation、backtest、AI summary を起動しない。

後続候補:

- StrategyVersion created-from-proposal relation。
- proposal history retention / hard delete / export。
- provider quality trend の range / filter / percentile / materialized aggregation。
- provider event log based quality trend upgrade。
- proposal history export / benchmark records。
- `openai_api` provider。
- Web search / deep research job。
- auto Pine generation / auto save。

## 7-6. Codex CLI manual JSON import 運用境界

Codex CLI manual JSON import は、StrategyLab から Codex CLI 用 prompt を作成し、ユーザーが手動で Codex CLI に渡した結果 JSON を StrategyLab に貼り付ける運用である。

運用手順:

1. StrategyLab で market / timeframe / risk preference / strategy type bias / proposal count / user hint を確認する。
2. Codex CLI 用 prompt を作成する。Codex CLI 側で手動 Web 検索を使える環境では、必要に応じて Web検索付き prompt option を有効にする。
3. 日本語で作成された prompt を手動で Codex CLI に渡す。schema key / enum は英語固定、candidate title / summary / logic / caution / suggested spec などユーザーに見える値は日本語で出す前提とする。
4. Codex CLI が返した `strategy_proposal_candidates` JSON object を StrategyLab に貼り付ける。file を使う場合も frontend が text として読み取る。
5. import を実行し、candidate cards と recent history を確認する。
6. 使用する候補を選択し、title / natural language spec へ反映する。
7. Pine generation / save / backtest は必要な場合だけ既存 button から手動で行う。

運用上の注意:

- Codex CLI は backend から自動実行しない。
- Web検索付き prompt option は prompt 文面の切替だけである。北極星 backend は Web 検索を実行せず、import 時にも Web 検索済みかどうかを識別しない。
- `source_type=web`、URL validation、citation 保存、Web source badge、`web_research_used` flag は使わない。
- Codex CLI の raw output を docs、PR、log、screenshot、DB に残さない。
- Codex CLI manual import は provider cost を発生させないが proposal history に write するため、import endpoint は既存 strategy proposal rate guard で抑止する。429 / `RATE_LIMITED` の場合は少し時間をおいて再実行し、blocked import では proposal run / candidate rows が保存されないことを確認する。
- prompt 作成 endpoint は DB write を行わない軽量 endpoint として扱う。将来 abuse が問題になる場合は同じ key resolver での guard 対象化を別途判断する。
- import error の切り分けでは sanitized reason だけを見る。
- actual Codex CLI output を test fixture や benchmark record として commit しない。
- real Codex CLI 依存 test は required check に入れない。
- `codex_cli_manual` は provider quality trend に provider name として現れるが、外部 API provider の latency / cost 品質を示すものではない。

## 7-7. AI quality / cost operations 次期方針

AI summary auto enqueue、BacktestDetail の latest job status visibility、Strategy proposal の `provider_observation` / provider quality trend / sanitized provider event log が入った現在地では、次の焦点は「AI をさらに自動化すること」ではなく、どこで止めるかを明確にすることである。

完了済みとして扱うもの:

- AI summary は CSV import parsed report、application 起点 CSV import parsed report、新規 internal backtest report conversion 直後の auto enqueue と duplicate guard まで完了している。
- BacktestDetail は latest AI summary job status を read-only に表示する。polling / live update ではなく、手動再読み込み時点の snapshot として扱う。
- Strategy proposal は `stub` default、`local_llm` opt-in、Codex CLI manual import、provider cost / rate guard、provider event log、provider quality trend、optional benchmark sanitized record まで完了している。
- Strategy proposal の rate guard は in-memory per-process の accidental load / 連打抑止であり、distributed hard guard ではない。
- provider failure は AI summary では failed job、Strategy proposal では sanitized failed run / provider event として扱う。

維持する方針:

- `stub` は deterministic / local / test baseline とする。
- `local_llm` は明示 opt-in の運用 provider とし、real local_llm 依存 test は required check に入れない。
- future `openai_api` は明示 opt-in、prompt length guard、rate limit、cost cap、retry policy を設計してから判断する。
- provider failure や failed job は自動 retry せず、既存の手動生成 / 再生成導線で再試行する。
- BacktestDetail 表示、ApplicationDetail 表示、page view、polling、typing、batch、scheduled job を起点に provider call を増やさない。
- proposal selection は title / natural language spec 反映に留め、Pine generation、Strategy / StrategyVersion 保存、backtest、AI summary を自動実行しない。
- raw prompt、raw provider response、raw Codex output、endpoint、model 実値、secret、token、credential、local path、stack trace は DB / API / UI / docs / PR / logs に出さない。

継続見送り:

- `openai_api` provider 実装。
- Web search / deep research job。
- Codex CLI local worker / backend automatic spawn。
- AI summary failed job auto retry。
- polling / live status update。
- batch / scheduled AI summary generation。
- provider billing。
- distributed rate limit / hard cost cap / per-user billing。
- provider quality trend materialized aggregation、p50 / p95 / percentile dashboard。
- request-time provider selection。

実装前に追加設計が必要なもの:

- `openai_api` provider の provider selection、secret handling、cost cap、prompt length guard、retry upper bound。
- scheduled / batch AI summary の trigger、duplicate guard、停止条件、cost control。
- polling / live update の interval、回数、停止条件、UI 表示密度。
- provider event log based quality trend upgrade。現行 event log は運用観測用であり、history based trend の代替ではない。
- benchmark result DB table。現行 benchmark record は optional local sanitized file であり、DB 永続化は retention / comparison / prompt versioning を別設計する。
- Web search / deep research job の citation、freshness、timeout、cancel、cost、source retention。
- request-time provider selection の abuse prevention、consistency、cost visibility。

小さく実装してよい候補:

- docs / runbook の更新。
- sanitized provider event read API の確認手順拡充。
- optional benchmark の fake / stub scenario 追加。
- real provider を required check にしない範囲の mock / fake validation test 追加。

## 8. 関連 docs

- `README.md`
- `docs/56.北極星 AI summary 自動生成運用設計（次フェーズ）.md`
- `docs/仕様書/09_AI_summary_artifact仕様.md`
- `docs/仕様書/11_LLM_Strategy_Proposal仕様.md`
- `docs/運用ドキュメント/11_Strategy_proposal品質評価運用.md`
- `docs/運用ドキュメント/08_AI_summary自動生成運用.md`
- `docs/運用ドキュメント/04_CSV取込運用.md`
