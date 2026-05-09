import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { symbolRoutes } from '../src/routes/symbols';
import { symbolStrategyApplicationRoutes } from '../src/routes/symbol-strategy-applications';
import { errorHandler } from '../src/utils/response';

const { enqueueInternalBacktestExecutionMock } = vi.hoisted(() => ({
  enqueueInternalBacktestExecutionMock: vi.fn(async () => ({ id: 'ibtx-job-1' })),
}));

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
  startedAt: Date | null;
  finishedAt: Date | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type BacktestRow = {
  id: string;
  strategyRuleVersionId: string;
  strategySnapshotJson: any;
  title: string;
  status: string;
  executionSource: string;
  market: string;
  timeframe: string;
  createdAt: Date;
  updatedAt: Date;
};

type BacktestImportRow = {
  id: string;
  backtestId: string;
  fileName: string;
  fileSize: number;
  contentType: string | null;
  rawCsvText: string;
  parseStatus: string;
  parseError: string | null;
  parsedSummaryJson: any;
  createdAt: Date;
  updatedAt: Date;
};

type InternalExecutionRow = {
  id: string;
  strategyRuleVersionId: string;
  status: string;
  requestedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  inputSnapshotJson: Record<string, unknown>;
  resultSummaryJson: Record<string, unknown> | null;
  artifactPointerJson: Record<string, unknown> | null;
  errorCode: string | null;
  errorMessage: string | null;
  engineVersion: string;
  createdAt: Date;
  updatedAt: Date;
};

type Runtime = {
  symbols: Map<string, SymbolRow>;
  strategies: Map<string, { id: string; title: string; status: string }>;
  versions: Map<string, {
    id: string;
    strategyRuleId: string;
    naturalLanguageRule: string;
    generatedPine: string | null;
    warningsJson: string[];
    assumptionsJson: string[];
    market: string;
    timeframe: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }>;
  applications: ApplicationRow[];
  runs: RunRow[];
  backtests: Map<string, BacktestRow>;
  backtestImports: Map<string, BacktestImportRow>;
  internalExecutions: Map<string, InternalExecutionRow>;
  nextApplicationId: number;
  nextBacktestId: number;
  nextBacktestImportId: number;
  nextInternalExecutionId: number;
  nextRunId: number;
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
      ['strategy-paused', { id: 'strategy-paused', title: 'Paused strategy', status: 'paused' }],
    ]),
    versions: new Map([
      ['version-1', {
        id: 'version-1',
        strategyRuleId: 'strategy-1',
        naturalLanguageRule: 'Buy breakout.',
        generatedPine: '//@version=5\nstrategy("Breakout")',
        warningsJson: [],
        assumptionsJson: [],
        market: 'TSE',
        timeframe: 'D',
        status: 'generated',
        createdAt,
        updatedAt,
      }],
      ['version-2', {
        id: 'version-2',
        strategyRuleId: 'strategy-1',
        naturalLanguageRule: 'Buy weekly breakout.',
        generatedPine: '//@version=5\nstrategy("Weekly Breakout")',
        warningsJson: [],
        assumptionsJson: [],
        market: 'TSE',
        timeframe: 'W',
        status: 'generated',
        createdAt,
        updatedAt,
      }],
      ['version-archived', {
        id: 'version-archived',
        strategyRuleId: 'strategy-archived',
        naturalLanguageRule: 'Archived setup.',
        generatedPine: null,
        warningsJson: [],
        assumptionsJson: [],
        market: 'TSE',
        timeframe: 'W',
        status: 'generated',
        createdAt,
        updatedAt,
      }],
      ['version-mismatch', {
        id: 'version-mismatch',
        strategyRuleId: 'strategy-archived',
        naturalLanguageRule: 'Mismatch setup.',
        generatedPine: null,
        warningsJson: [],
        assumptionsJson: [],
        market: 'TSE',
        timeframe: '60',
        status: 'generated',
        createdAt,
        updatedAt,
      }],
      ['version-paused', {
        id: 'version-paused',
        strategyRuleId: 'strategy-paused',
        naturalLanguageRule: 'Paused setup.',
        generatedPine: null,
        warningsJson: [],
        assumptionsJson: [],
        market: 'TSE',
        timeframe: 'D',
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
        startedAt: new Date('2026-05-02T00:00:00.000Z'),
        finishedAt: new Date('2026-05-02T00:00:00.000Z'),
        errorCode: null,
        errorMessage: null,
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
        startedAt: new Date('2026-05-03T00:00:00.000Z'),
        finishedAt: new Date('2026-05-03T00:00:00.000Z'),
        errorCode: null,
        errorMessage: null,
        createdAt: new Date('2026-05-03T00:00:00.000Z'),
        updatedAt: new Date('2026-05-03T00:00:00.000Z'),
      },
    ],
    backtests: new Map([
      ['backtest-1', {
        id: 'backtest-1',
        strategyRuleVersionId: 'version-1',
        strategySnapshotJson: {},
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
        strategyRuleVersionId: 'version-1',
        strategySnapshotJson: {},
        title: 'old report',
        status: 'ready',
        executionSource: 'tradingview',
        market: 'TSE',
        timeframe: 'D',
        createdAt: new Date('2026-05-02T00:00:00.000Z'),
        updatedAt: new Date('2026-05-02T00:00:00.000Z'),
      }],
    ]),
    backtestImports: new Map([
      ['import-old', {
        id: 'import-old',
        backtestId: 'backtest-old',
        fileName: 'old.csv',
        fileSize: 100,
        contentType: 'text/csv',
        rawCsvText: 'old',
        parseStatus: 'parsed',
        parseError: null,
        parsedSummaryJson: {},
        createdAt: new Date('2026-05-02T00:00:00.000Z'),
        updatedAt: new Date('2026-05-02T00:00:00.000Z'),
      }],
    ]),
    internalExecutions: new Map(),
    nextApplicationId: 2,
    nextBacktestId: 2,
    nextBacktestImportId: 2,
    nextInternalExecutionId: 2,
    nextRunId: 2,
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
      symbol: runtime.symbols.get(application.symbolId),
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

  const prisma: any = {
    $transaction: async (callback: any) => callback(prisma),
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
      findUnique: async ({ where }: any) => {
        const application = runtime.applications.find((row) => row.id === where.id);
        return application ? hydrateApplication(application) : null;
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
    backtest: {
      create: async ({ data }: any) => {
        const now = new Date('2026-05-05T00:00:00.000Z');
        const backtest: BacktestRow = {
          id: `backtest-created-${runtime.nextBacktestId++}`,
          strategyRuleVersionId: data.strategyRuleVersionId,
          strategySnapshotJson: data.strategySnapshotJson,
          title: data.title,
          executionSource: data.executionSource,
          market: data.market,
          timeframe: data.timeframe,
          status: data.status,
          createdAt: now,
          updatedAt: now,
        };
        runtime.backtests.set(backtest.id, backtest);
        return backtest;
      },
      update: async ({ where, data }: any) => {
        const backtest = runtime.backtests.get(where.id);
        if (!backtest) return null;
        const updated = {
          ...backtest,
          ...data,
          updatedAt: new Date('2026-05-05T00:01:00.000Z'),
        };
        runtime.backtests.set(updated.id, updated);
        return updated;
      },
    },
    backtestImport: {
      create: async ({ data }: any) => {
        const now = new Date('2026-05-05T00:02:00.000Z');
        const backtestImport: BacktestImportRow = {
          id: `import-created-${runtime.nextBacktestImportId++}`,
          backtestId: data.backtestId,
          fileName: data.fileName,
          fileSize: data.fileSize,
          contentType: data.contentType ?? null,
          rawCsvText: data.rawCsvText,
          parseStatus: data.parseStatus,
          parseError: data.parseError ?? null,
          parsedSummaryJson: data.parsedSummaryJson ?? null,
          createdAt: now,
          updatedAt: now,
        };
        runtime.backtestImports.set(backtestImport.id, backtestImport);
        return backtestImport;
      },
    },
    internalBacktestExecution: {
      create: async ({ data }: any) => {
        const now = new Date('2026-05-06T00:00:00.000Z');
        const execution: InternalExecutionRow = {
          id: `internal-created-${runtime.nextInternalExecutionId++}`,
          strategyRuleVersionId: data.strategyRuleVersionId,
          status: data.status ?? 'queued',
          requestedAt: now,
          startedAt: data.startedAt ?? null,
          finishedAt: data.finishedAt ?? null,
          inputSnapshotJson: data.inputSnapshotJson ?? {},
          resultSummaryJson: data.resultSummaryJson ?? null,
          artifactPointerJson: data.artifactPointerJson ?? null,
          errorCode: data.errorCode ?? null,
          errorMessage: data.errorMessage ?? null,
          engineVersion: data.engineVersion ?? 'ibtx-v0',
          createdAt: now,
          updatedAt: now,
        };
        runtime.internalExecutions.set(execution.id, execution);
        return execution;
      },
      update: async ({ where, data }: any) => {
        const execution = runtime.internalExecutions.get(where.id);
        if (!execution) throw new Error(`internal_execution_not_found:${where.id}`);
        const updated = {
          ...execution,
          ...data,
          updatedAt: new Date('2026-05-06T00:01:00.000Z'),
        };
        runtime.internalExecutions.set(updated.id, updated);
        return updated;
      },
    },
    symbolStrategyApplicationRun: {
      create: async ({ data }: any) => {
        const now = new Date('2026-05-05T00:03:00.000Z');
        const run: RunRow = {
          id: `run-created-${runtime.nextRunId++}`,
          applicationId: data.applicationId,
          runType: data.runType,
          status: data.status,
          backtestId: data.backtestId ?? null,
          backtestImportId: data.backtestImportId ?? null,
          internalBacktestExecutionId: data.internalBacktestExecutionId ?? null,
          startedAt: data.startedAt ?? null,
          finishedAt: data.finishedAt ?? null,
          errorCode: data.errorCode ?? null,
          errorMessage: data.errorMessage ?? null,
          createdAt: now,
          updatedAt: now,
        };
        runtime.runs.push(run);
        return run;
      },
    },
  };
  return { prisma };
});

vi.mock('../src/queue/internal-backtests', () => ({
  enqueueInternalBacktestExecution: enqueueInternalBacktestExecutionMock,
}));

async function createApp() {
  const app = Fastify({ logger: false });
  app.setErrorHandler(errorHandler);
  app.register(symbolRoutes, { prefix: '/api/symbols' });
  app.register(symbolStrategyApplicationRoutes, { prefix: '/api/symbol-strategy-applications' });
  await app.ready();
  return app;
}

describe('symbol strategy applications route', () => {
  beforeEach(() => {
    runtime = createRuntime();
    enqueueInternalBacktestExecutionMock.mockReset();
    enqueueInternalBacktestExecutionMock.mockResolvedValue({ id: 'ibtx-job-1' });
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

  it('rejects empty create payload identifiers', async () => {
    const app = await createApp();

    const emptyStrategy = await app.inject({
      method: 'POST',
      url: '/api/symbols/sym-1/strategy-applications',
      payload: {
        strategy_id: '  ',
        strategy_version_id: 'version-2',
      },
    });
    const emptyVersion = await app.inject({
      method: 'POST',
      url: '/api/symbols/sym-1/strategy-applications',
      payload: {
        strategy_id: 'strategy-1',
        strategy_version_id: '',
      },
    });

    expect(emptyStrategy.statusCode).toBe(400);
    expect(emptyStrategy.json().error.code).toBe('VALIDATION_ERROR');
    expect(emptyVersion.statusCode).toBe(400);
    expect(emptyVersion.json().error.code).toBe('VALIDATION_ERROR');

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
    const pausedStrategy = await app.inject({
      method: 'POST',
      url: '/api/symbols/sym-1/strategy-applications',
      payload: {
        strategy_id: 'strategy-paused',
        strategy_version_id: 'version-paused',
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
    expect(pausedStrategy.statusCode).toBe(400);
    expect(pausedStrategy.json().error.code).toBe('VALIDATION_ERROR');
    expect(mismatchedVersion.statusCode).toBe(400);
    expect(mismatchedVersion.json().error.code).toBe('VALIDATION_ERROR');

    await app.close();
  });

  it('returns 404 when creating an application for a missing symbol', async () => {
    const app = await createApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/symbols/missing-symbol/strategy-applications',
      payload: {
        strategy_id: 'strategy-1',
        strategy_version_id: 'version-2',
      },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');

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

  it('imports valid TradingView CSV for an active application and updates latest run', async () => {
    const app = await createApp();
    const csvText = [
      'Net Profit,Total Closed Trades,Percent Profitable,Profit Factor,Max Drawdown,From,To',
      '12345,12,58.3,1.7,-1234,2026-01-01,2026-02-01',
    ].join('\n');

    const res = await app.inject({
      method: 'POST',
      url: '/api/symbol-strategy-applications/app-1/csv-import',
      payload: {
        file_name: 'tradingview.csv',
        content_type: 'text/csv',
        csv_text: csvText,
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().data.application_id).toBe('app-1');
    expect(res.json().data.run).toMatchObject({
      run_type: 'csv_import',
      status: 'succeeded',
      internal_backtest_execution_id: null,
    });
    expect(res.json().data.backtest).toMatchObject({
      status: 'imported',
      execution_source: 'tradingview',
      market: 'TSE',
      timeframe: 'D',
    });
    expect(res.json().data.import).toMatchObject({
      file_name: 'tradingview.csv',
      content_type: 'text/csv',
      parse_status: 'parsed',
      parse_error: null,
    });

    const listRes = await app.inject({
      method: 'GET',
      url: '/api/symbols/sym-1/strategy-applications?status=active',
    });
    const application = listRes.json().data.applications[0];
    expect(application.latest_run).toMatchObject({
      run_type: 'csv_import',
      status: 'succeeded',
      backtest_id: res.json().data.backtest.id,
      backtest_import_id: res.json().data.import.id,
    });
    expect(application.latest_backtest_report).toMatchObject({
      id: res.json().data.backtest.id,
      status: 'imported',
      execution_source: 'tradingview',
    });
    expect(application.run_count).toBe(3);

    await app.close();
  });

  it('stores failed CSV parse as failed import and failed application run', async () => {
    const app = await createApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/symbol-strategy-applications/app-1/csv-import',
      payload: {
        file_name: 'broken.csv',
        csv_text: 'not,a,supported,csv\n1,2,3,4',
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().data.run).toMatchObject({
      run_type: 'csv_import',
      status: 'failed',
    });
    expect(res.json().data.backtest.status).toBe('import_failed');
    expect(res.json().data.import).toMatchObject({
      file_name: 'broken.csv',
      parse_status: 'failed',
    });
    expect(res.json().data.import.parse_error).toBeTruthy();

    await app.close();
  });

  it('rejects invalid CSV import requests', async () => {
    const app = await createApp();

    const missingApplication = await app.inject({
      method: 'POST',
      url: '/api/symbol-strategy-applications/missing-app/csv-import',
      payload: {
        file_name: 'tradingview.csv',
        csv_text: 'a,b\n1,2',
      },
    });
    const archivedApplication = await app.inject({
      method: 'POST',
      url: '/api/symbol-strategy-applications/app-archived/csv-import',
      payload: {
        file_name: 'tradingview.csv',
        csv_text: 'a,b\n1,2',
      },
    });
    const emptyFileName = await app.inject({
      method: 'POST',
      url: '/api/symbol-strategy-applications/app-1/csv-import',
      payload: {
        file_name: '  ',
        csv_text: 'a,b\n1,2',
      },
    });
    const emptyCsvText = await app.inject({
      method: 'POST',
      url: '/api/symbol-strategy-applications/app-1/csv-import',
      payload: {
        file_name: 'tradingview.csv',
        csv_text: '',
      },
    });

    expect(missingApplication.statusCode).toBe(404);
    expect(missingApplication.json().error.code).toBe('NOT_FOUND');
    expect(archivedApplication.statusCode).toBe(400);
    expect(archivedApplication.json().error.code).toBe('VALIDATION_ERROR');
    expect(emptyFileName.statusCode).toBe(400);
    expect(emptyFileName.json().error.code).toBe('VALIDATION_ERROR');
    expect(emptyCsvText.statusCode).toBe(400);
    expect(emptyCsvText.json().error.code).toBe('VALIDATION_ERROR');

    await app.close();
  });

  it('starts internal backtest for an active application and updates latest run', async () => {
    runtime.runs = [];
    const app = await createApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/symbol-strategy-applications/app-1/internal-backtests',
      payload: {
        data_range: { from: '2025-01-01', to: '2026-01-01' },
        engine_config: { summary_mode: 'engine_estimated' },
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().data.application_id).toBe('app-1');
    expect(res.json().data.execution).toMatchObject({
      strategy_rule_version_id: 'version-1',
      status: 'queued',
    });
    expect(res.json().data.run).toMatchObject({
      run_type: 'internal_backtest',
      status: 'queued',
      backtest_id: null,
      backtest_import_id: null,
      internal_backtest_execution_id: res.json().data.execution.id,
    });
    expect(enqueueInternalBacktestExecutionMock).toHaveBeenCalledWith(res.json().data.execution.id);
    const savedExecution = runtime.internalExecutions.get(res.json().data.execution.id);
    expect(savedExecution?.inputSnapshotJson.execution_target).toMatchObject({
      symbol: '2148',
      source_kind: 'daily_ohlcv',
    });

    const listRes = await app.inject({
      method: 'GET',
      url: '/api/symbols/sym-1/strategy-applications?status=active',
    });
    const application = listRes.json().data.applications[0];
    expect(application.latest_run).toMatchObject({
      run_type: 'internal_backtest',
      status: 'queued',
      backtest_id: null,
      backtest_import_id: null,
      internal_backtest_execution_id: res.json().data.execution.id,
    });
    expect(application.latest_backtest_report).toBeNull();
    expect(application.run_count).toBe(1);

    await app.close();
  });

  it('rejects invalid internal backtest requests', async () => {
    const app = await createApp();

    const missingApplication = await app.inject({
      method: 'POST',
      url: '/api/symbol-strategy-applications/missing-app/internal-backtests',
      payload: {
        data_range: { from: '2025-01-01', to: '2026-01-01' },
      },
    });
    const archivedApplication = await app.inject({
      method: 'POST',
      url: '/api/symbol-strategy-applications/app-archived/internal-backtests',
      payload: {
        data_range: { from: '2025-01-01', to: '2026-01-01' },
      },
    });
    const invalidBody = await app.inject({
      method: 'POST',
      url: '/api/symbol-strategy-applications/app-1/internal-backtests',
      payload: {
        data_range: { from: '2025/01/01', to: '2026-01-01' },
      },
    });

    expect(missingApplication.statusCode).toBe(404);
    expect(missingApplication.json().error.code).toBe('NOT_FOUND');
    expect(archivedApplication.statusCode).toBe(400);
    expect(archivedApplication.json().error.code).toBe('VALIDATION_ERROR');
    expect(invalidBody.statusCode).toBe(400);
    expect(invalidBody.json().error.code).toBe('VALIDATION_ERROR');

    await app.close();
  });

  it('marks internal execution failed when application enqueue fails', async () => {
    const app = await createApp();
    enqueueInternalBacktestExecutionMock.mockRejectedValueOnce(new Error('redis_down'));

    const res = await app.inject({
      method: 'POST',
      url: '/api/symbol-strategy-applications/app-1/internal-backtests',
      payload: {
        data_range: { from: '2025-01-01', to: '2026-01-01' },
      },
    });

    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('QUEUE_ENQUEUE_FAILED');
    const failedExecution = [...runtime.internalExecutions.values()][0];
    expect(failedExecution.status).toBe('failed');
    expect(failedExecution.errorCode).toBe('QUEUE_ENQUEUE_FAILED');
    expect(runtime.runs.some((run) => run.internalBacktestExecutionId === failedExecution.id)).toBe(false);

    await app.close();
  });
});
