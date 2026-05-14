# 北極星 残課題 Backlog

更新日: 2026-05-15
分類: 作業進捗管理

## 1. 目的

本資料は、現時点で残している課題と後続判断候補をまとめる。詳細な背景は `docs/39`、`docs/44`、`docs/53`、機能別正本 docs を参照する。

## 2. docs / information architecture

- 旧 docs の注意書き追加範囲を拡張するか判断する。
- API sample docs と現行 routes / tests の対応を整理する。
- walkthrough の肥大化対策として、確認観点別 docs への分割を検討する。
- 既存番号 docs の archive 移動や rename は別 PR でリンク影響を確認してから判断する。

## 3. UI / UX

- StrategyVersionDetail、StrategyLab、SymbolDetail filter への小さな UI component 適用を判断する。
- DataList / SimpleTable / DataTable の導入可否を、実際に重複が増えた場所から判断する。
- BacktestDetail 全面 redesign は急がず、高頻度 section の小改善に留める。
- responsive UX の余白、情報密度、導線優先度を画面単位で整理する。

## 4. Report comparison / artifact

- CSV import report と internal backtest report の本格比較 UX を判断する。
- metrics normalization table は初回候補にしないが、比較要件が固まった場合に再検討する。
- AI summary 同士の比較 UX は後続判断とする。
- artifact metadata / retention / file access boundary の設計方針と UI path 非表示は完了済み。metadata schema 拡張、download permission boundary、retention job 設計、artifact diff UX は後続判断とする。
- artifact file read / download / diff、JSON diff、retention job、cleanup job、hard delete、signed URL / file token、backend proxy、permission boundary 本格実装、audit log 本格化は未実装として残す。

## 5. AI summary / provider operations

- display-triggered enqueue は現行では採用しない。
- batch / scheduled job、retry policy、polling / live status update、cost cap、rate limit、provider opt-in 条件は後続判断とする。
- AI summary comparison UX、artifact metadata / retention policy、artifact file read / download permission boundary は後続判断とする。
- provider 生エラー、raw prompt、secret、local path を UI / docs / PR に出さない運用を継続する。

## 6. Testing / CI

- Visual regression pilot は readiness のみで、本導入は未実施。
- 初回 pilot を行う場合は ApplicationDetail / SymbolDetail など 1 から 3 個の stable container に絞る。
- dynamic timestamp、locale、seed ordering、raw JSON、AI text、external rendering を安定化または mask する必要がある。
- browser smoke の対象拡張は、実行系操作や外部依存を含めない範囲から判断する。

## 7. Product / data model

- hard delete は未実装のまま維持する。
- favorite / last used / display priority などの richer metadata は後続判断とする。
- StrategyRuleMetadata table の追加は急がない。
- SymbolBacktestDetail / StrategyBacktestDetail の新規画面は後続判断とする。

## 8. Backlog 更新ルール

- 完了したら `docs/作業進捗管理/02_完了フェーズ.md` と該当正本 docs へ移す。
- 仕様判断が必要な課題は `docs/仕様書/` または機能別正本 docs へ詳細を書く。
- 単なる思いつきは backlog に入れず、実装判断に必要な背景と見送り理由を残す。

## 9. 関連 docs

- `docs/39.北極星 MVP後ロードマップ・バックログ整理.md`
- `docs/53.北極星 P3現在地と残課題整理（P3）.md`
- `docs/56.北極星 AI summary 自動生成運用設計（次フェーズ）.md`
- `docs/運用ドキュメント/08_AI_summary自動生成運用.md`
- `docs/運用ドキュメント/09_artifact_metadata_retention運用.md`
- `docs/作業進捗管理/07_AI_summary自動生成phase1完了.md`
- `docs/作業進捗管理/04_設計判断ログ.md`
