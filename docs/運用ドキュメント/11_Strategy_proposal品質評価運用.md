# 北極星 Strategy proposal 品質評価運用

更新日: 2026-05-17
分類: 運用ドキュメント

## 1. 目的

本資料は、StrategyLab の strategy proposal を `stub` と `local_llm` で確認するときの品質評価軸、代表シナリオ、手動 runbook、記録テンプレートを整理する。

strategy proposal は投資助言ではなく、ユーザーが backtest と review を行うための検証候補である。投資助言風 wording は一律 reject せず、候補が検証前提として提示されているかを評価する。

PR #359〜#360 で、本 runbook と validation / failure path の自動 test 拡充は完了扱いにする。StrategyLab UI は既存 copy と provider error 表示で十分と判断し、quality evaluation phase では追加 UI 変更を行わない。

## 2. 前提

- `STRATEGY_PROPOSAL_PROVIDER=stub|local_llm` を利用できる。
- 未指定 default は `stub`。
- `local_llm` は明示 opt-in の provider であり、実体依存 test は required check に入れない。
- `local_llm` failure、timeout、malformed JSON、invalid schema は proposal section の provider error として扱う。
- silent stub fallback は現時点で行わない。
- Web search / deep research、proposal history、auto Pine generation、auto save は未実装。

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

1. StrategyLab を開く。
2. provider ごとに代表シナリオを入力する。
3. proposal count は基本 5 件で確認し、境界確認時だけ 1 件、10 件、0 candidates になり得る条件を確認する。
4. 候補が表示されたら、少なくとも 5 件または返却された全件を読む。
5. 1 件を選択し、title / natural language spec 反映が既存導線を壊さないことを確認する。
6. Pine generation は自動起動しないことを確認し、必要な場合だけ手動 button で既存導線を確認する。

### 5-3. schema valid / invalid の見方

- UI に候補が表示される場合、schema validation を通った response として扱う。
- malformed JSON、invalid schema、candidate count invalid、provider unavailable、timeout は generic provider failure として proposal section に閉じる。
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

現行の StrategyLab proposal flow は、sanitized event、duration bucket、error category を持つ構造化 provider log を出していない。品質評価では、現時点で UI / API から観測できる範囲に限定して記録する。

- UI で候補一覧、EmptyState、generic provider failure、validation error のどれになったかを見る。
- API response が success / empty / provider_error / validation_error のどれに見えるかを記録する。
- latency は評価者が手元で測った体感または手動計測の bucket として記録する。
- provider unavailable や timeout は local_llm の運用課題として記録し、stub fallback 成功に読み替えない。
- local_llm 実体依存の結果は required check ではなく manual observation として扱う。
- raw prompt、raw response、endpoint、model 実値、secret、local path、stack trace は評価記録へ転記しない。

後続候補:

- sanitized provider event。
- duration bucket。
- error category。
- provider name / mode。
- fallback metadata。
- UI/API で参照できる範囲の provider diagnostics。

instrumentation / cost guard design PR 1 の方針:

- 初回実装候補は `POST /api/strategy-lab/proposals` の optional metadata とする。
- metadata は provider name、selected_by、elapsed_ms / latency bucket、status、candidate_count、invalid_reason、validation_error_count、fallback_used / fallback_reason、schema_valid を候補にする。
- request started at の raw timestamp は response に出さず、必要な場合も sanitized logs に限定する。
- model name は実値を出さず、configured / default / unknown などの category にする。
- prompt 全文、raw response、endpoint、secret、token、local path は記録しない。
- CI は mock / fake response で metadata 分類を検査し、local_llm 実体依存 test は required check に入れない。
- local_llm の latency / timeout は manual runbook で観測し、openai_api / Web search / deep research は別フェーズで cost / job 化を判断する。

## 6. 記録テンプレート

評価結果は当面、`docs/作業進捗管理/03_残課題_Backlog.md` の prompt regression / provider quality benchmark records 後続項目に要約する。まとまった比較を残す場合は、別 PR で作業進捗管理配下に日付付きの小さな評価記録を追加する。

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

## 7. 関連 docs

- `docs/仕様書/11_LLM_Strategy_Proposal仕様.md`
- `docs/運用ドキュメント/05_AI_provider運用.md`
- `docs/作業進捗管理/03_残課題_Backlog.md`
- `docs/作業進捗管理/04_設計判断ログ.md`
