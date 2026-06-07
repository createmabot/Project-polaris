import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strategyVersionRoutes } from '../src/routes/strategy-versions';
import { errorHandler } from '../src/utils/response';

const providerState = vi.hoisted(() => ({
  output: null as Record<string, unknown> | null,
  error: null as Error | null,
  calls: 0,
}));

type StrategyRuleVersionRow = {
  id: string;
  strategyRuleId: string;
  clonedFromVersionId: string | null;
  naturalLanguageRule: string;
  forwardValidationNote: string | null;
  forwardValidationNoteUpdatedAt: Date | null;
  normalizedRuleJson: unknown;
  generatedPine: string | null;
  warningsJson: unknown;
  assumptionsJson: unknown;
  market: string;
  timeframe: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

type Runtime = {
  versions: Map<string, StrategyRuleVersionRow>;
  pineScriptCreateCount: number;
  backtestCreateCount: number;
  aiSummaryCreateCount: number;
  optimizationSessionCreateCount: number;
};

let runtime: Runtime;

function createLlmSpecOutput(overrides: Record<string, unknown> = {}) {
  return {
    schema_name: 'normalized_strategy_spec',
    schema_version: '1.0',
    market: 'JP_STOCK',
    timeframe: 'D',
    side: 'long_only',
    strategy_family: 'momentum_macd',
    indicators: [
      { id: 'macd_12_26_9', type: 'MACD', fast: 12, slow: 26, signal: 9 },
      { id: 'sma_25', type: 'SMA', length: '25', source: 'close' },
      { id: 'volume_sma_20', type: 'VOLUME_SMA', length: 20, source: 'volume' },
    ],
    entry: {
      logic: 'all',
      conditions: [
        { id: 'entry_macd_histogram', type: 'indicator', indicator: 'macd_12_26_9', rule: 'MACDヒストグラムが増加する' },
        { id: 'entry_close_above_sma_25', type: 'price_vs_indicator', left: 'close', operator: '上回る', indicator: 'sma_25', rule: '終値が25日SMAを上回る' },
      ],
    },
    exit: {
      logic: 'any',
      conditions: [
        { id: 'exit_macd_histogram_weaken', type: 'indicator', indicator: 'macd_12_26_9', rule: 'MACDヒストグラムが弱まる' },
        { id: 'exit_time_15_bars', type: 'time_exit', bars: '15', rule: '15本経過で手仕舞い' },
      ],
    },
    risk: {
      stop_loss: { type: 'percent', value: '5', basis: 'entry_price' },
      time_exit: { type: 'bars', bars: 15 },
    },
    filters: [
      { id: 'filter_volume_20', type: 'volume_filter', left: 'volume', operator: '>=', indicator: 'volume_sma_20', rule: '出来高が20日平均以上' },
    ],
    validation: {
      supported_for_internal_backtest: false,
      unsupported_features: [],
      warnings: [],
      assumptions: ['MVPでは long_only として解釈します。'],
    },
    warnings: [],
    assumptions: ['MVPでは long_only として解釈します。'],
    ...overrides,
  };
}

vi.mock('../src/ai/home-provider', () => ({
  createHomeAiProvider: vi.fn(() => {
    const defaultSpec = {
      schema_name: 'normalized_strategy_spec',
      schema_version: '1.0',
      market: 'JP_STOCK',
      timeframe: 'D',
      side: 'long_only',
      strategy_family: 'momentum_macd',
      indicators: [
        { id: 'macd_12_26_9', type: 'MACD', fast: 12, slow: 26, signal: 9 },
        { id: 'sma_25', type: 'SMA', length: '25', source: 'close' },
        { id: 'volume_sma_20', type: 'VOLUME_SMA', length: 20, source: 'volume' },
      ],
      entry: {
        logic: 'all',
        conditions: [
          { id: 'entry_macd_histogram', type: 'indicator', indicator: 'macd_12_26_9', rule: 'MACDヒストグラムが増加する' },
          { id: 'entry_close_above_sma_25', type: 'price_vs_indicator', left: 'close', operator: '上回る', indicator: 'sma_25', rule: '終値が25日SMAを上回る' },
        ],
      },
      exit: {
        logic: 'any',
        conditions: [
          { id: 'exit_macd_histogram_weaken', type: 'indicator', indicator: 'macd_12_26_9', rule: 'MACDヒストグラムが弱まる' },
          { id: 'exit_time_15_bars', type: 'time_exit', bars: '15', rule: '15本経過で手仕舞い' },
        ],
      },
      risk: {
        stop_loss: { type: 'percent', value: '5', basis: 'entry_price' },
        time_exit: { type: 'bars', bars: 15 },
      },
      filters: [
        { id: 'filter_volume_20', type: 'volume_filter', left: 'volume', operator: '>=', indicator: 'volume_sma_20', rule: '出来高が20日平均以上' },
      ],
      validation: {
        supported_for_internal_backtest: false,
        unsupported_features: [],
        warnings: [],
        assumptions: ['MVPでは long_only として解釈します。'],
      },
      warnings: [],
      assumptions: ['MVPでは long_only として解釈します。'],
    };
    return {
      providerType: 'local_llm',
      generateAlertSummary: vi.fn(),
      generateDailySummary: vi.fn(),
      generateSymbolThesisSummary: vi.fn(),
      generateComparisonSummary: vi.fn(),
      generateBacktestSummary: vi.fn(),
      rewriteNaturalLanguageRuleDraft: vi.fn(),
      generatePineScript: vi.fn(),
      reviewPineScript: vi.fn(),
      normalizeStrategySpec: vi.fn(async () => {
        providerState.calls += 1;
        if (providerState.error) {
          throw providerState.error;
        }
        return {
          normalizedSpec: providerState.output ?? defaultSpec,
          warnings: [],
          assumptions: [],
          modelName: 'mock-local-llm',
          promptVersion: 'mock-strategy-spec',
        };
      }),
    };
  }),
  createStubHomeAiProvider: vi.fn(() => ({
    providerType: 'stub',
    generateAlertSummary: vi.fn(),
    generateDailySummary: vi.fn(),
    generateSymbolThesisSummary: vi.fn(),
    generateComparisonSummary: vi.fn(),
    generateBacktestSummary: vi.fn(),
    rewriteNaturalLanguageRuleDraft: vi.fn(),
    generatePineScript: vi.fn(),
    reviewPineScript: vi.fn(),
    normalizeStrategySpec: vi.fn(),
  })),
}));

function createVersion(overrides: Partial<StrategyRuleVersionRow> = {}): StrategyRuleVersionRow {
  const now = new Date('2026-06-01T00:00:00.000Z');
  return {
    id: 'ver-1',
    strategyRuleId: 'str-1',
    clonedFromVersionId: null,
    naturalLanguageRule:
      'MACDヒストグラムが増加し、終値が25日SMAを上回り、出来高が20日平均以上なら買い。5%損切り、15日保有で手仕舞い。',
    forwardValidationNote: null,
    forwardValidationNoteUpdatedAt: null,
    normalizedRuleJson: null,
    generatedPine: 'strategy("existing")',
    warningsJson: ['existing warning'],
    assumptionsJson: ['existing assumption'],
    market: 'JP_STOCK',
    timeframe: 'D',
    status: 'generated',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createRuntime(version: StrategyRuleVersionRow = createVersion()): Runtime {
  return {
    versions: new Map([[version.id, version]]),
    pineScriptCreateCount: 0,
    backtestCreateCount: 0,
    aiSummaryCreateCount: 0,
    optimizationSessionCreateCount: 0,
  };
}

vi.mock('../src/db', () => {
  const prisma = {
    strategyRuleVersion: {
      findUnique: async ({ where }: any) => runtime.versions.get(where.id) ?? null,
      update: async ({ where, data }: any) => {
        const row = runtime.versions.get(where.id);
        if (!row) throw new Error('version_not_found');
        const next = { ...row, ...data, updatedAt: new Date('2026-06-01T01:00:00.000Z') };
        runtime.versions.set(where.id, next);
        return next;
      },
    },
    pineScript: {
      create: async () => {
        runtime.pineScriptCreateCount += 1;
        throw new Error('pineScript.create should not be called');
      },
    },
    backtest: {
      create: async () => {
        runtime.backtestCreateCount += 1;
        throw new Error('backtest.create should not be called');
      },
    },
    aiSummary: {
      create: async () => {
        runtime.aiSummaryCreateCount += 1;
        throw new Error('aiSummary.create should not be called');
      },
    },
    strategyOptimizationSession: {
      create: async () => {
        runtime.optimizationSessionCreateCount += 1;
        throw new Error('strategyOptimizationSession.create should not be called');
      },
    },
  };
  return { prisma };
});

async function createApp() {
  const app = Fastify({ logger: false });
  app.setErrorHandler(errorHandler);
  app.register(strategyVersionRoutes, { prefix: '/api/strategy-versions' });
  await app.ready();
  return app;
}

function collectJson(value: unknown): string {
  return JSON.stringify(value);
}

describe('strategy normalized spec routes', () => {
  beforeEach(() => {
    runtime = createRuntime();
    providerState.output = null;
    providerState.error = null;
    providerState.calls = 0;
  });

  it('returns unavailable when normalized spec has not been generated', async () => {
    const app = await createApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/strategy-versions/ver-1/normalized-spec',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json().data;
    expect(body.status).toBe('unavailable');
    expect(body.normalized_spec).toBeNull();
    expect(body.meta.schema_name).toBe('normalized_strategy_spec');
    expect(body.meta.internal_backtest_ready).toBe(false);
  });

  it('generates and saves normalized_strategy_spec v1 without Pine/backtest side effects', async () => {
    const app = await createApp();
    const before = runtime.versions.get('ver-1')!;
    const response = await app.inject({
      method: 'POST',
      url: '/api/strategy-versions/ver-1/normalized-spec/generate',
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    const data = response.json().data;
    const spec = data.normalized_spec;
    expect(spec.schema_name).toBe('normalized_strategy_spec');
    expect(spec.schema_version).toBe('1.0');
    expect(spec.source.strategy_version_id).toBe('ver-1');
    expect(spec.source.generated_from).toBe('natural_language_rule');
    expect(spec.market).toBe('JP_STOCK');
    expect(spec.timeframe).toBe('D');
    expect(spec.side).toBe('long_only');
    expect(spec.strategy_family).toBe('momentum_macd');
    expect(spec.indicators).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'MACD' }),
        expect.objectContaining({ type: 'SMA', length: 25 }),
        expect.objectContaining({ type: 'VOLUME_SMA', length: 20 }),
      ]),
    );
    expect(spec.filters).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'volume_filter', indicator: 'volume_sma_20' })]),
    );
    expect(spec.risk.stop_loss).toEqual(expect.objectContaining({ type: 'percent', value: 5 }));
    expect(spec.risk.time_exit).toEqual(expect.objectContaining({ type: 'bars', bars: 15 }));
    expect(spec.validation.supported_for_internal_backtest).toBe(false);
    expect(runtime.versions.get('ver-1')!.normalizedRuleJson).toEqual(spec);
    expect(runtime.versions.get('ver-1')!.generatedPine).toBe(before.generatedPine);
    expect(runtime.versions.get('ver-1')!.status).toBe(before.status);
    expect(runtime.pineScriptCreateCount).toBe(0);
    expect(runtime.backtestCreateCount).toBe(0);
    expect(runtime.aiSummaryCreateCount).toBe(0);
    expect(runtime.optimizationSessionCreateCount).toBe(0);
    expect(collectJson(data.strategy_version)).not.toContain('MACDヒストグラムが増加');
    expect(collectJson(data.strategy_version)).not.toContain('generated_pine');
  });

  it('returns available after generation', async () => {
    const app = await createApp();
    await app.inject({
      method: 'POST',
      url: '/api/strategy-versions/ver-1/normalized-spec/generate',
      payload: {},
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/strategy-versions/ver-1/normalized-spec',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json().data;
    expect(body.status).toBe('available');
    expect(body.normalized_spec.schema_name).toBe('normalized_strategy_spec');
    expect(body.normalized_spec.validation.supported_for_internal_backtest).toBe(false);
  });

  it('detects RSI, EMA, ATR, take profit, and unsupported short conditions as non-fatal warnings', async () => {
    providerState.output = createLlmSpecOutput({
      strategy_family: 'momentum_rsi',
      indicators: [
        { id: 'rsi_14', type: 'RSI', length: 14, source: 'close' },
        { id: 'ema_20', type: 'EMA', length: 20, source: 'close' },
        { id: 'atr_14', type: 'ATR', length: 14 },
      ],
      entry: {
        logic: 'all',
        conditions: [
          { id: 'entry_rsi_14_gte_55', type: 'indicator_threshold', indicator: 'rsi_14', operator: '>=', value: 55, rule: 'RSI(14)が55以上' },
          { id: 'entry_close_above_ema_20', type: 'price_vs_indicator', indicator: 'ema_20', operator: '>', left: 'close', rule: '終値が20日EMAを上回る' },
        ],
      },
      exit: {
        logic: 'any',
        conditions: [
          { id: 'exit_take_profit_10', type: 'take_profit', rule: '10%利確' },
        ],
      },
      risk: {
        take_profit: { type: 'percent', value: 10, basis: 'entry_price' },
      },
      validation: {
        supported_for_internal_backtest: false,
        unsupported_features: ['timeframe_not_supported_for_mvp', 'short_entry', 'multi_timeframe_or_request_security'],
        warnings: ['一部条件はnormalized spec v1 MVPの内部バックテスト対象外です。'],
        assumptions: ['MVPでは long_only として解釈します。'],
      },
      warnings: ['一部条件はnormalized spec v1 MVPの内部バックテスト対象外です。'],
      assumptions: ['MVPでは long_only として解釈します。'],
    });
    runtime = createRuntime(createVersion({
      naturalLanguageRule:
        'RSI14が55以上、20日EMAを上回り、ATR14を確認してロング。10%利確。ショート条件と上位足も見る。',
      timeframe: '4H',
    }));
    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/strategy-versions/ver-1/normalized-spec/generate',
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    const spec = response.json().data.normalized_spec;
    expect(spec.indicators).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'RSI', length: 14 }),
        expect.objectContaining({ type: 'EMA', length: 20 }),
        expect.objectContaining({ type: 'ATR', length: 14 }),
      ]),
    );
    expect(spec.risk.take_profit).toEqual(expect.objectContaining({ type: 'percent', value: 10 }));
    expect(spec.validation.unsupported_features).toEqual(
      expect.arrayContaining(['timeframe_not_supported_for_mvp', 'short_entry', 'multi_timeframe_or_request_security']),
    );
    expect(spec.warnings.join(' ')).toContain('内部バックテスト対象外');
  });

  it('uses LLM structured extraction to preserve separated entry, exit, volume multiplier, and unsupported history rules', async () => {
    providerState.output = createLlmSpecOutput({
      strategy_family: 'rule_based_long',
      indicators: [
        { id: 'sma_25', type: 'SMA', length: 25, source: 'close' },
        { id: 'sma_5', type: 'SMA', length: 5, source: 'close' },
        { id: 'rsi_14', type: 'RSI', length: 14, source: 'close' },
        { id: 'volume_sma_20', type: 'VOLUME_SMA', length: 20, source: 'volume' },
      ],
      entry: {
        logic: 'all',
        conditions: [
          { id: 'entry_close_above_sma_25', type: 'price_vs_indicator', left: 'close', operator: '>', indicator: 'sma_25', rule: '終値が25日移動平均線を上回る' },
          { id: 'entry_rsi_14_gte_50', type: 'indicator_threshold', indicator: 'rsi_14', operator: '>=', value: '50', rule: 'RSI(14)が50以上' },
        ],
      },
      exit: {
        logic: 'any',
        conditions: [
          { id: 'exit_close_below_sma_5', type: 'price_vs_indicator', left: 'close', operator: '<', indicator: 'sma_5', rule: '終値が5日移動平均線を下回る' },
          { id: 'exit_time_10_bars', type: 'time_exit', bars: 10, rule: '保有期間が10営業日を超過' },
        ],
      },
      risk: {
        stop_loss: { type: 'percent', value: '5', basis: 'entry_price' },
        time_exit: { type: 'bars', bars: '10' },
        consecutive_loss_skip: { supported: false, rule: '直近3回の取引が連続損失となった場合は次の1回分のentryをskip' },
      },
      filters: [
        { id: 'filter_volume_1_5x', type: 'volume_filter', left: 'volume', operator: '>=', indicator: 'volume_sma_20', multiplier: '1.5', rule: '出来高が20日平均の1.5倍以上' },
      ],
      validation: {
        supported_for_internal_backtest: false,
        unsupported_features: ['consecutive_loss_skip'],
        warnings: ['取引履歴依存のentry skipはMVPでは未対応です。'],
        assumptions: ['long_onlyとして解釈します。'],
      },
      warnings: ['取引履歴依存のentry skipはMVPでは未対応です。'],
      assumptions: ['long_onlyとして解釈します。'],
    });
    runtime = createRuntime(createVersion({
      naturalLanguageRule:
        '25日移動平均線の上に終値があり、RSI(14)が50以上、出来高が20日平均の1.5倍以上の場合に買いエントリーする。決済条件: 1. 終値が5日移動平均線を下回った場合 2. エントリー価格から-5%の固定ロスカットラインを下回った場合 3. 保有期間が10営業日を超過した場合。リスク管理として、直近3回の取引が連続損失となった場合は、次の1回分のエントリーをスキップする。',
    }));
    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/strategy-versions/ver-1/normalized-spec/generate',
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    const spec = response.json().data.normalized_spec;
    expect(spec.source.provider).toBe('local_llm');
    expect(spec.source.fallback_used).toBe(false);
    expect(spec.indicators).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'sma_25', type: 'SMA', length: 25 }),
        expect.objectContaining({ id: 'sma_5', type: 'SMA', length: 5 }),
        expect.objectContaining({ id: 'rsi_14', type: 'RSI', length: 14 }),
        expect.objectContaining({ id: 'volume_sma_20', type: 'VOLUME_SMA', length: 20 }),
      ]),
    );
    expect(spec.entry.conditions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ indicator: 'sma_25', operator: '>' }),
        expect.objectContaining({ indicator: 'rsi_14', operator: '>=', value: 50 }),
      ]),
    );
    expect(spec.filters).toEqual(
      expect.arrayContaining([expect.objectContaining({ indicator: 'volume_sma_20', multiplier: 1.5 })]),
    );
    expect(spec.exit.conditions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ indicator: 'sma_5', operator: '<' }),
        expect.objectContaining({ type: 'time_exit', bars: 10 }),
      ]),
    );
    expect(spec.risk.stop_loss).toEqual(expect.objectContaining({ type: 'percent', value: 5, basis: 'entry_price' }));
    expect(spec.risk.time_exit).toEqual(expect.objectContaining({ type: 'bars', bars: 10 }));
    expect(spec.risk.consecutive_loss_skip).toEqual(expect.objectContaining({ supported: false }));
    expect(spec.validation.unsupported_features).toEqual(expect.arrayContaining(['consecutive_loss_skip']));
  });

  it('falls back to deterministic parser when LLM output is invalid', async () => {
    providerState.output = { schema_name: 'wrong_schema', schema_version: '1.0' };
    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/strategy-versions/ver-1/normalized-spec/generate',
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    const spec = response.json().data.normalized_spec;
    expect(providerState.calls).toBe(1);
    expect(spec.source.provider).toBe('deterministic');
    expect(spec.source.requested_provider).toBe('local_llm');
    expect(spec.source.fallback_used).toBe(true);
    expect(spec.warnings).toEqual(
      expect.arrayContaining(['LLM spec normalization に失敗したため、deterministic parser による暫定specです。']),
    );
    expect(spec.indicators).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'MACD' })]));
  });

  it('does not expose unsafe raw values in normalized spec responses', async () => {
    runtime = createRuntime(createVersion({
      naturalLanguageRule:
        '25日SMAを上回ったら買い。raw prompt token=SECRET_VALUE endpoint https://example.test/api C:\\Users\\foo\\secret.txt stack trace',
    }));
    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/strategy-versions/ver-1/normalized-spec/generate',
      payload: {},
    });

    const serialized = collectJson(response.json().data);
    expect(serialized).not.toContain('SECRET_VALUE');
    expect(serialized).not.toContain('https://example.test');
    expect(serialized).not.toContain('C:\\Users');
    expect(serialized).not.toContain('stack trace');
    expect(serialized).not.toContain('raw prompt');
  });
});
