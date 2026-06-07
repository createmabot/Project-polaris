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
  pineScriptCreateCount: number;
  backtestCreateCount: number;
  aiSummaryCreateCount: number;
  optimizationSessionCreateCount: number;
};

let runtime: Runtime;

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
