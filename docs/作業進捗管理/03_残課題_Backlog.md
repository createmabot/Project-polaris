# 北極星 残課題 Backlog

更新日: 2026-05-17
分類: 作業進捗管理

## 1. 目的

本資料は、現時点で残している課題と後続判断候補をまとめる。詳細な背景は `docs/39`、`docs/44`、`docs/53`、機能別正本 docs を参照する。

## 2. docs / information architecture

- 旧 docs の注意書き追加範囲を拡張するか判断する。
- API sample docs と現行 routes / tests の対応を整理する。
- walkthrough の肥大化対策として、確認観点別 docs への分割を検討する。
- 既存番号 docs の archive 移動や rename は別 PR でリンク影響を確認してから判断する。
- legacy numbered docs は残るものがあるが、正本は `docs/仕様書/`、`docs/運用ドキュメント/`、`docs/作業進捗管理/` の新 docs 体系とする。

## 3. UI / UX

- StrategyVersionDetail、StrategyLab、SymbolDetail filter への小さな UI component 適用を判断する。
- DataList / SimpleTable / DataTable の導入可否を、実際に重複が増えた場所から判断する。
- BacktestDetail 全面 redesign は急がず、高頻度 section の小改善に留める。
- responsive UX の余白、情報密度、導線優先度を画面単位で整理する。

## 4. Daily operation UX stabilization 後続候補

PR #343〜#346 で daily operation UX stabilization は完了扱いにする。次に扱う場合は、以下を個別設計してから着手する。

既知制約 / follow-up:

- external symbol metadata provider lookup は未実装。現行は既存 Symbol の metadata 利用と、4桁数字の最小 fallback に限定する。
- references refresh はユーザー操作起点のみ。scheduled refresh、display-triggered refresh、batch refresh は未実装として維持する。
- SymbolDetail の CSVファイル import は frontend で text を読み込む方式。multipart upload は未実装として維持する。
- SymbolDetail の strategy picker は既存 strategies API を利用する。version picker は現時点では最小表示のままで、検索 / pagination は未実装として残す。
- visual required check の変更は行わない。visual regression 対象拡大は optional pilot の観測後に判断する。

次候補:

- external symbol metadata provider の設計。
- references refresh job / status history UX。
- 実際の TradingView CSV サンプルに基づく parser alias 拡張。
- strategy version picker の検索 / pagination。
- stable な範囲での daily ops browser smoke 拡張。

## 5. Report comparison / artifact

- CSV import report と internal backtest report の本格比較 UX を判断する。
- metrics normalization table は初回候補にしないが、比較要件が固まった場合に再検討する。
- AI summary comparison UX phase 2 は、既存 summary を read-only に並べる補助までに限定する。
- 本格 AI summary comparison、AI による summary 同士の比較文生成、comparison entity 拡張は後続判断とする。
- artifact metadata / retention / file access boundary の設計方針と UI path 非表示は完了済み。file access phase 1 は既存 internal_backtests engine_actual trades / equity JSON read endpoint に限定する。
- download permission boundary は本格実装前の設計境界まで完了済みであり、download / signed URL / file token / backend proxy を作るかは後続判断とする。
- metadata schema 拡張、retention job 設計、artifact diff UX は後続判断とする。
- arbitrary artifact file read、download、diff、JSON diff、retention job、cleanup job、hard delete、signed URL / file token、backend proxy、permission boundary 本格実装、audit log 本格化は未実装として残す。
- artifact download endpoint、signed URL、file token は未実装として残す。
- artifact retention job と hard delete は未実装として残す。

## 6. AI summary / provider operations

- display-triggered enqueue は現行では採用しない。
- phase 2 で BacktestDetail の latest job status read-only visibility は完了扱いにする。
- batch / scheduled job、自動 retry policy、polling / live update 本格化、cost cap、rate limit、provider opt-in 条件は後続判断とする。
- AI summary failed job auto retry は未実装として残す。
- AI summary polling / live update は未実装として残す。
- batch / scheduled AI summary generation は未実装として残す。
- missing / failed / stale summary は provider 再生成や polling ではなく、read-only status / note と手動生成導線で扱う。
- AI summary 自動比較生成、artifact metadata schema 拡張、artifact download permission boundary は後続判断とする。
- provider 生エラー、raw prompt、secret、local path を UI / docs / PR に出さない運用を継続する。
- ApplicationDetail row への AI summary job status 表示は、row が重くなるため今回見送った。必要になった場合は optional read-only field と表示密度を別途設計する。
- AI summary comparison を本格化する場合は、comparison route / entity、metrics normalization、AI generated comparison の責務を先に設計する。
- provider cost cap、rate limit、opt-in policy は auto enqueue や polling を拡張する前に運用判断する。
- provider cost / latency guard は運用方針整理までであり、本格的な cost cap、rate limit、opt-in、slow job 制御は未実装として残す。

## 7. Testing / CI

- Visual regression pilot は optional check として最小導入済み。対象は ApplicationDetail の application summary stable container 1 箇所に限定する。
- 本導入や対象拡大は後続判断とし、CI required check には追加しない。
- 現行 pilot 対象は ApplicationDetail の application summary stable container 1 件のみ。SymbolDetail を含むその他画面の visual snapshot は未実装として残す。
- dynamic timestamp、locale、seed ordering、raw JSON、AI text、external rendering を安定化または mask する必要がある。
- TradingView widget、AI生成文、raw JSON、long page、full page screenshot は pilot 対象外として維持する。
- browser smoke の対象拡張は、実行系操作や外部依存を含めない範囲から判断する。

## 8. Product / data model

- hard delete は未実装のまま維持する。
- favorite / last used / display priority などの richer metadata は後続判断とする。
- StrategyRuleMetadata table の追加は急がない。
- SymbolBacktestDetail / StrategyBacktestDetail の新規画面は後続判断とする。
- 大量データ時の index / read model / cache は未実装として残す。

## 8-1. LLM strategy proposal

LLM strategy proposal は、StrategyLab で検証候補を提案し、選択した候補を natural language spec に反映する導線として初回実装済みである。PR #352〜#353 で provider boundary phase、PR #356〜#357 で local_llm provider implementation、PR #359〜#360 で quality evaluation phase、PR #362〜#363 で provider instrumentation phase、PR #365〜#366 で prompt regression / provider benchmark phase まで完了扱いにする。投資助言ではなく、backtest / user review 前提の候補提案として扱う。

完了範囲:

- StrategyLab の「ストラテジーを提案」入口。
- deterministic stub provider。
- default stub + local_llm opt-in provider selection。
- quality evaluation runbook と validation / failure path test coverage。
- optional `provider_observation` metadata と StrategyLab の最小 provider note / error note。
- benchmark design / fixed scenario set、code fixture、optional benchmark script。
- optional script は `pnpm --filter backend strategy-proposal:benchmark`。default provider は env-independent `stub`。
- `local_llm` benchmark は manual optional only であり required check ではない。
- benchmark output は sanitized stdout summary のみで、raw prompt / raw response / endpoint / secret / local path は出さない。
- UI では 5 件の proposal candidates を要求し、API は `proposal_count` 最大 10 件まで受ける。
- candidate 選択時の title / natural language spec 反映。
- candidate 選択時に古い generated result / backtest / CSV import state を無効化する。
- Pine generation / Strategy保存は既存 button / form 操作を維持。

後続判断:

- benchmark result recording workflow / sanitized summary records。
- provider quality trend aggregation。
- openai_api provider。
- Web search / deep research job 化。
- proposal history / selected proposal lineage。
- provider cost / rate guard hardening。
- sanitized provider event log persistence。
- prompt regression automation。
- request-time provider selection、optional fallback metadata。
- auto Pine generation / auto save は引き続き対象外。

local_llm provider design PR 1 の docs-only 固定:

- proposal 専用 provider selector は `STRATEGY_PROPOSAL_PROVIDER=stub|local_llm` とし、未指定 default は `stub` とする。
- local_llm provider は StrategyLab の一時 proposal candidates 生成だけを担当し、Strategy / StrategyVersion 保存、Pine generation、backtest、AI summary を自動起動しない。
- local_llm endpoint / model / timeout / max output は proposal 専用設定で分離する。実値は docs / PR / UI / response に出さない。
- local_llm output は既存 `strategy_proposal_candidates` schema に正規化し、UI に出す前に既存 provider response validation を必ず通す。
- 初回 local_llm 実装では silent stub fallback を行わず、timeout、provider unavailable、malformed JSON、schema invalid は provider error とする。fallback option は後続設計として残す。
- `openai_api`、Web search / deep research、request-time provider selection、proposal history、auto Pine generation / auto save は後続候補として残す。

local_llm provider PR 2 の実装範囲:

- `STRATEGY_PROPOSAL_PROVIDER=stub|local_llm` による env provider selection を実装済み。未指定 default は `stub`。
- local_llm provider は `/api/chat` に JSON response を要求し、既存 `strategy_proposal_candidates` schema に合わせる。
- local_llm output は UI に返す前に既存 provider response validation を必ず通す。
- malformed JSON、schema invalid、candidate count invalid、Web research basis、provider unavailable、timeout は generic provider failure として扱う。
- StrategyLab proposal selection と manual Pine generation 導線は維持する。
- DB / Prisma schema change は行っていない。
- 投資助言ではなく、backtest / user review 前提の検証候補として扱う。
- silent stub fallback、openai_api、Web search / deep research、request-time provider selection、proposal history、auto Pine generation / auto save は未実装として残す。

provider expansion PR 1 の docs-only 固定:

- provider boundary は `docs/仕様書/11_LLM_Strategy_Proposal仕様.md` を正本とし、route 層で request / response schema validation、error sanitization、fallback 表示責務を持つ。
- stub 以外の provider は timeout、fallback、cost cap、rate limit、prompt length guard、safety validation を先に固定してから実装する。
- Web search / deep research は引き続き out of scope。`source_type=web` は将来予約であり、現行 provider expansion の前提にしない。
- proposal は StrategyLab の一時候補であり、Strategy / StrategyVersion 保存、Pine generation、backtest、AI summary を自動起動しない。

provider boundary 実装範囲:

- deterministic stub provider は provider boundary 配下に整理済み。
- route 層の request validation と provider response validation は導入済み。
- user input 由来の投資助言風表現は request `VALIDATION_ERROR` にせず、入力として許容する。provider output 由来の invalid enum、Web research basis、schema / type / format / candidate count 不正は `PROVIDER_INVALID_RESPONSE` として扱うが、単なる投資助言風 wording だけでは reject しない。0 candidates は既存 UI の EmptyState で扱う。
- `user_hint` の長文 bounding と、`strategy_type_bias=other` の empty candidates 維持は完了済み。
- 安全のために検証候補を狭めすぎず、売買推奨ではなく backtest / user review 前提であることを UI / docs で明示する。

quality evaluation PR 1 の docs-only 固定:

- Strategy proposal quality evaluation は `docs/運用ドキュメント/11_Strategy_proposal品質評価運用.md` を manual runbook の正本とする。
- 自動検査しやすい項目は schema validity、candidate count、enum / required fields、invalid JSON / schema invalid response rate、latency / timeout / provider failure rate とする。
- 手動評価項目は diversity、user_hint alignment、market / timeframe assumption、entry / exit、risk management、invalidation condition、Pine feasibility、backtest caution、uncertainty、unsupported claim risk、検証候補として提示されているかとする。
- stub は deterministic baseline、local_llm は明示 opt-in の比較対象とし、local_llm 実体依存 test は required check に入れない。
- 投資助言風 wording は一律 reject せず、売買推奨ではなく backtest / user review 前提の検証候補として扱えているかを評価する。
- 現行 StrategyLab proposal flow には sanitized provider event、duration bucket、error category の構造化 log はない。quality evaluation は UI / API observable checks に寄せる。
- 評価記録には raw prompt、raw response、endpoint、model 実値、secret、local path、stack trace を残さない。

quality evaluation PR 2 の validation / test coverage 完了範囲:

- schema / format / length / type validation は維持する。
- valid provider response の required fields / enum / candidate count を確認する。
- invalid JSON / malformed JSON、required field 欠落、enum 不正、candidate count 不正、schema invalid は provider invalid response として扱う。
- timeout / unavailable は UI / API を壊さず provider error として扱う。
- user_hint 長文 bounding と investment-advice-like wording 許容を確認する。
- provider output の investment-advice-like wording は wording だけでは provider invalid にしない。
- 0 candidates は EmptyState 用 success response として維持する。
- local_llm 実体依存 test は required check に入れない。

UI追加判断:

- StrategyLab UI は既に「検証候補」「売買推奨ではない」「Pine生成 / backtest は手動」の copy と provider error 表示を持つため、quality evaluation phase では追加 UI 変更を不要と判断する。

instrumentation / cost guard design PR 1 の docs-only 固定:

- 初回実装候補は `POST /api/strategy-lab/proposals` の optional metadata と sanitized provider event とし、DB 永続化、proposal history、job 化は行わない。
- metadata 候補は provider name、selected_by、elapsed_ms / latency bucket、status、candidate_count、invalid_reason、validation_error_count、fallback_used / fallback_reason、schema_valid とする。
- request started at の raw timestamp、model 実値、raw prompt、raw response、endpoint、secret、token、local path、stack trace は response / UI / docs / PR に出さない。
- UI 表示は最小 provider note に留める。
- local_llm は latency / timeout / max output を主な guard とする。
- openai_api を導入する場合は、明示 opt-in、max candidates、max output、rate limit、cost cap、prompt length guard、retry 方針を先に固定する。
- request-time provider selection は cost / abuse / consistency の観点から別設計に分ける。
- Web search / deep research は同期 proposal API ではなく job 化候補として扱う。
- CI は mock / fake response で metadata 分類を検査し、local_llm 実体依存 test は required check に入れない。

instrumentation metadata PR 2 の実装範囲:

- `POST /api/strategy-lab/proposals` の success response に optional `provider_observation` を追加済み。
- provider error response も返す場合は `error.details.provider_observation` の sanitized enum / count / bucket に限定する。
- `provider_observation` は provider name、selected_by、elapsed_ms / latency bucket、status、candidate_count、invalid_reason、validation_error_count、fallback_used / fallback_reason、schema_valid、model category を持つ。
- StrategyLab UI は provider status、latency、fallback、schema の最小 note だけを表示する。
- raw prompt、raw response、endpoint、model 実値、secret、token、local path、stack trace は response / UI / docs / PR に出さない。

instrumentation / cost guard の後続:

- sanitized provider event log、DB 永続化、trend 集計、cost / rate guard、optional fallback metadata は未実装として残す。

prompt regression / provider benchmark phase の完了整理:

- benchmark は `stub` / `local_llm` / future `openai_api` / future Web search・deep research を比較対象候補とする。
- required check は mock / fake response による automated validation に限定し、real provider 依存 benchmark は manual / optional とする。
- `provider_observation` の status、latency_bucket、candidate_count、invalid_reason、validation_error_count、schema_valid、fallback_used を status / latency / candidate_count / validation / fallback style observation の記録軸にする。
- scenario set は `generic_default`、`jp_stock_daily`、`us_stock_daily`、`short_swing`、`long_trend_following`、`mean_reversion`、`breakout`、`volatility`、`conservative_risk`、`aggressive_risk`、`concrete_user_hint`、`vague_user_hint`、`long_user_hint`、`advice_like_wording` に固定済み。
- 投資助言風 wording は wording だけで reject せず、検証候補として提示されているかを見る。
- optional benchmark PR 2 で scenario fixture と `pnpm --filter backend strategy-proposal:benchmark` を追加済み。required check には入れず、real provider は manual optional とする。
- script default provider は env-independent `stub` とする。
- `local_llm` benchmark は manual optional only とし、required check にはしない。
- output は sanitized stdout summary のみとし、raw prompt / raw response / endpoint / secret / local path を出さない。
- DB / Prisma schema は変更していない。
- 実測 raw output は原則 commit せず、必要な場合も sanitized summary のみを progress docs に残す。
- raw prompt、raw response、endpoint、model 実値、secret、local path、stack trace は docs / PR / output に出さない。

proposal history / selected proposal lineage design PR 1 の docs-only 固定:

- proposal history は generation run と candidates、selected candidate を後から確認するための履歴として扱う。
- 初回実装方針は `StrategyProposalRun` / `StrategyProposalCandidate` 相当の新規 model 追加を第一候補にする。
- selected だけではなく全候補保存を第一候補にする。比較文脈と provider quality 観測を残すため。
- provider_observation は sanitized metadata のみ保存する。
- user_hint は raw prompt ではなく bounded / sanitized request input として扱う。最終保存有無は実装 PR で確認する。
- candidate JSON は normalized schema のみ保存し、raw provider response は保存しない。
- raw prompt、raw provider response、provider secret、endpoint、model 実値、local path、stack trace は保存しない。
- local_llm failure / invalid response は candidates なしの failed run として sanitized status / reason を残す方針を第一候補にする。request validation error は保存対象外を第一候補にする。
- `POST /api/strategy-lab/proposals` は後方互換を維持し、history id を返す場合も optional field にする。
- 初回 API 候補は recent list の `GET /api/strategy-lab/proposals`、detail の `GET /api/strategy-lab/proposals/:proposalRunId`、selection の `POST /api/strategy-lab/proposals/:proposalRunId/select` とする。
- 初回 UI は StrategyLab の「最近の提案」程度に留める。filter / pagination / large history management は後続判断にする。
- `selected_strategy_id` / `selected_strategy_version_id` / `StrategyRuleVersion.createdFromProposalCandidateId` は初回では入れず、後続 lineage relation として判断する。
- 実装 PR では DB migration / Prisma schema change が必要。migration、backend API、frontend UI、tests を docs-only PR から分ける。
- local_llm 実体依存 test は required check に入れない。
- proposal から Pine generation、StrategyVersion 自動保存、backtest、AI summary への自動連鎖は引き続き対象外。

初回ではやらないこと:

- DB migration / proposal entity。
- proposal から StrategyVersion への自動保存。
- proposal から Pine generation への自動連鎖。
- Web search 必須化。
- 投資助言風 wording だけを理由に proposal 候補を過剰に狭めること。
- provider raw diagnostics、raw prompt、credential、local path の UI / docs / PR 表示。

## 9. Strategy proposal benchmark 後続課題

prompt regression / provider benchmark は optional script と fixed scenario set まで完了済みである。次に扱う場合は、以下を個別設計してから着手する。

- benchmark result recording workflow / sanitized summary records。
- provider quality trend aggregation。
- `openai_api` provider。
- Web search / deep research job 化。
- proposal history / selected proposal lineage。
- provider cost / rate guard hardening。
- sanitized provider event log persistence。
- prompt regression automation。
- auto Pine / auto save は引き続き out of scope。

## 10. 次期フェーズ候補の優先度

| 優先度 | 候補 | 理由 |
|---|---|---|
| 1 | Release / operations stabilization | 現行完成範囲を安全に出すため、required checks、docs-only acceptance、manual walkthrough、provider failure 運用を先に安定化する。 |
| 2 | AI quality / cost operations | auto enqueue と latest job visibility 後の cost cap、rate limit、provider opt-in、failure analysis、retry 方針を整理する。 |
| 3 | LLM strategy proposal provider operations | optional benchmark script 後に benchmark result recording workflow、provider quality trend aggregation、openai_api、sanitized provider event log persistence、cost / rate guard、fallback metadata を個別設計してから段階判断する。 |
| 4 | Artifact operations phase 2 | download / signed URL / file token / retention / diff は権限境界が重いため、個別設計してから実装判断する。 |
| 5 | Report comparison phase 3 | read-only helper の利用実績を見て、comparison entity、metrics normalization、自動比較生成の要否を判断する。 |

継続候補:

- Visual regression expansion は optional pilot の snapshot churn と実行時間を見て判断する。
- TradingView / Pine workflow 強化は現行 release stabilization 後に優先度を再評価する。

## 11. Backlog 更新ルール

- 完了したら `docs/作業進捗管理/02_完了フェーズ.md` と該当正本 docs へ移す。
- 仕様判断が必要な課題は `docs/仕様書/` または機能別正本 docs へ詳細を書く。
- 単なる思いつきは backlog に入れず、実装判断に必要な背景と見送り理由を残す。

## 12. 関連 docs

- `docs/39.北極星 MVP後ロードマップ・バックログ整理.md`
- `docs/53.北極星 P3現在地と残課題整理（P3）.md`
- `docs/56.北極星 AI summary 自動生成運用設計（次フェーズ）.md`
- `docs/運用ドキュメント/08_AI_summary自動生成運用.md`
- `docs/運用ドキュメント/09_artifact_metadata_retention運用.md`
- `docs/作業進捗管理/07_AI_summary自動生成phase1完了.md`
- `docs/作業進捗管理/04_設計判断ログ.md`
- `docs/運用ドキュメント/10_release_acceptance_checklist.md`
