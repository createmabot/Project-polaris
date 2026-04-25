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
    displayName: 'Toyota',
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

function createProvider(kind: 'ok' | 'fail'): HomeAiProvider {
  return {
    providerType: 'local_llm',
    generateAlertSummary: vi.fn(async () => {
      if (kind === 'fail') throw new Error('provider failed');
      return {
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
      };
    }),
    generateDailySummary: vi.fn(async () => {
      if (kind === 'fail') throw new Error('provider failed');
      return {
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
      };
    }),
    generateSymbolThesisSummary: vi.fn(async () => {
      if (kind === 'fail') throw new Error('provider failed');
      return {
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
      };
    }),
    generateComparisonSummary: vi.fn(async () => {
      if (kind === 'fail') throw new Error('provider failed');
      return {
        title: 'comparison',
        bodyMarkdown: 'comparison',
        structuredJson: {
          schema_name: 'comparison_summary',
          schema_version: '1.0',
          confidence: 'medium',
          insufficient_context: false,
          payload: {
            key_differences: [],
            risk_points: [],
            next_actions: [],
            compared_symbols: [],
            reference_ids: [],
            overall_view: 'ok',
          },
        },
        modelName: 'local-model',
        promptVersion: 'v1',
      };
    }),
    generateBacktestSummary: vi.fn(async () => {
      if (kind === 'fail') throw new Error('provider failed');
      return {
        title: 'backtest',
        bodyMarkdown: 'backtest',
        structuredJson: {
          schema_name: 'backtest_review_summary',
          schema_version: '1.0',
          confidence: 'medium',
          insufficient_context: false,
          payload: {
            strengths: [],
            risks: [],
            next_actions: [],
            key_metrics: {
              total_trades: null,
              win_rate: null,
              profit_factor: null,
              max_drawdown: null,
              net_profit: null,
            },
            overall_view: 'ok',
          },
        },
        modelName: 'local-model',
        promptVersion: 'v1',
      };
    }),
    generatePineScript: vi.fn(async () => {
      if (kind === 'fail') throw new Error('provider failed');
      return {
        normalizedRuleJson: {},
        generatedScript: '//@version=6\nstrategy("ok", overlay=true)',
        warnings: [],
        assumptions: [],
        status: 'generated',
        modelName: 'local-model',
        promptVersion: 'v1',
      };
    }),
  };
}

function createStubProvider(): HomeAiProvider {
  return {
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
    generateComparisonSummary: vi.fn(async () => ({
      title: 'stub-comparison',
      bodyMarkdown: 'stub-comparison',
      structuredJson: {
        schema_name: 'comparison_summary',
        schema_version: '1.0',
        confidence: 'low',
        insufficient_context: true,
        payload: {
          key_differences: [],
          risk_points: [],
          next_actions: [],
          compared_symbols: [],
          reference_ids: [],
          overall_view: 'stub',
        },
      },
      modelName: 'stub-model',
      promptVersion: 'v1',
    })),
    generateBacktestSummary: vi.fn(async () => ({
      title: 'stub-backtest',
      bodyMarkdown: 'stub-backtest',
      structuredJson: {
        schema_name: 'backtest_review_summary',
        schema_version: '1.0',
        confidence: 'low',
        insufficient_context: true,
        payload: {
          strengths: [],
          risks: [],
          next_actions: [],
          key_metrics: {
            total_trades: null,
            win_rate: null,
            profit_factor: null,
            max_drawdown: null,
            net_profit: null,
          },
          overall_view: 'stub',
        },
      },
      modelName: 'stub-model',
      promptVersion: 'v1',
    })),
    generatePineScript: vi.fn(async () => ({
      normalizedRuleJson: {},
      generatedScript: '//@version=6\nstrategy("stub", overlay=true)',
      warnings: ['stub'],
      assumptions: [],
      status: 'generated',
      modelName: 'stub-model',
      promptVersion: 'v1',
    })),
  };
}

describe('HomeAiService', () => {
  it('uses selected provider when generation succeeds', async () => {
    const provider = createProvider('ok');
    const stubProvider = createStubProvider();

    const service = new HomeAiService(provider, stubProvider);
    const result = await service.generateAlertSummary(alertContext as any);

    expect(result.output.title).toBe('ok');
    expect(result.log.fallbackToStub).toBe(false);
    expect(provider.generateAlertSummary).toHaveBeenCalledTimes(1);
    expect(stubProvider.generateAlertSummary).toHaveBeenCalledTimes(0);
  });

  it('falls back to stub when selected provider fails', async () => {
    const provider = createProvider('fail');
    const stubProvider = createStubProvider();

    const service = new HomeAiService(provider, stubProvider);
    const result = await service.generateAlertSummary(alertContext as any);

    expect(result.output.title).toBe('stub');
    expect(result.log.fallbackToStub).toBe(true);
    expect(result.log.escalationReason).toBe('provider_failed_fallback_to_stub');
    expect(provider.generateAlertSummary).toHaveBeenCalledTimes(1);
    expect(stubProvider.generateAlertSummary).toHaveBeenCalledTimes(1);
  });

  it('falls back to stub for symbol thesis when selected provider fails', async () => {
    const provider = createProvider('fail');
    const stubProvider = createStubProvider();

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

  it('falls back to stub for comparison summary when selected provider fails', async () => {
    const provider = createProvider('fail');
    const stubProvider = createStubProvider();

    const service = new HomeAiService(provider, stubProvider);
    const result = await service.generateComparisonSummary({
      comparisonId: 'cmp-1',
      symbols: [
        {
          id: 'sym-1',
          symbol: '7203',
          symbolCode: '7203',
          displayName: 'Toyota',
          marketCode: 'TSE',
          tradingviewSymbol: 'TSE:7203',
        },
        {
          id: 'sym-2',
          symbol: '6758',
          symbolCode: '6758',
          displayName: 'Sony',
          marketCode: 'TSE',
          tradingviewSymbol: 'TSE:6758',
        },
      ],
      metrics: ['change_percent'],
      comparedMetricJson: { metrics: ['change_percent'] },
      references: [],
    });

    expect(result.output.title).toBe('stub-comparison');
    expect(result.log.fallbackToStub).toBe(true);
    expect(result.log.escalationReason).toBe('provider_failed_fallback_to_stub');
    expect(provider.generateComparisonSummary).toHaveBeenCalledTimes(1);
    expect(stubProvider.generateComparisonSummary).toHaveBeenCalledTimes(1);
  });

  it('falls back to stub for backtest summary when selected provider fails', async () => {
    const provider = createProvider('fail');
    const stubProvider = createStubProvider();

    const service = new HomeAiService(provider, stubProvider);
    const result = await service.generateBacktestSummary({
      backtestId: 'bt-1',
      title: 'backtest',
      executionSource: 'tradingview',
      market: 'JP_STOCK',
      timeframe: 'D',
      status: 'imported',
      metrics: null,
      importFiles: [],
      strategy: null,
    });

    expect(result.output.title).toBe('stub-backtest');
    expect(result.log.fallbackToStub).toBe(true);
    expect(result.log.escalationReason).toBe('provider_failed_fallback_to_stub');
    expect(provider.generateBacktestSummary).toHaveBeenCalledTimes(1);
    expect(stubProvider.generateBacktestSummary).toHaveBeenCalledTimes(1);
  });

  it('falls back to stub for pine generation when selected provider fails', async () => {
    const provider = createProvider('fail');
    const stubProvider = createStubProvider();

    const service = new HomeAiService(provider, stubProvider);
    const result = await service.generatePineScript({
      naturalLanguageSpec: 'buy above MA25, close below MA25 exit',
      normalizedRuleJson: null,
      targetMarket: 'JP_STOCK',
      targetTimeframe: 'D',
    });

    expect(result.output.generatedScript).toContain('strategy("stub"');
    expect(result.log.fallbackToStub).toBe(true);
    expect(result.log.escalationReason).toBe('provider_failed_fallback_to_stub');
    expect(provider.generatePineScript).toHaveBeenCalledTimes(1);
    expect(stubProvider.generatePineScript).toHaveBeenCalledTimes(1);
  });
});
