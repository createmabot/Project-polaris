# 北極星 LLM strategy proposal 現行設計

更新日: 2026-05-16
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

初回実装は、次の小さな backend boundary として扱う。

- `POST /api/strategy-lab/proposals`
- request: market / timeframe / symbol_code / risk_preference / strategy_type_bias / proposal_count / user_hint
- response: `strategy_proposal_candidates` schema
- provider: deterministic `stub`
- DB 保存: しない
- job 化: しない

provider が失敗しても StrategyLab の既存 save / Pine generation / validation flow は壊さない。proposal failure は proposal section の ErrorState / InlineNotice に閉じる。

### 5-2. provider boundary

既存 `HOME_AI_PROVIDER=stub|local_llm|openai_api` は Home / Symbol / Comparison / Backtest / Pine generation で使われている。strategy proposal は同じ provider 設定を再利用するか、将来 `STRATEGY_PROPOSAL_PROVIDER` を切るかを実装時に判断する。

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
- Web search / deep research、proposal history、DB保存、job化、Pine generation 自動連鎖は未実装のまま維持する。

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
- local_llm endpoint、model、timeout、max output は proposal 専用 env で切れる。`STRATEGY_PROPOSAL_LOCAL_LLM_ENDPOINT`、`STRATEGY_PROPOSAL_LOCAL_LLM_MODEL`、`STRATEGY_PROPOSAL_LOCAL_LLM_TIMEOUT_MS`、`STRATEGY_PROPOSAL_LOCAL_LLM_MAX_OUTPUT_CHARS` を使う。
- endpoint / model は proposal 専用 env がなければ既存 local LLM env の値を使い、最後に実装 default へ fallback する。
- endpoint や model の実値は docs / PR / UI / client response に出さない。運用確認では設定有無と sanitized status のみを扱う。

timeout / max output / fallback 方針:

- local_llm 選択時は短い timeout を provider adapter 境界で必ず設定する。
- max output は既存 schema と `proposal_count` 最大 10 に収まる上限を設け、過大 response は parse 前または validation 前に失敗として扱う。
- local_llm 実装では、timeout、provider unavailable、malformed JSON、schema invalid、candidate count invalid、Web search 未実装時の web research basis を provider error として扱う。
- local_llm 実装では silent stub fallback を行わない。`STRATEGY_PROPOSAL_PROVIDER=local_llm` を選んだ場合の失敗は proposal section の generic failure として返す。
- 設計上は fallback option を後続候補として残す。fallback を実装する場合は opt-in とし、provider metadata に fallback であることを明示する。

prompt / response JSON 方針:

- prompt は既存 request validation 済み input から構築し、raw user_hint や raw prompt を log / UI / API response に出さない。
- response は structured JSON 相当を要求し、route 層で既存 `validateStrategyProposalData` 相当の validation を必ず通してから UI に返す。
- malformed JSON、schema_name / schema_version 不一致、型不正、必須項目欠落、enum 不正、candidate count 不正、空または過度に短い `suggested_natural_language_spec` は provider invalid response とする。
- provider output の投資助言風 wording は wording だけでは invalid にしない。危険・不正・アプリ目的外の response は provider invalid として扱える。
- provider endpoint、raw prompt、raw response、stack trace、credential、local path は API response、UI、docs、PR本文に出さない。

local_llm provider PR 2 で実装しないもの:

- `openai_api` strategy proposal provider。
- Web search / deep research。
- request-time provider selection。
- proposal history DB persistence。
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

- external provider を使う場合は、短い timeout を route または provider adapter 境界で必ず設定する。
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

初回は proposal candidates を DB 保存しない。一時 UI 表示に留め、ユーザーが選択した候補を existing StrategyLab input に反映する。

保存しない理由:

- proposal history entity には DB migration、privacy、prompt / response retention、citation freshness の設計が必要になる。
- 検証候補と実際に保存した StrategyVersion の責務が混ざりやすい。
- 初回価値は「候補から natural language spec を作る」ことで確認できる。

後続で保存を検討する場合:

- proposal history entity を追加するか。
- selected proposal だけ StrategyVersion metadata として残すか。
- prompt / response / citations を保存する場合の retention と redaction。
- AI job / summary 基盤を使うか、strategy proposal 専用 job を作るか。
- selected proposal から作成された StrategyVersion との lineage をどう持つか。

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
7. tests / walkthrough / docs を更新する。

初回でやらないこと:

- DB migration / proposal history entity。
- Web search / deep research。
- provider cost cap の本格実装。
- strategy proposal job 化。
- proposal から Strategy / StrategyVersion への自動保存。
- proposal から Pine generation への自動連鎖。
- 投資助言風 wording だけを理由に proposal 候補を過剰に狭めること。

## 10. 後続候補

- `local_llm` / `openai_api` strategy proposal provider。
- Web search / deep research option。
- citation / freshness 表示。
- proposal history / selected proposal lineage。
- symbol context から StrategyLab へ遷移する導線。
- provider cost cap / rate limit / opt-in。
- proposal quality evaluation。
- prompt versioning と regression tests。
- browser smoke / visual regression 対象化。

## 11. 参照

- StrategyLab 画面責務: `docs/仕様書/05_画面仕様.md`
- 画面導線: `docs/仕様書/04_画面導線_IA.md`
- API 方針: `docs/仕様書/03_API仕様.md`
- AI provider 運用: `docs/運用ドキュメント/05_AI_provider運用.md`
- backlog: `docs/作業進捗管理/03_残課題_Backlog.md`
