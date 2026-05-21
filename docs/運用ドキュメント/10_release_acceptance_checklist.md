# 北極星 Post-P3 release acceptance checklist

更新日: 2026-05-22
分類: 運用ドキュメント

## 1. 目的

本資料は、P3 後に積み上げた拡張機能、UI foundation、AI summary、artifact、report comparison、docs 整理を、現時点でリリース可能なまとまりとして確認するための入口である。

本資料は docs-only の受け入れ確認用であり、実装コード、API、backend、frontend、DB、Prisma schema、test の変更を要求しない。不一致や制約が見つかった場合は、まず docs 上の既知制約または残課題として扱う。

## 2. 主要導線 acceptance checklist

通常 smoke / walkthrough で確認する主要導線:

- Home から SideRail または watchlist_symbols 経由で SymbolDetail に遷移できる。
- SideRail の監視銘柄 / 保有銘柄リンクから SymbolDetail に遷移できる。
- SymbolDetail から StrategyDetail、ApplicationDetail、BacktestDetail に遷移できる。
- StrategyDetail から StrategyVersionDetail と BacktestDetail に遷移できる。
- ApplicationDetail の run / report history から BacktestDetail に遷移できる。
- BacktestDetail で related reports、metrics comparison helper、保存済み comparison 入口、BacktestComparisonDetail への再訪導線を確認できる。
- StrategyLab で strategy 作成、strategy version 作成、Pine 生成、CSV import、BacktestDetail 遷移の既存導線が維持されている。
- StrategyLab の proposal 導線では、stub proposal、local_llm opt-in、Codex CLI manual JSON import、Web検索付き prompt option、proposal history filter / pagination、soft archive、provider events API、provider quality trend、candidate selection を確認できる。
- Strategy proposal の candidate selection は title / natural language spec への反映だけを行い、Pine generation / save / backtest / AI summary は自動実行しない。
- Home / SideRail の watchlist / positions CRUD modal が既存の作成、編集、削除、refresh 範囲を維持している。
- `/watchlist` と `/positions` は移行期の補助 route として扱い、主要導線は Home / SideRail とする。
- Visual regression pilot は optional check であり、通常 smoke や required checks と混ぜない。

## 3. docs / implementation / tests 整合確認

現時点の読み方:

- 仕様判断は `docs/仕様書/`、運用確認は `docs/運用ドキュメント/`、進捗と残課題は `docs/作業進捗管理/` を正本とする。
- README は開発者向け入口、`docs/walkthrough.md` は手順確認の入口として扱う。
- 旧 numbered docs は履歴資料または詳細背景として残るが、現行仕様判断の正本として読ませない。現行判断は `docs/0.目次.md` と `docs/57.北極星 docs正本整理・読む順番（現行）.md` の分類に従う。
- Required checks は `docs/運用ドキュメント/06_テストとCI.md` の CI required checks を正とする。Visual regression は `pnpm test:e2e:visual` の optional pilot であり required check ではない。
- 現行 visual pilot の実装対象は `ApplicationDetail` の `application summary` stable container 1 件のみである。SymbolDetail、Home、BacktestDetail、BacktestComparisonDetail、StrategyLab、StrategyVersionDetail などの visual snapshot は未実装である。
- AI summary auto-generation phase 1 は CSV import parsed report、application 起点 CSV import parsed report、新規 internal backtest report conversion の auto enqueue までを完了範囲とする。
- AI summary auto-generation phase 2 visibility は BacktestDetail / `GET /api/backtests/:backtestId` の latest job status read-only visibility までを完了範囲とする。
- Artifact file access は既存 internal_backtests engine_actual trades / equity JSON read endpoint に限定する。BacktestDetail は artifact pointer metadata 表示であり、download、signed URL、file token、diff の入口ではない。
- AI summary comparison は BacktestDetail の read-only helper までであり、provider 呼び出しや自動比較生成をしない。
- Strategy proposal は一区切り完了済みの運用対象として扱う。`STRATEGY_PROPOSAL_PROVIDER` の default は `stub`、`local_llm` は opt-in、real local_llm / real Codex CLI は required test に入れない。
- Codex CLI manual import の Web検索付き prompt option は prompt 文面の切替だけであり、backend Web search / deep research、`source_type=web` 解禁、URL / citation 保存、Web 検索済み flag 保存は行わない。

## 4. 現時点の完成範囲

リリース可能な完成範囲:

- P3 本体: Home / SideRail / SymbolDetail / Strategy / Application / Backtest の主要導線。
- UI cleanup / UI foundation: AppLayout、PageHeader、Navigation、shared component の限定導入、Surface、FormFields、ModalShell、JsonBlock、FilterGroup、PaginationControls、InlineNotice の限定適用。
- IA / navigation debt cleanup: 主要導線を Home / SideRail / SymbolDetail / ApplicationDetail / BacktestDetail に整理し、legacy route を補助 route として扱う判断。
- Docs full consolidation / legacy docs cleanup: 仕様書、運用ドキュメント、作業進捗管理の3分類と legacy numbered docs の扱い整理。
- Symbol Strategy Application: application / run / report の親子関係、SymbolDetail 入口、ApplicationDetail read-only history。
- Application Detail / History: runs / reports filter、pagination、metrics 欠損説明、BacktestDetail 入口。
- CSV import report / internal backtest report 管理: TradingView CSV import report と internal backtest report の source 差、importless report、metrics root の説明。
- Report comparison UX phase 2: BacktestDetail の related report metrics comparison helper、ApplicationDetail からの入口説明、BacktestComparisonDetail の saved pairwise comparison 再訪。
- AI summary / artifact operations: source-aware summary input、artifact metadata 表示、path 系 metadata 非表示、screen responsibility。
- AI summary auto-generation phase 1: direct CSV import、application 起点 CSV import、internal backtest report conversion の auto enqueue と duplicate guard。
- AI summary auto-generation phase 2 visibility: latest AI summary job status の read-only 表示。
- Artifact metadata / access boundary: metadata / retention / file access boundary の docs 正本化と既存 file read endpoint への限定。
- Visual regression optional pilot: `ApplicationDetail` application summary container 1 件の optional screenshot comparison。
- AI summary comparison read-only helper: current / related report の保存済み summary を BacktestDetail で並べる補助。
- Strategy proposal operations: stub / local_llm provider boundary、Codex CLI manual import、Web検索付き prompt option、proposal history full management、soft archive、provider quality trend、sanitized provider event log、cost / rate guard、optional benchmark sanitized record workflow。

## 5. Known limitations

現時点で未実装または次期判断に残すもの:

- artifact download endpoint、signed URL、file token、backend proxy は未実装。
- artifact diff、JSON diff、file diff は未実装。
- artifact retention job、cleanup job、hard delete は未実装。
- AI summary failed job auto retry は未実装。
- AI summary polling、live update は未実装。
- batch / scheduled AI summary generation は未実装。
- AI summary comparison は read-only helper まで。AI による自動比較生成は未実装。
- comparison entity / route 拡張、metrics normalization table は未実装。
- Visual regression は optional pilot のみ。required check ではない。
- 現行 visual pilot 対象は ApplicationDetail の application summary stable container 1 件のみ。SymbolDetail を含むその他画面の visual snapshot は未実装。
- Strategy proposal の provider cost / rate guard は、local_llm timeout / max output の bounded env guard、proposal / manual import の in-memory per-process rate guard、trusted forwarded IP validation、future provider opt-in 方針まで完了済み。本格的な distributed rate limit、hard cost cap、per-user billing は未実装。
- Strategy proposal の Web search / deep research は未実装。Codex CLI Web検索付き prompt option は手動 prompt guidance に限定し、北極星側で Web 検索済み判定や citation 保存は行わない。
- 大量データ時の index、read model、cache は未実装。
- Proposal history retention job、hard delete、export は未実装。soft archive は通常一覧から隠す操作であり削除ではない。
- legacy numbered docs は残るものがあるが、正本は `docs/仕様書/`、`docs/運用ドキュメント/`、`docs/作業進捗管理/` の新 docs 体系である。

## 6. 次期フェーズ候補の優先度

| 優先度 | 候補 | 理由 |
|---|---|---|
| 1 | Release / operations stabilization | 2026-05-21 時点で主要 smoke と docs 整合確認を実施済み。今後は required checks、manual walkthrough、provider failure 時の運用確認を継続する。 |
| 2 | AI quality / cost operations follow-up | docs-only の方針整理は完了済み。実装へ進む場合は openai_api、distributed rate limit / hard cost cap、scheduled / batch、polling / live update、event-log based trend upgrade を個別設計する。 |
| 3 | Artifact operations phase 2 | download / signed URL / file token / retention / diff は権限境界が重く、AI summary と internal report の運用が固まった後に個別設計する。 |
| 4 | Report comparison phase 3 | read-only helper の利用実績を見て、comparison entity、metrics normalization、自動比較生成の必要性を判断する。 |
| 5 | Performance / scale | 大量データ時の index / read model / cache は必要だが、現時点では運用観測後に対象を絞る。 |

同列の継続候補:

- Visual regression expansion は pilot の snapshot churn、実行時間、mask 方針を見てから対象拡大を判断する。
- TradingView / Pine workflow 強化は継続候補だが、release stabilization と AI / artifact 境界の安定後に優先度を再評価する。

## 7. docs-only release 確認

今回のような docs-only stabilization PR では次を確認する。

- `git diff --check` が成功する。
- markdown link scan で変更 docs の relative link が大きく壊れていない。
- 追加差分に absolute local path、secret、token、shared_secret、API key の実値がない。
- README、`docs/0.目次.md`、`docs/57.北極星 docs正本整理・読む順番（現行）.md`、`docs/walkthrough.md` の導線が矛盾しない。
- 実装コード、API、backend、frontend、DB、Prisma schema、test を変更していない。

## 7-1. 2026-05-21 operations smoke 確認結果

今回の release / operations stabilization smoke では、実装変更は行わず、現行 docs / implementation / tests の整合を確認した。

確認済み:

- Strategy proposal: stub proposal、local_llm opt-in 境界、Codex CLI manual import、Web検索付き prompt option、proposal history filter / pagination、soft archive、provider events API、provider quality trend、candidate selection。
- Strategy proposal selection は title / natural language spec 反映だけであり、Pine generation / save / backtest / AI summary は自動実行しない。
- Backtest / report / artifact / AI summary: CSV import report、internal backtest report、BacktestDetail 遷移、AI summary auto enqueue、latest job status read-only visibility、artifact metadata 表示、path 系 metadata 非表示。
- Visual regression は optional pilot のまま維持し、required check には追加しない。

確認で使う主な自動テスト:

- `backend/test/strategy-lab.e2e.test.ts`
- `backend/test/strategy-proposal-validation.test.ts`
- `backend/test/strategy-version-pine.e2e.test.ts`
- `backend/test/backtest-ai-summary.e2e.test.ts`
- `backend/test/backtest-import.e2e.test.ts`
- `backend/test/symbol-strategy-applications.e2e.test.ts`
- `frontend/src/pages/StrategyLab.test.tsx`
- `frontend/src/pages/BacktestDetail.test.tsx`
- `frontend/src/pages/ApplicationDetail.test.tsx`
- frontend return-flow tests。

後続へ残すもの:

- openai_api provider。
- backend Web search / deep research job。
- Codex CLI local worker / automatic spawn。
- StrategyVersion created-from-proposal relation。
- prompt regression automation。
- proposal history retention / hard delete / export。
- artifact download / signed URL / file token / diff。
- AI summary 自動比較生成。
- Visual regression required check 化。

## 7-2. 2026-05-22 UI/UX production readiness acceptance smoke 確認結果

UI/UX production readiness phase 1 / phase 2 / phase 3 後の acceptance smoke では、既存機能追加ではなく主要画面の見え方と安全境界を確認した。

確認済み:

- Home / SideRail / SymbolDetail / StrategyLab / ApplicationDetail / BacktestDetail / StrategyDetail / StrategyVersionDetail / BacktestComparisonDetail の主要画面を browser smoke 観点で確認した。
- AppLayout / Navigation / SideRail / PageHeader / SectionCard / Surface / Button / TextLink / StatusBadge / InlineNotice の使い分けに、リリースを止める大きな UI 退行は見つからなかった。
- filter / pagination / proposal history card / report history card / compact metadata の密度は、Phase 1 / 2 / 3 の改善境界と矛盾していない。
- loading / error / empty state は既存テストで固定されており、今回の smoke で主要画面の初期表示が汎用 error 画面に崩れる事象は確認されなかった。
- Strategy proposal selection は title / natural language spec への反映だけに留まり、Pine generation / save / backtest / AI summary は自動実行しない既存方針を維持する。
- Artifact metadata は path 系 metadata を UI に出さない既存境界を維持する。
- raw prompt / raw provider response / raw Codex output / endpoint / model 実値 / secret / local path / stack trace を UI / docs / PR に出さない境界を維持する。
- Visual regression は optional pilot のまま維持し、required check 化しない。

今回見送ったもの:

- 高機能 DataTable、virtual scroll、column resize、modal framework 全面導入。
- mobile-first responsive redesign。
- artifact download / signed URL / file token。
- AI summary 自動比較生成。
- proposal から Pine / save / backtest / AI summary への自動連鎖。

後続へ残すもの:

- 実運用で table-like layout の重複が増えた場合のみ、DataList / SimpleTable / lightweight DataTable を小さく検討する。
- Visual regression 対象拡大は optional pilot の安定性を見て判断する。
- responsive UX の細部調整は画面単位で判断する。

## 7-3. AI quality / cost operations 整理結果

AI summary auto enqueue、latest job status visibility、Strategy proposal provider observation / event log が入った現在地では、AI provider の追加自動化は急がず、quality / cost operations の境界を docs 上で固定する。

完了済みとして扱うもの:

- AI summary auto enqueue は CSV import parsed report、application 起点 CSV import parsed report、新規 internal backtest report conversion 直後に限定する。
- latest AI summary job status は BacktestDetail で read-only に確認する。
- Strategy proposal は `stub` baseline、`local_llm` opt-in、Codex CLI manual import、provider quality trend、sanitized provider event log、cost / rate guard、optional benchmark sanitized record まで完了している。

維持する境界:

- failed AI summary job は自動 retry しない。
- polling / live update、batch / scheduled generation、display-triggered enqueue は実装しない。
- real local_llm / real Codex CLI / future real `openai_api` は required check に入れない。
- proposal から Pine / save / backtest / AI summary へ自動連鎖しない。
- raw prompt、raw provider response、raw Codex output、endpoint、model 実値、secret、token、credential、local path、stack trace は DB / API / UI / docs / PR / logs に出さない。

次期設計が必要なもの:

- `openai_api` provider。
- distributed rate limit / hard cost cap / provider billing。
- scheduled / batch AI summary。
- polling / live status update。
- provider event log based quality trend upgrade。
- benchmark result DB table。
- Web search / deep research job。
- request-time provider selection。

## 8. 関連 docs

- `README.md`
- `docs/0.目次.md`
- `docs/57.北極星 docs正本整理・読む順番（現行）.md`
- `docs/walkthrough.md`
- `docs/仕様書/04_画面導線_IA.md`
- `docs/仕様書/08_Backtest_Report仕様.md`
- `docs/仕様書/09_AI_summary_artifact仕様.md`
- `docs/仕様書/10_テスト仕様.md`
- `docs/運用ドキュメント/06_テストとCI.md`
- `docs/運用ドキュメント/08_AI_summary自動生成運用.md`
- `docs/運用ドキュメント/09_artifact_metadata_retention運用.md`
- `docs/作業進捗管理/00_現在地.md`
- `docs/作業進捗管理/03_残課題_Backlog.md`
