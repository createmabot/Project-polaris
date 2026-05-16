# 北極星 残課題 Backlog

更新日: 2026-05-16
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

LLM strategy proposal は、StrategyLab で検証候補を提案し、選択した候補を natural language spec に反映する導線として初回実装済みである。投資助言ではなく、backtest / user review 前提の候補提案として扱う。

完了範囲:

- StrategyLab の「ストラテジーを提案」入口。
- deterministic stub provider。
- UI では 5 件の proposal candidates を要求し、API は `proposal_count` 最大 10 件まで受ける。
- candidate 選択時の title / natural language spec 反映。
- candidate 選択時に古い generated result / backtest / CSV import state を無効化する。
- Pine generation / Strategy保存は既存 button / form 操作を維持。

後続判断:

- local_llm / openai_api provider を使った proposal generation。
- Web search / deep research option と citation / freshness 表示。
- proposal history / selected proposal lineage。
- provider cost cap / rate limit / opt-in。
- symbol context から StrategyLab への proposal 導線。
- proposal quality evaluation と prompt regression。

provider expansion PR 1 の docs-only 固定:

- provider boundary は `docs/仕様書/11_LLM_Strategy_Proposal仕様.md` を正本とし、route 層で request / response schema validation、error sanitization、fallback 表示責務を持つ。
- stub 以外の provider は timeout、fallback、cost cap、rate limit、prompt length guard、safety validation を先に固定してから実装する。
- Web search / deep research は引き続き out of scope。`source_type=web` は将来予約であり、現行 provider expansion の前提にしない。
- proposal は StrategyLab の一時候補であり、Strategy / StrategyVersion 保存、Pine generation、backtest、AI summary を自動起動しない。

初回ではやらないこと:

- DB migration / proposal entity。
- proposal から StrategyVersion への自動保存。
- proposal から Pine generation への自動連鎖。
- Web search 必須化。
- 投資助言に見える断定表現。
- provider raw diagnostics、raw prompt、credential、local path の UI / docs / PR 表示。

## 9. 次期フェーズ候補の優先度

| 優先度 | 候補 | 理由 |
|---|---|---|
| 1 | Release / operations stabilization | 現行完成範囲を安全に出すため、required checks、docs-only acceptance、manual walkthrough、provider failure 運用を先に安定化する。 |
| 2 | AI quality / cost operations | auto enqueue と latest job visibility 後の cost cap、rate limit、provider opt-in、failure analysis、retry 方針を整理する。 |
| 3 | Artifact operations phase 2 | download / signed URL / file token / retention / diff は権限境界が重いため、個別設計してから実装判断する。 |
| 4 | Report comparison phase 3 | read-only helper の利用実績を見て、comparison entity、metrics normalization、自動比較生成の要否を判断する。 |
| 5 | Performance / scale | 大量データ時の index / read model / cache を、実運用で観測された遅い導線から絞って扱う。 |

継続候補:

- Visual regression expansion は optional pilot の snapshot churn と実行時間を見て判断する。
- TradingView / Pine workflow 強化は現行 release stabilization 後に優先度を再評価する。

## 10. Backlog 更新ルール

- 完了したら `docs/作業進捗管理/02_完了フェーズ.md` と該当正本 docs へ移す。
- 仕様判断が必要な課題は `docs/仕様書/` または機能別正本 docs へ詳細を書く。
- 単なる思いつきは backlog に入れず、実装判断に必要な背景と見送り理由を残す。

## 11. 関連 docs

- `docs/39.北極星 MVP後ロードマップ・バックログ整理.md`
- `docs/53.北極星 P3現在地と残課題整理（P3）.md`
- `docs/56.北極星 AI summary 自動生成運用設計（次フェーズ）.md`
- `docs/運用ドキュメント/08_AI_summary自動生成運用.md`
- `docs/運用ドキュメント/09_artifact_metadata_retention運用.md`
- `docs/作業進捗管理/07_AI_summary自動生成phase1完了.md`
- `docs/作業進捗管理/04_設計判断ログ.md`
- `docs/運用ドキュメント/10_release_acceptance_checklist.md`
