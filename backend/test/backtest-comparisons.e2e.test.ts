import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../src/utils/response';
import { backtestComparisonRoutes } from '../src/routes/backtest-comparisons';

type BacktestRow = {
  id: string;
  title: string;
};

type BacktestImportRow = {
  id: string;
  backtestId: string;
  parsedSummaryJson: Record<string, unknown> | null;
};

type BacktestComparisonRow = {
  id: string;
  baseBacktestId: string;
  baseImportId: string;
  targetBacktestId: string;
  targetImportId: string;
  metricsDiffJson: Record<string, unknown>;
  tradeoffSummary: string;
  aiSummary: string | null;
  createdAt: Date;
};

type Runtime = {
  comparisonsSeq: number;
  backtests: Map<string, BacktestRow>;
  imports: Map<string, BacktestImportRow>;
  comparisons: Map<string, BacktestComparisonRow>;
};

let runtime: Runtime;

function createRuntime(): Runtime {
  return {
    comparisonsSeq: 1,
    backtests: new Map(),
    imports: new Map(),
    comparisons: new Map(),
  };
}

vi.mock('../src/db', () => {
  const prisma = {
    backtestImport: {
      findUnique: async ({ where, include }: any) => {
        const row = runtime.imports.get(where.id) ?? null;
        if (!row) return null;
        if (include?.backtest) {
          const backtest = runtime.backtests.get(row.backtestId) ?? null;
          if (!backtest) return null;
          return { ...row, backtest };
        }
        return row;
      },
    },
    backtestComparison: {
      create: async ({ data }: any) => {
        const id = `btc-${runtime.comparisonsSeq++}`;
        const createdAt = new Date('2026-04-18T00:00:00.000Z');
        const row: BacktestComparisonRow = {
          id,
          baseBacktestId: data.baseBacktestId,
          baseImportId: data.baseImportId,
          targetBacktestId: data.targetBacktestId,
          targetImportId: data.targetImportId,
          metricsDiffJson: data.metricsDiffJson,
          tradeoffSummary: data.tradeoffSummary,
          aiSummary: data.aiSummary ?? null,
          createdAt,
        };
        runtime.comparisons.set(id, row);
        return row;
      },
      findUnique: async ({ where }: any) => runtime.comparisons.get(where.id) ?? null,
    },
  };

  return { prisma };
});

async function createApp() {
  const app = Fastify({ logger: false });
  app.setErrorHandler(errorHandler);
  app.register(backtestComparisonRoutes, { prefix: '/api/backtest-comparisons' });
  await app.ready();
  return app;
}

describe('backtest comparisons api', () => {
  beforeEach(() => {
    runtime = createRuntime();
    runtime.backtests.set('bt-1', { id: 'bt-1', title: 'base run' });
    runtime.backtests.set('bt-2', { id: 'bt-2', title: 'target run' });
    runtime.imports.set('imp-1', {
      id: 'imp-1',
      backtestId: 'bt-1',
      parsedSummaryJson: {
        totalTrades: 100,
        winRate: 50,
        profitFactor: 1.2,
        maxDrawdown: -10,
        netProfit: 100000,
      },
    });
    runtime.imports.set('imp-2', {
      id: 'imp-2',
      backtestId: 'bt-2',
      parsedSummaryJson: {
        totalTrades: 120,
        winRate: 55,
        profitFactor: 1.4,
        maxDrawdown: -8,
        netProfit: 120000,
      },
    });
  });

  it('creates pairwise saved comparison with ai summary', async () => {
    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/backtest-comparisons',
      payload: {
        base_import_id: 'imp-1',
        target_import_id: 'imp-2',
        include_ai_summary: true,
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.data.comparison.comparison_id).toBe('btc-1');
    expect(body.data.comparison.metrics_diff.total_trades_diff).toBe(20);
    expect(body.data.comparison.metrics_diff.win_rate_diff_pt).toBe(5);
    expect(body.data.comparison.metrics_diff.profit_factor_diff).toBe(0.2);
    expect(body.data.comparison.metrics_diff.net_profit_diff).toBe(20000);
    expect(body.data.comparison.tradeoff_summary).toContain('総取引数差分');
    expect(typeof body.data.comparison.ai_summary).toBe('string');

    await app.close();
  });

  it('creates comparison without ai summary when disabled and supports get by id', async () => {
    const app = await createApp();
    const created = await app.inject({
      method: 'POST',
      url: '/api/backtest-comparisons',
      payload: {
        base_import_id: 'imp-1',
        target_import_id: 'imp-2',
        include_ai_summary: false,
      },
    });
    expect(created.statusCode).toBe(201);
    const comparisonId = created.json().data.comparison.comparison_id as string;
    expect(created.json().data.comparison.ai_summary).toBeNull();

    const found = await app.inject({
      method: 'GET',
      url: `/api/backtest-comparisons/${comparisonId}`,
    });
    expect(found.statusCode).toBe(200);
    expect(found.json().data.comparison.comparison_id).toBe(comparisonId);
    expect(found.json().data.comparison.metrics_diff.win_rate_diff_pt).toBe(5);

    await app.close();
  });

  it('returns validation error when imports are identical', async () => {
    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/backtest-comparisons',
      payload: {
        base_import_id: 'imp-1',
        target_import_id: 'imp-1',
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
    await app.close();
  });
});

