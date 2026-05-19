# 北極星 Strategy proposal 品質評価運用

更新日: 2026-05-18
分類: 運用ドキュメント

## 1. 目的

本資料は、StrategyLab の strategy proposal を `stub` と `local_llm` で確認するときの品質評価軸、代表シナリオ、手動 runbook、記録テンプレートを整理する。

strategy proposal は投資助言ではなく、ユーザーが backtest と review を行うための検証候補である。投資助言風 wording は一律 reject せず、候補が検証前提として提示されているかを評価する。

PR #359〜#360 で、本 runbook と validation / failure path の自動 test 拡充は完了扱いにする。StrategyLab UI は既存 copy と provider error 表示で十分と判断し、quality evaluation phase では追加 UI 変更を行わない。

PR #365〜#366 で、prompt regression / provider benchmark の design、fixed scenario set、code fixture、optional script、tests は完了扱いにする。PR #372 で provider quality trend aggregation は proposal history 由来の read-only 集計として完了済み。Benchmark result recording workflow は、optional benchmark の sanitized summary record を local file として残す運用として扱う。

PR #368〜#370 で、proposal history / selected proposal lineage の backend persistence / API と StrategyLab minimal UI は完了扱いにする。品質評価では sanitized history と selection 記録を確認できるが、raw prompt / raw response / endpoint / secret / local path は記録しない。

Proposal history full management では、StrategyLab の履歴 section から provider / status / selected / search / pagination で保存済み run を探せる。これは provider 品質や selection lineage を確認するための read-only 管理導線であり、archive / hard delete / retention job / export は後続判断とする。

## 2. 前提

- `STRATEGY_PROPOSAL_PROVIDER=stub|local_llm` を利用できる。
- 未指定 default は `stub`。
- `local_llm` は明示 opt-in の provider であり、実体依存 test は required check に入れない。
- `local_llm` failure、timeout、malformed JSON、invalid schema は proposal section の provider error として扱う。
- silent stub fallback は現時点で行わない。
- Web search / deep research、auto Pine generation、auto save は未実装。Proposal history は sanitized generation run / candidates / selected candidate の最小保存まで実装済み。

## 3. 評価軸

自動検査しやすい項目:

- schema validity: `strategy_proposal_candidates` schema に合うこと。
- candidate count: request の `proposal_count` と最大 10 件の境界を守ること。0 candidates は EmptyState 用の成功応答として扱う。
- enum validity: `strategy_type`、`pine_feasibility`、`confidence`、`source_type` が仕様値に収まること。
- required fields: title、summary、entry / exit / risk、backtest cautions、uncertainty、suggested natural language spec が欠落しないこと。
- invalid JSON / schema invalid response rate: provider ごとに malformed JSON、schema invalid、candidate count invalid の頻度を見ること。
- provider failure rate: unavailable、timeout、generic provider error の頻度を見ること。
- latency / timeout: 代表シナリオごとの応答時間と timeout 発生を記録すること。

手動評価が必要な項目:

- candidate diversity / strategy_type diversity: 似た候補だけに偏らず、strategy_type や entry idea に差があること。
- user_hint alignment: user_hint の条件を反映しつつ、過剰な断定や無関係な候補へ逸れないこと。
- market / timeframe assumption clarity: market と timeframe の前提が候補内で明示されていること。
- entry / exit logic clarity: entry と exit が実装・検証できる粒度で説明されていること。
- risk management quality: position size、stop、drawdown、volatility などのリスク観点が含まれること。
- invalidation condition clarity: どの条件で仮説が崩れるかが読めること。
- Pine feasibility: Pine 化しやすい指標・条件に落ちているか、低 feasibility の理由が妥当かを見ること。
- backtest caution quality: 過剰最適化、期間依存、出来高、slippage、手数料、regime change などの注意があること。
- uncertainty / limitations: 最新情報なし、Web search なし、銘柄固有材料未確認などの限界が書かれていること。
- 検証候補として提示されているか: 売買推奨、利益保証、検証不要と読めないこと。
- hallucination / stale / unsupported claim risk: 外部検索していないのに最新ニュース、決算、固有ファンダメンタルを参照したように見せていないこと。

stub と local_llm の比較観点:

- stub は deterministic baseline として schema、UI表示、empty candidates、選択導線を確認する。
- local_llm は diversity、user_hint alignment、logic clarity、risk / caution quality、latency、invalid response rate を stub と比較する。
- local_llm が stub より多様でも、unsupported claim や曖昧な Pine 条件が増える場合は品質課題として記録する。
- provider 差分は品質評価であり、silent fallback の成功として扱わない。

## 4. 評価シナリオ / fixtures

最小シナリオ:

- 入力なし / generic: market と timeframe の default 前提だけで候補が出ること。
- JP stock: 日本株を想定した市場前提が明示されること。
- US stock: 米国株を想定した市場前提が明示されること。
- short swing: 短期 swing の entry / exit / risk が具体化されること。
- long trend following: 長期 trend following の継続条件と exit が明確であること。
- mean reversion: 反転条件、過熱判定、損切り条件が明確であること。
- breakout: breakout 判定、だまし対策、出来高や volatility の扱いがあること。
- volatility: volatility regime、stop width、position size の扱いがあること。
- high risk / conservative risk: risk preference に合わせて risk management が変わること。
- concrete user_hint: 具体条件を反映し、無関係な候補に逸れないこと。
- vague user_hint: 曖昧さを uncertainty に残し、勝手な事実を補わないこと。
- long user_hint: 長文 bounding 後も安全に処理され、raw input を log / UI に出さないこと。
- investment-advice-like wording を含む case: wording だけで reject せず、売買推奨ではなく検証候補として扱うこと。

benchmark scenario set:

| scenario id | 入力方針 | 主な確認観点 |
|---|---|---|
| `generic_default` | 入力なしに近い proposal。market / timeframe は default。 | schema validity、candidate_count、diversity、uncertainty、unsupported claim risk。 |
| `jp_stock_daily` | 日本株向け。`market=JP_STOCK`, `timeframe=D`。 | market assumption、entry / exit、backtest caution、freshness を主張しないこと。 |
| `us_stock_daily` | 米国株向け。`market=US_STOCK`, `timeframe=D`。 | market assumption、unsupported claim risk、provider 間の安定性。 |
| `short_swing` | 短期 swing を user_hint で指定。 | timeframe clarity、entry / exit、risk、Pine feasibility。 |
| `long_trend_following` | 長期 trend following を指定。 | strategy_type diversity、継続条件、exit、invalidation。 |
| `mean_reversion` | mean reversion を指定。 | 反転条件、過熱判定、stop、backtest caution。 |
| `breakout` | breakout を指定。 | だまし対策、volume / volatility、invalidation。 |
| `volatility` | volatility regime を指定。 | position size、stop width、uncertainty。 |
| `conservative_risk` | conservative risk を指定。 | risk management quality、candidate aggressiveness。 |
| `aggressive_risk` | aggressive risk を指定。 | risk と overfitting caution の両立。 |
| `concrete_user_hint` | 指標・閾値を含む具体 user_hint。 | user_hint alignment、Pine feasibility、余計な条件の混入。 |
| `vague_user_hint` | 曖昧な user_hint。 | uncertainty、勝手な事実補完をしないこと。 |
| `long_user_hint` | 長文 user_hint。 | length bounding、raw input 非表示、alignment。 |
| `advice_like_wording` | 投資助言風 wording を含む user_hint。 | wording だけで reject しないこと、検証候補として提示すること。 |

各 scenario で見る共通項目:

- schema validity。
- candidate count / strategy_type diversity。
- user_hint alignment。
- market / timeframe assumption。
- entry / exit logic。
- risk management。
- invalidation condition。
- Pine feasibility。
- backtest caution。
- uncertainty / limitations。
- hallucination / stale / unsupported claim risk。
- latency / provider failure / invalid JSON / schema invalid。

fixture 作成時の注意:

- 実在の secret、endpoint、model 実値、local path を記録しない。
- 投資助言風 wording を含む case は拒否確認ではなく、検証候補として disclaimer / caution / uncertainty が保たれるかを確認する。
- Web search / deep research が未実装のため、最新ニュースや外部 citation を期待しない。

## 5. manual runbook

### 5-1. provider 設定

stub baseline:

- `STRATEGY_PROPOSAL_PROVIDER` を未指定、または `stub` にする。
- deterministic baseline として schema、candidate count、UI表示、候補選択を確認する。

local_llm opt-in:

- `STRATEGY_PROPOSAL_PROVIDER` を `local_llm` にする。
- 必要に応じて proposal 専用の endpoint / model / timeout / max output env を設定する。
- 使用する env 名は `STRATEGY_PROPOSAL_LOCAL_LLM_ENDPOINT`、`STRATEGY_PROPOSAL_LOCAL_LLM_MODEL`、`STRATEGY_PROPOSAL_LOCAL_LLM_TIMEOUT_MS`、`STRATEGY_PROPOSAL_LOCAL_LLM_MAX_OUTPUT_CHARS`。
- env の実値、provider endpoint、model 実値は docs、PR、評価記録、UI screenshot に残さない。

### 5-2. 実行方法

optional benchmark script:

- `pnpm --filter backend strategy-proposal:benchmark` で env に依存しない `stub` default の sanitized summary を stdout に出す。
- `pnpm --filter backend strategy-proposal:benchmark -- --provider=stub --scenario=generic_default` のように provider / scenario を絞れる。
- `--output=<file>.json` を指定した場合だけ、gitignore 済みの benchmark record directory 配下へ sanitized summary record を出力する。
- deterministic smoke や test では `--fixed-generated-at=<iso>` で record timestamp を固定できる。
- `--provider=local_llm` は manual optional。local_llm 実体依存 benchmark は required check に入れない。
- script output は raw prompt、raw response、endpoint、model 実値、secret、local path、stack trace、user_hint 全文、candidate 自由文本文を出さない。
- summary は scenario id、provider observation 相当の status / latency bucket / candidate_count / invalid_reason、candidate の strategy_type / confidence / pine_feasibility / caution count / uncertainty count に限定する。
- stdout や output file を docs にそのまま貼らない。残す場合は下記テンプレートか sanitized summary record の count / bucket だけを要約する。

UI manual check:

1. StrategyLab を開く。
2. provider ごとに代表シナリオを入力する。
3. proposal count は基本 5 件で確認し、境界確認時だけ 1 件、10 件、0 candidates になり得る条件を確認する。
4. 候補が表示されたら、少なくとも 5 件または返却された全件を読む。
5. 1 件を選択し、title / natural language spec 反映が既存導線を壊さないことを確認する。
6. Pine generation は自動起動しないことを確認し、必要な場合だけ手動 button で既存導線を確認する。

### 5-3. schema valid / invalid の見方

- UI に候補が表示される場合、schema validation を通った response として扱う。
- malformed JSON、invalid schema、candidate count invalid、provider unavailable、timeout は generic provider failure として proposal section に閉じる。
- API response に `provider_observation` がある場合は、status、latency bucket、candidate_count、invalid_reason、schema_valid を確認する。model 実値、endpoint、raw prompt、raw response は metadata に含めない。
- error 表示や logs に raw prompt、raw response、endpoint、model 実値、secret、local path、stack trace が出ていないことを確認する。
- 0 candidates は provider failure ではなく EmptyState として扱う。

local_llm の `provider status: invalid_response / reason: schema_invalid / latency: slow` を確認した場合:

1. real local_llm 実体依存の問題として扱い、required test に入れない。
2. StrategyLab の UI では sanitized provider status / reason / latency だけを確認する。raw response、endpoint、model 実値、stack trace は残さない。
3. backend 側では mock / fake response tests で、code fence 付き JSON、前後説明文付き JSON、root metadata 欠落、array field の string 返却、enum 表記揺れ、重要 field 欠落を切り分ける。
4. local_llm prompt は JSON object のみ、英語 key 固定、ユーザー向け string value は日本語、array field は配列、`source_type=web` 不使用、投資助言ではなく検証候補という前提を要求する。
5. 実装側は軽量 normalization だけを行う。root metadata 補完、string array の配列化、enum の snake_case 化、`invalidation_condition` alias 補正、空 `research_basis` の `provider_knowledge` 補完に限定する。JSON 抽出では root object / root array、nested object / array、string、escape sequence を同時に扱う。
6. title / summary / entry / exit / risk / suggested natural language spec などの重要本文が欠けている場合は、候補内容を勝手に生成せず provider invalid response として扱う。
7. 再現調査で benchmark script を使う場合も、`--provider=local_llm` は manual optional に留め、stdout / record に raw prompt、raw response、user_hint 全文、candidate 自由文本文を残さない。

local_llm の `provider status: invalid_response / reason: required_field_missing / latency: slow` を確認した場合:

1. JSON extraction と parse は進んでおり、candidate の必須 field が欠けている状態として扱う。
2. API response または proposal history の `provider_observation` に `missing_required_fields`、`missing_required_field_count`、`affected_candidate_count` がある場合は、field 名だけを確認する。field value、candidate本文、raw response は確認対象にしない。
3. 現行実装は common alias normalization と非中核 metadata fallback を行う。`entry` / `exit` / `riskManagement` / `strengths` / `weaknesses` / `indicators` / `natural_language_spec` などは exact key に寄せる。
4. `backtest_cautions`、`uncertainty`、`suggested_pine_constraints` は検証前提を示す固定 fallback を補える。`title`、`summary`、`strategy_type`、`entry_logic`、`exit_logic`、`risk_management`、`suggested_natural_language_spec` は backend が内容を生成して補完しない。
5. 欠落が残る場合は local_llm のみ最大 1 回 bounded retry を行う。retry prompt には missing field names と affected candidate count だけを渡し、raw provider response は渡さない。
6. retry 後も失敗する場合は sanitized failure として扱い、`retry_used` / `retry_succeeded` / missing field diagnostics だけを記録する。
7. model tuning や prompt regression automation は後続判断とし、real local_llm 実体依存の再現確認は required check に入れない。

manual browser smoke:

1. local LLM process が起動していることを確認する。
2. `STRATEGY_PROPOSAL_PROVIDER=local_llm` と proposal 専用の endpoint / model / timeout / max output 設定を local env に置く。実値を docs、PR、screenshot、log へ残さない。
3. backend / frontend dev process を再起動する。
4. StrategyLab を開き、proposal count 5 で `ストラテジーを提案` を実行する。
5. 成功時は candidate cards、provider note `succeeded`、最近の提案、provider quality trend が壊れていないことを確認する。
6. 失敗時は sanitized provider status / reason / latency だけを記録し、raw response は保存しない。

### 5-4. 手動評価の見方

- diversity: strategy_type と entry idea が重複しすぎていないかを見る。
- user_hint alignment: concrete / vague / long user_hint の条件や曖昧さが候補に反映されているかを見る。
- Pine feasibility: 条件が Pine で表現できる指標・閾値・比較に落ちるかを見る。
- risk: stop、position size、drawdown、volatility、time stop などが検討されているかを見る。
- backtest caution: slippage、手数料、sample period、regime change、overfitting の注意があるかを見る。
- investment-advice-like wording: wording だけで reject しない一方、売買推奨や利益保証ではなく検証候補として読めるかを見る。

### 5-5. latency / timeout / invalid response の記録

記録するもの:

- provider: `stub` または `local_llm`。
- scenario id。
- requested candidate count。
- returned candidate count。
- status: success / empty / provider_error / validation_error。
- latency bucket: fast / acceptable / slow / timeout。
- invalid response category: malformed_json / schema_invalid / candidate_count_invalid / unavailable / timeout / none。
- manual score memo: diversity、alignment、risk、Pine feasibility、backtest caution、unsupported claim risk。

記録しないもの:

- raw prompt。
- raw response。
- provider endpoint 実値。
- model 実値。
- credential、secret、token。
- local path。
- stack trace。
- user_hint の全文。必要な場合は scenario 名と要約だけを残す。

### 5-6. 現時点で確認できる UI / API 観点

現行の StrategyLab proposal flow は、response metadata、最小 UI note、proposal history DB で provider observation を確認できる。最小スコープとして `StrategyProposalRun` / `StrategyProposalCandidate` への proposal history 永続化と sanitized `providerObservationJson` の保存は実装済みのため、品質評価では raw prompt / raw response を残さず、UI / API / DB に保存された sanitized metadata の範囲で記録する。

- UI で候補一覧、EmptyState、generic provider failure、validation error のどれになったかを見る。
- API response が success / empty / provider_error / validation_error のどれに見えるかを記録する。
- `provider_observation.status`、`latency_bucket`、`candidate_count`、`invalid_reason`、`schema_valid` を記録する。metadata がない古い response では手動観測で補う。
- provider unavailable や timeout は local_llm の運用課題として記録し、stub fallback 成功に読み替えない。
- local_llm 実体依存の結果は required check ではなく manual observation として扱う。
- raw prompt、raw response、endpoint、model 実値、secret、local path、stack trace は評価記録へ転記しない。

後続候補:

- 現行 run metadata を超える event log 永続化。
- export / benchmark records。
- filter / pagination / search / retention / full management。
- StrategyVersion relation。
- openai_api。
- Web search / deep research。
- auto Pine / save。
- cost / rate guard との連携。
- fallback metadata の opt-in 拡張。

instrumentation / cost guard の現行:

- `POST /api/strategy-lab/proposals` の optional metadata として `provider_observation` を返す。
- metadata は provider name、selected_by、elapsed_ms / latency bucket、status、candidate_count、invalid_reason、validation_error_count、fallback_used / fallback_reason、schema_valid、model category を持つ。
- `StrategyProposalRun` は run-level metadata と sanitized `providerObservationJson` を保存し、`StrategyProposalCandidate` は proposal candidate の最小履歴を保存する。
- request started at の raw timestamp は response に出さず、必要な場合も sanitized logs に限定する。
- model name は実値を出さず、configured / default / unknown などの category にする。
- prompt 全文、raw response、endpoint、secret、token、local path は記録しない。
- CI は mock / fake response で metadata 分類を検査し、local_llm 実体依存 test は required check に入れない。
- local_llm の latency / timeout は manual runbook で観測し、openai_api / Web search / deep research は別フェーズで cost / job 化を判断する。

### 5-7. provider quality trend aggregation の確認

Provider quality trend aggregation は、保存済み proposal history と sanitized `provider_observation` から provider 品質傾向を read-only に確認するための補助機能である。StrategyLab の「最近の提案」内に compact note として表示し、詳細な運用確認は API response を見る。

確認 endpoint:

```bash
GET /api/strategy-lab/proposals/provider-quality-trend?limit=50
```

確認する観点:

- `summary.total_runs`、`succeeded_runs`、`failed_runs`、`success_rate`。
- `summary.selected_runs`、`selected_rate`。これは候補が使われた比率であり、投資成果や candidate quality の保証ではない。
- `summary.zero_candidate_runs`。0 candidates は failure ではなく、succeeded run with zero candidates として扱う場合がある。
- `by_provider[].status_counts` と `invalid_reason_counts`。
- `by_provider[].avg_elapsed_ms` と `latency_buckets`。
- `candidate_distribution.strategy_type_counts` / `confidence_counts` / `pine_feasibility_counts`。
- `recent_failures` の provider / status / invalid_reason / latency_bucket。
- `meta.sanitized=true`、`raw_prompt_included=false`、`raw_response_included=false`。

trend response に含めてはいけないもの:

- user_hint 全文。
- raw prompt。
- raw provider response。
- provider endpoint。
- model 実値。
- secret / token / credential。
- local path。
- stack trace。
- candidate title / summary / suggested_natural_language_spec。

運用上の読み方:

- `stub` は deterministic baseline として、schema / UI / selection lineage の回帰確認に使う。
- `local_llm` は opt-in provider として、timeout / invalid_response / candidate_count / latency を見る。
- success rate は provider 運用品質の指標であり、提案の投資有効性を示さない。
- selected rate は StrategyLab input へ反映された比率であり、Strategy / StrategyVersion 保存や Pine generation 実行を意味しない。
- real local_llm 実体依存の評価は manual / optional とし、required check には入れない。
- trend aggregation は recent runs の read-only 集計であり、benchmark result persistence や provider event log persistence ではない。

## 6. benchmark result recording workflow

Benchmark result recording は、manual optional benchmark の結果を raw output ではなく sanitized summary record として local に残す運用である。Provider quality trend aggregation は proposal history に基づく read-only 集計であり、benchmark result recording は optional benchmark の一時記録である。初回では DB 永続化しない。

### 6-1. 出力手順

stub の単一 scenario を local record として出す例:

```bash
pnpm --filter backend strategy-proposal:benchmark -- --provider=stub --scenario=generic_default --output=generic_default.json
```

固定時刻で deterministic smoke を行う例:

```bash
pnpm --filter backend strategy-proposal:benchmark -- --provider=stub --scenario=generic_default --fixed-generated-at=2026-05-17T00:00:00.000Z --output=generic_default.json
```

運用ルール:

- `--output` は repository 内の gitignore 済み benchmark record directory 配下へ出力する。
- output path は relative `.json` file のみ許可する。
- actual benchmark record は commit しない。
- local_llm 実体依存 benchmark は manual optional に留め、required check や CI required workflow に入れない。
- pnpm の wrapper output には実行環境の path が出る場合があるため、そのまま docs / PR に貼らない。

### 6-2. sanitized summary record の見方

record で見る項目:

- `source.required_check=false`。
- `source.provider_real_dependency`: real provider 依存かどうか。
- `run.provider` / `provider_category` / `provider_mode`。
- `run.status` / `invalid_reason` / `schema_valid`。
- `run.latency_bucket` / `elapsed_ms_bucket`。
- `candidate_summary.strategy_type_counts`。
- `candidate_summary.confidence_counts`。
- `candidate_summary.pine_feasibility_counts`。
- `candidate_summary.backtest_caution_count` / `uncertainty_count`。
- `quality_notes.manual_review_required=true`。
- `safety.*_included=false`。

record に含めないもの:

- raw prompt。
- raw provider response。
- provider endpoint。
- model 実値。
- secret / token / credential。
- local path。
- stack trace。
- user_hint 全文。
- candidate title / summary / suggested_natural_language_spec。
- entry_logic / exit_logic / risk_management / research_basis URL などの candidate 自由文本文。

### 6-3. provider quality trend aggregation との使い分け

- provider quality trend aggregation: 保存済み proposal history から provider 品質傾向を read-only に集計する。StrategyLab compact note と API で確認する。
- benchmark result recording: optional benchmark の実行結果を sanitized summary record として local に残す。実測 record は commit しない。
- 初回では両者を DB 上で統合しない。
- 将来 DB 永続化する場合は、BenchmarkResult 相当の model、retention、prompt versioning、comparison、cost / rate guard との関係を別 PR で設計する。


## 7. provider guard 確認

Strategy proposal provider guard は、品質評価や benchmark を実行する前に、連打・長時間応答・過大 output・retry の境界が期待どおり動くかを確認するための運用項目である。

確認観点:

- `stub` が default provider のままになっていること。
- `local_llm` は `STRATEGY_PROPOSAL_PROVIDER=local_llm` の明示 opt-in でだけ使うこと。
- proposal_count は最大 10 件に制限され、通常 UI は 5 件を要求すること。
- `local_llm` の timeout / max output は env で調整できるが、backend 側の guard 上限に丸められること。重い local model や長文 context model を manual smoke する場合だけ、`STRATEGY_PROPOSAL_LOCAL_LLM_TIMEOUT_PROFILE=long_context` を明示して timeout 上限を広げる。
- timeout profile を変えた後は backend dev process を再起動し、UI では sanitized `provider status` / `reason` / `latency` のみを見る。endpoint / model 実値や raw response は記録しない。
- `required_field_missing` が続く場合は、保存済み proposal history の sanitized `missing_required_fields` / count / affected candidate count を見る。raw response や candidate 自由文は確認・保存しない。
- qwen 系などが candidate を `proposal` / `strategy` wrapper 内に返す場合や、`name` / `description` / `type` などの alias を使う場合は、backend が safe normalization で exact schema key に寄せる。core strategy logic の本文を backend が新規生成して補完することはしない。
- candidate card に表示される title / summary / logic / caution / suggested spec は日本語であることを確認する。schema key、enum、`source_type` は英語固定値のままでよい。
- `required_field_missing` retry は最大 1 回であり、raw response を retry prompt に入れないこと。
- 短時間に proposal を連続実行した場合、rate guard が 429 / `RATE_LIMITED` を返し、proposal history に blocked run を保存しないこと。
- UI は rate limited を短い再試行案内として表示し、provider endpoint / model 実値 / raw diagnostics は表示しないこと。

manual / optional 評価時の扱い:

- local_llm 実体依存の smoke / benchmark は required check に入れない。
- rate guard を一時的に無効化して比較する場合は local のみで行い、docs / PR に実測 endpoint や model 実値を残さない。
- provider quality trend は実利用履歴の read-only 集計、benchmark recording は optional benchmark の一時 record として分ける。
- guard hardening は投資助言品質の評価ではなく、provider 利用の費用・遅延・失敗境界の確認である。

## 7-1. Codex CLI manual JSON import 確認

Codex CLI manual JSON import は、real provider benchmark ではなく、ユーザーが手動で生成した JSON を北極星へ取り込む workflow として評価する。品質評価では、Codex CLI の実行そのものではなく、import JSON が schema に合うこと、複数候補を取り込めること、raw output を保存しないこと、selection が既存 StrategyLab flow を壊さないことを見る。

manual smoke:

1. StrategyLab を開く。
2. Codex CLI 用 prompt を作成する。
3. 日本語で作成された prompt を手動で Codex CLI に渡す。schema key / enum は英語固定、candidate title / summary / logic / caution / suggested spec などユーザーに見える値は日本語で出ることを確認する。
4. 返ってきた `strategy_proposal_candidates` JSON を StrategyLab に貼り付ける。
5. import を実行する。
6. candidate cards が表示されることを確認する。
7. recent proposal history に `codex_cli_manual` の run が表示されることを確認する。
8. provider quality trend が壊れないことを確認する。
9. 候補を選び、title / natural language spec に反映されることを確認する。
10. Pine generation / save / backtest / AI summary が自動起動しないことを確認する。

validation failure の見方:

- malformed JSON は JSON 形式不正として扱う。
- schema metadata 不一致、`candidates` 不在、candidate count 10 件超過は import failure として扱う。
- required field missing、unsupported enum、`source_type=web` は既存 provider response validation と同じ境界で扱う。
- UI / API error は sanitized reason だけを見る。raw JSON text、candidate free text、raw prompt は error に含めない。

記録しないもの:

- raw Codex output。
- Codex CLI に渡した raw prompt。
- provider endpoint。
- model 実値。
- secret / token / credential。
- local path。
- stack trace。
- actual Codex CLI output をそのまま貼った docs / fixture。

## 7-2. proposal history full management の確認

Proposal history full management は、保存済み `StrategyProposalRun` / `StrategyProposalCandidate` から、検証候補の生成履歴と選択履歴を探すための運用導線である。投資判断や自動 ranking ではなく、provider 別の傾向、failed run、selected candidate の確認に使う。

確認手順:

1. StrategyLab の提案履歴 section を開く。
2. provider filter で `stub` / `local_llm` / `codex_cli_manual` を切り替え、該当 provider の run だけが表示されることを確認する。
3. status filter で succeeded / failed を切り替え、failed run の sanitized status / reason を確認する。
4. selected filter で選択済み / 未選択を切り替え、selected candidate の有無を確認する。
5. search は run id / provider / input metadata など、DB query に pushdown できる範囲を対象にする。metadata search は大文字 / 小文字差で取りこぼさないように扱う。candidate title / summary / suggested natural language spec の自由文検索は、full-table / full-candidate read を避けるため後続候補とする。
6. pagination の前後移動で detail / selection flow が壊れないことを確認する。
7. detail から候補を選択した場合も、title / natural language spec への反映だけで、Pine generation / save / backtest / AI summary は自動起動しない。
8. list response では raw prompt、raw provider response、raw Codex output、endpoint、model 実値、secret、local path、stack trace、user_hint 全文、candidate 自由文本文を出さない。

履歴が増えた場合の archive / retention / hard delete / export は別設計とする。特に hard delete は、selected proposal lineage や将来の StrategyVersion relation と衝突する可能性があるため、初回 full management では実装しない。

## 7-3. sanitized provider event log の確認

Sanitized provider event log は、provider / manual import の発生事象を確認するための運用観測である。Proposal history は候補と selection lineage、provider quality trend は history からの read-only 集計、benchmark record は optional benchmark の local summary として扱い、event log は failure / retry / rate limit の発生確認に使う。

確認観点:

- proposal generation が success / failed / rate_limited のどれになったか。
- local_llm の timeout / schema_invalid / required_field_missing がどの程度発生しているか。
- `required_field_missing` retry が attempted / succeeded / failed のどれか。
- Codex CLI manual import が success / failed / rate_limited のどれか。
- proposal run が作成された event は `proposal_run_id` で history と紐づくこと。
- rate limited event は run がないため `proposal_run_id=null` で残ること。

品質評価での使い方:

- event log は provider 運用品質の切り分けに使う。
- 投資判断、candidate ranking、候補採用判断には使わない。
- provider quality trend を event log based にするかは後続判断とし、初回は history based trend を維持する。

event log に残してよいもの:

- event type / provider / status / invalid reason。
- latency bucket / elapsed ms bucket。
- candidate count / validation error count。
- retry metadata。
- rate limited metadata。
- manual import flag。
- missing required field count などの sanitized count。

event log に残してはいけないもの:

- raw prompt。
- raw provider response。
- raw Codex output。
- endpoint / model 実値。
- secret / token / credential。
- local path。
- stack trace。
- user_hint 全文。
- candidate title / summary / suggested_natural_language_spec / entry_logic / exit_logic / risk_management などの自由文本文。

## 8. 記録テンプレート

評価結果は当面、`docs/作業進捗管理/03_残課題_Backlog.md` の prompt regression / provider quality benchmark records 後続項目に要約する。まとまった比較を残す場合は、別 PR で作業進捗管理配下に日付付きの小さな評価記録を追加する。actual benchmark record は commit しない。

prompt regression / provider benchmark の記録方針:

- 実測 raw output は原則 commit しない。必要な場合も raw prompt / raw response / endpoint / model 実値 / secret / local path を含めない。
- docs に残すのは、scenario id、provider、provider_observation の sanitized summary、manual score memo、follow-up の要約に限定する。
- ignored local output は `--output` で作る。CI artifact や DB 永続化は初回対象外。
- provider benchmark は provider 間比較、prompt regression は同一 provider / 同一 scenario の変更前後比較として分けて記録する。
- future `openai_api` / Web search / deep research を比較する場合も、cost / citation / freshness は raw output ではなく sanitized summary として扱う。

記録テンプレート:

```text
Date:
Provider: stub | local_llm
Scenario:
Requested candidates:
Returned candidates:
Status: success | empty | provider_error | validation_error
Latency bucket: fast | acceptable | slow | timeout
Invalid response category: none | malformed_json | schema_invalid | candidate_count_invalid | unavailable | timeout
Diversity:
User hint alignment:
Market / timeframe assumption clarity:
Entry / exit clarity:
Risk management:
Invalidation conditions:
Pine feasibility:
Backtest caution:
Uncertainty / limitations:
Unsupported claim risk:
Notes without raw prompt / raw response / endpoint / model / secret / local path:
Follow-up:
```

## 9. 関連 docs

- `docs/仕様書/11_LLM_Strategy_Proposal仕様.md`
- `docs/運用ドキュメント/05_AI_provider運用.md`
- `docs/作業進捗管理/03_残課題_Backlog.md`
- `docs/作業進捗管理/04_設計判断ログ.md`
