import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function createBacktestContext() {
  return {
    backtestId: 'bt-1',
    title: 'Backtest A',
    executionSource: 'csv_import',
    market: 'JP_STOCK',
    timeframe: 'D',
    status: 'completed',
    metrics: {
      totalTrades: 10,
      winRate: 45.2,
      profitFactor: 1.12,
      maxDrawdown: -8.3,
      netProfit: 1234,
      periodFrom: '2026-01-01',
      periodTo: '2026-03-31',
    },
    tradeSummary: {
      parsedImportCount: 1,
      averageTotalTrades: 10,
      averageWinRate: 45.2,
      averageProfitFactor: 1.12,
      averageNetProfit: 1234,
      bestNetProfit: 1234,
      worstNetProfit: 1234,
    },
    importFiles: [],
    importParsedSummaries: [],
    comparisonDiff: null,
    strategy: {
      strategyId: 'st-1',
      strategyVersionId: 'ver-1',
      naturalLanguageRule: 'Buy when trend is positive',
      generatedPine: null,
    },
  };
}

function createDailyContext() {
  return {
    summaryType: 'latest' as const,
    date: '2026-04-26',
    marketSnapshotCount: 3,
    alertCount: 2,
    referenceCount: 4,
  };
}

async function loadLocalProvider(fetchImpl: ReturnType<typeof vi.fn>) {
  vi.resetModules();

  vi.stubGlobal('fetch', fetchImpl);

  vi.doMock('../src/env', () => ({
    env: {
      HOME_AI_PROVIDER: 'local_llm',
      LOCAL_LLM_ENDPOINT: 'http://localhost:11434',
      PRIMARY_LOCAL_MODEL: 'gemma4-ns',
      FALLBACK_API_ENDPOINT: 'https://api.openai.com/v1',
      FALLBACK_API_MODEL: 'gpt-5-mini',
      FALLBACK_API_KEY: 'test-key',
    },
  }));

  vi.doMock('../src/ai/local-llm-adapter', () => {
    class LocalLlmAdapter {
      async generateAlertSummary() {
        throw new Error('not used in this test');
      }
    }
    return { LocalLlmAdapter };
  });

  vi.doMock('../src/ai/fallback-api-adapter', () => {
    class FallbackApiAdapter {
      async generateAlertSummary() {
        throw new Error('not used in this test');
      }
    }
    return { FallbackApiAdapter };
  });

  const mod = await import('../src/ai/home-provider');
  return mod.createHomeAiProvider('local_llm');
}

describe('LocalLlmHomeAiProvider summary calls', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses /api/chat + think:false for backtest summary and reads message.content', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'gemma4-ns',
        done_reason: 'stop',
        message: {
          role: 'assistant',
          content: JSON.stringify({
            title: 'AI Backtest Review',
            conclusion: 'Overall acceptable with caveats.',
            good_points: ['PF above 1'],
            concern_points: ['Need more samples'],
            next_checks: ['Run another period split'],
            body_markdown: '## AI Backtest Review\n\nSummary body',
            overall_view: 'Provisional positive',
          }),
          thinking: 'internal',
        },
      }),
      text: async () => '',
    });

    const provider = await loadLocalProvider(fetchMock);
    const result = await provider.generateBacktestSummary(createBacktestContext());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:11434/api/chat');
    const body = JSON.parse(String(init.body));
    expect(body.stream).toBe(false);
    expect(body.think).toBe(false);
    expect(body.options.num_predict).toBe(1200);
    expect(result.title).toBe('AI Backtest Review');
    expect(result.bodyMarkdown).toContain('Summary body');
  });

  it('fails when content is empty and finish reason is length', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'gemma4-ns',
        done_reason: 'length',
        message: {
          role: 'assistant',
          content: '',
          thinking: 'only reasoning text',
        },
      }),
      text: async () => '',
    });

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const provider = await loadLocalProvider(fetchMock);

    await expect(provider.generateBacktestSummary(createBacktestContext())).rejects.toThrow(
      /finish_reason=length|empty content with finish_reason=length/,
    );

    expect(errorSpy).toHaveBeenCalled();
    expect(String(errorSpy.mock.calls[0][0])).toContain('"task_type":"backtest_summary"');
  });

  it('uses /api/chat + think:false for daily summary', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'gemma4-ns',
        done_reason: 'stop',
        message: {
          role: 'assistant',
          content: JSON.stringify({
            title: 'Daily AI Summary',
            highlights: [{ title: 'H1', summary: 'S1', reason: 'R1', confidence: 'medium' }],
            watch_items: ['Watch earnings'],
            market_context: { tone: 'neutral', summary: 'Range-bound market' },
          }),
        },
      }),
      text: async () => '',
    });

    const provider = await loadLocalProvider(fetchMock);
    const result = await provider.generateDailySummary(createDailyContext());

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:11434/api/chat');
    const body = JSON.parse(String(init.body));
    expect(body.think).toBe(false);
    expect(body.stream).toBe(false);
    expect(body.options.num_predict).toBe(1200);
    expect(result.title).toBe('Daily AI Summary');
  });
});
