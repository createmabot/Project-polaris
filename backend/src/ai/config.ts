/**
 * AI Execution Configuration (docs/28 §14, docs/24 §7)
 *
 * Centralises model names, retry policy, and escalation conditions
 * so they can be swapped via env without touching adapter code.
 */

import { env } from '../env';

// ── Model identifiers ──────────────────────────────────────────────────────
export const AI_CONFIG = {
  /** Primary local model (Qwen3-30B-A3B-2507 series). docs/28 §3-1 */
  primaryLocalModel: env.PRIMARY_LOCAL_MODEL,
  /** Local LLM HTTP endpoint (Ollama-compatible). docs/28 §3-1 */
  localLlmEndpoint: env.LOCAL_LLM_ENDPOINT ?? 'http://localhost:11434',

  /** Fallback API provider name for logging. docs/28 §3-2 */
  fallbackApiProvider: env.FALLBACK_API_PROVIDER,
  /** GPT-5 mini (or equivalent) used only on escalation. docs/28 §3-2 */
  fallbackApiModel: env.FALLBACK_API_MODEL,
  /** OpenAI-compatible API key. Optional — leave blank to disable fallback. */
  fallbackApiKey: env.FALLBACK_API_KEY,
  /** Override endpoint for non-OpenAI compatible providers. */
  fallbackApiEndpoint: env.FALLBACK_API_ENDPOINT ?? 'https://api.openai.com/v1',

  /** Max number of local retries before considering escalation. docs/28 §6, §14 */
  maxLocalRetryCount: env.MAX_LOCAL_RETRY_COUNT,

  /**
   * Task types classified as "summary/alignment" that always run locally first.
   * docs/28 §8 table, doc/28 §5 原則1
   */
  localFirstTaskTypes: [
    'generate_alert_summary',
    'generate_daily_summary',
    'generate_symbol_thesis',
    'generate_backtest_review',
    'collect_references_for_alert',
    'collect_references_for_symbol',
  ] as const,
} as const;

// ── Escalation conditions ─────────────────────────────────────────────────
// docs/28 §6 — four conditions for API escalation

export type EscalationReason =
  | 'pine_compile_error'      // 条件1: Pine がコンパイルエラー
  | 'retry_limit_exceeded'    // 条件2: 2回以上の修正ループでも直らない
  | 'high_constraint_input'   // 条件3: 制約が多くローカルで整合が崩れやすい
  | 'final_quality_required'; // 条件4: 最終提出用の高精度版が必要

export function shouldEscalate(
  reason: EscalationReason,
  retryCount: number,
): boolean {
  switch (reason) {
    case 'pine_compile_error':
      return true; // always escalate on compile error
    case 'retry_limit_exceeded':
      return retryCount >= AI_CONFIG.maxLocalRetryCount;
    case 'high_constraint_input':
      return true;
    case 'final_quality_required':
      return true;
    default:
      return false;
  }
}

/** Returns true if the fallback API is configured and usable */
export function isFallbackAvailable(): boolean {
  return !!AI_CONFIG.fallbackApiKey;
}
