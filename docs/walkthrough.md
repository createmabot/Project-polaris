# 蛹玲･ｵ譏・walkthrough・・ule Lab / Backtest 荳蟾｡・・

譖ｴ譁ｰ譌･: 2026-04-26

譛ｬ雉・侭縺ｯ縲ヽule Lab 縺九ｉ Pine 逕滓・繝ｻTradingView 荳谺｡讀懆ｨｼ繝ｻCSV 蜿冶ｾｼ繝ｻBacktest AI 邱剰ｩ輔・豈碑ｼ・∪縺ｧ縺ｮ荳蟾｡蟆守ｷ壹ｒ縲∫樟陦勲VP螳溯｣・↓蜷医ｏ縺帙※遒ｺ隱阪☆繧九◆繧√・謇矩・〒縺吶・ 
豁｣譛ｬ docs 縺ｯ `docs/0` 縺九ｉ蜿ら・縺励∵悽雉・侭縺ｯ螳滓命謇矩・・繧ｯ繧､繝・け繝√ぉ繝・け逕ｨ騾斐→縺励※謇ｱ縺・∪縺吶・

## 0. 莠句燕貅門ｙ

1. 萓晏ｭ倩ｵｷ蜍・
```bash
pnpm run up
```
2. DB 蜿肴丐縺ｨ seed
```bash
cd backend
pnpm exec prisma migrate deploy
pnpm exec prisma generate
pnpm exec prisma db seed
```
3. 繧｢繝励Μ襍ｷ蜍・
```bash
cd ..
pnpm run dev
```

## 1. Strategy 菴懈・

1. `http://localhost:5173/strategy-lab` 繧帝幕縺上・
2. 閾ｪ辟ｶ險隱槭Ν繝ｼ繝ｫ繧貞・蜉帙＠ strategy 繧剃ｽ懈・縺吶ｋ縲・
3. `POST /api/strategies` 縺梧・蜉溘＠縲《trategy id 縺檎匱陦後＆繧後ｋ縺薙→繧堤｢ｺ隱阪☆繧九・

## 2. Strategy Version 菴懈・

1. 蜷檎判髱｢縺ｾ縺溘・ version 菴懈・蟆守ｷ壹〒 strategy version 繧剃ｽ懈・縺吶ｋ縲・
2. `POST /api/strategies/:strategyId/versions` 縺梧・蜉溘☆繧九％縺ｨ繧堤｢ｺ隱阪☆繧九・
3. `market` 縺ｨ `timeframe` 縺・version 縺ｫ菫晏ｭ倥＆繧後※縺・ｋ縺薙→繧堤｢ｺ隱阪☆繧九・

## 3. 閾ｪ辟ｶ險隱・-> Pine 逕滓・

1. `StrategyVersionDetail` 縺ｧ `Pine 繧堤函謌秦 繧貞ｮ溯｡後☆繧九・
2. `POST /api/strategy-versions/:versionId/pine/generate` 謌仙粥繧堤｢ｺ隱阪☆繧九・
3. `GET /api/strategy-versions/:versionId/pine` 縺ｧ `status=available` 縺ｨ `generated_script` 繧堤｢ｺ隱阪☆繧九・
4. Pine 陦ｨ遉ｺ莉倩ｿ代・ `繧ｳ繝斐・` 繝懊ち繝ｳ縺ｧ縲ゝradingView 雋ｼ繧贋ｻ倥￠逕ｨ縺ｫ蜈ｨ譁・さ繝斐・縺ｧ縺阪ｋ縺薙→繧堤｢ｺ隱阪☆繧九・

## 4. TradingView 荳谺｡讀懆ｨｼ

1. 逕滓・縺励◆ Pine 繧・TradingView 縺ｸ雋ｼ繧贋ｻ倥￠縺ｦ荳谺｡讀懆ｨｼ縺吶ｋ縲・
2. compile error 繧・隼蝟・せ縺後≠繧句ｴ蜷医・繝｡繝｢繧呈ｮ九☆縲・

## 5. Pine 菫ｮ豁｣蜀咲函謌撰ｼ・egenerate・・

1. `StrategyVersionDetail` 縺ｮ菫ｮ豁｣蜈･蜉帶ｬ・↓莉･荳九ｒ蜈･蜉帙＠縺ｦ蜀咲函謌舌☆繧九・
   - `revision_request`・亥ｿ・茨ｼ・
   - `compile_error_text`・井ｻｻ諢擾ｼ・
   - `validation_note`・井ｻｻ諢擾ｼ・
2. `POST /api/strategy-versions/:versionId/pine/regenerate` 縺梧・蜉溘☆繧九％縺ｨ繧堤｢ｺ隱阪☆繧九・
3. 螟ｱ謨玲凾縺ｯ `failure_reason` / `invalid_reason_codes` / `repair_attempts` 繧堤｢ｺ隱阪☆繧九・
4. 蜀咲函謌仙ｾ後ｂ `generated pine` 縺ｮ `繧ｳ繝斐・` 繝懊ち繝ｳ縺梧怏蜉ｹ縺ｧ縺ゅｋ縺薙→繧堤｢ｺ隱阪☆繧九・

## 6. Pine lineage / revision input 遒ｺ隱・

1. `GET /api/strategy-versions/:versionId/pine` 縺ｧ莉･荳九ｒ遒ｺ隱阪☆繧九・
   - `parent_pine_script_id`
   - `source_pine_script_id`
   - `latest_revision_input`
2. 隕ｪ蟄宣未菫ゅ→菫ｮ豁｣逅・罰縺瑚ｿｽ霍｡縺ｧ縺阪ｋ縺薙→繧堤｢ｺ隱阪☆繧九・

## 7. Backtest 菴懈・縺ｨ CSV 蜿冶ｾｼ

1. Backtest 繧剃ｽ懈・縺吶ｋ縲・
   - `POST /api/backtests`
2. CSV 繧貞叙霎ｼ繧縲・
   - `POST /api/backtests/:backtestId/imports`
3. 蜿励￠蜈･繧悟ｽ｢蠑上ｒ遒ｺ隱阪☆繧九・
   - Performance Summary・郁恭隱槭・繝・ム繝ｼ・・
   - List of Trades・域律譛ｬ隱槭・繝・ム繝ｼ・・
   - List of Trades・郁恭隱槭・繝・ム繝ｼ・・
4. 螟ｱ謨玲凾縺ｯ `parse_error` 縺ｫ荳崎ｶｳ蛻励′陦ｨ遉ｺ縺輔ｌ繧九％縺ｨ繧堤｢ｺ隱阪☆繧九・
5. 螟ｱ謨玲凾縺ｮ陬懷勧譁・ｨ縺ｧ縲∵ｬ｡縺ｫ菫ｮ豁｣縺吶∋縺榊・螳ｹ・域Φ螳壼ｽ｢蠑・/ 蠢・亥・ / 遨ｺCSV 縺ｪ縺ｩ・峨′蛻・°繧九％縺ｨ繧堤｢ｺ隱阪☆繧九・
6. HTTP 繧ｨ繝ｩ繝ｼ譎ゅ・縲∽ｻ･荳九・繝ｦ繝ｼ繧ｶ繝ｼ蜷代￠譁・ｨ縺ｫ縺ｪ繧九％縺ｨ繧堤｢ｺ隱阪☆繧九・
   - 400: 蜈･蜉帛・螳ｹ繝ｻCSV蠖｢蠑上・蠢・磯・岼荳崎ｶｳ縺ｮ遒ｺ隱阪ｒ菫・☆
   - 413: 繧ｵ繧､繧ｺ雜・℃・医ヵ繧｡繧､繝ｫ/蜈･蜉帙′螟ｧ縺阪☆縺弱ｋ・峨ｒ譯亥・
   - 415: 騾∽ｿ｡蠖｢蠑擾ｼ・ontent-Type・我ｸ堺ｸ閾ｴ縺ｮ蜿ｯ閭ｽ諤ｧ繧呈｡亥・

## 8. Backtest Detail 陦ｨ遉ｺ

1. `http://localhost:5173/backtests/:backtestId` 繧帝幕縺上・
2. 莉･荳九ｒ遒ｺ隱阪☆繧九・
   - `used_strategy.snapshot`
   - `latest_import`
   - `imports`
   - parse 謌仙粥譎ゅ・ `parsed_summary`

## 9. Backtest AI 邱剰ｩ慕函謌・

1. `BacktestDetail` 縺九ｉ AI 邱剰ｩ慕函謌舌ｒ螳溯｡後☆繧九・
2. `POST /api/backtests/:backtestId/summary/generate` 縺梧・蜉溘＠縲～ai_jobs` 縺・`queued -> running -> succeeded|failed` 縺ｧ驕ｷ遘ｻ縺吶ｋ縺薙→繧堤｢ｺ隱阪☆繧九・
3. `GET /api/backtests/:backtestId` 縺ｮ `ai_review` 繧堤｢ｺ隱阪☆繧九・
   - `status=available|unavailable`
   - `title`
   - `body_markdown`

## 10. inline comparison

1. 蜷御ｸ backtest 蜀・〒 parsed import 縺・莉ｶ莉･荳翫≠繧狗憾諷九↓縺吶ｋ縲・
2. `BacktestDetail` 縺ｮ inline 豈碑ｼ・〒蟾ｮ蛻・′陦ｨ遉ｺ縺輔ｌ繧九％縺ｨ繧堤｢ｺ隱阪☆繧九・

## 11. saved pairwise comparison

1. `縺薙・2莉ｶ縺ｧ豈碑ｼ・ｒ菫晏ｭ倥☆繧義 繧貞ｮ溯｡後☆繧九・
2. `菫晏ｭ俶ｸ医∩豈碑ｼ・ｒ隕九ｋ` 縺九ｉ `GET /api/backtest-comparisons/:comparisonId` 縺瑚｡ｨ遉ｺ縺ｧ縺阪ｋ縺薙→繧堤｢ｺ隱阪☆繧九・
3. `metrics_diff` / `tradeoff_summary` / `ai_summary` 繧貞・險ｪ蜿ｯ閭ｽ縺ｧ縺ゅｋ縺薙→繧堤｢ｺ隱阪☆繧九・

## 12. seed 蝗ｺ螳唔D縺ｧ縺ｮ譛蟆冗｢ｺ隱・

seed 蠕後・莉･荳九〒譛蟆丞虚菴懃｢ｺ隱阪′蜿ｯ閭ｽ縺ｧ縺吶・

1. version荳隕ｧ  
`http://localhost:5173/strategies/00000000-0000-4000-8000-000000000201/versions`
2. version隧ｳ邏ｰ  
`http://localhost:5173/strategy-versions/00000000-0000-4000-8000-000000000202`
3. backtest隧ｳ邏ｰ  
`http://localhost:5173/backtests/00000000-0000-4000-8000-000000000401`

## 13. 驕狗畑繝｡繝｢

1. TradingView 縺ｯ陦ｨ遉ｺ繝ｻ逶｣隕悶・荳谺｡讀懆ｨｼ繧呈球縺・・
2. 蛹玲･ｵ譏溘・菫晏ｭ倥・豈碑ｼ・・螻･豁ｴ邂｡逅・・AI隕∫ｴ・ｒ諡・≧縲・
3. 荳蟾｡蟆守ｷ壹〒遐ｴ邯ｻ縺後≠繧後・縲√∪縺・docs 螂醍ｴ・→縺ｮ蟾ｮ蛻・ｒ遒ｺ隱阪＠縺ｦ縺九ｉ螳溯｣・ｒ菫ｮ豁｣縺吶ｋ縲・

## 14. Home / SymbolDetail / Comparison 遒ｺ隱搾ｼ域怙蟆擾ｼ・

1. Home 陦ｨ遉ｺ繝悶Ο繝・け遒ｺ隱・ 
`http://localhost:5173/` 繧帝幕縺阪∽ｻ･荳九ｒ遒ｺ隱阪☆繧九・
   - 繝槭・繧ｱ繝・ヨ讎よｳ・
   - 逶｣隕夜釜譟・
   - 菫晄怏驫俶氛
   - AI繝・う繝ｪ繝ｼ繧ｵ繝槭Μ繝ｼ
   - 譛譁ｰ繧｢繝ｩ繝ｼ繝・
   - 豕ｨ逶ｮ繧､繝吶Φ繝・

2. watchlist_symbols 縺九ｉ SymbolDetail 縺ｸ驕ｷ遘ｻ  
逶｣隕夜釜譟・・驫俶氛蜷阪Μ繝ｳ繧ｯ繧呈款縺励～/symbols/:symbolId` 縺ｸ驕ｷ遘ｻ縺ｧ縺阪ｋ縺薙→繧堤｢ｺ隱阪☆繧九・

3. positions 縺九ｉ SymbolDetail 縺ｸ驕ｷ遘ｻ  
菫晄怏驫俶氛縺ｮ驫俶氛蜷阪Μ繝ｳ繧ｯ・・symbol_id` 縺後≠繧玖｡鯉ｼ峨ｒ謚ｼ縺励～/symbols/:symbolId` 縺ｸ驕ｷ遘ｻ縺ｧ縺阪ｋ縺薙→繧堤｢ｺ隱阪☆繧九・

4. daily_summary 縺ｮ latest / morning / evening 蛻・崛  
Home 縺ｮ `譛譁ｰ / 譛・/ 螟彖 繧貞・繧頑崛縺医∬｡ｨ遉ｺ縺梧峩譁ｰ縺輔ｌ繧九％縺ｨ繧堤｢ｺ隱阪☆繧九・

5. SymbolDetail 縺ｮ AI隲也せ繧ｫ繝ｼ繝芽｡ｨ遉ｺ  
`/symbols/:symbolId` 縺ｧ AI隲也せ繧ｫ繝ｼ繝峨′ `available` 縺ｮ蝣ｴ蜷医√ち繧､繝医Ν繝ｻ譛ｬ譁・ｼ医∪縺溘・隲也せ繝ｪ繧ｹ繝茨ｼ峨・逕滓・譌･譎ゅ′陦ｨ遉ｺ縺輔ｌ繧九％縺ｨ繧堤｢ｺ隱阪☆繧九・

6. SymbolDetail 縺ｮ AI隲也せ繧ｫ繝ｼ繝牙・逕滓・  
AI隲也せ繧ｫ繝ｼ繝芽｡ｨ遉ｺ荳ｭ縺ｧ繧・`AI隲也せ繧ｫ繝ｼ繝峨ｒ蜀咲函謌秦 繝懊ち繝ｳ縺瑚｡ｨ遉ｺ縺輔ｌ縲∵款荳区凾縺ｫ `逕滓・荳ｭ...` 縺ｸ螟牙喧縺吶ｋ縺薙→繧堤｢ｺ隱阪☆繧九・ 
譛ｪ逕滓・迥ｶ諷具ｼ・unavailable`・峨〒縺ｯ譌｢蟄倥・ `AI隲也せ繧ｫ繝ｼ繝臥函謌秦 縺瑚｡ｨ遉ｺ縺輔ｌ繧九％縺ｨ繧堤｢ｺ隱阪☆繧九・

7. SymbolDetail 縺九ｉ Comparison 縺ｸ驕ｷ遘ｻ  
`豈碑ｼ・判髱｢縺ｫ騾ｲ繧` 繧呈款縺励，omparison 逕ｻ髱｢縺ｸ驕ｷ遘ｻ縺ｧ縺阪ｋ縺薙→繧堤｢ｺ隱阪☆繧九・

8. Comparison 縺ｮ AI豈碑ｼ・ｷ剰ｩ慕函謌・ 
Comparison 逕ｻ髱｢縺ｧ AI豈碑ｼ・ｷ剰ｩ輔・逕滓・謫堺ｽ懊ｒ螳溯｡後＠縲∫ｵ先棡陦ｨ遉ｺ縺梧峩譁ｰ縺輔ｌ繧九％縺ｨ繧堤｢ｺ隱阪☆繧九・

## 15. Home / SymbolDetail / Comparison 縺ｮE2E蝗ｺ螳夲ｼ域怙蟆擾ｼ・

莉･荳九・蟆守ｷ壹・ backend 縺ｮ譛蟆拾2E縺ｧ蝗槫ｸｰ蝗ｺ螳壹＠縺ｦ縺・∪縺吶・

- seed逶ｸ蠖薙ョ繝ｼ繧ｿ縺ｧ `GET /api/home` 繧帝幕縺阪∽ｸｻ隕√ヶ繝ｭ繝・け萓帷ｵｦ繝・・繧ｿ・・arket_overview / watchlist_symbols / positions / daily_summary / recent_alerts / key_events・峨ｒ遒ｺ隱・
- Home 縺ｮ watchlist_symbols / positions 縺ｧ蜿門ｾ励＠縺・`symbol_id` 繧剃ｽｿ縺｣縺ｦ `GET /api/symbols/:symbolId` 繧堤｢ｺ隱・
- `POST /api/symbols/:symbolId/ai-summary/generate` 縺ｧ AI隲也せ繧ｫ繝ｼ繝牙・逕滓・蟆守ｷ壹・API縺檎ｴ邯ｻ縺励※縺・↑縺・％縺ｨ繧堤｢ｺ隱・
- `POST /api/comparisons`・・symbol_ids: ['7203', '6758']`・・> `POST /api/comparisons/:comparisonId/generate` -> `GET /api/comparisons/:comparisonId` 縺ｧ豈碑ｼ・ｰ守ｷ壹ｒ遒ｺ隱・

螳溯｡後さ繝槭Φ繝・

```bash
pnpm --filter backend test:e2e:home-symbol-comparison
```

## 16. PowerShell 縺九ｉ譌･譛ｬ隱・JSON 繧帝√ｋ髫帙・ UTF-8 謖・ｮ壽焔鬆・

### 閭梧勹

PowerShell・・indows 繝・ヵ繧ｩ繝ｫ繝茨ｼ峨・ `Invoke-RestMethod` / `Invoke-WebRequest` 縺ｫ縺翫＞縺ｦ縲・
繝壹う繝ｭ繝ｼ繝峨ｒ System.DefaultEncoding・磯壼ｸｸ CP932 / Shift_JIS・峨〒繧ｨ繝ｳ繧ｳ繝ｼ繝峨☆繧句ｴ蜷医′縺ゅｋ縲・
譌･譛ｬ隱・`natural_language_rule` 繧貞性繧 JSON 繧偵◎縺ｮ縺ｾ縺ｾ騾√ｋ縺ｨ譁・ｭ怜喧縺代＠縲￣ine 逕滓・縺ｫ螟ｱ謨励☆繧九こ繝ｼ繧ｹ縺後≠繧九・

### 蟇ｾ遲・ UTF-8 繝舌う繝亥・縺ｫ螟画鋤縺励※騾∽ｿ｡縺吶ｋ

```powershell
# 譌･譛ｬ隱槭ｒ蜷ｫ繧 JSON 繝壹う繝ｭ繝ｼ繝峨ｒ UTF-8 繝舌う繝亥・縺ｫ螟画鋤縺励※騾∽ｿ｡縺吶ｋ萓・

$payload = @{
  natural_language_rule = "邨ょ､縺・5譌･遘ｻ蜍募ｹｳ蝮・ｒ荳頑栢縺代◆繧芽ｲｷ縺・∽ｸ区栢縺代◆繧牙｣ｲ繧・
  market = "JP_STOCK"
  timeframe = "D"
} | ConvertTo-Json -Depth 10

# UTF-8 繝舌う繝亥・縺ｫ螟画鋤・医％縺ｮ謇矩・′譁・ｭ怜喧縺鷹亟豁｢縺ｮ譬ｸ蠢・ｼ・
$utf8Body = [System.Text.Encoding]::UTF8.GetBytes($payload)

Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3000/api/strategies/<strategyId>/versions" `
  -ContentType "application/json; charset=utf-8" `
  -Body $utf8Body
```

### Pine 逕滓・・・trategy-versions・峨・萓・

```powershell
# Pine 逕滓・繧定ｵｷ蜍輔☆繧倶ｾ・
Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3000/api/strategy-versions/<versionId>/pine/generate" `
  -ContentType "application/json; charset=utf-8" `
  -Body ([System.Text.Encoding]::UTF8.GetBytes('{}'))
```

### alert summary 逕滓・縺ｮ萓・

```powershell
# alert summary 逕滓・繧定ｵｷ蜍輔☆繧倶ｾ・
Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3000/api/alerts/<alertId>/summary/generate" `
  -ContentType "application/json; charset=utf-8" `
  -Body ([System.Text.Encoding]::UTF8.GetBytes('{}'))
```

### generate_alert_summary 縺・failed 縺ｮ蝣ｴ蜷医・遒ｺ隱肴焔鬆・

```powershell
# failed 譎ゅ・蜴溷屏霑ｽ霍｡: latest_job 繝輔ぅ繝ｼ繝ｫ繝峨ｒ遒ｺ隱阪☆繧・
$result = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:3000/api/alerts/<alertId>/summary"

# latest_job 縺・null 縺ｧ縺ｪ縺代ｌ縺ｰ縲）ob 縺ｮ迥ｶ諷九ｒ遒ｺ隱阪〒縺阪ｋ
$result.data.latest_job | Format-List
# 蜃ｺ蜉帑ｾ・
# job_id       : xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
# job_type     : generate_alert_summary
# status       : failed
# error_message: local_llm: connection refused - provider not available
# model_name   :
# retry_count  : 0
# created_at   : 2026-04-27T00:00:00.000Z
# completed_at : 2026-04-27T00:00:10.000Z
```

### 豕ｨ諢丈ｺ矩・

1. `Invoke-RestMethod` 縺ｮ `-Body` 縺ｫ譁・ｭ怜・繧呈ｸ｡縺吶→縲￣owerShell 縺瑚・蜍慕噪縺ｫ繧ｨ繝ｳ繧ｳ繝ｼ繝峨☆繧九・
   譌･譛ｬ隱槭ｒ蜷ｫ繧蝣ｴ蜷医・蠢・★ `-Body $utf8Body`・医ヰ繧､繝亥・・牙ｽ｢蠑上ｒ菴ｿ逕ｨ縺吶ｋ縺薙→縲・
2. `-ContentType "application/json; charset=utf-8"` 縺ｮ `charset=utf-8` 繧堤怐逡･縺励※繧ょ虚縺上′縲・
   譏守､ｺ縺吶ｋ縺薙→縺ｧ諢丞峙繧呈・遒ｺ縺ｫ縺吶ｋ縲・
3. backend 蛛ｴ縺ｯ `REPLACEMENT CHARACTER (U+FFFD)` 繧・Windows-1252 蛻ｶ蠕｡譁・ｭ励ｒ蜷ｫ繧
   `natural_language_rule` 繧貞女縺大叙縺｣縺溷ｴ蜷医～creation_warnings` 縺ｫ隴ｦ蜻翫ｒ霑斐☆縲・
   縺薙ｌ縺悟・縺溷ｴ蜷医・荳願ｨ倥・ UTF-8 譏守､ｺ謇矩・ｒ遒ｺ隱阪☆繧九％縺ｨ縲・
## 17. watchlist / positions 螳溘ョ繝ｼ繧ｿ邂｡逅・焔鬆・ｼ・026-04 霑ｽ蜉・・

seed 莉･螟悶・驕狗畑繝・・繧ｿ繧・Home 襍ｷ轤ｹ縺ｧ謇ｱ縺・怙蟆乗焔鬆・・

1. Home 縺ｧ `逶｣隕夜釜譟・ｒ邂｡逅・ 繧呈款縺・`/watchlist` 縺ｸ驕ｷ遘ｻ縺吶ｋ縲・
2. 逶｣隕夜釜譟・ｒ霑ｽ蜉縺吶ｋ・・symbol_code` 蠢・医｝riority/memo 縺ｯ莉ｻ諢擾ｼ峨・
3. 荳隕ｧ縺ｮ驫俶氛繝ｪ繝ｳ繧ｯ縺九ｉ SymbolDetail 縺ｸ驕ｷ遘ｻ縺ｧ縺阪ｋ縺薙→繧堤｢ｺ隱阪☆繧九・
4. Home 縺ｫ謌ｻ繧翫∫屮隕夜釜譟・ヶ繝ｭ繝・け縺ｸ蜿肴丐縺輔ｌ繧九％縺ｨ繧堤｢ｺ隱阪☆繧九・
5. Home 縺ｧ `菫晄怏驫俶氛繧堤ｮ｡逅・ 繧呈款縺・`/positions` 縺ｸ驕ｷ遘ｻ縺吶ｋ縲・
6. 菫晄怏驫俶氛繧定ｿｽ蜉縺ｾ縺溘・譖ｴ譁ｰ縺吶ｋ・・symbol_code` `quantity` `average_cost`・峨・
7. 荳隕ｧ縺ｮ驫俶氛繝ｪ繝ｳ繧ｯ縺九ｉ SymbolDetail 縺ｸ驕ｷ遘ｻ縺ｧ縺阪ｋ縺薙→繧堤｢ｺ隱阪☆繧九・
8. Home 縺ｫ謌ｻ繧翫∽ｿ晄怏驫俶氛繝悶Ο繝・け縺ｸ蜿肴丐縺輔ｌ繧九％縺ｨ繧堤｢ｺ隱阪☆繧九・

陬懆ｶｳ:
- watchlist/positions API 縺ｯ default watchlist/default portfolio 縺檎┌縺・ｴ蜷医↓閾ｪ蜍穂ｽ懈・縺吶ｋ縲・
- symbol_code 縺梧悴逋ｻ骭ｲ縺ｪ繧・Symbol 繧呈怙蟆丈ｽ懈・縺励※蜃ｦ逅・☆繧九・
- positions 縺ｯ transactions 豁｣譛ｬ縺ｮ縺溘ａ縲∵峩譁ｰ繝ｻ蜑企勁縺ｯ manual transaction 邨檎罰縺ｧ read model 繧貞・讒狗ｯ峨☆繧九・

## 18. TradingView螳滄∽ｿ｡ webhook驕狗畑謇矩・ｼ亥崋螳夲ｼ・

TradingView螳滄∽ｿ｡繧貞燕謠舌↓縺励◆驕狗畑謇矩・・谺｡繧呈ｭ｣譛ｬ縺ｨ縺励※蛻ｩ逕ｨ縺励※縺上□縺輔＞縲・

- `docs/32.蛹玲･ｵ譏・TradingView螳滄∽ｿ｡ webhook驕狗畑謇矩・ｼ・VP・・md`

譛ｬ謇矩・↓縺ｯ縲∽ｻ･荳九ｒ蜷ｫ縺ｿ縺ｾ縺吶・
- Alert message JSON 繝・Φ繝励Ξ繝ｼ繝・
- webhook URL / token / shared_secret 縺ｮ螳牙・縺ｪ驕狗畑謇矩・
- 繝ｭ繝ｼ繧ｫ繝ｫ逍台ｼｼ騾∽ｿ｡縺ｨ螳滄∽ｿ｡縺ｮ驕輔＞
- webhook_receipts / alert_events / ai_jobs / Home / SymbolDetail 縺ｮ遒ｺ隱肴焔鬆・
- auth/parse/unresolved/duplicate/summary failed 縺ｮ蛻・ｊ蛻・￠

## 19. references萓帷ｵｦ迥ｶ豕∫｢ｺ隱搾ｼ・026-05・・

references 縺ｮ萓帷ｵｦ迥ｶ豕∫｢ｺ隱阪・谺｡繧呈ｭ｣譛ｬ縺ｨ縺励※蛻ｩ逕ｨ縺励※縺上□縺輔＞縲・

- `docs/33.蛹玲･ｵ譏・references萓帷ｵｦ迥ｶ豕∵紛逅・→驕狗畑隱ｲ鬘鯉ｼ・VP・・md`

譛蟆冗｢ｺ隱肴焔鬆・

1. SymbolDetail 繧帝幕縺阪～髢｢騾｣蜿ら・諠・ｱ` 縺ｮ蜀・ｨｳ `news / disclosure / earnings` 繧堤｢ｺ隱阪☆繧・
2. ComparisonDetail 繧帝幕縺阪∵ｯ碑ｼ・・菴薙・蜿ら・蜀・ｨｳ縺ｨ蜷・symbol card 縺ｮ蜿ら・蜀・ｨｳ繧堤｢ｺ隱阪☆繧・
3. references 0莉ｶ縺ｧ繧・AI隲也せ繧ｫ繝ｼ繝・/ AI豈碑ｼ・ｷ剰ｩ輔′逕滓・縺輔ｌ繧句ｴ蜷医′縺ゅｋ縺溘ａ縲∵悽譁・□縺代〒蜊∝・諤ｧ繧貞愛譁ｭ縺励↑縺・
4. `insufficient_context` 陦ｨ遉ｺ縺縺代〒縺ｪ縺上～reference_count` 縺ｨ references 螳滓焚繧剃ｽｵ縺帙※遒ｺ隱阪☆繧・
5. alert summary 螟ｱ謨玲凾縺ｯ `collect_references_for_alert` 縺ｨ `generate_alert_summary` 繧貞・縺代※遒ｺ隱阪☆繧・

陬懆ｶｳ:

- 2026-05-01 隕ｳ貂ｬ譎らせ縺ｧ縺ｯ `7203: news 6莉ｶ / disclosure 0莉ｶ / earnings 0莉ｶ`縲～6758: 0莉ｶ` 縺縺｣縺・
- `disclosure` 縺ｨ `earnings` 縺ｯ collector 譛ｪ螳溯｣・〒縺ｯ縺ｪ縺上∝ｮ溯｣・・蟄伜惠縺吶ｋ
- `reference_count = 0` 縺ｧ繧・`structured_json.insufficient_context = false` 縺ｮ AI summary 縺梧ｮ九ｋ縺薙→縺後≠繧九◆繧√∫樟譎らせ縺ｧ縺ｯ驕狗畑豕ｨ諢上→縺励※謇ｱ縺・

## 20. TDnet disclosure / earnings 0莉ｶ譎ゅ・蛻・ｊ蛻・￠・・026-05・・

1. 縺ｾ縺・`collect_references_for_alert` 縺ｮ `ai_jobs.response_payload.diagnostics` 繧堤｢ｺ隱阪☆繧九・
2. `disclosure.reason` / `earnings.reason` 繧定ｦ九※縲・莉ｶ逅・罰繧貞・繧雁・縺代ｋ縲・
3. 逅・罰縺斐→縺ｮ隕区婿:
   - `tdnet_fetch_failed`: 蜿門ｾ怜､ｱ謨励・03 / timeout / 荳譎る囿螳ｳ繧堤桝縺・・
   - `tdnet_no_file_for_date`: 蟇ｾ雎｡譌･荳隕ｧ縺悟ｭ伜惠縺励↑縺・ょ悄譌･逾昴ｄ蟇ｾ雎｡譌･譛ｪ謗ｲ霈峨・蜿ｯ閭ｽ諤ｧ縺碁ｫ倥＞縲・
   - `tdnet_parse_zero_rows`: HTML 縺ｯ蜿悶ｌ縺ｦ縺・ｋ縺・row 0 莉ｶ縲５Dnet HTML 讒矩螟画峩繧堤桝縺・・
   - `tdnet_rows_exist_but_no_symbol_match`: 荳隕ｧ row 縺ｯ縺ゅｋ縺・symbol 辣ｧ蜷医〒關ｽ縺｡縺ｦ縺・ｋ縲・
   - `tdnet_symbol_match_but_no_earnings_title`: symbol 荳閾ｴ row 縺ｯ縺ゅｋ縺・earnings keyword 縺ｫ蜈･縺｣縺ｦ縺・↑縺・・
   - `tdnet_no_matching_disclosure_in_lookback`: lookback 譛滄俣蜀・↓隧ｲ蠖・disclosure 縺後↑縺九▲縺溘・
   - `tdnet_no_matching_earnings_in_lookback`: lookback 譛滄俣蜀・↓隧ｲ蠖・earnings 縺後↑縺九▲縺溘・
4. 螳溘ョ繝ｼ繧ｿ 1 蝗樒｢ｺ隱阪・譛蟆乗焔鬆・
   - `I_list_001_YYYYMMDD.html` 繧・1 蝗槭□縺大叙蠕励☆繧・
   - `parseTdnetRows` 逶ｸ蠖薙〒 row count 繧堤｢ｺ隱阪☆繧・
   - `7203` / `6758` 縺ｪ縺ｩ蟇ｾ雎｡ code 縺ｮ陦後′縺ゅｋ縺狗｢ｺ隱阪☆繧・
5. 2026-05-02 縺ｮ隕ｳ貂ｬ繝｡繝｢:
   - `I_list_001_20260501.html` 縺ｯ `HTTP 200`
   - parsed row count 縺ｯ `100`
   - `7203` / `6758` 隧ｲ蠖・row 縺ｯ `0`
   - 蟆代↑縺上→繧ゅ％縺ｮ 1 譌･縺ｫ縺､縺・※縺ｯ parser 蟠ｩ繧後〒縺ｯ縺ｪ縺上後◎縺ｮ譌･縺ｮ荳隕ｧ縺ｫ蟇ｾ雎｡驫俶氛縺後＞縺ｪ縺・榊ｯ・ｊ縺ｨ蛻､譁ｭ縺吶ｋ

## 21. TradingView CSV import 驕狗畑謇矩・ｼ・026-05-05 霑ｽ險假ｼ・

TradingView 螳・CSV 縺ｮ蜃ｺ縺玲婿縺ｨ縲∝圏讌ｵ譏溘〒縺ｮ蜿悶ｊ霎ｼ縺ｿ遒ｺ隱肴焔鬆・・谺｡縺ｮ runbook 繧呈ｭ｣譛ｬ縺ｨ縺吶ｋ縲・

- `docs/34.蛹玲･ｵ譏・TradingView CSV import 驕狗畑謇矩・ｼ・VP・・md`

譛菴朱剞縺ｮ遒ｺ隱埼・
1. TradingView 蛛ｴ縺ｧ Strategy Report / Strategy Tester 繧帝幕縺上・
2. `Performance Summary` 縺ｾ縺溘・ `List of Trades` 繧・CSV export 縺吶ｋ縲・
3. 蛹玲･ｵ譏溘・ Rule Lab / Backtest 逕ｻ髱｢縺九ｉ CSV import 繧貞ｮ溯｡後☆繧九・
4. Backtest Detail 縺ｧ `latest import` `imports` `parsed莉ｶ謨ｰ` `failed莉ｶ謨ｰ` 繧堤｢ｺ隱阪☆繧九・
5. 譛譁ｰ import 縺・failed 縺ｧ繧ゅ・℃蜴ｻ parsed import 縺梧ｮ九▲縺ｦ縺・ｌ縺ｰ豈碑ｼ・・AI邱剰ｩ輔・邯咏ｶ夂｢ｺ隱阪☆繧九・

豕ｨ險・
- TradingView 縺ｮ逕ｻ髱｢蜷阪・迺ｰ蠅・↓繧医ｊ `Strategy Report` 縺ｨ `Strategy Tester` 縺ｮ謠ｺ繧後′縺ゅｋ縲・
- 蛹玲･ｵ譏溘′迴ｾ陦後〒蜿励￠莉倥￠繧九・縺ｯ `Performance Summary 闍ｱ隱杼 `List of Trades 闍ｱ隱杼 `List of Trades 譌･譛ｬ隱杼縲・
- `Performance Summary 譌･譛ｬ隱杼 縺ｯ迴ｾ陦・parser 縺ｮ蜿励￠莉倥￠蟇ｾ雎｡螟悶・

- MVP蜿怜・遒ｺ隱阪・螳滓命邨先棡縺ｯ docs/37.蛹玲･ｵ譏・MVP蜿怜・遒ｺ隱咲ｵ先棡・・VP・・md 繧貞盾辣ｧ縲・


- MVP受入確認の実施結果は docs/37.北極星 MVP受入確認結果（MVP）.md を参照。

