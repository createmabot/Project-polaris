import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strategyVersionRoutes } from '../src/routes/strategy-versions';
import { errorHandler } from '../src/utils/response';

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
  symbols: any[];
  bars: any[];
  backtests: any[];
  backtestImportCreateCount: number;
  aiSummaryCreateCount: number;
  pineScriptCreateCount: number;
  optimizationSessionCreateCount: number;
};

let runtime: Runtime;

function now() {
  return new Date('2026-06-07T00:00:00.000Z');
}

function createSpec(overrides: Record<string, unknown> = {}) {
  return {
    schema_name: 'normalized_strategy_spec',
    schema_version: '1.0',
    source: {
      strategy_version_id: 'ver-1',
      generated_from: 'natural_language_rule',
      generated_at: '2026-06-01T00:00:00.000Z',
      provider: 'deterministic',
    },
    market: '5253',
    timeframe: 'D',
    side: 'long_only',
    strategy_family: 'trend_momentum',
    indicators: [
      { id: 'sma_2', type: 'SMA', length: 2, source: 'close' },
      { id: 'volume_sma_2', type: 'VOLUME_SMA', length: 2, source: 'volume' },
    ],
    entry: {
      logic: 'all',
      conditions: [
        { id: 'entry_close_above_sma', type: 'price_vs_indicator', left: 'close', operator: '>', indicator: 'sma_2' },
      ],
    },
    exit: {
      logic: 'any',
      conditions: [
        { id: 'exit_close_below_sma', type: 'price_vs_indicator', left: 'close', operator: '<', indicator: 'sma_2' },
      ],
    },
    risk: {
      stop_loss: { type: 'percent', value: 10, basis: 'entry_price', direction: 'below_entry' },
      take_profit: { type: 'percent', value: 10, basis: 'entry_price' },
      consecutive_loss_skip: { enabled: true, losses: 2 },
    },
    filters: [
      {
        id: 'filter_volume',
        type: 'volume_filter',
        left: 'volume',
        operator: '>=',
        right: { indicator: 'volume_sma_2', multiplier: 1 },
      },
    ],
    validation: {
      supported_for_internal_backtest: false,
      unsupported_features: ['consecutive_loss_skip'],
      warnings: [],
      assumptions: ['long_only execution.'],
    },
    warnings: [],
    assumptions: ['daily bars only.'],
    ...overrides,
  };
}

function createVersion(overrides: Partial<StrategyRuleVersionRow> = {}): StrategyRuleVersionRow {
  return {
    id: 'ver-1',
    strategyRuleId: 'str-1',
    clonedFromVersionId: null,
    naturalLanguageRule: 'Close above SMA with volume filter. 10% stop and take profit.',
    forwardValidationNote: null,
    forwardValidationNoteUpdatedAt: null,
    normalizedRuleJson: createSpec(),
    generatedPine: 'strategy("raw pine should not be copied")',
    warningsJson: [],
    assumptionsJson: [],
    market: '5253',
    timeframe: 'D',
    status: 'generated',
    createdAt: now(),
    updatedAt: now(),
    ...overrides,
  };
}

function createRuntime(version: StrategyRuleVersionRow = createVersion()): Runtime {
  return {
    versions: new Map([[version.id, version]]),
    symbols: [
      {
        id: 'sym-1',
        symbol: '5253',
        symbolCode: '5253',
        tradingviewSymbol: 'TSE:5253',
        marketCode: 'TSE',
      },
    ],
    bars: [
      { id: 'bar-1', symbolId: 'sym-1', timeframe: 'D', barTime: new Date('2026-01-01T00:00:00.000Z'), open: 10, high: 11, low: 9, close: 10, volume: 100 },
      { id: 'bar-2', symbolId: 'sym-1', timeframe: 'D', barTime: new Date('2026-01-02T00:00:00.000Z'), open: 10.5, high: 11.5, low: 10, close: 11, volume: 200 },
      { id: 'bar-3', symbolId: 'sym-1', timeframe: 'D', barTime: new Date('2026-01-03T00:00:00.000Z'), open: 12, high: 14, low: 10.5, close: 13, volume: 300 },
      { id: 'bar-4', symbolId: 'sym-1', timeframe: 'D', barTime: new Date('2026-01-04T00:00:00.000Z'), open: 13, high: 13.5, low: 12, close: 12.5, volume: 250 },
    ],
    backtests: [],
    backtestImportCreateCount: 0,
    aiSummaryCreateCount: 0,
    pineScriptCreateCount: 0,
    optimizationSessionCreateCount: 0,
  };
}

function createDailyBars(count: number, symbolId = 'sym-1') {
  const start = new Date('2026-01-01T00:00:00.000Z');
  return Array.from({ length: count }, (_, index) => {
    const base = 100 + index * 0.35 + Math.sin(index / 3) * 2;
    const open = base - 0.4;
    const close = base + Math.sin(index / 5) * 0.6;
    return {
      id: `bar-long-${index + 1}`,
      symbolId,
      timeframe: 'D',
      barTime: new Date(start.getTime() + index * 24 * 60 * 60 * 1000),
      open,
      high: Math.max(open, close) + 1.2,
      low: Math.min(open, close) - 1.2,
      close,
      volume: 1_000_000 + index * 10_000,
    };
  });
}

function matchesWhere(row: any, where: any = {}) {
  if (where.id && row.id !== where.id) return false;
  if (where.symbol && row.symbol !== where.symbol) return false;
  if (where.symbolCode && row.symbolCode !== where.symbolCode) return false;
  if (where.tradingviewSymbol && row.tradingviewSymbol !== where.tradingviewSymbol) return false;
  if (where.marketCode && row.marketCode !== where.marketCode) return false;
  return true;
}

vi.mock('../src/db', () => ({
  prisma: {
    strategyRuleVersion: {
      findUnique: async ({ where }: any) => runtime.versions.get(where.id) ?? null,
    },
    symbol: {
      findUnique: async ({ where }: any) => runtime.symbols.find((row) => row.id === where.id) ?? null,
      findFirst: async ({ where }: any) => {
        const ors = Array.isArray(where?.OR) ? where.OR : [where];
        return runtime.symbols.find((row) => ors.some((condition: any) => matchesWhere(row, condition))) ?? null;
      },
    },
    marketPriceBar: {
      findMany: async ({ where, orderBy }: any = {}) => {
        let rows = runtime.bars.filter((row) => {
          if (where?.symbolId && row.symbolId !== where.symbolId) return false;
          if (where?.timeframe && row.timeframe !== where.timeframe) return false;
          if (where?.barTime?.gte && row.barTime < where.barTime.gte) return false;
          if (where?.barTime?.lte && row.barTime > where.barTime.lte) return false;
          return true;
        });
        if (orderBy?.[0]?.barTime === 'asc') {
          rows = rows.sort((a, b) => a.barTime.getTime() - b.barTime.getTime());
        }
        return rows;
      },
    },
    backtest: {
      create: async ({ data }: any) => {
        const row = {
          id: `backtest-${runtime.backtests.length + 1}`,
          createdAt: now(),
          updatedAt: now(),
          ...data,
        };
        runtime.backtests.push(row);
        return row;
      },
    },
    backtestImport: {
      create: async () => {
        runtime.backtestImportCreateCount += 1;
        throw new Error('BacktestImport must not be created');
      },
    },
    aiSummary: {
      create: async () => {
        runtime.aiSummaryCreateCount += 1;
        throw new Error('AiSummary must not be created');
      },
    },
    pineScript: {
      create: async () => {
        runtime.pineScriptCreateCount += 1;
        throw new Error('PineScript must not be created');
      },
    },
    strategyOptimizationSession: {
      create: async () => {
        runtime.optimizationSessionCreateCount += 1;
        throw new Error('StrategyOptimizationSession must not be created');
      },
    },
  },
}));

async function buildApp() {
  const app = Fastify({ logger: false });
  app.setErrorHandler(errorHandler);
  await app.register(strategyVersionRoutes, { prefix: '/api/strategy-versions' });
  return app;
}

describe('internal backtest route', () => {
  beforeEach(() => {
    runtime = createRuntime();
  });

  it('runs the internal engine, persists only Backtest, and returns result summary', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/strategy-versions/ver-1/internal-backtests',
      payload: { symbol_id: 'sym-1' },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.data.backtest).toMatchObject({
      id: 'backtest-1',
      strategy_version_id: 'ver-1',
      execution_source: 'internal_backtest',
      market: '5253',
      timeframe: 'D',
      status: 'completed',
    });
    expect(body.data.detail_url).toBe('/backtests/backtest-1');
    expect(body.data.result_summary.metrics.trade_count).toBe(1);
    expect(body.data.result_summary.metrics.total_trades).toBe(1);
    expect(body.data.result_summary.metrics.final_equity).toBe(900000.4);
    expect(body.data.result_summary.metrics.total_return_percent).toBeCloseTo(-9.99996);
    expect(body.data.result_summary.metrics.net_profit).toBeCloseTo(-99999.6);
    expect(body.data.result_summary.metrics.max_drawdown).toBeCloseTo(99999.6);
    expect(body.data.result_summary.metrics.max_drawdown_percent).toBeCloseTo(10);
    expect(body.data.result_summary.metrics.average_trade).toBeCloseTo(-99999.6);
    expect(body.data.result_summary.period).toMatchObject({
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-01-04T00:00:00.000Z',
      bar_count: 4,
    });
    expect(body.data.result_summary.trade_period).toMatchObject({
      first_entry_at: '2026-01-03T00:00:00.000Z',
      last_exit_at: '2026-01-03T00:00:00.000Z',
      first_trade_at: '2026-01-03T00:00:00.000Z',
      last_trade_at: '2026-01-03T00:00:00.000Z',
    });
    expect(body.data.result_summary.trade_summary).toMatchObject({
      trade_count: 1,
      first_entry_at: '2026-01-03T00:00:00.000Z',
      last_exit_at: '2026-01-03T00:00:00.000Z',
    });
    expect(body.data.result_summary.trade_summary.exit_reason_counts).toEqual([
      { exit_reason: 'stop_loss', count: 1 },
    ]);
    expect(body.data.result_summary.trades_truncated).toBe(false);
    expect(body.data.result_summary.trades[0]).toMatchObject({
      trade_no: 1,
      entry_at: '2026-01-03T00:00:00.000Z',
      entry_signal_at: '2026-01-02T00:00:00.000Z',
      entry_fill_at: '2026-01-03T00:00:00.000Z',
      entry_signal_bar_time: '2026-01-02T00:00:00.000Z',
      entry_fill_bar_time: '2026-01-03T00:00:00.000Z',
      entry_bar_time: '2026-01-02T00:00:00.000Z',
      entry_price: 12,
      entry_reason: 'entry_signal',
      exit_at: '2026-01-03T00:00:00.000Z',
      exit_signal_at: '2026-01-03T00:00:00.000Z',
      exit_fill_at: '2026-01-03T00:00:00.000Z',
      exit_signal_bar_time: '2026-01-03T00:00:00.000Z',
      exit_fill_bar_time: '2026-01-03T00:00:00.000Z',
      exit_bar_time: '2026-01-03T00:00:00.000Z',
      exit_price: 10.8,
      exit_reason: 'stop_loss',
      quantity: 83333,
      gross_profit: -99999.6,
      net_profit: -99999.6,
      pnl: -99999.6,
      return_percent: -10,
      bars_held: 1,
    });
    expect(body.data.result_summary.trades[0].quantity).toBe(Number.parseInt(String(body.data.result_summary.trades[0].quantity), 10));
    expect(body.data.result_summary.trades[0].entry_debug.conditions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'entry_close_above_sma',
        label: 'close > sma_2',
        result: true,
      }),
    ]));
    expect(body.data.result_summary.trades[0].entry_debug.filters).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'filter_volume',
        label: 'volume >= volume_sma_2',
        result: true,
      }),
    ]));
    expect(body.data.result_summary.trades[0].exit_debug.conditions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'stop_loss',
        label: 'low <= stop_loss_price',
        result: true,
      }),
    ]));
    expect(body.data.result_summary.trades[0].exit_debug.triggered).toContain('stop_loss');
    expect(body.data.result_summary.assumptions.join(' ')).toContain('floor(cash / entry_price)');
    expect(body.data.result_summary.assumptions.join(' ')).toContain('100-share trading units are not supported');
    expect(body.data.result_summary.ignored_unsupported_features).toContain('consecutive_loss_skip');
    expect(body.data.result_summary.warnings.join(' ')).toContain('consecutive_loss_skip is ignored');

    expect(runtime.backtests).toHaveLength(1);
    expect(runtime.backtests[0].strategySnapshotJson.result_summary.metrics.final_equity).toBe(900000.4);
    expect(runtime.backtests[0].strategySnapshotJson.result_summary.trade_period.first_entry_at).toBe('2026-01-03T00:00:00.000Z');
    expect(runtime.backtests[0].strategySnapshotJson.execution_source).toBe('internal_backtest');
    expect(runtime.backtests[0].strategySnapshotJson.generated_pine).toBeNull();
    expect(res.body).not.toContain('raw pine should not be copied');
    expect(runtime.backtestImportCreateCount).toBe(0);
    expect(runtime.aiSummaryCreateCount).toBe(0);
    expect(runtime.pineScriptCreateCount).toBe(0);
    expect(runtime.optimizationSessionCreateCount).toBe(0);
  });

  it('stores an empty trade period when internal backtest has no trades', async () => {
    runtime = createRuntime(createVersion({
      normalizedRuleJson: createSpec({
        indicators: [{ id: 'rsi_14', type: 'RSI', length: 14 }],
        entry: {
          logic: 'all',
          conditions: [
            { id: 'entry_never', type: 'indicator_threshold', indicator: 'rsi_14', operator: '>', value: 1000 },
          ],
        },
        exit: {
          logic: 'any',
          conditions: [
            { id: 'exit_rsi', type: 'indicator_threshold', indicator: 'rsi_14', operator: '<', value: 45 },
          ],
        },
        risk: {},
        filters: [],
        validation: {
          supported_for_internal_backtest: true,
          unsupported_features: [],
          warnings: [],
          assumptions: [],
        },
      }),
    }));
    runtime.bars = createDailyBars(40);
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/strategy-versions/ver-1/internal-backtests',
      payload: { symbol_id: 'sym-1' },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.data.result_summary.metrics.total_trades).toBe(0);
    expect(body.data.result_summary.trade_period).toEqual({
      first_entry_at: null,
      last_exit_at: null,
      first_trade_at: null,
      last_trade_at: null,
    });
    expect(body.data.result_summary.trade_summary).toEqual({
      trade_count: 0,
      first_entry_at: null,
      last_exit_at: null,
      exit_reason_counts: [],
    });
    expect(body.data.result_summary.trades).toEqual([]);
    expect(body.data.result_summary.trades_truncated).toBe(false);
    expect(runtime.backtests[0].strategySnapshotJson.result_summary.trade_period.first_trade_at).toBeNull();
  });

  it('skips entry and records a diagnostic warning when integer quantity is zero', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/strategy-versions/ver-1/internal-backtests',
      payload: { symbol_id: 'sym-1', initial_capital: 5 },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.data.result_summary.metrics.total_trades).toBe(0);
    expect(body.data.result_summary.trades).toEqual([]);
    expect(body.data.result_summary.warnings.join(' ')).toContain('quantity is 0');
    expect(body.data.result_summary.assumptions.join(' ')).toContain('floor(cash / entry_price)');
  });

  it('accepts symbol code input and ignores canonical consecutive loss skip variants', async () => {
    runtime = createRuntime(createVersion({
      normalizedRuleJson: createSpec({
        validation: {
          supported_for_internal_backtest: false,
          unsupported_features: ['CONSECUTIVE_LOSS_SKIP_LOGIC'],
          warnings: ['連続損失によるエントリースキップ機能はサポート外です'],
          assumptions: ['long_only execution.'],
        },
        warnings: ['連続損失によるエントリースキップ機能はサポート外です'],
      }),
    }));
    const app = await buildApp();

    const specRes = await app.inject({
      method: 'GET',
      url: '/api/strategy-versions/ver-1/normalized-spec',
    });
    expect(specRes.statusCode).toBe(200);
    expect(JSON.parse(specRes.body).data.meta).toMatchObject({
      internal_backtest_ready: true,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/strategy-versions/ver-1/internal-backtests',
      payload: { symbol_id: '5253' },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.data.result_summary.ignored_unsupported_features).toEqual(['consecutive_loss_skip']);
    expect(body.data.result_summary.warnings.join(' ')).toContain('consecutive_loss_skip is ignored');
    expect(runtime.backtests[0].strategySnapshotJson.market_data).toMatchObject({
      symbol_id: 'sym-1',
      timeframe: 'D',
    });
  });

  it('runs expanded normalized specs with indicator ranges, indicator comparisons, ATR stops, and ignored MVP-only features', async () => {
    runtime = createRuntime(createVersion({
      normalizedRuleJson: createSpec({
        indicators: [
          { id: 'sma_25', type: 'SMA', length: 25 },
          { id: 'sma_75', type: 'SMA', length: 75 },
          { id: 'rsi_14', type: 'RSI', length: 14 },
          { id: 'atr_14', type: 'ATR', length: 14 },
          { id: 'volume_sma_20', type: 'VOLUME_SMA', length: 20 },
        ],
        entry: {
          logic: 'all',
          conditions: [
            { id: 'entry_cond_1', rule: '終値が25日SMAを上回る', type: 'price_vs_indicator', operator: '>', indicator: 'sma_25' },
            { id: 'entry_cond_2', rule: '25日SMAが75日SMAを上回る', type: 'indicator_vs_indicator', operator: '>', indicator: 'sma_25' },
            { id: 'entry_cond_3', rule: 'RSI14が50以上', type: 'indicator_range', value: 50, operator: '>=', indicator: 'rsi_14' },
            { id: 'entry_cond_4', rule: 'RSI14が70以下', type: 'indicator_range', value: 70, operator: '<=', indicator: 'rsi_14' },
          ],
        },
        exit: {
          logic: 'any',
          conditions: [
            { id: 'exit_cond_1', rule: '終値が25日SMAを下回る', type: 'price_vs_indicator', operator: '<', indicator: 'sma_25' },
            { id: 'exit_cond_2', rule: 'RSI14が45未満', type: 'indicator_threshold', value: 45, operator: '<', indicator: 'rsi_14' },
            { id: 'exit_cond_3', rule: '保有60営業日超かつ含み益がATR14の1.0倍未満', type: 'time_and_pnl' },
          ],
        },
        risk: {
          stop_loss: { type: 'atr_multiple', basis: 'entry_price', value: 2.5, direction: 'below', indicator_ref: 'atr_14' },
          time_exit: { bars: 60, type: 'bars', condition_note: 'PnL < 1.0 * ATR14 required for this exit to trigger' },
        },
        filters: [
          {
            id: 'filter_vol_1',
            rule: '出来高が20日平均出来高以上',
            type: 'volume_filter',
            operator: '>=',
            indicator: 'volume_sma_20',
            multiplier: 1,
          },
          {
            id: 'filter_event_1',
            rule: '決算イベント日は除外する',
            type: 'event_date_filter',
          },
        ],
        validation: {
          supported_for_internal_backtest: false,
          unsupported_features: [
            'complex_time_pnl_exit_logic',
            'conditional_time_exit_with_pnl_check',
            'gap_risk_slippage_management',
            'event_date_filtering',
            'earnings_gap_handling',
            'overfitting_check',
          ],
          warnings: ['複合的な時間・利益条件は標準的な単一条件として完全にはサポートされていません'],
          assumptions: ['ATRベースのストップロスはエントリー価格から下方に設定されます'],
        },
      }),
    }));
    runtime.bars = createDailyBars(100);
    const app = await buildApp();

    const specRes = await app.inject({
      method: 'GET',
      url: '/api/strategy-versions/ver-1/normalized-spec',
    });
    expect(specRes.statusCode).toBe(200);
    expect(JSON.parse(specRes.body).data.meta.internal_backtest_ready).toBe(true);

    const res = await app.inject({
      method: 'POST',
      url: '/api/strategy-versions/ver-1/internal-backtests',
      payload: { symbol_id: 'sym-1' },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.data.result_summary.period.bar_count).toBe(100);
    expect(body.data.result_summary.ignored_unsupported_features).toEqual(expect.arrayContaining([
      'complex_time_pnl_exit_logic',
      'conditional_time_exit_with_pnl_check',
      'gap_risk_slippage_management',
      'event_date_filtering',
      'earnings_gap_handling',
      'overfitting_check',
    ]));
    expect(body.data.result_summary.warnings.join(' ')).toContain('complex_time_pnl_exit_logic is ignored');
    expect(body.data.result_summary.metrics).toHaveProperty('total_trades');
    expect(runtime.backtests).toHaveLength(1);
    expect(res.body).not.toMatch(/secret|token|stack|Traceback|[A-Za-z]:\\|\/Users\/|\/home\//i);
  });

  it('returns safe validation errors for missing and unsupported specs', async () => {
    const app = await buildApp();
    runtime.versions.set('missing-spec', createVersion({ id: 'missing-spec', normalizedRuleJson: null }));
    runtime.versions.set('unsupported-spec', createVersion({ id: 'unsupported-spec', normalizedRuleJson: createSpec({ side: 'short_only' }) }));

    const missing = await app.inject({ method: 'POST', url: '/api/strategy-versions/missing-spec/internal-backtests', payload: { symbol_id: 'sym-1' } });
    expect(missing.statusCode).toBe(400);
    expect(JSON.parse(missing.body).error.details.reason).toBe('missing_spec');

    const unsupported = await app.inject({ method: 'POST', url: '/api/strategy-versions/unsupported-spec/internal-backtests', payload: { symbol_id: 'sym-1' } });
    expect(unsupported.statusCode).toBe(400);
    expect(JSON.parse(unsupported.body).error.details.reason).toBe('unsupported_spec');

    const serialized = `${missing.body}\n${unsupported.body}`;
    expect(serialized).not.toMatch(/secret|token|stack|Traceback|[A-Za-z]:\\|\/Users\/|\/home\//i);
  });

  it('requires symbol_id and applies date range and initial capital', async () => {
    const app = await buildApp();

    const missingSymbol = await app.inject({
      method: 'POST',
      url: '/api/strategy-versions/ver-1/internal-backtests',
      payload: {},
    });
    expect(missingSymbol.statusCode).toBe(400);
    expect(JSON.parse(missingSymbol.body).error.message).toContain('symbol_id is required');

    const res = await app.inject({
      method: 'POST',
      url: '/api/strategy-versions/ver-1/internal-backtests',
      payload: {
        symbol_id: 'sym-1',
        from: '2026-01-02',
        to: '2026-01-04',
        initial_capital: 500000,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.data.result_summary.period.from).toBe('2026-01-02T00:00:00.000Z');
    expect(body.data.result_summary.period.to).toBe('2026-01-04T00:00:00.000Z');
    expect(body.data.result_summary.period.bar_count).toBe(3);
    expect(body.data.result_summary.metrics.initial_capital).toBe(500000);
    expect(runtime.backtests).toHaveLength(1);
    expect(runtime.backtests[0].strategySnapshotJson.market_data).toMatchObject({
      symbol_id: 'sym-1',
      timeframe: 'D',
      source_type: 'market_price_bars',
    });
  });

  it('returns a safe validation error when market bars are missing', async () => {
    const app = await buildApp();
    runtime.bars = [];

    const res = await app.inject({
      method: 'POST',
      url: '/api/strategy-versions/ver-1/internal-backtests',
      payload: { symbol_id: 'sym-1' },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.details.reason).toBe('missing_market_bars');
    expect(body.error.message).toContain('No D market price bars');
    expect(res.body).not.toMatch(/secret|token|stack|Traceback|[A-Za-z]:\\|\/Users\/|\/home\//i);
  });
});
