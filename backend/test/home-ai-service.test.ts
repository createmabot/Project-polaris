import { describe, expect, it, vi } from 'vitest';
import { HomeAiService } from '../src/ai/home-ai-service';
import type { HomeAiProvider } from '../src/ai/home-provider';
import { assessGeneratedPineScript, reviewGeneratedPineScriptDeterministic } from '../src/strategy/pine';
import type { PineReviewResult } from '../src/strategy/pine';

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

function createPassingPineReview(): PineReviewResult {
  return {
    schema_name: 'pine_review_result',
    schema_version: '1.0',
    status: 'pass',
    issues: [],
    summary: {
      issue_count: 0,
      error_count: 0,
      warning_count: 0,
      repairable_issue_count: 0,
    },
  };
}

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
            conclusion: 'ok',
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
    rewriteNaturalLanguageRuleDraft: vi.fn(async () => {
      if (kind === 'fail') throw new Error('provider failed');
      return {
        naturalLanguageRule: 'entry filterを強化し、stop lossを明確化する。',
        warnings: [],
        assumptions: [],
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
    reviewPineScript: vi.fn(async () => {
      if (kind === 'fail') throw new Error('provider failed');
      return createPassingPineReview();
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
          conclusion: 'stub',
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
    rewriteNaturalLanguageRuleDraft: vi.fn(async () => ({
      naturalLanguageRule: 'stub rule rewrite',
      warnings: ['stub'],
      assumptions: [],
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
    reviewPineScript: vi.fn(async (context) => reviewGeneratedPineScriptDeterministic(context.generatedScript)),
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

  it('throws provider error when selected provider fails (default: no stub fallback)', async () => {
    const provider = createProvider('fail');
    const stubProvider = createStubProvider();

    const service = new HomeAiService(provider, stubProvider);
    await expect(service.generateAlertSummary(alertContext as any)).rejects.toThrow(
      'ai_provider_failed(local_llm): provider failed',
    );
    expect(provider.generateAlertSummary).toHaveBeenCalledTimes(1);
    expect(stubProvider.generateAlertSummary).toHaveBeenCalledTimes(0);
  });

  it('throws provider error for symbol thesis when provider fails', async () => {
    const provider = createProvider('fail');
    const stubProvider = createStubProvider();

    const service = new HomeAiService(provider, stubProvider);
    await expect(
      service.generateSymbolThesisSummary({
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
      }),
    ).rejects.toThrow('ai_provider_failed(local_llm): provider failed');
    expect(provider.generateSymbolThesisSummary).toHaveBeenCalledTimes(1);
    expect(stubProvider.generateSymbolThesisSummary).toHaveBeenCalledTimes(0);
  });

  it('throws provider error for comparison summary when provider fails', async () => {
    const provider = createProvider('fail');
    const stubProvider = createStubProvider();

    const service = new HomeAiService(provider, stubProvider);
    await expect(
      service.generateComparisonSummary({
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
      }),
    ).rejects.toThrow('ai_provider_failed(local_llm): provider failed');
    expect(provider.generateComparisonSummary).toHaveBeenCalledTimes(1);
    expect(stubProvider.generateComparisonSummary).toHaveBeenCalledTimes(0);
  });

  it('throws provider error for backtest summary when provider fails', async () => {
    const provider = createProvider('fail');
    const stubProvider = createStubProvider();

    const service = new HomeAiService(provider, stubProvider);
    await expect(
      service.generateBacktestSummary({
        backtestId: 'bt-1',
        title: 'backtest',
        executionSource: 'tradingview',
        market: 'JP_STOCK',
        timeframe: 'D',
        status: 'imported',
        metrics: null,
        tradeSummary: null,
        importFiles: [],
        importParsedSummaries: [],
        comparisonDiff: null,
        strategy: null,
        internalBacktestContext: null,
      }),
    ).rejects.toThrow('ai_provider_failed(local_llm): provider failed');
    expect(provider.generateBacktestSummary).toHaveBeenCalledTimes(1);
    expect(stubProvider.generateBacktestSummary).toHaveBeenCalledTimes(0);
  });

  it('throws provider error for pine generation when provider fails', async () => {
    const provider = createProvider('fail');
    const stubProvider = createStubProvider();

    const service = new HomeAiService(provider, stubProvider);
    await expect(
      service.generatePineScript({
        naturalLanguageSpec: 'buy above MA25, close below MA25 exit',
        normalizedRuleJson: null,
        targetMarket: 'JP_STOCK',
        targetTimeframe: 'D',
      }),
    ).rejects.toThrow('ai_provider_failed(local_llm): provider failed');
    expect(provider.generatePineScript).toHaveBeenCalledTimes(1);
    expect(stubProvider.generatePineScript).toHaveBeenCalledTimes(0);
  });

  it('preserves the provider failure as cause for rule rewrite failures', async () => {
    const provider = createProvider('ok');
    const stubProvider = createStubProvider();
    const providerFailure = new Error('local_llm natural_language_rule_rewrite returned invalid output: empty content');
    (provider.rewriteNaturalLanguageRuleDraft as ReturnType<typeof vi.fn>).mockRejectedValue(providerFailure);

    const service = new HomeAiService(provider, stubProvider);
    let thrown: unknown = null;
    try {
      await service.rewriteNaturalLanguageRuleDraft({
        strategyVersionId: 'ver-1',
        sourceBacktestId: 'bt-1',
        baseRule: 'buy above MA25',
        market: 'JP_STOCK',
        timeframe: 'D',
        improvementMemo: 'entry filterを改善する',
        metrics: null,
        aiSummary: null,
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe('natural_language_rule_rewrite_failed');
    expect((thrown as Error & { cause?: unknown }).cause).toBe(providerFailure);
    expect(provider.rewriteNaturalLanguageRuleDraft).toHaveBeenCalledTimes(1);
    expect(stubProvider.rewriteNaturalLanguageRuleDraft).toHaveBeenCalledTimes(0);
  });

  it('can fallback to stub when explicitly enabled', async () => {
    const provider = createProvider('fail');
    const stubProvider = createStubProvider();

    const service = new HomeAiService(provider, stubProvider, true);
    const result = await service.generateBacktestSummary({
      backtestId: 'bt-1',
      title: 'backtest',
      executionSource: 'tradingview',
      market: 'JP_STOCK',
      timeframe: 'D',
      status: 'imported',
      metrics: null,
      tradeSummary: null,
      importFiles: [],
      importParsedSummaries: [],
      comparisonDiff: null,
      strategy: null,
      internalBacktestContext: null,
    });

    expect(result.output.title).toBe('stub-backtest');
    expect(result.log.fallbackToStub).toBe(true);
    expect(result.log.escalationReason).toBe('provider_failed_fallback_to_stub');
    expect(provider.generateBacktestSummary).toHaveBeenCalledTimes(1);
    expect(stubProvider.generateBacktestSummary).toHaveBeenCalledTimes(1);
  });

  it('retries pine generation once and recovers with repair request context', async () => {
    const provider = createProvider('ok');
    const stubProvider = createStubProvider();
    const pineMock = provider.generatePineScript as ReturnType<typeof vi.fn>;
    pineMock.mockReset();
    pineMock.mockImplementation(async (context: any) => {
      if (!context?.repairRequest) {
        return {
          normalizedRuleJson: {},
          generatedScript: 'strategy("missing-version", overlay=true)',
          warnings: [],
          assumptions: [],
          status: 'generated',
          modelName: 'local-model',
          promptVersion: 'v1',
        };
      }
      return {
        normalizedRuleJson: {},
        generatedScript: '//@version=6\nstrategy("repaired", overlay=true)',
        warnings: ['repaired_once'],
        assumptions: [],
        status: 'generated',
        modelName: 'local-model',
        promptVersion: 'v1',
      };
    });

    const service = new HomeAiService(provider, stubProvider);
    const result = await service.generatePineScript(
      {
        naturalLanguageSpec: 'buy above MA25, close below MA25 exit',
        normalizedRuleJson: null,
        targetMarket: 'JP_STOCK',
        targetTimeframe: 'D',
      },
      { maxRepairAttempts: 2, validateOutput: assessGeneratedPineScript },
    );

    expect(result.output.status).toBe('generated');
    expect(result.output.repairAttempts).toBe(1);
    expect(result.output.generatedScript).toContain('//@version=6');
    expect(result.log.retryCount).toBe(1);
    expect(provider.generatePineScript).toHaveBeenCalledTimes(2);
  });

  it('repairs failed LLM Pine output without deterministic fallback', async () => {
    const provider = createProvider('ok');
    const stubProvider = createStubProvider();
    const pineMock = provider.generatePineScript as ReturnType<typeof vi.fn>;
    pineMock.mockReset();
    pineMock.mockImplementation(async (context: any) => {
      if (!context?.repairRequest) {
        return {
          normalizedRuleJson: {},
          generatedScript: null,
          warnings: ['LLM Pine生成のJSONを解析できませんでした。修復リトライを試みます。'],
          assumptions: [],
          status: 'failed',
          failureReason: 'provider_invalid_response',
          invalidReasonCodes: ['provider_invalid_response', 'malformed_json'],
          modelName: 'local-model',
          promptVersion: 'v1',
        };
      }
      return {
        normalizedRuleJson: {},
        generatedScript: '//@version=6\nstrategy("llm-repaired", overlay=true)',
        warnings: [],
        assumptions: ['修復後の Pine Script を使用します。'],
        status: 'generated',
        modelName: 'local-model',
        promptVersion: 'v1',
      };
    });

    const service = new HomeAiService(provider, stubProvider);
    const result = await service.generatePineScript(
      {
        naturalLanguageSpec: 'SMA25とSMA75のクロスで売買する',
        normalizedRuleJson: null,
        targetMarket: 'JP_STOCK',
        targetTimeframe: 'D',
      },
      { maxRepairAttempts: 2, validateOutput: assessGeneratedPineScript },
    );

    expect(result.output.status).toBe('generated');
    expect(result.output.generatedScript).toContain('llm-repaired');
    expect(result.output.repairAttempts).toBe(1);
    expect(result.output.warnings).toContain('Pine生成結果の検証に失敗したため、修復リトライ1回目を実行しました。');
    expect(provider.generatePineScript).toHaveBeenCalledTimes(2);
    expect(stubProvider.generatePineScript).toHaveBeenCalledTimes(0);
    expect((pineMock.mock.calls[1][0] as any).repairRequest.invalidReasonCodes).toContain(
      'provider_invalid_response',
    );
  });

  it('repairs reviewer error Pine output within the existing retry budget', async () => {
    const provider = createProvider('ok');
    const stubProvider = createStubProvider();
    const pineMock = provider.generatePineScript as ReturnType<typeof vi.fn>;
    pineMock.mockReset();
    pineMock.mockImplementation(async (context: any) => {
      if (!context?.repairRequest) {
        return {
          normalizedRuleJson: {},
          generatedScript:
            '//@version=6\nstrategy("bad", overlay=true)\nsetupCondition = close < ta.sma(close, 50)\ntriggerCondition = ta.crossover(close, ta.vwap(hlc3))\nentryCondition = setupCondition and triggerCondition\nif entryCondition and strategy.position_size == 0\n    strategy.entry("Long", strategy.long)',
          warnings: [],
          assumptions: [],
          status: 'generated',
          modelName: 'local-model',
          promptVersion: 'v1',
        };
      }
      return {
        normalizedRuleJson: {},
        generatedScript:
          '//@version=6\nstrategy("repaired", overlay=true)\nvar bool setupActive = false\nma50 = ta.sma(close, 50)\nvwapValue = ta.vwap(hlc3)\nsetupCondition = close < ma50\ntriggerCondition = ta.crossover(close, vwapValue)\nif strategy.position_size == 0 and setupCondition\n    setupActive := true\nentryCondition = setupActive and triggerCondition\nif entryCondition and strategy.position_size == 0\n    strategy.entry("Long", strategy.long)\n    setupActive := false\nplot(ma50)',
        warnings: ['reviewer_repaired'],
        assumptions: [],
        status: 'generated',
        modelName: 'local-model',
        promptVersion: 'v1',
      };
    });

    const service = new HomeAiService(provider, stubProvider);
    const result = await service.generatePineScript(
      {
        naturalLanguageSpec: 'MA50 below setup then VWAP trigger',
        normalizedRuleJson: null,
        targetMarket: 'JP_STOCK',
        targetTimeframe: 'D',
      },
      { maxRepairAttempts: 2, validateOutput: assessGeneratedPineScript },
    );

    expect(result.output.status).toBe('generated');
    expect(result.output.generatedScript).toContain('var bool setupActive = false');
    expect(result.output.generatedScript).not.toContain('setupCondition and triggerCondition');
    expect(result.output.repairAttempts).toBe(1);
    expect(result.output.reviewerSummary?.error_count).toBe(0);
    expect(result.output.warnings).toContain('Pine reviewer の指摘により、修復リトライ1回目を実行しました。');
    expect(provider.generatePineScript).toHaveBeenCalledTimes(2);
    expect((pineMock.mock.calls[1][0] as any).repairRequest.failureReason).toBe('pine_review_needs_repair');
    expect((pineMock.mock.calls[1][0] as any).repairRequest.invalidReasonCodes).toContain(
      'reviewer_setup_trigger_same_bar',
    );
  });

  it('repairs when provider reviewer reports a blocking error issue', async () => {
    const provider = createProvider('ok');
    const stubProvider = createStubProvider();
    const pineMock = provider.generatePineScript as ReturnType<typeof vi.fn>;
    const reviewMock = provider.reviewPineScript as ReturnType<typeof vi.fn>;
    pineMock.mockReset();
    reviewMock.mockReset();
    pineMock.mockImplementation(async (context: any) => {
      if (!context?.repairRequest) {
        return {
          normalizedRuleJson: {},
          generatedScript:
            '//@version=6\nstrategy("provider-reviewed", overlay=true)\nma50 = ta.sma(close, 50)\nif close > ma50 and strategy.position_size == 0\n    strategy.entry("Long", strategy.long)\nplot(ma50, color=color.green)',
          warnings: [],
          assumptions: [],
          status: 'generated',
          modelName: 'local-model',
          promptVersion: 'v1',
        };
      }
      return {
        normalizedRuleJson: {},
        generatedScript:
          '//@version=6\nstrategy("provider-repaired", overlay=true)\nma50 = ta.sma(close, 50)\nif close > ma50 and strategy.position_size == 0\n    strategy.entry("Long", strategy.long)\nplot(ma50, color=color.green)',
        warnings: [],
        assumptions: [],
        status: 'generated',
        modelName: 'local-model',
        promptVersion: 'v1',
      };
    });
    reviewMock.mockImplementation(async (context: any) => {
      if (context.repairAttempt === 0) {
        return {
          schema_name: 'pine_review_result',
          schema_version: '1.0',
          status: 'needs_repair',
          issues: [
            {
              code: 'entry_guard_risk',
              severity: 'error',
              message: 'Provider reviewer detected an unguarded entry.',
              repair_hint: 'Guard strategy.entry with strategy.position_size == 0.',
              repairable: true,
            },
          ],
          summary: {
            issue_count: 1,
            error_count: 1,
            warning_count: 0,
            repairable_issue_count: 1,
          },
        };
      }
      return createPassingPineReview();
    });

    const service = new HomeAiService(provider, stubProvider);
    const result = await service.generatePineScript(
      {
        naturalLanguageSpec: 'buy above MA50',
        normalizedRuleJson: null,
        targetMarket: 'JP_STOCK',
        targetTimeframe: 'D',
      },
      { maxRepairAttempts: 2, validateOutput: assessGeneratedPineScript },
    );

    expect(result.output.status).toBe('generated');
    expect(result.output.generatedScript).toContain('provider-repaired');
    expect(result.output.repairAttempts).toBe(1);
    expect(result.output.reviewerSummary?.error_count).toBe(0);
    expect(provider.generatePineScript).toHaveBeenCalledTimes(2);
    expect(reviewMock).toHaveBeenCalledTimes(2);
    expect((pineMock.mock.calls[1][0] as any).repairRequest.failureReason).toBe('pine_review_needs_repair');
    expect((pineMock.mock.calls[1][0] as any).repairRequest.invalidReasonCodes).toContain(
      'reviewer_entry_guard_risk',
    );
    expect((pineMock.mock.calls[1][0] as any).repairRequest.reviewIssues).toEqual([
      expect.objectContaining({
        code: 'entry_guard_risk',
        severity: 'error',
        repair_hint: 'Guard strategy.entry with strategy.position_size == 0.',
      }),
    ]);
    expect((pineMock.mock.calls[1][0] as any).repairRequest.reviewIssues[0].repair_template).toContain(
      'strategy.position_size == 0',
    );
  });

  it('selects only top-priority repairable reviewer issues for repair context', async () => {
    const provider = createProvider('ok');
    const stubProvider = createStubProvider();
    const pineMock = provider.generatePineScript as ReturnType<typeof vi.fn>;
    const reviewMock = provider.reviewPineScript as ReturnType<typeof vi.fn>;
    pineMock.mockReset();
    reviewMock.mockReset();
    pineMock.mockImplementation(async (context: any) => ({
      normalizedRuleJson: {},
      generatedScript: context?.repairRequest
        ? '//@version=6\nstrategy("selected-repaired", overlay=true)\nif close > ta.sma(close, 20) and strategy.position_size == 0\n    strategy.entry("Long", strategy.long)\nplot(close)'
        : '//@version=6\nstrategy("selected", overlay=true)\nif close > ta.sma(close, 20) and strategy.position_size == 0\n    strategy.entry("Long", strategy.long)\nplot(close)',
      warnings: [],
      assumptions: [],
      status: 'generated',
      modelName: 'local-model',
      promptVersion: 'v1',
    }));
    reviewMock.mockImplementation(async (context: any) => {
      if (context.repairAttempt > 0) {
        return createPassingPineReview();
      }
      return {
        schema_name: 'pine_review_result',
        schema_version: '1.0',
        status: 'needs_repair',
        issues: [
          {
            code: 'setup_trigger_same_bar',
            severity: 'error',
            message: 'Setup and trigger are on the same bar.',
            repair_hint: 'Use setupActive state.',
            repairable: true,
          },
          {
            code: 'unsupported_function_alias',
            severity: 'error',
            message: 'Unsupported cross alias.',
            repair_hint: 'Use ta.crossover or ta.crossunder.',
            repairable: true,
          },
          {
            code: 'unsupported_function_alias',
            severity: 'error',
            message: 'Duplicate unsupported cross alias.',
            repair_hint: 'Duplicate hint must be ignored.',
            repairable: true,
          },
          {
            code: 'long_only_violation',
            severity: 'error',
            message: 'Short entry in long-only strategy.',
            repair_hint: 'Remove short-side entries.',
            repairable: true,
          },
          {
            code: 'entry_guard_risk',
            severity: 'error',
            message: 'Entry guard missing.',
            repair_hint: 'Guard strategy.entry with strategy.position_size == 0.',
            repairable: true,
          },
          {
            code: 'narrative_comment',
            severity: 'error',
            message: 'Readability issue.',
            repair_hint: 'Remove narrative comments.',
            repairable: true,
          },
          {
            code: 'unsupported_adx_function',
            severity: 'error',
            message: 'Unsupported ADX.',
            repair_hint: 'Use ta.dmi tuple output.',
            repairable: false,
          },
        ],
        summary: {
          issue_count: 7,
          error_count: 7,
          warning_count: 0,
          repairable_issue_count: 6,
        },
      };
    });

    const service = new HomeAiService(provider, stubProvider);
    const result = await service.generatePineScript(
      {
        naturalLanguageSpec: 'buy above MA20',
        normalizedRuleJson: null,
        targetMarket: 'JP_STOCK',
        targetTimeframe: 'D',
      },
      { maxRepairAttempts: 2, validateOutput: assessGeneratedPineScript },
    );

    expect(result.output.status).toBe('generated');
    expect(provider.generatePineScript).toHaveBeenCalledTimes(2);
    expect((pineMock.mock.calls[1][0] as any).repairRequest.reviewIssues).toEqual([
      expect.objectContaining({
        code: 'unsupported_function_alias',
        severity: 'error',
        repair_hint: 'Use ta.crossover or ta.crossunder.',
      }),
      expect.objectContaining({
        code: 'long_only_violation',
        severity: 'error',
        repair_hint: 'Remove short-side entries.',
      }),
      expect.objectContaining({
        code: 'entry_guard_risk',
        severity: 'error',
        repair_hint: 'Guard strategy.entry with strategy.position_size == 0.',
      }),
    ]);
    expect((pineMock.mock.calls[1][0] as any).repairRequest.reviewIssues).toHaveLength(3);
    expect(JSON.stringify((pineMock.mock.calls[1][0] as any).repairRequest.reviewIssues)).not.toContain(
      'narrative_comment',
    );
    expect(JSON.stringify((pineMock.mock.calls[1][0] as any).repairRequest.reviewIssues)).not.toContain(
      'unsupported_adx_function',
    );
  });

  it('adds targeted repair templates to selected repair issues', async () => {
    const provider = createProvider('ok');
    const stubProvider = createStubProvider();
    const pineMock = provider.generatePineScript as ReturnType<typeof vi.fn>;
    const reviewMock = provider.reviewPineScript as ReturnType<typeof vi.fn>;
    pineMock.mockReset();
    reviewMock.mockReset();
    pineMock.mockImplementation(async (context: any) => ({
      normalizedRuleJson: {},
      generatedScript: context?.repairRequest
        ? '//@version=6\nstrategy("template repaired", overlay=true)\natrValue = ta.atr(14)\nvar float entryAtr = na\nif close > ta.sma(close, 20) and strategy.position_size == 0\n    strategy.entry("Long", strategy.long)\nif strategy.position_size > 0 and strategy.position_size[1] == 0\n    entryAtr := atrValue\nif strategy.position_size > 0 and not na(entryAtr)\n    stopLossPrice = strategy.position_avg_price - entryAtr * 2\n    strategy.exit("Stop Loss", "Long", stop=stopLossPrice)'
        : '//@version=6\nstrategy("template source", overlay=true)\natrValue = ta.atr(14)\nif close > ta.sma(close, 20)\n    strategy.entry("Long", strategy.long)\nif strategy.position_size > 0\n    stopLossPrice = strategy.position_avg_price - atrValue * 2\n    strategy.exit("Stop Loss", "Long", stop=stopLossPrice)',
      warnings: [],
      assumptions: [],
      status: 'generated',
      modelName: 'local-model',
      promptVersion: 'v1',
    }));
    reviewMock.mockImplementation(async (context: any) => {
      if (context.repairAttempt > 0) {
        return createPassingPineReview();
      }
      return {
        schema_name: 'pine_review_result',
        schema_version: '1.0',
        status: 'needs_repair',
        issues: [
          {
            code: 'entry_time_atr_not_persisted',
            severity: 'error',
            message: 'ATR is not persisted at entry.',
            repair_hint: 'Persist entry ATR.',
            repairable: true,
          },
          {
            code: 'stop_order_guard_risk',
            severity: 'error',
            message: 'Stop order guard is missing.',
            repair_hint: 'Guard stop order.',
            repairable: true,
          },
          {
            code: 'entry_guard_risk',
            severity: 'error',
            message: 'Entry guard is missing.',
            repair_hint: 'Guard entry order.',
            repairable: true,
          },
        ],
        summary: {
          issue_count: 3,
          error_count: 3,
          warning_count: 0,
          repairable_issue_count: 3,
        },
      };
    });

    const service = new HomeAiService(provider, stubProvider);
    await service.generatePineScript(
      {
        naturalLanguageSpec: 'Entry-time ATR stop',
        normalizedRuleJson: null,
        targetMarket: 'JP_STOCK',
        targetTimeframe: 'D',
      },
      { maxRepairAttempts: 2, validateOutput: assessGeneratedPineScript },
    );

    const repairIssues = (pineMock.mock.calls[1][0] as any).repairRequest.reviewIssues;
    const atrIssue = repairIssues.find((issue: any) => issue.code === 'entry_time_atr_not_persisted');
    const stopIssue = repairIssues.find((issue: any) => issue.code === 'stop_order_guard_risk');
    const entryIssue = repairIssues.find((issue: any) => issue.code === 'entry_guard_risk');
    expect(atrIssue.repair_template).toContain('var float entryAtr = na');
    expect(atrIssue.repair_template).toContain('strategy.position_size > 0 and strategy.position_size[1] == 0');
    expect(stopIssue.repair_template).toContain('not na(stopLossPrice)');
    expect(stopIssue.repair_template).toContain('strategy.position_size > 0');
    expect(entryIssue.repair_template).toContain('strategy.position_size == 0');
  });

  it('succeeds without repair when reviewer returns warning-only issues', async () => {
    const provider = createProvider('ok');
    const stubProvider = createStubProvider();
    const reviewMock = provider.reviewPineScript as ReturnType<typeof vi.fn>;
    reviewMock.mockReset();
    reviewMock.mockResolvedValue({
      schema_name: 'pine_review_result',
      schema_version: '1.0',
      status: 'pass',
      issues: [
        {
          code: 'narrative_comment',
          severity: 'warning',
          message: 'Comment is verbose.',
          repair_hint: 'Keep comments short when convenient.',
          repairable: true,
        },
      ],
      summary: {
        issue_count: 1,
        error_count: 0,
        warning_count: 1,
        repairable_issue_count: 1,
      },
    });

    const service = new HomeAiService(provider, stubProvider);
    const result = await service.generatePineScript(
      {
        naturalLanguageSpec: 'buy above MA50',
        normalizedRuleJson: null,
        targetMarket: 'JP_STOCK',
        targetTimeframe: 'D',
      },
      { maxRepairAttempts: 2, validateOutput: assessGeneratedPineScript },
    );

    expect(result.output.status).toBe('generated');
    expect(result.output.repairAttempts).toBe(0);
    expect(provider.generatePineScript).toHaveBeenCalledTimes(1);
    expect(result.output.invalidReasonCodes).toEqual([]);
    expect(result.output.reviewerSummary?.warning_count).toBe(1);
  });

  it('does not repair priority-zero below-vs-crossunder reviewer nuance', async () => {
    const provider = createProvider('ok');
    const stubProvider = createStubProvider();
    const pineMock = provider.generatePineScript as ReturnType<typeof vi.fn>;
    const reviewMock = provider.reviewPineScript as ReturnType<typeof vi.fn>;
    pineMock.mockReset();
    reviewMock.mockReset();
    pineMock.mockImplementation(async (context: any) => {
      return {
        normalizedRuleJson: {},
        generatedScript:
          '//@version=6\nstrategy("below mismatch", overlay=true)\nma50 = ta.sma(close, 50)\nexitCondition = ta.crossunder(close, ma50)\nif close > ma50 and strategy.position_size == 0\n    strategy.entry("Long", strategy.long)\nif strategy.position_size > 0 and exitCondition\n    strategy.close("Long")\nplot(ma50)',
        warnings: [],
        assumptions: [],
        status: 'generated',
        modelName: 'local-model',
        promptVersion: 'v1',
      };
    });
    reviewMock.mockImplementation(async (context: any) => {
      if (context.repairAttempt === 0) {
        return {
          schema_name: 'pine_review_result',
          schema_version: '1.0',
          status: 'needs_repair',
          issues: [
            {
              code: 'below_vs_crossunder_mismatch',
              severity: 'error',
              message: 'The input says below, not crossunder.',
              repair_hint: 'Use close < ma50 for a state-based exit instead of ta.crossunder(close, ma50).',
              repairable: true,
            },
          ],
          summary: {
            issue_count: 1,
            error_count: 1,
            warning_count: 0,
            repairable_issue_count: 1,
          },
        };
      }
      return createPassingPineReview();
    });

    const service = new HomeAiService(provider, stubProvider);
    const result = await service.generatePineScript(
      {
        naturalLanguageSpec: '終値が50日移動平均を下回った場合に決済します。',
        normalizedRuleJson: null,
        targetMarket: 'JP_STOCK',
        targetTimeframe: 'D',
      },
      { maxRepairAttempts: 2, validateOutput: assessGeneratedPineScript },
    );

    expect(result.output.status).toBe('generated');
    expect(result.output.generatedScript).toContain('ta.crossunder(close, ma50)');
    expect(provider.generatePineScript).toHaveBeenCalledTimes(1);
    expect(result.output.invalidReasonCodes).toEqual([]);
  });

  it('falls back to deterministic reviewer when provider reviewer fails without leaking details', async () => {
    const provider = createProvider('ok');
    const stubProvider = createStubProvider();
    const reviewMock = provider.reviewPineScript as ReturnType<typeof vi.fn>;
    reviewMock.mockRejectedValue(new Error('http://secret-reviewer.local model=secret-model stack trace details'));

    const service = new HomeAiService(provider, stubProvider);
    const result = await service.generatePineScript(
      {
        naturalLanguageSpec: 'buy above MA50',
        normalizedRuleJson: null,
        targetMarket: 'JP_STOCK',
        targetTimeframe: 'D',
      },
      { maxRepairAttempts: 1, validateOutput: assessGeneratedPineScript },
    );

    expect(result.output.status).toBe('generated');
    expect(result.output.reviewerSummary?.error_count).toBe(0);
    expect(result.output.reviewerSummary?.warning_count).toBe(1);
    expect(JSON.stringify(result.output)).not.toContain('http://secret-reviewer.local');
    expect(JSON.stringify(result.output)).not.toContain('secret-model');
    expect(reviewMock).toHaveBeenCalledTimes(1);
  });

  it('keeps malformed provider reviewer output non-blocking when deterministic reviewer passes', async () => {
    const provider = createProvider('ok');
    const stubProvider = createStubProvider();
    const pineMock = provider.generatePineScript as ReturnType<typeof vi.fn>;
    const reviewMock = provider.reviewPineScript as ReturnType<typeof vi.fn>;
    pineMock.mockReset();
    reviewMock.mockRejectedValue(new Error('local reviewer returned malformed_json from private endpoint'));
    pineMock.mockResolvedValue({
      normalizedRuleJson: {},
      generatedScript:
        '//@version=6\nstrategy("provider review invalid", overlay=true)\nma50 = ta.sma(close, 50)\nif close > ma50 and strategy.position_size == 0\n    strategy.entry("Long", strategy.long)\nplot(ma50)',
      warnings: [],
      assumptions: [],
      status: 'generated',
      modelName: 'local-model',
      promptVersion: 'v1',
    });

    const service = new HomeAiService(provider, stubProvider);
    const result = await service.generatePineScript(
      {
        naturalLanguageSpec: 'buy above MA50',
        normalizedRuleJson: null,
        targetMarket: 'JP_STOCK',
        targetTimeframe: 'D',
      },
      { maxRepairAttempts: 2, validateOutput: assessGeneratedPineScript },
    );

    expect(result.output.status).toBe('generated');
    expect(result.output.repairAttempts).toBe(0);
    expect(result.output.reviewerSummary?.warning_count).toBe(1);
    expect(result.output.invalidReasonCodes).toEqual([]);
    expect(provider.generatePineScript).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result.output)).not.toContain('private endpoint');
  });

  it('repairs deterministic blocking issue even when provider reviewer fails', async () => {
    const provider = createProvider('ok');
    const stubProvider = createStubProvider();
    const pineMock = provider.generatePineScript as ReturnType<typeof vi.fn>;
    const reviewMock = provider.reviewPineScript as ReturnType<typeof vi.fn>;
    pineMock.mockReset();
    reviewMock.mockRejectedValue(new Error('provider_invalid_response with stack trace and token'));
    pineMock.mockImplementation(async (context: any) => {
      if (context?.repairRequest) {
        return {
          normalizedRuleJson: {},
          generatedScript:
            '//@version=6\nstrategy("deterministic repaired", overlay=true)\nma50 = ta.sma(close, 50)\nif close > ma50 and strategy.position_size == 0\n    strategy.entry("Long", strategy.long)\nplot(ma50)',
          warnings: [],
          assumptions: [],
          status: 'generated',
          modelName: 'local-model',
          promptVersion: 'v1',
        };
      }
      return {
        normalizedRuleJson: {},
        generatedScript:
          '//@version=6\nstrategy("deterministic bad", overlay=true)\nma50 = ta.sma(close, 50)\nif close > ma50\n    strategy.entry("Long", strategy.long)\nplot(ma50)',
        warnings: [],
        assumptions: [],
        status: 'generated',
        modelName: 'local-model',
        promptVersion: 'v1',
      };
    });

    const service = new HomeAiService(provider, stubProvider);
    const result = await service.generatePineScript(
      {
        naturalLanguageSpec: 'buy above MA50',
        normalizedRuleJson: null,
        targetMarket: 'JP_STOCK',
        targetTimeframe: 'D',
      },
      { maxRepairAttempts: 2, validateOutput: assessGeneratedPineScript },
    );

    expect(result.output.status).toBe('generated');
    expect(result.output.repairAttempts).toBe(1);
    expect(provider.generatePineScript).toHaveBeenCalledTimes(2);
    expect((pineMock.mock.calls[1][0] as any).repairRequest.invalidReasonCodes).toContain(
      'reviewer_entry_guard_risk',
    );
    expect((pineMock.mock.calls[1][0] as any).repairRequest.reviewIssues).toEqual([
      expect.objectContaining({
        code: 'entry_guard_risk',
        severity: 'error',
        repair_hint:
          'Call strategy.entry only inside a flat-position guard such as strategy.position_size == 0 for long-only no-pyramiding strategies.',
      }),
    ]);
    expect(JSON.stringify(result.output)).not.toContain('stack trace');
    expect(JSON.stringify(result.output)).not.toContain('token');
  });

  it('fails with sanitized reviewer metadata when reviewer issues remain after retry limit', async () => {
    const provider = createProvider('ok');
    const stubProvider = createStubProvider();
    const pineMock = provider.generatePineScript as ReturnType<typeof vi.fn>;
    pineMock.mockReset();
    pineMock.mockResolvedValue({
      normalizedRuleJson: {},
      generatedScript:
        '//@version=6\nstrategy("bad", overlay=true)\nsetupCondition = close < ta.sma(close, 50)\ntriggerCondition = ta.crossover(close, ta.vwap(hlc3))\nentryCondition = setupCondition and triggerCondition\nif entryCondition and strategy.position_size == 0\n    strategy.entry("Long", strategy.long)',
      warnings: [],
      assumptions: [],
      status: 'generated',
      modelName: 'local-model',
      promptVersion: 'v1',
    });

    const service = new HomeAiService(provider, stubProvider);
    const result = await service.generatePineScript(
      {
        naturalLanguageSpec: 'MA50 below setup then VWAP trigger',
        normalizedRuleJson: null,
        targetMarket: 'JP_STOCK',
        targetTimeframe: 'D',
      },
      { maxRepairAttempts: 0, validateOutput: assessGeneratedPineScript },
    );

    expect(result.output.status).toBe('failed');
    expect(result.output.failureReason).toBe('pine_review_needs_repair');
    expect(result.output.invalidReasonCodes).toContain('reviewer_setup_trigger_same_bar');
    expect(result.output.reviewerSummary?.error_count).toBe(1);
    expect(result.output.reviewerIssues).toEqual([
      {
        code: 'setup_trigger_same_bar',
        severity: 'error',
        repair_hint: 'Use setupActive state instead of requiring setup and trigger on the same bar.',
      },
    ]);
    expect(JSON.stringify(result.output)).not.toContain('endpoint');
    expect(provider.generatePineScript).toHaveBeenCalledTimes(1);
  });

  it('does not exceed configured max repair attempts for reviewer repair', async () => {
    const provider = createProvider('ok');
    const stubProvider = createStubProvider();
    const pineMock = provider.generatePineScript as ReturnType<typeof vi.fn>;
    const reviewMock = provider.reviewPineScript as ReturnType<typeof vi.fn>;
    pineMock.mockReset();
    reviewMock.mockReset();
    pineMock.mockResolvedValue({
      normalizedRuleJson: {},
      generatedScript: '//@version=6\nstrategy("still bad", overlay=true)\nstrategy.entry("Long", strategy.long)',
      warnings: [],
      assumptions: [],
      status: 'generated',
      modelName: 'local-model',
      promptVersion: 'v1',
    });
    reviewMock.mockResolvedValue({
      schema_name: 'pine_review_result',
      schema_version: '1.0',
      status: 'needs_repair',
      issues: [
        {
          code: 'entry_guard_risk',
          severity: 'error',
          message: 'Entry guard missing.',
          repair_hint: 'Guard strategy.entry with strategy.position_size == 0.',
          repairable: true,
        },
      ],
      summary: {
        issue_count: 1,
        error_count: 1,
        warning_count: 0,
        repairable_issue_count: 1,
      },
    });

    const service = new HomeAiService(provider, stubProvider);
    const result = await service.generatePineScript(
      {
        naturalLanguageSpec: 'buy above MA50',
        normalizedRuleJson: null,
        targetMarket: 'JP_STOCK',
        targetTimeframe: 'D',
      },
      { maxRepairAttempts: 1, validateOutput: assessGeneratedPineScript },
    );

    expect(result.output.status).toBe('failed');
    expect(result.output.repairAttempts).toBe(1);
    expect(result.log.retryCount).toBe(1);
    expect(provider.generatePineScript).toHaveBeenCalledTimes(2);
    expect(reviewMock).toHaveBeenCalledTimes(2);
  });

  it('fails when pine repair reaches the increased retry limit', async () => {
    const provider = createProvider('ok');
    const stubProvider = createStubProvider();
    const pineMock = provider.generatePineScript as ReturnType<typeof vi.fn>;
    pineMock.mockReset();
    pineMock.mockResolvedValue({
      normalizedRuleJson: {},
      generatedScript: 'strategy("still-missing-version", overlay=true)',
      warnings: [],
      assumptions: [],
      status: 'generated',
      modelName: 'local-model',
      promptVersion: 'v1',
    });

    const service = new HomeAiService(provider, stubProvider);
    const result = await service.generatePineScript(
      {
        naturalLanguageSpec: 'buy above MA25, close below MA25 exit',
        normalizedRuleJson: null,
        targetMarket: 'JP_STOCK',
        targetTimeframe: 'D',
      },
      { maxRepairAttempts: 3, validateOutput: assessGeneratedPineScript },
    );

    expect(result.output.status).toBe('failed');
    expect(result.output.repairAttempts).toBe(3);
    expect(result.output.failureReason).toContain('version');
    expect(result.log.retryCount).toBe(3);
    expect(provider.generatePineScript).toHaveBeenCalledTimes(4);
  });
});
