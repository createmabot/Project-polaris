# 北極星 current status / progress entry

更新日: 2026-05-13
分類: progress

## 1. 目的

本資料は、作業進捗、完了整理、残課題、後続候補への入口である。詳細な積み上げ履歴は `docs/39` / `docs/44` / `docs/53` に残し、本資料では現在の読み方を整理する。

## 2. 現在の大枠

- P3 は完了扱い。
- UI foundation completion pass は完了済み。
- IA / navigation debt cleanup は完了済み。
- Report comparison UX phase 2 は完了済み。
- AI summary auto-generation phase 1 は CSV import report / internal backtest report の auto enqueue まで完了済み。
- Docs source-of-truth cleanup は完了済み。
- 今回の docs architecture refactor では specs / operations / progress の3分類を導入する。

## 3. progress docs の役割

- `docs/39.北極星 MVP後ロードマップ・バックログ整理.md`: MVP後ロードマップと backlog の履歴。
- `docs/44.北極星 MVP後P2完了整理とP3着手判断.md`: P2完了 / P3着手判断と後続追記。
- `docs/53.北極星 P3現在地と残課題整理（P3）.md`: P3完了後も含む現在地と残課題の集約正本。
- `docs/progress/00_current_status.md`: 次回作業時に progress docs の読み方を示す入口。

## 4. 次の大きな候補

- docs architecture refactor の後続として、旧docsの注意書き追加範囲を拡張するか判断する。
- API sample docs と現行 routes / tests の対応整理。
- walkthrough の肥大化対策と確認観点別分割。
- Visual regression pilot の再判断。
- AI summary auto enqueue の display-triggered / batch 対応判断。

## 5. 今回やらないこと

- 実装コード変更。
- DB / Prisma schema / API / test 変更。
- docs大量削除 / 大量rename。
- 旧docsの全面書き換え。
