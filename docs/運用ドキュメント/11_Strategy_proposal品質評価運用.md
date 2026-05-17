# 北極星 Strategy proposal 品質評価運用

更新日: 2026-05-17
分類: 運用ドキュメント

## 1. 目的

本資料は、StrategyLab の strategy proposal を `stub` と `local_llm` で確認するときの品質評価軸、代表シナリオ、手動 runbook、記録テンプレートを整理する。

strategy proposal は投資助言ではなく、ユーザーが backtest と review を行うための検証候補である。投資助言風 wording は一律 reject せず、候補が検証前提として提示されているかを評価する。

PR #359〜#360 で、本 runbook と validation / failure path の自動 test 拡充は完了扱いにする。StrategyLab UI は既存 copy と provider error 表示で十分と判断し、quality evaluation phase では追加 UI 変更を行わない。

PR #365〜#366 で、prompt regression / provider benchmark の design、fixed scenario set、code fixture、optional script、tests は完了扱いにする。PR #372 で provider quality trend aggregation は proposal history 由来の read-only 集計として完了済み。Benchmark result recording workflow は、optional benchmark の sanitized summary record を local file として残す運用として扱う。

PR #368〜#370 で、proposal history / selected proposal lineage の backend persistence / API と StrategyLab minimal UI は完了扱いにする。品質評価では sanitized history と selection 記録を確認できるが、raw prompt / raw response / endpoint / secret / local path は記録しない。

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

## 7. 記録テンプレート

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

## 8. 関連 docs

- `docs/仕様書/11_LLM_Strategy_Proposal仕様.md`
- `docs/運用ドキュメント/05_AI_provider運用.md`
- `docs/作業進捗管理/03_残課題_Backlog.md`
- `docs/作業進捗管理/04_設計判断ログ.md`
