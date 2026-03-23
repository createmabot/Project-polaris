import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../src/utils/response';
import { backtestRoutes } from '../src/routes/backtests';

type StrategyVersionRow = {
  id: string;
  market: string;
  timeframe: string;
};

type BacktestRow = {
  id: string;
  strategyRuleVersionId: string;
  title: string;
  executionSource: string;
  market: string;
  timeframe: string;
  status: string;
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

type Runtime = {
  backtestSeq: number;
  importSeq: number;
  strategyVersions: Map<string, StrategyVersionRow>;
  backtests: Map<string, BacktestRow>;
  imports: Map<string, BacktestImportRow>;
};

let runtime: Runtime;

function createRuntime(): Runtime {
  return {
    backtestSeq: 1,
    importSeq: 1,
    strategyVersions: new Map(),
    backtests: new Map(),
    imports: new Map(),
  };
}

vi.mock('../src/db', () => {
  const prisma = {
    strategyRuleVersion: {
      findUnique: async ({ where }: any) => runtime.strategyVersions.get(where.id) ?? null,
    },
    backtest: {
      create: async ({ data }: any) => {
        const id = `run-${runtime.backtestSeq++}`;
        const now = new Date();
        const row: BacktestRow = {
          id,
          strategyRuleVersionId: data.strategyRuleVersionId,
          title: data.title,
          executionSource: data.executionSource,
          market: data.market,
          timeframe: data.timeframe,
          status: data.status,
          createdAt: now,
          updatedAt: now,
        };
        runtime.backtests.set(id, row);
        return row;
      },
      findUnique: async ({ where, include }: any) => {
        const backtest = runtime.backtests.get(where.id) ?? null;
        if (!backtest) return null;
        if (include?.imports) {
          const imports = [...runtime.imports.values()]
            .filter((item) => item.backtestId === backtest.id)
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
          return { ...backtest, imports };
        }
        return backtest;
      },
      update: async ({ where, data }: any) => {
        const row = runtime.backtests.get(where.id);
        if (!row) throw new Error(`backtest_not_found:${where.id}`);
        const next = { ...row, ...data, updatedAt: new Date() };
        runtime.backtests.set(where.id, next);
        return next;
      },
    },
    backtestImport: {
      create: async ({ data }: any) => {
        const id = `imp-${runtime.importSeq++}`;
        const now = new Date();
        const row: BacktestImportRow = {
          id,
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
        runtime.imports.set(id, row);
        return row;
      },
      findMany: async ({ where }: any) => {
        return [...runtime.imports.values()]
          .filter((item) => item.backtestId === where.backtestId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      },
    },
  };

  return { prisma };
});

async function createApp() {
  const app = Fastify({ logger: false });
  app.setErrorHandler(errorHandler);
  app.register(backtestRoutes, { prefix: '/api/backtests' });
  await app.ready();
  return app;
}

const VALID_CSV = `Net Profit,Total Closed Trades,Percent Profitable,Profit Factor,Max Drawdown,From,To
100000,120,48.5,1.42,-8.2,2024-01-01,2025-12-31
`;

const UNSUPPORTED_CSV = `foo,bar
1,2
`;

describe('backtest import vertical slice', () => {
  beforeEach(() => {
    runtime = createRuntime();
    runtime.strategyVersions.set('ver-1', {
      id: 'ver-1',
      market: 'JP_STOCK',
      timeframe: 'D',
    });
  });

  it('creates backtest and parses supported csv', async () => {
    const app = await createApp();

    const createdBacktest = await app.inject({
      method: 'POST',
      url: '/api/backtests',
      payload: {
        strategy_version_id: 'ver-1',
        title: 'トヨタ日足',
        execution_source: 'tradingview',
        market: 'JP_STOCK',
        timeframe: 'D',
      },
    });
    expect(createdBacktest.statusCode).toBe(201);
    const backtestId = createdBacktest.json().data.backtest.id as string;

    const imported = await app.inject({
      method: 'POST',
      url: `/api/backtests/${backtestId}/imports`,
      payload: {
        file_name: 'performance_summary.csv',
        content_type: 'text/csv',
        csv_text: VALID_CSV,
      },
    });
    expect(imported.statusCode).toBe(201);
    const body = imported.json();
    expect(body.data.import.parse_status).toBe('parsed');
    expect(body.data.import.parsed_summary.totalTrades).toBe(120);

    await app.close();
  });

  it('marks failed and keeps import record for unsupported csv', async () => {
    const app = await createApp();

    const createdBacktest = await app.inject({
      method: 'POST',
      url: '/api/backtests',
      payload: {
        strategy_version_id: 'ver-1',
        title: 'ソニー日足',
        execution_source: 'tradingview',
        market: 'JP_STOCK',
        timeframe: 'D',
      },
    });
    const backtestId = createdBacktest.json().data.backtest.id as string;

    const imported = await app.inject({
      method: 'POST',
      url: `/api/backtests/${backtestId}/imports`,
      payload: {
        file_name: 'unsupported.csv',
        content_type: 'text/csv',
        csv_text: UNSUPPORTED_CSV,
      },
    });
    expect(imported.statusCode).toBe(201);
    const body = imported.json();
    expect(body.data.import.parse_status).toBe('failed');
    expect(body.data.import.parse_error).toContain('Missing required columns');
    expect(runtime.imports.size).toBe(1);

    await app.close();
  });
});
