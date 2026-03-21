import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AlertSummaryContext } from '../src/ai/adapter';

type ScenarioOptions = {
  appEnv?: 'test' | 'production' | 'development';
  fallbackApiKey?: string | undefined;
  maxLocalRetryCount?: number;
  localGenerate: ReturnType<typeof vi.fn>;
  fallbackGenerate: ReturnType<typeof vi.fn>;
};

const makeLocalOutput = () => ({
  title: 'local-title',
  bodyMarkdown: 'local-body',
  structuredJson: {
    schema_name: 'alert_reason_summary' as const,
    schema_version: '1.0' as const,
    confidence: 'medium' as const,
    insufficient_context: false,
    payload: {
      what_happened: 'local happened',
      fact_points: ['f1'],
      reason_hypotheses: [{ text: 'h1', confidence: 'low', reference_ids: [] }],
      watch_points: ['w1'],
      next_actions: ['n1'],
      reference_ids: [],
    },
  },
  modelName: 'qwen3-local',
  promptVersion: 'local-v1',
  _meta: { estimatedTokens: 17, estimatedCostUsd: 0 },
});

const makeFallbackOutput = () => ({
  title: 'fallback-title',
  bodyMarkdown: 'fallback-body',
  structuredJson: {
    schema_name: 'alert_reason_summary' as const,
    schema_version: '1.0' as const,
    confidence: 'high' as const,
    insufficient_context: false,
    payload: {
      what_happened: 'fallback happened',
      fact_points: ['f1'],
      reason_hypotheses: [{ text: 'h1', confidence: 'high', reference_ids: [] }],
      watch_points: ['w1'],
      next_actions: ['n1'],
      reference_ids: [],
    },
  },
  modelName: 'gpt-5-mini',
  promptVersion: 'fallback-v1',
  _meta: { estimatedTokens: 222, estimatedCostUsd: 0.0012 },
});

function makeContext(rawPayload: Record<string, unknown> = {}): AlertSummaryContext {
  return {
    alertEventId: 'alert-1',
    alertName: '価格急騰',
    alertType: 'price',
    timeframe: '1D',
    triggerPrice: 3000,
    triggeredAt: new Date('2026-03-21T10:00:00+09:00'),
    symbol: {
      id: 'sym-1',
      displayName: 'トヨタ自動車',
      tradingviewSymbol: 'TSE:7203',
      marketCode: 'TSE',
    },
    rawPayload,
    referenceIds: [],
    references: [],
  };
}

async function loadRouterScenario(options: ScenarioOptions) {
  vi.resetModules();

  const localGenerate = options.localGenerate;
  const fallbackGenerate = options.fallbackGenerate;
  const fallbackReasons: string[] = [];

  vi.doMock('../src/env', () => ({
    env: {
      APP_ENV: options.appEnv ?? 'test',
      PRIMARY_LOCAL_MODEL: 'qwen3-local',
      LOCAL_LLM_ENDPOINT: 'http://localhost:11434',
      FALLBACK_API_PROVIDER: 'openai',
      FALLBACK_API_MODEL: 'gpt-5-mini',
      FALLBACK_API_KEY: options.fallbackApiKey,
      FALLBACK_API_ENDPOINT: 'https://api.openai.com/v1',
      MAX_LOCAL_RETRY_COUNT: options.maxLocalRetryCount ?? 2,
    },
  }));

  vi.doMock('../src/ai/local-llm-adapter', () => {
    class LocalLlmAdapter {
      readonly modelName = 'qwen3-local';
      async generateAlertSummary(ctx: AlertSummaryContext) {
        return await localGenerate(ctx);
      }
    }
    return { LocalLlmAdapter };
  });

  vi.doMock('../src/ai/fallback-api-adapter', () => {
    class FallbackApiAdapter {
      readonly modelName = 'gpt-5-mini';
      constructor(reason: string) {
        fallbackReasons.push(reason);
      }
      async generateAlertSummary(ctx: AlertSummaryContext) {
        return await fallbackGenerate(ctx);
      }
    }
    return { FallbackApiAdapter };
  });

  const { AiRouter } = await import('../src/ai/router');
  return {
    router: new AiRouter(),
    localGenerate,
    fallbackGenerate,
    fallbackReasons,
  };
}

describe('AiRouter fallback routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('local 正常系: localのみ利用し fallbackしない', async () => {
    const localGenerate = vi.fn().mockResolvedValue(makeLocalOutput());
    const fallbackGenerate = vi.fn().mockResolvedValue(makeFallbackOutput());
    const { router } = await loadRouterScenario({
      localGenerate,
      fallbackGenerate,
      fallbackApiKey: 'test-key',
      appEnv: 'test',
      maxLocalRetryCount: 2,
    });

    const result = await router.generateAlertSummary(makeContext());

    expect(localGenerate).toHaveBeenCalledTimes(1);
    expect(fallbackGenerate).toHaveBeenCalledTimes(0);
    expect(result.log.initialModel).toBe('qwen3-local');
    expect(result.log.finalModel).toBe('qwen3-local');
    expect(result.log.escalated).toBe(false);
    expect(result.log.escalationReason).toBeNull();
    expect(result.log.retryCount).toBe(0);
    expect(result.log.estimatedTokens).toBe(17);
    expect(result.log.estimatedCostUsd).toBe(0);
    expect(result.log.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('retry 上限超過: fallback 実行され retry_limit_exceeded が残る', async () => {
    const localGenerate = vi.fn().mockRejectedValue(new Error('local failed'));
    const fallbackGenerate = vi.fn().mockResolvedValue(makeFallbackOutput());
    const { router, fallbackReasons } = await loadRouterScenario({
      localGenerate,
      fallbackGenerate,
      fallbackApiKey: 'test-key',
      appEnv: 'production',
      maxLocalRetryCount: 2,
    });

    const result = await router.generateAlertSummary(makeContext());

    expect(localGenerate).toHaveBeenCalledTimes(3);
    expect(fallbackGenerate).toHaveBeenCalledTimes(1);
    expect(fallbackReasons).toEqual(['retry_limit_exceeded']);
    expect(result.log.initialModel).toBe('qwen3-local');
    expect(result.log.finalModel).toBe('gpt-5-mini');
    expect(result.log.escalated).toBe(true);
    expect(result.log.escalationReason).toBe('retry_limit_exceeded');
    expect(result.log.retryCount).toBe(3);
    expect(result.log.estimatedTokens).toBe(222);
    expect(result.log.estimatedCostUsd).toBeGreaterThan(0);
    expect(result.log.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('fallback key なし: local失敗時は fallbackせず失敗する（production）', async () => {
    const localGenerate = vi.fn().mockRejectedValue(new Error('local failed hard'));
    const fallbackGenerate = vi.fn().mockResolvedValue(makeFallbackOutput());
    const { router } = await loadRouterScenario({
      localGenerate,
      fallbackGenerate,
      fallbackApiKey: undefined,
      appEnv: 'production',
      maxLocalRetryCount: 2,
    });

    await expect(router.generateAlertSummary(makeContext())).rejects.toThrow('local failed hard');
    expect(localGenerate).toHaveBeenCalledTimes(3);
    expect(fallbackGenerate).toHaveBeenCalledTimes(0);
  });

  it('high_constraint_input: local成功でも fallback を使い escalationReason が残る', async () => {
    const localGenerate = vi.fn().mockResolvedValue(makeLocalOutput());
    const fallbackGenerate = vi.fn().mockResolvedValue(makeFallbackOutput());
    const { router, fallbackReasons } = await loadRouterScenario({
      localGenerate,
      fallbackGenerate,
      fallbackApiKey: 'test-key',
      appEnv: 'test',
      maxLocalRetryCount: 2,
    });

    const result = await router.generateAlertSummary(makeContext({ high_constraint_input: true }));

    expect(localGenerate).toHaveBeenCalledTimes(1);
    expect(fallbackGenerate).toHaveBeenCalledTimes(1);
    expect(fallbackReasons).toEqual(['high_constraint_input']);
    expect(result.log.initialModel).toBe('qwen3-local');
    expect(result.log.finalModel).toBe('gpt-5-mini');
    expect(result.log.escalated).toBe(true);
    expect(result.log.escalationReason).toBe('high_constraint_input');
  });

  it('local一時失敗だが条件非該当: fallback せず local で成功する', async () => {
    const localGenerate = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary local error'))
      .mockResolvedValueOnce(makeLocalOutput());
    const fallbackGenerate = vi.fn().mockResolvedValue(makeFallbackOutput());
    const { router } = await loadRouterScenario({
      localGenerate,
      fallbackGenerate,
      fallbackApiKey: 'test-key',
      appEnv: 'test',
      maxLocalRetryCount: 2,
    });

    const result = await router.generateAlertSummary(makeContext());

    expect(localGenerate).toHaveBeenCalledTimes(2);
    expect(fallbackGenerate).toHaveBeenCalledTimes(0);
    expect(result.log.initialModel).toBe('qwen3-local');
    expect(result.log.finalModel).toBe('qwen3-local');
    expect(result.log.escalated).toBe(false);
    expect(result.log.escalationReason).toBeNull();
    expect(result.log.retryCount).toBe(1);
    expect(result.log.durationMs).toBeGreaterThanOrEqual(0);
  });
});
