import { z } from 'zod';
import * as dotenv from 'dotenv';
import path from 'path';

// Point to root .env relative to backend/src/env.ts
dotenv.config({ path: path.join(__dirname, '../../.env') });


const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL:    z.string().url(),
  APP_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT:    z.coerce.number().default(3000),

  // ── AI: ローカルLLM (Primary) ── docs/24 §7, docs/28 §3-1
  LOCAL_LLM_ENDPOINT:    z.string().url().optional(),
  PRIMARY_LOCAL_MODEL:   z.string().default('qwen3-30b-a3b-2507'),

  // ── AI: Fallback API (GPT-5 mini) ── docs/28 §3-2, docs/24 §7
  FALLBACK_API_PROVIDER: z.string().default('openai'),
  FALLBACK_API_MODEL:    z.string().default('gpt-5-mini'),
  FALLBACK_API_KEY:      z.string().optional(),
  FALLBACK_API_ENDPOINT: z.string().url().optional(), // override for non-OpenAI providers

  // ── AI: Execution policy ── docs/28 §14
  MAX_LOCAL_RETRY_COUNT: z.coerce.number().default(2),

  // ── Logging ──
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // ── External references collector (docs/6) ──
  REFERENCE_ENABLED_SOURCES: z.string().default('news,disclosure,earnings'),
  REFERENCE_NEWS_RSS_BASE_URL: z.string().url().default('https://news.google.com/rss/search'),
  REFERENCE_NEWS_MAX_ITEMS: z.coerce.number().int().positive().default(5),
  REFERENCE_FETCH_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  REFERENCE_DISCLOSURE_TDNET_LIST_URL_TEMPLATE: z
    .string()
    .default('https://www.release.tdnet.info/inbs/I_list_001_{date}.html'),
  REFERENCE_DISCLOSURE_MAX_ITEMS: z.coerce.number().int().positive().default(5),
  REFERENCE_DISCLOSURE_ALERT_LOOKBACK_DAYS: z.coerce.number().int().positive().default(3),
  REFERENCE_DISCLOSURE_SYMBOL_LOOKBACK_DAYS: z.coerce.number().int().positive().default(14),
  REFERENCE_EARNINGS_TDNET_LIST_URL_TEMPLATE: z
    .string()
    .default('https://www.release.tdnet.info/inbs/I_list_001_{date}.html'),
  REFERENCE_EARNINGS_MAX_ITEMS: z.coerce.number().int().positive().default(5),
  REFERENCE_EARNINGS_ALERT_LOOKBACK_DAYS: z.coerce.number().int().positive().default(7),
  REFERENCE_EARNINGS_SYMBOL_LOOKBACK_DAYS: z.coerce.number().int().positive().default(30),

  // Current snapshot source
  SNAPSHOT_STOOQ_DAILY_URL_TEMPLATE: z
    .string()
    .default('https://stooq.com/q/d/l/?s={symbol}&i=d'),
  SNAPSHOT_YAHOO_CHART_URL_TEMPLATE: z
    .string()
    .default('https://query1.finance.yahoo.com/v8/finance/chart/{symbol}'),
  SNAPSHOT_FETCH_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  SNAPSHOT_CACHE_TTL_MS: z.coerce.number().int().positive().default(300000),
  SNAPSHOT_THRESHOLD_OPEN_BUT_STALE_DAILY: z.coerce.number().int().nonnegative().default(20),
  SNAPSHOT_THRESHOLD_FRESHNESS_INVALID_DAILY: z.coerce.number().int().nonnegative().default(5),
  SNAPSHOT_THRESHOLD_FRESHNESS_EXPIRED_DAILY: z.coerce.number().int().nonnegative().default(10),
  SNAPSHOT_THRESHOLD_CANDIDATE_UNKNOWN_DAILY: z.coerce.number().int().nonnegative().default(30),

  // Internal backtests market-data provider (stub|yahoo|stooq)
  INTERNAL_BACKTEST_MARKET_DATA_PROVIDER: z.enum(['stub', 'yahoo', 'stooq']).optional(),
  INTERNAL_BACKTEST_YAHOO_USER_AGENT: z.string().default('Mozilla/5.0'),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error('❌ Invalid environment variables:', _env.error.format());
  process.exit(1);
}

export const env = _env.data;
