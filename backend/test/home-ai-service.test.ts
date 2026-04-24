import { describe, expect, it, vi } from 'vitest';
import { HomeAiService } from '../src/ai/home-ai-service';
import type { HomeAiProvider } from '../src/ai/home-provider';

const alertContext = {
  alertEventId: 'alert-1',
  alertName: 'MA breakout',
  alertType: 'technical',
  timeframe: 'D',
  triggerPrice: 3020,
  triggeredAt: new Date('2026-04-20T09:00:00+09:00'),
  symbol: {
    id: 'sym-1',
    displayName: 'トヨタ自動車',
    tradingviewSymbol: 'TSE:7203',
    marketCode: 'JP_STOCK',
  },
  rawPayload: {},
  referenceIds: ['ref-1'],
  references: [
    {
      id: 'ref-1',
      referenceType: 'news',
      sourceType: 'news',
      title: 'reference',
      sourceName: 'seed',
      sourceUrl: null,
      publishedAt: null,
      publishedAtIso: null,
      summaryText: 'summary',
      relevanceScore: 10,
    },
  ],
};

describe('HomeAiService', () => {
  it('uses selected provider when generation succeeds', async () => {
    const provider: HomeAiProvider = {
      providerType: 'local_llm',
      generateAlertSummary: vi.fn(async () => ({
        title: 'ok',
        bodyMarkdown: 'ok',
        structuredJson: {
          schema_name: 'alert_reason_summary',
          schema_version: '1.0',
          confidence: 'medium',
          insufficient_context: false,
          payload: {
            what_happened: 'ok',
            fact_points: [],
            reason_hypotheses: [],
            watch_points: [],
            next_actions: [],
            reference_ids: [],
          },
        },
        modelName: 'local-model',
        promptVersion: 'v1',
      })),
      generateDailySummary: vi.fn(async () => ({
        title: 'daily',
        bodyMarkdown: 'daily',
        structuredJson: {
          schema_name: 'daily_summary',
          schema_version: '1.0',
          confidence: 'medium',
          insufficient_context: false,
          payload: {
            highlights: [],
            watch_items: [],
            focus_symbols: [],
            market_context: { tone: 'neutral', summary: 'ok' },
          },
        },
        modelName: 'local-model',
        promptVersion: 'v1',
      })),
      generateSymbolThesisSummary: vi.fn(async () => ({
        title: 'symbol',
        bodyMarkdown: 'symbol',
        structuredJson: {
          schema_name: 'symbol_thesis_summary',
          schema_version: '1.0',
          confidence: 'medium',
          insufficient_context: false,
          payload: {
            bullish_points: [],
            bearish_points: [],
            watch_kpis: [],
            next_events: [],
            invalidation_conditions: [],
            overall_view: 'ok',
          },
        },
        modelName: 'local-model',
        promptVersion: 'v1',
      })),
    };
    const stubProvider: HomeAiProvider = {
      providerType: 'stub',
      generateAlertSummary: vi.fn(async () => {
        throw new Error('must not call');
      }),
      generateDailySummary: vi.fn(async () => {
        throw new Error('must not call');
      }),
      generateSymbolThesisSummary: vi.fn(async () => {
        throw new Error('must not call');
      }),
    };

    const service = new HomeAiService(provider, stubProvider);
    const result = await service.generateAlertSummary(alertContext as any);

    expect(result.output.title).toBe('ok');
    expect(result.log.fallbackToStub).toBe(false);
    expect(provider.generateAlertSummary).toHaveBeenCalledTimes(1);
    expect(stubProvider.generateAlertSummary).toHaveBeenCalledTimes(0);
  });

  it('falls back to stub when selected provider fails', async () => {
    const provider: HomeAiProvider = {
      providerType: 'local_llm',
      generateAlertSummary: vi.fn(async () => {
        throw new Error('provider failed');
      }),
      generateDailySummary: vi.fn(async () => {
        throw new Error('provider failed');
      }),
      generateSymbolThesisSummary: vi.fn(async () => {
        throw new Error('provider failed');
      }),
    };
    const stubProvider: HomeAiProvider = {
      providerType: 'stub',
      generateAlertSummary: vi.fn(async () => ({
        title: 'stub',
        bodyMarkdown: 'stub',
        structuredJson: {
          schema_name: 'alert_reason_summary',
          schema_version: '1.0',
          confidence: 'low',
          insufficient_context: true,
          payload: {
            what_happened: 'stub',
            fact_points: [],
            reason_hypotheses: [],
            watch_points: [],
            next_actions: [],
            reference_ids: [],
          },
        },
        modelName: 'stub-model',
        promptVersion: 'v1',
      })),
      generateDailySummary: vi.fn(async () => ({
        title: 'stub-daily',
        bodyMarkdown: 'stub-daily',
        structuredJson: {
          schema_name: 'daily_summary',
          schema_version: '1.0',
          confidence: 'low',
          insufficient_context: true,
          payload: {
            highlights: [],
            watch_items: [],
            focus_symbols: [],
            market_context: { tone: 'neutral', summary: 'stub' },
          },
        },
        modelName: 'stub-model',
        promptVersion: 'v1',
      })),
      generateSymbolThesisSummary: vi.fn(async () => ({
        title: 'stub-symbol',
        bodyMarkdown: 'stub-symbol',
        structuredJson: {
          schema_name: 'symbol_thesis_summary',
          schema_version: '1.0',
          confidence: 'low',
          insufficient_context: true,
          payload: {
            bullish_points: [],
            bearish_points: [],
            watch_kpis: [],
            next_events: [],
            invalidation_conditions: [],
            overall_view: 'stub',
          },
        },
        modelName: 'stub-model',
        promptVersion: 'v1',
      })),
    };

    const service = new HomeAiService(provider, stubProvider);
    const result = await service.generateAlertSummary(alertContext as any);

    expect(result.output.title).toBe('stub');
    expect(result.log.fallbackToStub).toBe(true);
    expect(result.log.escalationReason).toBe('provider_failed_fallback_to_stub');
    expect(provider.generateAlertSummary).toHaveBeenCalledTimes(1);
    expect(stubProvider.generateAlertSummary).toHaveBeenCalledTimes(1);
  });

  it('falls back to stub for symbol thesis when selected provider fails', async () => {
    const provider: HomeAiProvider = {
      providerType: 'local_llm',
      generateAlertSummary: vi.fn(async () => {
        throw new Error('unused');
      }),
      generateDailySummary: vi.fn(async () => {
        throw new Error('unused');
      }),
      generateSymbolThesisSummary: vi.fn(async () => {
        throw new Error('provider failed');
      }),
    };
    const stubProvider: HomeAiProvider = {
      providerType: 'stub',
      generateAlertSummary: vi.fn(async () => {
        throw new Error('unused');
      }),
      generateDailySummary: vi.fn(async () => {
        throw new Error('unused');
      }),
      generateSymbolThesisSummary: vi.fn(async () => ({
        title: 'stub-symbol',
        bodyMarkdown: 'stub-symbol',
        structuredJson: {
          schema_name: 'symbol_thesis_summary',
          schema_version: '1.0',
          confidence: 'low',
          insufficient_context: true,
          payload: {
            bullish_points: [],
            bearish_points: [],
            watch_kpis: [],
            next_events: [],
            invalidation_conditions: [],
            overall_view: 'stub',
          },
        },
        modelName: 'stub-model',
        promptVersion: 'v1',
      })),
    };

    const service = new HomeAiService(provider, stubProvider);
    const result = await service.generateSymbolThesisSummary({
      scope: 'thesis',
      symbol: {
        id: 'sym-1',
        symbol: 'TYO:7203',
        symbolCode: '7203',
        displayName: 'Toyota',
        marketCode: 'JP',
        tradingviewSymbol: 'TYO:7203',
      },
      referenceIds: [],
      references: [],
      snapshot: null,
      latestNoteSummary: null,
    });

    expect(result.output.title).toBe('stub-symbol');
    expect(result.log.fallbackToStub).toBe(true);
    expect(result.log.escalationReason).toBe('provider_failed_fallback_to_stub');
    expect(provider.generateSymbolThesisSummary).toHaveBeenCalledTimes(1);
    expect(stubProvider.generateSymbolThesisSummary).toHaveBeenCalledTimes(1);
  });
});
