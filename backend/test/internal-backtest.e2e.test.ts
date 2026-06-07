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
    expect(body.data.result_summary.metrics.final_equity).toBe(900000);
    expect(body.data.result_summary.metrics.total_return_percent).toBe(-10);
    expect(body.data.result_summary.metrics.net_profit).toBe(-100000);
    expect(body.data.result_summary.metrics.max_drawdown).toBe(100000);
    expect(body.data.result_summary.metrics.max_drawdown_percent).toBe(10);
    expect(body.data.result_summary.metrics.average_trade).toBe(-100000);
    expect(body.data.result_summary.period).toMatchObject({
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-01-04T00:00:00.000Z',
      bar_count: 4,
    });
    expect(body.data.result_summary.trades[0]).toMatchObject({
      entry_price: 12,
      exit_price: 10.8,
      exit_reason: 'stop_loss',
    });
    expect(body.data.result_summary.ignored_unsupported_features).toContain('consecutive_loss_skip');
    expect(body.data.result_summary.warnings.join(' ')).toContain('consecutive_loss_skip is ignored');

    expect(runtime.backtests).toHaveLength(1);
    expect(runtime.backtests[0].strategySnapshotJson.result_summary.metrics.final_equity).toBe(900000);
    expect(runtime.backtests[0].strategySnapshotJson.execution_source).toBe('internal_backtest');
    expect(runtime.backtests[0].strategySnapshotJson.generated_pine).toBeNull();
    expect(res.body).not.toContain('raw pine should not be copied');
    expect(runtime.backtestImportCreateCount).toBe(0);
    expect(runtime.aiSummaryCreateCount).toBe(0);
    expect(runtime.pineScriptCreateCount).toBe(0);
    expect(runtime.optimizationSessionCreateCount).toBe(0);
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
