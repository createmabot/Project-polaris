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
  aiJobId?: string | null;
  summaryScope: string;
  targetEntityType: string;
  targetEntityId: string;
  title: string | null;
  bodyMarkdown: string;
  structuredJson?: any;
  inputSnapshotHash?: string | null;
  modelName?: string | null;
  promptVersion?: string | null;
  generationContextJson?: any;
  generatedAt: Date | null;
  createdAt: Date;
};

type AiJobRow = {
  id: string;
  jobType: string;
  targetEntityType: string;
  targetEntityId: string;
  requestPayload: any;
  responsePayload?: any;
  status: string;
  errorMessage?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type SymbolRow = {
  id: string;
  symbol: string;
  symbolCode: string | null;
  marketCode: string | null;
  tradingviewSymbol: string | null;
  displayName: string | null;
};

type StrategyRow = {
  id: string;
  title: string;
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

type ApplicationRunRow = {
  id: string;
  applicationId: string;
  runType: string;
  status: string;
  backtestId: string | null;
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
  aiSummaries: Map<string, AiSummaryRow>;
  aiJobs: Map<string, AiJobRow>;
  symbols: Map<string, SymbolRow>;
  strategies: Map<string, StrategyRow>;
  applications: Map<string, ApplicationRow>;
  applicationRuns: Map<string, ApplicationRunRow>;
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
    aiJobs: new Map(),
    symbols: new Map(),
    strategies: new Map(),
    applications: new Map(),
    applicationRuns: new Map(),
  };
}

vi.mock('../src/db', () => {
  const withLatestImport = (backtest: BacktestRow | null) => {
    if (!backtest) return null;
    const imports = [...runtime.imports.values()]
      .filter((item) => item.backtestId === backtest.id)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 1);
    return { ...backtest, imports };
  };

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
    aiJob: {
      create: async ({ data }: any) => {
        const id = `job-${runtime.aiJobs.size + 1}`;
        const now = new Date(Date.now() + runtime.nowSeq++);
        const row: AiJobRow = {
          id,
          jobType: data.jobType,
          targetEntityType: data.targetEntityType,
          targetEntityId: data.targetEntityId,
          requestPayload: data.requestPayload ?? null,
          responsePayload: data.responsePayload ?? null,
          status: data.status ?? 'queued',
          errorMessage: data.errorMessage ?? null,
          createdAt: now,
          updatedAt: now,
        };
        runtime.aiJobs.set(id, row);
        return row;
      },
      findFirst: async ({ where }: any) => {
        const rows = [...runtime.aiJobs.values()]
          .filter((row) => {
            if (where?.jobType && row.jobType !== where.jobType) return false;
            if (where?.targetEntityType && row.targetEntityType !== where.targetEntityType) return false;
            if (where?.targetEntityId && row.targetEntityId !== where.targetEntityId) return false;
            if (where?.status?.in && !where.status.in.includes(row.status)) return false;
            const expectedHash = where?.requestPayload?.equals;
            if (expectedHash && row.requestPayload?.input_snapshot_hash !== expectedHash) return false;
            return true;
          })
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return rows[0] ?? null;
      },
      update: async ({ where, data }: any) => {
        const row = runtime.aiJobs.get(where.id);
        if (!row) throw new Error(`ai_job_not_found:${where.id}`);
        const next = { ...row, ...data, updatedAt: new Date(Date.now() + runtime.nowSeq++) };
        runtime.aiJobs.set(where.id, next);
        return next;
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

          if (clause.inputSnapshotHash && row.inputSnapshotHash !== clause.inputSnapshotHash) return false;

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
      create: async ({ data }: any) => {
        const id = `sum-${runtime.aiSummaries.size + 1}`;
        const now = new Date(Date.now() + runtime.nowSeq++);
        const row: AiSummaryRow = {
          id,
          aiJobId: data.aiJobId ?? null,
          summaryScope: data.summaryScope,
          targetEntityType: data.targetEntityType,
          targetEntityId: data.targetEntityId,
          title: data.title ?? null,
          bodyMarkdown: data.bodyMarkdown,
          structuredJson: data.structuredJson ?? null,
          inputSnapshotHash: data.inputSnapshotHash ?? null,
          modelName: data.modelName ?? null,
          promptVersion: data.promptVersion ?? null,
          generationContextJson: data.generationContextJson ?? null,
          generatedAt: data.generatedAt ?? null,
          createdAt: now,
        };
        runtime.aiSummaries.set(id, row);
        return row;
      },
    },
    symbolStrategyApplicationRun: {
      findFirst: async ({ where }: any) => {
        const rows = [...runtime.applicationRuns.values()]
          .filter((run) => run.backtestId === where?.backtestId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        const run = rows[0] ?? null;
        if (!run) return null;
        const application = runtime.applications.get(run.applicationId);
        if (!application) return null;
        return {
          ...run,
          backtest: withLatestImport(runtime.backtests.get(run.backtestId ?? '') ?? null),
          application: {
            ...application,
            symbol: runtime.symbols.get(application.symbolId),
            strategyRule: runtime.strategies.get(application.strategyRuleId),
            strategyRuleVersion: runtime.strategyVersions.get(application.strategyRuleVersionId),
          },
        };
      },
      findMany: async ({ where }: any) => {
        let rows = [...runtime.applicationRuns.values()];
        if (where?.applicationId) {
          rows = rows.filter((run) => run.applicationId === where.applicationId);
        }
        if (where?.backtestId?.not === null) {
          rows = rows.filter((run) => run.backtestId !== null);
        }
        rows = rows.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).slice(0, 10);
        return rows.map((run) => ({
          ...run,
          backtest: run.backtestId ? withLatestImport(runtime.backtests.get(run.backtestId) ?? null) : null,
        }));
      },
    },
  };

  return { prisma };
});

vi.mock('../src/ai/home-ai-service', () => ({
  HomeAiService: class {
    async generateBacktestSummary() {
      return {
        output: {
          title: 'auto backtest summary',
          bodyMarkdown: '## auto backtest summary',
          structuredJson: {
            schema_name: 'backtest_review_summary',
            schema_version: '1.0',
            confidence: 'medium',
            insufficient_context: false,
            payload: {},
          },
          modelName: 'stub-backtest-v1',
          promptVersion: 'v1.0.0-backtest-stub',
        },
        log: {
          initialModel: 'stub-backtest-v1',
          finalModel: 'stub-backtest-v1',
          escalated: false,
          escalationReason: null,
          retryCount: 0,
          durationMs: 1,
          estimatedTokens: 1,
          estimatedCostUsd: 0,
          provider: 'stub',
          fallbackToStub: false,
        },
      };
    }
  },
}));

async function createApp() {
  const app = Fastify({ logger: false });
  app.setErrorHandler(errorHandler);
  app.register(backtestRoutes, { prefix: '/api/backtests' });
  await app.ready();
  return app;
}

async function waitForBackgroundJobs() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

const VALID_CSV = `Net Profit,Total Closed Trades,Percent Profitable,Profit Factor,Max Drawdown,From,To
100000,120,48.5,1.42,-8.2,2024-01-01,2025-12-31
`;
const VALID_CSV_BOM = `\uFEFFNet Profit,Total Closed Trades,Percent Profitable,Profit Factor,Max Drawdown,From,To
100000,120,48.5,1.42,-8.2,2024-01-01,2025-12-31
`;
const VALID_CSV_JP = `純利益,総クローズトレード数,勝率,プロフィットファクター,最大ドローダウン,開始,終了
"¥100,000",120,48.5%,+1.42,(8.2),2024-01-01,2025-12-31
`;
const VALID_CSV_JP_BOM = `\uFEFF純利益,総クローズトレード数,勝率,プロフィットファクター,最大ドローダウン,開始,終了
"¥100,000",120,48.5%,+1.42,(8.2),2024-01-01,2025-12-31
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
    await waitForBackgroundJobs();
    expect([...runtime.aiJobs.values()]).toHaveLength(1);
    expect([...runtime.aiJobs.values()][0]).toMatchObject({
      jobType: 'generate_backtest_review_summary',
      targetEntityType: 'backtest',
      targetEntityId: backtestId,
      status: 'succeeded',
    });
    expect([...runtime.aiJobs.values()][0].requestPayload).toMatchObject({
      trigger: 'csv_import_auto',
      source_import_id: body.data.import.id,
    });
    expect([...runtime.aiSummaries.values()]).toHaveLength(1);
    expect([...runtime.aiSummaries.values()][0].summaryScope).toBe('backtest_review');

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
    expect(detailBody.data.symbol_strategy_application).toBeNull();

    await app.close();
  });

  it('returns symbol strategy application backlink on backtest detail', async () => {
    const app = await createApp();
    const now = new Date('2026-05-01T00:00:00.000Z');
    runtime.symbols.set('sym-1', {
      id: 'sym-1',
      symbol: 'TSE:2148',
      symbolCode: '2148',
      marketCode: 'JP',
      tradingviewSymbol: 'TSE:2148',
      displayName: 'Sample Corp',
    });
    runtime.strategies.set('str-1', {
      id: 'str-1',
      title: 'Breakout strategy',
    });
    runtime.applications.set('app-1', {
      id: 'app-1',
      symbolId: 'sym-1',
      strategyRuleId: 'str-1',
      strategyRuleVersionId: 'ver-1',
      status: 'active',
      source: 'manual',
      memo: 'watch for breakout',
      createdAt: now,
      updatedAt: now,
    });
    runtime.backtests.set('bt-ssa', {
      id: 'bt-ssa',
      strategyRuleVersionId: 'ver-1',
      strategySnapshotJson: null,
      title: 'application report',
      executionSource: 'tradingview',
      market: 'JP_STOCK',
      timeframe: 'D',
      status: 'imported',
      createdAt: now,
      updatedAt: now,
    });
    runtime.backtests.set('bt-internal-related', {
      id: 'bt-internal-related',
      strategyRuleVersionId: 'ver-1',
      strategySnapshotJson: {
        strategy_id: 'str-1',
        strategy_version_id: 'ver-1',
        natural_language_rule: '25日移動平均を上抜けたら買い',
        generated_pine: 'strategy("base")',
        market: 'JP_STOCK',
        timeframe: 'D',
        warnings: [],
        assumptions: [],
        captured_at: '2026-05-02T00:00:00.000Z',
        execution_source: 'internal_backtest',
        internal_backtest_execution_id: 'exec-related',
        result_summary: {
          period: {
            from: '2024-01-01',
            to: '2025-12-31',
          },
          metrics: {
            trade_count: 4,
            total_return_percent: 12.3,
            price_change_percent: 10.5,
            max_drawdown_percent: -4.2,
            profit_factor: 1.8,
            win_rate: 55,
          },
        },
      },
      title: 'internal related report',
      executionSource: 'internal_backtest',
      market: 'JP_STOCK',
      timeframe: 'D',
      status: 'completed',
      createdAt: new Date('2026-05-02T00:00:00.000Z'),
      updatedAt: new Date('2026-05-02T00:00:00.000Z'),
    });
    runtime.imports.set('imp-bt-ssa', {
      id: 'imp-bt-ssa',
      backtestId: 'bt-ssa',
      fileName: 'tradingview.csv',
      fileSize: 123,
      contentType: 'text/csv',
      rawCsvText: VALID_CSV,
      parseStatus: 'parsed',
      parseError: null,
      parsedSummaryJson: {
        netProfit: 100000,
        totalTrades: 120,
        winRate: 48.5,
        profitFactor: 1.42,
        maxDrawdown: -8.2,
        periodFrom: '2024-01-01',
        periodTo: '2025-12-31',
      },
      createdAt: now,
      updatedAt: now,
    });
    runtime.applicationRuns.set('run-ssa', {
      id: 'run-ssa',
      applicationId: 'app-1',
      runType: 'csv_import',
      status: 'succeeded',
      backtestId: 'bt-ssa',
      createdAt: now,
      updatedAt: now,
    });
    runtime.applicationRuns.set('run-internal-related', {
      id: 'run-internal-related',
      applicationId: 'app-1',
      runType: 'internal_backtest',
      status: 'succeeded',
      backtestId: 'bt-internal-related',
      createdAt: new Date('2026-05-02T00:00:00.000Z'),
      updatedAt: new Date('2026-05-02T00:00:00.000Z'),
    });
    runtime.aiSummaries.set('sum-bt-ssa', {
      id: 'sum-bt-ssa',
      summaryScope: 'backtest_review',
      targetEntityType: 'backtest',
      targetEntityId: 'bt-ssa',
      title: 'CSV summary',
      bodyMarkdown: 'CSV report summary body',
      generatedAt: new Date('2026-05-03T00:00:00.000Z'),
      createdAt: new Date('2026-05-03T00:00:00.000Z'),
    });
    runtime.aiSummaries.set('sum-bt-internal-related', {
      id: 'sum-bt-internal-related',
      summaryScope: 'backtest_review',
      targetEntityType: 'backtest',
      targetEntityId: 'bt-internal-related',
      title: 'Internal summary',
      bodyMarkdown: 'Internal report summary body',
      generatedAt: new Date('2026-05-04T00:00:00.000Z'),
      createdAt: new Date('2026-05-04T00:00:00.000Z'),
    });

    const detail = await app.inject({
      method: 'GET',
      url: '/api/backtests/bt-ssa',
    });

    expect(detail.statusCode).toBe(200);
    expect(detail.json().data.symbol_strategy_application).toMatchObject({
      application_id: 'app-1',
      application_status: 'active',
      application_source: 'manual',
      application_memo: 'watch for breakout',
      run_id: 'run-ssa',
      run_type: 'csv_import',
      run_status: 'succeeded',
      symbol: {
        id: 'sym-1',
        symbol_code: '2148',
        market_code: 'JP',
        tradingview_symbol: 'TSE:2148',
        display_name: 'Sample Corp',
      },
      strategy: {
        id: 'str-1',
        title: 'Breakout strategy',
      },
      strategy_version: {
        id: 'ver-1',
        market: 'JP_STOCK',
        timeframe: 'D',
      },
    });
    expect(detail.json().data.symbol_strategy_application.related_reports).toEqual([
      {
        backtest_id: 'bt-internal-related',
        title: 'internal related report',
        execution_source: 'internal_backtest',
        status: 'completed',
        run_type: 'internal_backtest',
        run_status: 'succeeded',
        updated_at: '2026-05-02T00:00:00.000Z',
        metrics: {
          period_from: '2024-01-01',
          period_to: '2025-12-31',
          trade_count: 4,
          total_return_percent: 12.3,
          price_change_percent: 10.5,
          max_drawdown_percent: -4.2,
          profit_factor: 1.8,
          win_rate: 55,
        },
        ai_review: {
          summary_id: 'sum-bt-internal-related',
          title: 'Internal summary',
          body_markdown: 'Internal report summary body',
          generated_at: '2026-05-04T00:00:00.000Z',
          structured_json: null,
          status: 'available',
          insufficient_context: false,
        },
      },
    ]);
    expect(detail.json().data.symbol_strategy_application.current_report).toMatchObject({
      backtest_id: 'bt-ssa',
      ai_review: {
        summary_id: 'sum-bt-ssa',
        title: 'CSV summary',
        body_markdown: 'CSV report summary body',
        generated_at: '2026-05-03T00:00:00.000Z',
        structured_json: null,
        status: 'available',
        insufficient_context: false,
      },
      metrics: {
        period_from: '2024-01-01',
        period_to: '2025-12-31',
        trade_count: 120,
        max_drawdown_percent: -8.2,
        profit_factor: 1.42,
        win_rate: 48.5,
      },
    });

    await app.close();
  });

  it('returns internal backtest report snapshot fields on backtest detail', async () => {
    const app = await createApp();
    const now = new Date('2026-05-01T00:00:00.000Z');
    runtime.backtests.set('bt-internal', {
      id: 'bt-internal',
      strategyRuleVersionId: 'ver-1',
      strategySnapshotJson: {
        strategy_id: 'str-1',
        strategy_version_id: 'ver-1',
        natural_language_rule: '25日移動平均を上抜けたら買い',
        generated_pine: 'strategy("base")',
        market: 'JP_STOCK',
        timeframe: 'D',
        warnings: [],
        assumptions: [],
        captured_at: '2026-05-01T00:00:00.000Z',
        execution_source: 'internal_backtest',
        internal_backtest_execution_id: 'exec-1',
        result_summary: {
          summary_kind: 'engine_estimated',
          period: {
            from: '2025-01-01',
            to: '2025-12-31',
          },
          metrics: {
            bar_count: 245,
            price_change_percent: 12.34,
            range_percent: 26.32,
          },
        },
        artifact_pointer: {
          kind: 'internal_backtest_result',
          execution_id: 'exec-1',
        },
        reported_at: '2026-05-01T01:00:00.000Z',
      },
      title: 'internal report',
      executionSource: 'internal_backtest',
      market: 'JP_STOCK',
      timeframe: 'D',
      status: 'completed',
      createdAt: now,
      updatedAt: now,
    });
    const detail = await app.inject({
      method: 'GET',
      url: '/api/backtests/bt-internal',
    });

    expect(detail.statusCode).toBe(200);
    const snapshot = detail.json().data.used_strategy.snapshot;
    expect(snapshot.internal_backtest_execution_id).toBe('exec-1');
    expect(snapshot.execution_source).toBe('internal_backtest');
    expect(snapshot.result_summary.metrics.bar_count).toBe(245);
    expect(snapshot.artifact_pointer.execution_id).toBe('exec-1');
    expect(detail.json().data.latest_import).toBeNull();
    expect(detail.json().data.imports).toEqual([]);

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
    expect(body.data.import.parsed_summary.trade_summary).toMatchObject({
      trade_count: 2,
      first_entry_at: '2026-03-25',
      last_exit_at: '2026-04-10',
      gross_profit: 100,
      gross_loss: -50,
    });
    expect(body.data.import.parsed_summary.trades).toHaveLength(2);
    expect(body.data.import.parsed_summary.trades[0]).toMatchObject({
      trade_no: 1,
      side: 'long',
      signal: 'Long',
      entry_at: '2026-03-25',
      entry_price: 1000,
      exit_at: '2026-04-01',
      exit_price: 1100,
      quantity: 1,
      profit: 100,
      net_profit: 100,
      profit_percent: 10,
      return_percent: 10,
    });
    expect(JSON.stringify(body.data)).not.toContain(TRADES_CSV_JP);
    expect(JSON.stringify(body.data)).not.toContain('token');
    expect(JSON.stringify(body.data)).not.toContain('secret');

    await app.close();
  });

  it('parses Japanese performance summary csv', async () => {
    const app = await createApp();

    const createdBacktest = await app.inject({
      method: 'POST',
      url: '/api/backtests',
      payload: {
        strategy_version_id: 'ver-1',
        title: '日本語 Performance Summary',
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
        file_name: 'performance_summary_jp.csv',
        content_type: 'text/csv',
        csv_text: VALID_CSV_JP,
      },
    });
    expect(imported.statusCode).toBe(201);
    const body = imported.json();
    expect(body.data.import.parse_status).toBe('parsed');
    expect(body.data.import.parsed_summary).toEqual({
      totalTrades: 120,
      winRate: 48.5,
      profitFactor: 1.42,
      maxDrawdown: -8.2,
      netProfit: 100000,
      periodFrom: '2024-01-01',
      periodTo: '2025-12-31',
    });

    await app.close();
  });

  it('parses BOM Japanese performance summary csv', async () => {
    const app = await createApp();

    const createdBacktest = await app.inject({
      method: 'POST',
      url: '/api/backtests',
      payload: {
        strategy_version_id: 'ver-1',
        title: 'BOM 日本語 Performance Summary',
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
        file_name: 'performance_summary_jp_bom.csv',
        content_type: 'text/csv',
        csv_text: VALID_CSV_JP_BOM,
      },
    });
    expect(imported.statusCode).toBe(201);
    const body = imported.json();
    expect(body.data.import.parse_status).toBe('parsed');
    expect(body.data.import.parsed_summary.netProfit).toBe(100000);
    expect(body.data.import.parsed_summary.maxDrawdown).toBe(-8.2);

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
    expect(body.data.import.parsed_summary.trade_summary).toMatchObject({
      trade_count: 2,
      first_entry_at: '2026-03-25',
      last_exit_at: '2026-04-10',
      gross_profit: 100,
      gross_loss: -50,
    });
    expect(body.data.import.parsed_summary.trades).toHaveLength(2);
    expect(body.data.import.parsed_summary.trades[0]).toMatchObject({
      trade_no: 1,
      side: 'long',
      signal: 'Long',
      entry_at: '2026-03-25',
      entry_price: 1000,
      exit_at: '2026-04-01',
      exit_price: 1100,
      quantity: 1,
      profit: 100,
      net_profit: 100,
      profit_percent: null,
      return_percent: null,
    });
    expect(JSON.stringify(body.data)).not.toContain(TRADES_CSV_EN);
    expect(JSON.stringify(body.data)).not.toContain('stack trace');

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
    await waitForBackgroundJobs();
    expect(runtime.aiJobs.size).toBe(0);
    expect(runtime.aiSummaries.size).toBe(0);

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
        file_name: 'broken.csv',
        content_type: 'text/csv',
        csv_text: UNSUPPORTED_CSV,
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
