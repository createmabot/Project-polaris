# 北極星 walkthrough（Rule Lab / Backtest 一巡）

更新日: 2026-05-15

本資料は、Rule Lab から Pine 生成・TradingView 一次検証・CSV 取込・Backtest AI 総評・比較までの一巡導線を、現行MVP実装に合わせて確認するための手順です。  
正本 docs は `docs/0` から参照し、本資料は実施手順のクイックチェック用途として扱います。

読む順番と正本分類は `docs/57.北極星 docs正本整理・読む順番（現行）.md` を参照してください。本資料は仕様判断の一次資料ではなく、現行実装を確認するための walkthrough です。

Post-P3 の release acceptance / stabilization では、主要導線、完成範囲、known limitations、次期候補を `docs/運用ドキュメント/10_release_acceptance_checklist.md` で確認してください。Visual regression は optional pilot であり、通常 smoke や required checks とは分けて扱います。

## 0. 事前準備

1. 依存起動
```bash
pnpm run up
```
2. DB 反映と seed
```bash
cd backend
pnpm exec prisma migrate deploy
pnpm exec prisma generate
pnpm exec prisma db seed
```
3. アプリ起動
```bash
cd ..
pnpm run dev
```

## 1. Strategy 作成

1. `http://localhost:5173/strategy-lab` を開く。
2. 自然言語ルールを入力し strategy を作成する。
3. `POST /api/strategies` が成功し、strategy id が発行されることを確認する。

## 2. Strategy Version 作成

1. 同画面または version 作成導線で strategy version を作成する。
2. `POST /api/strategies/:strategyId/versions` が成功することを確認する。
3. `market` と `timeframe` が version に保存されていることを確認する。Pine generation の初回対象は `JP_STOCK` / `US_STOCK` と canonical `D` / `4H` / `1H` で、default は `JP_STOCK` / `D` のまま維持する。`1D` が入力された場合は `D` として正規化される。

## 3. 自然言語 -> Pine 生成

1. `StrategyVersionDetail` で `Pine を生成` を実行する。
2. `POST /api/strategy-versions/:versionId/pine/generate` 成功を確認する。
3. `GET /api/strategy-versions/:versionId/pine` で `status=available` と `generated_script` を確認する。
4. `warnings` / `assumptions` 相当の表示は `警告` / `前提` として日本語で読めることを確認する。provider 由来の自由文が英語で残る場合は prompt compliance / provider quality の確認対象とし、後段固定 mapping では変換しない。生成 script 自体は変えない。
5. Pine 表示付近の `コピー` ボタンで、TradingView 貼り付け用に全文コピーできることを確認する。
6. 生成した Pine は TradingView の symbol / chart timeframe 上で検証する。internal backtest engine の市場 / 時間足対応範囲が同時に広がったわけではない。

## 4. TradingView 一次検証

1. 生成した Pine を TradingView へ貼り付けて一次検証する。
2. compile error や改善点がある場合はメモを残す。

## 5. Pine 修正再生成（regenerate）

1. `StrategyVersionDetail` の修正入力欄に以下を入力して再生成する。
   - `revision_request`（必須）
   - `compile_error_text`（任意）
   - `validation_note`（任意）
2. `POST /api/strategy-versions/:versionId/pine/regenerate` が成功することを確認する。
3. 失敗時は `failure_reason` / `invalid_reason_codes` / `repair_attempts` を確認する。
4. 再生成後も `generated pine` の `コピー` ボタンが有効であることを確認する。

## 6. Pine lineage / revision input 確認

1. `GET /api/strategy-versions/:versionId/pine` で以下を確認する。
   - `parent_pine_script_id`
   - `source_pine_script_id`
   - `latest_revision_input`
2. 親子関係と修正理由が追跡できることを確認する。

## 7. Backtest 作成と CSV 取込

1. Backtest を作成する。
   - `POST /api/backtests`
2. CSV を取込む。
   - `POST /api/backtests/:backtestId/imports`
   - `parse_status=parsed` の場合、CSV import report 系に限り Backtest AI 総評生成が自動起動される。
3. 受け入れ形式を確認する。
   - Performance Summary（英語ヘッダー）
   - List of Trades（日本語ヘッダー）
   - List of Trades（英語ヘッダー）
4. 失敗時は `parse_error` に不足列が表示されることを確認する。
5. 失敗時の補助文言で、次に修正すべき内容（想定形式 / 必須列 / 空CSV など）が分かることを確認する。
6. HTTP エラー時は、以下のユーザー向け文言になることを確認する。
   - 400: 入力内容・CSV形式・必須項目不足の確認を促す
   - 413: サイズ超過（ファイル/入力が大きすぎる）を案内
   - 415: 送信形式（Content-Type）不一致の可能性を案内

## 8. Backtest Detail 表示

1. `http://localhost:5173/backtests/:backtestId` を開く。
2. 以下を確認する。
   - `used_strategy.snapshot`
   - `latest_import`
   - `imports`
   - parse 成功時の `parsed_summary`
3. AI summary input 説明、自動生成契機、`available` / `unavailable` の見え方、artifact pointer metadata 説明が補足表示として読め、生成・取込・download・diff の挙動が変わっていないことを確認する。

## 9. Backtest AI 総評生成

1. CSV import 成功直後の自動生成結果がある場合は、`GET /api/backtests/:backtestId` の `ai_review` で確認する。
2. 未生成または再生成したい場合は、`BacktestDetail` から AI 総評生成を実行する。
3. `POST /api/backtests/:backtestId/summary/generate` が成功し、`ai_jobs` が `queued -> running -> succeeded|failed` で遷移することを確認する。
4. `GET /api/backtests/:backtestId` の `ai_review` を確認する。
   - `status=available|unavailable`
   - `title`
   - `body_markdown`
5. `GET /api/backtests/:backtestId` の `latest_ai_summary_job` を確認する。
   - `status=queued|running|succeeded|failed`
   - `trigger`
   - `created_at` / `completed_at`
6. `BacktestDetail` は latest job status を read-only 表示するが、polling / live update を行わず、手動再読み込み時点の snapshot として扱うことを確認する。
7. failed の場合も、自動 retry は行わず、既存の `AI総評を生成` button から manual generation / regeneration に進めることを確認する。

## 10. inline comparison

1. 同一 backtest 内で parsed import が2件以上ある状態にする。
2. `BacktestDetail` の inline 比較で差分が表示されることを確認する。

## 10-1. Application report helper 表示

1. `SymbolDetail` から application reports へ遷移する。
2. metrics 欠損、AI summary / artifact 詳細確認先、importless report の補足が report 履歴の helper として表示されることを確認する。
3. report row には AI summary job status を追加せず、`BacktestDetail` で `available` / `unavailable`、latest job status、本文を確認する説明になっていることを確認する。
4. report 一覧、BacktestDetail へのリンク、filter、pagination の挙動が変わっていないことを確認する。

## 11. saved pairwise comparison

1. `この2件で比較を保存する` を実行する。
2. `保存済み比較を見る` から `GET /api/backtest-comparisons/:comparisonId` が表示できることを確認する。
3. `metrics_diff` / `tradeoff_summary` / `ai_summary` を再訪可能であることを確認する。

## 12. seed 固定IDでの最小確認

seed 後は以下で最小動作確認が可能です。

1. version一覧  
`http://localhost:5173/strategies/00000000-0000-4000-8000-000000000201/versions`
2. version詳細  
`http://localhost:5173/strategy-versions/00000000-0000-4000-8000-000000000202`
3. backtest詳細  
`http://localhost:5173/backtests/00000000-0000-4000-8000-000000000401`

## 13. 運用メモ

1. TradingView は表示・監視・一次検証を担う。
2. 北極星は保存・比較・履歴管理・AI要約を担う。
3. 一巡導線で破綻があれば、まず docs 契約との差分を確認してから実装を修正する。

## 14. Home / SymbolDetail / Comparison 確認（最小）

1. Home 表示ブロック確認  
`http://localhost:5173/` を開き、以下を確認する。
   - 共通サイドメニュー（監視 / 保有タブ、折りたたみ）
   - マーケット概況
   - AIデイリーサマリー
   - 最新アラート
   - 注目イベント
   - `Home` 本体に watchlist / positions の詳細一覧が重複していないこと

2. watchlist_symbols から SymbolDetail へ遷移  
左の共通サイドメニューの `監視` タブから銘柄名リンクを押し、`/symbols/:symbolId` へ遷移できることを確認する。

3. positions から SymbolDetail へ遷移  
左の共通サイドメニューの `保有` タブへ切り替え、銘柄名リンク（`symbol_id` がある行）を押し、`/symbols/:symbolId` へ遷移できることを確認する。

4. daily_summary の latest / morning / evening 切替  
Home の `最新 / 朝 / 夜` を切り替え、表示が更新されることを確認する。

5. SymbolDetail の AI論点カード表示  
`/symbols/:symbolId` で AI論点カードが `available` の場合、タイトル・本文（または論点リスト）・生成日時が表示されることを確認する。

6. SymbolDetail の AI論点カード再生成  
AI論点カード表示中でも `AI論点カードを再生成` ボタンが表示され、押下時に `生成中...` へ変化することを確認する。  
未生成状態（`unavailable`）では既存の `AI論点カード生成` が表示されることを確認する。

7. SymbolDetail から Comparison へ遷移  
`比較画面に進む` を押し、Comparison 画面へ遷移できることを確認する。

8. Comparison の AI比較総評生成  
Comparison 画面で AI比較総評の生成操作を実行し、結果表示が更新されることを確認する。

## 15. Home / SymbolDetail / Comparison のE2E固定（最小）

以下の導線は backend の最小E2Eで回帰固定しています。

- seed相当データで `GET /api/home` を開き、主要ブロック供給データ（market_overview / watchlist_symbols / positions / daily_summary / recent_alerts / key_events）を確認
- Home の watchlist_symbols / positions で取得した `symbol_id` を使って `GET /api/symbols/:symbolId` を確認
- `POST /api/symbols/:symbolId/ai-summary/generate` で AI論点カード再生成導線のAPIが破綻していないことを確認
- `POST /api/comparisons`（`symbol_ids: ['7203', '6758']`）-> `POST /api/comparisons/:comparisonId/generate` -> `GET /api/comparisons/:comparisonId` で比較導線を確認

実行コマンド:

```bash
pnpm --filter backend test:e2e:home-symbol-comparison
```

## 16. PowerShell から日本語 JSON を送る際の UTF-8 指定手順

### 背景

PowerShell（Windows デフォルト）は `Invoke-RestMethod` / `Invoke-WebRequest` において、
ペイロードを System.DefaultEncoding（通常 CP932 / Shift_JIS）でエンコードする場合がある。
日本語 `natural_language_rule` を含む JSON をそのまま送ると文字化けし、Pine 生成に失敗するケースがある。

### 対策: UTF-8 バイト列に変換して送信する

```powershell
# 日本語を含む JSON ペイロードを UTF-8 バイト列に変換して送信する例

$payload = @{
  natural_language_rule = "終値が25日移動平均を上抜けたら買い、下抜けたら売る"
  market = "JP_STOCK"
  timeframe = "D"
} | ConvertTo-Json -Depth 10

# UTF-8 バイト列に変換（この手順が文字化け防止の核心）
$utf8Body = [System.Text.Encoding]::UTF8.GetBytes($payload)

Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3000/api/strategies/<strategyId>/versions" `
  -ContentType "application/json; charset=utf-8" `
  -Body $utf8Body
```

### Pine 生成（strategy-versions）の例

```powershell
# Pine 生成を起動する例
Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3000/api/strategy-versions/<versionId>/pine/generate" `
  -ContentType "application/json; charset=utf-8" `
  -Body ([System.Text.Encoding]::UTF8.GetBytes('{}'))
```

### alert summary 生成の例

```powershell
# alert summary 生成を起動する例
Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3000/api/alerts/<alertId>/summary/generate" `
  -ContentType "application/json; charset=utf-8" `
  -Body ([System.Text.Encoding]::UTF8.GetBytes('{}'))
```

### generate_alert_summary が failed の場合の確認手順

```powershell
# failed 時の原因追跡: latest_job フィールドを確認する
$result = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:3000/api/alerts/<alertId>/summary"

# latest_job が null でなければ、job の状態を確認できる
$result.data.latest_job | Format-List
# 出力例:
# job_id       : xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
# job_type     : generate_alert_summary
# status       : failed
# error_message: local_llm: connection refused - provider not available
# model_name   :
# retry_count  : 0
# created_at   : 2026-04-27T00:00:00.000Z
# completed_at : 2026-04-27T00:00:10.000Z
```

### 注意事項

1. `Invoke-RestMethod` の `-Body` に文字列を渡すと、PowerShell が自動的にエンコードする。
   日本語を含む場合は必ず `-Body $utf8Body`（バイト列）形式を使用すること。
2. `-ContentType "application/json; charset=utf-8"` の `charset=utf-8` を省略しても動くが、
   明示することで意図を明確にする。
3. backend 側は `REPLACEMENT CHARACTER (U+FFFD)` や Windows-1252 制御文字を含む
   `natural_language_rule` を受け取った場合、`creation_warnings` に警告を返す。
   これが出た場合は上記の UTF-8 明示手順を確認すること。
## 17. watchlist / positions 実データ管理手順（2026-04 追加）

seed 以外の運用データを Home 起点で扱う最小手順。

1. Home の共通サイドメニューで `監視` タブを開く。
2. SideRail の `監視銘柄を追加` または各行の `編集` / `削除` を使う。
3. 一覧の銘柄リンクから SymbolDetail へ遷移できることを確認する。
4. SideRail の一覧へ反映されることを確認する。
5. Home の共通サイドメニューで `保有` タブを開く。
6. SideRail の `保有銘柄を追加` または各行の `編集` / `削除` を使う。
7. 一覧の銘柄リンクから SymbolDetail へ遷移できることを確認する。
8. SideRail の一覧へ反映されることを確認する。

補足:
- watchlist/positions API は default watchlist/default portfolio が無い場合に自動作成する。
- symbol_code だけで追加した場合、既存 Symbol があれば display_name / market_code / tradingview_symbol を既存値から利用する。
- 既存 Symbol が無い場合、4桁数字の symbol_code は既存 seed 慣例に合わせて `market_code=JP_STOCK`、`tradingview_symbol=TSE:<symbol_code>` で最小作成する。それ以外は symbol_code / display_name の最小 fallback で作成する。
- ユーザーが display_name / market_code / tradingview_symbol を明示した場合、その値を優先する。
- positions は transactions 正本のため、更新・削除は manual transaction 経由で read model を再構築する。
- `/watchlist` と `/positions` は移行期の詳細管理用 route として残すが、主要導線は SideRail とする。

## 18. TradingView実送信 webhook運用手順（固定）

TradingView実送信を前提にした運用手順は次を正本として利用してください。

- `docs/32.北極星 TradingView実送信 webhook運用手順（MVP）.md`

本手順には、以下を含みます。
- Alert message JSON テンプレート
- webhook URL / token / shared_secret の安全な運用手順
- ローカル疑似送信と実送信の違い
- webhook_receipts / alert_events / ai_jobs / Home / SymbolDetail の確認手順
- auth/parse/unresolved/duplicate/summary failed の切り分け

## 19. references供給状況確認（2026-05）

references の供給状況確認は次を正本として利用してください。

- `docs/33.北極星 references供給状況整理と運用課題（MVP）.md`

最小確認手順:

1. SymbolDetail を開き、`関連参照情報` の内訳 `news / disclosure / earnings` を確認する
2. ComparisonDetail を開き、比較全体の参照内訳と各 symbol card の参照内訳を確認する
3. references 0件でも AI論点カード / AI比較総評が生成される場合があるため、本文だけで十分性を判断しない
4. `insufficient_context` 表示だけでなく、`reference_count` と references 実数を併せて確認する
5. alert summary 失敗時は `collect_references_for_alert` と `generate_alert_summary` を分けて確認する
6. SymbolDetail の `関連参照情報を再取得` はユーザー操作起点でだけ実行し、実行中はボタンが disabled になり、成功または失敗の表示が出ることを確認する

補足:

- 2026-05-01 観測時点では `7203: news 6件 / disclosure 0件 / earnings 0件`、`6758: 0件` だった
- `disclosure` と `earnings` は collector 未実装ではなく、実装は存在する
- `reference_count = 0` でも `structured_json.insufficient_context = false` の AI summary が残ることがあるため、現時点では運用注意として扱う

## 20. TDnet disclosure / earnings 0件時の切り分け（2026-05）

1. まず `collect_references_for_alert` の `ai_jobs.response_payload.diagnostics` を確認する。
2. `disclosure.reason` / `earnings.reason` を見て、0件理由を切り分ける。
3. 理由ごとの見方:
   - `tdnet_fetch_failed`: 取得失敗。403 / timeout / 一時障害を疑う。
   - `tdnet_no_file_for_date`: 対象日一覧が存在しない。土日祝や対象日未掲載の可能性が高い。
   - `tdnet_parse_zero_rows`: HTML は取れているが row 0 件。TDnet HTML 構造変更を疑う。
   - `tdnet_rows_exist_but_no_symbol_match`: 一覧 row はあるが symbol 照合で落ちている。
   - `tdnet_symbol_match_but_no_earnings_title`: symbol 一致 row はあるが earnings keyword に入っていない。
   - `tdnet_no_matching_disclosure_in_lookback`: lookback 期間内に該当 disclosure がなかった。
   - `tdnet_no_matching_earnings_in_lookback`: lookback 期間内に該当 earnings がなかった。
4. 実データ 1 回確認の最小手順:
   - `I_list_001_YYYYMMDD.html` を 1 回だけ取得する
   - `parseTdnetRows` 相当で row count を確認する
   - `7203` / `6758` など対象 code の行があるか確認する
5. 2026-05-02 の観測メモ:
   - `I_list_001_20260501.html` は `HTTP 200`
   - parsed row count は `100`
   - `7203` / `6758` 該当 row は `0`
   - 少なくともこの 1 日については parser 崩れではなく「その日の一覧に対象銘柄がいない」寄りと判断する

## 21. TradingView CSV import 運用手順（2026-05-05 追記）

TradingView 実 CSV の出し方と、北極星での取り込み確認手順は次の runbook を正本とする。

- `docs/34.北極星 TradingView CSV import 運用手順（MVP）.md`

最低限の確認順:
1. TradingView 側で Strategy Report / Strategy Tester を開く。
2. `Performance Summary` または `List of Trades` を CSV export する。
3. 北極星の Rule Lab / Backtest 画面から CSV import を実行する。
4. Backtest Detail で `latest import` `imports` `parsed件数` `failed件数` を確認する。
5. 最新 import が failed でも、過去 parsed import が残っていれば比較・AI総評は継続確認する。

注記:
- TradingView の画面名は環境により `Strategy Report` と `Strategy Tester` の揺れがある。
- 北極星が現行で受け付けるのは `Performance Summary 英語` `Performance Summary 日本語` `List of Trades 英語` `List of Trades 日本語`。
- Performance Summary 日本語ヘッダーは、2026-05-08 時点で固定した最小 alias に対応している。実TradingView CSVで別ヘッダーが確認された場合は後続タスクで alias を追加する。

## 22. MVP受入確認チェックリスト（2026-05-07 追記）
MVP完了判定の通し確認には docs/36.北極星 MVP受入確認チェックリスト（MVP）.md を使う。主要導線、runbook参照先、MVP後課題を1つに集約している。

## 23. Rule Lab 日本語入力の扱い（2026-05-08 追加）

- Rule Lab の通常利用経路はブラウザ UI であり、日本語自然文入力は UI 経由で確認する。
- PowerShell / shell 経路で日本語 JSON を送る場合は、UTF-8 byte array + application/json; charset=utf-8 が必要。
- shell 経路の encoding 制約と、UI 経路の通常利用可否は分けて扱う。
- UI 経路の再確認メモは docs/41.北極星 Rule Lab日本語入力 UI経路再確認メモ（MVP後P1）.md を参照する。

## 24. docs文字化け棚卸しの正本（2026-05-08 追加）

- docs 全体の文字化け棚卸し範囲と優先順位は docs/42.北極星 docs文字化け棚卸し範囲整理（MVP後P1）.md を正本とする。
- PowerShell 表示上の文字化けとファイル実体の文字化けは分けて扱い、UTF-8 明示読み取りまたは GitHub 表示で再確認する。

## 25. snapshot stale / market_status unknown の扱い（2026-05-08 追加）

- snapshot stale / `market_status = unknown` の運用上の見方は docs/43.北極星 snapshot stale・market_status unknown整理（MVP後P2）.md を正本とする。
- 現行MVPでは stale / unknown を原則 failure ではなく部分成立として扱い、snapshot がない場合も Home row や SymbolDetail 全体は落とさない。

## 26. MVP後P2完了整理と次候補（2026-05-08 追加）

- MVP後P2の完了状況、残課題、P3着手順の比較は docs/44.北極星 MVP後P2完了整理とP3着手判断.md を正本とする。

## 27. browser-based E2E導入方針（2026-05-08 追加）

- browser-based E2E の導入方針、PoC 対象、runner 比較は docs/45.北極星 browser-based E2E導入方針（P3）.md を正本とする。
- Playwright local-only PoC の実行手順も docs/45 を参照する。
- Tailwind 化を見据えた frontend test 方針と、Playwright 対象拡張を急がない判断も docs/45 を参照する。

## 28. Tailwind化・UI構造安定化方針（2026-05-09 追加）

- Tailwind 設定追加は先に進めてよいが、`Home` `SymbolDetail` などの画面単位移行は、画面導線 / IA / ナビゲーション方針整理の後に行う。
- 全画面を先に Tailwind 化してから導線変更する方針は採らず、詳細は docs/46.北極星 Tailwind化・UI構造安定化方針（P3）.md を正本とする。
- Tailwind 設定追加後の最小確認は `pnpm --filter frontend build` `pnpm --filter frontend test -- src/pages/Home.test.tsx` `pnpm test:e2e:browser` を使う。

## 29. 画面導線・IA再整理（2026-05-09 追加）

- 画面導線 / IA / ナビゲーション方針の正本は docs/47.北極星 画面導線・IA再整理（P3）.md とする。
- Tailwind 画面移行や browser-based E2E の対象拡張は、docs/47 の導線整理を前提に進める。
- `AppLayout` `PageHeader` `Navigation` `TextLink` の最小土台は `Home` `SymbolDetail` にだけ適用済みで、`SideRail` の最小 PoC も同 2 画面にのみ適用済み。
- `SideRail` は `監視` / `保有` タブ切り替え、折りたたみ、watchlist / positions の最小 CRUD モーダル、既存 `/watchlist` `/positions` への補助導線までを備える。
- `Home` の最小移行により、watchlist / positions の詳細一覧は `Home` 本体から外し、一覧確認は `SideRail` に寄せた。
- SideRail CRUD 後の再取得は `/api/home` `/api/watchlist-items` `/api/positions` 単位で行い、fetch 最適化は後続とする。

- `SymbolDetail` は最小移行済みで、`現在スナップショット` `最新アラート` `最新AI論点カード` `Research Note` `関連参照情報` の section を整理し、`SideRail` と共存する画面構造にした。

## 30. 銘柄起点ストラテジー適用フロー設計（2026-05-09 追加）

- 銘柄起点ストラテジー適用フローの正本は [docs/48.北極星 銘柄起点ストラテジー適用フロー設計（P3）.md](./48.北極星%20銘柄起点ストラテジー適用フロー設計（P3）.md) とする。
- `SymbolDetail` から `ストラテジー / 検証結果` 領域を起点に、CSV 取込、内部バックテスト、検証レポート詳細、銘柄別比較へ接続する設計であり、実装前の導線確認観点も [docs/48](./48.北極星%20銘柄起点ストラテジー適用フロー設計（P3）.md) を参照する。

## 31. SymbolDetail の `ストラテジー / 検証結果` section（2026-05-09 追加）

- `SymbolDetail` には `ストラテジー / 検証結果` section が表示される。
- 現時点では準備中表示であり、strategy 適用、CSV 取込、内部バックテスト、比較導線は未接続である。
- 既存 `/strategy-lab` `/backtests` への補助導線が表示されることを確認する。

## 32. StrategyList / StrategyDetail 画面設計（2026-05-09 追加）

- `StrategyList` / `StrategyDetail` の設計正本は [docs/49.北極星 StrategyList・StrategyDetail 画面設計（P3）.md](./49.北極星%20StrategyList・StrategyDetail%20画面設計（P3）.md) とする。
- `StrategyLab` は作成 / 生成入口、`StrategyVersionDetail` は version 詳細、`BacktestDetail` はレポート詳細という責務分離を維持したまま、将来の strategy definition 一覧 / 詳細導線を設計している。
- 実装前の導線確認観点は `docs/49` の Mermaid を参照する。

## 33. PR本文・文字コード方針（2026-05-09 追加）

- PR 本文の文字化け回避のため、ASCII English のみを使う。
- 日本語の詳細説明は docs に記載し、PR 本文は要約とカテゴリ名だけに留める。
- PR 本文には日本語ファイル名やローカル Windows path を含めない。
- `.github/pull_request_template.md` をテンプレートとして使い、`Summary` `Files changed` `Scope` `Checks` `Not included` `Secret check` の形を維持する。
- docs 本文は UTF-8 の日本語で保存し、PR 本文は正本にしない。

## 34. StrategyList placeholder route（2026-05-09 追加）

- `/strategies` を開くと `StrategyList` placeholder page が表示されることを確認する。
- ここでは再利用可能な Strategy Definition を将来一覧化する予定であり、現時点では準備中表示のみであることを確認する。
- 既存 `/strategy-lab` `/backtests` への補助導線が表示されることを確認する。

## 35. StrategyDetail placeholder route（2026-05-10 追加）

- `/strategies/<id>` を開くと `StrategyDetail` placeholder page が表示されることを確認する。
- `strategy_id` 表示があり、現時点では準備中画面であることを確認する。
- `version 一覧を開く` `ストラテジー作成を開く` `検証レポート一覧を開く` の補助導線が表示されることを確認する。

## 36. Strategy保存概念整理（2026-05-10 追加）

- Strategy Definition / Strategy Version / Backtest Report / Symbol Strategy Application の保存概念整理は [docs/50.北極星 Strategy保存概念整理（P3）.md](./50.北極星%20Strategy保存概念整理（P3）.md) を正本とする。
- docs-only の設計整理であり、runtime の確認手順は追加しない。
- 後続で existing strategy data display、strategy metadata、`SymbolDetail` apply UI を実装する場合は docs/50 の段階案を参照する。

## 37. StrategyList / StrategyDetail existing data display（2026-05-10 追加）

- `/strategies` を開き、既存 strategy data がある場合は strategy row、version count、latest version summary が表示されることを確認する。
- strategy data がない場合は empty state が表示されることを確認する。
- `/strategies/<id>` を開き、既存 version data がある場合は version rows と `/strategy-versions/<versionId>` への導線が表示されることを確認する。
- `StrategyLab` と `BacktestList` への補助導線が維持され、`BacktestList` / `BacktestDetail` を置き換えていないことを確認する。

## 38. Strategy metadata migration decision（2026-05-10 追加）

- Strategy metadata の保存方針は [docs/51.北極星 Strategy metadata migration decision（P3）.md](./51.北極星%20Strategy%20metadata%20migration%20decision（P3）.md) を正本とする。
- 初回は `StrategyRule.status` を `active` / `archived` に使う方針であり、favorite / usage metadata は後続判断とする。
- docs-only の設計整理であり、runtime の確認手順は追加しない。

## 39. StrategyList status filter / archive restore（2026-05-10 追加）

- `/strategies` で `表示対象` filter が表示され、`有効` / `アーカイブ` / `すべて` を切り替えられることを確認する。
- active row では `アーカイブ` action が表示されることを確認する。
- archived row では `復元` action が表示されることを確認する。
- `/strategies/<id>` でも strategy status に応じて `アーカイブ` または `復元` action が表示されることを確認する。
- hard delete action が存在しないことを確認する。

## 40. SymbolDetail apply selection UI（2026-05-10 追加）

- `SymbolDetail` の `ストラテジー / 検証結果` section で active strategy 候補が表示されることを確認する。
- active strategy 候補は検索、表示件数、ページ送りで絞り込め、候補が多い場合も全件を縦に展開しないことを確認する。
- strategy 選択後に version 候補が表示されることを確認する。
- version を選んでも `未保存` であり、この銘柄への適用保存は未実装であることを確認する。
- `適用を保存（準備中）`、`CSV取込（後続）`、`内部バックテスト（後続）` が実行不可で表示されることを確認する。
- `StrategyDetail` / `StrategyVersionDetail` への補助導線が表示されることを確認する。

## 41. Symbol Strategy Application DB/API設計

- Symbol Strategy Application の DB / API 設計は [docs/52.北極星 Symbol Strategy Application DB・API設計（P3）.md](./52.北極星%20Symbol%20Strategy%20Application%20DB・API設計（P3）.md) を正本とする。
- この項目は docs-only の設計確認であり、runtime 手順は追加しない。
- 次の実装では Prisma schema draft / migration、GET symbol applications API、POST symbol application API、`SymbolDetail` apply 保存処理の順で確認する。

## 42. Symbol Strategy Application schema / migration

- Symbol Strategy Application の Prisma schema / migration は追加済みである。
- この段階では runtime UI 確認は不要であり、`SymbolDetail` apply 保存処理も未接続である。
- 次に API 実装へ進む場合は docs/52 を参照する。

## 43. GET symbol applications API

- GET symbol applications API は追加済みである。
- runtime UI 確認はまだ不要であり、`SymbolDetail` apply 保存処理も未接続である。
- API を確認する場合は、対象 symbol の application list が返り、latest run と latest backtest report summary が必要最小限で含まれることを確認する。

## 44. POST symbol application API

- POST symbol application API は追加済みである。
- API 確認をする場合は、対象 symbol と active strategy / version を指定して application を作成できることを確認する。
- archived strategy は保存不可であり、同一 symbol + strategy version の active duplicate は拒否されることを確認する。
- `SymbolDetail` からの保存 UI 接続、CSV取込、内部バックテスト接続はまだ未実装である。

## 45. SymbolDetail apply保存処理

- `SymbolDetail` の `ストラテジー / 検証結果` section で active strategy / version を選べることを確認する。
- `適用を保存` で Symbol Strategy Application を保存できることを確認する。
- 保存後に保存済み application 一覧が表示されることを確認する。
- 未保存の選択中 state では CSV取込 / 内部バックテストが disabled であり、保存済み application の CSV取込は次項で確認する。
- latest run / latest report がある場合は summary が表示されることを確認する。

## 46. Symbol Strategy Application CSV import wiring

- `SymbolDetail` の保存済み application 行から TradingView CSV を取り込めることを確認する。
- CSVファイル選択または従来の CSVテキスト貼り付けで取り込めることを確認する。ファイル選択時は選択ファイル名が表示され、CSVテキスト欄へ読み込まれることを確認する。
- ファイル読込失敗時は取込を実行せず、短い失敗表示になることを確認する。
- valid CSV で Backtest / BacktestImport / application run が作成され、latest run / latest report が更新されることを確認する。
- `検証レポートを開く` から BacktestDetail へ遷移できることを確認する。
- internal backtest はまだ disabled であることを確認する。

## 47. Symbol Strategy Application internal backtest wiring

- `SymbolDetail` の保存済み application 行から内部バックテストを開始できることを確認する。
- internal backtest 開始後に application run が作成され、latest run に `internal_backtest` が反映されることを確認する。
- 起動後に `execution_id` が表示されることを確認する。
- result detail / BacktestDetail report 化は未接続であり、後続タスクとして扱うことを確認する。

## 48. related reports / applied symbols display

- `StrategyDetail` で適用済み銘柄と関連検証レポートが表示されることを確認する。
- `SymbolDetail` で保存済み application の latest run / latest report が表示されることを確認する。
- internal backtest run の場合は execution id と、結果詳細表示が後続である旨を確認する。
- `BacktestDetail` で銘柄起点 application backlink が表示されることを確認する。
- application archive / restore、internal execution result detail、BacktestDetail redesign は未接続である。

## 49. Symbol Strategy Application archive / restore

- `SymbolDetail` で保存済み application をアーカイブできることを確認する。
- `StrategyDetail` で applied symbols の active / archived / all を切り替えられることを確認する。
- archived application を `StrategyDetail` から復元できることを確認する。
- archive / restore 後も related reports / run history が削除されないことを確認する。

## 追記（2026-05-10 その9）

- `SymbolDetail` の保存済み application row で latest run が `internal_backtest` の場合、execution status と result summary が read-only 表示されることを確認する。
- queued / running / failed / succeeded の状態表示を確認し、succeeded の場合は `bar_count` や `price_change_percent` などの主要 metrics が表示されることを確認する。
- この確認は read-only であり、Backtest report 化や `BacktestDetail` redesign はまだ行わない。

## 50. BacktestDetail backlink refinement

- `BacktestDetail` で `銘柄起点の適用情報` section を確認し、application / run / symbol / strategy / strategy version の関係が表示されることを確認する。
- SymbolDetail / StrategyDetail / StrategyVersionDetail への backlink が表示されることを確認する。
- application 由来でない Backtest では、BacktestDetail が従来どおり個別 report detail として表示されることを確認する。

## 51. SideRail refresh optimization

- Home を開いたとき、Home 本体と SideRail が同じ latest home data を共有し、SideRail の監視 / 保有表示が維持されることを確認する。
- SideRail で監視銘柄を追加・編集・削除した後、監視銘柄表示と Home 由来の SideRail 表示が更新されることを確認する。
- SideRail で保有銘柄を追加・編集・削除した後、保有銘柄表示と Home 由来の SideRail 表示が更新されることを確認する。
- SymbolDetail では従来どおり SideRail が latest home data を取得し、銘柄詳細導線が壊れていないことを確認する。

## 52. UI component cleanup first step

- Home と SymbolDetail の主要 section が従来どおり表示されることを確認する。
- `SectionCard` 追加後も Home の日次確認、SideRail、SymbolDetail の snapshot / AI / Research Note / references 導線が変わっていないことを確認する。
- 今回は Button / EmptyState / LoadingState の共通化や全面リデザインは行わない。

## 53. P3 read-only navigation smoke

- Playwright scenario で Home → SymbolDetail → StrategyDetail → BacktestDetail の read-only 導線を確認する。
- `SymbolDetail` では `ストラテジー / 検証結果` section と保存済み application から `StrategyDetail` への導線を確認する。
- `StrategyDetail` では保存済み application と related report から `BacktestDetail` への導線を確認する。
- `BacktestDetail` では SymbolDetail / StrategyDetail / StrategyVersionDetail への backlink が表示されることを確認する。
- この smoke では CRUD、CSV import、internal backtest、archive / restore は実行しない。

## 54. SymbolDetail Strategy Application display cleanup

- `SymbolDetail` の `ストラテジー / 検証結果` section で、保存済み application の summary / latest run / latest report が従来どおり表示されることを確認する。
- StrategyDetail / StrategyVersionDetail / BacktestDetail へのリンクが維持されていることを確認する。
- CSV import、internal backtest、archive / restore の既存操作が表示整理後も壊れていないことを確認する。
- API / backend / DB / Prisma schema の変更は含まない。

## 55. BacktestDetail backlink 表示整理

- `BacktestDetail` で `銘柄起点の適用情報` が表示される場合、application / run / symbol / strategy の情報が分かれて読めることを確認する。
- `SymbolDetail に戻る` / `StrategyDetail に戻る` / `StrategyVersionDetail に戻る` の導線が維持されていることを確認する。
- API / backend / DB は変更せず、表示整理のみであることを確認する。

## 56. P3 現在地と残課題整理

- P3 の現在地は [[53.北極星 P3現在地と残課題整理（P3）]] を参照する。
- Home / SideRail / SymbolDetail / StrategyDetail / BacktestDetail の read-only 導線、Symbol Strategy Application、CSV import wiring、internal backtest wiring、BacktestDetail backlink、UI cleanup の完了範囲を確認する。
- 次に実装へ進む場合は、internal backtest result の Backtest report 化、application / run 表示改善、UI component cleanup 第二段階、P3 smoke 追加範囲整理から選ぶ。

## 57. Tailwind化 / UI構造安定化の残タスク確認

- Tailwind化 / UI構造安定化の残タスクは [[53.北極星 P3現在地と残課題整理（P3）]] の `Tailwind化 / UI構造安定化の残タスク` section を参照する。
- Tailwind化は見た目刷新完了ではなく、土台実装と導線安定化の段階であることを確認する。
- 次に UI cleanup を進める場合は、既存 Playwright smoke と主要導線を壊さない範囲で section 単位に進める。

## 追記（2026-05-10）

- internal backtest result の Backtest report 化は、succeeded execution のみを対象にする。
- report 化後は application run に `internalBacktestExecutionId` と `backtestId` が併存し、BacktestDetail は個別 report detail として確認する。
- CSV import 由来 report と異なり、internal backtest report では `BacktestImport` を作らない。
- 動作確認では、同じ execution から二重に Backtest が作成されないこと、queued / running / failed / canceled execution が report 化されないことを確認する。
- API 確認では `POST /api/symbol-strategy-applications/:applicationId/internal-backtests/:executionId/report` を使い、succeeded execution のみ report 化されることを確認する。

## 追記（2026-05-10）

- `SymbolDetail` の saved application で latest run が succeeded internal backtest の場合、`Backtest report を作成` を実行できる。
- report 化後は application list が再取得され、BacktestDetail への導線が表示されることを確認する。
- queued / running / failed / canceled execution では report 化導線を出さない。CSV import 由来 report の導線は従来どおり確認する。

## 追記（2026-05-10）

- internal backtest 由来の Backtest report を確認する場合、BacktestDetail で `internal backtest report` section が表示されることを確認する。
- この report では `BacktestImport` が作成されないこと、execution id / result summary / artifact pointer が read-only で見えることを確認する。
- CSV import 由来 report では従来どおり import 履歴と parsed summary が表示されることを確認する。

## 追記（2026-05-10）

- internal backtest 由来 report で AI summary を生成する場合、BacktestImport なしでも result summary / artifact pointer / execution id が入力文脈に含まれることを確認する。
- CSV import 由来 report では従来どおり parsed summary / comparison diff を使う。
- AI summary の生成 endpoint と BacktestDetail の導線は既存のまま確認する。

## 追記（2026-05-10）

- BacktestDetail で internal backtest 由来 report を確認する場合、artifact pointer の概要 field と raw JSON が表示されることを確認する。
- artifact がない report では、未生成または未保存である旨が表示され、エラー表示にならないことを確認する。
- CSV import 由来 report の import 履歴と parsed summary 表示は従来どおり確認する。

## 追記（2026-05-10）internal backtest report 化の完了確認

- 一連の確認観点は docs/52 / docs/53 を参照する。
- SymbolDetail で succeeded internal execution から Backtest report 化し、BacktestDetail で importless report / backlink / AI summary context / artifact pointer 表示を確認する。
- BacktestImport が作られないこと、artifact download・internal polling 本格化は未実装であることを確認する。AI summary 自動生成の現行確認は `docs/運用ドキュメント/08_AI_summary自動生成運用.md` を参照する。

## 追記（2026-05-10）internal backtest report smoke

- Browser smoke では seed 済み internal_backtest 由来 Backtest report を read-only に開き、実行系操作は行わない。
- BacktestDetail で internal backtest report section、BacktestImport なし説明、execution id、result summary、artifact pointer、SymbolDetail / StrategyDetail backlink が表示されることを確認する。
- internal backtest 実行、report conversion、AI summary 生成、artifact download は smoke 対象外とする。

## 追記（2026-05-10）P3完了判断の確認観点

- P3 の完了判断は docs/53 の最終棚卸しを参照する。
- Runtime 確認は既存 Home → SymbolDetail → StrategyDetail → BacktestDetail read-only smoke と internal backtest report read-only smoke を中心に行う。
- UX改善、未対応画面の Tailwind整理、AI summary 自動生成、artifact download、Visual regression は P3完了後の後続判断とする。

## 追記（2026-05-10）P3完了宣言後の確認観点

- P3は docs/53 の完了宣言に従い、銘柄起点 strategy application と report 導線の整備段階として完了扱いにする。
- 通常確認では Home / SideRail / SymbolDetail / StrategyDetail / BacktestDetail の read-only 導線と、CSV import report / internal backtest report の表示を確認する。
- 次フェーズ確認では、UI / UX cleanup、application / run 表示改善、CSV / internal report 比較 UX のどれを先に進めるかを docs/53 のおすすめ順で判断する。

## 追記（2026-05-10）UI / UX cleanup 初手

- `StrategyDetail` の version / 適用済み銘柄 / 関連検証レポートで、empty / error 表示が従来文言のまま表示されることを確認する。
- `EmptyState` / `ErrorState` 導入後も StrategyDetail / SymbolDetail / BacktestDetail の read-only 導線が変わらないことを確認する。

## 追記（2026-05-10）BacktestDetail 状態表示 cleanup

- `BacktestDetail` の取得失敗、取込データなし、解析済みサマリーなし、AI総評未生成の表示が従来文言のまま確認できることを確認する。
- CSV import 由来 report と internal_backtest 由来 importless report の導線、artifact 表示、AI summary 導線が変わらないことを確認する。

## 追記（2026-05-10）SymbolDetail 状態表示 cleanup

- `SymbolDetail` の取得失敗、最新アラートなし、保存済み application なし / 取得失敗、Research Note なしの表示が従来文言のまま確認できることを確認する。
- Strategy Application、CSV取込、internal backtest、Backtest report 化の操作導線が変わらないことを確認する。

## 追記（2026-05-10）LoadingState cleanup 初手

- `StrategyDetail` / `BacktestDetail` の loading 表示が従来文言のまま確認できることを確認する。
- LoadingState 導入後も StrategyDetail / BacktestDetail / SymbolDetail の read-only 導線と P3 smoke が変わらないことを確認する。

## 追記（2026-05-10）状態表示 component 第一段階完了

- `EmptyState` / `ErrorState` / `LoadingState` の第一段階は `StrategyDetail` / `BacktestDetail` / `SymbolDetail` の一部適用まで完了扱いとする。
- `Home` / `SideRail` / `StrategyVersionDetail` / `StrategyLab` / `BacktestComparisonDetail` は未適用として残す。
- 次に進める場合は `Button` 共通化、`StatusBadge` 共通化、`KeyValueRow` / `DataList` 共通化の順で確認する。

## 追記（2026-05-10）Button cleanup 初手

- `StrategyDetail` の strategy / application archive / restore ボタンが従来文言と挙動のまま表示されることを確認する。
- `SymbolDetail` の CSV取込 / internal backtest / report conversion、`BacktestDetail` の AI summary 生成ボタンは今回の共通化対象外として確認する。

## 追記（2026-05-10）SymbolDetail Button cleanup

- `SymbolDetail` の保存済み application archive、適用保存、AI論点カード生成 / 再生成ボタンが従来文言と挙動のまま表示されることを確認する。
- CSV取込、internal backtest、Backtest report 作成の実行ボタンは今回の共通化対象外として確認する。

## 追記（2026-05-11）StatusBadge cleanup 初手

- `StrategyDetail` の strategy / version status と、`SymbolDetail` の application / latest run status が従来文字列のまま表示されることを確認する。
- archive / restore、CSV取込、internal backtest、Backtest report 作成の操作導線が変わらないことを確認する。

## 追記（2026-05-11）BacktestDetail StatusBadge cleanup

- `BacktestDetail` の report status、latest import parse status、import 履歴、銘柄起点 application / run status が従来文字列のまま表示されることを確認する。
- AI summary、comparison、artifact 表示、CSV import report / internal backtest report の導線が変わらないことを確認する。

## 追記（2026-05-11）BacktestDetail KeyValue cleanup

- `BacktestDetail` の基本情報と銘柄起点 application backlink の key-value 表示が従来文言のまま表示されることを確認する。
- AI summary、importless report、artifact 表示、CSV import report / internal backtest report の導線が変わらないことを確認する。

## 追記（2026-05-11）UI共通 component 第一巡完了

- `StrategyDetail` / `SymbolDetail` / `BacktestDetail` で、empty / error / loading / button / status / key-value 表示の第一巡適用が既存文言と導線を維持したまま確認できることを確認する。
- `Home` / `SideRail` / `StrategyVersionDetail` / `StrategyLab` / `BacktestComparisonDetail`、JSON viewer、DataTable、form input、modal は第一巡対象外として確認する。

## 追記（2026-05-11）Symbol Strategy Application 表示改善

- `SymbolDetail` の保存済み application で application id、status、run count、version、latest run、latest report が読みやすく表示されることを確認する。
- CSV取込、internal backtest、Backtest report 作成、archive、保存操作、StrategyDetail / StrategyVersionDetail / BacktestDetail への導線が変わらないことを確認する。

## 追記（2026-05-11）CSV / internal report 比較 UX

- CSV import report と internal backtest report の比較 UX は docs/53 の方針に従う。
- 初回確認では、`SymbolDetail` / `StrategyDetail` / `BacktestDetail` で report の由来、latest report、backlink が読めることを確認し、本格比較画面は後続判断とする。

## 追記（2026-05-11）CSV / internal report 由来表示

- `StrategyDetail` の関連検証レポートと `SymbolDetail` の latest report で、`report type` と `source` が表示されることを確認する。
- CSV import report と internal backtest report の比較 UX は、まず既存画面上の read-only 由来表示から確認し、新規比較画面は後続判断とする。

## 追記（2026-05-11）同一 application 関連 report 導線

- `BacktestDetail` の `銘柄起点の適用情報` 付近で、同じ application の関連レポートが表示されることを確認する。
- CSV import report を見ている場合に internal backtest report、internal backtest report を見ている場合に CSV import report へ辿れる導線として確認し、比較実行や新規比較画面は後続判断とする。

## 追記（2026-05-11）CSV / internal report 比較 UX 第一段階完了

- `StrategyDetail` / `SymbolDetail` で report type / source が確認できることを確認する。
- `BacktestDetail` の `同じ application の関連レポート` から、同一 application 配下の CSV import report と internal backtest report を相互に辿れることを確認する。
- metrics 横並び比較、AI summary 比較、artifact diff、新規比較画面は後続判断とする。

## 追記（2026-05-11）CSV / internal report metrics 横並び比較確認

- `BacktestDetail` の `銘柄起点の適用情報` で、同じ application の関連レポートがある場合は `metrics 横並び比較` が表示される。
- current report と related report の report type、source、status、period、trade_count、return、drawdown、profit_factor、win_rate を read-only に確認する。
- 表示は既存 response で取得できる範囲に限定され、比較結果保存、新規比較画面、artifact diff、AI summary 自動比較は未実装である。

## 追記（2026-05-11）CSV / internal report metrics 比較補助完了

- `BacktestDetail` で同じ application の関連レポートがある場合、current report と related report の metrics 横並び比較補助を確認する。
- この確認範囲を CSV / internal report 比較 UX の read-only 第一段階完了として扱う。
- comparison entity、metrics normalization table、新規比較画面、AI summary 比較、artifact diff は確認対象外として後続判断に残す。

## 追記（2026-05-11）SymbolDetail latest pair 表示

- `SymbolDetail` の saved application row で `CSV / internal reports` が表示されることを確認する。
- CSV import report と internal backtest report がある場合、それぞれ BacktestDetail への link、report type、source、status、run status、updated が read-only に表示されることを確認する。
- 片方だけ存在する場合も自然に表示し、比較実行、新規比較画面、CSV import / internal backtest / report conversion の挙動変更は確認対象外とする。

## 追記（2026-05-11）CSV / internal report 比較 UX 現時点完了

- CSV / internal report 比較 UX は、既存画面上の read-only 確認として現時点完了扱いにする。
- 通常確認では `StrategyDetail` / `SymbolDetail` の report type / source、`BacktestDetail` の同一 application 関連 report と metrics 横並び比較補助、`SymbolDetail` の CSV / internal latest pair を確認する。
- 新規比較画面、comparison entity、metrics normalization table、AI summary 比較、artifact diff、Visual regression は後続判断として確認対象外にする。

## 追記（2026-05-11）SymbolDetail saved application filter

- `SymbolDetail` の saved application row で `表示対象`、`すべて`、`reportあり`、`reportなし` が表示されることを確認する。
- filter 切替で表示件数 summary と application row が client-side に更新されることを確認する。
- backend pagination / server-side filter、CSV import、internal backtest、report conversion、archive の挙動変更は確認対象外とする。

## 追記（2026-05-11）SymbolDetail application / report 表示改善完了

- `SymbolDetail` の saved application row で application summary、latest run、latest report、CSV / internal latest pair、表示 filter、件数 summary が確認できることを確認する。
- 確認範囲は既存 API response の read-only 表示改善であり、CSV import、internal backtest、report conversion、archive、保存処理の挙動は変更しない。
- server-side pagination / filter、archived application を含む本格一覧、report list grouping、Visual regression は後続判断として確認対象外にする。

## 追記（2026-05-11）Symbol Strategy Application pagination / filter 方針

- 現在の `SymbolDetail` saved application filter は client-side の `すべて` / `reportあり` / `reportなし` までを確認対象とする。
- server-side pagination / filter に進む場合は、既存 `GET /api/symbols/:symbolId/strategy-applications` の default active list が変わらないことを確認する。
- optional query の候補は status、report presence、report source、strategy、strategy version、run type、run status とし、CSV import、internal backtest、report conversion、archive、保存処理の挙動変更は確認対象外にする。

## 追記（2026-05-11）Symbol Strategy Application server-side filter 確認

- `SymbolDetail` の saved application filter で `すべて` / `reportあり` / `reportなし` を切り替えたとき、application list が再取得されることを確認する。
- backend API では `status=active` が未指定時 default で維持され、`status=all` と `report_presence=with_reports|without_reports` が使えることを確認する。
- CSV / internal latest pair、latest run、latest report、CSV import、internal backtest、report conversion、archive、保存処理の挙動は変更しない。

## 追記（2026-05-11）Symbol Strategy Application server-side filter 完了整理

- Symbol Strategy Application server-side filter 第一段階は、既存 endpoint の後方互換拡張として確認対象に含める。
- 通常確認では、未指定時の active list、`reportあり` / `reportなし` の server-side 再取得、pagination meta と latest report 系 field の維持を確認する。
- `report_source` は後続で確認対象に入った。strategy / version、run type / run status、archived application 本格一覧、application-specific runs / reports endpoint は後続確認対象とする。

## 追記（2026-05-11）Symbol Strategy Application report_source filter 確認

- `SymbolDetail` の saved application filter で `source`、`すべて`、`CSV`、`internal` が表示されることを確認する。
- source filter を切り替えた場合、`report_source=csv_import|internal_backtest` を使って application list が再取得されることを確認する。
- `reportあり` / `reportなし` との組み合わせ、CSV / internal latest pair、latest run、latest report、pagination meta は維持する。

## 追記（2026-05-11）Symbol Strategy Application run_type / run_status filter 方針確認

- `run_type` / `run_status` filter は、次に実装する場合は latest run 基準として確認する。
- `report_presence` / `report_source` は report の有無と source、`run_type` / `run_status` は latest run の type / status として意味を分けて確認する。
- any run 履歴検索、run 一覧、application-specific runs endpoint は後続確認対象とする。

## 追記（2026-05-11）Symbol Strategy Application run_type / run_status filter 確認

- `SymbolDetail` の saved application filter で `latest run type` と `latest run status` が表示されることを確認する。
- latest run type は `すべて` / `CSV` / `internal`、latest run status は `すべて` / `running` / `succeeded` / `failed` を最小 UI として確認する。
- backend API は `run_type=csv_import|internal_backtest` と `run_status=queued|running|succeeded|failed|canceled` を latest run 基準で扱う。
- any run 履歴検索、run 一覧、application-specific runs endpoint は後続確認対象とする。

## 追記（2026-05-11）Symbol Strategy Application server-side filter 第一段階完了確認

- `SymbolDetail` の saved application filter で report 有無、source、latest run type、latest run status を切り替えられることを確認する。
- backend API は `status`、`report_presence`、`report_source`、`run_type`、`run_status` を optional query として扱い、未指定時は `status=active` を維持する。
- `run_type` / `run_status` は latest run 基準であり、any run 履歴検索や application-specific runs / reports endpoint は後続確認対象とする。

## 追記（2026-05-12）SymbolDetail archived application list

- `SymbolDetail` の saved application filter で `status`、`active`、`archived`、`all` が表示されることを確認する。
- default は `active` で、`GET /api/symbols/:symbolId/strategy-applications?status=active...` を使って取得する。
- `archived` / `all` へ切り替えた場合も、`report_presence` / `report_source` / `run_type` / `run_status` と組み合わせて server-side query で再取得する。
- summary は status 対象を含めて表示され、archived application row でも application summary、latest run、latest report、CSV / internal reports が崩れないことを確認する。
- active row は `アーカイブ`、archived row は `復元` が表示され、既存 archive / restore endpoint を使う。
- API shape、backend、DB、CSV import、internal backtest、report conversion、保存処理、新規 Playwright spec、Visual regression は確認対象外とする。

## 追記（2026-05-12）application-specific runs endpoint 設計

- application-specific runs endpoint の設計は docs/54 を正本とする。
- 第一候補は `GET /api/symbol-strategy-applications/:applicationId/runs` とし、application 配下の any run 履歴検索を扱う。
- 既存 `GET /api/symbols/:symbolId/strategy-applications` の `run_type` / `run_status` は latest run 基準として維持する。
- CSV import run、internal backtest run、report conversion 後の Backtest link の返し方は docs/54 を参照する。
- application-specific reports endpoint は、report 一覧 / 比較 UX が主語になった段階の後続候補として扱う。
- 今回は docs-only 整理であり、runtime 確認、API shape 変更、backend、frontend、DB、Prisma schema、test は確認対象外とする。

## 追記（2026-05-12）application-specific reports endpoint 設計

- application-specific reports endpoint の設計は docs/55 を正本とする。
- 第一候補は `GET /api/symbol-strategy-applications/:applicationId/reports` とし、application 配下の Backtest report 一覧 / 比較 UX を扱う。
- runs endpoint は実行履歴、reports endpoint は検証 report 一覧 / 比較 UX として確認観点を分ける。
- CSV import report は `BacktestImport.parsedSummaryJson`、internal backtest report は `Backtest.strategySnapshotJson.result_summary` を metrics source として扱う。
- internal backtest report は importless report として確認し、BacktestImport がないことをエラー扱いしない。
- `BacktestDetail` の `related_reports` / metrics 横並び比較は個別 report 起点、reports endpoint は application 起点の一覧として扱う。
- 今回は docs-only 整理であり、runtime 確認、API shape 変更、backend、frontend、DB、Prisma schema、test は確認対象外とする。

## 追記（2026-05-12）Symbol Strategy Application strategy / version filter 確認

- `SymbolDetail` の saved application filter で `strategy_id` / `strategy_version_id` text input が表示されることを確認する。
- 入力値は trim され、空の場合は query に含めない。
- backend API は `strategy_id` を application の `strategyRuleId`、`strategy_version_id` を `strategyRuleVersionId` として扱う。
- `status`、`report_presence`、`report_source`、`run_type`、`run_status` と同時指定した場合も AND 条件で再取得されることを確認する。
- 未指定時は従来どおり active application list を返し、latest run、latest backtest report、CSV / internal reports、pagination meta が維持されることを確認する。
- DB migration、Prisma schema 変更、any run 履歴検索、application-specific runs / reports endpoint は確認対象外とする。

## 追記（2026-05-12）Application Detail / History foundation 確認

- `SymbolDetail` の saved application row で `run履歴を見る` / `report履歴を見る` が表示されることを確認する。
- `run履歴を見る` から `/symbol-strategy-applications/:applicationId#runs` へ遷移できることを確認する。
- `report履歴を見る` から `/symbol-strategy-applications/:applicationId#reports` へ遷移できることを確認する。
- application detail で application summary、run履歴、report履歴が read-only に表示されることを確認する。
- run履歴では CSV import run の linked backtest / linked import、internal backtest run の linked execution / report conversion 後の linked backtest を確認する。
- report履歴では CSV import report と internal backtest report が source / origin / metrics summary 付きで確認できることを確認する。
- internal backtest report は importless report として扱い、BacktestImport がないことをエラー扱いしない。
- 既存 `SymbolDetail` saved application filter の `run_type` / `run_status` は latest run 基準のままで、application detail の run履歴検索とは意味を混ぜない。
- DB migration、Prisma schema 変更、comparison entity、metrics normalization、artifact diff、Visual regression は確認対象外とする。

## 追記（2026-05-12）Application Detail runs usability 確認

- Application Detail の `run履歴` section に `run type` filter が表示されることを確認する。
- `run type` は `すべて` / `CSV` / `internal` を選択できることを確認する。
- Application Detail の `run履歴` section に `run status` filter が表示されることを確認する。
- `run status` は `すべて` / `queued` / `running` / `succeeded` / `failed` / `canceled` を選択できることを確認する。
- filter 変更時は `GET /api/symbol-strategy-applications/:applicationId/runs` に `run_type` / `run_status` query が付与され、page は 1 に戻ることを確認する。
- runs pagination は `前へ` / `次へ` の最小 UI とし、`has_prev` / `has_next` に従って有効化されることを確認する。
- reports section、SymbolDetail、BacktestDetail、CSV import、internal backtest、report conversion は今回の確認対象外とする。

## 追記（2026-05-12）Application Detail reports usability 確認

- Application Detail の `report履歴` section に `execution source` filter が表示されることを確認する。
- `execution source` は `すべて` / `TradingView` / `internal` を選択できることを確認する。
- Application Detail の `report履歴` section に `report status` filter が表示されることを確認する。
- `report status` は `すべて` / `imported` / `completed` / `import_failed` / `failed` を選択できることを確認する。
- filter 変更時は `GET /api/symbol-strategy-applications/:applicationId/reports` に `execution_source` / `status` query が付与され、page は 1 に戻ることを確認する。
- reports pagination は `前へ` / `次へ` の最小 UI とし、`has_prev` / `has_next` に従って有効化されることを確認する。
- metrics の `-` について、CSV parsed summary または internal result_summary から取得できない項目があることを reports section 内で確認できることを確認する。
- runs section、SymbolDetail、BacktestDetail、CSV import、internal backtest、report conversion は今回の確認対象外とする。

## 追記（2026-05-12）Application Detail / History usability pass 完了確認

- browser smoke で `SymbolDetail` から `run履歴を見る` または `report履歴を見る` が見えることを確認する。
- browser smoke で `/symbol-strategy-applications/:applicationId` へ遷移できることを確認する。
- Application Detail で `application summary`、`run履歴`、`report履歴` が表示されることを確認する。
- Application Detail で代表 filter label として `run type` と `execution source` が表示されることを確認する。
- smoke では CSV import、internal backtest、report conversion など実行系操作を行わない。
- 段階1 / 段階2の確認観点である runs filter / pagination、reports filter / pagination、metrics 欠損値説明は完了扱いにする。

## 追記（2026-05-12）Application Detail / History 完了確認

- Application Detail / History foundation + usability pass は完了扱いにする。
- `SymbolDetail` では application 概要、latest run、latest report、CSV / internal latest pair、Application Detail 入口を確認する。
- Application Detail では run履歴、report履歴、filter / pagination、metrics 欠損値説明を read-only に確認する。
- browser smoke は `SymbolDetail` から Application Detail へ遷移し、application summary、run履歴、report履歴、代表 filter label を確認する。
- 次フェーズ候補は未対応画面の Tailwind / 状態表示整理、BacktestDetail / report comparison UX、application-specific runs / reports further UX、Visual regression 検討とする。

## 追記（2026-05-12）StrategyVersionDetail cleanup 確認

- StrategyVersionDetail で loading / error / empty が共通 state component 表示になることを確認する。
- 基本情報、Pine 状態、lineage、forward validation note、warnings / assumptions、generated pine が section / key-value / status 表示として読めることを確認する。
- Pine generation、regenerate、validation、TradingView backtest、internal backtest の既存導線と文言が維持されていることを確認する。

## 追記（2026-05-12）StrategyLab + BacktestComparisonDetail cleanup 確認

- StrategyLab の入力、生成結果、CSV取込、warnings / assumptions、generated pine が section / state / key-value / status 表示として読めることを確認する。
- StrategyLab の生成・保存・検証と CSV 取込の既存導線、文言、API 呼び出しが維持されていることを確認する。
- BacktestComparisonDetail の loading / error / empty、比較対象、主要差分、tradeoff 要約、AI比較総評が共通 component 表示で確認できることを確認する。

## 追記（2026-05-12）Home / SideRail light cleanup 確認

- Home の loading / error / empty、マーケット概況、AIデイリーサマリー、最新アラート、注目イベントが既存 UI component 表示で確認できることを確認する。
- SideRail の watchlist / positions empty / loading / error と操作ボタン表示が軽く整理されていることを確認する。
- Home / SideRail の `/api/home` 共有、watchlist / positions の refresh、CRUD 導線と文言が維持されていることを確認する。

## 追記（2026-05-12）UI cleanup second pass 完了確認

- StrategyVersionDetail、StrategyLab、BacktestComparisonDetail、Home、SideRail の section / state / status / key-value / selected button 表示整理は完了扱いにする。
- 確認では既存導線、API 呼び出し、refresh / CRUD、生成・保存・検証、Backtest comparison 仕様が維持されていることを優先する。
- form input / textarea / select / modal shell / table / data list / JSON viewer の本格共通化は今回は行わない。
- Visual regression は当時は導入せず、browser smoke と unit test を優先した。Phase 4 pilot では `pnpm test:e2e:visual` を optional とし、対象を `ApplicationDetail` の `application summary` stable container 1 箇所に限定する。

## 追記（2026-05-12）UI foundation third pass PR1 確認

- StrategyLab の戦略タイトル、自然言語ルール、市場、時間足が既存文言と導線を保ったまま表示されることを確認する。
- StrategyVersionDetail の自然言語ルール編集、Pine 修正再生成入力、次の検証ノートが既存導線を保ったまま表示されることを確認する。
- StrategyLab の生成・保存・検証、CSV取込、Pine generation / regenerate / validation の仕様変更がないことを優先して確認する。
- form framework、modal shell、table / data list、JSON viewer、Visual regression は今回の確認対象外とする。

## 追記（2026-05-12）UI foundation third pass PR2 確認

- SideRail の監視銘柄 / 保有銘柄 CRUD modal が既存タイトル、本文、キャンセル、保存 / 更新 / 削除 action を維持して表示されることを確認する。
- watchlist / positions の open / close state、submit / delete handler、refresh 範囲、mutate、API 呼び出しが変更されていないことを優先して確認する。
- 既存 `Modal` の role / aria / close button 表示を壊していないことを確認する。
- keyboard trap、本格 accessibility helper、table / data list、JSON viewer、Visual regression は今回の確認対象外とする。

## 追記（2026-05-12）UI foundation third pass PR3 確認

- BacktestDetail の internal backtest artifact pointer で `raw artifact JSON` が表示され、JSON の key / value が従来通り確認できることを確認する。
- ApplicationDetail の run / report list、filters、pagination、metrics 欠損説明が従来通り表示されることを確認する。
- BacktestComparisonDetail の比較対象、主要差分、tradeoff 要約、AI比較総評が従来通り表示されることを確認する。
- RecordList / SimpleTable / DataTable、JSON diff、artifact diff、Visual regression は今回の確認対象外とする。

## 追記（2026-05-12）UI foundation third pass 完了確認

- UI foundation third pass は FormFields、ModalShell、JsonBlock の限定導入までを完了扱いにする。
- StrategyLab / StrategyVersionDetail、SideRail、BacktestDetail の既存導線と API 呼び出しが維持されていることを確認観点にする。
- DataList / SimpleTable / DataTable、JSON diff、artifact diff、Visual regression は後続判断として残す。

## 30. Report comparison UX phase 2 PR1 確認

1. `BacktestDetail` の Symbol Strategy Application section で、current report と related report の metrics 横並び比較補助を確認する。
2. CSV import report は BacktestImport parsed summary 由来、internal backtest report は strategySnapshotJson.result_summary 由来である説明を確認する。
3. `-` は取得元に該当 metric がない意味として扱い、比較補助が read-only のまま実行・変換・AI自動比較を行わないことを確認する。
4. ApplicationDetail は application 単位の run / report 履歴探索、BacktestComparisonDetail は保存済み pairwise comparison / 本格比較候補として責務が分かれていることを確認する。

## 31. Report comparison UX phase 2 PR2 確認

1. `ApplicationDetail` の report履歴 row で、BacktestDetail から同一 application の関連 report と metrics を確認できる説明を確認する。
2. 既存 BacktestDetail link が comparison helper 入口として分かる label になっており、report conversion / CSV import / internal backtest 実行が追加されていないことを確認する。
3. `BacktestComparisonDetail` で保存済み pairwise comparison と本格比較画面候補の関係を示す短い説明を確認する。
4. API shape、backend、DB migration、Prisma schema、新規 comparison entity が変わっていないことを確認する。

## 32. Report comparison UX phase 2 完了確認

1. `BacktestDetail` で同一 application の current report / related report metrics 横並び比較補助を確認する。
2. CSV import report metrics は `BacktestImport` parsed summary、internal backtest report metrics は `strategySnapshotJson.result_summary` 由来である説明を確認する。
3. `-` は取得元に該当 metric がない意味であり、エラーや比較結果の未生成ではないことを確認する。
4. `ApplicationDetail` の report履歴 row から BacktestDetail comparison helper へ進む説明 / link label を確認する。
5. `BacktestComparisonDetail` は保存済み pairwise comparison の再訪画面であり、本格比較画面化は後続候補であることを確認する。
6. 確認では API / backend / frontend / DB / Prisma schema / test / 実行系操作を変更しない。

## 33. Visual regression pilot 確認

1. Visual regression / screenshot comparison は optional pilot として扱う。
2. `pnpm test:e2e:visual` で `ApplicationDetail` の `application summary` stable container だけを確認する。
3. `pnpm test:e2e:browser` に visual spec が混ざっていないこと、CI required check に追加していないことを確認する。
4. dynamic timestamp / locale 表示は mask し、raw JSON、long page、外部 / AI 由来表示、TradingView widget は対象外にする。
5. baseline 更新が必要な場合は `pnpm --filter frontend test:e2e:visual -- --update-snapshots` を使い、生成画像が最小枚数であることを確認する。

## 追記（2026-05-13）AI summary / artifact 確認メモ

- BacktestDetail で CSV import report を確認する場合、AI summary input は TradingView CSV の `BacktestImport` と parsed summary を中心に見る。
- BacktestDetail で internal backtest report を確認する場合、AI summary input は `strategySnapshotJson.result_summary`、`artifact_pointer`、`internal_backtest_execution_id` を中心に見る。
- ApplicationDetail は report history の入口であり、AI summary 本文や artifact pointer の詳細は BacktestDetail で確認する。
- BacktestComparisonDetail は保存済み pairwise comparison の再訪画面であり、AI summary 同士の比較や artifact diff は現時点の確認対象外とする。

## 34. AI summary / artifact operations PR2 確認

1. BacktestDetail の `AI 総評` section で、CSV import / TradingView report と internal backtest report の AI summary input 差が短く説明されていることを確認する。
2. internal backtest report では `BacktestImport` が作成されないこと、`strategySnapshotJson.result_summary` / `artifact_pointer` / `internal_backtest_execution_id` が主な入力文脈であることを確認する。
3. artifact pointer / raw artifact JSON は metadata 確認であり、file read / download / diff ではない説明を確認する。
4. BacktestDetail では artifact path 系 metadata が非表示または sanitized 表示になり、raw artifact JSON でも path 系値がそのまま出ないことを確認する。
5. ApplicationDetail の report履歴は入口であり、AI summary / artifact 詳細は BacktestDetail で確認する説明を確認する。report row に artifact path は表示しない。
6. BacktestComparisonDetail は保存済み pairwise comparison の再訪画面であり、AI summary 同士の比較や artifact diff は後続判断である説明を確認する。
7. artifact file access は既存 internal_backtests engine_actual trades / equity JSON read endpoint に限定し、BacktestDetail に download 導線を追加しないことを確認する。
8. artifact metadata / retention / file access boundary の詳細は `docs/運用ドキュメント/09_artifact_metadata_retention運用.md` を参照する。
9. 確認では DB / Prisma schema / retention job / download / artifact diff / AI summary 自動生成を変更しない。

## 35. AI summary / artifact operations phase completion 確認

1. docs/53 で AI summary / artifact operations phase が PR #309〜#310 の範囲で完了扱いになっていることを確認する。
2. CSV import report の AI summary input が `BacktestImport`、parsed summary、comparison diff、TradingView 文脈として説明されていることを確認する。
3. internal backtest report の AI summary input が `strategySnapshotJson.result_summary`、`artifact_pointer`、`internal_backtest_execution_id`、importless report 文脈として説明されていることを確認する。
4. BacktestDetail / ApplicationDetail / BacktestComparisonDetail の責務が分かれており、ApplicationDetail は入口、詳細は BacktestDetail、保存済み pairwise comparison は BacktestComparisonDetail として扱われていることを確認する。
5. AI summary 自動生成、AI summary 同士の比較、artifact file read / download、artifact diff / JSON diff、Visual regression 本導入が後続判断として残っていることを確認する。
6. 確認では API / backend / DB / Prisma schema / test を変更しない。

## 36. UI foundation completion pass PR1 確認

1. docs/53 で主要画面と既存 UI component の適用状態が棚卸しされていることを確認する。
2. Filter / pagination は `FilterGroup` / `PaginationControls` の薄い component 候補として整理され、`FilterBar` の大きな抽象化は見送られていることを確認する。
3. notice / helper text は `InlineNotice` の候補として整理され、state component と責務を分けていることを確認する。
4. DataTable、virtual scroll、column resize、form framework、Visual regression 本導入が見送り判断になっていることを確認する。
5. 確認では API / backend / DB / Prisma schema / test / 実装コードを変更しない。

## 37. UI foundation completion pass PR2 確認

1. `ApplicationDetail` の run履歴 filter で `run type` / `run status` の表示文言と選択肢が従来通りであることを確認する。
2. `ApplicationDetail` の report履歴 filter で `execution source` / `report status` の表示文言と選択肢が従来通りであることを確認する。
3. filter 変更時の query と page reset が従来通りであることを確認する。
4. runs / reports pagination の `page {page}`、`前へ`、`次へ`、disabled 条件、prev / next 挙動が従来通りであることを確認する。
5. `FilterGroup` は label と option button group、`PaginationControls` は page summary と prev / next のみを扱い、FilterBar、sort、page size、jump、DataTable を追加していないことを確認する。
6. `SymbolDetail` の saved application filter は今回変更していないことを確認する。
7. 確認では API / backend / DB / Prisma schema を変更しない。

## 追記（2026-05-13）BacktestDetail 高頻度 section cleanup 確認

- `BacktestDetail` で AI総評、internal backtest report、artifact pointer、inline comparison、metrics 横並び比較が従来文言と導線を維持して表示されることを確認する。
- AI総評生成ボタン、comparison save、保存済み比較リンク、artifact pointer metadata、import 履歴の挙動が変わっていないことを確認する。
- artifact file の実体読込、download、diff、AI summary 自動生成、API / backend / DB / Prisma schema 変更は行わない。

## 38. UI foundation completion pass 完了確認

1. `ApplicationDetail` の run履歴 / report履歴で、filter label、選択肢、page 表示、前へ / 次へが従来通りであることを確認する。
2. `BacktestDetail` の AI総評、internal backtest report、artifact pointer、inline comparison、metrics helper が既存導線と文言を維持して表示されることを確認する。
3. `InlineNotice` は helper / notice text の補助表示としてのみ使われ、loading / error / empty、toast、validation の代替になっていないことを確認する。
4. `SymbolDetail` filter は全面置換していないことを確認する。
5. 確認では API / backend / DB / Prisma schema / test / 実行系操作を変更しない。

## 39. AI summary 自動生成運用設計 確認

1. 自動生成の運用設計は docs/56 を正本として確認する。
2. 今回は BacktestDetail 初回表示、ApplicationDetail report履歴表示、batch / scheduled job を契機に enqueue しない方針であることを確認する。
3. CSV import report は `BacktestImport` / parsed summary、internal backtest report は `strategySnapshotJson.result_summary` / `artifact_pointer` / `internal_backtest_execution_id` を主 input とする差を確認する。
4. 既存 `AI総評を生成` button は維持し、自動生成済み・failed・stale summary の扱いは既存 `ai_jobs` / `ai_summaries` と `inputSnapshotHash` に寄せる方針を確認する。
5. 確認では自動生成実装、polling 本格化、API / backend / DB / Prisma schema 変更、CSV import / internal backtest / report conversion の仕様変更を行わない。

## 40. AI summary auto-generation phase 1 確認

1. route 別の運用確認手順は `docs/運用ドキュメント/08_AI_summary自動生成運用.md` を参照する。
2. phase 1 完了範囲は `docs/作業進捗管理/07_AI_summary自動生成phase1完了.md` を参照する。
3. CSV import report auto enqueue は direct CSV import route と application 起点 CSV import route の `parse_status=parsed` 直後を対象にすることを確認する。
4. internal backtest report conversion auto enqueue は、新規 internal_backtest Backtest report が作成された直後だけを対象にすることを確認する。
5. 既存 report を返す idempotent conversion、BacktestDetail 初回表示、ApplicationDetail report history 表示、batch / scheduled job 起点では enqueue しないことを確認する。
6. 同一 `inputSnapshotHash` の succeeded summary、queued / running job、failed job がある場合は自動 enqueue せず、failed job の自動 retry は行わないことを確認する。
7. 既存 manual generation endpoint / button、CSV import、internal backtest 実行、report conversion UI、DB schema は維持する。
8. AI summary 同士の比較、artifact diff、artifact download、polling 本格化は後続判断として残す。

## 41. AI summary comparison UX phase 2 docs-only 確認

1. Phase 2 の AI summary comparison は、既存 summary を read-only に並べる補助であり、provider 呼び出しや自動比較文生成を行わないことを確認する。
2. BacktestDetail が個別 report detail と、同一 application 内の current / related AI summary comparison helper を担当することを確認する。
3. ApplicationDetail は report history の入口であり、詳細比較や AI summary 本文確認は BacktestDetail へ送る説明になっていることを確認する。
4. BacktestComparisonDetail は保存済み pairwise comparison の再訪画面であり、本格 AI summary comparison / artifact diff は後続候補として扱うことを確認する。
5. CSV import report summary は `BacktestImport` / parsed summary / TradingView 文脈、internal backtest report summary は `strategySnapshotJson.result_summary` / `artifact_pointer` / execution ID 文脈を主 input とする差を確認する。
6. summary missing / failed / stale は read-only status / note と手動生成導線で扱い、provider 再生成、polling、live update を行わないことを確認する。
7. comparison entity、metrics normalization table、artifact diff、自動 AI 比較生成、API / backend / DB / Prisma schema / test は今回変更しない。

## 42. LLM strategy proposal 初回実装確認

1. StrategyLab に `ストラテジー候補の提案` section が表示されることを確認する。
2. `提案用ヒント（任意）` が Pine 生成用 natural language rule とは別欄として表示され、初期状態では空欄であることを確認する。空欄時は既存 Pine 生成用ルール文が `user_hint` として送られない。
3. `ストラテジーを提案` は deterministic stub provider から候補を取得し、Web search / deep research / DB 保存 / job 化を行わないことを確認する。
4. 候補は検証候補であり投資助言ではない説明が表示されることを確認する。
5. 候補の `この候補を使う` を選ぶと、StrategyLab の title と natural language rule に反映されることを確認する。proposal hint は自動上書きされない。
6. 候補選択だけでは Pine generation、保存、検証、backtest 実行へ自動連鎖しないことを確認する。
7. 既存の Pine generation、save、validation、CSV import の導線と API 呼び出しが維持されていることを確認する。

## 43. LLM strategy proposal provider quality trend 確認

1. StrategyLab の `最近の提案` section に provider quality trend の compact note が表示されることを確認する。
2. trend note が直近 run 数、success、selected、平均 latency、provider 別の失敗分類を read-only に示すことを確認する。
3. trend note が候補ランキングや投資判断ではなく、provider 運用品質の補助である説明になっていることを確認する。
4. `GET /api/strategy-lab/proposals/provider-quality-trend?limit=50` が `summary` / `by_provider` / `candidate_distribution` / `recent_failures` / `meta` を返すことを確認する。
5. response `meta` が `sanitized=true`、`raw_prompt_included=false`、`raw_response_included=false` であることを確認する。
6. response / UI に raw prompt、raw provider response、provider endpoint、model 実値、secret、local path、stack trace、user_hint 全文、candidate 自由文本文が出ないことを確認する。
7. trend の読み込み失敗時も proposal generation、candidate selection、manual Pine generation が無効化されないことを確認する。

## 44. LLM strategy proposal benchmark result recording 確認

1. `pnpm --filter backend strategy-proposal:benchmark -- --provider=stub --scenario=generic_default` が optional benchmark として動作することを確認する。
2. `--output=generic_default.json` を付けた場合だけ、gitignore 済み benchmark record directory 配下へ sanitized summary record が出力されることを確認する。
3. output は actual benchmark record として commit しない。
4. stdout / output に raw prompt、raw provider response、provider endpoint、model 実値、secret、local path、stack trace、user_hint 全文、candidate title / summary / suggested natural language spec が出ないことを確認する。
5. `local_llm` 実体依存 benchmark は manual optional のままで、required check に入れないことを確認する。

## 45. LLM strategy proposal local_llm browser smoke

1. local LLM process が起動していることを確認する。
2. local env で `STRATEGY_PROPOSAL_PROVIDER=local_llm` を設定し、proposal 専用の endpoint / model / timeout / max output を必要に応じて設定する。実値は docs、PR、screenshot、log に残さない。
3. backend / frontend dev process を再起動する。
4. StrategyLab を開き、`ストラテジーを提案` を実行する。
5. 成功時は candidate cards が表示され、provider note が `succeeded` になり、最近の提案と provider quality trend が壊れていないことを確認する。
6. 失敗時は `provider status` / `reason` / `latency` の sanitized 表示だけを確認し、raw prompt、raw provider response、endpoint、model 実値、local path、stack trace を残さない。
7. `reason=schema_invalid` の場合は、`docs/運用ドキュメント/07_トラブルシュート.md` と `docs/運用ドキュメント/11_Strategy_proposal品質評価運用.md` の切り分け手順を参照する。

## 46. Codex CLI manual JSON import smoke

1. StrategyLab の `ストラテジー候補の提案` section で `Codex CLIで生成した候補JSONを取り込む` が表示されることを確認する。
2. `提案用ヒント（任意）` に入力した内容がある場合だけ、Codex CLI 用 prompt request の `user_hint` に反映されることを確認する。
3. `Codex CLI用プロンプトを作成` を押し、schema 名、候補数、必須 field、投資助言ではなく検証候補である注意、日本語出力指示が prompt に含まれることを確認する。
4. `Codex CLI側でWeb検索を使う前提のpromptにする` を有効にして prompt を作成し、Web検索利用時の注意文が追加されることを確認する。北極星側で Web 検索が自動実行されないこと、import schema が変わらないことも確認する。
5. prompt はユーザーが手動で Codex CLI へ渡す。backend から Codex CLI が自動実行されないことを確認する。
6. `strategy_proposal_candidates` JSON を textarea に貼り付けるか、JSON file を選択して text として読み込む。
7. `JSONを取り込む` を押し、複数候補が candidate cards として表示されることを確認する。候補数は最大 10 件とする。
8. import 後、最近の提案と provider quality trend が再取得され、`codex_cli_manual` / `manual_import` の proposal run として確認できることを確認する。
9. `この候補を使う` は selection API を呼び、StrategyLab の title / natural language rule に反映するだけで、Pine generation / save / backtest / AI summary を自動実行しないことを確認する。
10. 短時間に import を繰り返した場合は rate guard により sanitized retry message が表示され、blocked import が proposal history に保存されないことを確認する。
11. malformed JSON、schema invalid、required field missing、candidate count invalid、`source_type=web` は sanitized error として表示され、raw Codex output、endpoint、model 実値、local path、stack trace は表示・保存されないことを確認する。

## 47. LLM strategy proposal history full management smoke

1. StrategyLab の proposal history section に provider / status / selected / search / pagination の controls が表示されることを確認する。
2. provider filter で `stub` / `local_llm` / `codex_cli_manual` を切り替え、対象 provider の run だけを探せることを確認する。
3. status filter で succeeded / failed を切り替え、failed run が sanitized status / reason だけで表示されることを確認する。
4. selected filter で selected / unselected を切り替え、選択済み候補を探せることを確認する。
5. search で run id / provider / input metadata に基づく絞り込みができ、履歴 list に user_hint 全文、candidate 自由文、raw output が表示されないことを確認する。candidate title / summary の自由文検索は後続確認対象とする。
6. pagination の前後移動後も detail 展開と `この候補を使う` が動作することを確認する。
7. history detail から候補を選択しても、title / natural language rule への反映だけで、Pine generation / save / backtest / AI summary が自動実行されないことを確認する。
8. soft archive 導入後は、active run に `アーカイブ`、archived run に `戻す` が表示されることを確認する。
9. `アーカイブ` 後、default active list から該当 run が消え、archived filter で確認できることを確認する。
10. archived run の detail を開けること、候補選択が title / natural language rule への反映だけで動作すること、自動 unarchive しないことを確認する。
11. `戻す` 後、active list に戻ることを確認する。
12. hard delete、retention job、export は今回の UI にないことを確認する。

## 48. Pine generation LLM-first smoke

1. StrategyLab または StrategyVersionDetail から Pine generation を手動実行する。
2. Pine generation が LLM-first の provider path として扱われ、deterministic generator は baseline / fallback / test 用である説明と矛盾しないことを確認する。
3. `POST /api/strategy-versions/:versionId/pine/generation-jobs` または `/pine/regeneration-jobs` で `job.id` が返り、`GET /api/strategy-versions/:versionId/pine/generation-jobs/:jobId` で queued / running / succeeded / failed と backend stage が更新されることを確認する。
4. progress indicator が generator -> reviewer -> repair -> validation / persistence の stage を sanitized に表示することを確認する。SSE、WebSocket、streaming ではない。
5. 成功時は generated Pine、warnings、assumptions が表示されることを確認する。
6. generated Pine で `strategy.entry` / `strategy.exit` が position guard 付きになっていることを確認する。long-only / no-pyramiding 相当の entry は `strategy.position_size == 0` などの flat guard 配下にあることを確認する。
7. ATR stop / take profit など entry 時点で固定すべき値がある場合、position が open になった直後の `strategy.position_size > 0 and strategy.position_size[1] == 0` pattern で `entryAtr` などの `var` 変数に保存されることを確認する。
8. entry-time state の reset が単純な `strategy.position_size == 0` ではなく、open から flat への遷移を示す `strategy.position_size == 0 and strategy.position_size[1] > 0` pattern になっていることを確認する。
9. stop price / limit price が position open 中、かつ entry-time state が利用可能な場合だけ計算されていることを確認する。
10. stop loss が signal bar の `close` ではなく、actual entry price として position open 後の `strategy.position_avg_price` を基準にしていることを確認する。
11. ユーザーが明示していない `entry_price := close` が entry price 代替として使われていないことを確認する。
12. percentage stop の場合は position open 中に `strategy.position_avg_price` を基準に計算され、`entryPrice := close` や entry block 内の `entryPrice := strategy.position_avg_price` が使われていないことを確認する。`stopLossPrice` は top-level ではなく `strategy.position_size > 0` guard 配下で計算されていることを確認する。
13. ATR を要求していない percentage stop strategy では `entryAtr` や `ta.atr` が混入していないことを確認する。
14. RSI / oscillator strategy では threshold direction が維持されていることを確認する。例: 「60 を上回る」は `rsi > 60` または wording に応じた crossover であり、明示がない限り crossunder ではない。
15. setup -> trigger 型の条件は state variable でつながり、同一 bar では同時成立しない条件の単純 `and` になっていないことを確認する。`setupActive` を使う entry block では、`strategy.entry` 後に `setupActive := false` があることを確認する。
16. 「below / 下回った場合」は状態条件として扱われ、crossunder は cross wording が明示された場合だけ使われていることを確認する。
17. `overlay=true` の価格 chart strategy では、ユーザーが明示していない oscillator plot が追加されていないことを確認する。
18. ATR stop が `strategy.exit(..., stop=...)` で表現されていることを確認する。
19. entry-time ATR は position open transition capture を優先し、ATR を使わない戦略では `entryAtr` / `ta.atr` が出ていないことを確認する。
20. ユーザーが manual bar-based stop を明示していない限り、`low <= stopLossPrice` と `strategy.close()` の組み合わせで stop loss を代替していないことを確認する。
21. `strategy.close()` は stop loss order の代替ではなく、rule-based exit に使われていることを確認する。
22. entry block 内で `strategy.position_avg_price` から stop / limit を計算していないことを確認する。
23. `color.color.*` や `plot.style_dashed` などの compile typo / unsupported plot style がないことを確認する。
24. `ta.crossabove` / `ta.crossbelow` が残らず、`ta.crossover` / `ta.crossunder` へ補正または reviewer issue 化されることを確認する。
25. stop loss plot がある場合は、position open 中だけ値を返し、それ以外は `na` にするなど position / `na` guard があることを確認する。
26. `strategy.exit(..., stop=stopLossPrice)` は `not na(stopLossPrice)` guard 配下にあり、plot で参照する `stopLossPrice` は outer scope で typed declaration されていることを確認する。
27. unused variable / unused state が残っていないことを確認する。
28. generated_script の comment は短い section comment だけで、実装理由は warnings / assumptions に出ていることを確認する。
29. ユーザーが明示していない volume plot が追加されていないことを確認する。volume condition が signal 条件に使われるだけなら許容する。
30. 表現できない制約がある場合、warnings / assumptions に日本語で限界が表示されることを確認する。
31. Pine generation が generator -> reviewer -> repair pipeline として扱われ、deterministic reviewer issue や AI reviewer boundary の issue が structured / sanitized に扱われることを確認する。
32. setup state variable 名が `setupActive` 以外でも premature reset が検出されること、Donchian breakout / exit が prior channel を使うこと、entry-time ATR stop が persisted `entryAtr` を使うことを確認する。AI reviewer provider failure 単独では repair / failure にならないことも確認する。
33. invalid output または priority > 0 の blocking reviewer issue があった場合は `repair_attempts` と `invalid_reason_codes` が sanitized metadata として確認できることを確認する。warning-only review や priority 0 の readability / plotting preference / below-vs-crossunder nuance / narrative comment では repair が起動しないことを確認する。
34. TradingView compile は自動実行されないことを確認する。compile error を反映する場合は、TradingView で確認した内容を Pine 修正再生成の `compile_error_text` / `validation_note` / `revision_request` に手動入力する。
35. TradingView への自動保存、Pine generation / regeneration 後の Strategy 保存、backtest、AI summary 自動起動がないことを確認する。
36. UI / API response / screenshot / docs に raw prompt、raw provider response、raw reviewer response、endpoint、model 実値、secret、local path、stack trace が出ないことを確認する。
37. real `local_llm` / OpenAI / TradingView 実体依存確認は manual smoke に限定し、required check の前提にしない。required check は fake / deterministic tests を使う。repair request がある場合は repair 専用 prompt になり、selected issue 最大 3 件だけを直す境界を確認する。
