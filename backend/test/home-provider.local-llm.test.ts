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

function createPineContext() {
  return {
    naturalLanguageSpec: 'Buy when close > sma(25), exit when close < sma(25)',
    normalizedRuleJson: {
      entry: ['close > sma(25)'],
      exit: ['close < sma(25)'],
    },
    targetMarket: 'JP_STOCK',
    targetTimeframe: 'D',
    regenerationInput: null,
    repairRequest: null,
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

  it('uses /api/chat + think:false for pine generation', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'gemma4-ns',
        done_reason: 'stop',
        message: {
          role: 'assistant',
          content: JSON.stringify({
            generated_script: '//@version=6\nstrategy("X", overlay=true)',
            warnings: [],
            assumptions: [],
            normalized_rule_json: { entry: ['close > sma(25)'], exit: ['close < sma(25)'] },
          }),
        },
      }),
      text: async () => '',
    });

    const provider = await loadLocalProvider(fetchMock);
    const result = await provider.generatePineScript(createPineContext());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:11434/api/chat');
    const body = JSON.parse(String(init.body));
    expect(body.stream).toBe(false);
    expect(body.think).toBe(false);
    expect(body.options.num_predict).toBe(1800);
    expect(body.messages[0].content).toContain('Return user-facing warnings and assumptions in Japanese');
    expect(body.messages[0].content).toContain('Keep generated_script as valid Pine Script');
    expect(body.messages[0].content).toContain('do not translate Pine code');
    expect(body.messages[1].content).toContain('<Japanese user-facing string>');
    expect(result.generatedScript).toContain('strategy("X"');
  });

  it('returns generated Pine from representative LLM-first envelope without deterministic fallback', async () => {
    const representativeScript = `//@version=6
strategy("Hokkyokusei LLM Generated Strategy", overlay=true)

ma25 = ta.sma(close, 25)
ma75 = ta.sma(close, 75)
volMa20 = ta.sma(volume, 20)
atr14 = ta.atr(14)

entryCondition = ta.crossover(ma25, ma75) and volume > volMa20 * 1.2
exitCondition = ta.crossunder(ma25, ma75) or close < ma25
stopPrice = strategy.position_avg_price - atr14 * 2

if entryCondition and strategy.position_size == 0
    strategy.entry("Long", strategy.long)

if strategy.position_size > 0
    strategy.exit("Stop", "Long", stop=stopPrice)

if exitCondition and strategy.position_size > 0
    strategy.close("Long")

plot(ma25)
plot(ma75)`;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'gemma4-ns',
        done_reason: 'stop',
        message: {
          role: 'assistant',
          content: JSON.stringify({
            generated_script: representativeScript,
            warnings: ['横ばい相場では取引を控える条件を簡易的に扱っています。'],
            assumptions: ['損切りはエントリーシグナル発生足の ATR(14) を基準にします。'],
            normalized_rule_json: { strategy_type: 'long_only', indicators: ['SMA25', 'SMA75', 'ATR14'] },
          }),
        },
      }),
      text: async () => '',
    });

    const provider = await loadLocalProvider(fetchMock);
    const result = await provider.generatePineScript({
      ...createPineContext(),
      naturalLanguageSpec:
        '日足チャートにおいて、SMA25がSMA75を上抜け、かつ出来高が過去20日平均の1.2倍を超えた場合に買い、ATR(14)の2倍で損切りする。',
    });

    expect(result.status).toBe('generated');
    expect(result.generatedScript).toContain('ta.crossover(ma25, ma75)');
    expect(result.generatedScript).toContain('strategy.exit("Stop", "Long", stop=stopPrice)');
    expect(result.warnings).toContain('横ばい相場では取引を控える条件を簡易的に扱っています。');
    expect(result.modelName).toBe('gemma4-ns');
  });

  it('does not silently fall back to deterministic Pine when LLM JSON is malformed', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'gemma4-ns',
        done_reason: 'stop',
        message: {
          role: 'assistant',
          content: 'not json',
        },
      }),
      text: async () => '',
    });

    const provider = await loadLocalProvider(fetchMock);
    const result = await provider.generatePineScript(createPineContext());

    expect(result.status).toBe('failed');
    expect(result.generatedScript).toBeNull();
    expect(result.failureReason).toBe('provider_invalid_response');
    expect(result.invalidReasonCodes).toContain('malformed_json');
    expect(result.warnings.join(' ')).toContain('JSONを解析できませんでした');
  });

  it('does not silently fall back to deterministic Pine when generated_script is missing', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'gemma4-ns',
        done_reason: 'stop',
        message: {
          role: 'assistant',
          content: JSON.stringify({
            warnings: ['日本語の警告'],
            assumptions: ['日本語の前提'],
            normalized_rule_json: {},
          }),
        },
      }),
      text: async () => '',
    });

    const provider = await loadLocalProvider(fetchMock);
    const result = await provider.generatePineScript(createPineContext());

    expect(result.status).toBe('failed');
    expect(result.generatedScript).toBeNull();
    expect(result.failureReason).toBe('provider_invalid_response');
    expect(result.invalidReasonCodes).toContain('generated_script_missing');
    expect(result.warnings.join(' ')).toContain('generated_script');
  });

  it('fails pine generation when content is empty and finish reason is length', async () => {
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

    await expect(provider.generatePineScript(createPineContext())).rejects.toThrow(
      /task_type=pine_generation|finish_reason=length|empty content with finish_reason=length/,
    );

    expect(errorSpy).toHaveBeenCalled();
    expect(String(errorSpy.mock.calls[0][0])).toContain('"task_type":"pine_generation"');
  });
});
