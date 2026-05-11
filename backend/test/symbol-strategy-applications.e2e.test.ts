import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { symbolRoutes } from '../src/routes/symbols';
import { symbolStrategyApplicationRoutes } from '../src/routes/symbol-strategy-applications';
import { strategyRoutes } from '../src/routes/strategies';
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
  simulateReportLinkRace: { runId: string; backtestId: string } | null;
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
    simulateReportLinkRace: null,
  };
}

function filterApplications(where: any): ApplicationRow[] {
  function matchesRunFilter(run: RunRow, filter: any): boolean {
    if (filter?.backtestId?.not === null && run.backtestId === null) return false;
    if (filter?.runType && run.runType !== filter.runType) return false;
    return true;
  }

  function matchesRunCondition(application: ApplicationRow, condition: any): boolean {
    if (condition?.some) {
      return runtime.runs.some((run) => (
        run.applicationId === application.id && matchesRunFilter(run, condition.some)
      ));
    }
    if (condition?.none) {
      return !runtime.runs.some((run) => (
        run.applicationId === application.id && matchesRunFilter(run, condition.none)
      ));
    }
    return true;
  }

  return runtime.applications.filter((application) => {
    if (where?.id?.not && application.id === where.id.not) return false;
    if (typeof where?.id === 'string' && application.id !== where.id) return false;
    if (where?.symbolId && application.symbolId !== where.symbolId) return false;
    if (where?.strategyRuleId && application.strategyRuleId !== where.strategyRuleId) return false;
    if (where?.status && application.status !== where.status) return false;
    if (where?.strategyRuleVersionId && application.strategyRuleVersionId !== where.strategyRuleVersionId) {
      return false;
    }
    if (where?.runs && !matchesRunCondition(application, where.runs)) {
      return false;
    }
    if (Array.isArray(where?.AND)) {
      for (const clause of where.AND) {
        if (clause?.runs && !matchesRunCondition(application, clause.runs)) {
          return false;
        }
      }
    }
    return true;
  });
}

vi.mock('../src/db', () => {
  function hydrateApplication(application: ApplicationRow) {
    const runs = runtime.runs
      .filter((run) => run.applicationId === application.id)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return {
      ...application,
      symbol: runtime.symbols.get(application.symbolId),
      strategyRule: runtime.strategies.get(application.strategyRuleId),
      strategyRuleVersion: runtime.versions.get(application.strategyRuleVersionId),
      _count: { runs: runs.length },
      runs: runs.map((run) => ({
        ...run,
        backtest: run.backtestId ? runtime.backtests.get(run.backtestId) ?? null : null,
      })),
    };
  }

  const prisma: any = {
    $transaction: async (callback: any) => {
      const snapshot = {
        applications: runtime.applications.map((application) => ({ ...application })),
        runs: runtime.runs.map((run) => ({ ...run })),
        backtests: new Map([...runtime.backtests.entries()].map(([key, value]) => [key, { ...value }])),
        backtestImports: new Map([...runtime.backtestImports.entries()].map(([key, value]) => [key, { ...value }])),
        internalExecutions: new Map([...runtime.internalExecutions.entries()].map(([key, value]) => [key, { ...value }])),
        nextApplicationId: runtime.nextApplicationId,
        nextBacktestId: runtime.nextBacktestId,
        nextBacktestImportId: runtime.nextBacktestImportId,
        nextInternalExecutionId: runtime.nextInternalExecutionId,
        nextRunId: runtime.nextRunId,
        simulateReportLinkRace: runtime.simulateReportLinkRace,
      };
      try {
        return await callback(prisma);
      } catch (error) {
        const race = runtime.simulateReportLinkRace;
        runtime.applications = snapshot.applications;
        runtime.runs = snapshot.runs;
        runtime.backtests = snapshot.backtests;
        runtime.backtestImports = snapshot.backtestImports;
        runtime.internalExecutions = snapshot.internalExecutions;
        runtime.nextApplicationId = snapshot.nextApplicationId;
        runtime.nextBacktestId = snapshot.nextBacktestId;
        runtime.nextBacktestImportId = snapshot.nextBacktestImportId;
        runtime.nextInternalExecutionId = snapshot.nextInternalExecutionId;
        runtime.nextRunId = snapshot.nextRunId;
        runtime.simulateReportLinkRace = snapshot.simulateReportLinkRace;
        if (race) {
          const run = runtime.runs.find((candidate) => candidate.id === race.runId);
          if (run) {
            run.backtestId = race.backtestId;
            run.updatedAt = new Date('2026-05-06T00:03:00.000Z');
          }
          runtime.simulateReportLinkRace = null;
        }
        throw error;
      }
    },
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
      update: async ({ where, data }: any) => {
        const index = runtime.applications.findIndex((row) => row.id === where.id);
        if (index < 0) return null;
        const updated = {
          ...runtime.applications[index],
          ...data,
          updatedAt: new Date('2026-05-07T00:00:00.000Z'),
        };
        runtime.applications[index] = updated;
        return hydrateApplication(updated);
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
      findUnique: async ({ where }: any) => runtime.backtests.get(where.id) ?? null,
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
      findUnique: async ({ where }: any) => runtime.internalExecutions.get(where.id) ?? null,
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
      findFirst: async ({ where }: any) => {
        return runtime.runs.find((run) => {
          if (where?.id && run.id !== where.id) return false;
          if (where?.applicationId && run.applicationId !== where.applicationId) return false;
          if (where?.runType && run.runType !== where.runType) return false;
          if ('backtestId' in (where ?? {}) && run.backtestId !== where.backtestId) return false;
          if (where?.internalBacktestExecutionId && run.internalBacktestExecutionId !== where.internalBacktestExecutionId) {
            return false;
          }
          return true;
        }) ?? null;
      },
      findMany: async ({ where }: any) => {
        return runtime.runs
          .filter((run) => {
            if (where?.applicationId?.in && !where.applicationId.in.includes(run.applicationId)) return false;
            if (where?.applicationId && !where.applicationId.in && run.applicationId !== where.applicationId) return false;
            if (where?.runType?.in && !where.runType.in.includes(run.runType)) return false;
            if (where?.runType && !where.runType.in && run.runType !== where.runType) return false;
            if (where?.backtestId?.not === null && run.backtestId === null) return false;
            return true;
          })
          .map((run) => ({
            ...run,
            backtest: run.backtestId ? runtime.backtests.get(run.backtestId) ?? null : null,
          }));
      },
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
      updateMany: async ({ where, data }: any) => {
        if (runtime.simulateReportLinkRace?.runId === where.id) {
          return { count: 0 };
        }
        let count = 0;
        runtime.runs = runtime.runs.map((run) => {
          if (where?.id && run.id !== where.id) return run;
          if ('backtestId' in (where ?? {}) && run.backtestId !== where.backtestId) return run;
          count += 1;
          return {
            ...run,
            ...data,
            updatedAt: new Date('2026-05-06T00:02:00.000Z'),
          };
        });
        return { count };
      },
      update: async ({ where, data }: any) => {
        const index = runtime.runs.findIndex((run) => run.id === where.id);
        if (index < 0) throw new Error(`run_not_found:${where.id}`);
        const updated = {
          ...runtime.runs[index],
          ...data,
          updatedAt: new Date('2026-05-06T00:02:00.000Z'),
        };
        runtime.runs[index] = updated;
        return updated;
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
  app.register(strategyRoutes, { prefix: '/api/strategies' });
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
    expect(application.latest_reports_by_source).toMatchObject({
      csv_import: {
        backtest_id: 'backtest-old',
        title: 'old report',
        execution_source: 'tradingview',
        run_type: 'csv_import',
        run_status: 'succeeded',
      },
      internal_backtest: {
        backtest_id: 'backtest-1',
        title: '2148 breakout report',
        execution_source: 'internal',
        run_type: 'internal_backtest',
        run_status: 'succeeded',
      },
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

  it('filters symbol applications by status all and report presence', async () => {
    const strategyFilterId = '00000000-0000-4000-8000-000000009001';
    const mismatchedStrategyFilterId = '00000000-0000-4000-8000-000000009002';
    const versionFilterReportId = '00000000-0000-4000-8000-000000009101';
    const versionFilterNoReportId = '00000000-0000-4000-8000-000000009102';
    runtime.strategies.set(strategyFilterId, { id: strategyFilterId, title: 'Filter strategy', status: 'active' });
    runtime.strategies.set(mismatchedStrategyFilterId, { id: mismatchedStrategyFilterId, title: 'Mismatched strategy', status: 'active' });
    runtime.versions.set(versionFilterReportId, {
      id: versionFilterReportId,
      strategyRuleId: strategyFilterId,
      naturalLanguageRule: 'Filter report setup.',
      generatedPine: null,
      warningsJson: [],
      assumptionsJson: [],
      market: 'TSE',
      timeframe: 'D',
      status: 'generated',
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
      updatedAt: new Date('2026-05-02T00:00:00.000Z'),
    });
    runtime.versions.set(versionFilterNoReportId, {
      id: versionFilterNoReportId,
      strategyRuleId: strategyFilterId,
      naturalLanguageRule: 'Filter no report setup.',
      generatedPine: null,
      warningsJson: [],
      assumptionsJson: [],
      market: 'TSE',
      timeframe: 'W',
      status: 'generated',
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
      updatedAt: new Date('2026-05-02T00:00:00.000Z'),
    });
    runtime.applications = runtime.applications.map((application) => (
      application.id === 'app-1'
        ? {
            ...application,
            strategyRuleId: strategyFilterId,
            strategyRuleVersionId: versionFilterReportId,
          }
        : application
    ));
    runtime.applications.push({
      id: 'app-no-report',
      symbolId: 'sym-1',
      strategyRuleId: strategyFilterId,
      strategyRuleVersionId: versionFilterNoReportId,
      status: 'active',
      source: 'manual',
      memo: null,
      createdAt: new Date('2026-05-04T00:00:00.000Z'),
      updatedAt: new Date('2026-05-04T00:00:00.000Z'),
    });
    const app = await createApp();

    const allRes = await app.inject({
      method: 'GET',
      url: '/api/symbols/sym-1/strategy-applications?status=all',
    });
    const withReportsRes = await app.inject({
      method: 'GET',
      url: '/api/symbols/sym-1/strategy-applications?report_presence=with_reports',
    });
    const withoutReportsRes = await app.inject({
      method: 'GET',
      url: '/api/symbols/sym-1/strategy-applications?report_presence=without_reports',
    });
    const csvReportsRes = await app.inject({
      method: 'GET',
      url: '/api/symbols/sym-1/strategy-applications?report_source=csv_import',
    });
    const internalReportsRes = await app.inject({
      method: 'GET',
      url: '/api/symbols/sym-1/strategy-applications?report_source=internal_backtest',
    });
    const withCsvReportsRes = await app.inject({
      method: 'GET',
      url: '/api/symbols/sym-1/strategy-applications?report_presence=with_reports&report_source=csv_import',
    });
    const conflictingReportFiltersRes = await app.inject({
      method: 'GET',
      url: '/api/symbols/sym-1/strategy-applications?report_presence=without_reports&report_source=csv_import',
    });
    const latestInternalRunRes = await app.inject({
      method: 'GET',
      url: '/api/symbols/sym-1/strategy-applications?run_type=internal_backtest',
    });
    const latestCsvRunRes = await app.inject({
      method: 'GET',
      url: '/api/symbols/sym-1/strategy-applications?run_type=csv_import',
    });
    const latestSucceededRunRes = await app.inject({
      method: 'GET',
      url: '/api/symbols/sym-1/strategy-applications?run_status=succeeded',
    });
    const combinedRunAndReportRes = await app.inject({
      method: 'GET',
      url: '/api/symbols/sym-1/strategy-applications?run_type=internal_backtest&report_source=csv_import',
    });
    const strategyRes = await app.inject({
      method: 'GET',
      url: `/api/symbols/sym-1/strategy-applications?strategy_id=${strategyFilterId}`,
    });
    const uppercaseStrategyRes = await app.inject({
      method: 'GET',
      url: `/api/symbols/sym-1/strategy-applications?strategy_id=${strategyFilterId.toUpperCase()}`,
    });
    const versionRes = await app.inject({
      method: 'GET',
      url: `/api/symbols/sym-1/strategy-applications?strategy_version_id=${versionFilterNoReportId}`,
    });
    const strategyAndVersionRes = await app.inject({
      method: 'GET',
      url: `/api/symbols/sym-1/strategy-applications?strategy_id=${strategyFilterId}&strategy_version_id=${versionFilterNoReportId}`,
    });
    const mismatchedStrategyAndVersionRes = await app.inject({
      method: 'GET',
      url: `/api/symbols/sym-1/strategy-applications?strategy_id=${mismatchedStrategyFilterId}&strategy_version_id=${versionFilterNoReportId}`,
    });
    const combinedStrategyReportRunRes = await app.inject({
      method: 'GET',
      url: `/api/symbols/sym-1/strategy-applications?strategy_id=${strategyFilterId}&strategy_version_id=${versionFilterReportId}&report_source=csv_import&run_status=succeeded`,
    });

    expect(allRes.statusCode).toBe(200);
    expect(allRes.json().data.query).toMatchObject({
      status: 'all',
      report_presence: null,
    });
    expect(allRes.json().data.applications.map((application: any) => application.id)).toEqual([
      'app-no-report',
      'app-1',
      'app-archived',
    ]);
    expect(withReportsRes.statusCode).toBe(200);
    expect(withReportsRes.json().data.query.report_presence).toBe('with_reports');
    expect(withReportsRes.json().data.applications.map((application: any) => application.id)).toEqual(['app-1']);
    expect(withoutReportsRes.statusCode).toBe(200);
    expect(withoutReportsRes.json().data.query.report_presence).toBe('without_reports');
    expect(withoutReportsRes.json().data.applications.map((application: any) => application.id)).toEqual(['app-no-report']);
    expect(csvReportsRes.statusCode).toBe(200);
    expect(csvReportsRes.json().data.query.report_source).toBe('csv_import');
    expect(csvReportsRes.json().data.applications.map((application: any) => application.id)).toEqual(['app-1']);
    expect(internalReportsRes.statusCode).toBe(200);
    expect(internalReportsRes.json().data.query.report_source).toBe('internal_backtest');
    expect(internalReportsRes.json().data.applications.map((application: any) => application.id)).toEqual(['app-1']);
    expect(withCsvReportsRes.statusCode).toBe(200);
    expect(withCsvReportsRes.json().data.query).toMatchObject({
      report_presence: 'with_reports',
      report_source: 'csv_import',
    });
    expect(withCsvReportsRes.json().data.applications.map((application: any) => application.id)).toEqual(['app-1']);
    expect(conflictingReportFiltersRes.statusCode).toBe(200);
    expect(conflictingReportFiltersRes.json().data.applications).toEqual([]);
    expect(latestInternalRunRes.statusCode).toBe(200);
    expect(latestInternalRunRes.json().data.query.run_type).toBe('internal_backtest');
    expect(latestInternalRunRes.json().data.applications.map((application: any) => application.id)).toEqual(['app-1']);
    expect(latestCsvRunRes.statusCode).toBe(200);
    expect(latestCsvRunRes.json().data.applications).toEqual([]);
    expect(latestSucceededRunRes.statusCode).toBe(200);
    expect(latestSucceededRunRes.json().data.query.run_status).toBe('succeeded');
    expect(latestSucceededRunRes.json().data.applications.map((application: any) => application.id)).toEqual(['app-1']);
    expect(combinedRunAndReportRes.statusCode).toBe(200);
    expect(combinedRunAndReportRes.json().data.query).toMatchObject({
      report_source: 'csv_import',
      run_type: 'internal_backtest',
    });
    expect(combinedRunAndReportRes.json().data.applications.map((application: any) => application.id)).toEqual(['app-1']);
    expect(strategyRes.statusCode).toBe(200);
    expect(strategyRes.json().data.query.strategy_id).toBe(strategyFilterId);
    expect(strategyRes.json().data.applications.map((application: any) => application.id)).toEqual([
      'app-no-report',
      'app-1',
    ]);
    expect(uppercaseStrategyRes.statusCode).toBe(200);
    expect(uppercaseStrategyRes.json().data.query.strategy_id).toBe(strategyFilterId);
    expect(uppercaseStrategyRes.json().data.applications.map((application: any) => application.id)).toEqual([
      'app-no-report',
      'app-1',
    ]);
    expect(versionRes.statusCode).toBe(200);
    expect(versionRes.json().data.query.strategy_version_id).toBe(versionFilterNoReportId);
    expect(versionRes.json().data.applications.map((application: any) => application.id)).toEqual(['app-no-report']);
    expect(strategyAndVersionRes.statusCode).toBe(200);
    expect(strategyAndVersionRes.json().data.query).toMatchObject({
      strategy_id: strategyFilterId,
      strategy_version_id: versionFilterNoReportId,
    });
    expect(strategyAndVersionRes.json().data.applications.map((application: any) => application.id)).toEqual(['app-no-report']);
    expect(mismatchedStrategyAndVersionRes.statusCode).toBe(200);
    expect(mismatchedStrategyAndVersionRes.json().data.applications).toEqual([]);
    expect(combinedStrategyReportRunRes.statusCode).toBe(200);
    expect(combinedStrategyReportRunRes.json().data.query).toMatchObject({
      strategy_id: strategyFilterId,
      strategy_version_id: versionFilterReportId,
      report_source: 'csv_import',
      run_status: 'succeeded',
    });
    expect(combinedStrategyReportRunRes.json().data.applications.map((application: any) => application.id)).toEqual(['app-1']);

    await app.close();
  });

  it('returns symbol applications for a strategy with latest report summaries', async () => {
    const app = await createApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/strategies/strategy-1/symbol-applications?status=active',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.strategy).toEqual({
      id: 'strategy-1',
      title: 'Breakout strategy',
      status: 'active',
    });
    const application = res.json().data.applications[0];
    expect(application).toMatchObject({
      id: 'app-1',
      status: 'active',
      symbol: {
        id: 'sym-1',
        symbol_code: '2148',
        display_name: 'Sample Corp',
      },
      strategy_version: {
        id: 'version-1',
        market: 'TSE',
        timeframe: 'D',
      },
      latest_run: {
        id: 'run-latest',
        run_type: 'internal_backtest',
        backtest_id: 'backtest-1',
      },
      latest_backtest_report: {
        id: 'backtest-1',
        title: '2148 breakout report',
      },
      run_count: 2,
    });

    await app.close();
  });

  it('resolves latest run separately from latest backtest report for strategy symbol applications', async () => {
    runtime.applications.push({
      id: 'app-internal-latest',
      symbolId: 'sym-1',
      strategyRuleId: 'strategy-1',
      strategyRuleVersionId: 'version-1',
      status: 'active',
      source: 'manual',
      memo: null,
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
      updatedAt: new Date('2026-05-04T00:00:00.000Z'),
    });
    runtime.backtests.set('backtest-csv-fallback', {
      id: 'backtest-csv-fallback',
      strategyRuleVersionId: 'version-1',
      strategySnapshotJson: {},
      title: 'CSV fallback report',
      status: 'imported',
      executionSource: 'tradingview',
      market: 'TSE',
      timeframe: 'D',
      createdAt: new Date('2026-05-04T00:00:00.000Z'),
      updatedAt: new Date('2026-05-04T00:00:00.000Z'),
    });
    runtime.runs.push(
      {
        id: 'run-csv-fallback',
        applicationId: 'app-internal-latest',
        runType: 'csv_import',
        status: 'succeeded',
        backtestId: 'backtest-csv-fallback',
        backtestImportId: 'import-old',
        internalBacktestExecutionId: null,
        startedAt: new Date('2026-05-04T00:00:00.000Z'),
        finishedAt: new Date('2026-05-04T00:00:00.000Z'),
        errorCode: null,
        errorMessage: null,
        createdAt: new Date('2026-05-04T00:00:00.000Z'),
        updatedAt: new Date('2026-05-04T00:00:00.000Z'),
      },
      {
        id: 'run-internal-no-report',
        applicationId: 'app-internal-latest',
        runType: 'internal_backtest',
        status: 'queued',
        backtestId: null,
        backtestImportId: null,
        internalBacktestExecutionId: 'internal-no-report',
        startedAt: null,
        finishedAt: null,
        errorCode: null,
        errorMessage: null,
        createdAt: new Date('2026-05-05T00:00:00.000Z'),
        updatedAt: new Date('2026-05-05T00:00:00.000Z'),
      },
    );
    const app = await createApp();

    const symbolRes = await app.inject({
      method: 'GET',
      url: '/api/symbols/sym-1/strategy-applications?status=active',
    });

    expect(symbolRes.statusCode).toBe(200);
    const symbolApplication = symbolRes.json().data.applications.find((item: any) => item.id === 'app-internal-latest');
    expect(symbolApplication.latest_run).toMatchObject({
      id: 'run-internal-no-report',
      run_type: 'internal_backtest',
      backtest_id: null,
      internal_backtest_execution_id: 'internal-no-report',
    });
    expect(symbolApplication.latest_backtest_report).toBeNull();
    expect(symbolApplication.latest_reports_by_source).toMatchObject({
      csv_import: {
        backtest_id: 'backtest-csv-fallback',
        title: 'CSV fallback report',
      },
      internal_backtest: null,
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/strategies/strategy-1/symbol-applications?status=active',
    });

    expect(res.statusCode).toBe(200);
    const application = res.json().data.applications.find((item: any) => item.id === 'app-internal-latest');
    expect(application.latest_run).toMatchObject({
      id: 'run-internal-no-report',
      run_type: 'internal_backtest',
      backtest_id: null,
      internal_backtest_execution_id: 'internal-no-report',
    });
    expect(application.latest_backtest_report).toMatchObject({
      id: 'backtest-csv-fallback',
      title: 'CSV fallback report',
      execution_source: 'tradingview',
    });

    await app.close();
  });

  it('filters strategy symbol applications by status including all', async () => {
    runtime.applications.push({
      id: 'app-1-archived',
      symbolId: 'sym-1',
      strategyRuleId: 'strategy-1',
      strategyRuleVersionId: 'version-2',
      status: 'archived',
      source: 'manual',
      memo: null,
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
      updatedAt: new Date('2026-05-01T00:00:00.000Z'),
    });
    const app = await createApp();

    const activeRes = await app.inject({
      method: 'GET',
      url: '/api/strategies/strategy-1/symbol-applications?status=active',
    });
    const archivedRes = await app.inject({
      method: 'GET',
      url: '/api/strategies/strategy-1/symbol-applications?status=archived',
    });
    const allRes = await app.inject({
      method: 'GET',
      url: '/api/strategies/strategy-1/symbol-applications?status=all',
    });

    expect(activeRes.statusCode).toBe(200);
    expect(activeRes.json().data.applications.map((application: any) => application.id)).toEqual(['app-1']);
    expect(archivedRes.statusCode).toBe(200);
    expect(archivedRes.json().data.applications.map((application: any) => application.id)).toEqual(['app-1-archived']);
    expect(allRes.statusCode).toBe(200);
    expect(allRes.json().data.pagination.total).toBe(2);

    await app.close();
  });

  it('rejects invalid strategy symbol application queries and missing strategy', async () => {
    const app = await createApp();

    const invalidStatus = await app.inject({
      method: 'GET',
      url: '/api/strategies/strategy-1/symbol-applications?status=deleted',
    });
    const invalidSort = await app.inject({
      method: 'GET',
      url: '/api/strategies/strategy-1/symbol-applications?sort=title',
    });
    const invalidPage = await app.inject({
      method: 'GET',
      url: '/api/strategies/strategy-1/symbol-applications?page=0',
    });
    const missingStrategy = await app.inject({
      method: 'GET',
      url: '/api/strategies/missing-strategy/symbol-applications',
    });

    expect(invalidStatus.statusCode).toBe(400);
    expect(invalidStatus.json().error.code).toBe('VALIDATION_ERROR');
    expect(invalidSort.statusCode).toBe(400);
    expect(invalidPage.statusCode).toBe(400);
    expect(missingStrategy.statusCode).toBe(404);
    expect(missingStrategy.json().error.code).toBe('NOT_FOUND');

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
    const invalidReportPresence = await app.inject({
      method: 'GET',
      url: '/api/symbols/sym-1/strategy-applications?report_presence=maybe',
    });
    const invalidReportSource = await app.inject({
      method: 'GET',
      url: '/api/symbols/sym-1/strategy-applications?report_source=manual',
    });
    const invalidRunType = await app.inject({
      method: 'GET',
      url: '/api/symbols/sym-1/strategy-applications?run_type=manual',
    });
    const invalidRunStatus = await app.inject({
      method: 'GET',
      url: '/api/symbols/sym-1/strategy-applications?run_status=done',
    });
    const invalidStrategyId = await app.inject({
      method: 'GET',
      url: '/api/symbols/sym-1/strategy-applications?strategy_id=not-a-uuid',
    });
    const emptyStrategyId = await app.inject({
      method: 'GET',
      url: '/api/symbols/sym-1/strategy-applications?strategy_id=',
    });
    const emptyStrategyVersionId = await app.inject({
      method: 'GET',
      url: '/api/symbols/sym-1/strategy-applications?strategy_version_id=%20%20',
    });

    expect(invalidStatus.statusCode).toBe(400);
    expect(invalidStatus.json().error.code).toBe('VALIDATION_ERROR');
    expect(invalidPage.statusCode).toBe(400);
    expect(invalidSort.statusCode).toBe(400);
    expect(invalidReportPresence.statusCode).toBe(400);
    expect(invalidReportPresence.json().error.code).toBe('VALIDATION_ERROR');
    expect(invalidReportSource.statusCode).toBe(400);
    expect(invalidReportSource.json().error.code).toBe('VALIDATION_ERROR');
    expect(invalidRunType.statusCode).toBe(400);
    expect(invalidRunType.json().error.code).toBe('VALIDATION_ERROR');
    expect(invalidRunStatus.statusCode).toBe(400);
    expect(invalidRunStatus.json().error.code).toBe('VALIDATION_ERROR');
    expect(invalidStrategyId.statusCode).toBe(400);
    expect(invalidStrategyId.json().error.code).toBe('VALIDATION_ERROR');
    expect(emptyStrategyId.statusCode).toBe(400);
    expect(emptyStrategyId.json().error.code).toBe('VALIDATION_ERROR');
    expect(emptyStrategyVersionId.statusCode).toBe(400);
    expect(emptyStrategyVersionId.json().error.code).toBe('VALIDATION_ERROR');

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

  it('archives and restores an application without deleting runs or reports', async () => {
    const app = await createApp();

    const archiveRes = await app.inject({
      method: 'PATCH',
      url: '/api/symbol-strategy-applications/app-1/archive',
    });
    expect(archiveRes.statusCode).toBe(200);
    expect(archiveRes.json().data.application).toMatchObject({
      id: 'app-1',
      status: 'archived',
      run_count: 2,
      strategy: {
        id: 'strategy-1',
      },
      strategy_version: {
        id: 'version-1',
      },
    });

    const activeAfterArchive = await app.inject({
      method: 'GET',
      url: '/api/symbols/sym-1/strategy-applications?status=active',
    });
    const archivedAfterArchive = await app.inject({
      method: 'GET',
      url: '/api/symbols/sym-1/strategy-applications?status=archived',
    });
    expect(activeAfterArchive.statusCode).toBe(200);
    expect(activeAfterArchive.json().data.applications.map((application: any) => application.id)).toEqual([]);
    expect(archivedAfterArchive.statusCode).toBe(200);
    expect(archivedAfterArchive.json().data.applications.map((application: any) => application.id)).toContain('app-1');
    const archivedApplication = archivedAfterArchive.json().data.applications.find((application: any) => application.id === 'app-1');
    expect(archivedApplication.latest_run).toMatchObject({
      id: 'run-latest',
      run_type: 'internal_backtest',
    });
    expect(archivedApplication.latest_backtest_report).toMatchObject({
      id: 'backtest-1',
    });

    const strategyArchived = await app.inject({
      method: 'GET',
      url: '/api/strategies/strategy-1/symbol-applications?status=archived',
    });
    expect(strategyArchived.statusCode).toBe(200);
    expect(strategyArchived.json().data.applications.map((application: any) => application.id)).toContain('app-1');

    const restoreRes = await app.inject({
      method: 'PATCH',
      url: '/api/symbol-strategy-applications/app-1/restore',
    });
    expect(restoreRes.statusCode).toBe(200);
    expect(restoreRes.json().data.application).toMatchObject({
      id: 'app-1',
      status: 'active',
      run_count: 2,
    });

    const activeAfterRestore = await app.inject({
      method: 'GET',
      url: '/api/symbols/sym-1/strategy-applications?status=active',
    });
    expect(activeAfterRestore.json().data.applications.map((application: any) => application.id)).toContain('app-1');

    await app.close();
  });

  it('returns 404 for missing application archive and restore', async () => {
    const app = await createApp();

    const archiveRes = await app.inject({
      method: 'PATCH',
      url: '/api/symbol-strategy-applications/missing-app/archive',
    });
    const restoreRes = await app.inject({
      method: 'PATCH',
      url: '/api/symbol-strategy-applications/missing-app/restore',
    });

    expect(archiveRes.statusCode).toBe(404);
    expect(archiveRes.json().error.code).toBe('NOT_FOUND');
    expect(restoreRes.statusCode).toBe(404);
    expect(restoreRes.json().error.code).toBe('NOT_FOUND');

    await app.close();
  });

  it('rejects restore when another active duplicate application exists', async () => {
    runtime.applications.push({
      id: 'app-duplicate-archived',
      symbolId: 'sym-1',
      strategyRuleId: 'strategy-1',
      strategyRuleVersionId: 'version-1',
      status: 'archived',
      source: 'manual',
      memo: null,
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
      updatedAt: new Date('2026-05-01T00:00:00.000Z'),
    });
    const app = await createApp();

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/symbol-strategy-applications/app-duplicate-archived/restore',
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('CONFLICT');

    await app.close();
  });

  it('treats restore on an already active application as idempotent', async () => {
    const app = await createApp();

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/symbol-strategy-applications/app-1/restore',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.application).toMatchObject({
      id: 'app-1',
      status: 'active',
    });

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

  it('converts a succeeded internal execution to an idempotent backtest report', async () => {
    runtime.runs = [];
    const initialImportCount = runtime.backtestImports.size;
    const app = await createApp();

    const startRes = await app.inject({
      method: 'POST',
      url: '/api/symbol-strategy-applications/app-1/internal-backtests',
      payload: {
        data_range: { from: '2025-01-01', to: '2026-01-01' },
        engine_config: { summary_mode: 'engine_estimated' },
      },
    });
    expect(startRes.statusCode).toBe(201);
    const executionId = startRes.json().data.execution.id;

    const notReadyRes = await app.inject({
      method: 'POST',
      url: `/api/symbol-strategy-applications/app-1/internal-backtests/${executionId}/report`,
    });
    expect(notReadyRes.statusCode).toBe(409);
    expect(notReadyRes.json().error.code).toBe('CONFLICT');

    const execution = runtime.internalExecutions.get(executionId);
    expect(execution).toBeTruthy();
    runtime.internalExecutions.set(executionId, {
      ...execution!,
      status: 'succeeded',
      finishedAt: new Date('2026-05-06T00:10:00.000Z'),
      resultSummaryJson: {
        total_return: 0.12,
        trade_count: 4,
      },
      artifactPointerJson: {
        equity_curve: 'artifact://equity',
      },
    });

    const reportRes = await app.inject({
      method: 'POST',
      url: `/api/symbol-strategy-applications/app-1/internal-backtests/${executionId}/report`,
      payload: {
        title: '2148 internal report',
      },
    });
    expect(reportRes.statusCode).toBe(201);
    expect(reportRes.json().data.application_id).toBe('app-1');
    expect(reportRes.json().data.run).toMatchObject({
      run_type: 'internal_backtest',
      status: 'succeeded',
      backtest_import_id: null,
      internal_backtest_execution_id: executionId,
    });
    expect(reportRes.json().data.backtest).toMatchObject({
      title: '2148 internal report',
      status: 'completed',
      execution_source: 'internal_backtest',
      market: 'TSE',
      timeframe: 'D',
    });
    const backtestId = reportRes.json().data.backtest.id;
    expect(reportRes.json().data.run.backtest_id).toBe(backtestId);
    expect(runtime.backtestImports.size).toBe(initialImportCount);
    expect(runtime.backtests.get(backtestId)?.strategySnapshotJson).toMatchObject({
      execution_source: 'internal_backtest',
      internal_backtest_execution_id: executionId,
      result_summary: {
        total_return: 0.12,
        trade_count: 4,
      },
    });

    const listRes = await app.inject({
      method: 'GET',
      url: '/api/symbols/sym-1/strategy-applications?status=active',
    });
    const application = listRes.json().data.applications[0];
    expect(application.latest_run).toMatchObject({
      run_type: 'internal_backtest',
      backtest_id: backtestId,
      internal_backtest_execution_id: executionId,
    });
    expect(application.latest_backtest_report).toMatchObject({
      id: backtestId,
      status: 'completed',
      execution_source: 'internal_backtest',
    });

    const secondReportRes = await app.inject({
      method: 'POST',
      url: `/api/symbol-strategy-applications/app-1/internal-backtests/${executionId}/report`,
    });
    expect(secondReportRes.statusCode).toBe(200);
    expect(secondReportRes.json().data.backtest.id).toBe(backtestId);
    expect([...runtime.backtests.values()].filter((backtest) => backtest.id === backtestId)).toHaveLength(1);

    await app.close();
  });

  it('returns the existing report when a guarded report link loses a race', async () => {
    runtime.runs = [];
    const app = await createApp();

    const startRes = await app.inject({
      method: 'POST',
      url: '/api/symbol-strategy-applications/app-1/internal-backtests',
      payload: {
        data_range: { from: '2025-01-01', to: '2026-01-01' },
        engine_config: { summary_mode: 'engine_estimated' },
      },
    });
    expect(startRes.statusCode).toBe(201);
    const executionId = startRes.json().data.execution.id;
    const runId = startRes.json().data.run.id;

    const execution = runtime.internalExecutions.get(executionId);
    runtime.internalExecutions.set(executionId, {
      ...execution!,
      status: 'succeeded',
      finishedAt: new Date('2026-05-06T00:10:00.000Z'),
      resultSummaryJson: { total_return: 0.07 },
      artifactPointerJson: null,
    });
    runtime.backtests.set('backtest-concurrent', {
      id: 'backtest-concurrent',
      strategyRuleVersionId: 'version-1',
      strategySnapshotJson: {
        execution_source: 'internal_backtest',
        internal_backtest_execution_id: executionId,
      },
      title: 'concurrent internal report',
      status: 'completed',
      executionSource: 'internal_backtest',
      market: 'TSE',
      timeframe: 'D',
      createdAt: new Date('2026-05-06T00:09:00.000Z'),
      updatedAt: new Date('2026-05-06T00:09:00.000Z'),
    });
    runtime.simulateReportLinkRace = {
      runId,
      backtestId: 'backtest-concurrent',
    };

    const reportRes = await app.inject({
      method: 'POST',
      url: `/api/symbol-strategy-applications/app-1/internal-backtests/${executionId}/report`,
      payload: {
        title: 'losing internal report',
      },
    });

    expect(reportRes.statusCode).toBe(200);
    expect(reportRes.json().data.run).toMatchObject({
      id: runId,
      backtest_id: 'backtest-concurrent',
      internal_backtest_execution_id: executionId,
    });
    expect(reportRes.json().data.backtest).toMatchObject({
      id: 'backtest-concurrent',
      title: 'concurrent internal report',
      execution_source: 'internal_backtest',
    });
    expect([...runtime.backtests.values()].some((backtest) => backtest.title === 'losing internal report')).toBe(false);

    await app.close();
  });

  it('forces application symbol for application-origin internal backtest', async () => {
    runtime.runs = [];
    const app = await createApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/symbol-strategy-applications/app-1/internal-backtests',
      payload: {
        execution_target: {
          symbol: '9999',
          source_kind: 'daily_ohlcv',
        },
        data_range: { from: '2025-01-01', to: '2026-01-01' },
        engine_config: { summary_mode: 'engine_estimated' },
      },
    });

    expect(res.statusCode).toBe(201);
    const savedExecution = runtime.internalExecutions.get(res.json().data.execution.id);
    expect(savedExecution?.inputSnapshotJson.execution_target).toMatchObject({
      symbol: '2148',
      source_kind: 'daily_ohlcv',
    });

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
