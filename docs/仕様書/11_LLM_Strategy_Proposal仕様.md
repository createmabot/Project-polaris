# 北極星 LLM strategy proposal 現行設計

更新日: 2026-05-18
分類: 仕様書

## 1. 目的

本資料は、StrategyLab で AI がストラテジー候補を提案する LLM strategy proposal の初回設計を整理する。現時点では「投資助言」ではなく、ユーザーが検証するための strategy idea 候補を構造化して提示し、選択した候補を既存 StrategyLab の natural language spec に反映する導線を対象にする。

Pine 生成、Strategy / StrategyVersion 保存、validation、CSV import、internal backtest、Backtest report、AI summary auto-generation は既存仕様を維持する。proposal から Pine 生成や保存へ自動連鎖しない。

## 2. 体験設計

### 2-1. 入口

初回実装では、StrategyLab の rule input 付近に「ストラテジーを提案」導線を置く。

- StrategyLab は natural language strategy 作成、Pine 生成、保存、検証の作業画面であるため、proposal の入口を置く責務に合う。
- SymbolDetail / StrategyDetail / BacktestDetail には初回導線を置かない。
- 提案候補は StrategyLab 内の一時候補として表示し、選択時に natural language spec へ反映する。
- 既存の Pine generation button はユーザー操作として維持し、proposal 選択だけでは Pine 生成しない。

### 2-2. 入力

ユーザーは完全な条件を書かなくても proposal を取得できる。ただし、入力が少ない場合は uncertainty を高くし、検証候補であることを明示する。

初回入力候補:

- market: 例 `JP_STOCK`。未指定時は StrategyLab の current market を使う。
- timeframe: 例 `D`。未指定時は StrategyLab の current timeframe を使う。
- symbol_code: 任意。銘柄固有の提案精度を上げる入力であり、必須ではない。
- risk_preference: conservative / balanced / aggressive 程度の任意入力。
- strategy_type_bias: trend following / mean reversion / breakout / momentum / volatility / risk management / any。
- proposal_count: 既定 5、最大 10。
- user_hint: 任意の補足。既存 natural language spec がある場合は候補生成の context として使える。

### 2-3. 表示

候補は deterministic stub provider で返す。初回 UI は 5 件を要求するが、API は `proposal_count` により最大 10 件まで受けられる。UI は compact card list とし、各候補で次を読める必要がある。

- title
- summary
- strategy_type
- market / timeframe assumption
- entry / exit / risk management の要約
- strengths / weaknesses
- required indicators
- Pine feasibility
- backtest caution
- confidence / uncertainty
- source / research basis
- suggested natural_language_spec

候補選択時の動作:

- 選択した `suggested_natural_language_spec` を StrategyLab の natural language spec textarea に反映する。
- 必要なら title も StrategyLab の title input に反映できるが、ユーザーが明示編集できる状態を維持する。
- 反映後もユーザーが編集し、既存 Pine generation flow を手動で実行する。

## 3. proposal schema

LLM / provider が返す response は自由文ではなく、最低限次の構造を持つ。

```json
{
  "schema_name": "strategy_proposal_candidates",
  "schema_version": "1.0",
  "input": {
    "market": "JP_STOCK",
    "timeframe": "D",
    "symbol_code": null,
    "risk_preference": "balanced",
    "strategy_type_bias": "any",
    "proposal_count": 5,
    "user_hint": null
  },
  "candidates": [
    {
      "candidate_id": "candidate-1",
      "title": "string",
      "summary": "string",
      "market_assumption": "string",
      "timeframe_assumption": "string",
      "strategy_type": "trend_following",
      "entry_logic": ["string"],
      "exit_logic": ["string"],
      "risk_management": ["string"],
      "invalidation_conditions": ["string"],
      "expected_strengths": ["string"],
      "expected_weaknesses": ["string"],
      "required_indicators": ["string"],
      "pine_feasibility": "medium",
      "backtest_cautions": ["string"],
      "research_basis": [
        {
          "source_type": "internal",
          "label": "string",
          "url": null
        }
      ],
      "confidence": "medium",
      "uncertainty": ["string"],
      "suggested_natural_language_spec": "string",
      "suggested_pine_constraints": ["string"]
    }
  ],
  "disclaimer": "This is a verification candidate, not investment advice."
}
```

### 3-1. enum 候補

`strategy_type`:

- `trend_following`
- `mean_reversion`
- `breakout`
- `momentum`
- `volatility`
- `risk_management`
- `other`

`pine_feasibility`:

- `high`
- `medium`
- `low`

`confidence`:

- `high`
- `medium`
- `low`

`source_type`:

- `internal`: 既存 docs、ユーザー入力、既存画面 context からの推論。
- `user_input`: ユーザーが入力した条件。
- `web`: 将来の Web search / deep research 由来。
- `provider_knowledge`: provider の一般知識由来。freshness は保証しない。

### 3-2. UI表示項目と Pine input の分離

UI 表示に使う項目:

- title
- summary
- market_assumption
- timeframe_assumption
- strategy_type
- entry_logic / exit_logic / risk_management の要約
- expected_strengths / expected_weaknesses
- required_indicators
- pine_feasibility
- backtest_cautions
- research_basis
- confidence / uncertainty

Pine generation input へ渡す候補:

- `suggested_natural_language_spec`
- market
- timeframe
- 必要に応じて `suggested_pine_constraints` を natural language spec に含める。

Pine generation endpoint へ proposal schema 全体を渡さない。画面固有の説明、research basis、confidence は Pine 生成 input ではなく UI context として扱う。

## 4. Web search / deep research の扱い

初回実装では Web search / deep research を必須にしない。stub provider または deterministic proposal provider で、既存入力と一般的な戦略類型から候補を返す。

provider expansion PR 1 時点でも、Web search / deep research は対象外のまま維持する。`source_type=web` は将来予約値であり、現行 provider は実際の Web 検索、外部記事取得、citation 保存、freshness 判定を行わない。一般知識やユーザー入力からの推論は `provider_knowledge` / `user_input` / `internal` として扱い、最新ニュースや銘柄固有材料を参照したような表示にしない。

Web search / deep research を後続で扱う場合の方針:

- provider option として明示的に分ける。
- 同期長時間処理ではなく job 化を第一候補にする。
- citation URL、取得時刻、freshness、source reliability を response に含める。
- 引用元がない market assertion は uncertainty に明記する。
- timeout / provider failure 時は partial result または stub fallback を明示する。
- cost / latency が高くなるため、opt-in、rate limit、cost cap を先に設計する。
- 投資助言に見える断定表現だけを理由に入力や候補を reject しない。安全のために検証候補を狭めすぎず、売買推奨ではなく backtest required / user review required であることを UI と docs に出す。

初回で採用しないもの:

- Web search 必須の提案。
- deep research の同期処理。
- citation 保存を伴う proposal history。
- provider による銘柄推奨の断定。

## 5. provider / API 境界

### 5-1. 初回実装

初回実装は、次の小さな backend boundary として導入した。現行では PR #369 の persistence / API 追加により sanitized history 保存まで完了している。

- `POST /api/strategy-lab/proposals`
- request: market / timeframe / symbol_code / risk_preference / strategy_type_bias / proposal_count / user_hint
- response: `strategy_proposal_candidates` schema
- provider: deterministic `stub`
- DB 保存: `StrategyProposalRun` / `StrategyProposalCandidate` による sanitized history を保存する
- job 化: しない

provider が失敗しても StrategyLab の既存 save / Pine generation / validation flow は壊さない。proposal failure は proposal section の ErrorState / InlineNotice に閉じる。

### 5-2. provider boundary

既存 `HOME_AI_PROVIDER=stub|local_llm|openai_api` は Home / Symbol / Comparison / Backtest / Pine generation で使われている。strategy proposal は `STRATEGY_PROPOSAL_PROVIDER=stub|local_llm` を採用済みで、`HOME_AI_PROVIDER` とは分離する。未指定 default は `stub` とし、local_llm は明示 opt-in で使う。

初回は cost / latency / safety の観点から `stub` 相当を第一候補にする。`local_llm` / `openai_api` を使う場合は、prompt / response sanitization、timeout、fallback、error redaction、投資助言 disclaimer を先に固定する。

local_llm provider design PR 1 では、strategy proposal 専用の選択設定を `STRATEGY_PROPOSAL_PROVIDER=stub|local_llm` として設計する。未指定時の default は `stub` とし、既存 deterministic stub provider の挙動を壊さない。`HOME_AI_PROVIDER` は既存 AI summary / Pine generation 系の設定として維持し、strategy proposal の provider 切替は proposal 専用設定を優先する。

provider expansion の境界:

- route 層は request validation、response schema validation、error sanitization、UI 向け response shape の責務を持つ。
- provider adapter は proposal candidate の生成だけを担当し、DB 保存、Strategy / StrategyVersion 保存、Pine generation、backtest execution を起動しない。
- provider adapter は structured JSON 相当の中間結果を返し、route 層で `strategy_proposal_candidates` schema に正規化する。
- provider が timeout / invalid JSON / schema mismatch / safety violation を返した場合、proposal section の失敗として扱い、StrategyLab の既存 save / Pine generation / validation flow には影響させない。
- provider endpoint、raw prompt、raw response、stack trace、credential、local path は API response、UI、docs、PR本文に出さない。
- fallback は silent に行わない。stub fallback を使う場合は opt-in とし、response の provider metadata で `name` / `mode` / `web_search=false` を明示する。
- provider 呼び出しはユーザー操作起点に限定する。画面表示、typing、polling、batch、scheduled job を契機に proposal を自動生成しない。

provider boundary 実装現在地:

- deterministic stub provider は proposal provider boundary 配下に分離済み。
- route 層は request validation と provider response validation を通してから `strategy_proposal_candidates` を返す。
- `STRATEGY_PROPOSAL_PROVIDER=stub|local_llm` で proposal provider を選択できる。未指定 default は `stub`。
- `local_llm` provider は実装済み。local_llm output は UI に返す前に既存 provider response validation を通す。
- `openai_api` provider は設計候補のまま未実装。
- Proposal history / DB 保存は sanitized run / candidates / selected candidate の backend 最小範囲を実装済み。Web search / deep research、job化、Pine generation 自動連鎖は未実装のまま維持する。

### 5-2-1. local_llm provider design

local_llm strategy proposal provider の責務:

- StrategyLab の proposal request から、既存 `strategy_proposal_candidates` schema に合う候補 JSON を生成する。
- provider adapter は proposal candidate generation のみを担当し、DB 保存、Strategy / StrategyVersion 保存、Pine generation、backtest、AI summary を起動しない。
- Web search / deep research、外部記事取得、citation 保存、freshness 判定は行わない。
- `source_type=web` は引き続き将来予約とし、local_llm provider は `internal` / `user_input` / `provider_knowledge` を中心に返す。
- 投資助言風 wording は wording だけでは reject しないが、proposal は売買推奨ではなく検証候補であることを disclaimer / uncertainty / backtest cautions で維持する。

env / config 方針:

- `STRATEGY_PROPOSAL_PROVIDER=stub|local_llm` を proposal 専用 provider selector とする。
- 未指定、空、未知値の場合は `stub` を使う。
- local_llm endpoint、model、timeout、max output は proposal 専用 env で切れる。`STRATEGY_PROPOSAL_LOCAL_LLM_ENDPOINT`、`STRATEGY_PROPOSAL_LOCAL_LLM_MODEL`、`STRATEGY_PROPOSAL_LOCAL_LLM_TIMEOUT_PROFILE`、`STRATEGY_PROPOSAL_LOCAL_LLM_TIMEOUT_MS`、`STRATEGY_PROPOSAL_LOCAL_LLM_MAX_OUTPUT_CHARS` を使う。
- endpoint / model は proposal 専用 env がなければ既存 local LLM env の値を使い、最後に実装 default へ fallback する。
- endpoint や model の実値は docs / PR / UI / client response に出さない。運用確認では設定有無と sanitized status のみを扱う。

timeout / max output / fallback 方針:

- local_llm 選択時は provider adapter 境界で timeout を必ず設定する。
- timeout profile は default / long_context の 2 種類とする。default は通常の local model 向けに短めの上限を維持し、long_context は大きい local model や長文 context model の manual smoke 用に明示 opt-in で使う。
- `STRATEGY_PROPOSAL_LOCAL_LLM_TIMEOUT_MS` は profile ごとの下限・上限に丸める。極端な値や実際の設定値は client response、UI、docs、PR本文に出さない。
- long_context profile は timeout を延ばすだけであり、Web search、deep research、request-time provider selection、auto Pine generation を有効化しない。
- max output は既存 schema と `proposal_count` 最大 10 に収まる上限を設け、過大 response は parse 前または validation 前に失敗として扱う。
- local_llm 実装では、timeout、provider unavailable、malformed JSON、schema invalid、candidate count invalid、Web search 未実装時の web research basis を provider error として扱う。
- local_llm 実装では silent stub fallback を行わない。`STRATEGY_PROPOSAL_PROVIDER=local_llm` を選んだ場合の失敗は proposal section の generic failure として返す。
- 設計上は fallback option を後続候補として残す。fallback を実装する場合は opt-in とし、provider metadata に fallback であることを明示する。

prompt / response JSON 方針:

- prompt は既存 request validation 済み input から構築し、raw user_hint や raw prompt を log / UI / API response に出さない。
- response は structured JSON 相当を要求し、route 層で既存 `validateStrategyProposalData` 相当の validation を必ず通してから UI に返す。
- local_llm には JSON object のみ、markdown code fence / 説明文なし、英語 key 固定、値の日本語は許容、Web search 未実装時は `research_basis.source_type=web` を使わない、という schema 厳守 prompt を使う。
- local_llm response は、Ollama chat response の `message.content` または互換 response の message content から取り出す。content が空、過大、parse 不可の場合は provider invalid response とする。
- JSON 抽出では、前後説明文や markdown code fence が混ざる軽微な provider 出力を想定し、JSON object / array を抽出して parse する。抽出時は `{}` と `[]` の nesting、string、escape sequence を同時に追跡し、root array 内の candidate object と nested array fields を正しく扱う。ただし raw response は保存・表示・通常 log に出さない。
- 機械的に安全な normalization だけを行う。欠けた root `schema_name` / `schema_version` / `input` / `disclaimer` の補完、string で返った array field の 1 要素配列化、`trend following` などの enum 表記揺れの snake_case 化、よくある alias（例: `entry` -> `entry_logic`, `strengths` -> `expected_strengths`, `natural_language_spec` -> `suggested_natural_language_spec`）の exact key への補正、空の `research_basis` への `provider_knowledge` 最小値補完に限定する。
- `backtest_cautions`、`uncertainty`、`suggested_pine_constraints` は検証前提を示す非中核 metadata として、欠落時に固定の cautious fallback を補える。`title`、`summary`、`strategy_type`、`entry_logic`、`exit_logic`、`risk_management`、`suggested_natural_language_spec` などの中核 field は backend が内容を生成して補完しない。
- candidate の重要本文（title、summary、entry / exit / risk、suggested natural language spec など）を provider なしに生成して補うことはしない。重要 field が欠落した candidate は引き続き validation failure とする。
- malformed JSON、schema_name / schema_version 不一致、型不正、必須項目欠落、enum 不正、candidate count 不正、空または過度に短い `suggested_natural_language_spec` は provider invalid response とする。
- 必須 field 欠落時は sanitized diagnostics として field 名、field 数、影響 candidate 数だけを `provider_observation` に含められる。field value、candidate JSON、raw provider response は含めない。
- provider output の投資助言風 wording は wording だけでは invalid にしない。危険・不正・アプリ目的外の response は provider invalid として扱える。
- provider endpoint、raw prompt、raw response、stack trace、credential、local path は API response、UI、docs、PR本文に出さない。
- schema invalid の詳細調査は sanitized reason と required check の mock / fake response test で扱う。real local_llm 実体依存の確認は manual smoke に限定し、required check には入れない。

retry / repair 境界:

- `required_field_missing` に限り、local_llm provider 内で最大 1 回だけ bounded retry を行う。retry prompt には raw response 全文を入れず、missing field names と affected candidate count だけを渡し、完全な JSON を最初から再生成させる。
- retry 成功時は `provider_observation.retry_used=true` / `retry_reason=required_field_missing` / `retry_succeeded=true` を返せる。retry 後も失敗する場合は sanitized missing field diagnostics と `retry_succeeded=false` を返す。
- malformed JSON、enum invalid、candidate count invalid、provider unavailable、timeout はこの bounded retry の対象外とする。

local_llm provider PR 2 時点で実装していなかったもの:

- `openai_api` strategy proposal provider。
- Web search / deep research。
- request-time provider selection。
- proposal history DB persistence。PR #369 で backend 最小範囲は実装済み。
- auto Pine generation / auto save。
- DB / Prisma schema change。

### 5-3. schema validation / failure

request validation:

- `market`: 未指定時は `JP_STOCK`。大文字化し、過度に長い値は validation error にする。
- `timeframe`: 未指定時は `D`。大文字化し、過度に長い値は validation error にする。
- `symbol_code`: 任意。銘柄固有の fresh data lookup は行わない。
- `risk_preference`: `conservative|balanced|aggressive`。
- `strategy_type_bias`: `any|trend_following|mean_reversion|breakout|momentum|volatility|risk_management|other`。
- `proposal_count`: 1〜10 の整数。
- `user_hint`: 任意。長文は request parsing 境界で安全な長さに丸める。投資助言に見える表現を含んでも入力段階では拒否しない。type validation と length bounding は維持し、prompt / log / error 表示では raw text を不用意に出さない。

response validation:

- `schema_name` は `strategy_proposal_candidates`、`schema_version` は `1.0` を維持する。
- `candidates` は配列で、各 candidate は `candidate_id`、`title`、`summary`、`strategy_type`、`entry_logic`、`exit_logic`、`risk_management`、`backtest_cautions`、`confidence`、`uncertainty`、`suggested_natural_language_spec` を必須相当として扱う。
- enum は本資料の `3-1. enum 候補` に限定する。未知値は UI にそのまま出さず、provider output invalid として扱う。
- `suggested_natural_language_spec` が空または過度に短い場合は invalid として扱う。単なる投資助言風 wording だけを理由に provider invalid とはしない。
- `research_basis.url` は現行では `null` を基本とする。Web search 未実装の provider が URL を返した場合は採用しない。

failure policy:

- request validation error は `VALIDATION_ERROR` として短い説明にする。
- user input 由来の投資助言風表現は request validation error にしない。入力として許容し、検証候補であることを UI / docs で明示する。
- provider timeout / schema不正 / 型不正 / 必須項目欠落 / JSON または format 不正 / candidate数不正 / upstream failure は generic failure とし、raw provider diagnostics は返さない。
- 0 candidates は既存 UI の EmptyState で表現できるため、schema 上は成功 response として許容する。provider failure とは分ける。
- 失敗時に StrategyLab の既存 input を消さない。proposal candidates だけを失敗表示にする。

### 5-4. timeout / fallback / cost / rate limit

- external provider を使う場合は、route または provider adapter 境界で必ず timeout を設定する。local_llm は default profile を基本とし、重い local model の manual smoke では long_context profile を明示 opt-in で使う。
- timeout 時は retry 連打を避けるため、UI では短い失敗表示に留める。自動 retry / polling は行わない。
- `openai_api` 等の有料 provider は明示 opt-in でのみ利用する。
- cost cap、rate limit、per-user / per-session の制御は、stub 以外を広げる前に運用設計を固定する。
- `proposal_count` は最大 10 のまま維持し、長文 user_hint や過大 prompt を受けた場合の truncation / rejection 方針を provider 実装前に固定する。
- fallback を有効にする場合でも、品質評価ではなく疎通確保として扱い、provider metadata と UI 文言で stub fallback であることを隠さない。

### 5-5. safety boundary

- proposal は「検証候補」であり、売買推奨、利益保証、銘柄推奨ではない。
- candidate title / summary / suggested spec に「買うべき」「必ず利益」「損失なし」などの投資助言風 wording が含まれる場合でも、その wording だけを理由に reject しない。安全のために検証候補を狭めすぎず、画面上の disclaimer と backtest / user review required の前提で扱う。
- 銘柄固有の判断材料、最新ニュース、業績、開示情報を参照したように見せない。現行 provider は Web search / deep research を行わないため、freshness を主張しない。
- backtest required、user review required、forward validation required を UI / docs の前提にする。
- provider safety violation は generic failure とし、危険な候補を partial display しない。

## 6. 保存 / 履歴 / 再利用

初回 UI 実装では proposal candidates を一時表示に留めていた。PR #368 で history / lineage の設計を固定し、PR #369 で backend persistence / API、PR #370 で StrategyLab の最小 UI を実装したため、本フェーズは完了扱いにする。

現行の保存 / 履歴の位置づけ:

- proposal history は、generation run、run 内の candidates、ユーザーが選択した candidate を後から確認するための履歴である。
- 履歴保存は `StrategyProposalRun` / `StrategyProposalCandidate` に限定し、Strategy / StrategyVersion 保存済みを意味しない。
- selected candidate は StrategyLab の title / natural language spec へ反映された事実を示す。
- Pine generation、Strategy 保存、validation、backtest、AI summary は既存の手動導線を維持する。
- raw prompt / raw provider response / provider endpoint / secret / model 実値 / local path / stack trace は保存しない。

### 6-1. proposal history / selected proposal lineage 実装現在地

Proposal history / selected proposal lineage は、StrategyLab で取得した strategy proposal run と、その run 内の候補、ユーザーが選択した候補を後から確認するための履歴である。backend persistence / API の最小範囲は実装済み。目的は「どの提案候補から natural language spec を作ったか」を追えるようにすることであり、Strategy / StrategyVersion / Pine generation / backtest の自動起動ではない。

責務:

- generation run: 1 回の `POST /api/strategy-lab/proposals` を表す履歴単位として保存する。
- candidate: run 内で UI に返した候補を保存する。selected だけではなく、返却された全候補を保存する。
- selected candidate: ユーザーが StrategyLab input に反映した候補を明示的に記録する。
- selected state: run 側の selected relation と candidate 側の `selected_at` 相当で、選択状態を矛盾なく記録する。
- StrategyLab input 反映: selected candidate は StrategyLab の title / natural language rule へ反映された事実を示すだけで、保存済み Strategy / StrategyVersion を意味しない。
- Strategy / StrategyVersion / Pine generation: proposal selection だけでは作成しない。既存の保存・Pine生成・validation・backtest は手動導線を維持する。

保存するもの:

- request parameters: `market` / `timeframe` / `symbol_code` / `risk_preference` / `strategy_type_bias` / `proposal_count` は保存対象にする。
- user_hint: raw prompt ではなく、length bounded / sanitized request input として扱う。
- provider metadata: `provider.name` / `provider.mode` / `web_search` / `persisted` のような sanitized metadata を保存する。
- provider_observation: `status` / `latency_bucket` / `elapsed_ms` / `candidate_count` / `invalid_reason` / `validation_error_count` / `fallback_used` / `fallback_reason` / `schema_valid` / `model_category` など、既存 response metadata と同等の sanitized 値を保存する。
- candidate JSON: UI 表示と後続選択再現に必要な normalized candidate JSON を保存する。schema は現行 `strategy_proposal_candidates` / `1.0` を基準にし、candidate 単位の normalized JSON と主要検索用 field を分ける。
- selected reflection snapshot: selected candidate の `title` と `suggested_natural_language_spec` を、選択時点の snapshot として candidate 側に含める。

保存しないもの:

- raw prompt。
- raw provider response。
- provider secret / token / credential。
- provider endpoint。
- model 実値。
- local path。
- stack trace。
- Web search / deep research の raw source payload。

local_llm failure / invalid response の扱い:

- local_llm の timeout / unavailable / malformed JSON / invalid schema は、candidate がない sanitized failed run として履歴に残す。
- failed run は sanitized `provider_observation` と request parameters のみを保存し、raw provider diagnostics は保存しない。
- 0 candidates の成功応答は failed run ではなく succeeded run with zero candidates として扱う。
- request validation error は履歴保存対象外にする。request として成立していないため、履歴よりも client-side / API validation error に閉じる。

全候補保存を第一候補にする理由:

- selected だけ保存すると、ユーザーが何と比較して選んだかが失われる。
- provider quality / diversity の後続評価で、selected 以外の候補が必要になる。
- candidate JSON は normalized schema に限定し、raw response を保存しないことで retention risk を抑える。

selected だけ保存案の見送り理由:

- storage は軽くなるが、提案比較の文脈が残らない。
- local_llm の candidate diversity / rejected candidates の品質確認に使いにくい。
- 後から「なぜこの candidate を選んだか」を UI 上で説明しにくい。

### 6-2. data model

PR #369 で `StrategyProposalRun` / `StrategyProposalCandidate` 相当の model を追加済みである。ここでは docs 上の責務を示す。

`StrategyProposalRun` 相当:

- `id`
- `userId` nullable
- `schemaName`
- `schemaVersion`
- `market`
- `timeframe`
- `symbolCode` nullable
- `riskPreference`
- `strategyTypeBias`
- `proposalCount`
- `userHintText` nullable。raw prompt ではなく bounded / sanitized request input。
- `providerName`
- `providerMode`
- `providerWebSearch`
- `providerPersisted`
- `providerObservationJson`
- `status`: `succeeded` / `validation_failed` / `provider_unavailable` / `timeout` / `invalid_response` / `provider_error`
- `candidateCount`
- `selectedCandidateId` nullable
- `selectedAt` nullable
- `createdAt`
- `updatedAt`

`StrategyProposalCandidate` 相当:

- `id`
- `proposalRunId`
- `candidateKey`: provider response 内の `candidate_id`
- `sortOrder`
- `title`
- `summary`
- `strategyType`
- `marketAssumption`
- `timeframeAssumption`
- `pineFeasibility`
- `confidence`
- `candidateJson`: normalized candidate JSON。raw provider response ではない。
- `suggestedNaturalLanguageSpec`。必要なら `candidateJson` から分離して検索 / 表示しやすくする。
- `selectedAt` nullable
- `createdAt`
- `updatedAt`

relation / index:

- `StrategyProposalRun` 1 対多 `StrategyProposalCandidate`。
- `StrategyProposalRun.selectedCandidateId` は nullable foreign key とする。
- `StrategyProposalCandidate(proposalRunId, sortOrder)`。
- `StrategyProposalRun(createdAt)`。
- `StrategyProposalRun(status, createdAt)`。
- `StrategyProposalCandidate(strategyType, createdAt)` のような分析用 index は必要になった時点で追加判断する。

現行で入れない relation:

- `selected_strategy_id` は初回では不要。proposal selection と Strategy 作成は別操作であり、同一トランザクションで結ばないため。
- `selected_strategy_version_id` は初回では不要。StrategyVersion は既存保存操作で作成され、proposal selection だけでは作られないため。
- `created_from_candidate_id` を `StrategyRuleVersion` に追加する案は後続判断。StrategyVersion 作成 API に proposal candidate id を渡す UI / API 変更が必要になるため、history 初回実装とは分ける。

後続 lineage 案:

- `StrategyRuleVersion.createdFromProposalCandidateId` 相当を nullable で追加する。
- StrategyLab で selected candidate がある状態で保存する場合だけ、明示的に candidate id を StrategyVersion 作成 request に渡す。
- 既存 StrategyVersion 作成 API の必須 field にはしない。
- proposal candidate が削除されても StrategyVersion は残す必要があるため、relation は `onDelete: SetNull` を第一候補にする。

### 6-3. API 方針

後方互換:

- 既存 `POST /api/strategy-lab/proposals` の response shape は維持する。
- history 保存を実装しても、既存 client が読む `schema_name` / `schema_version` / `input` / `provider` / `provider_observation` / `candidates` / `disclaimer` は壊さない。
- 追加する場合は optional field として `proposal_run_id` または `history.proposal_run_id` を返す。
- provider failure response の `error.details.provider_observation` は sanitized metadata のまま維持する。

候補 API:

- `GET /api/strategy-lab/proposals`
  - 最近の proposal run 一覧を返す。
  - 初回は `limit` 上限付きの recent list に限定する。
  - filter / pagination / large history management は後続判断とする。
- `GET /api/strategy-lab/proposals/:proposalRunId`
  - run detail と candidates を返す。
  - raw prompt / raw response / endpoint / secret / local path は返さない。
- `POST /api/strategy-lab/proposals/:proposalRunId/select`
  - request: `{ "candidate_id": "..." }` または `{ "proposal_candidate_id": "..." }`。
  - `candidate_id` を優先し、未指定の場合は `proposal_candidate_id` を読む。
  - `candidate_id` は provider candidate id または internal candidate id として扱う。`proposal_candidate_id` は detail API の `candidates[].id` に対応する internal `StrategyProposalCandidate.id` として扱う。
  - selected candidate を run に記録し、同一 run の既存 candidate `selected_at` を null に戻してから選択 candidate の `selected_at` を更新する。
  - StrategyLab input 反映は frontend state の責務であり、この API は Strategy / StrategyVersion / Pine generation を起動しない。

selection API の代替案:

- `POST /api/strategy-lab/proposal-candidates/:candidateId/select`
  - candidate id だけで選択できるが、run 文脈が URL から見えにくい。
- `PATCH /api/strategy-lab/proposals/:proposalRunId`
  - 汎用 patch は将来 field が増えた時に責務が広がるため、初回は select 専用 endpoint を第一候補にする。

failed run API:

- failed run を保存する場合も、detail API は candidates 空配列と sanitized provider observation を返す。
- provider error の raw details は返さない。

### 6-4. migration / rollback 方針

proposal history / lineage の backend 最小実装では additive table 追加に限定した。StrategyVersion への created-from relation は初回 scope に含めず、rollback と既存 strategy / backtest data への影響を小さくする。

実装 scope を分けた理由:

- migration、Prisma schema、backend API、frontend UI、tests の影響範囲が history design より大きい。
- rollback 時に table / relation / nullable FK の扱いを明示する必要がある。
- seed への影響有無を確認する必要がある。
- StrategyVersion lineage relation を同時に入れるかどうかで migration scope が変わる。

rollback 方針:

- 初回 migration は additive table 追加に限定済み。
- 既存 table の必須 column 追加は避ける。
- StrategyVersion への nullable relation は初回では入れず、rollback を単純にした。
- rollback が必要な場合は、新規 proposal history tables の drop だけで既存 strategy / backtest data に影響しない構成を第一候補にする。

seed 影響:

- 初回実装では seed は変更しない。
- UI 目視用の proposal history seed が必要になった場合も、別 PR または optional seed として扱う。

### 6-5. 初回実装スコープ案

backend 最小実装済み:

1. DB migration / Prisma schema: `StrategyProposalRun` と `StrategyProposalCandidate` を追加済み。
2. Backend: `POST /api/strategy-lab/proposals` の後方互換を維持しつつ、成功 run と failed provider run の sanitized history を保存済み。
3. Backend: `GET /api/strategy-lab/proposals` と `GET /api/strategy-lab/proposals/:proposalRunId` を read-only で追加済み。
4. Backend: selection API を追加し、selected candidate を記録済み。
5. Tests: DB persistence / API shape / selection / no auto Pine / no auto save / sanitized metadata を mock / stub で確認済み。

永続化整合性:

- run と candidates の作成は transaction とし、candidate insert 失敗時に partial history を残さない。
- `StrategyProposalRun.selectedCandidateId` は nullable foreign key とし、存在しない candidate ID を保存しない。
- selection 更新は transaction とし、同一 run 内で `selectedCandidateId` と candidate `selected_at` が矛盾しないようにする。

frontend 最小 UI 実装済み:

- StrategyLab 内に recent proposal runs を数件表示する。
- 初回表示時と proposal 生成後に `GET /api/strategy-lab/proposals?limit=5` で recent runs を取得する。過剰 polling は行わない。
- run status、created_at、provider name、candidate count、selected 有無を表示する。
- detail は必要な run の candidates 再表示と「この候補を使う」に留める。
- 現在表示中 proposal candidates は、`proposal_run_id` または `history.proposal_run_id` がある場合に `POST /api/strategy-lab/proposals/:proposalRunId/select` を呼んでから title / natural language rule に反映する。
- history detail candidates は、`proposal_candidate_id` で selection API を呼んでから title / natural language rule に反映する。
- selection API 失敗時は StrategyLab 内の error 表示に留める。
- proposal 選択から Strategy / StrategyVersion 保存、Pine generation、validation、backtest、AI summary は自動起動しない。
- provider quality trend は「最近の提案」内の compact read-only note として表示する。
- filter / pagination / search / bulk delete / retention management / full trend management は後続にする。
- StrategyVersion lineage relation は初回 UI では扱わず、後続判断とする。

required check 方針:

- `stub` と mocked provider response による persistence / API / validation tests を required check 対象にする。
- real `local_llm` 実体依存 test は required check に入れない。
- local_llm failure / invalid response の履歴保存は fake provider / mocked fetch で確認する。

初回でやらないこと:

- StrategyVersion 自動保存。
- Pine generation 自動起動。
- backtest 自動起動。
- Web search / deep research。
- openai_api provider。
- raw prompt / raw response 保存。
- provider endpoint / local path / secret 保存。
- retention job / hard delete。
- full history management。

## 7. safety / disclaimer

本機能は投資助言ではない。UI と docs では次を明示する。

- 提案は検証候補であり、利益を保証しない。
- 提案は売買推奨ではない。
- ユーザーが内容を確認し、Pine 生成、backtest、forward validation を行う前提で使う。
- Web search / provider knowledge は古い可能性や誤りを含む。
- confidence は検証優先度の補助であり、成績見込みではない。

UI / docs で避ける表現:

- 必ず儲かる。
- この銘柄を買うべき。
- 損失が出ない。
- 検証なしで使える。

## 8. 画面責務

- StrategyLab: proposal 入口、候補表示、候補選択、natural language spec への反映を担当する。
- StrategyVersionDetail: 既存 version / Pine / validation / regenerate の確認画面であり、初回 proposal 入口は持たない。
- StrategyDetail: strategy の read-only detail と関連 reports を担当し、proposal 生成は持たない。
- SymbolDetail: symbol 起点 application / report / import / internal backtest を担当し、proposal 生成は持たない。ただし将来、symbol context を StrategyLab に渡す導線は候補にできる。
- BacktestDetail / ApplicationDetail: report / history / comparison の確認画面であり、proposal 生成は持たない。

## 9. 初回実装スコープ

初回実装済みの最小範囲:

1. `POST /api/strategy-lab/proposals` を追加する。
2. deterministic stub provider で proposal candidates を返す。
3. StrategyLab に「ストラテジーを提案」section を追加する。
4. market / timeframe は既存 StrategyLab state を使い、risk preference / strategy type bias を入力できるようにする。
5. candidate を選択すると title と natural language spec に反映する。
6. Pine generation は既存 button を使い、proposal 選択では自動実行しない。
7. proposal history / selected proposal lineage の backend persistence / API と StrategyLab minimal UI を追加する。
8. tests / walkthrough / docs を更新する。

現行でもやらないこと:

- Web search / deep research。
- provider cost cap の本格実装。
- strategy proposal job 化。
- proposal から Strategy / StrategyVersion への自動保存。
- proposal から Pine generation への自動連鎖。
- 投資助言風 wording だけを理由に proposal 候補を過剰に狭めること。

## 10. quality evaluation 方針

Strategy proposal quality evaluation は、stub と local_llm の出力を同じ評価軸で確認し、schema が正しいだけでなく、検証候補として使える粒度かを判断する。

PR #359〜#360 で、quality evaluation runbook と validation / failure path test coverage は完了扱いにする。StrategyLab UI は既存の「検証候補」「売買推奨ではない」「Pine生成 / backtest は手動」の copy と provider error handling で十分と判断し、追加 UI 変更は行わない。

自動検査対象:

- schema validity。
- candidate count と `proposal_count` / 最大 10 件の境界。
- enum validity。
- required fields 欠落。
- invalid JSON / schema invalid / candidate count invalid。
- latency / timeout / provider failure rate。

手動評価対象:

- candidate diversity / strategy_type diversity。
- user_hint alignment。
- market / timeframe assumption clarity。
- entry / exit logic clarity。
- risk management quality。
- invalidation condition clarity。
- Pine feasibility。
- backtest caution quality。
- uncertainty / limitations。
- 検証候補として提示されているか。
- hallucination / stale / unsupported claim risk。

stub は deterministic baseline として schema、UI表示、候補選択、empty candidates を確認する。local_llm は diversity、user_hint alignment、risk / caution quality、Pine feasibility、latency、invalid response rate を stub と比較する。

投資助言風 wording を含む input / output は wording だけで reject しない。評価では、売買推奨や利益保証ではなく backtest / user review 前提の検証候補として提示されているかを確認する。

詳細な評価シナリオ、manual runbook、記録テンプレートは `docs/運用ドキュメント/11_Strategy_proposal品質評価運用.md` を正本とする。

## 11. instrumentation / cost guard 設計方針

Strategy proposal provider instrumentation は、provider 品質と failure 分類を観測するための sanitized metadata として扱う。現行実装では `POST /api/strategy-lab/proposals` の optional response metadata として `provider_observation` を返し、proposal history にも sanitized metadata として保存する。既存 `provider` / `candidates` / validation behavior は壊さず、job 化は行わない。

実装済み metadata:

- provider name: `stub` / `local_llm`。
- selected_by: `env` / `config` / `default`。request-time provider selection は未実装のため、現時点では `request` は使わない。
- request started at: raw timestamp は client response に出さない。必要な場合は logs 内の sanitized event に限定し、UI/API では elapsed と bucket を優先する。
- elapsed_ms: optional。UI に出す場合は丸めるか、latency bucket を優先する。
- latency bucket: `fast` / `acceptable` / `slow` / `timeout`。
- status: `succeeded` / `validation_failed` / `provider_unavailable` / `timeout` / `invalid_response` / `provider_error`。
- candidate_count。
- invalid_reason: `none` / `schema_invalid` / `malformed_json` / `required_field_missing` / `enum_invalid` / `candidate_count_invalid` / `web_research_basis_disabled` / `provider_unavailable` / `timeout` / `unknown`。raw provider diagnostics は含めない。
- validation_error_count。
- fallback_used / fallback_reason。現行は silent fallback なしのため、既定は `false` / `null`。
- schema_valid。
- model name: 実値は response / UI / docs / PR に出さない。必要な場合は `configured` / `default` / `unknown` などの sanitized category に留める。

response / logs 方針:

- response metadata は optional とし、既存 `data.candidates` と validation behavior を壊さない。
- success response では `data.provider_observation` として返す。provider error 時も返す場合は `error.details.provider_observation` の sanitized enum / count / bucket のみに限定する。
- 現時点では構造化 provider log の永続化や専用 event stream は実装しない。logs を追加する場合も sanitized event のみとし、raw prompt、raw response、provider endpoint、model 実値、secret、token、credential、local path、stack trace は出さない。
- UI 表示は provider status、latency、fallback、schema の最小 note に留め、debug console や long diagnostics panel は初回対象外にする。
- instrumentation metadata は品質評価と運用切り分けの補助であり、投資判断や候補 ranking には使わない。

cost / rate guard 方針:

- `local_llm` は latency / timeout を主な運用観点とし、短い timeout、max output、candidate count 上限を維持する。
- `openai_api` を導入する場合は、明示 opt-in、max candidates、max output、rate limit、cost cap、prompt length guard、provider unavailable / timeout 時の retry 方針を実装前に固定する。
- retry は既定で行わない。導入する場合は user operation 起点の明示 retry または bounded retry に限定し、画面表示 / typing / polling 起点では実行しない。
- request-time provider selection は cost / abuse / consistency の境界が重いため、role / env / feature flag / audit などの運用条件を先に設計する。
- Web search / deep research は latency と cost が大きいため、同期 proposal API ではなく job 化候補として分離する。

CI / manual 境界:

- CI は mock / fake response で metadata 分類、status、invalid_reason、fallback flags を検査する。
- real local_llm endpoint に依存する test は required check に入れない。
- local_llm latency / timeout / invalid response rate は manual runbook で観測する。

現行 instrumentation metadata 実装では、optional response metadata、backend provider observation 分類、proposal history DB 保存、最小 frontend 表示、mock / fake response による test coverage を含む。

## 12. prompt regression / provider benchmark 設計方針

Strategy proposal prompt regression / provider benchmark は、provider を増やす前後で proposal 品質と failure 傾向を比較するための任意運用である。required check とは分け、CI で安定する schema / validation test と、provider 実体に依存する manual / optional benchmark を混同しない。

PR #365 の benchmark design / fixed scenario set と PR #366 の code fixture / optional benchmark script / tests をもって、本 phase は完了扱いにする。DB / Prisma schema は変更していない。

対象 provider:

- `stub`: deterministic baseline。schema、candidate count、empty candidates、UI 表示の回帰確認に使う。
- `local_llm`: opt-in provider。diversity、user_hint alignment、latency、invalid response、unsupported claim risk を比較する。
- future `openai_api`: 有料 provider。実装前に cost / rate guard、明示 opt-in、保存しない raw output 方針を固定する。
- future Web search / deep research: 同期 proposal API ではなく job 化候補。citation / freshness / cost / latency を別枠で扱う。

required check と benchmark の境界:

- required check: mock / fake response による schema validation、required fields、enum、candidate count、malformed JSON、provider unavailable / timeout の分類確認。
- manual / optional benchmark: real `local_llm`、future `openai_api`、future Web search / deep research の latency、failure rate、diversity、qualitative score の比較。
- real provider 依存 benchmark は required check に入れない。

prompt regression と provider benchmark の違い:

- prompt regression: 同じ provider / 同じ scenario で、prompt や schema 変更前後の出力傾向が大きく崩れていないかを見る。
- provider benchmark: 同じ scenario を provider 間で比較し、品質、latency、invalid response、cost risk の差を見る。

記録方針:

- `provider_observation` の status、latency_bucket、candidate_count、invalid_reason、validation_error_count、schema_valid、fallback_used を一次指標にする。
- latency、invalid response、candidate_count、schema validity は定量記録する。
- diversity、user_hint alignment、entry / exit、risk、invalidation、Pine feasibility、backtest caution、uncertainty、unsupported claim risk は手動評価として短く記録する。
- investment-advice-like wording は一律 reject しない。benchmark では、売買推奨や利益保証ではなく検証候補として扱えているかを見る。
- raw prompt、raw response、provider endpoint、model 実値、secret、token、credential、local path、stack trace は保存しない。
- 実測値は原則 commit しない。必要な場合は raw output ではなく、scenario 単位の要約だけを progress docs に残す。

optional script 方針:

- optional benchmark PR 2 で `pnpm --filter backend strategy-proposal:benchmark` を追加済み。
- script は required check に入れない。default は env に依存しない `stub` で、`--provider=local_llm` は manual optional とする。
- scenario fixture は本章と品質評価 runbook の fixed scenario id に合わせる。対象は `generic_default`、`jp_stock_daily`、`us_stock_daily`、`short_swing`、`long_trend_following`、`mean_reversion`、`breakout`、`volatility`、`conservative_risk`、`aggressive_risk`、`concrete_user_hint`、`vague_user_hint`、`long_user_hint`、`advice_like_wording`。
- output は stdout の sanitized summary とし、raw prompt / raw response / endpoint / model 実値 / secret / local path / stack trace / user_hint 全文 / candidate 自由文本文を出さない。
- summary は `provider_observation` 相当の status / latency bucket / candidate_count / invalid_reason と、candidate の strategy_type / confidence / pine_feasibility / caution count / uncertainty count に限定する。candidate title / summary / suggested_natural_language_spec は出さない。
- `--output=<file>.json` を指定した場合だけ、gitignore 済みの benchmark record directory 配下へ sanitized summary record を書き出す。実測 record は原則 commit しない。

## 13. benchmark result recording workflow / sanitized summary records

Benchmark result recording workflow は、manual optional benchmark の結果を raw output ではなく sanitized summary record として一時保存し、provider 追加前後の比較材料にするための仕様である。Provider quality trend aggregation は proposal history に基づく read-only 集計であり、benchmark result recording は任意 benchmark の局所的な実行結果を file として残す workflow である。初回では両者を DB 上で統合しない。

初回実装範囲:

- 新規 DB migration / Prisma schema 変更は行わない。
- benchmark result table は作らない。
- optional benchmark script の default stdout は維持する。
- `--output=<file>.json` 指定時のみ sanitized summary record を local file に出力する。
- 出力先は `backend/.benchmark-records/strategy-proposal/` 配下に限定し、この directory は gitignore 対象とする。
- `--fixed-generated-at=<iso>` は deterministic test / smoke 用の固定時刻 option とし、real benchmark record の通常運用では current timestamp を使う。
- actual benchmark record は原則 commit しない。commit してよいのは schema / docs / tests / deterministic fake fixture のみとする。

sanitized summary record schema:

```json
{
  "schema_name": "strategy_proposal_benchmark_summary_records",
  "schema_version": "1.0",
  "generated_at": "2026-05-17T00:00:00.000Z",
  "record_kind": "manual_optional_benchmark",
  "source": {
    "script": "strategy-proposal:benchmark",
    "required_check": false,
    "provider_real_dependency": false
  },
  "records": [
    {
      "run": {
        "provider": "stub",
        "provider_mode": "deterministic",
        "provider_category": "stub",
        "scenario_id": "generic_default",
        "scenario_set_version": "1.0",
        "candidate_count": 5,
        "status": "succeeded",
        "latency_bucket": "fast",
        "elapsed_ms_bucket": "0_1000",
        "schema_valid": true,
        "invalid_reason": "none",
        "validation_error_count": 0,
        "fallback_used": false,
        "fallback_reason": null
      },
      "candidate_summary": {
        "strategy_type_counts": [{ "value": "trend_following", "count": 1 }],
        "confidence_counts": [{ "value": "medium", "count": 5 }],
        "pine_feasibility_counts": [{ "value": "medium", "count": 5 }],
        "backtest_caution_count": 5,
        "uncertainty_count": 5
      },
      "quality_notes": {
        "manual_review_required": true,
        "advice_like_wording_observed": false,
        "unsupported_claim_risk": "unknown",
        "notes": []
      },
      "safety": {
        "sanitized": true,
        "raw_prompt_included": false,
        "raw_response_included": false,
        "endpoint_included": false,
        "model_value_included": false,
        "secret_included": false,
        "local_path_included": false,
        "stack_trace_included": false,
        "user_hint_full_text_included": false,
        "candidate_free_text_included": false
      }
    }
  ],
  "meta": {
    "actual_record_should_be_committed": false,
    "raw_prompt_included": false,
    "raw_response_included": false,
    "endpoint_included": false,
    "model_value_included": false,
    "user_hint_full_text_included": false,
    "candidate_free_text_included": false
  }
}
```

記録してよいもの:

- provider category / provider mode。
- scenario id / scenario set version。
- status / latency bucket / elapsed bucket。
- candidate count。
- invalid reason / validation error count / schema valid。
- fallback flags。
- strategy_type / confidence / pine_feasibility distribution。
- backtest caution count / uncertainty count。
- manual review required flag。
- advice-like wording observed flag。
- unsupported claim risk の sanitized category。
- required_check=false / provider_real_dependency flag。
- safety flags。

記録しないもの:

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
- raw `inputJson` / raw `candidateJson` / raw `providerObservationJson`。

Provider quality trend aggregation との関係:

- provider quality trend aggregation は、実利用または proposal history に基づく read-only 集計である。
- benchmark result recording は、manual optional benchmark の実行結果を sanitized file として一時記録する workflow である。
- 初回では benchmark result を DB 永続化しない。
- 将来統合する場合は、別 design PR で BenchmarkResult 相当の model、retention、prompt versioning、comparison、cost / rate guard との関係を設計する。

## 14. provider quality trend aggregation

Strategy proposal provider quality trend aggregation は、保存済み `StrategyProposalRun` / `StrategyProposalCandidate` と sanitized `provider_observation` を使って、provider ごとの品質傾向を read-only に確認するための補助仕様である。投資判断、candidate ranking、売買推奨の評価には使わない。

初回実装範囲:

- 新規 DB migration / Prisma schema 変更は行わない。
- `StrategyProposalRun.providerObservationJson` と `StrategyProposalCandidate.candidateJson` のうち、enum / count / bucket として扱える項目だけを集計する。
- `GET /api/strategy-lab/proposals/provider-quality-trend` を read-only endpoint として追加する。
- StrategyLab の「最近の提案」内に compact trend note を表示する。
- trend note は proposal UI の主導線を邪魔せず、Pine generation / save / validation / backtest を自動起動しない。

集計してよい項目:

- provider name。
- status / invalid_reason / validation_error_count / schema_valid。
- elapsed_ms summary / latency_bucket。
- candidate_count / zero candidate count。
- selected count / selected rate。
- selected_by / provider_mode の count。
- safe request dimension としての market / strategy_type_bias。
- candidate の strategy_type / confidence / pine_feasibility distribution。

返さないもの:

- user_hint 全文。
- raw prompt。
- raw provider response。
- provider endpoint。
- model 実値。
- secret / token / credential。
- local path。
- stack trace。
- candidate title / summary / suggested_natural_language_spec などの自由文本文。
- raw `inputJson` / raw `candidateJson` / raw `providerObservationJson` 全体。

API response は `summary`、`by_provider`、`by_market`、`by_strategy_type_bias`、`candidate_distribution`、`recent_failures`、`meta` を返す。`meta` では `source=strategy_proposal_history`、`sanitized=true`、`raw_prompt_included=false`、`raw_response_included=false` を明示する。

現時点で含めないもの:

- sanitized provider event log persistence。
- provider quality trend の DB materialization。
- p50 / p95 などの本格 percentile。
- `openai_api` / Web search / deep research provider。
- StrategyVersion created-from-proposal relation。

## 15. provider cost / rate guard hardening

Strategy proposal provider cost / rate guard hardening は、`openai_api` や Web search / deep research を追加する前に、同期 proposal API の費用・遅延・連打・失敗時挙動を固定するための境界である。

現行実装範囲:

- default provider は引き続き `stub`。`local_llm` は `STRATEGY_PROPOSAL_PROVIDER=local_llm` の明示 opt-in のみ。
- `proposal_count` は request validation で 1〜10 に制限する。StrategyLab UI は通常 5 件を要求する。
- `user_hint` は request validation で長さを制限する。投資助言風 wording は、それだけでは reject しない。
- `local_llm` timeout と max output は env で調整できるが、backend の guard config で下限・上限に丸める。
- `local_llm` の retry は `required_field_missing` に対する最大 1 回の bounded retry のみ。retry prompt に raw provider response は入れない。
- `POST /api/strategy-lab/proposals` は in-memory per-process rate guard を持つ。短時間に上限を超えた場合は `RATE_LIMITED` として 429 を返し、proposal run は保存しない。
- rate guard key は user id が利用可能な場合は user、trusted forwarded IP を明示 opt-in した場合のみ forwarded client IP、通常は request IP、取得不能時は unknown bucket とする。
- forwarded header は trust boundary が明確な reverse proxy / tunnel 配下でのみ opt-in し、default では信頼しない。opt-in 時も先頭値が valid IPv4 / IPv6 として検証できる場合だけ forwarded client IP として扱い、不正値や任意文字列は request IP に fallback する。
- rate guard の response は retry_after / limit / window / provider mode / key source 程度の sanitized metadata に限定する。actual IP、forwarded header value、内部 key は返さない。
- silent stub fallback は行わない。fallback を導入する場合は後続で explicit opt-in と metadata 表示を設計する。
- raw prompt、raw provider response、provider endpoint、model 実値、secret、token、local path、stack trace は response / UI / docs / PR に出さない。

rate guard の位置づけ:

- 初回は単一 process 内の軽量 guard であり、multi-process / distributed production の厳密な abuse prevention ではない。
- reverse proxy 配下では、trusted forwarded IP opt-in を有効化しない限り、proxy / load balancer 側の request IP bucket になる可能性がある。
- trusted forwarded IP opt-in は、proxy が forwarded header を上書きまたは制御している構成でのみ使う。client が backend に直接到達できる構成では有効化しない。
- local dev の確認を妨げる場合は env で無効化できるが、通常は有効にして連打と accidental load を抑える。
- UI は 429 を「短時間に候補取得が続いたため、少し時間をおいて再試行」として表示し、内部値や provider 設定は表示しない。

future provider 前提:

- `openai_api` provider を実装する前に、明示 opt-in、prompt length guard、max candidates、max output、rate limit、cost cap、retry 有無を設計する。
- `openai_api` の retry は cost に直結するため、初回は retry なし、または cost cap 内の最大 1 回に限定する。
- Web search / deep research は同期 proposal API ではなく job 化候補とし、citation / freshness / cost / timeout / cancellation を別設計する。
- request-time provider selection は cost / abuse / consistency の観点から今回対象外とし、別設計を必要とする。

含めないもの:

- DB migration / Prisma schema 変更。
- per-user billing system。
- provider event log persistence。
- benchmark result DB table。
- `openai_api` provider 実装。
- Web search / deep research 実装。
- proposal から Pine generation / save / backtest / AI summary への自動連鎖。

## 16. 後続候補

- `openai_api` strategy proposal provider。
- Web search / deep research option。
- citation / freshness 表示。
- StrategyVersion created-from-proposal relation。
- proposal history filter / pagination / search / retention / full management。
- benchmark result DB table / prompt regression automation。
- proposal history export。
- symbol context から StrategyLab へ遷移する導線。
- distributed rate limit / hard cost cap / per-user billing。
- provider instrumentation 拡張（sanitized provider event / log persistence）。
- prompt versioning と regression tests。
- browser smoke / visual regression 対象化。

## 17. 参照

- StrategyLab 画面責務: `docs/仕様書/05_画面仕様.md`
- 画面導線: `docs/仕様書/04_画面導線_IA.md`
- API 方針: `docs/仕様書/03_API仕様.md`
- AI provider 運用: `docs/運用ドキュメント/05_AI_provider運用.md`
- Strategy proposal 品質評価運用: `docs/運用ドキュメント/11_Strategy_proposal品質評価運用.md`
- backlog: `docs/作業進捗管理/03_残課題_Backlog.md`
