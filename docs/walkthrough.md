# 北極星 walkthrough（Rule Lab / Backtest 一巡）

更新日: 2026-04-26

本資料は、Rule Lab から Pine 生成・TradingView 一次検証・CSV 取込・Backtest AI 総評・比較までの一巡導線を、現行MVP実装に合わせて確認するための手順です。  
正本 docs は `docs/0` から参照し、本資料は実施手順のクイックチェック用途として扱います。

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
3. `market` と `timeframe` が version に保存されていることを確認する。

## 3. 自然言語 -> Pine 生成

1. `StrategyVersionDetail` で `Pine を生成` を実行する。
2. `POST /api/strategy-versions/:versionId/pine/generate` 成功を確認する。
3. `GET /api/strategy-versions/:versionId/pine` で `status=available` と `generated_script` を確認する。
4. Pine 表示付近の `コピー` ボタンで、TradingView 貼り付け用に全文コピーできることを確認する。

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

## 9. Backtest AI 総評生成

1. `BacktestDetail` から AI 総評生成を実行する。
2. `POST /api/backtests/:backtestId/summary/generate` が成功し、`ai_jobs` が `queued -> running -> succeeded|failed` で遷移することを確認する。
3. `GET /api/backtests/:backtestId` の `ai_review` を確認する。
   - `status=available|unavailable`
   - `title`
   - `body_markdown`

## 10. inline comparison

1. 同一 backtest 内で parsed import が2件以上ある状態にする。
2. `BacktestDetail` の inline 比較で差分が表示されることを確認する。

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

1. Home で `監視銘柄を管理` を押し `/watchlist` へ遷移する。
2. 監視銘柄を追加する（`symbol_code` 必須、priority/memo は任意）。
3. 一覧の銘柄リンクから SymbolDetail へ遷移できることを確認する。
4. Home に戻り、監視銘柄ブロックへ反映されることを確認する。
5. Home で `保有銘柄を管理` を押し `/positions` へ遷移する。
6. 保有銘柄を追加または更新する（`symbol_code` `quantity` `average_cost`）。
7. 一覧の銘柄リンクから SymbolDetail へ遷移できることを確認する。
8. Home に戻り、保有銘柄ブロックへ反映されることを確認する。

補足:
- watchlist/positions API は default watchlist/default portfolio が無い場合に自動作成する。
- symbol_code が未登録なら Symbol を最小作成して処理する。
- positions は transactions 正本のため、更新・削除は manual transaction 経由で read model を再構築する。

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
- PR 本文には日本語ファイル名や `G:\Projects\...` のようなローカル Windows path を含めない。
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
