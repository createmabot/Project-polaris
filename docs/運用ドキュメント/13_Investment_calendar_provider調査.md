# Investment calendar provider 調査

## 1. 目的

PR #440 で投資カレンダーの DB / API / UI / manual refresh / provider boundary は実装済みである。次に real public provider を接続する前に、source ごとの対象 event、利用条件、取得形式、失敗時挙動、優先順位を整理する。

この文書は docs-only の source evaluation であり、provider 実装、API key 追加、scheduled job、crawler 常駐、notification / reminder、external calendar sync は含めない。

## 2. 共通方針

- 外部取得はユーザー操作の manual refresh 起点に限定する。
- required test は stub / fake / fixture を使い、real external provider / real web access には依存しない。
- raw external response、raw HTML、raw JSON、API key、endpoint 実値、secret、token、credential、local path、stack trace は DB / API response / UI / docs / PR に出さない。
- provider failure は Home / SymbolDetail 全体を壊さず、calendar section の warning と sanitized API error に閉じる。
- source ごとに `sourceName` / `sourceLabel` / `sourceType=public_provider` を付け、raw payload は保存しない。
- provider URL は env opt-in とし、docs には公開 docs / source page への参照だけを置く。
- 採用優先は無料 API、公的機関 / 公式 source、manual refresh と相性がよいもの、fixture test で固定できるものとする。
- 課金 API、有料契約前提 API、利用条件が不明な scraping、各社 IR page の広範囲 scraping、定期 crawler は採用しない。
- API で取得できる範囲は API を優先し、API で取得できない重要 event だけ公式 site scraping を限定的に検討する。
- 一般 site scraping / 各社 IR scraping は原則避ける。

provider 方針分類:

- `free_api_candidate`: 無料枠または無料 plan で取得できる可能性があり、manual refresh / fixture test と相性がよい。
- `official_scraping_candidate`: 無料 API が見つからないが、公的機関 / 取引所 / 中央銀行の公式 page から限定取得を検討できる。
- `seed_or_curated_only`: API / scraping の安定性や利用条件が弱く、初回は seed / curated fixture に留める。
- `paid_api_rejected`: 課金 API / 有料契約前提のため採用しない。
- `not_recommended`: 利用条件、coverage、品質、費用、実装 risk の観点から現時点では推奨しない。

## 3. Source evaluation

### J-Quants API

- provider 方針分類: `free_api_candidate` / `needs_plan_check`。
- 対象 event: 決算発表予定、配当権利落ち、配当支払予定、休場日、上場会社基本情報。
- 対象 market: 日本株。
- 日本株対応: 高い。JPX の J-Quants 説明では、配当、決算発表予定、上場会社情報、取引カレンダーが dataset として示されている。
- API 形式: REST API。
- 認証: J-Quants account / token。
- 無料枠: 無料 plan があり、公開情報上は決算発表予定日、取引カレンダー、配当金情報などが無料 plan 対象に含まれる。ただし提供期間、遅延、rate limit、利用条件は実装直前に再確認する。
- 商用 / 個人利用条件: 個人向け service として案内されているが、再配布・商用条件は契約 / plan 確認が必要。
- レート制限: free plan の上限確認が必要。manual refresh なら watchlist / positions の小規模利用と相性がよい。
- 取得できる日付範囲: dataset / plan 依存。
- freshness: JPX 系 source で信頼性は高いが、event type ごとの更新 timing は実装前に確認する。
- source reliability: 高。
- 利用規約上の懸念: API credential、free plan 条件、redistribution 条件。
- 実装難易度: 中。
- 北極星への採用候補: P2 の日本株 symbol-level provider 第一候補。
- 備考: 無料 plan の範囲で決算予定 / 配当予定 / 休場日を同じ provider family に寄せられる場合は優先する。無料枠で不足する event は paid plan へ進まず後続判断にする。
- 参照: [J-Quants API | Japan Exchange Group](https://www.jpx.co.jp/english/markets/other-data-services/j-quants-api/index.html)、[J-Quants Trading Calendar](https://jpx.gitbook.io/j-quants-en/api-reference/trading_calendar/holiday_division)

### TDnet API

- provider 方針分類: `paid_api_rejected`。
- 対象 event: 適時開示、決算短信、業績予想修正、配当予想、自己株式取得、その他会社 event。
- 対象 market: 日本株。
- 日本株対応: 高い。
- API 形式: JPX Market Innovation & Research の有料 API。
- 認証: 契約 / service credential。
- 無料枠: なし。基本料と取得件数に応じた費用がある。
- 商用 / 個人利用条件: 有料情報 service。再配布可能性はあるが契約条件に従う。
- レート制限: 契約仕様確認が必要。
- 取得できる日付範囲: TDnet API 説明では過去 5 年分の取得が示されている。
- freshness: 高。適時開示の直接配信 source。
- source reliability: 高。
- 利用規約上の懸念: 費用が重く、個人利用の初回実装には過剰。
- 実装難易度: 高。
- 北極星への採用候補: 採用しない。課金 API / 有料契約前提 API は今回方針から外す。
- 備考: 会社 event の網羅性は高いが、今回の無料 API 優先 / コスト非増加方針に合わない。
- 参照: [TDnet API Service | Japan Exchange Group](https://www.jpx.co.jp/english/markets/paid-info-listing/tdnet/02.html)

### EDINET / EDINET DB

- provider 方針分類: official EDINET API は `free_api_candidate` / `needs_terms_check`、third-party EDINET DB は free 範囲確認までは `not_recommended`。
- 対象 event: 有価証券報告書、四半期報告書、訂正報告書など statutory filing。
- 対象 market: 日本企業。
- 日本株対応: 中。上場企業の statutory disclosure には強いが、投資カレンダーの「予定」より「提出済み document」に寄る。
- API 形式: FSA EDINET official API / third-party EDINET DB REST API。
- 認証: official API は仕様確認が必要。EDINET DB は API key あり。
- 無料枠: EDINET DB は free / paid tier がある。official API は利用条件確認が必要。
- 商用 / 個人利用条件: source ごとに確認が必要。
- レート制限: EDINET DB は plan 別 daily limit が示されている。
- 取得できる日付範囲: document / plan 依存。
- freshness: 提出後 document 確認向け。
- source reliability: official / semi-official source として高いが、予定 event source としては弱い。
- 利用規約上の懸念: third-party DB の再利用条件、official API の仕様変更。
- 実装難易度: 中。
- 北極星への採用候補: P3 の historical filing enrichment。P1/P2 の calendar provider では優先しない。
- 備考: 「決算発表予定」ではなく「決算関連 document が提出された」event として扱うなら有効。
- 参照: [EDINET API | e-Gov API Catalog](https://api-catalog.e-gov.go.jp/info/ja/apicatalog/view/33)、[EDINET DB API docs](https://edinetdb.jp/docs/api)

### JPX market holiday / trading calendar

- provider 方針分類: J-Quants 経由は `free_api_candidate`、公式 page 取得は `official_scraping_candidate`。
- 対象 event: 日本市場休場日、営業日、半日立会日。
- 対象 market: 日本株。
- 日本株対応: 高い。
- API 形式: JPX website page / J-Quants trading calendar。
- 認証: JPX website は不要。J-Quants は credential。
- 無料枠: JPX website は公開 page。J-Quants は plan 依存。
- 商用 / 個人利用条件: 公開 page の利用条件確認が必要。定期 crawler ではなく manual refresh / small cache に限定する。
- レート制限: 明示 API でない場合は過剰アクセス禁止。
- 取得できる日付範囲: 公開 calendar の掲載範囲 / J-Quants dataset に依存。
- freshness: 高。
- source reliability: 高。
- 利用規約上の懸念: API が使える場合は J-Quants を優先する。公式 page scraping は無料 API が不足する場合だけ限定的に検討する。
- 実装難易度: 低から中。
- 北極星への採用候補: P1 の market holiday provider 候補。
- 備考: 休場日は変化頻度が低いため、manual refresh と cache で十分。
- 参照: [JPX Market Holidays](https://www.jpx.co.jp/english/corporate/about-jpx/calendar/index.html)

### Alpha Vantage

- provider 方針分類: `free_api_candidate`。
- 対象 event: US earnings calendar、IPO calendar、CPI、retail sales、unemployment など economic indicators。
- 対象 market: US / global macro。日本株 symbol-level は弱い。
- 日本株対応: 低。
- API 形式: REST API。calendar は CSV 形式の endpoint がある。
- 認証: API key。
- 無料枠: free key あり。rate limit は plan 依存。
- 商用 / 個人利用条件: plan / terms 確認が必要。
- レート制限: free plan は低めの想定。manual refresh と cache が必要。
- 取得できる日付範囲: API function / horizon 依存。
- freshness: market-level event / US calendar には実用的。
- source reliability: 中。
- 利用規約上の懸念: free tier 制限、CSV parsing、US 中心。
- 実装難易度: 低。
- 北極星への採用候補: P1 の free API 候補。無料枠の rate limit と対象 event が実用に足りる範囲だけ採用する。
- 備考: Home の market-level event を小さく始めるには扱いやすい。
- 参照: [Alpha Vantage API Documentation](https://www.alphavantage.co/documentation/)

### FRED

- provider 方針分類: `free_api_candidate`。
- 対象 event: CPI、GDP、unemployment、nonfarm payrolls などの data series / release metadata。
- 対象 market: US macro。
- 日本株対応: なし。
- API 形式: REST API。
- 認証: API key。
- 無料枠: free API key。
- 商用 / 個人利用条件: FRED terms / attribution 確認が必要。
- レート制限: 公式 docs 確認が必要。
- 取得できる日付範囲: historical time series に強い。future release calendar は release metadata と組み合わせる必要がある。
- freshness: official economic data source として高い。
- source reliability: 高。
- 利用規約上の懸念: future calendar 取得の実装方法を確認する必要がある。
- 実装難易度: 中。
- 北極星への採用候補: P1 の free API 候補。future calendar として使える release metadata の範囲確認が必要。
- 備考: 「予定」だけでなく、発表後の actual 値確認にも向く。
- 参照: [FRED API documentation](https://fred.stlouisfed.org/docs/api/fred/)

### Trading Economics

- provider 方針分類: `paid_api_rejected`。
- 対象 event: economic calendar、central bank、各国 macro event。
- 対象 market: global macro。
- 日本株対応: symbol-level は対象外。
- API 形式: REST API / streaming / iCalendar。
- 認証: API credential。
- 無料枠: trial / plan 確認が必要。
- 商用 / 個人利用条件: plan 依存。
- レート制限: plan 依存。
- 取得できる日付範囲: docs では多国 economic calendar を提供。
- freshness: 高。
- source reliability: 中から高。
- 利用規約上の懸念: 有料 plan 前提になる可能性。
- 実装難易度: 中。
- 北極星への採用候補: 採用しない。trial / paid plan 前提の provider は方針から外す。
- 備考: Home の market-level event を広く実用化するには直接的だが、無料 API 優先 / 課金 API 不採用方針に合わない。
- 参照: [Trading Economics API Documentation](https://docs.tradingeconomics.com/)

### Financial Modeling Prep

- provider 方針分類: `free_api_candidate` / `needs_free_endpoint_check`。
- 対象 event: earnings calendar、economic calendar、IPO calendar、exchange holidays。
- 対象 market: US / global equities / macro。
- 日本株対応: provider coverage 確認が必要。
- API 形式: REST API。
- 認証: API key。
- 無料枠: free plan あり。
- 商用 / 個人利用条件: plan 依存。
- レート制限: plan 依存。
- 取得できる日付範囲: endpoint / plan 依存。
- freshness: docs では economic calendar / earnings calendar の update cycle が示されている。
- source reliability: 中。
- 利用規約上の懸念: free plan の coverage / limit / redistribution。
- 実装難易度: 低から中。
- 北極星への採用候補: 無料枠で対象 endpoint が使える場合だけ P1 の代替候補。free endpoint が不足する場合は採用しない。
- 備考: economic calendar と holidays を 1 provider に寄せやすいが、free plan coverage を実装直前に確認する。
- 参照: [FMP Developer Docs](https://site.financialmodelingprep.com/developer/docs/)、[FMP Cycle Times](https://site.financialmodelingprep.com/developer/docs/cycle-times)

### Finnhub

- provider 方針分類: `not_recommended` / `needs_free_endpoint_check`。
- 対象 event: earnings calendar、economic calendar など。
- 対象 market: US / global。
- 日本株対応: coverage / plan 確認が必要。
- API 形式: REST API。
- 認証: API key。
- 無料枠: plan 依存。
- 商用 / 個人利用条件: plan 依存。
- レート制限: plan 依存。
- 取得できる日付範囲: endpoint / plan 依存。
- freshness: provider plan 依存。
- source reliability: 中。
- 利用規約上の懸念: economic / earnings calendar が有料 plan 側に寄る可能性。
- 実装難易度: 中。
- 北極星への採用候補: 初回は見送り。無料枠で必要 calendar endpoint が明確に使えると確認できるまで採用しない。
- 備考: 既存 community 情報だけでは品質判断しない。paid endpoint 前提なら採用しない。
- 参照: [Finnhub](https://finnhub.io/)

### Federal Reserve FOMC calendar

- provider 方針分類: `official_scraping_candidate` / `seed_or_curated_only`。
- 対象 event: FOMC meeting、statement、minutes など。
- 対象 market: US macro / central bank。
- 日本株対応: market-level event として有効。
- API 形式: official web page。明確な simple API は未確認。
- 認証: 不要。
- 無料枠: public information。
- 商用 / 個人利用条件: public source の利用条件確認が必要。
- レート制限: scraping / crawler は避け、manual refresh / low frequency に限定する。
- 取得できる日付範囲: 掲載年に依存。
- freshness: official source として高い。
- source reliability: 高。
- 利用規約上の懸念: HTML parsing の安定性。
- 実装難易度: 中。
- 北極星への採用候補: P1 の official source 候補。無料 API がない場合だけ公式 page の限定 parsing を検討し、安定しない場合は seed / curated fixture に留める。
- 備考: 重要度 high の central_bank event として Home に有効。
- 参照: [Federal Reserve FOMC calendars](https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm)

### Bank of Japan calendar

- provider 方針分類: `official_scraping_candidate` / `seed_or_curated_only`。
- 対象 event: 日銀金融政策決定会合、声明、展望レポート、主な統計 release。
- 対象 market: 日本 macro / central bank。
- 日本株対応: market-level event として有効。
- API 形式: official web page。
- 認証: 不要。
- 無料枠: public information。
- 商用 / 個人利用条件: public source の利用条件確認が必要。
- レート制限: scraping / crawler は避ける。
- 取得できる日付範囲: 掲載 calendar に依存。
- freshness: official source として高い。
- source reliability: 高。
- 利用規約上の懸念: HTML parsing の安定性。
- 実装難易度: 中。
- 北極星への採用候補: P1 の official source 候補。無料 API がない場合だけ公式 page の限定 parsing を検討し、安定しない場合は seed / curated fixture に留める。
- 備考: 日本株ユーザー向けに FOMC と並ぶ high importance event。
- 参照: [BOJ Release Schedule](https://www.boj.or.jp/en/about/calendar/)

### NYSE / Nasdaq holiday calendar

- provider 方針分類: `official_scraping_candidate` / `seed_or_curated_only`。
- 対象 event: US market holiday、early close。
- 対象 market: US equities。
- 日本株対応: なし。ただし Home の market-level event として有効。
- API 形式: official web page / calendar page。API は provider 依存。
- 認証: 不要。
- 無料枠: public information。
- 商用 / 個人利用条件: source terms 確認が必要。
- レート制限: scraping / crawler は避ける。
- 取得できる日付範囲: 掲載年に依存。
- freshness: official exchange source として高い。
- source reliability: 高。
- 利用規約上の懸念: HTML parsing の安定性。
- 実装難易度: 低から中。
- 北極星への採用候補: P1 の official source 候補。無料 API がない場合だけ公式 page の限定 parsing を検討し、安定しない場合は seed / curated fixture に留める。
- 備考: JPX holiday と同じ event type `market_holiday` に正規化する。
- 参照: [NYSE Holidays & Trading Hours](https://www.nyse.com/trade/hours-calendars)、[Nasdaq Holiday & Trading Hours](https://www.nasdaq.com/holiday-trading-hours)

## 4. Provider strategy options

### Option A: 最小実用構成

- market-level event を先に実用化する。
- 対象: FOMC、日銀、米 CPI / 雇用統計、JPX / NYSE / Nasdaq 休場日。
- source: Alpha Vantage / FRED / FMP の無料 API 範囲を優先し、FOMC / BOJ / exchange holidays は official source / curated fixture と組み合わせる。
- symbol-level 日本株 event は J-Quants 無料 plan の利用条件確認まで stub / seed 維持。
- manual refresh only。
- 長所: Home の実用価値が早く上がる。実装を小さく切れる。required tests を fixture 化しやすい。
- 短所: SymbolDetail の銘柄別 event は初回では限定的。

### Option B: 日本株重視構成

- 日本株の決算予定 / 配当 / 休場日を優先する。
- source: J-Quants の無料 plan を第一候補、EDINET は filing enrichment に限定。TDnet API は paid API のため採用しない。
- market-level event は FOMC / BOJ / holiday 程度に抑える。
- 長所: 日本株ユーザーの銘柄別確認価値が高い。
- 短所: J-Quants free plan / credential / 利用条件確認が先に必要。無料枠で不足する決算・配当・権利落ちは広範囲 scraping せず後続判断になる。

### Option C: 経済指標重視構成

- 米 CPI、雇用統計、FOMC、日銀、休場日を最優先する。
- source: Alpha Vantage / FRED / FMP の無料 API 範囲と official central bank pages。
- symbol-level event は後続。
- 長所: Home の投資判断イベントとして即効性が高い。
- 短所: 日本株の個別銘柄 calendar としては弱い。

## 5. 推奨方針

推奨は Option A: 最小実用構成。

理由:

- 現在の UI では Home が watchlist / positions / market overview の日次確認画面であり、market-level event の効果が大きい。
- FOMC、日銀、米 CPI、米雇用統計、休場日は投資判断上の共通重要 event で、銘柄別 data source より source 選定が比較的単純。
- J-Quants は日本株 symbol-level では有力だが、free plan、credential、再配布条件、coverage 確認を先に行う必要がある。TDnet API は paid API のため採用しない。
- manual refresh と cache で十分運用でき、scheduled job / crawler を追加しなくてよい。
- required tests は provider response fixture と normalization tests で固定できる。

## 6. 実装フェーズ案

### Phase P1: market-level event provider

- 対象: FOMC、日銀、米 CPI、米雇用統計、GDP、PPI、小売売上高、ISM / PMI、JPX / NYSE / Nasdaq 休場日。
- source: Alpha Vantage / FRED / FMP の無料 API 範囲を優先し、FOMC / BOJ / holiday は official source / curated fixture の hybrid を検討する。
- 実装:
  - `INVESTMENT_CALENDAR_PROVIDER=public` の具体 provider mode を source 別に分割する。
  - source ごとの timeout / retry upper bound / sanitized provider observation を追加する。
  - raw response は保存しない。
  - Home refresh だけを対象にする。
- tests: fake provider fixture、normalization、failure sanitization、stale warning。

### Phase P2: JP stock symbol-level provider

- 対象: 決算発表予定、配当権利落ち、配当支払予定。
- source: J-Quants 無料 plan 第一候補。無料 plan で不足する event は paid plan へ進まず後続判断にする。
- 実装:
  - watchlist / positions / SymbolDetail の symbolCode を J-Quants code に正規化する。
  - `sourceType + externalId` の dedupe を維持する。
  - SymbolDetail refresh を対象にする。
- tests: J-Quants fixture、unknown symbol skip、duplicate upsert、provider failure。

### Phase P3: disclosure / filing enrichment

- 対象: EDINET filing。TDnet 適時開示は paid API のため採用しない。
- source: official EDINET API / free API 範囲。third-party paid API は採用しない。
- 実装:
  - `other` または dedicated event type の追加要否を判断する。
  - document URL / source URL は http / https のみ保存し、UI link は source label に限定するか別途 safe link policy を入れる。
- tests: fixture-based。

### Phase P4: freshness / source quality

- stale warning。
- provider observation。
- source reliability label。
- refresh history。
- provider-specific error code と retry guidance。

## 7. 採用しないもの

- 課金 API / 有料契約前提 API。
- 利用条件が不明な scraping。
- 一般 site scraping / 各社 IR page の広範囲 scraping。
- unofficial scraping を required flow にしない。
- scheduled job / crawler 常駐は導入しない。
- user create / edit / delete UI は導入しない。
- notification / reminder / Google Calendar / Gmail / external calendar sync は導入しない。
- real external provider を required check に入れない。
- raw external payload を保存しない。
