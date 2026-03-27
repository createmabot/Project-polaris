import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../src/utils/response';
import { backtestRoutes } from '../src/routes/backtests';

type StrategyVersionRow = {
  id: string;
  strategyRuleId: string;
  naturalLanguageRule: string;
  generatedPine: string | null;
  warningsJson: string[];
  assumptionsJson: string[];
  market: string;
  timeframe: string;
};

type BacktestRow = {
  id: string;
  strategyRuleVersionId: string;
  strategySnapshotJson: any;
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
  nowSeq: number;
  strategyVersions: Map<string, StrategyVersionRow>;
  backtests: Map<string, BacktestRow>;
  imports: Map<string, BacktestImportRow>;
};

let runtime: Runtime;

function createRuntime(): Runtime {
  return {
    backtestSeq: 1,
    importSeq: 1,
    nowSeq: 1,
    strategyVersions: new Map(),
    backtests: new Map(),
    imports: new Map(),
  };
}

vi.mock('../src/db', () => {
  const applyWhere = (rows: BacktestRow[], where: any): BacktestRow[] => {
    if (!where?.title?.contains) return rows;
    const contains = String(where.title.contains).toLowerCase();
    return rows.filter((row) => row.title.toLowerCase().includes(contains));
  };

  const prisma = {
    strategyRuleVersion: {
      findUnique: async ({ where }: any) => runtime.strategyVersions.get(where.id) ?? null,
    },
    backtest: {
      create: async ({ data }: any) => {
        const id = `run-${runtime.backtestSeq++}`;
        const now = new Date(Date.now() + runtime.nowSeq++);
        const row: BacktestRow = {
          id,
          strategyRuleVersionId: data.strategyRuleVersionId,
          strategySnapshotJson: data.strategySnapshotJson ?? null,
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
        const strategyRuleVersion = runtime.strategyVersions.get(backtest.strategyRuleVersionId) ?? null;
        if (include?.imports) {
          const imports = [...runtime.imports.values()]
            .filter((item) => item.backtestId === backtest.id)
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
          return { ...backtest, imports, strategyRuleVersion };
        }
        return { ...backtest, strategyRuleVersion };
      },
      count: async ({ where }: any = {}) => applyWhere([...runtime.backtests.values()], where).length,
      findMany: async ({ include, orderBy, take, skip, where }: any) => {
        let rows = [...runtime.backtests.values()];
        rows = applyWhere(rows, where);
        if (orderBy?.createdAt === 'desc') {
          rows = rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }
        if (typeof skip === 'number') {
          rows = rows.slice(skip);
        }
        if (typeof take === 'number') {
          rows = rows.slice(0, take);
        }
        if (include?.imports) {
          return rows.map((backtest) => {
            let imports = [...runtime.imports.values()]
              .filter((item) => item.backtestId === backtest.id)
              .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
            if (typeof include.imports.take === 'number') {
              imports = imports.slice(0, include.imports.take);
            }
            return { ...backtest, imports };
          });
        }
        return rows;
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
        const now = new Date(Date.now() + runtime.nowSeq++);
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
      strategyRuleId: 'str-1',
      naturalLanguageRule: '25日移動平均を上抜けたら買い',
      generatedPine: 'strategy("base")',
      warningsJson: [],
      assumptionsJson: [],
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

    const detail = await app.inject({
      method: 'GET',
      url: `/api/backtests/${backtestId}`,
    });
    expect(detail.statusCode).toBe(200);
    const detailBody = detail.json();
    expect(detailBody.data.latest_import.parse_status).toBe('parsed');
    expect(detailBody.data.latest_import.parsed_summary.profitFactor).toBe(1.42);
    expect(detailBody.data.used_strategy.strategy_id).toBe('str-1');
    expect(detailBody.data.used_strategy.strategy_version_id).toBe('ver-1');
    expect(detailBody.data.used_strategy.snapshot.natural_language_rule).toContain('25日移動平均');
    expect(detailBody.data.used_strategy.snapshot.generated_pine).toBe('strategy("base")');

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

    const detail = await app.inject({
      method: 'GET',
      url: `/api/backtests/${backtestId}`,
    });
    expect(detail.statusCode).toBe(200);
    const detailBody = detail.json();
    expect(detailBody.data.latest_import.parse_status).toBe('failed');
    expect(detailBody.data.latest_import.parse_error).toContain('Missing required columns');
    expect(detailBody.data.used_strategy.snapshot.strategy_version_id).toBe('ver-1');

    await app.close();
  });

  it('keeps strategy snapshot immutable even if current version is updated later', async () => {
    const app = await createApp();

    const createdBacktest = await app.inject({
      method: 'POST',
      url: '/api/backtests',
      payload: {
        strategy_version_id: 'ver-1',
        title: 'snapshot check',
        execution_source: 'tradingview',
        market: 'JP_STOCK',
        timeframe: 'D',
      },
    });
    const backtestId = createdBacktest.json().data.backtest.id as string;

    runtime.strategyVersions.set('ver-1', {
      id: 'ver-1',
      strategyRuleId: 'str-1',
      naturalLanguageRule: 'RSIが30以下で買い',
      generatedPine: 'strategy("updated")',
      warningsJson: ['updated'],
      assumptionsJson: ['updated'],
      market: 'JP_STOCK',
      timeframe: 'D',
    });

    const detail = await app.inject({
      method: 'GET',
      url: `/api/backtests/${backtestId}`,
    });
    expect(detail.statusCode).toBe(200);
    const body = detail.json();
    expect(body.data.used_strategy.strategy_version_id).toBe('ver-1');
    expect(body.data.used_strategy.snapshot.natural_language_rule).toContain('25日移動平均');
    expect(body.data.used_strategy.snapshot.generated_pine).toBe('strategy("base")');

    await app.close();
  });

  it('returns recent backtest list with latest parse status', async () => {
    const app = await createApp();

    const first = await app.inject({
      method: 'POST',
      url: '/api/backtests',
      payload: {
        strategy_version_id: 'ver-1',
        title: 'A',
        execution_source: 'tradingview',
        market: 'JP_STOCK',
        timeframe: 'D',
      },
    });
    const firstId = first.json().data.backtest.id as string;
    await app.inject({
      method: 'POST',
      url: `/api/backtests/${firstId}/imports`,
      payload: {
        file_name: 'ok.csv',
        content_type: 'text/csv',
        csv_text: VALID_CSV,
      },
    });

    const second = await app.inject({
      method: 'POST',
      url: '/api/backtests',
      payload: {
        strategy_version_id: 'ver-1',
        title: 'B',
        execution_source: 'tradingview',
        market: 'JP_STOCK',
        timeframe: 'D',
      },
    });
    const secondId = second.json().data.backtest.id as string;
    await app.inject({
      method: 'POST',
      url: `/api/backtests/${secondId}/imports`,
      payload: {
        file_name: 'ng.csv',
        content_type: 'text/csv',
        csv_text: UNSUPPORTED_CSV,
      },
    });

    const third = await app.inject({
      method: 'POST',
      url: '/api/backtests',
      payload: {
        strategy_version_id: 'ver-1',
        title: 'C',
        execution_source: 'tradingview',
        market: 'JP_STOCK',
        timeframe: 'D',
      },
    });
    const thirdId = third.json().data.backtest.id as string;
    expect(thirdId).toBeDefined();

    const listed = await app.inject({
      method: 'GET',
      url: '/api/backtests?page=1&limit=2',
    });
    expect(listed.statusCode).toBe(200);
    const body = listed.json();
    expect(body.data.backtests).toHaveLength(2);
    expect(body.data.pagination.page).toBe(1);
    expect(body.data.pagination.limit).toBe(2);
    expect(body.data.pagination.total).toBe(3);
    expect(body.data.pagination.has_next).toBe(true);
    expect(body.data.pagination.has_prev).toBe(false);
    expect(body.data.backtests[0].id).toBe(thirdId);
    expect(body.data.backtests[0].latest_import).toBeNull();
    expect(body.data.backtests[1].id).toBe(secondId);
    expect(body.data.backtests[1].latest_import.parse_status).toBe('failed');

    const listedPage2 = await app.inject({
      method: 'GET',
      url: '/api/backtests?page=2&limit=2',
    });
    expect(listedPage2.statusCode).toBe(200);
    const bodyPage2 = listedPage2.json();
    expect(bodyPage2.data.backtests).toHaveLength(1);
    expect(bodyPage2.data.pagination.page).toBe(2);
    expect(bodyPage2.data.pagination.has_next).toBe(false);
    expect(bodyPage2.data.pagination.has_prev).toBe(true);
    expect(bodyPage2.data.backtests[0].id).toBe(firstId);
    expect(bodyPage2.data.backtests[0].latest_import.parse_status).toBe('parsed');

    await app.close();
  });

  it('filters backtests by title partial match with pagination', async () => {
    const app = await createApp();

    await app.inject({
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
    await app.inject({
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
    await app.inject({
      method: 'POST',
      url: '/api/backtests',
      payload: {
        strategy_version_id: 'ver-1',
        title: 'トヨタ週足',
        execution_source: 'tradingview',
        market: 'JP_STOCK',
        timeframe: 'D',
      },
    });

    const listed = await app.inject({
      method: 'GET',
      url: '/api/backtests?page=1&limit=1&q=トヨタ',
    });
    expect(listed.statusCode).toBe(200);
    const body = listed.json();
    expect(body.data.backtests).toHaveLength(1);
    expect(body.data.backtests[0].title).toContain('トヨタ');
    expect(body.data.pagination.q).toBe('トヨタ');
    expect(body.data.pagination.total).toBe(2);
    expect(body.data.pagination.has_next).toBe(true);

    const page2 = await app.inject({
      method: 'GET',
      url: '/api/backtests?page=2&limit=1&q=トヨタ',
    });
    expect(page2.statusCode).toBe(200);
    const bodyPage2 = page2.json();
    expect(bodyPage2.data.backtests).toHaveLength(1);
    expect(bodyPage2.data.backtests[0].title).toContain('トヨタ');
    expect(bodyPage2.data.pagination.has_prev).toBe(true);
    expect(bodyPage2.data.pagination.has_next).toBe(false);

    await app.close();
  });
});
