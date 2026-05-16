# 北極星 LLM strategy proposal 現行設計

更新日: 2026-05-16
分類: 仕様書

## 1. 目的

本資料は、StrategyLab で AI がストラテジー候補を提案する LLM strategy proposal の初回設計を整理する。現時点では「投資助言」ではなく、ユーザーが検証するための strategy idea 候補を構造化して提示し、選択した候補を既存 StrategyLab の natural language spec に反映する導線を対象にする。

Pine 生成、Strategy / StrategyVersion 保存、validation、CSV import、internal backtest、Backtest report、AI summary auto-generation は既存仕様を維持する。proposal から Pine 生成や保存へ自動連鎖しない。

## 2. 体験設計

### 2-1. 入口

初回実装候補では、StrategyLab の rule input 付近に「ストラテジーを提案」導線を置く。

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

候補は 3〜5 件から初回実装し、将来 5〜10 件へ広げる。UI は card / compact list のどちらでもよいが、各候補で次を読める必要がある。

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

Web search / deep research を後続で扱う場合の方針:

- provider option として明示的に分ける。
- 同期長時間処理ではなく job 化を第一候補にする。
- citation URL、取得時刻、freshness、source reliability を response に含める。
- 引用元がない market assertion は uncertainty に明記する。
- timeout / provider failure 時は partial result または stub fallback を明示する。
- cost / latency が高くなるため、opt-in、rate limit、cost cap を先に設計する。
- 投資助言に見える断定表現を禁止し、backtest required / user review required を UI と docs に出す。

初回で採用しないもの:

- Web search 必須の提案。
- deep research の同期処理。
- citation 保存を伴う proposal history。
- provider による銘柄推奨の断定。

## 5. provider / API 境界

### 5-1. 初回実装候補

初回実装する場合は、次の小さな backend boundary を候補にする。

- `POST /api/strategy-lab/proposals`
- request: market / timeframe / symbol_code / risk_preference / strategy_type_bias / proposal_count / user_hint
- response: `strategy_proposal_candidates` schema
- provider: `stub` または deterministic local provider
- DB 保存: しない
- job 化: しない

provider が失敗しても StrategyLab の既存 save / Pine generation / validation flow は壊さない。proposal failure は proposal section の ErrorState / InlineNotice に閉じる。

### 5-2. provider boundary

既存 `HOME_AI_PROVIDER=stub|local_llm|openai_api` は Home / Symbol / Comparison / Backtest / Pine generation で使われている。strategy proposal は同じ provider 設定を再利用するか、将来 `STRATEGY_PROPOSAL_PROVIDER` を切るかを実装時に判断する。

初回は cost / latency / safety の観点から `stub` 相当を第一候補にする。`local_llm` / `openai_api` を使う場合は、prompt / response sanitization、timeout、fallback、error redaction、投資助言 disclaimer を先に固定する。

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

禁止する表現:

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

## 9. 初回実装スコープ候補

実装する場合の最小範囲:

1. `POST /api/strategy-lab/proposals` を追加する。
2. deterministic stub provider で 3〜5 件の proposal candidates を返す。
3. StrategyLab に「ストラテジーを提案」section を追加する。
4. market / timeframe / risk preference / strategy type bias / optional hint を入力できるようにする。
5. candidate を選択すると natural language spec に反映する。
6. Pine generation は既存 button を使い、proposal 選択では自動実行しない。
7. tests / walkthrough / docs を更新する。

初回でやらないこと:

- DB migration / proposal history entity。
- Web search / deep research。
- provider cost cap の本格実装。
- strategy proposal job 化。
- proposal から Strategy / StrategyVersion への自動保存。
- proposal から Pine generation への自動連鎖。
- 投資助言に見える断定表現。

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
