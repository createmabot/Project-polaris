import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type AiJobRow = {
  id: string;
  jobType: string;
  targetEntityType: string;
  targetEntityId: string;
  status: string;
  errorMessage?: string | null;
  responsePayload?: Record<string, unknown> | null;
  modelName?: string | null;
  promptVersion?: string | null;
};

type AiSummaryRow = {
  id: string;
  aiJobId?: string | null;
  summaryScope: string;
  targetEntityType: string;
  targetEntityId: string;
  title: string | null;
  bodyMarkdown: string;
  structuredJson: Record<string, unknown> | null;
  generatedAt: Date | null;
  inputSnapshotHash?: string | null;
  modelName?: string | null;
  promptVersion?: string | null;
  generationContextJson?: Record<string, unknown> | null;
};

type BacktestRow = {
  id: string;
  strategyRuleVersionId: string;
  title: string;
  executionSource: string;
  market: string;
  timeframe: string;
  status: string;
  strategySnapshotJson: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
  strategyRuleVersion: {
    id: string;
    strategyRuleId: string;
    naturalLanguageRule: string;
    generatedPine: string | null;
  } | null;
  imports: Array<{
    id: string;
    backtestId: string;
    fileName: string;
    fileSize: number;
    contentType: string | null;
    parseStatus: string;
    parseError: string | null;
    parsedSummaryJson: Record<string, unknown> | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
};

type Runtime = {
  backtest: BacktestRow | null;
  aiJobs: AiJobRow[];
  aiSummaries: AiSummaryRow[];
  nextJobId: number;
  nextSummaryId: number;
  homeAiMode: 'ok' | 'throw' | 'throw_ai_provider' | 'fallback';
  lastBacktestContext: any | null;
};

let runtime: Runtime;

function createRuntime(): Runtime {
  return {
    backtest: {
      id: 'bt-1',
      strategyRuleVersionId: 'ver-1',
      title: 'BT Toyota',
      executionSource: 'tradingview',
      market: 'JP_STOCK',
      timeframe: 'D',
      status: 'imported',
      strategySnapshotJson: {
        strategy_id: 'str-1',
        strategy_version_id: 'ver-1',
        natural_language_rule: 'ma breakout',
        generated_pine: 'strategy("x")',
        market: 'JP_STOCK',
        timeframe: 'D',
        warnings: [],
        assumptions: [],
        captured_at: '2026-04-20T10:00:00.000Z',
      },
      createdAt: new Date('2026-04-20T10:00:00.000Z'),
      updatedAt: new Date('2026-04-20T10:10:00.000Z'),
      strategyRuleVersion: {
        id: 'ver-1',
        strategyRuleId: 'str-1',
        naturalLanguageRule: 'ma breakout',
        generatedPine: 'strategy("x")',
      },
      imports: [
        {
          id: 'imp-1',
          backtestId: 'bt-1',
          fileName: 'a.csv',
          fileSize: 100,
          contentType: 'text/csv',
          parseStatus: 'parsed',
          parseError: null,
          parsedSummaryJson: {
            totalTrades: 120,
            winRate: 58.2,
            profitFactor: 1.42,
            maxDrawdown: -12.5,
            netProfit: 340000,
            periodFrom: '2025-01-01',
            periodTo: '2025-12-31',
          },
          createdAt: new Date('2026-04-20T10:05:00.000Z'),
          updatedAt: new Date('2026-04-20T10:05:00.000Z'),
        },
      ],
    },
    aiJobs: [],
    aiSummaries: [],
    nextJobId: 1,
    nextSummaryId: 1,
    homeAiMode: 'ok',
    lastBacktestContext: null,
  };
}

function nextJobId(): string {
  const id = `job-${runtime.nextJobId}`;
  runtime.nextJobId += 1;
  return id;
}

function nextSummaryId(): string {
  const id = `sum-${runtime.nextSummaryId}`;
  runtime.nextSummaryId += 1;
  return id;
}

vi.mock('../src/db', () => {
  const prisma = {
    backtest: {
      findUnique: async ({ where }: any) => {
        if (!runtime.backtest || where?.id !== runtime.backtest.id) return null;
        return runtime.backtest;
      },
    },
    aiJob: {
      create: async ({ data }: any) => {
        const row: AiJobRow = {
          id: nextJobId(),
          jobType: data.jobType,
          targetEntityType: data.targetEntityType,
          targetEntityId: data.targetEntityId,
          status: data.status ?? 'queued',
          modelName: data.modelName ?? null,
          promptVersion: data.promptVersion ?? null,
          responsePayload: data.responsePayload ?? null,
          errorMessage: null,
        };
        runtime.aiJobs.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = runtime.aiJobs.find((job) => job.id === where.id);
        if (!row) throw new Error(`job not found: ${where.id}`);
        Object.assign(row, data);
        return row;
      },
    },
    aiSummary: {
      findFirst: async ({ where }: any) => {
        const rows = runtime.aiSummaries.filter((summary) => {
          if (where?.id && summary.id !== where.id) return false;
          if (where?.aiJobId && summary.aiJobId !== where.aiJobId) return false;
          if (where?.targetEntityType && summary.targetEntityType !== where.targetEntityType) return false;
          if (where?.targetEntityId && summary.targetEntityId !== where.targetEntityId) return false;
          if (where?.summaryScope && summary.summaryScope !== where.summaryScope) return false;
          if (where?.inputSnapshotHash && summary.inputSnapshotHash !== where.inputSnapshotHash) return false;
          if (Array.isArray(where?.OR) && where.OR.length > 0) {
            const matchedOr = where.OR.some((condition: any) => {
              if (condition.targetEntityType && summary.targetEntityType !== condition.targetEntityType) return false;
              if (condition.targetEntityId?.in) {
                return condition.targetEntityId.in.includes(summary.targetEntityId);
              }
              if (condition.targetEntityId) {
                return summary.targetEntityId === condition.targetEntityId;
              }
              return true;
            });
            if (!matchedOr) return false;
          }
          return true;
        });
        rows.sort((a, b) => (b.generatedAt?.getTime() ?? 0) - (a.generatedAt?.getTime() ?? 0));
        return rows[0] ?? null;
      },
      create: async ({ data }: any) => {
        const row: AiSummaryRow = {
          id: nextSummaryId(),
          aiJobId: data.aiJobId ?? null,
          summaryScope: data.summaryScope,
          targetEntityType: data.targetEntityType,
          targetEntityId: data.targetEntityId,
          title: data.title ?? null,
          bodyMarkdown: data.bodyMarkdown,
          structuredJson: data.structuredJson ?? null,
          generatedAt: data.generatedAt ?? null,
          inputSnapshotHash: data.inputSnapshotHash ?? null,
          modelName: data.modelName ?? null,
          promptVersion: data.promptVersion ?? null,
          generationContextJson: data.generationContextJson ?? null,
        };
        runtime.aiSummaries.push(row);
        return row;
      },
    },
  };

  return { prisma };
});

vi.mock('../src/ai/home-ai-service', () => ({
  HomeAiService: class {
    async generateBacktestSummary(_context: any) {
      runtime.lastBacktestContext = _context;
      if (runtime.homeAiMode === 'throw') {
        throw new Error('provider failed');
      }
      if (runtime.homeAiMode === 'throw_ai_provider') {
        throw new Error('ai_provider_failed(local_llm): local_llm backtest summary returned empty content');
      }

      if (runtime.homeAiMode === 'fallback') {
        return {
          output: {
            title: 'fallback backtest summary',
            bodyMarkdown: '## fallback backtest summary\n\n### 結論\nfallback\n\n### 良い点\n- fallback\n\n### 懸念点\n- limited context\n\n### 次に確認すべき点\n- re-check',
            structuredJson: {
              schema_name: 'backtest_review_summary',
              schema_version: '1.0',
              confidence: 'low',
              insufficient_context: true,
              payload: {
                conclusion: 'fallback',
                strengths: [],
                risks: ['limited context'],
                next_actions: ['re-check'],
                key_metrics: {
                  total_trades: null,
                  win_rate: null,
                  profit_factor: null,
                  max_drawdown: null,
                  net_profit: null,
                },
                overall_view: 'fallback',
              },
            },
            modelName: 'stub-backtest-v1',
            promptVersion: 'v1.0.0-backtest-stub',
          },
          log: {
            initialModel: 'gemma4-ns',
            finalModel: 'stub-backtest-v1',
            escalated: false,
            escalationReason: 'provider_failed_fallback_to_stub',
            retryCount: 0,
            durationMs: 20,
            estimatedTokens: 100,
            estimatedCostUsd: 0,
            provider: 'local_llm',
            fallbackToStub: true,
          },
        };
      }

      return {
        output: {
          title: 'backtest summary',
          bodyMarkdown: '## backtest summary\n\n### 結論\n総評\n\n### 良い点\n- Stable profitability\n\n### 懸念点\n- Regime shift risk\n\n### 次に確認すべき点\n- Run out-of-sample check',
          structuredJson: {
            schema_name: 'backtest_review_summary',
            schema_version: '1.0',
            confidence: 'medium',
            insufficient_context: false,
            payload: {
              conclusion: '総評',
              strengths: ['Stable profitability'],
              risks: ['Regime shift risk'],
              next_actions: ['Run out-of-sample check'],
              key_metrics: {
                total_trades: 120,
                win_rate: 58.2,
                profit_factor: 1.42,
                max_drawdown: -12.5,
                net_profit: 340000,
              },
              overall_view: 'Usable baseline with validation needs',
            },
          },
          modelName: 'gemma4-ns',
          promptVersion: 'v1.0.0-backtest-local',
        },
        log: {
          initialModel: 'gemma4-ns',
          finalModel: 'gemma4-ns',
          escalated: false,
          escalationReason: null,
          retryCount: 0,
          durationMs: 25,
          estimatedTokens: 120,
          estimatedCostUsd: 0,
          provider: 'local_llm',
          fallbackToStub: false,
        },
      };
    }
  },
}));

import { backtestRoutes } from '../src/routes/backtests';
import { errorHandler } from '../src/utils/response';

async function createApp() {
  const app = Fastify({ logger: false });
  app.setErrorHandler(errorHandler);
  app.register(backtestRoutes, { prefix: '/api/backtests' });
  await app.ready();
  return app;
}

describe('backtest ai-summary routes', () => {
  beforeEach(() => {
    runtime = createRuntime();
  });

  it('generates backtest summary and stores ai_jobs/ai_summaries', async () => {
    const app = await createApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/backtests/bt-1/summary/generate',
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.summary.status).toBe('available');
    expect(runtime.aiJobs).toHaveLength(1);
    expect(runtime.aiJobs[0].status).toBe('succeeded');
    expect(runtime.aiSummaries).toHaveLength(1);
    expect(runtime.aiSummaries[0].summaryScope).toBe('backtest_review');
    expect(runtime.lastBacktestContext?.tradeSummary).not.toBeNull();
    expect(runtime.lastBacktestContext?.tradeSummary?.parsedImportCount).toBe(1);
    expect(runtime.lastBacktestContext?.importParsedSummaries?.length).toBeGreaterThan(0);
    expect(runtime.lastBacktestContext?.comparisonDiff).toBeNull();
    expect(runtime.aiSummaries[0].bodyMarkdown).toContain('### 結論');
    expect(runtime.aiSummaries[0].bodyMarkdown).toContain('### 良い点');
    expect(runtime.aiSummaries[0].bodyMarkdown).toContain('### 懸念点');
    expect(runtime.aiSummaries[0].bodyMarkdown).toContain('### 次に確認すべき点');

    await app.close();
  });

  it('returns ai_review on backtest detail GET', async () => {
    runtime.aiSummaries.push({
      id: 'sum-existing',
      summaryScope: 'backtest_review',
      targetEntityType: 'backtest',
      targetEntityId: 'bt-1',
      title: 'existing review',
      bodyMarkdown: 'existing body',
      structuredJson: {
        schema_name: 'backtest_review_summary',
        schema_version: '1.0',
        confidence: 'medium',
        insufficient_context: false,
        payload: {},
      },
      generatedAt: new Date('2026-04-22T10:00:00+09:00'),
    });

    const app = await createApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/backtests/bt-1',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.ai_review).toMatchObject({
      status: 'available',
      title: 'existing review',
      summary_id: 'sum-existing',
    });

    await app.close();
  });

  it('sets ai_jobs to failed when provider returns error', async () => {
    runtime.homeAiMode = 'throw';
    const app = await createApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/backtests/bt-1/summary/generate',
      payload: {},
    });

    expect(res.statusCode).toBe(500);
    expect(runtime.aiJobs).toHaveLength(1);
    expect(runtime.aiJobs[0].status).toBe('failed');
    expect(runtime.aiJobs[0].errorMessage).toContain('provider failed');

    await app.close();
  });

  it('returns AI_PROVIDER_FAILED when provider failure is classified', async () => {
    runtime.homeAiMode = 'throw_ai_provider';
    const app = await createApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/backtests/bt-1/summary/generate',
      payload: {},
    });

    expect(res.statusCode).toBe(502);
    expect(res.json().error.code).toBe('AI_PROVIDER_FAILED');
    expect(runtime.aiJobs).toHaveLength(1);
    expect(runtime.aiJobs[0].status).toBe('failed');
    expect(runtime.aiJobs[0].errorMessage).toContain('ai_provider_failed(local_llm)');

    await app.close();
  });

  it('persists summary with fallback metadata when provider falls back', async () => {
    runtime.homeAiMode = 'fallback';
    const app = await createApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/backtests/bt-1/summary/generate',
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    expect(runtime.aiSummaries).toHaveLength(1);
    expect(runtime.aiSummaries[0].generationContextJson?.fallback_to_stub).toBe(true);

    await app.close();
  });
});
