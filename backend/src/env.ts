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
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error('❌ Invalid environment variables:', _env.error.format());
  process.exit(1);
}

export const env = _env.data;

