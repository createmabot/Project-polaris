# 北極星 artifact metadata / retention 運用

更新日: 2026-05-15
分類: 運用ドキュメント

## 1. 目的

本資料は、artifact pointer metadata、retention policy、file access boundary の運用確認観点をまとめる。仕様正本は `docs/仕様書/09_AI_summary_artifact仕様.md`、Backtest report との関係は `docs/仕様書/08_Backtest_Report仕様.md` を参照する。

設計 docs と UI visibility 整理は完了扱いである。現行運用では path 系 metadata を UI にそのまま出さない。artifact file access は既存 internal_backtests engine_actual trades / equity JSON read endpoint に限定し、新規 download / diff / retention job は未実装として扱う。

## 2. 現行運用の範囲

現行で行うこと:

- BacktestDetail で artifact pointer metadata summary を確認する。path 系 metadata は非表示または sanitized 表示として扱う。
- BacktestDetail で raw artifact JSON を保存済み pointer metadata として確認する。raw JSON でも path 系値は非表示または sanitized 表示として扱う。
- artifact pointer がない場合は absence explanation として扱う。
- ApplicationDetail / SymbolDetail からは BacktestDetail に遷移して詳細を確認する。
- internal_backtests の既存 `engine_actual` trades / equity JSON read endpoint は、execution ID と既知 route に限定して確認する。

現行で行わないこと:

- arbitrary artifact file read。
- artifact download。
- artifact diff / JSON diff。
- retention job。
- hard delete。
- cleanup job。
- frontend への raw path 受け渡し。

## 3. 表示してよい metadata

UI / docs / PR に表示してよいもの:

- `kind`
- `type`
- `execution_id`
- `source`
- `summary_mode`
- `generated_at` / `created_at`
- report / execution と紐づく safe な識別子

`path` は内部参照として保存されていても、絶対 local path や file system structure をそのまま表示しない。必要な場合は論理参照または sanitized 表示に限定する。

ApplicationDetail は report history の入口であり、report row に artifact path を表示しない。artifact metadata の詳細確認は BacktestDetail に送る。

## 4. 表示してはいけない情報

UI / docs / PR / log に残さないもの:

- absolute local path。
- local filesystem の directory structure。
- secret、token、shared secret、API key。
- provider endpoint。
- raw prompt。
- signed URL や file token の実値。
- stack trace や file system internals。

確認時にこれらが含まれる可能性がある場合は、値を伏せて field 名や種類だけを記録する。

## 5. retention policy 現在地

現時点では retention job、hard delete、cleanup は未実装である。

運用上の扱い:

- artifact metadata がある場合は read-only context として確認する。
- artifact metadata がない場合は未保存または非対象 source として扱う。
- artifact file の存在、保存期間、download 可否は保証しない。
- 自動削除済み、または自動削除予定であるように書かない。

将来 retention を設計する場合は、execution、report、symbol application などの削除単位、metadata の残し方、audit log、復旧可否を同時に決める。

## 6. file access boundary

現行の file access は、internal_backtests の既存 `engine_actual` trades / equity JSON read endpoint に限定する。

運用境界:

- execution ID を入口にする。
- succeeded execution と stored artifact existence を前提に確認する。
- artifact path suffix は whitelist 化された既知 suffix のみ扱う。
- UI link は execution ID と既知 route から導く。
- frontend へ raw path、local path、absolute path を渡さない。
- BacktestDetail には download 導線を追加せず、metadata 表示に留める。
- 詳細 artifact file access は StrategyVersionDetail / existing route の範囲に限定する。

避けること:

- path traversal。
- arbitrary route。
- local path leakage。
- raw artifact path の log / docs / PR 記載。

将来 download を実装する場合の候補:

- backend proxy。
- signed URL。
- file token。

実装時に必要な境界:

- path traversal 対策。
- frontend へ raw path を渡さない。
- access control。
- audit log。
- token / URL の短命化。
- log sanitization。
- local path / secret の redaction。

現行フェーズでは設計 docs のみを扱い、API、backend、frontend、DB、Prisma schema、test は変更しない。

## 7. artifact diff boundary

artifact diff / JSON diff は後続判断である。

- metrics diff は report summary の数値比較であり、現行 comparison helper / saved comparison の範囲。
- JSON diff は saved metadata や structured JSON の比較候補だが未実装。
- file diff は artifact file content の比較候補だが、file access boundary が未実装のため対象外。
- BacktestComparisonDetail は将来候補だが、現時点では保存済み pairwise comparison の再訪画面である。

## 8. 画面別確認

- BacktestDetail: artifact pointer metadata summary、path 系値を非表示化した raw JSON、absence explanation を確認する。
- ApplicationDetail: report history の入口として使い、artifact path は report row に出さず、artifact 詳細は BacktestDetail で確認する。
- BacktestComparisonDetail: saved comparison の再訪画面として確認し、artifact diff は期待しない。
- SymbolDetail: latest report / application 入口として確認し、artifact 詳細は期待しない。

## 9. 関連 docs

- `docs/仕様書/09_AI_summary_artifact仕様.md`
- `docs/仕様書/08_Backtest_Report仕様.md`
- `docs/運用ドキュメント/08_AI_summary自動生成運用.md`
- `docs/作業進捗管理/07_AI_summary自動生成phase1完了.md`
- `docs/walkthrough.md`
