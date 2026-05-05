import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function createAlertContext(referenceCount: number) {
  const refs = Array.from({ length: referenceCount }, (_, index) => ({
    id: `ref-${index + 1}`,
    referenceType: 'news',
    sourceType: 'news',
    title: `reference-${index + 1}`,
    sourceName: 'seed',
    sourceUrl: null,
    publishedAt: new Date('2026-05-05T08:00:00Z'),
    publishedAtIso: '2026-05-05T08:00:00.000Z',
    summaryText: `summary-${index + 1}`,
    relevanceScore: 10,
  }));

  return {
    alertEventId: 'alert-1',
    alertName: 'MA breakout',
    alertType: 'technical',
    timeframe: 'D',
    triggerPrice: 3020,
    triggeredAt: new Date('2026-05-05T09:00:00Z'),
    symbol: {
      id: 'sym-1',
      displayName: 'トヨタ自動車',
      tradingviewSymbol: 'TSE:7203',
      marketCode: 'JP_STOCK',
    },
    rawPayload: {
      condition_summary: 'close crossed above MA25',
    },
    referenceIds: refs.map((ref) => ref.id),
    references: refs,
  };
}

describe('LocalLlmAdapter alert summary output', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('deterministic fallback includes signal evaluation sections', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'not-json' } }],
        }),
        text: async () => '',
      }),
    );

    const { LocalLlmAdapter } = await import('../src/ai/local-llm-adapter');
    const adapter = new LocalLlmAdapter('test-model', 'http://localhost:11434');
    const result = await adapter.generateAlertSummary(createAlertContext(1));

    expect(result.bodyMarkdown).toContain('### シグナル評価');
    expect(result.bodyMarkdown).toContain('### 背景材料');
    expect(result.bodyMarkdown).toContain('買いシグナル');
  });

  it('references 0件でも signal evaluation を残しつつ背景補強の弱さを示す', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'not-json' } }],
        }),
        text: async () => '',
      }),
    );

    const { LocalLlmAdapter } = await import('../src/ai/local-llm-adapter');
    const adapter = new LocalLlmAdapter('test-model', 'http://localhost:11434');
    const result = await adapter.generateAlertSummary(createAlertContext(0));

    expect(result.bodyMarkdown).toContain('### シグナル評価');
    expect(result.bodyMarkdown).toContain('背景補強は弱い');
    expect(result.bodyMarkdown).toContain('参照情報は0件です');
  });
});
