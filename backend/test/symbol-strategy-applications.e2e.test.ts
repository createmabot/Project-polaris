import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { symbolRoutes } from '../src/routes/symbols';
import { errorHandler } from '../src/utils/response';

type SymbolRow = {
  id: string;
  symbol: string;
  symbolCode: string | null;
  displayName: string | null;
  marketCode: string | null;
  tradingviewSymbol: string | null;
};

type ApplicationRow = {
  id: string;
  symbolId: string;
  strategyRuleId: string;
  strategyRuleVersionId: string;
  status: string;
  source: string;
  memo: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type RunRow = {
  id: string;
  applicationId: string;
  runType: string;
  status: string;
  backtestId: string | null;
  backtestImportId: string | null;
  internalBacktestExecutionId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type BacktestRow = {
  id: string;
  title: string;
  status: string;
  executionSource: string;
  market: string;
  timeframe: string;
  createdAt: Date;
  updatedAt: Date;
};

type Runtime = {
  symbols: Map<string, SymbolRow>;
  strategies: Map<string, { id: string; title: string; status: string }>;
  versions: Map<string, {
    id: string;
    strategyRuleId: string;
    market: string;
    timeframe: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }>;
  applications: ApplicationRow[];
  runs: RunRow[];
  backtests: Map<string, BacktestRow>;
  nextApplicationId: number;
};

let runtime: Runtime;

function createRuntime(): Runtime {
  const createdAt = new Date('2026-05-01T00:00:00.000Z');
  const updatedAt = new Date('2026-05-02T00:00:00.000Z');
  return {
    symbols: new Map([
      ['sym-1', {
        id: 'sym-1',
        symbol: 'TSE:2148',
        symbolCode: '2148',
        displayName: 'Sample Corp',
        marketCode: 'TSE',
        tradingviewSymbol: 'TSE:2148',
      }],
    ]),
    strategies: new Map([
      ['strategy-1', { id: 'strategy-1', title: 'Breakout strategy', status: 'active' }],
      ['strategy-archived', { id: 'strategy-archived', title: 'Archived strategy', status: 'archived' }],
    ]),
    versions: new Map([
      ['version-1', {
        id: 'version-1',
        strategyRuleId: 'strategy-1',
        market: 'TSE',
        timeframe: 'D',
        status: 'generated',
        createdAt,
        updatedAt,
      }],
      ['version-2', {
        id: 'version-2',
        strategyRuleId: 'strategy-1',
        market: 'TSE',
        timeframe: 'W',
        status: 'generated',
        createdAt,
        updatedAt,
      }],
      ['version-archived', {
        id: 'version-archived',
        strategyRuleId: 'strategy-archived',
        market: 'TSE',
        timeframe: 'W',
        status: 'generated',
        createdAt,
        updatedAt,
      }],
      ['version-mismatch', {
        id: 'version-mismatch',
        strategyRuleId: 'strategy-archived',
        market: 'TSE',
        timeframe: '60',
        status: 'generated',
        createdAt,
        updatedAt,
      }],
    ]),
    applications: [
      {
        id: 'app-1',
        symbolId: 'sym-1',
        strategyRuleId: 'strategy-1',
        strategyRuleVersionId: 'version-1',
        status: 'active',
        source: 'manual',
        memo: null,
        createdAt,
        updatedAt,
      },
      {
        id: 'app-archived',
        symbolId: 'sym-1',
        strategyRuleId: 'strategy-archived',
        strategyRuleVersionId: 'version-archived',
        status: 'archived',
        source: 'manual',
        memo: 'old setup',
        createdAt: new Date('2026-04-01T00:00:00.000Z'),
        updatedAt: new Date('2026-04-02T00:00:00.000Z'),
      },
    ],
    runs: [
      {
        id: 'run-old',
        applicationId: 'app-1',
        runType: 'csv_import',
        status: 'succeeded',
        backtestId: 'backtest-old',
        backtestImportId: 'import-old',
        internalBacktestExecutionId: null,
        createdAt: new Date('2026-05-02T00:00:00.000Z'),
        updatedAt: new Date('2026-05-02T00:00:00.000Z'),
      },
      {
        id: 'run-latest',
        applicationId: 'app-1',
        runType: 'internal_backtest',
        status: 'succeeded',
        backtestId: 'backtest-1',
        backtestImportId: null,
        internalBacktestExecutionId: 'internal-1',
        createdAt: new Date('2026-05-03T00:00:00.000Z'),
        updatedAt: new Date('2026-05-03T00:00:00.000Z'),
      },
    ],
    backtests: new Map([
      ['backtest-1', {
        id: 'backtest-1',
        title: '2148 breakout report',
        status: 'ready',
        executionSource: 'internal',
        market: 'TSE',
        timeframe: 'D',
        createdAt: new Date('2026-05-03T00:00:00.000Z'),
        updatedAt: new Date('2026-05-03T00:00:00.000Z'),
      }],
      ['backtest-old', {
        id: 'backtest-old',
        title: 'old report',
        status: 'ready',
        executionSource: 'tradingview',
        market: 'TSE',
        timeframe: 'D',
        createdAt: new Date('2026-05-02T00:00:00.000Z'),
        updatedAt: new Date('2026-05-02T00:00:00.000Z'),
      }],
    ]),
    nextApplicationId: 2,
  };
}

function filterApplications(where: any): ApplicationRow[] {
  return runtime.applications.filter((application) => {
    if (where?.symbolId && application.symbolId !== where.symbolId) return false;
    if (where?.status && application.status !== where.status) return false;
    if (where?.strategyRuleVersionId && application.strategyRuleVersionId !== where.strategyRuleVersionId) {
      return false;
    }
    return true;
  });
}

vi.mock('../src/db', () => {
  function hydrateApplication(application: ApplicationRow) {
    const runs = runtime.runs
      .filter((run) => run.applicationId === application.id)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const latestRun = runs[0] ?? null;
    return {
      ...application,
      strategyRule: runtime.strategies.get(application.strategyRuleId),
      strategyRuleVersion: runtime.versions.get(application.strategyRuleVersionId),
      _count: { runs: runs.length },
      runs: latestRun
        ? [{
            ...latestRun,
            backtest: latestRun.backtestId ? runtime.backtests.get(latestRun.backtestId) ?? null : null,
          }]
        : [],
    };
  }

  const prisma = {
    symbol: {
      findUnique: async ({ where }: any) => runtime.symbols.get(where.id) ?? null,
    },
    strategyRule: {
      findUnique: async ({ where }: any) => runtime.strategies.get(where.id) ?? null,
    },
    strategyRuleVersion: {
      findUnique: async ({ where }: any) => runtime.versions.get(where.id) ?? null,
    },
    symbolStrategyApplication: {
      count: async ({ where }: any) => filterApplications(where).length,
      findMany: async ({ where, orderBy, skip, take }: any) => {
        let rows = filterApplications(where);
        if (orderBy?.createdAt === 'asc') {
          rows = rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        } else if (orderBy?.createdAt === 'desc') {
          rows = rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        } else if (orderBy?.updatedAt === 'asc') {
          rows = rows.sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());
        } else {
          rows = rows.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
        }
        const offset = Number.isInteger(skip) ? skip : 0;
        const limit = Number.isInteger(take) ? take : rows.length;
        return rows.slice(offset, offset + limit).map(hydrateApplication);
      },
      findFirst: async ({ where }: any) => {
        return filterApplications(where)[0] ?? null;
      },
      create: async ({ data }: any) => {
        const now = new Date('2026-05-04T00:00:00.000Z');
        const application: ApplicationRow = {
          id: `app-created-${runtime.nextApplicationId++}`,
          symbolId: data.symbolId,
          strategyRuleId: data.strategyRuleId,
          strategyRuleVersionId: data.strategyRuleVersionId,
          status: data.status ?? 'active',
          source: data.source ?? 'manual',
          memo: data.memo ?? null,
          createdAt: now,
          updatedAt: now,
        };
        runtime.applications.push(application);
        return hydrateApplication(application);
      },
    },
  };
  return { prisma };
});

async function createApp() {
  const app = Fastify({ logger: false });
  app.setErrorHandler(errorHandler);
  app.register(symbolRoutes, { prefix: '/api/symbols' });
  await app.ready();
  return app;
}

describe('symbol strategy applications route', () => {
  beforeEach(() => {
    runtime = createRuntime();
  });

  it('returns empty active applications for a symbol', async () => {
    runtime.applications = [];
    const app = await createApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/symbols/sym-1/strategy-applications',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.symbol.id).toBe('sym-1');
    expect(res.json().data.query.status).toBe('active');
    expect(res.json().data.pagination.total).toBe(0);
    expect(res.json().data.applications).toEqual([]);

    await app.close();
  });

  it('returns strategy, version, latest run, latest backtest report, and run count', async () => {
    const app = await createApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/symbols/sym-1/strategy-applications?status=active',
    });

    expect(res.statusCode).toBe(200);
    const application = res.json().data.applications[0];
    expect(application.id).toBe('app-1');
    expect(application.strategy).toEqual({
      id: 'strategy-1',
      title: 'Breakout strategy',
      status: 'active',
    });
    expect(application.strategy_version.id).toBe('version-1');
    expect(application.latest_run).toMatchObject({
      id: 'run-latest',
      run_type: 'internal_backtest',
      status: 'succeeded',
      backtest_id: 'backtest-1',
      backtest_import_id: null,
      internal_backtest_execution_id: 'internal-1',
    });
    expect(application.latest_backtest_report).toMatchObject({
      id: 'backtest-1',
      title: '2148 breakout report',
      execution_source: 'internal',
    });
    expect(application.run_count).toBe(2);

    await app.close();
  });

  it('filters archived applications', async () => {
    const app = await createApp();

    const activeRes = await app.inject({
      method: 'GET',
      url: '/api/symbols/sym-1/strategy-applications?status=active',
    });
    const archivedRes = await app.inject({
      method: 'GET',
      url: '/api/symbols/sym-1/strategy-applications?status=archived',
    });

    expect(activeRes.statusCode).toBe(200);
    expect(activeRes.json().data.applications.map((application: any) => application.id)).toEqual(['app-1']);
    expect(archivedRes.statusCode).toBe(200);
    expect(archivedRes.json().data.applications.map((application: any) => application.id)).toEqual(['app-archived']);

    await app.close();
  });

  it('rejects invalid query params', async () => {
    const app = await createApp();

    const invalidStatus = await app.inject({
      method: 'GET',
      url: '/api/symbols/sym-1/strategy-applications?status=deleted',
    });
    const invalidPage = await app.inject({
      method: 'GET',
      url: '/api/symbols/sym-1/strategy-applications?page=0',
    });
    const invalidSort = await app.inject({
      method: 'GET',
      url: '/api/symbols/sym-1/strategy-applications?sort=title',
    });

    expect(invalidStatus.statusCode).toBe(400);
    expect(invalidStatus.json().error.code).toBe('VALIDATION_ERROR');
    expect(invalidPage.statusCode).toBe(400);
    expect(invalidSort.statusCode).toBe(400);

    await app.close();
  });

  it('creates a manual active application for a symbol and strategy version', async () => {
    const app = await createApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/symbols/sym-1/strategy-applications',
      payload: {
        strategy_id: 'strategy-1',
        strategy_version_id: 'version-2',
        memo: '  watch weekly setup  ',
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().data.symbol.id).toBe('sym-1');
    expect(res.json().data.application).toMatchObject({
      status: 'active',
      source: 'manual',
      memo: 'watch weekly setup',
      strategy: {
        id: 'strategy-1',
        title: 'Breakout strategy',
        status: 'active',
      },
      strategy_version: {
        id: 'version-2',
        market: 'TSE',
        timeframe: 'W',
        status: 'generated',
      },
      latest_run: null,
      latest_backtest_report: null,
      run_count: 0,
    });
    expect(runtime.applications.some((application) => (
      application.symbolId === 'sym-1'
      && application.strategyRuleId === 'strategy-1'
      && application.strategyRuleVersionId === 'version-2'
      && application.status === 'active'
      && application.memo === 'watch weekly setup'
    ))).toBe(true);

    await app.close();
  });

  it('rejects invalid create payload references and archived strategies', async () => {
    const app = await createApp();

    const missingStrategy = await app.inject({
      method: 'POST',
      url: '/api/symbols/sym-1/strategy-applications',
      payload: {
        strategy_id: 'missing-strategy',
        strategy_version_id: 'version-2',
      },
    });
    const missingVersion = await app.inject({
      method: 'POST',
      url: '/api/symbols/sym-1/strategy-applications',
      payload: {
        strategy_id: 'strategy-1',
        strategy_version_id: 'missing-version',
      },
    });
    const archivedStrategy = await app.inject({
      method: 'POST',
      url: '/api/symbols/sym-1/strategy-applications',
      payload: {
        strategy_id: 'strategy-archived',
        strategy_version_id: 'version-archived',
      },
    });
    const mismatchedVersion = await app.inject({
      method: 'POST',
      url: '/api/symbols/sym-1/strategy-applications',
      payload: {
        strategy_id: 'strategy-1',
        strategy_version_id: 'version-mismatch',
      },
    });

    expect(missingStrategy.statusCode).toBe(404);
    expect(missingStrategy.json().error.code).toBe('NOT_FOUND');
    expect(missingVersion.statusCode).toBe(404);
    expect(missingVersion.json().error.code).toBe('NOT_FOUND');
    expect(archivedStrategy.statusCode).toBe(400);
    expect(archivedStrategy.json().error.code).toBe('VALIDATION_ERROR');
    expect(mismatchedVersion.statusCode).toBe(400);
    expect(mismatchedVersion.json().error.code).toBe('VALIDATION_ERROR');

    await app.close();
  });

  it('rejects duplicate active application for the same symbol and strategy version', async () => {
    const app = await createApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/symbols/sym-1/strategy-applications',
      payload: {
        strategy_id: 'strategy-1',
        strategy_version_id: 'version-1',
      },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('CONFLICT');

    await app.close();
  });

  it('returns 404 when symbol does not exist', async () => {
    const app = await createApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/symbols/missing-symbol/strategy-applications',
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');

    await app.close();
  });
});
