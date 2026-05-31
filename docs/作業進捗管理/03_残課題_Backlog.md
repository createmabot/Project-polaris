# 北極星 残課題 Backlog

更新日: 2026-05-26
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

- UI/UX production readiness phase 1 では AppLayout / Navigation / SideRail / Home / SymbolDetail / StrategyLab の見た目と情報階層を改善済みである。
- UI/UX production readiness phase 2 では ApplicationDetail / BacktestDetail / StrategyDetail / StrategyVersionDetail / BacktestComparisonDetail の検証・履歴系画面を改善済みである。
- UI/UX production readiness phase 3 では、Phase 1 / Phase 2 の実装で実際に重複した surface 表現だけを `Surface` component として最小整理済みである。
- UI/UX production readiness acceptance smoke では、Phase 1 / 2 / 3 後の主要画面を browser smoke 観点で確認済みである。リリースを止める大きな UI 退行は確認されていない。
- SideRail compact density improvement では、監視 / 保有一覧を軽い compact list に寄せ、表示見出し、詳細管理リンク、補助説明を削り、折りたたみ / 編集 / 削除を icon button 化する範囲まで完了扱いにする。API / backend / AppLayout collapsed grid 挙動は変更しない。
- Home compact daily workspace では、日次確認の大型説明 section を削除し、マーケット概況 / AIデイリーサマリー / 最新アラート / 投資カレンダーを compact 表示へ寄せる範囲まで完了扱いにする。Home / SymbolDetail の投資カレンダーは同じ compact calendar grid UX に揃え、SymbolDetail は対象銘柄 event に限定する。`/api/home` / symbol calendar response shape、API、backend は変更しない。
- Home 実運用 UI 改善では、Home top hero header と比較 / StrategyLab CTA を削除し、AIデイリーサマリー切り替えを summary 専用 API による section-local update にした。マーケット概況は `market_overview.indices` 互換 field を fixed master 由来の `主要指標` として表示し、recent alerts 由来の個別銘柄は `最新アラート` section に限定する。後続候補は本格 market data provider、market overview 表示対象の user customization、fixed master 管理 UI、freshness / stale 表示の本格化、summary section のより細かい skeleton 表示、直近切替結果の小さな cache に限定する。
- Core screens compact density pass では、SymbolDetail / ApplicationDetail / BacktestDetail / StrategyLab / StrategyVersionDetail / StrategyDetail / BacktestComparisonDetail / StrategyList / BacktestList の PageHeader、SectionCard、Surface、list card の余白を一段詰める範囲まで完了扱いにする。API / backend / provider / job / mutation 挙動は変更しない。
- DataList / SimpleTable / DataTable の導入可否を、実際に重複が増えた場所から判断する。
- BacktestDetail 全面 redesign は急がず、高頻度 section の小改善に留める。
- responsive UX の余白、情報密度、導線優先度を画面単位で整理する。
- Visual regression 対象拡大は optional pilot の実行負荷と snapshot churn を見てから判断し、required check 化しない。

## 4. Daily operation UX stabilization 後続候補

PR #343〜#346 で daily operation UX stabilization は完了扱いにする。次に扱う場合は、以下を個別設計してから着手する。

既知制約 / follow-up:

- external symbol metadata provider lookup は未実装。現行は既存 Symbol の metadata 利用と、4桁数字の最小 fallback に限定する。
- references refresh はユーザー操作起点のみ。scheduled refresh、display-triggered refresh、batch refresh は未実装として維持する。
- SymbolDetail の CSVファイル import は frontend で text を読み込む方式。multipart upload は未実装として維持する。
- SymbolDetail の strategy picker は既存 strategies API を利用する。version picker は現時点では最小表示のままで、検索 / pagination は未実装として残す。
- SymbolDetail related references は日本語 type badge / title / summary の読みやすい card 表示と、保存前 / API 返却時 / AI 論点入力時の title / summary sanitization まで完了。後続候補は既存 external references の optional cleanup script / backfill、source reliability、dedupe、importance、filter / pagination、参照 source の品質表示であり、raw provider response や raw URL 本文表示は引き続き行わない。
- visual required check の変更は行わない。visual regression 対象拡大は optional pilot の観測後に判断する。

次候補:

- external symbol metadata provider の設計。
- references refresh job / status history UX。
- 実際の TradingView CSV サンプルに基づく parser alias 拡張。
- strategy version picker の検索 / pagination。
- stable な範囲での daily ops browser smoke 拡張。

## 5. Report comparison / artifact

- CSV import report と internal backtest report の本格比較 UX を判断する。
- Close internal backtest UI phase 1 では SymbolDetail / StrategyVersionDetail の新規実行 UI を閉じ、TradingView / Pine / CSV import を主導線に寄せた。
- Internal backtest backend deprecation Stage 2C cleanup は完了済み。残課題は、historical internal report の read-only 表示が Backtest snapshot だけで維持されることを通常の Backtest / ApplicationDetail 回帰で見続けることに限定する。
- metrics normalization table は初回候補にしないが、比較要件が固まった場合に再検討する。
- AI summary comparison UX phase 2 は、既存 summary を read-only に並べる補助までに限定する。
- 本格 AI summary comparison、AI による summary 同士の比較文生成、comparison entity 拡張は後続判断とする。
- artifact metadata / retention / file access boundary の設計方針と UI path 非表示は完了済み。Stage 2C cleanup 後、internal backtest artifact endpoint / table は存在せず、historical report では BacktestDetail の artifact pointer read-only 表示に限定する。
- download permission boundary は本格実装前の設計境界まで完了済みであり、download / signed URL / file token / backend proxy を作るかは後続判断とする。
- metadata schema 拡張、retention job 設計、artifact diff UX は後続判断とする。
- arbitrary artifact file read、download、diff、JSON diff、retention job、cleanup job、hard delete、signed URL / file token、backend proxy、permission boundary 本格実装、audit log 本格化は未実装として残す。
- artifact download endpoint、signed URL、file token は未実装として残す。
- artifact retention job と hard delete は未実装として残す。

## 6. AI summary / provider operations

- AI quality / cost operations の docs-only 設計整理は完了済み。現時点では自動化拡張ではなく、quality / cost / retry / polling / provider opt-in の境界を維持する。
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

継続見送り:

- `openai_api` provider 実装。
- Web search / deep research job。
- Codex CLI local worker / automatic spawn。
- AI summary failed job auto retry。
- polling / live status update。
- batch / scheduled AI summary generation。
- provider billing。
- distributed rate limit / hard cost cap / per-user billing。
- provider quality trend materialized aggregation、p50 / p95 / percentile dashboard。
- request-time provider selection。

実装前に追加設計が必要:

- `openai_api` provider の explicit opt-in、secret handling、prompt length guard、cost cap、retry upper bound。
- scheduled / batch AI summary の trigger、duplicate guard、停止条件、cost control。
- polling / live update の interval、最大回数、停止条件、UI 表示密度。
- provider event log based quality trend upgrade。
- benchmark result DB table。
- Web search / deep research job の citation、freshness、source retention、timeout、cancellation、cost。
- request-time provider selection の abuse prevention、consistency、cost visibility。

小さく実装してよい候補:

- docs / runbook の更新。
- sanitized provider event read API の確認手順拡充。
- optional benchmark の fake / stub scenario 追加。
- real provider を required check にしない範囲の mock / fake validation test 追加。

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
- Pine generation の初回 market / timeframe 拡張は `JP_STOCK|US_STOCK` と canonical `D|4H|1H` まで完了済みである。`1D` は `D` alias として正規化する。internal backtest engine の市場 / 時間足対応拡張、market data provider 拡張、FX / CRYPTO、15M / 30M、TradingView compile 自動実行は後続判断にする。
- Pine generation は LLM-first の generator -> reviewer -> repair pipeline へ移行済みである。deterministic generator は baseline / emergency fallback / test fixture として残し、LLM output は deterministic reviewer / optional AI reviewer provider boundary、既存 validation / normalization、bounded repair を通す。deterministic reviewer は明らかな syntax / style / safety issue を structured issue として検出し、AI reviewer は generated Pine を structured issue として review する。raw reviewer response は保存・表示しない。reviewer issue は priority mapping により severity `error`、repairable、priority > 0 の selected issue 最大 3 件だけを bounded repair の入力にし、warning-only / priority 0 の quality issue は repair を起動しない。 AI reviewer provider failure は deterministic reviewer pass 時に non-blocking warning とし、semantic hardening として generic setup-state premature reset、Donchian current-bar self-reference、entry-time ATR not persisted を reviewer issue に追加済みである。 targeted repair templates は selected issue の internal prompt 補助として追加済みで、entry guard、entry-time ATR persistence、stop order guard、setup-state reset、ADX / DMI、Donchian、unsupported function alias の修復を template 優先で誘導する。safe strategy coding prompt rule として、guarded `strategy.entry` / `strategy.exit`、long-only / no-pyramiding entry の flat guard、position open 直後の entry-time ATR `var` capture、open から flat への transition reset、setupActive entry block の reset、position open 中かつ entry-time state available の場合だけ stop price を計算する rule、actual entry price として position open 後の `strategy.position_avg_price` を stop loss 基準にする rule、`entry_price := close` の無断代替禁止、ATR stop は `strategy.exit(..., stop=...)` 優先、manual bar-based stop 明示時以外の `low <= stopLossPrice` + `strategy.close()` 回避、entry block 内の `strategy.position_avg_price` stop 計算禁止、percentage stop は position open 中の `strategy.position_avg_price` 基準で計算し ATR が明示されない限り `entryAtr` / `ta.atr` を混入させず top-level `stopLossPrice` 計算を避ける rule、RSI / oscillator threshold direction 維持、setup -> trigger の state variable 利用、below wording の状態条件扱い、overlay price chart で oscillator plot を既定では出さない rule、`color.color.*` / `plot.style_dashed` / `ta.crossabove` / `ta.crossbelow` 回避、stop loss plot の position / `na` guard、`strategy.exit(... stop=stopLossPrice)` の `not na(stopLossPrice)` guard、stopLossPrice plot の outer typed declaration、ADX / DMI unsafe pattern 抑制、unused state 抑制、generated_script comment を短い section comment に限定する rule、volume plot 原則なし、limitations の warnings / assumptions 明記を docs に固定済み。real local_llm / OpenAI / TradingView は manual smoke に限定し、required check は fake / deterministic tests を使う。TradingView compile automation、TradingView 自動保存、auto backtest / AI summary 自動連鎖は後続判断にする。
- StrategyLab / StrategyVersionDetail の Pine generation progress は job-based に更新済みである。start endpoint で job を開始し、status polling endpoint で queued / running / succeeded / failed と backend stage を確認する。stage は generator -> reviewer -> repair -> validation / persistence を sanitized に示す。既存 sync endpoint は互換維持のため残す。SSE / WebSocket / streaming、TradingView compile、auto Pine / save / backtest / AI summary は導入しない。endpoint / model / raw prompt / raw provider response / raw reviewer response も表示しない。

## 8-1. LLM strategy proposal

LLM strategy proposal は、StrategyLab で検証候補を提案し、選択した候補を natural language spec に反映する導線として初回実装済みである。PR #352〜#353 で provider boundary phase、PR #356〜#357 で local_llm provider implementation、PR #359〜#360 で quality evaluation phase、PR #362〜#363 で provider instrumentation phase、PR #365〜#366 で prompt regression / provider benchmark phase、PR #368〜#370 で proposal history / selected proposal lineage phase まで完了扱いにする。投資助言ではなく、backtest / user review 前提の候補提案として扱う。

完了範囲:

- StrategyLab の「ストラテジーを提案」入口。
- deterministic stub provider。
- default stub + local_llm opt-in provider selection。
- quality evaluation runbook と validation / failure path test coverage。
- optional `provider_observation` metadata と StrategyLab の最小 provider note / error note。
- benchmark design / fixed scenario set、code fixture、optional benchmark script、gitignore 済み sanitized summary record output。
- `StrategyProposalRun` / `StrategyProposalCandidate` による sanitized generation run / candidates 保存。
- `POST /api/strategy-lab/proposals` の後方互換維持と optional `proposal_run_id` / `history.proposal_run_id`。
- proposal history recent list / detail / selection API。
- failed provider invalid response の sanitized failed run 保存。
- StrategyLab の「最近の提案」最小 UI。
- optional script は `pnpm --filter backend strategy-proposal:benchmark`。default provider は env-independent `stub`。
- `local_llm` benchmark は manual optional only であり required check ではない。
- benchmark output は sanitized stdout summary と optional sanitized summary record のみに限定し、raw prompt / raw response / endpoint / model 実値 / secret / local path / user_hint 全文 / candidate 自由文本文は出さない。
- UI では 5 件の proposal candidates を要求し、API は `proposal_count` 最大 10 件まで受ける。
- candidate 選択時の title / natural language spec 反映。
- candidate 選択時に古い generated result / backtest / CSV import state を無効化する。
- Pine generation / Strategy保存は既存 button / form 操作を維持。
- provider quality trend aggregation。既存 history と sanitized `provider_observation` から read-only 集計し、StrategyLab の「最近の提案」内に compact trend note を表示する。
- provider cost / rate guard hardening。local_llm timeout / max output の bounded env guard、required_field_missing retry 最大 1 回、proposal route の in-memory per-process rate guard、429 rate limited UI message、future openai_api / Web search 前の cost / rate / opt-in 方針整理まで完了済み。
- Codex CLI manual JSON import。`openai_api` provider ではなく manual generated result import として、Codex CLI 用 prompt 作成、JSON paste / file text import、複数候補 validation、`codex_cli_manual` history 保存、既存 candidate cards / selection API 連携まで完了済み。
- Codex CLI manual import の Web検索付き prompt option。StrategyLab の checkbox と prompt endpoint の optional `web_search_prompt` により、Codex CLI 側でユーザーが手動 Web 検索を使える場合の注意文を prompt に追加できる。import endpoint / schema / provider observation / event log は変更せず、北極星側では Web 検索済みかどうかを識別しない。
- proposal history full management。StrategyLab の proposal history section で provider / status / selected / DB-level search / pagination による compact 管理導線まで完了済み。list response は sanitized summary に限定し、raw prompt / raw provider response / raw Codex output / endpoint / model 実値 / user_hint 全文 / candidate 自由文本文は返さない。
- sanitized provider event log persistence。`StrategyProposalProviderEvent` に provider call / manual import / retry / rate limit / validation failure の sanitized event を保存し、read-only event list API で運用確認できる。event は raw prompt / raw provider response / raw Codex output / endpoint / model 実値 / user_hint 全文 / candidate 自由文本文 / actual IP / forwarded header value / internal key を保存・返却しない。

後続判断:

- benchmark result DB table / prompt regression automation。
- provider quality trend の range / filter / percentile / materialized aggregation。
- proposal history candidate free text search。candidate title / summary / suggested natural language spec の検索は、専用 column / index / read model なしに実装すると full-table / full-candidate read になり得るため後続判断にする。
- openai_api provider。
- Web search / deep research job 化。
- Codex CLI local worker / backend automatic spawn は、現時点では継続見送り。実装する場合は raw output / endpoint / model 実値 / local path / stack trace を保存しない境界と、ユーザー明示操作を再設計する。
- backend Web research job、`source_type=web` 解禁、URL validation、citation 保存、Web source UI は引き続き後続候補。Web検索付き prompt option はこれらを実装したものではない。
- StrategyVersion created-from-proposal relation。
- proposal history soft archive。`StrategyProposalRun.archivedAt` による通常一覧からの非表示、archived filter、archive / unarchive action、archived detail / selection 許可まで完了済み。hard delete / retention job / export は引き続き後続判断にする。
- proposal history retention / hard delete / export。
- distributed rate limit / hard cost cap / per-user billing。現行は in-memory per-process guard と opt-in policy の範囲であり、外部 API provider や multi-process production hard guarantee には別設計が必要。
- provider event log based quality trend upgrade。初回 event log は運用観測用であり、provider quality trend の materialized aggregation や percentile 集計にはまだ接続しない。
- prompt regression automation。
- request-time provider selection、optional fallback metadata。
- auto Pine generation / auto save は引き続き対象外。

## 8-2. Symbol-centered strategy workflow

Symbol-centered strategy workflow は、SymbolDetail を「銘柄に適用して見る場所」から、銘柄起点で strategy proposal / apply / improvement へ進む入口に拡張する段階的テーマである。DB / Prisma schema 変更なしで始め、まず route query / return path による context handoff を整える。

Phase 0: docs-only design。

- SymbolDetail を銘柄起点 strategy workflow の入口として定義する。
- StrategyLab は引き続き proposal / 作成 / Pine generation / save / CSV import の作業画面とする。
- StrategyVersionDetail は既存 version の rule / Pine / validation / regenerate / clone / improvement の作業画面とする。
- SymbolDetail -> StrategyLab では `symbol_id` / `symbol_code` / display name / market / default timeframe / return path を context として渡す。
- StrategyLab -> SymbolDetail では、保存後の明示 CTA と return path を使う。proposal selection だけで apply しない。
- SymbolDetail application row -> StrategyVersionDetail では、既存 clone flow へ進む improvement context を渡す。
- 旧 application の自動 archive、replace endpoint、application lineage 永続化、StrategyVersion created-from-proposal relation は後続判断とする。

Phase 1: SymbolDetail -> StrategyLab symbol context handoff（実装済み）。

- SymbolDetail の `ストラテジー / 検証結果` section に `この銘柄でストラテジー提案` action を置く。
- StrategyLab は symbol context banner、market / symbol code / timeframe prefill、`銘柄ページへ戻る` link を表示する。
- proposal generation はユーザーが `候補を提案` を押すまで起動しない。
- proposal candidate selection は title / natural language spec への反映だけを行う。

Phase 2: StrategyLab 保存後の explicit apply（実装済み）。

- Symbol context がある場合だけ、strategy / version 保存後に `この銘柄に適用` CTA を表示する。
- 既存 symbol strategy application 作成 API を使う。
- active duplicate conflict は既存 error 表示に乗せる。
- 自動適用、Pine generation、CSV import、backtest、AI summary は起動しない。

Phase 3: SymbolDetail application row から improvement clone（実装済み）。

- application row に `改善版を作る` action を追加する。
- 既存 `strategy version clone` flow を明示的に呼び、新 version の StrategyVersionDetail へ遷移する。
- `symbol_id` / `application_id` / `strategy_version_id` / `return` / `mode=improve_application` 相当の context を渡す。
- StrategyVersionDetail は元 application / 元 version を示し、rule edit / Pine regenerate は既存導線を使う。

Phase 4: 改善版をこの銘柄に適用（実装済み）。

- StrategyVersionDetail に `この銘柄に改善版を適用` CTA を出す。
- 既存 application 作成 API を明示操作で呼ぶ。
- 旧 application は active のまま残し、ユーザーが不要なら手動 archive する。
- 新旧 application 比較、改善元 badge、旧 application archive 提案、lineage 永続化は後続判断とする。

BacktestDetail 起点の improvement context（実装済み）。

- `symbol_strategy_application` を持つ BacktestDetail から明示操作で strategy version clone へ進み、StrategyVersionDetail に `source_backtest_id` を渡す。
- StrategyVersionDetail は元 backtest metrics / 保存済み AI summary を read-only context として表示し、改善案を自然言語ルール本文へ反映できる。Backtest AI summary は改善ループ向けに、問題の切り分け、改善仮説、自然言語ルール改善案、Pine修正依頼に入れるべきではない注意、次に試す検証案を含む。改善メモ生成では `structured_json.payload.next_actions` / `overall_view` を body excerpt より優先する。`revision_request` は compile error / validation note / TradingView 上の挙動調整に限定する。
- StrategyVersion clone 時に元 version の latest PineScript があれば、clone 先に sanitized reference copy を作成し、元 PineScript を `source_pine_script_id` として引き継ぐ。これにより improvement clone 直後でも、source Pine がある場合は既存 Pine を元にした修正再生成へ進める。
- 元 version に PineScript がない場合は、clone 先でも `source_pine_script_id` はなく、UI の disabled 理由に従って自然言語ルールから Pine を作り直す。

全 phase で維持する境界:

- proposal selection から Pine / save / backtest / AI summary を自動実行しない。
- SymbolDetail 表示だけで proposal / AI / provider call を起動しない。
- clone / apply はユーザーの明示操作に限定する。
- internal backtest 新規実行 UI、TradingView chart widget、TradingView compile automation は復活させない。
- raw prompt / raw provider response / raw Codex output / endpoint / model 実値 / secret / local path / stack trace を UI / API / docs / PR に出さない。

local_llm provider design PR 1 の docs-only 固定:

- proposal 専用 provider selector は `STRATEGY_PROPOSAL_PROVIDER=stub|local_llm` とし、未指定 default は `stub` とする。
- local_llm provider は StrategyLab の一時 proposal candidates 生成だけを担当し、Strategy / StrategyVersion 保存、Pine generation、backtest、AI summary を自動起動しない。
- local_llm endpoint / model / timeout / max output は proposal 専用設定で分離する。実値は docs / PR / UI / response に出さない。
- local_llm output は既存 `strategy_proposal_candidates` schema に正規化し、UI に出す前に既存 provider response validation を必ず通す。
- 初回 local_llm 実装では silent stub fallback を行わず、timeout、provider unavailable、malformed JSON、schema invalid は provider error とする。fallback option は後続設計として残す。
- `openai_api`、Web search / deep research、request-time provider selection、proposal history、auto Pine generation / auto save は当時の後続候補として残した。proposal history / selected proposal lineage は PR #368〜#370 で完了済み。

local_llm provider PR 2 の実装範囲:

- `STRATEGY_PROPOSAL_PROVIDER=stub|local_llm` による env provider selection を実装済み。未指定 default は `stub`。
- local_llm provider は `/api/chat` に JSON response を要求し、既存 `strategy_proposal_candidates` schema に合わせる。
- local_llm output は UI に返す前に既存 provider response validation を必ず通す。
- malformed JSON、schema invalid、candidate count invalid、Web research basis、provider unavailable、timeout は generic provider failure として扱う。
- StrategyLab proposal selection と manual Pine generation 導線は維持する。
- DB / Prisma schema change は行っていない。
- 投資助言ではなく、backtest / user review 前提の検証候補として扱う。
- silent stub fallback、openai_api、Web search / deep research、request-time provider selection、proposal history、auto Pine generation / auto save は当時未実装として残した。proposal history / selected proposal lineage は PR #368〜#370 で完了済み。

local_llm schema_invalid smoke fix の完了範囲:

- real browser smoke で出た `provider status: invalid_response / reason: schema_invalid / latency: slow` に対し、prompt 強化、JSON mode 相当指定、code fence / 前後説明文からの JSON 抽出、root metadata 補完、string array の配列化、enum 表記揺れの正規化、空 `research_basis` の最小補完を実装する。
- raw prompt、raw response、endpoint、model 実値、secret、local path、stack trace、user_hint 全文、candidate 自由文本文は UI / API response / docs / PR / benchmark output に出さない方針を維持する。
- 重要本文の欠落、候補数不正、Web search 未実装時の `source_type=web`、unsupported enum、malformed JSON は引き続き provider invalid response として扱う。
- `required_field_missing` に対して、common alias normalization、非中核 metadata fallback、missing field names の sanitized diagnostics、local_llm 最大 1 回の bounded retry を追加済み。retry prompt には raw response を入れない。
- advanced repair、silent fallback、request-time provider selection、openai_api、Web search / deep research は後続候補のまま残す。
- local_llm 実体依存 test は required check に入れず、mock / fake response で local_llm schema handling を確認する。

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

- sanitized provider event log、DB 永続化、trend materialization、optional fallback metadata は未実装として残す。cost / rate guard は軽量実装済みだが、distributed rate limit / per-user billing / hard cost cap は後続判断とする。

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

proposal history / selected proposal lineage backend 実装現在地:

- proposal history は generation run と candidates、selected candidate を後から確認するための履歴として扱う。
- `StrategyProposalRun` / `StrategyProposalCandidate` 相当の新規 model を追加済み。
- selected だけではなく全候補保存を実装済み。比較文脈と provider quality 観測を残すため。
- provider_observation は sanitized metadata のみ保存する。
- user_hint は raw prompt ではなく bounded / sanitized request input として保存する。
- candidate JSON は normalized schema のみ保存し、raw provider response は保存しない。
- raw prompt、raw provider response、provider secret、endpoint、model 実値、local path、stack trace は保存しない。
- local_llm failure / invalid response は candidates なしの failed run として sanitized status / reason を残す方針を第一候補にする。request validation error は保存対象外を第一候補にする。
- `POST /api/strategy-lab/proposals` は後方互換を維持し、optional `proposal_run_id` / `history.proposal_run_id` を返す。
- recent list の `GET /api/strategy-lab/proposals`、detail の `GET /api/strategy-lab/proposals/:proposalRunId`、selection の `POST /api/strategy-lab/proposals/:proposalRunId/select` を追加済み。
- 初回 UI は StrategyLab の「最近の提案」程度として実装済み。run status、created_at、provider、candidate count、selected 有無、detail candidates を最小表示する。
- 現在表示中 proposal candidates と history detail candidates の「この候補を使う」は selection API を呼び、title / natural language spec への反映だけを行う。
- filter / pagination / search は proposal history full management で完了済み。archive / retention / hard delete / export は後続判断にする。
- `selected_strategy_id` / `selected_strategy_version_id` / `StrategyRuleVersion.createdFromProposalCandidateId` は初回では入れず、後続 lineage relation として判断する。
- backend API / tests と frontend minimal UI / tests は追加済み。
- local_llm 実体依存 test は required check に入れない。
- proposal から Pine generation、StrategyVersion 自動保存、backtest、AI summary への自動連鎖は引き続き対象外。

今回もやらないこと:

- proposal から StrategyVersion への自動保存。
- proposal から Pine generation への自動連鎖。
- 通常 StrategyLab proposal における Web search 必須化。
- 投資助言風 wording だけを理由に proposal 候補を過剰に狭めること。
- provider raw diagnostics、raw prompt、credential、local path の UI / docs / PR 表示。

SymbolDetail 起点 Codex CLI proposal の完了範囲と後続:

- SymbolDetail から起動した Codex CLI manual prompt は、銘柄調査付き prompt として Web検索必須 guidance を使う実装まで完了済み。backend から Web search / Codex CLI は自動実行しない。
- `source_type=web`、URL / citation 保存、Web source badge、freshness metadata はまだ解禁しない。これらは citation / reliability / retention / UI 表示方針を別設計してから判断する。
- local_llm は従来どおり symbol_code / market / timeframe の軽い context proposal とし、銘柄固有の最新情報を期待しない。
- 銘柄調査付き prompt の品質評価では、対象銘柄の基本情報、価格傾向、出来高、volatility、決算・業績、news、events、sector 環境を確認したうえで、候補ごとに銘柄適合理由、未確認点、overfitting / slippage / drawdown / event risk を書けているかを見る。

## 9. Strategy proposal benchmark 後続課題

prompt regression / provider benchmark は optional script、fixed scenario set、sanitized summary record output まで完了済みである。次に扱う場合は、以下を個別設計してから着手する。

- benchmark result DB table / prompt regression automation。
- provider quality trend の range / filter / percentile / materialized aggregation。
- `openai_api` provider。
- Web search / deep research job 化。
- StrategyVersion created-from-proposal relation。
- proposal history archive / retention / hard delete / export。
- provider event log based quality trend upgrade。
- prompt regression automation。
- auto Pine / auto save は引き続き out of scope。

## 10. 次期フェーズ候補の優先度

| 優先度 | 候補 | 理由 |
|---|---|---|
| 1 | Release / operations stabilization | 現行完成範囲を安全に出すため、required checks、docs-only acceptance、manual walkthrough、provider failure 運用を先に安定化する。 |
| 2 | AI quality / cost operations follow-up | docs-only の方針整理は完了済み。実装へ進む場合は openai_api、distributed rate limit / hard cost cap、scheduled / batch、polling / live update、event-log based trend upgrade を個別設計する。 |
| 3 | LLM strategy proposal provider operations | benchmark result recording workflow、cost / rate guard hardening、sanitized provider event log persistence 完了後に openai_api、fallback metadata、benchmark result DB table、distributed rate limit / hard cost cap、event-log based trend upgrade を個別設計してから段階判断する。 |
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

## 投資カレンダー後続課題

- public provider の source reliability 評価は `docs/運用ドキュメント/13_Investment_calendar_provider調査.md` に整理済み。次に実装する場合は、無料 API 優先の Option A market-level event provider を第一候補にする。
- provider 方針分類は `free_api_candidate`、`official_scraping_candidate`、`seed_or_curated_only`、`paid_api_rejected`、`not_recommended` を使う。
- Phase P1 / P3 / P4: market-level event provider。Alpha Vantage は初回 provider として実装済み。CPI / retail sales / unemployment / nonfarm payroll / real GDP / PPI は発表済み data series の observation date として扱い、IPO calendar は `ipo` event として扱う。FOMC、日銀金融政策決定会合、米国市場休場日 / 短縮取引日は `official_market` provider で bundled curated fixture / optional official source fetch として実装済み。日本市場 SQ / メジャーSQは `official_market` provider の第2金曜日 rule-based event として実装済み。FRED / FMP は比較候補として残す。
- Phase P2: JP stock symbol-level provider。J-Quants provider は無料 plan 範囲の決算発表予定日と取引カレンダー / 休場日まで実装済み。配当金情報、配当権利落ち、配当支払予定、TDnet / 適時開示は無料範囲外または有料前提のため継続見送りとし、paid plan へ進まない。
- Phase P3: multi-provider aggregation。Home refresh は Alpha Vantage と J-Quants の同時利用に対応済み。後続では cross-provider duplicate merge、provider observation / refresh history、stale warning、source reliability label を検討する。
- Phase P3: disclosure / filing enrichment。EDINET は submitted document event として扱う。TDnet API は paid API のため採用しない。
- Phase P4: stale data 表示、source freshness、provider observation、source reliability label、refresh history の改善。
- 未取得または補強候補の高優先 market event: ISM / PMI、MSCI / FTSE rebalancing、SQ / メジャーSQの休場日補正。公式 source parser / curated seed / J-Quants 取引カレンダー突合を検討するが、real external page access を required check に入れず、raw HTML / raw JSON を保存しない。
- 投資カレンダー freshness / provider visibility の後続: refresh history table、provider observation table、stale threshold の provider 別調整、stale warning の dismiss / snooze、cross-provider duplicate merge。今回時点では既存 `fetched_at` と refresh response の provider summary だけを使う。
- Home 投資カレンダーは Home 上部への配置、1ヶ月 compact calendar grid、`前月` / `次月` の frontend local month navigation、title 中心の短い chip 表示、event なし cell の圧縮、今日の day cell 強調、chip hover / focus detail まで完了済み。後続候補は mobile での横スクロール体験改善、detail card の keyboard accessibility 強化、provider / event type filter、表示月と refresh range の UX 整理であり、外部 calendar sync や notification は引き続き後続判断にする。
- provider 追加時も manual refresh only を維持し、scheduled job / crawler 常駐は別設計にする。
- real external provider / real web access は required check に入れず、fake / fixture test を正とする。
- 課金 API、有料契約前提 API、利用条件が不明な scraping、各社 IR page の広範囲 scraping は採用しない。
- notification / reminder / external calendar sync は後続判断。
