# Home MVP watchlist_symbols 螳溘ョ繝ｼ繧ｿ螳溯｣・

譛ｬ繧ｿ繧ｹ繧ｯ縺ｧ縺ｯ縲～GET /api/home` 縺ｫ縺翫￠繧・`watchlist_symbols` 繧・placeholder 縺九ｉ譛蟆乗ｧ区・縺ｧ螳溘ョ繝ｼ繧ｿ蛹悶＠縺ｾ縺励◆縲・

## 隱ｭ繧薙□ docs 荳隕ｧ

- [docs/0.逶ｮ谺｡.md](file:///g:/Projects/hokkyokusei/docs/0.%E7%9B%AE%E6%AC%A1.md)
- [docs/2.蛹玲･ｵ譏・繝・・繧ｿ繝｢繝・Ν險ｭ險茨ｼ・VP・・md](file:///g:/Projects/hokkyokusei/docs/2.%E5%8C%97%E6%A5%B5%E6%98%9F%20%E3%83%87%E3%83%BC%E3%82%BF%E3%83%A2%E3%83%87%E3%83%AB%E8%A8%AD%E8%A8%88%EF%BC%88MVP%EF%BC%89.md)
- [docs/3.蛹玲･ｵ譏・API 繝ｦ繝ｼ繧ｹ繧ｱ繝ｼ繧ｹ蜊倅ｽ阪・蜈･蜃ｺ蜉幄ｨｭ險茨ｼ・VP・・md](file:///g:/Projects/hokkyokusei/docs/3.%E5%8C%97%E6%A5%B5%E6%98%9F%20API%20%E3%83%A6%E3%83%BC%E3%82%B9%E3%82%B1%E3%83%BC%E3%82%B9%E5%8D%98%E4%BD%8D%E3%81%AE%E5%85%A5%E5%87%BA%E5%8A%9B%E8%A8%AD%E8%A8%88%EF%BC%88MVP%EF%BC%89.md)
- [docs/16.蛹玲･ｵ譏・API縺斐→縺ｮ JSON 繧ｵ繝ｳ繝励Ν髮・ｼ・VP・・md](file:///g:/Projects/hokkyokusei/docs/16.%E5%8C%97%E6%A5%B5%E6%98%9F%20API%E3%81%94%E3%81%A8%E3%81%AE%20JSON%20%E3%82%B5%E3%83%B3%E3%83%97%E3%83%AB%E9%9B%86%EF%BC%88MVP%EF%BC%89.md)
- [docs/17.蛹玲･ｵ譏・逕ｻ髱｢蛻･縺ｮ蜈･蜉・蜃ｺ蜉帙し繝ｳ繝励Ν・・VP・・md](file:///g:/Projects/hokkyokusei/docs/17.%E5%8C%97%E6%A5%B5%E6%98%9F%20%E7%94%BB%E9%9D%A2%E5%88%A5%E3%81%AE%E5%85%A5%E5%8A%9B%20%E5%87%BA%E5%8A%9B%E3%82%B5%E3%83%B3%E3%83%97%E3%83%AB%EF%BC%88MVP%EF%BC%89.md)

## watchlist_symbols 縺ｮ docs 諠ｳ螳・shape

docs 縺ｧ諠ｳ螳壹＆繧後※縺・◆ shape 縺ｯ莉･荳九・騾壹ｊ縺ｧ縺吶・

```json
{
  "symbol_id": "sym_x",
  "display_name": "蜷咲ｧｰ",
  "tradingview_symbol": "TSE:xxx",
  "latest_price": 1000,
  "change_rate": 1.5,
  "latest_alert_status": "received",
  "user_priority": 1
}
```

## 謗｡逕ｨ縺励◆螳溘ョ繝ｼ繧ｿ譁ｹ驥・

迴ｾ蝨ｨ縺ｯ `watchlists / watchlist_items` 繧呈ｭ｣譛ｬ縺ｨ縺励※ `watchlist_symbols` 繧呈ｧ区・縺励∪縺呻ｼ域圻螳壹・ Symbol 蜈ｨ莉ｶ霑泌唆縺ｯ蟒・ｭ｢・峨・

- **蜿門ｾ怜・**:
  - `watchlists` 縺九ｉ `sort_order` 譛蟆擾ｼ亥酔邇・・ `created_at` 譛蟆擾ｼ峨・1莉ｶ繧・Home 譌｢螳壹Μ繧ｹ繝医→縺励※謗｡逕ｨ
  - `watchlist_items` 繧・`priority` 譏・・ｼ亥酔邇・・ `added_at`・峨〒蜿門ｾ・
  - [getCurrentSnapshotsForSymbols()](file:///g:/Projects/hokkyokusei/backend/src/market/snapshot.ts#734-747) 縺ｧ萓｡譬ｼ諠・ｱ繧剃ｻ倅ｸ・
  - `AlertEvent` 縺九ｉ symbol 縺斐→縺ｫ譛譁ｰ繧ｹ繝・・繧ｿ繧ｹ繧貞叙蠕暦ｼ・+1蝗樣∩・・
- **霑泌唆縺ｮ隕∫せ**:
  - `watchlist_symbols.user_priority` 縺ｯ `watchlist_items.priority`
  - snapshot 譛ｪ蜿門ｾ玲凾縺ｯ `latest_price: null`, `change_rate: null`

## 螟画峩縺励◆繝輔ぃ繧､繝ｫ荳隕ｧ

- [backend/src/routes/home.ts](file:///g:/Projects/hokkyokusei/backend/src/routes/home.ts) (API 螳溯｣・
- [backend/test/home.e2e.test.ts](file:///g:/Projects/hokkyokusei/backend/test/home.e2e.test.ts) (繝・せ繝・
- [docs/17.蛹玲･ｵ譏・逕ｻ髱｢蛻･縺ｮ蜈･蜉・蜃ｺ蜉帙し繝ｳ繝励Ν・・VP・・md](file:///g:/Projects/hokkyokusei/docs/17.%E5%8C%97%E6%A5%B5%E6%98%9F%20%E7%94%BB%E9%9D%A2%E5%88%A5%E3%81%AE%E5%85%A5%E5%8A%9B%20%E5%87%BA%E5%8A%9B%E3%82%B5%E3%83%B3%E3%83%97%E3%83%AB%EF%BC%88MVP%EF%BC%89.md) (docs 譖ｴ譁ｰ)

## 霑ｽ蜉/譖ｴ譁ｰ縺励◆繝・せ繝・

- [home.e2e.test.ts](file:///g:/Projects/hokkyokusei/backend/test/home.e2e.test.ts) 蜀・・ [prisma](file:///g:/Projects/hokkyokusei/backend/prisma/schema.prisma) 繝｢繝・け縺ｫ `symbol.findMany` 繧定ｿｽ蜉縲・
- [AlertRow](file:///g:/Projects/hokkyokusei/backend/test/home.e2e.test.ts#6-21) 縺ｫ `processingStatus` 繧定ｿｽ蜉縺励√Δ繝・け繝・・繧ｿ繧よ峩譁ｰ縲・
- `GET /api/home` 繝ｪ繧ｯ繧ｨ繧ｹ繝域凾縺ｮ `watchlist_symbols` 縺碁・蛻・莉ｶ縺ｧ縲∽ｾ｡譬ｼ繧・､牙喧邇・∵Φ螳壹＆繧後◆ shape・・display_name`, `user_priority` 遲会ｼ峨′豁｣縺励￥霑泌唆縺輔ｌ繧九％縺ｨ繧偵い繧ｵ繝ｼ繝医☆繧句・逅・ｒ霑ｽ蜉縲・

## 繝ｭ繝ｼ繧ｫ繝ｫ遒ｺ隱咲ｵ先棡

- `npm run dev` 襍ｷ蜍募ｾ後～curl http://localhost:3000/api/home` 繧貞ｮ溯｡後・
- DB 蜀・′遨ｺ縺ｮ縺溘ａ縲∫ｵ先棡縺ｨ縺励※ `watchlist_symbols: []` 縺ｨ縺ｪ繧翫√°縺､莉悶・鬆・岼縺ｫ蠖ｱ髻ｿ繧剃ｸ弱∴縺壹↓ API 縺梧ｭ｣蟶ｸ縺ｫ遞ｼ蜒阪☆繧九％縺ｨ繧堤｢ｺ隱搾ｼ医ョ繝ｼ繧ｿ縺ｪ縺玲凾縺ｮ遨ｺ驟榊・邯ｭ謖・ｼ峨・
- `vitest` 縺ｫ繧医ｋ e2e 繝・せ繝医・螳悟・縺ｫ PASS 縺励※縺翫ｊ縲√ョ繝ｼ繧ｿ縺ゅｊ繝ｻ縺ｪ縺嶺ｸ｡譁ｹ縺ｮ繧ｱ繝ｼ繧ｹ縺後き繝舌・縺輔ｌ縺ｦ縺・∪縺吶・

## docs 譖ｴ譁ｰ蜀・ｮｹ

[docs/17.蛹玲･ｵ譏・逕ｻ髱｢蛻･縺ｮ蜈･蜉・蜃ｺ蜉帙し繝ｳ繝励Ν・・VP・・md](file:///g:/Projects/hokkyokusei/docs/17.%E5%8C%97%E6%A5%B5%E6%98%9F%20%E7%94%BB%E9%9D%A2%E5%88%A5%E3%81%AE%E5%85%A5%E5%8A%9B%20%E5%87%BA%E5%8A%9B%E3%82%B5%E3%83%B3%E3%83%97%E3%83%AB%EF%BC%88MVP%EF%BC%89.md) 縺ｮ豕ｨ險倥↓莉･荳九ｒ霑ｽ險倥＠縺ｾ縺励◆縲・

> `watchlist_symbols` 縺ｯ [watchlists](file:///g:/Projects/hokkyokusei/backend/prisma/schema.prisma) / [watchlist_items](file:///g:/Projects/hokkyokusei/backend/prisma/schema.prisma) 繧呈ｭ｣譛ｬ縺ｨ縺励※霑斐☆縲・ 
> `user_priority` 縺ｯ `watchlist_items.priority` 繧定ｿ斐＠縲∵悴險ｭ螳壽凾縺ｮ縺ｿ `null`縲・ 
> `latest_alert_status` 縺ｯ symbol 縺ｫ邏舌▼縺乗怙譁ｰ alert 縺ｮ `processingStatus` 繧定ｿ斐☆縲・

## 莉雁屓縺ゅ∴縺ｦ繧・ｉ縺ｪ縺九▲縺溘％縺ｨ

- `positions` / `key_events` 縺ｮ螳溘ョ繝ｼ繧ｿ蛹・
- 逶｣隕夜釜譟・ｮ｡逅・畑繝・・繝悶Ν鄒､・・atchlists, watchlist_items 縺ｪ縺ｩ・峨・ schema 諡｡蠑ｵ
- 繝帙・繝 UI (React 蛛ｴ) 縺ｮ謾ｹ菫ｮ

## 繧ｳ繝溘ャ繝域ュ蝣ｱ

- Hash: `86aec30b9088acec2dc4be42418a41b5ad4a284f`
- URL: (Local Commit)

---

## UI遒ｺ隱咲畑 seed walkthrough・域怙蟆擾ｼ・

### 1. seed 螳溯｡・

```bash
cd backend
pnpm exec prisma db seed
```

### 2. 襍ｷ蜍・

```bash
# repo root
pnpm run up
pnpm run dev
```

### 3. 逕ｻ髱｢遒ｺ隱・URL・域怙蟆擾ｼ・

1. Home  
   - `http://localhost:5173/home`  
   - 遒ｺ隱・ daily summary・・atest/morning/evening蛻・崛・峨〉ecent alerts縲『atchlist symbols縲［arket overview indices

2. Symbol Detail  
   - `http://localhost:5173/home` 縺ｮ逶｣隕夜釜譟・Μ繝ｳ繧ｯ縺九ｉ驕ｷ遘ｻ  
   - 遒ｺ隱・ snapshot縲〉ecent alerts縲〕atest AI thesis summary縲〕atest active note縲〉elated references

3. Note Detail  
   - seed note 逶ｴURL: `http://localhost:5173/notes/00000000-0000-4000-8000-000000000101`  
   - 遒ｺ隱・ note譛ｬ譁・〉evision・・莉ｶ・・

4. Comparison  
   - 逶ｴURL: `http://localhost:5173/comparisons/00000000-0000-4000-8000-000000000301`  
   - 遒ｺ隱・ symbols 2驫俶氛縲〕atest_result・・I邱剰ｩ・+ compared metrics・・

5. Backtest Detail  
   - 逶ｴURL: `http://localhost:5173/backtests/00000000-0000-4000-8000-000000000401`  
   - 遒ｺ隱・ run header縲〕atest import(parsed)縲｝arsed summary縲∥i_review

6. Rule Lab / Strategy Version  
   - version荳隕ｧ: `http://localhost:5173/strategies/00000000-0000-4000-8000-000000000201/versions`  
   - version隧ｳ邏ｰ: `http://localhost:5173/strategy-versions/00000000-0000-4000-8000-000000000202`  
   - 遒ｺ隱・ strategy/version 陦ｨ遉ｺ縲∵里蟄伜ｰ守ｷ夲ｼ・nternal-backtests 縺ｯ譌｢蟄伜･醍ｴ・ｒ邯ｭ謖・ｼ・

7. Backtest 菫晏ｭ俶ｯ碑ｼ・ｼ・airwise・・ 
   - `http://localhost:5173/backtests/00000000-0000-4000-8000-000000000401` 繧帝幕縺・ 
   - inline 豈碑ｼ・ヶ繝ｭ繝・け縺ｧ豈碑ｼ・ｯｾ雎｡ run 繧帝∈謚・ 
   - `縺薙・2莉ｶ縺ｧ豈碑ｼ・ｒ菫晏ｭ倥☆繧義 繧呈款荳・ 
   - `菫晏ｭ俶ｸ医∩豈碑ｼ・ｒ隕九ｋ` 縺九ｉ菫晏ｭ俶ｯ碑ｼ・ｩｳ邏ｰ・・/backtest-comparisons/:comparisonId`・峨∈驕ｷ遘ｻ  
   - 遒ｺ隱・ `metrics_diff` / `tradeoff_summary` / `ai_summary` 縺悟・險ｪ縺ｧ邯ｭ謖√＆繧後ｋ

### 4. 陬懆ｶｳ

- `market_overview.indices` 縺ｯ runtime snapshot 蜿門ｾ礼ｵ先棡繧剃ｽｿ縺・◆繧√√ロ繝・ヨ繝ｯ繝ｼ繧ｯ譚｡莉ｶ縺ｫ繧医▲縺ｦ縺ｯ遨ｺ縺ｫ縺ｪ繧句ｴ蜷医′縺ゅｊ縺ｾ縺吶・
- `market_overview.sectors` 縺ｯ `market_snapshots(snapshot_type=sector)` seed 繧貞盾辣ｧ縺励∪縺吶Ｔeed 譛ｪ謚募・譎ゅ・ `[]` 縺ｫ縺ｪ繧翫∪縺呻ｼ磯Κ蛻・・遶具ｼ峨・
- 縺昴ｌ莉･螟悶・ seed 繝・・繧ｿ・・ote/comparison/backtest/strategy・峨・ id 蝗ｺ螳壹〒蜀榊茜逕ｨ蜿ｯ閭ｽ縺ｧ縺吶・
- `positions` 縺ｯ `portfolios / transactions` 縺九ｉ蟆主・縺励◆ read model 繧・`/api/home` 縺ｧ霑斐＠縺ｾ縺吶・
  - seed 縺ｯ default portfolio + transactions・・uy / buy / partial sell・峨ｒ謚募・貂医∩縺ｧ縺吶・

### 5. Home AI隕∫ｴ・ヵ繝ｭ繝ｼ遒ｺ隱搾ｼ域怙蟆擾ｼ・
0. provider 蛻・崛縺ｨ local_llm 逍朱・   - `.env` 縺ｧ `HOME_AI_PROVIDER=local_llm` 繧定ｨｭ螳・   - `npx tsx scripts/check-local-llm.ts`
   - 遒ｺ隱・ local endpoint/model 縺悟芦驕泌庄閭ｽ縺ｧ縺ゅｋ縺薙→・域磁邯壻ｸ榊庄譎ゅ・繧｢繝励Μ蛛ｴ縺ｧ stub fallback・・
1. 譌･谺｡隕∫ｴ・・譖ｿ・・ome BFF・・   - `GET /api/home?summary_type=latest`
   - `GET /api/home?summary_type=morning&date=2026-04-18`
   - `GET /api/home?summary_type=evening&date=2026-04-18`
   - 遒ｺ隱・ `daily_summary.status` 縺・`available|unavailable` 縺ｧ霑斐ｋ縺薙→縲∵攝譁吩ｸ崎ｶｳ譎ゅ↓ `insufficient_context=true` 縺ｨ縺ｪ繧九％縺ｨ

2. alert 襍ｷ轤ｹ隕∫ｴ・
   - `POST /api/alerts/:alertId/summary/generate`
   - `GET /api/alerts/:alertId/summary`
   - 遒ｺ隱・ summary 縺御ｿ晏ｭ倥＆繧後～ai_jobs` 縺ｮ `queued -> running -> succeeded|failed` 縺梧ｮ九ｋ縺薙→

3. 譌･谺｡隕∫ｴ・API
   - `POST /api/summaries/daily/generate` body: `{ "type": "morning", "date": "2026-04-18" }`
   - `GET /api/summaries/daily?type=latest|morning|evening&date=YYYY-MM-DD`
   - 遒ｺ隱・ 逕滓・譎ゅ↓ `ai_jobs(job_type=generate_daily_summary)` 縺瑚ｨ倬鹸縺輔ｌ繧九％縺ｨ
   - 遒ｺ隱・ `latest` 縺ｯ蜀咲函謌舌〒縺ｯ縺ｪ縺乗里蟄・summary 驕ｸ謚槭〒縺ゅｋ縺薙→縲∵悴逕滓・譎ゅ・ `status=unavailable` 縺ｧ驛ｨ蛻・・遶九☆繧九％縺ｨ

### 6. Symbol AI論点カード確認（最小）
1. SymbolDetail を開く  
   - 例: `http://localhost:5173/symbols/:symbolId`
2. 取得 API を確認  
   - `GET /api/symbols/:symbolId/ai-summary?scope=thesis`
   - 未生成時は `summary.status=unavailable` を返すこと
3. 生成 API を実行  
   - `POST /api/symbols/:symbolId/ai-summary/generate`
   - body: `{ "scope": "thesis", "reference_ids": ["ref_x"] }`
4. 生成後に再取得して確認  
   - `summary.status=available`
   - `title / body_markdown / structured_json` が返ること
   - `structured_json.payload` に `bullish_points / bearish_points / watch_kpis / next_events / invalidation_conditions` が含まれること
5. 保存と状態遷移の確認  
   - `ai_jobs`: `queued -> running -> succeeded|failed`
   - `ai_summaries`: `summary_scope=thesis`, `target_entity_type=symbol` で保存されること
6. provider/fallback の確認  
   - `HOME_AI_PROVIDER=local_llm` で疎通確認
   - 失敗時に `stub` fallback で処理継続し、レスポンス shape が維持されること

### 7. Comparison AI総評確認（最小）
1. 比較詳細を開く
   - 例: http://localhost:5173/comparisons/:comparisonId
2. 生成 API を実行
   - POST /api/comparisons/:comparisonId/generate
   - body: { "include_ai_summary": true }
3. 取得 API で確認
   - GET /api/comparisons/:comparisonId
   - latest_result.ai_summary_id と latest_result.ai_summary が返ること
4. 保存と状態遷移の確認
   - ai_jobs: queued -> running -> succeeded|failed
   - ai_summaries: summary_scope=comparison, target_entity_type=comparison_session
5. provider/fallback の確認
   - HOME_AI_PROVIDER=local_llm を優先
   - 失敗時に stub fallback で保存 shape が維持されること

### 8. Backtest AI Summary Check (Minimal)
- POST /api/backtests/:backtestId/summary/generate
- GET /api/backtests/:backtestId
- ai_review.status=available|unavailable

### 9. Rule Lab Pine Generation Check (Minimal)
1. Open Strategy Version Detail
   - `http://localhost:5173/strategy-versions/:versionId`
2. Generate Pine
   - click `Pine を生成`
   - API: `POST /api/strategy-versions/:versionId/pine/generate`
3. Confirm fetch endpoint
   - API: `GET /api/strategy-versions/:versionId/pine`
   - expected `status=available|unavailable`
4. Confirm minimal states in UI
   - generating
   - unavailable (not generated yet)
   - warning (generated with warnings)
   - available (script shown)
   - failed (warning / failure reason shown)
5. Confirm self-repair behavior
   - When invalid output is retryable, generation retries up to 2 times
   - API response includes `repair_attempts` and `invalid_reason_codes`
6. Confirm input constraints
   - `natural_language_spec` / `target_market` / `target_timeframe` must be present
   - `backtest_period_from` and `backtest_period_to` must be provided together
   - `backtest_period_from <= backtest_period_to`

