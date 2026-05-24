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
    expect(body.messages[0].content).toContain('Return one strict JSON object only');
    expect(body.messages[0].content).toContain('generated_script value must contain Pine Script only');
    expect(body.messages[0].content).toContain('Use //@version=6 and strategy(...)');
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
    expect(body.messages[0].content).toContain('capture it on the position-open transition');
    expect(body.messages[0].content).toContain('Avoid representative ATR patterns that capture state with if strategy.position_size > 0 and na(entryAtr)');
    expect(body.messages[0].content).toContain('Do not declare unused variables');
    expect(body.messages[0].content).toContain('generated_script comments should be short section comments only');
    expect(body.messages[0].content).toContain('If plotting a stop line, guard it with position and na checks');
    expect(body.messages[0].content).toContain('prefer strategy.exit(..., stop=...)');
    expect(body.messages[0].content).toContain('Avoid manual bar-based stops such as if low <= stopLossPrice then strategy.close(...)');
    expect(body.messages[0].content).toContain('Use strategy.close() for rule-based exits');
    expect(body.messages[0].content).toContain('not for ordinary stop loss or take profit orders');
    expect(body.messages[0].content).toContain('Avoid plotting volume or average volume');
    expect(body.messages[0].content).toContain('Do not include narrative comments');
    expect(body.messages[0].content).toContain('Do not include URLs, citations, web search results, or profit guarantees');
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
