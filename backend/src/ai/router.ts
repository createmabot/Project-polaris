/**
 * AiRouter — orchestrates local → fallback execution
 * docs/28 §7 routing flow, §6 escalation conditions
 *
 * Usage:
 *   const router = new AiRouter();
 *   const { output, log } = await router.generateAlertSummary(ctx);
 *
 * The returned `log` object contains all fields required by docs/20 §9.5 and §12.1:
 *   initialModel, finalModel, escalated, escalationReason, retryCount,
 *   durationMs, estimatedTokens, estimatedCostUsd
 */

import { AlertSummaryContext, AlertSummaryOutput, MockAiAdapter } from './adapter';
import { LocalLlmAdapter } from './local-llm-adapter';
import { FallbackApiAdapter } from './fallback-api-adapter';
import { AI_CONFIG, EscalationReason, isFallbackAvailable, shouldEscalate } from './config';
import { env } from '../env';

export interface AiExecutionLog {
  initialModel: string;
  finalModel: string;
  escalated: boolean;
  escalationReason: EscalationReason | null;
  retryCount: number;
  durationMs: number;
  estimatedTokens: number;
  estimatedCostUsd: number;
}

export interface AiRouterResult {
  output: AlertSummaryOutput;
  log: AiExecutionLog;
}

export class AiRouter {
  private readonly localAdapter: LocalLlmAdapter;
  private readonly mockAdapter: MockAiAdapter;

  constructor() {
    this.localAdapter = new LocalLlmAdapter();
    this.mockAdapter = new MockAiAdapter();
  }

  /**
   * Generate alert summary per docs/28 routing flow:
   * 1. Try local Qwen3 (up to MAX_LOCAL_RETRY_COUNT times)
   * 2. On failure, evaluate escalation conditions
   * 3. If escalation applies and fallback is available → use GPT-5 mini
   * 4. Otherwise, return local result (even if partial / insufficient_context)
   */
  async generateAlertSummary(ctx: AlertSummaryContext): Promise<AiRouterResult> {
    const startedAt = Date.now();
    let retryCount = 0;
    let lastLocalError: Error | null = null;
    let localOutput: AlertSummaryOutput | null = null;

    // ── Step 1: Try local first ────────────────────────────────────────────
    while (retryCount <= AI_CONFIG.maxLocalRetryCount) {
      try {
        localOutput = await this.localAdapter.generateAlertSummary(ctx);
        break; // success
      } catch (e: any) {
        lastLocalError = e instanceof Error ? e : new Error(String(e));
        retryCount++;
        // brief backoff before retry
        if (retryCount <= AI_CONFIG.maxLocalRetryCount) {
          await new Promise((r) => setTimeout(r, 500 * retryCount));
        }
      }
    }

    const localMeta = (localOutput as any)?._meta ?? {};
    const localModelName = this.localAdapter.modelName;

    // ── Step 2: Escalation evaluation ─────────────────────────────────────
    // docs/28 §6: conditions for API escalation
    let escalationReason: EscalationReason | null = null;

    if (!localOutput) {
      // Local repeatedly failed → retry_limit_exceeded
      escalationReason = 'retry_limit_exceeded';
    }
    // Additional conditions can inject escalationReason externally in future
    // (pine_compile_error is handled in a separate Pine job flow, not here)

    const needsEscalation =
      escalationReason !== null &&
      shouldEscalate(escalationReason, retryCount) &&
      isFallbackAvailable();

    // ── Step 3: Fallback (GPT-5 mini) if escalation applies ────────────────
    if (needsEscalation && escalationReason) {
      const fallback = new FallbackApiAdapter(escalationReason);
      try {
        const fallbackOutput = await fallback.generateAlertSummary(ctx);
        const fallbackMeta = (fallbackOutput as any)._meta ?? {};

        const log: AiExecutionLog = {
          initialModel: localModelName,
          finalModel: fallback.modelName,
          escalated: true,
          escalationReason,
          retryCount,
          durationMs: Date.now() - startedAt,
          estimatedTokens: fallbackMeta.estimatedTokens ?? 0,
          estimatedCostUsd: fallbackMeta.estimatedCostUsd ?? 0,
        };
        return { output: fallbackOutput, log };
      } catch (fallbackErr: any) {
        // Even fallback failed — fall through to return local error state below
        lastLocalError = lastLocalError ?? fallbackErr;
      }
    }

    // ── Step 4: Return local result (success or graceful insufficient_context) ─
    if (localOutput) {
      const log: AiExecutionLog = {
        initialModel: localModelName,
        finalModel: localModelName,
        escalated: false,
        escalationReason: null,
        retryCount,
        durationMs: Date.now() - startedAt,
        estimatedTokens: localMeta.estimatedTokens ?? 0,
        estimatedCostUsd: 0, // local = no API cost
      };
      return { output: localOutput, log };
    }

    // ── Step 5: Dev fallback (mock) when local/api are both unavailable ─────
    if (env.APP_ENV !== 'production') {
      const mockOutput = await this.mockAdapter.generateAlertSummary(ctx);
      const mockMeta = (mockOutput as any)?._meta ?? {};
      const log: AiExecutionLog = {
        initialModel: localModelName,
        finalModel: this.mockAdapter.modelName,
        escalated: false,
        escalationReason: null,
        retryCount,
        durationMs: Date.now() - startedAt,
        estimatedTokens: mockMeta.estimatedTokens ?? 0,
        estimatedCostUsd: 0,
      };
      return { output: mockOutput, log };
    }

    // ── Step 6: Everything failed — throw so the job is marked failed ──────
    throw lastLocalError ?? new Error('AI execution failed (both local and fallback)');
  }
}
