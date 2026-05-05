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

type AiSummaryRow = {
  id: string;
  summaryScope: string;
  targetEntityType: string;
  targetEntityId: string;
  title: string | null;
  bodyMarkdown: string;
  generatedAt: Date | null;
  createdAt: Date;
};

type Runtime = {
  backtestSeq: number;
  importSeq: number;
  nowSeq: number;
  strategyVersions: Map<string, StrategyVersionRow>;
  backtests: Map<string, BacktestRow>;
  imports: Map<string, BacktestImportRow>;
  aiSummaries: Map<string, AiSummaryRow>;
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
    aiSummaries: new Map(),
  };
}

vi.mock('../src/db', () => {
  const applyWhere = (rows: BacktestRow[], where: any): BacktestRow[] => {
    let filtered = rows;
    if (where?.title?.contains) {
      const contains = String(where.title.contains).toLowerCase();
      filtered = filtered.filter((row) => row.title.toLowerCase().includes(contains));
    }
    if (where?.status) {
      filtered = filtered.filter((row) => row.status === where.status);
    }
    return filtered;
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
        if (orderBy?.createdAt === 'asc') {
          rows = rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        }
        if (orderBy?.updatedAt === 'desc') {
          rows = rows.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
        }
        if (orderBy?.updatedAt === 'asc') {
          rows = rows.sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());
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
    aiSummary: {
      findFirst: async ({ where, orderBy }: any) => {
        const matchesAiSummaryWhere = (row: AiSummaryRow, clause: any): boolean => {
          if (!clause || typeof clause !== 'object') return true;

          if (Array.isArray(clause.OR)) {
            const matched = clause.OR.some((child) => matchesAiSummaryWhere(row, child));
            if (!matched) return false;
          }

          if (clause.summaryScope && row.summaryScope !== clause.summaryScope) return false;

          if (clause.targetEntityId && typeof clause.targetEntityId === 'string') {
            if (row.targetEntityId !== clause.targetEntityId) return false;
          }

          if (clause.targetEntityId?.in && Array.isArray(clause.targetEntityId.in)) {
            if (!clause.targetEntityId.in.includes(row.targetEntityId)) return false;
          }

          if (clause.targetEntityType?.in && Array.isArray(clause.targetEntityType.in)) {
            if (!clause.targetEntityType.in.includes(row.targetEntityType)) return false;
          }

          if (typeof clause.targetEntityType === 'string') {
            if (row.targetEntityType !== clause.targetEntityType) return false;
          }

          return true;
        };

        let rows = [...runtime.aiSummaries.values()].filter((row) => matchesAiSummaryWhere(row, where));

        if (Array.isArray(orderBy)) {
          rows = rows.sort((a, b) => {
            for (const order of orderBy) {
              if (order.generatedAt) {
                const av = a.generatedAt?.getTime() ?? 0;
                const bv = b.generatedAt?.getTime() ?? 0;
                if (av !== bv) return order.generatedAt === 'desc' ? bv - av : av - bv;
              }
              if (order.createdAt) {
                const av = a.createdAt.getTime();
                const bv = b.createdAt.getTime();
                if (av !== bv) return order.createdAt === 'desc' ? bv - av : av - bv;
              }
            }
            return 0;
          });
        }

        return rows[0] ?? null;
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
const VALID_CSV_BOM = `\uFEFFNet Profit,Total Closed Trades,Percent Profitable,Profit Factor,Max Drawdown,From,To
100000,120,48.5,1.42,-8.2,2024-01-01,2025-12-31
`;

const UNSUPPORTED_CSV = `foo,bar
1,2
`;

const TRADES_CSV_JP = `トレード番号,タイプ,日時,シグナル,価格 JPY,サイズ (数量),サイズ (金額),純損益 JPY,純損益 %,最大順行幅 JPY,最大順行幅 %,最大逆行幅 JPY,最大逆行幅 %,累積損益 JPY,累積損益 %
1,ロング決済,2026-04-01,Close entry(s) order Long,1100,1,1000,100,10,120,12,-20,-2,100,0.1
1,ロングエントリー,2026-03-25,Long,1000,1,1000,100,10,120,12,-20,-2,100,0.1
2,ロング決済,2026-04-10,Close entry(s) order Long,1050,1,1100,-50,-4.55,30,2.72,-90,-8.18,50,0.05
2,ロングエントリー,2026-04-05,Long,1100,1,1100,-50,-4.55,30,2.72,-90,-8.18,50,0.05
`;

const TRADES_CSV_EN = `Trade #,Type,Date/Time,Signal,Price,Contracts,Profit,Cumulative Profit
1,Long,2026-03-25,Long,1000,1,0,0
1,Close entry(s) order Long,2026-04-01,Close,1100,1,100,100
2,Long,2026-04-05,Long,1100,1,0,100
2,Close entry(s) order Long,2026-04-10,Close,1050,1,-50,50
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

  it('parses Japanese list-of-trades csv and derives summary metrics', async () => {
    const app = await createApp();

    const createdBacktest = await app.inject({
      method: 'POST',
      url: '/api/backtests',
      payload: {
        strategy_version_id: 'ver-1',
        title: 'trade-list-import',
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
        file_name: 'trade_list_jp.csv',
        content_type: 'text/csv',
        csv_text: TRADES_CSV_JP,
      },
    });

    expect(imported.statusCode).toBe(201);
    const body = imported.json();
    expect(body.data.import.parse_status).toBe('parsed');
    expect(body.data.import.parsed_summary.totalTrades).toBe(2);
    expect(body.data.import.parsed_summary.netProfit).toBe(50);
    expect(body.data.import.parsed_summary.winRate).toBe(50);
    expect(body.data.import.parsed_summary.periodFrom).toBe('2026-03-25');
    expect(body.data.import.parsed_summary.periodTo).toBe('2026-04-10');

    await app.close();
  });

  it('accepts performance summary csv with utf-8 bom header', async () => {
    const app = await createApp();

    const createdBacktest = await app.inject({
      method: 'POST',
      url: '/api/backtests',
      payload: {
        strategy_version_id: 'ver-1',
        title: 'performance-bom',
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
        file_name: 'performance_summary_bom.csv',
        content_type: 'text/csv',
        csv_text: VALID_CSV_BOM,
      },
    });

    expect(imported.statusCode).toBe(201);
    const body = imported.json();
    expect(body.data.import.parse_status).toBe('parsed');
    expect(body.data.import.parsed_summary.totalTrades).toBe(120);
    expect(body.data.import.parsed_summary.netProfit).toBe(100000);

    await app.close();
  });

  it('parses English list-of-trades csv and derives summary metrics', async () => {
    const app = await createApp();

    const createdBacktest = await app.inject({
      method: 'POST',
      url: '/api/backtests',
      payload: {
        strategy_version_id: 'ver-1',
        title: 'trade-list-import-en',
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
        file_name: 'trade_list_en.csv',
        content_type: 'text/csv',
        csv_text: TRADES_CSV_EN,
      },
    });

    expect(imported.statusCode).toBe(201);
    const body = imported.json();
    expect(body.data.import.parse_status).toBe('parsed');
    expect(body.data.import.parsed_summary.totalTrades).toBe(2);
    expect(body.data.import.parsed_summary.netProfit).toBe(50);
    expect(body.data.import.parsed_summary.winRate).toBe(50);
    expect(body.data.import.parsed_summary.periodFrom).toBe('2026-03-25');
    expect(body.data.import.parsed_summary.periodTo).toBe('2026-04-10');

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

  it('keeps previous parsed import in history when latest import fails', async () => {
    const app = await createApp();

    const createdBacktest = await app.inject({
      method: 'POST',
      url: '/api/backtests',
      payload: {
        strategy_version_id: 'ver-1',
        title: 'parsed-then-failed',
        execution_source: 'tradingview',
        market: 'JP_STOCK',
        timeframe: 'D',
      },
    });
    expect(createdBacktest.statusCode).toBe(201);
    const backtestId = createdBacktest.json().data.backtest.id as string;

    const firstImport = await app.inject({
      method: 'POST',
      url: `/api/backtests/${backtestId}/imports`,
      payload: {
        file_name: 'performance_summary.csv',
        content_type: 'text/csv',
        csv_text: VALID_CSV,
      },
    });
    expect(firstImport.statusCode).toBe(201);
    expect(firstImport.json().data.import.parse_status).toBe('parsed');

    const secondImport = await app.inject({
      method: 'POST',
      url: `/api/backtests/${backtestId}/imports`,
      payload: {
        file_name: 'broken.csv',
        content_type: 'text/csv',
        csv_text: UNSUPPORTED_CSV,
      },
    });
    expect(secondImport.statusCode).toBe(201);
    expect(secondImport.json().data.import.parse_status).toBe('failed');

    const detail = await app.inject({
      method: 'GET',
      url: `/api/backtests/${backtestId}`,
    });
    expect(detail.statusCode).toBe(200);
    const body = detail.json();
    expect(body.data.backtest.status).toBe('import_failed');
    expect(body.data.latest_import.parse_status).toBe('failed');
    expect(body.data.imports).toHaveLength(2);
    expect(body.data.imports[0].parse_status).toBe('failed');
    expect(body.data.imports[1].parse_status).toBe('parsed');
    expect(body.data.imports[1].parsed_summary.totalTrades).toBe(120);

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

  it('returns ai_review when backtest review summary exists', async () => {
    const app = await createApp();

    const createdBacktest = await app.inject({
      method: 'POST',
      url: '/api/backtests',
      payload: {
        strategy_version_id: 'ver-1',
        title: 'ai-review-check',
        execution_source: 'tradingview',
        market: 'JP_STOCK',
        timeframe: 'D',
      },
    });
    const backtestId = createdBacktest.json().data.backtest.id as string;

    runtime.aiSummaries.set('sum-bt-1', {
      id: 'sum-bt-1',
      summaryScope: 'backtest_review',
      targetEntityType: 'backtest',
      targetEntityId: backtestId,
      title: 'Review title',
      bodyMarkdown: 'Review body markdown',
      generatedAt: new Date('2026-01-01T00:00:00.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const detail = await app.inject({
      method: 'GET',
      url: `/api/backtests/${backtestId}`,
    });
    expect(detail.statusCode).toBe(200);
    const body = detail.json();
    expect(body.data.ai_review).toEqual({
      summary_id: 'sum-bt-1',
      title: 'Review title',
      body_markdown: 'Review body markdown',
      generated_at: '2026-01-01T00:00:00.000Z',
      structured_json: null,
      status: 'available',
      insufficient_context: false,
    });

    await app.close();
  });

  it('returns ai_review when backtest_run summary exists for import id', async () => {
    const app = await createApp();

    const createdBacktest = await app.inject({
      method: 'POST',
      url: '/api/backtests',
      payload: {
        strategy_version_id: 'ver-1',
        title: 'ai-review-run-check',
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
        file_name: 'ok.csv',
        content_type: 'text/csv',
        csv_text: VALID_CSV,
      },
    });
    const importId = imported.json().data.import.id as string;

    runtime.aiSummaries.set('sum-run-1', {
      id: 'sum-run-1',
      summaryScope: 'backtest_review',
      targetEntityType: 'backtest_run',
      targetEntityId: importId,
      title: 'Run review title',
      bodyMarkdown: 'Run review body markdown',
      generatedAt: new Date('2026-02-01T00:00:00.000Z'),
      createdAt: new Date('2026-02-01T00:00:00.000Z'),
    });

    const detail = await app.inject({
      method: 'GET',
      url: `/api/backtests/${backtestId}`,
    });
    expect(detail.statusCode).toBe(200);
    const body = detail.json();
    expect(body.data.ai_review).toEqual({
      summary_id: 'sum-run-1',
      title: 'Run review title',
      body_markdown: 'Run review body markdown',
      generated_at: '2026-02-01T00:00:00.000Z',
      structured_json: null,
      status: 'available',
      insufficient_context: false,
    });

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
    expect(body.data.backtests[0].strategy_id).toBe('str-1');
    expect(body.data.backtests[0].latest_import).toBeNull();
    expect(body.data.backtests[1].id).toBe(secondId);
    expect(body.data.backtests[1].strategy_id).toBe('str-1');
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
    expect(bodyPage2.data.backtests[0].strategy_id).toBe('str-1');
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

  it('filters and sorts backtests with status/sort/order while preserving pagination', async () => {
    const app = await createApp();

    const first = await app.inject({
      method: 'POST',
      url: '/api/backtests',
      payload: {
        strategy_version_id: 'ver-1',
        title: 'Draft target',
        execution_source: 'tradingview',
        market: 'JP_STOCK',
        timeframe: 'D',
      },
    });
    const firstId = first.json().data.backtest.id as string;

    const second = await app.inject({
      method: 'POST',
      url: '/api/backtests',
      payload: {
        strategy_version_id: 'ver-1',
        title: 'Imported target',
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
        file_name: 'ok.csv',
        content_type: 'text/csv',
        csv_text: VALID_CSV,
      },
    });

    const filtered = await app.inject({
      method: 'GET',
      url: '/api/backtests?page=1&limit=20&status=pending&sort=updated_at&order=asc',
    });
    expect(filtered.statusCode).toBe(200);
    const body = filtered.json();
    expect(body.data.pagination.status).toBe('pending');
    expect(body.data.pagination.sort).toBe('updated_at');
    expect(body.data.pagination.order).toBe('asc');
    expect(body.data.backtests).toHaveLength(1);
    expect(body.data.backtests[0].id).toBe(firstId);
    expect(body.data.backtests[0].status).toBe('pending');

    const importedOnly = await app.inject({
      method: 'GET',
      url: '/api/backtests?page=1&limit=20&status=imported',
    });
    expect(importedOnly.statusCode).toBe(200);
    expect(importedOnly.json().data.backtests[0].id).toBe(secondId);

    await app.close();
  });
});
