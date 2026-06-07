import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strategyVersionRoutes } from '../src/routes/strategy-versions';
import { errorHandler } from '../src/utils/response';

type VersionRow = {
  id: string;
  normalizedRuleJson: unknown;
  generatedPine: string | null;
};

type Runtime = {
  versions: Map<string, VersionRow>;
  pineScriptCreateCount: number;
  backtestCreateCount: number;
  aiSummaryCreateCount: number;
  optimizationSessionCreateCount: number;
};

let runtime: Runtime;

function createSpec(overrides: Record<string, unknown> = {}) {
  return {
    schema_name: 'normalized_strategy_spec',
    schema_version: '1.0',
    market: 'JP_STOCK',
    timeframe: 'D',
    side: 'long_only',
    strategy_family: 'ma_rsi_volume_momentum',
    indicators: [
      { id: 'sma_25', type: 'SMA', length: 25 },
      { id: 'rsi_14', type: 'RSI', length: 14 },
      { id: 'volume_sma_20', type: 'VOLUME_SMA', length: 20 },
    ],
    entry: {
      logic: 'all',
      conditions: [
        { id: 'entry_close_above_sma_25', type: 'price_vs_indicator', left: 'close', operator: '>', indicator: 'sma_25' },
        { id: 'entry_rsi_14_gte_50', type: 'indicator_threshold', indicator: 'rsi_14', operator: '>=', value: 50 },
      ],
    },
    exit: {
      logic: 'any',
      conditions: [
        { id: 'exit_close_below_sma_25', type: 'price_vs_indicator', left: 'close', operator: '<', indicator: 'sma_25' },
      ],
    },
    risk: {
      stop_loss: { type: 'percent', value: 5, basis: 'entry_price', direction: 'below_entry' },
    },
    filters: [
      {
        id: 'filter_volume_20',
        type: 'volume_filter',
        left: 'volume',
        operator: '>=',
        right: { indicator: 'volume_sma_20', multiplier: 1.5 },
      },
    ],
    validation: {
      supported_for_internal_backtest: false,
      unsupported_features: [],
      warnings: [],
      assumptions: [],
    },
    warnings: [],
    assumptions: [],
    ...overrides,
  };
}

function createPine(overrides = '') {
  return [
    '//@version=6',
    'strategy("alignment")',
    'sma25 = ta.sma(close, 25)',
    'rsi14 = ta.rsi(close, 14)',
    'vol20 = ta.sma(volume, 20)',
    'entryCondition = close > sma25 and rsi14 >= 50 and volume >= vol20 * 1.5',
    'if entryCondition',
    '    strategy.entry("L", strategy.long)',
    'if close < sma25',
    '    strategy.close("L")',
    'entryPrice = strategy.position_avg_price',
    'strategy.exit("XL", "L", stop = entryPrice * (1 - 5 / 100))',
    overrides,
  ].join('\n');
}

function createRuntime(version: VersionRow): Runtime {
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
  return { prisma, Prisma: {} };
});

async function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(strategyVersionRoutes, { prefix: '/api/strategy-versions' });
  return app;
}

function expectNoUnsafeText(value: unknown) {
  const serialized = JSON.stringify(value);
  expect(serialized).not.toContain('raw prompt');
  expect(serialized).not.toContain('provider response');
  expect(serialized).not.toContain('/api/');
  expect(serialized).not.toContain('SECRET_VALUE');
  expect(serialized).not.toContain('token=');
  expect(serialized).not.toContain('C:\\Users\\');
  expect(serialized).not.toContain('stack trace');
}

describe('strategy implementation alignment endpoint', () => {
  beforeEach(() => {
    runtime = createRuntime({
      id: 'ver-1',
      normalizedRuleJson: createSpec(),
      generatedPine: createPine(),
    });
  });

  it('returns unavailable when generated Pine is missing', async () => {
    runtime = createRuntime({ id: 'ver-1', normalizedRuleJson: createSpec(), generatedPine: null });
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/api/strategy-versions/ver-1/implementation-alignment' });
    await app.close();

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.status).toBe('unavailable');
    expect(body.data.reason).toBe('generated Pine is missing.');
    expect(body.data.warnings.join(' / ')).toContain('Pineが未生成');
  });

  it('returns unavailable when normalized spec is missing', async () => {
    runtime = createRuntime({ id: 'ver-1', normalizedRuleJson: null, generatedPine: createPine() });
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/api/strategy-versions/ver-1/implementation-alignment' });
    await app.close();

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.status).toBe('unavailable');
    expect(body.data.reason).toBe('normalized strategy spec is missing.');
    expect(body.data.warnings.join(' / ')).toContain('構造化specが未生成');
  });

  it('returns a warning or ok report when Pine and spec share SMA RSI volume and stop semantics', async () => {
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/api/strategy-versions/ver-1/implementation-alignment' });
    await app.close();

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(['ok', 'warning']).toContain(body.data.status);
    expect(body.data.schema_name).toBe('strategy_implementation_alignment');
    expect(body.data.schema_version).toBe('1.0');
    expect(body.data.matched.some((item: any) => item.label.includes('SMA 25'))).toBe(true);
    expect(body.data.matched.some((item: any) => item.spec.includes('rsi_14 >= 50'))).toBe(true);
    expect(body.data.matched.some((item: any) => item.spec.includes('volume >= volume_sma_20 * 1.5'))).toBe(true);
    expect(body.data.matched.some((item: any) => item.spec.includes('stop_loss percent 5'))).toBe(true);
    expectNoUnsafeText(body.data);
  });

  it('detects missing_in_pine when spec has a volume filter but Pine lacks it', async () => {
    runtime = createRuntime({
      id: 'ver-1',
      normalizedRuleJson: createSpec(),
      generatedPine: createPine().replace(' and volume >= vol20 * 1.5', ''),
    });
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/api/strategy-versions/ver-1/implementation-alignment' });
    await app.close();

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.status).toBe('warning');
    expect(body.data.missing_in_pine.some((item: any) => item.spec.includes('volume_sma_20 * 1.5'))).toBe(true);
  });

  it('detects mismatch when spec has RSI threshold but Pine uses crossover', async () => {
    runtime = createRuntime({
      id: 'ver-1',
      normalizedRuleJson: createSpec(),
      generatedPine: createPine().replace('rsi14 >= 50', 'ta.crossover(rsi14, 50)'),
    });
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/api/strategy-versions/ver-1/implementation-alignment' });
    await app.close();

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.status).toBe('warning');
    expect(body.data.mismatches.some((item: any) => item.message === 'RSI condition differs between spec and Pine.')).toBe(true);
  });

  it('does not create PineScript, Backtest, AiSummary, or OptimizationSession records', async () => {
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/api/strategy-versions/ver-1/implementation-alignment' });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(runtime.pineScriptCreateCount).toBe(0);
    expect(runtime.backtestCreateCount).toBe(0);
    expect(runtime.aiSummaryCreateCount).toBe(0);
    expect(runtime.optimizationSessionCreateCount).toBe(0);
  });
});
