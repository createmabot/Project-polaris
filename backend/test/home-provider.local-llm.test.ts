import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assessGeneratedPineScript } from '../src/strategy/pine';

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

async function loadLocalProvider(fetchImpl: ReturnType<typeof vi.fn>, envOverrides: Record<string, unknown> = {}) {
  vi.resetModules();

  vi.stubGlobal('fetch', fetchImpl);

  vi.doMock('../src/env', () => ({
    env: {
      HOME_AI_PROVIDER: 'local_llm',
      LOCAL_LLM_ENDPOINT: 'http://localhost:11434',
      PRIMARY_LOCAL_MODEL: 'gemma4-ns',
      PINE_GENERATION_LOCAL_LLM_TIMEOUT_MS: 180000,
      FALLBACK_API_ENDPOINT: 'https://api.openai.com/v1',
      FALLBACK_API_MODEL: 'gpt-5-mini',
      FALLBACK_API_KEY: 'test-key',
      ...envOverrides,
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
            rule_refinement_candidates: [
              {
                title: 'Entry filter refinement',
                target_area: 'entry',
                rationale: 'Win rate needs review',
                change_summary: 'Add a measurable trend filter to the entry rule',
                entry_change: 'Only enter when close is above the 25-period moving average',
                exit_change: null,
                risk_change: 'Compare a fixed stop loss',
                validation_plan: 'Compare the refined rule with the baseline over the same period',
                expected_metric_effect: {
                  profit_factor: 'may improve',
                  win_rate: 'may improve',
                  max_drawdown: 'may decrease',
                  trade_count: 'may decrease',
                },
              },
            ],
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
    expect(body.messages[0].content).toContain('strategy refinement');
    expect(body.messages[0].content).toContain('問題の切り分け');
    expect(body.messages[0].content).toContain('改善仮説');
    expect(body.messages[0].content).toContain('自然言語ルール改善案');
    expect(body.messages[0].content).toContain('Pine修正依頼に入れるべきではない注意');
    expect(body.messages[0].content).toContain('next_checks');
    expect(body.messages[0].content).toContain('rule_refinement_candidates');
    expect(body.messages[0].content).toContain('overall_view');
    expect(body.messages[0].content).toContain('Do not frame strategy logic changes as revision_request drafts');
    expect(body.messages[0].content).toContain('Do not give direct buy or sell recommendations');
    expect(result.title).toBe('AI Backtest Review');
    expect(result.bodyMarkdown).toContain('### 問題の切り分け');
    expect(result.bodyMarkdown).toContain('### 改善仮説');
    expect(result.bodyMarkdown).toContain('### 次に試す検証案');
    expect(result.structuredJson.payload.rule_refinement_candidates?.[0]?.entry_change).toContain('25-period');
    expect(result.bodyMarkdown).toContain('### 自然言語ルール改善案');
    expect(result.bodyMarkdown).toContain('### Pine修正依頼に入れるべきではない注意');
    expect(result.structuredJson.schema_version).toBe('1.0');
    expect(result.structuredJson.payload.next_actions).toContain('Run another period split');
    expect(result.structuredJson.payload.overall_view).toBe('Provisional positive');
    expect(JSON.stringify(result)).not.toContain('raw CSV');
  });

  it('falls back to improvement-focused deterministic backtest review when local_llm JSON is invalid', async () => {
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
    const result = await provider.generateBacktestSummary({
      ...createBacktestContext(),
      metrics: {
        totalTrades: 8,
        winRate: 38,
        profitFactor: 0.82,
        maxDrawdown: -22,
        netProfit: -125000,
        periodFrom: '2026-01-01',
        periodTo: '2026-03-31',
      },
      tradeSummary: {
        parsedImportCount: 1,
        averageTotalTrades: 8,
        averageWinRate: 38,
        averageProfitFactor: 0.82,
        averageNetProfit: -125000,
        bestNetProfit: -125000,
        worstNetProfit: -125000,
      },
    });

    expect(result.structuredJson.schema_name).toBe('backtest_review_summary');
    expect(result.structuredJson.schema_version).toBe('1.0');
    expect(result.bodyMarkdown).toContain('### 問題の切り分け');
    expect(result.bodyMarkdown).toContain('### 改善仮説');
    expect(result.bodyMarkdown).toContain('### 次に試す検証案');
    expect(result.bodyMarkdown).toContain('### 自然言語ルール改善案');
    expect(result.bodyMarkdown).toContain('### Pine修正依頼に入れるべきではない注意');
    expect(result.structuredJson.payload.risks.join(' ')).toContain('統計的信頼性');
    expect(result.structuredJson.payload.risks.join(' ')).toContain('Profit Factor');
    expect(result.structuredJson.payload.risks.join(' ')).toContain('最大ドローダウン');
    expect(result.structuredJson.payload.next_actions.join(' ')).toContain('候補1');
    expect(result.structuredJson.payload.next_actions.join(' ')).toContain('validation scope');
    expect(result.structuredJson.payload.next_actions.join(' ')).toContain('検証期間延長');
    expect(result.structuredJson.payload.next_actions.join(' ')).toContain('stop loss');
    expect(result.structuredJson.payload.next_actions.join(' ')).not.toContain('条件緩和、検証期間延長、複数銘柄');
    expect(JSON.stringify(result)).not.toContain('取込間の最悪純利益');
    expect(JSON.stringify(result)).not.toContain('期間依存の振れ幅があります');
    expect(JSON.stringify(result)).toContain('複数CSV比較がないため、期間依存の評価は保留');
    expect(result.structuredJson.payload.overall_view).toContain('entry / exit / risk');
    expect(result.structuredJson.payload.rule_refinement_candidates?.[0]?.entry_change).not.toContain('、または');
    expect(JSON.stringify(result)).not.toContain('raw CSV');
    expect(JSON.stringify(result)).not.toContain('raw import text');
  });

  it('keeps cross-import net profit comparison only when multiple parsed imports exist', async () => {
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
    const result = await provider.generateBacktestSummary({
      ...createBacktestContext(),
      tradeSummary: {
        parsedImportCount: 2,
        averageTotalTrades: 12,
        averageWinRate: 42,
        averageProfitFactor: 0.92,
        averageNetProfit: -50000,
        bestNetProfit: 100000,
        worstNetProfit: -200000,
      },
      importParsedSummaries: [
        {
          importId: 'imp-1',
          fileName: 'a.csv',
          createdAt: '2026-04-01T00:00:00.000Z',
          totalTrades: 10,
          winRate: 45,
          profitFactor: 1.1,
          maxDrawdown: -10,
          netProfit: 100000,
          periodFrom: '2026-01-01',
          periodTo: '2026-03-31',
        },
        {
          importId: 'imp-2',
          fileName: 'b.csv',
          createdAt: '2026-04-02T00:00:00.000Z',
          totalTrades: 14,
          winRate: 39,
          profitFactor: 0.74,
          maxDrawdown: -18,
          netProfit: -200000,
          periodFrom: '2026-04-01',
          periodTo: '2026-06-30',
        },
      ],
    });

    const serialized = JSON.stringify(result);
    expect(serialized).toContain('取込間の最悪純利益');
    expect(serialized).toContain('期間依存の振れ幅があります');
    expect(serialized).not.toContain('複数CSV比較がないため、期間依存の評価は保留');
  });

  it('connects MACD strategy refinement candidates to the source indicator', async () => {
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
    const result = await provider.generateBacktestSummary({
      ...createBacktestContext(),
      title: 'MACDヒストグラム・モメンタム戦略 / CSV import',
      metrics: {
        totalTrades: 45,
        winRate: 38,
        profitFactor: 1.08,
        maxDrawdown: -12,
        netProfit: 80000,
        periodFrom: '2026-01-01',
        periodTo: '2026-03-31',
      },
      strategy: {
        strategyId: 'st-macd',
        strategyVersionId: 'ver-macd',
        naturalLanguageRule: 'MACD histogram momentum long entry when histogram increases',
        generatedPine: 'strategy("should not be quoted")',
      },
    });

    const candidates = result.structuredJson.payload.rule_refinement_candidates ?? [];
    const entryCandidate = candidates.find((candidate) => candidate.target_area === 'entry');
    expect(entryCandidate?.rationale).toContain('MACDヒストグラム');
    expect(entryCandidate?.change_summary).toContain('MACDヒストグラム');
    expect(entryCandidate?.entry_change).toContain('MACDヒストグラム');
    expect(entryCandidate?.entry_change).toContain('25日SMA');
    expect(entryCandidate?.entry_change).toContain('20日平均');
    expect(entryCandidate?.entry_change).not.toContain('、または');
    expect(JSON.stringify(result)).not.toContain('strategy("should not be quoted")');
    expect(JSON.stringify(result)).not.toContain('raw prompt');
    expect(JSON.stringify(result)).not.toContain('endpoint');
  });

  it('does not quote unsafe natural language rule text in deterministic backtest review', async () => {
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
    const unsafeRule = 'entry uses https://example.com/api and token=SECRET_VALUE and C:\\Users\\foo\\secret.txt';
    const result = await provider.generateBacktestSummary({
      ...createBacktestContext(),
      strategy: {
        strategyId: 'st-1',
        strategyVersionId: 'ver-1',
        naturalLanguageRule: unsafeRule,
        generatedPine: null,
      },
    });

    const serialized = JSON.stringify(result);
    expect(result.structuredJson.schema_version).toBe('1.0');
    expect(serialized).toContain('現行の自然言語ルール');
    expect(serialized).toContain('entry / exit / risk management');
    expect(serialized).not.toContain('https://example.com/api');
    expect(serialized).not.toContain('SECRET_VALUE');
    expect(serialized).not.toContain('C:\\Users\\foo\\secret.txt');
    expect(serialized).not.toContain(unsafeRule);
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
          content: '//@version=6\nstrategy("X", overlay=true)\nplot(close)',
        },
      }),
      text: async () => '',
    });

    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
    const provider = await loadLocalProvider(fetchMock);
    const result = await provider.generatePineScript(createPineContext());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(timeoutSpy).toHaveBeenCalledWith(180000);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:11434/api/chat');
    const body = JSON.parse(String(init.body));
    expect(body.stream).toBe(false);
    expect(body.think).toBe(false);
    expect(body.options.num_predict).toBe(1800);
    expect(body.messages[0].content).toContain('Return Pine Script text only');
    expect(body.messages[0].content).toContain('Do not return JSON');
    expect(body.messages[0].content).toContain('If normalized_strategy_spec is present');
    expect(body.messages[0].content).toContain('prefer normalized_strategy_spec');
    expect(body.messages[0].content).toContain('Do not omit measurable thresholds from normalized_strategy_spec');
    expect(body.messages[0].content).not.toContain('Return one strict JSON object only');
    expect(body.messages[0].content).not.toContain('generated_script value must contain Pine Script only');
    expect(body.messages[0].content).toContain('Start the response with //@version=6');
    expect(body.messages[0].content).toContain('Use long-only behavior by default');
    expect(body.messages[0].content).toContain('do not generate strategy.short entries');
    expect(body.messages[0].content).toContain('strategy.position_size == 0');
    expect(body.messages[0].content).toContain('strategy.position_size > 0');
    expect(body.messages[0].content).toContain('Submit strategy.exit on every bar while the position is open');
    expect(body.messages[0].content).toContain('Do not compute stop or limit prices from strategy.position_avg_price');
    expect(body.messages[0].content).toContain('When an ATR stop uses entry-time ATR');
    expect(body.messages[0].content).toContain('strategy.position_size > 0 and strategy.position_size[1] == 0');
    expect(body.messages[0].content).toContain('strategy.position_size[1] > 0');
    expect(body.messages[0].content).toContain('Do not reset entry-time state variables');
    expect(body.messages[0].content).toContain('simple flat-state reset can erase entry-time state too early');
    expect(body.messages[0].content).toContain('strategy.position_size > 0 and not na(entryAtr)');
    expect(body.messages[0].content).toContain('Do not compute stopLossPrice at top level');
    expect(body.messages[0].content).toContain('Do not use close as a substitute for the actual entry price');
    expect(body.messages[0].content).toContain('Do not create entry_price := close or entryPrice := close');
    expect(body.messages[0].content).toContain('use strategy.position_avg_price after the position is open');
    expect(body.messages[0].content).toContain('For fixed percentage stop loss');
    expect(body.messages[0].content).toContain('Do not create entryPrice or entry_price from strategy.position_avg_price inside the entry block');
    expect(body.messages[0].content).toContain('Fixed percentage stops do not need entry-time state variables');
    expect(body.messages[0].content).toContain('Only create ATR variables, entryAtr, atrValue, or other ATR state');
    expect(body.messages[0].content).toContain('If the user does not ask for ATR, do not create entryAtr, atrValue, ta.atr, or ATR state');
    expect(body.messages[0].content).toContain('Do not reuse an ATR stop template for a percentage stop');
    expect(body.messages[0].content).toContain('Preserve oscillator threshold direction exactly');
    expect(body.messages[0].content).toContain('RSI above 60 means rsi > 60');
    expect(body.messages[0].content).toContain('Do not use ta.crossunder(rsi, 60)');
    expect(body.messages[0].content).toContain('RSI crosses back above 30 means ta.crossover(rsi, 30)');
    expect(body.messages[0].content).toContain('With overlay=true, do not plot RSI');
    expect(body.messages[0].content).toContain('plot oscillators only when explicitly requested');
    expect(body.messages[0].content).toContain('Do not use color.color.*');
    expect(body.messages[0].content).toContain('Do not use plot.style_dashed');
    expect(body.messages[0].content).toContain('use state variables such as var bool setupActive');
    expect(body.messages[0].content).toContain('Do not directly require setupCondition and triggerCondition on the same bar');
    expect(body.messages[0].content).toContain('entryCondition = setupActive and triggerCondition');
    expect(body.messages[0].content).toContain('below, or less than');
    expect(body.messages[0].content).toContain('Use ta.crossunder only when the wording explicitly says');
    expect(body.messages[0].content).toContain('capture ATR after the position becomes open');
    expect(body.messages[0].content).toContain('Avoid representative ATR patterns that capture state with if strategy.position_size > 0 and na(entryAtr)');
    expect(body.messages[0].content).toContain('Do not declare unused variables');
    expect(body.messages[0].content).toContain('If plotting a stop line, guard it with position and na checks');
    expect(body.messages[0].content).toContain('prefer strategy.exit(..., stop=...)');
    expect(body.messages[0].content).toContain('Avoid manual bar-based stops such as if low <= stopLossPrice then strategy.close(...)');
    expect(body.messages[0].content).toContain('Use strategy.close() for rule-based exits');
    expect(body.messages[0].content).toContain('not for ordinary stop loss or take profit orders');
    expect(body.messages[0].content).toContain('Avoid plotting volume or average volume');
    expect(body.messages[0].content).toContain('Do not include explanations, narrative notes, URLs, citations');
    expect(body.messages[1].content).not.toContain('<Japanese user-facing string>');
    const userPayload = JSON.parse(body.messages[1].content);
    expect(userPayload.spec_available).toBe(false);
    expect(userPayload.normalized_strategy_spec).toBeNull();
    expect(userPayload.implementation_priority).toBe('natural_language_rule');
    expect(userPayload.output_schema).toBeUndefined();
    expect(userPayload.output_contract).toBe('pine_script_text_only');
    expect(result.generatedScript).toContain('strategy("X"');
  });

  it('clamps pine generation local_llm timeout env values', async () => {
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

    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
    const provider = await loadLocalProvider(fetchMock, {
      PINE_GENERATION_LOCAL_LLM_TIMEOUT_MS: 999999,
    });

    await provider.generatePineScript(createPineContext());

    expect(timeoutSpy).toHaveBeenCalledWith(300000);
  });

  it('uses reviewer hardening checklist for pine review', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'gemma4-ns',
        done_reason: 'stop',
        message: {
          role: 'assistant',
          content: JSON.stringify({
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
          }),
        },
      }),
      text: async () => '',
    });

    const provider = await loadLocalProvider(fetchMock);
    const result = await provider.reviewPineScript?.({
      naturalLanguageSpec: '終値が50日移動平均を下回った場合に決済します。',
      generatedScript: '//@version=6\nstrategy("X", overlay=true)\nplot(close)',
      targetMarket: 'JP_STOCK',
      targetTimeframe: 'D',
      repairAttempt: 0,
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:11434/api/chat');
    const body = JSON.parse(String(init.body));
    expect(body.stream).toBe(false);
    expect(body.think).toBe(false);
    expect(body.options.num_predict).toBe(700);
    expect(body.messages[0].content).toContain('Flag unsupported_function_alias');
    expect(body.messages[0].content).toContain('setupActive should remain true until entry occurs');
    expect(body.messages[0].content).toContain('does not reset setupActive := false');
    expect(body.messages[0].content).toContain('Setup-state variable names may vary');
    expect(body.messages[0].content).toContain('entry_guard_risk');
    expect(body.messages[0].content).toContain('strategy.position_size == 0');
    expect(body.messages[0].content).toContain('stop_order_guard_risk');
    expect(body.messages[0].content).toContain('outside a strategy.position_size > 0 position guard');
    expect(body.messages[0].content).toContain('[plusDI, minusDI, adxValue] = ta.dmi');
    expect(body.messages[0].content).toContain('donchian_current_bar_self_reference');
    expect(body.messages[0].content).toContain('entry_time_atr_not_persisted');
    expect(body.messages[0].content).toContain('below or less than');
    expect(body.messages[0].content).toContain('flag oscillator plot or hline usage');
    expect(body.messages[0].content).toContain('Use severity error only for likely compile failures');
    expect(body.messages[0].content).toContain('Use warning for readability, plotting preferences');
    expect(body.messages[0].content).toContain('Do not mark quality-only or readability-only observations as error');
    expect(body.messages[0].content).not.toContain('gemma4-ns');
    expect(result?.status).toBe('pass');
  });

  it('uses a dedicated pine repair prompt when repair request exists', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'gemma4-ns',
        done_reason: 'stop',
        message: {
          role: 'assistant',
          content: '//@version=6\nstrategy("Repaired", overlay=true)\nplot(close)',
        },
      }),
      text: async () => '',
    });

    const provider = await loadLocalProvider(fetchMock);
    const result = await provider.generatePineScript({
      ...createPineContext(),
      repairRequest: {
        attempt: 1,
        invalidReasonCodes: ['reviewer_entry_guard_risk'],
        failureReason: 'pine_review_needs_repair',
        previousScript: '//@version=6\nstrategy("Needs repair", overlay=true)\nstrategy.entry("Long", strategy.long)',
        reviewIssues: [
          {
            code: 'entry_guard_risk',
            severity: 'error',
            repair_hint: 'Guard strategy.entry with strategy.position_size == 0.',
            repair_template:
              'Wrap each long-only strategy.entry call in a flat-position guard: if entryCondition and strategy.position_size == 0 then strategy.entry("Long", strategy.long).',
          },
        ],
      },
    });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(init.body));
    const systemPrompt = body.messages[0].content;
    const userPayload = JSON.parse(body.messages[1].content);
    expect(systemPrompt).toContain('Repair an existing Pine v6 strategy script');
    expect(systemPrompt).toContain('Return Pine Script text only');
    expect(systemPrompt).toContain('Do not return JSON');
    expect(systemPrompt).toContain('Prioritize repair_template over repair_hint');
    expect(systemPrompt).toContain('Preserve unrelated strategy logic');
    expect(systemPrompt).not.toContain('Do not reuse an ATR stop template for a percentage stop');
    expect(userPayload.task).toBe('repair_pine_script');
    expect(userPayload.output_schema).toBeUndefined();
    expect(userPayload.output_contract).toBe('pine_script_text_only');
    expect(userPayload.regeneration_input).toBeUndefined();
    expect(userPayload.repair_request.reviewIssues).toEqual([
      {
        code: 'entry_guard_risk',
        severity: 'error',
        repair_hint: 'Guard strategy.entry with strategy.position_size == 0.',
        repair_template:
          'Wrap each long-only strategy.entry call in a flat-position guard: if entryCondition and strategy.position_size == 0 then strategy.entry("Long", strategy.long).',
      },
    ]);
    expect(systemPrompt).not.toContain('gemma4-ns');
    expect(body.messages[1].content).not.toContain('gemma4-ns');
    expect(result.generatedScript).toContain('strategy("Repaired"');
  });

  it('adds recurring repair note for repeated pine repair attempts', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'gemma4-ns',
        done_reason: 'stop',
        message: {
          role: 'assistant',
          content: '//@version=6\nstrategy("Repaired Again", overlay=true)\nplot(close)',
        },
      }),
      text: async () => '',
    });

    const provider = await loadLocalProvider(fetchMock);
    await provider.generatePineScript({
      ...createPineContext(),
      repairRequest: {
        attempt: 2,
        invalidReasonCodes: ['reviewer_stop_order_guard_risk'],
        failureReason: 'pine_review_needs_repair',
        previousScript: '//@version=6\nstrategy("Needs repair again", overlay=true)',
        reviewIssues: [
          {
            code: 'stop_order_guard_risk',
            severity: 'error',
            repair_hint: 'Guard stop order.',
            repair_template:
              'Call strategy.exit(..., stop=stopLossPrice) only under strategy.position_size > 0 and not na(stopLossPrice).',
          },
        ],
      },
    });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(init.body));
    const systemPrompt = body.messages[0].content;
    const userPayload = JSON.parse(body.messages[1].content);
    expect(systemPrompt).toContain('If the same issue persists after a prior repair attempt');
    expect(userPayload.recurring_repair_note).toContain('repeated repair attempt');
    expect(userPayload.repair_request.reviewIssues[0]).toMatchObject({
      code: 'stop_order_guard_risk',
      repair_hint: 'Guard stop order.',
      repair_template:
        'Call strategy.exit(..., stop=stopLossPrice) only under strategy.position_size > 0 and not na(stopLossPrice).',
    });
  });

  it('extracts Pine JSON envelope from fenced output with surrounding explanation', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'gemma4-ns',
        done_reason: 'stop',
        message: {
          role: 'assistant',
          content: [
            '以下のJSONで返します。',
            '```json',
            JSON.stringify({
              generated_script: '//@version=6\nstrategy("Extracted", overlay=true)',
              warnings: ['日本語の警告'],
              assumptions: ['日本語の前提'],
              normalized_rule_json: { entry: ['close > sma(25)'], exit: ['close < sma(25)'] },
            }),
            '```',
            '以上です。',
          ].join('\n'),
        },
      }),
      text: async () => '',
    });

    const provider = await loadLocalProvider(fetchMock);
    const result = await provider.generatePineScript(createPineContext());

    expect(result.status).toBe('generated');
    expect(result.generatedScript).toContain('strategy("Extracted"');
    expect(result.warnings).toContain('日本語の警告');
    expect(result.assumptions).toContain('日本語の前提');
  });

  it('skips non-JSON braces before the Pine JSON envelope', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'gemma4-ns',
        done_reason: 'stop',
        message: {
          role: 'assistant',
          content: [
            '説明用の疑似形式: {generated_script: "..."}',
            JSON.stringify({
              generated_script: '//@version=6\nstrategy("Second Envelope", overlay=true)',
              warnings: [],
              assumptions: [],
              normalized_rule_json: { entry: ['close > sma(25)'], exit: ['close < sma(25)'] },
            }),
          ].join('\n'),
        },
      }),
      text: async () => '',
    });

    const provider = await loadLocalProvider(fetchMock);
    const result = await provider.generatePineScript(createPineContext());

    expect(result.status).toBe('generated');
    expect(result.generatedScript).toContain('strategy("Second Envelope"');
  });

  it('skips parseable schema examples before the Pine JSON envelope', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'gemma4-ns',
        done_reason: 'stop',
        message: {
          role: 'assistant',
          content: [
            JSON.stringify({
              generated_script: '<string>',
              warnings: ['<Japanese user-facing string>'],
              assumptions: ['<Japanese user-facing string>'],
              normalized_rule_json: {},
            }),
            JSON.stringify({
              generated_script: '//@version=6\nstrategy("Real Envelope", overlay=true)',
              warnings: [],
              assumptions: [],
              normalized_rule_json: { entry: ['close > sma(25)'], exit: ['close < sma(25)'] },
            }),
          ].join('\n'),
        },
      }),
      text: async () => '',
    });

    const provider = await loadLocalProvider(fetchMock);
    const result = await provider.generatePineScript(createPineContext());

    expect(result.status).toBe('generated');
    expect(result.generatedScript).toContain('strategy("Real Envelope"');
    expect(result.generatedScript).not.toContain('<string>');
  });

  it('returns generated Pine from representative LLM-first envelope without deterministic fallback', async () => {
    const representativeScript = `//@version=6
strategy("Hokkyokusei LLM Generated Strategy", overlay=true)

ma25 = ta.sma(close, 25)
ma75 = ta.sma(close, 75)
volMa20 = ta.sma(volume, 20)
atr14 = ta.atr(14)
var float entryAtr = na
atrMult = 2.0

entryCondition = ta.crossover(ma25, ma75) and volume > volMa20 * 1.2
exitCondition = ta.crossunder(ma25, ma75) or close < ma25

if entryCondition and strategy.position_size == 0
    strategy.entry("Long", strategy.long)

if strategy.position_size > 0 and strategy.position_size[1] == 0
    entryAtr := atr14

if strategy.position_size > 0 and not na(entryAtr)
    stopLossPrice = strategy.position_avg_price - entryAtr * atrMult
    strategy.exit("Stop Loss", "Long", stop=stopLossPrice)

if exitCondition and strategy.position_size > 0
    strategy.close("Long", comment="Trend Exit")

if strategy.position_size == 0 and strategy.position_size[1] > 0
    entryAtr := na

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
    expect(result.generatedScript).toContain('if entryCondition and strategy.position_size == 0');
    expect(result.generatedScript).toContain('if exitCondition and strategy.position_size > 0');
    expect(result.generatedScript).toContain('var float entryAtr = na');
    expect(result.generatedScript).toContain('if strategy.position_size > 0 and strategy.position_size[1] == 0\n    entryAtr := atr14');
    expect(result.generatedScript).toContain('entryAtr := atr14');
    expect(result.generatedScript).toContain('if strategy.position_size > 0 and not na(entryAtr)');
    expect(result.generatedScript).toContain('stopLossPrice = strategy.position_avg_price - entryAtr * atrMult');
    expect(result.generatedScript).toContain('strategy.exit("Stop Loss", "Long", stop=stopLossPrice)');
    expect(result.generatedScript).toContain('strategy.close("Long", comment="Trend Exit")');
    expect(result.generatedScript).toContain('if strategy.position_size == 0 and strategy.position_size[1] > 0\n    entryAtr := na');
    expect(result.generatedScript).not.toContain('if strategy.position_size == 0\n    entryAtr := na');
    expect(result.generatedScript).not.toContain('entry_price := close');
    expect(result.generatedScript).not.toContain('entryPrice := close');
    expect(result.generatedScript).not.toContain('low <= stopLossPrice');
    expect(result.generatedScript).not.toContain('if low <= stopLossPrice');
    expect(result.generatedScript).not.toContain('nz(entryAtr, atr14)');
    expect(result.generatedScript).not.toMatch(/^stopLossPrice\s*=/m);
    expect(result.generatedScript).toMatch(
      /if strategy\.position_size > 0 and not na\(entryAtr\)\s+stopLossPrice = strategy\.position_avg_price - entryAtr \* atrMult\s+strategy\.exit\("Stop Loss", "Long", stop=stopLossPrice\)/s,
    );
    expect(result.generatedScript.indexOf('if strategy.position_size > 0 and strategy.position_size[1] == 0')).toBeGreaterThan(
      result.generatedScript.indexOf('strategy.entry("Long", strategy.long)'),
    );
    expect(result.generatedScript.indexOf('entryAtr := atr14')).toBeGreaterThan(
      result.generatedScript.indexOf('strategy.entry("Long", strategy.long)'),
    );
    expect(result.generatedScript.indexOf('strategy.position_avg_price')).toBeGreaterThan(
      result.generatedScript.indexOf('strategy.entry("Long", strategy.long)'),
    );
    expect(result.generatedScript.indexOf('strategy.position_size[1] > 0')).toBeGreaterThan(
      result.generatedScript.indexOf('strategy.close("Long", comment="Trend Exit")'),
    );
    expect(result.generatedScript).not.toContain('strategy.short');
    expect(result.generatedScript).not.toContain('plot(volume');
    expect(result.generatedScript).not.toContain('plot(volMa20');
    expect(result.generatedScript).not.toMatch(/^\s*\/\/(?!@version=6)/m);
    expect(result.generatedScript).not.toMatch(/^\s*\/\*/m);
    expect(result.warnings).toContain('横ばい相場では取引を控える条件を簡易的に扱っています。');
    expect(result.modelName).toBe('gemma4-ns');
  });

  it('returns RSI mean reversion Pine with percentage stop without ATR leakage', async () => {
    const representativeScript = `//@version=6
strategy("RSI Mean Reversion Strategy", overlay=true)

rsiValue = ta.rsi(close, 14)

entryCondition = ta.crossover(rsiValue, 30)
exitCondition = rsiValue > 60

if entryCondition and strategy.position_size == 0
    strategy.entry("Long", strategy.long)

if strategy.position_size > 0
    stopLossPrice = strategy.position_avg_price * 0.95
    strategy.exit("Stop Loss", "Long", stop=stopLossPrice)

if exitCondition and strategy.position_size > 0
    strategy.close("Long", comment="RSI Exit")`;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'gemma4-ns',
        done_reason: 'stop',
        message: {
          role: 'assistant',
          content: JSON.stringify({
            generated_script: representativeScript,
            warnings: ['RSI単独条件のため、トレンドフィルターは含めていません。'],
            assumptions: ['5%の固定損切りは建値平均を基準にします。'],
            normalized_rule_json: { strategy_type: 'long_only', indicators: ['RSI14'], stop_loss_percent: 5 },
          }),
        },
      }),
      text: async () => '',
    });

    const provider = await loadLocalProvider(fetchMock);
    const result = await provider.generatePineScript({
      ...createPineContext(),
      naturalLanguageSpec:
        'RSIが30を上抜けたら買い、RSIが60を上回ったら利確。損切りは建値から5%。',
      normalizedRuleJson: null,
    });

    expect(result.status).toBe('generated');
    expect(result.generatedScript).not.toBeNull();
    const script = result.generatedScript ?? '';
    const assessed = assessGeneratedPineScript(script);
    expect(assessed.failureReason).toBeNull();
    expect(script).toContain('strategy("RSI Mean Reversion Strategy", overlay=true)');
    expect(script).toContain('rsiValue = ta.rsi(close, 14)');
    expect(script).toContain('entryCondition = ta.crossover(rsiValue, 30)');
    expect(script).toContain('exitCondition = rsiValue > 60');
    expect(script).toContain('if entryCondition and strategy.position_size == 0');
    expect(script).toContain('strategy.entry("Long", strategy.long)');
    expect(script).toContain('stopLossPrice = strategy.position_avg_price * 0.95');
    expect(script).toContain('strategy.exit("Stop Loss", "Long", stop=stopLossPrice)');
    expect(script).toContain('strategy.close("Long", comment="RSI Exit")');
    expect(script).not.toContain('entryPrice := strategy.position_avg_price');
    expect(script).not.toContain('entry_price := strategy.position_avg_price');
    expect(script).not.toContain('entryAtr');
    expect(script).not.toContain('ta.atr');
    expect(script).not.toContain('plot(rsi');
    expect(script).not.toContain('hline(');
    expect(script).not.toContain('ta.crossunder(rsiValue, 60)');
  });

  it('returns setup-trigger Pine with below condition, ATR transition capture, and safe stop plot', async () => {
    const representativeScript = `//@version=6
strategy("VWAP Setup Pullback Strategy", overlay=true)

vwapValue = ta.vwap(hlc3)
ma50 = ta.sma(close, 50)
atr14 = ta.atr(14)
var bool setupActive = false
var float entryAtr = na
atrMult = 2.0

setupCondition = close < ma50
triggerCondition = ta.crossover(close, vwapValue)

if strategy.position_size == 0 and setupCondition
    setupActive := true

entryCondition = setupActive and triggerCondition

if entryCondition and strategy.position_size == 0
    strategy.entry("Long", strategy.long)
    setupActive := false

if strategy.position_size > 0 and strategy.position_size[1] == 0
    entryAtr := atr14

if strategy.position_size > 0 and not na(entryAtr)
    stopLossPrice = strategy.position_avg_price - entryAtr * atrMult
    strategy.exit("ATR Stop", "Long", stop=stopLossPrice)

if strategy.position_size == 0 and strategy.position_size[1] > 0
    entryAtr := na

plot(ma50, color=color.green)
plot(strategy.position_size > 0 and not na(entryAtr) ? strategy.position_avg_price - entryAtr * atrMult : na, "ATR Stop", color=color.red, style=plot.style_linebr)`;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'gemma4-ns',
        done_reason: 'stop',
        message: {
          role: 'assistant',
          content: JSON.stringify({
            generated_script: representativeScript,
            warnings: ['セットアップ状態は無効化条件まで保持します。'],
            assumptions: ['終値がMA50を下回った状態をセットアップとして扱います。'],
            normalized_rule_json: { strategy_type: 'long_only', indicators: ['VWAP', 'MA50', 'ATR14'] },
          }),
        },
      }),
      text: async () => '',
    });

    const provider = await loadLocalProvider(fetchMock);
    const result = await provider.generatePineScript({
      ...createPineContext(),
      naturalLanguageSpec:
        '終値がMA50を下回った後、VWAPを上抜けたら買い。ATRの2倍で損切りし、損切り線も表示する。',
      normalizedRuleJson: null,
    });

    expect(result.status).toBe('generated');
    const script = result.generatedScript ?? '';
    const assessed = assessGeneratedPineScript(script);
    expect(assessed.failureReason).toBeNull();
    expect(script).toContain('var bool setupActive = false');
    expect(script).toContain('setupActive := true');
    expect(script).toContain('entryCondition = setupActive and triggerCondition');
    expect(script).toContain('setupCondition = close < ma50');
    expect(script).not.toContain('setupCondition and triggerCondition');
    expect(script).not.toContain('ta.crossunder(close, ma50)');
    expect(script).toContain('if strategy.position_size > 0 and strategy.position_size[1] == 0');
    expect(script).toContain('entryAtr := atr14');
    expect(script).not.toContain('if strategy.position_size > 0 and na(entryAtr)');
    expect(script).toContain('color=color.green');
    expect(script).not.toContain('color.color.');
    expect(script).not.toContain('plot.style_dashed');
    expect(script).toContain('style=plot.style_linebr');
    expect(script).toContain('plot(strategy.position_size > 0 and not na(entryAtr) ?');
    expect(script).not.toContain('Note:');
    expect(script).not.toContain('注意:');
    expect(script).not.toContain('Since');
    expect(script).not.toContain("Let's use");
    expect(script).not.toContain('より正確な実装');
    expect(script).not.toContain('Pine Scriptの仕様上');
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

  it('uses Pine script text as the normal local LLM generation output', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'gemma4-ns',
        done_reason: 'stop',
        message: {
          role: 'assistant',
          content: [
            '以下がPineです。',
            '```pine',
            '//@version=6',
            'strategy("Raw Pine", overlay=true)',
            'plot(close)',
            '```',
          ].join('\n'),
        },
      }),
      text: async () => '',
    });

    const provider = await loadLocalProvider(fetchMock);
    const result = await provider.generatePineScript(createPineContext());

    expect(result.status).toBe('generated');
    expect(result.generatedScript).toContain('//@version=6');
    expect(result.generatedScript).toContain('strategy("Raw Pine"');
    expect(result.generatedScript).not.toContain('以下がPineです');
    expect(result.warnings.join(' ')).not.toContain('JSON envelope');
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

  it('returns retryable pine failure when content is empty and finish reason is length', async () => {
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

    const result = await provider.generatePineScript(createPineContext());

    expect(result.status).toBe('failed');
    expect(result.generatedScript).toBeNull();
    expect(result.failureReason).toBe('provider_invalid_response');
    expect(result.invalidReasonCodes).toContain('empty_output');
    expect(errorSpy).toHaveBeenCalled();
    expect(String(errorSpy.mock.calls[0][0])).toContain('"task_type":"pine_generation"');
  });
});
