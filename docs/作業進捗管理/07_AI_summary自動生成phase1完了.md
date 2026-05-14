# 北極星 AI summary 自動生成 phase 1 完了整理

更新日: 2026-05-15
分類: 作業進捗管理

## 1. 目的

本資料は、AI summary auto-generation phase 1 の完了範囲、対象外、次フェーズ候補を整理する。運用確認手順は `docs/運用ドキュメント/08_AI_summary自動生成運用.md`、仕様現在地は `docs/仕様書/09_AI_summary_artifact仕様.md`、設計詳細は `docs/56.北極星 AI summary 自動生成運用設計（次フェーズ）.md` を参照する。

## 2. 完了範囲

PR #319 / #320 / #332 により、次を phase 1 完了扱いにする。

- CSV import parsed report 作成直後の auto enqueue。
- application 起点 CSV import route の auto enqueue。
- internal backtest report conversion 完了直後の auto enqueue。
- 同一 input snapshot hash に対する duplicate guard。
- failed job auto retry なし。
- 既存 manual generation / regeneration の維持。
- DB / Prisma schema 変更なし。
- BacktestDetail / ApplicationDetail の read-only visibility 整理。

## 3. route 別の完了内容

direct CSV import route:

- CSV parse が `parsed` になり、Backtest report と `BacktestImport.parsedSummaryJson` が紐づいた直後に auto enqueue する。
- parse failed import では auto enqueue しない。
- auto enqueue / generation が失敗しても CSV import response は壊さない。

application 起点 CSV import route:

- application 起点 CSV import でも、parsed report 作成直後に direct route と同じ auto enqueue を行う。
- trigger は CSV import auto として扱い、source import と input snapshot hash を運用確認に使う。
- ApplicationDetail は report history の入口に留め、AI summary 本文や status 確認は BacktestDetail に送る。

internal backtest report conversion:

- succeeded internal backtest execution が新規 Backtest report に変換された直後に auto enqueue する。
- `BacktestImport` は作成せず、importless report として扱う。
- 既存 report を返す再実行 path と guarded conflict path では auto enqueue しない。
- artifact pointer は metadata として扱い、artifact file read / download / diff は行わない。

## 4. duplicate guard / failure 方針

duplicate guard:

- 同一 input snapshot hash の succeeded summary がある場合は auto enqueue しない。
- 同一 input snapshot hash の queued / running job がある場合は auto enqueue しない。
- 同一 input snapshot hash の failed job がある場合は auto retry しない。

failure:

- provider failure / timeout は `ai_jobs=failed` として扱う。
- failed job は自動 retry せず、既存 manual generation / regeneration に委ねる。
- UI では sanitized な範囲だけを表示し、provider endpoint、API key、token、raw prompt、local path、stack trace の実値を出さない。

## 5. visibility 整理

BacktestDetail:

- AI summary input の source 差と auto enqueue 契機を説明する。
- 画面が受け取る AI summary 状態は `available` / `unavailable` のみであり、未生成・queued・running・failed は `unavailable` として見える場合があることを明示する。
- polling / live update は行わない。
- failed の場合も既存の手動生成 / 再生成に進める。

ApplicationDetail:

- report history の入口として維持する。
- report row に AI summary status を追加しない。
- AI summary 本文、`available` / `unavailable`、artifact pointer、raw artifact JSON の詳細確認先を BacktestDetail として案内する。
- ApplicationDetail 表示起点 enqueue は行わない。

## 6. 対象外

phase 1 完了に含めないもの:

- BacktestDetail 初回表示起点 enqueue。
- ApplicationDetail report history 表示起点 enqueue。
- batch / scheduled job。
- failed job auto retry。
- polling / live update。
- AI summary 同士の比較。
- artifact diff / download。
- provider 課金制御。
- metrics normalization。
- comparison entity。

## 7. 次フェーズ候補

- retry / polling / live status update。
- AI summary comparison UX。
- artifact metadata / retention policy の実装判断。設計 docs は `docs/仕様書/09_AI_summary_artifact仕様.md` と `docs/運用ドキュメント/09_artifact_metadata_retention運用.md` を参照する。
- artifact file read / download permission boundary の実装判断。
- provider cost / latency policy。
- Visual regression pilot。

## 8. 関連 docs

- `docs/運用ドキュメント/08_AI_summary自動生成運用.md`
- `docs/運用ドキュメント/09_artifact_metadata_retention運用.md`
- `docs/仕様書/09_AI_summary_artifact仕様.md`
- `docs/56.北極星 AI summary 自動生成運用設計（次フェーズ）.md`
- `docs/作業進捗管理/02_完了フェーズ.md`
- `docs/作業進捗管理/03_残課題_Backlog.md`
- `docs/walkthrough.md`
