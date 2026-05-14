# 北極星 CSV 取込運用

更新日: 2026-05-13
分類: 運用ドキュメント

## 1. 目的

本資料は、TradingView から export した CSV を北極星へ取り込む運用手順をまとめる。詳細 runbook は `docs/34.北極星 TradingView CSV import 運用手順（MVP）.md` を正本とし、本資料では日常の確認観点を扱う。

## 2. 役割分担

- TradingView: Pine の一次検証、Strategy Report / Strategy Tester の CSV export。
- 北極星: CSV import、parse、履歴保存、Backtest Detail 表示、AI summary、comparison。

## 3. 対応 CSV

現行で受け付ける形式は次の 4 種類である。

- Performance Summary 英語ヘッダー
- Performance Summary 日本語ヘッダー
- List of Trades 英語ヘッダー
- List of Trades 日本語ヘッダー

対象外の CSV は、Overview 系、chart export、Broker / Paper Trading の別形式として扱う。

## 4. 取込手順

1. TradingView で strategy を実行する。
2. Strategy Report / Strategy Tester を開く。
3. Performance Summary または List of Trades を CSV export する。
4. 北極星の `/strategy-lab`、`/backtests/:backtestId`、または SymbolDetail の保存済み application から CSV import を実行する。
   - SymbolDetail では CSVファイルを選択して読み込むか、従来どおり CSVテキスト欄へ貼り付ける。
   - ファイル選択時も frontend でテキスト読込し、既存 text-based API に送信する。multipart upload ではない。
5. Backtest Detail で `latest_import`、`imports`、主要指標、parse status を確認する。
6. parsed import が 1 件以上あれば AI summary、2 件以上あれば comparison を確認する。

## 5. 成功時の確認

- `parse_status = parsed`
- `parse_error = null`
- `parsed_summary` に主要指標が入っている
- import 履歴に新しい行が追加されている
- Backtest Detail の主要指標が表示される
- CSV import parsed report 作成直後の Backtest AI summary auto enqueue は phase 1 対象である
- direct CSV import route と application 起点 CSV import route の両方が対象である
- route 別の詳細確認は `docs/運用ドキュメント/08_AI_summary自動生成運用.md` を参照する

## 6. 失敗時の確認

- `parse_status = failed` を確認する。
- `parse_error` と補助説明文を読む。
- 空 CSV、header + data row 不足、required columns 不足、対応形式外 CSV を順に疑う。
- HTTP `413` は body size 超過、`415` は Content-Type 不一致の可能性を確認する。
- 最新 import が failed でも、過去 parsed import があれば既存 summary / comparison の確認は継続できる。

## 7. 再 import の扱い

- import は上書きではなく履歴追加で扱う。
- `latest_import` は常に直近 1 件を示す。
- 比較したい場合は同一 backtest 内に parsed import を複数件用意する。
- raw CSV 全文を docs / PR に貼らない。

## 8. 日本語 CSV の注意

- docs は UTF-8 で保存する。
- 日本語ヘッダーは現行 parser が受け付ける alias を正とする。
- 実 TradingView 日本語 CSV で別ヘッダーが出た場合は、まず実サンプルの header 名だけを記録し、parser alias 追加を別タスクで判断する。
- 個人情報、口座情報、取引口座固有情報を含む raw CSV は共有しない。

## 9. 関連 docs

- `docs/34.北極星 TradingView CSV import 運用手順（MVP）.md`
- `docs/walkthrough.md`
- `docs/仕様書/08_Backtest_Report仕様.md`
- `docs/運用ドキュメント/05_AI_provider運用.md`
- `docs/運用ドキュメント/08_AI_summary自動生成運用.md`
