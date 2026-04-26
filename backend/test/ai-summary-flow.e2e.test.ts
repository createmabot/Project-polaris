import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { alertRoutes } from '../src/routes/alerts';
import { summaryRoutes } from '../src/routes/summaries';
import { errorHandler } from '../src/utils/response';

type AiJobRow = {
  id: string;
  jobType: string;
  targetEntityType: string;
  targetEntityId: string;
  status: string;
  startedAt: Date | null;
  completedAt: Date | null;
  responsePayload?: Record<string, unknown> | null;
  modelName?: string | null;
  promptVersion?: string | null;
};

type Runtime = {
  alertExists: boolean;
  references: string[];
  aiJobs: AiJobRow[];
  summaries: Array<{
    id: string;
    targetEntityType: string;
    targetEntityId: string;
    summaryScope: string;
    title: string | null;
    bodyMarkdown: string;
    structuredJson: Record<string, unknown> | null;
    generatedAt: Date | null;
    inputSnapshotHash?: string | null;
    generationContextJson?: Record<string, unknown> | null;
  }>;
  dailySummaries: Array<{
    id: string;
    targetEntityType: string;
    summaryScope: string;
    title: string | null;
    bodyMarkdown: string;
    generatedAt: Date | null;
    structuredJson: Record<string, unknown> | null;
    generationContextJson?: Record<string, unknown> | null;
  }>;
  marketSnapshotCount: number;
  alertCount: number;
  referenceCount: number;
  nextJobId: number;
};

let runtime: Runtime;

function createRuntime(): Runtime {
  return {
    alertExists: true,
    references: ['ref-1'],
    aiJobs: [],
    summaries: [],
    dailySummaries: [
      {
        id: 'daily-evening',
        targetEntityType: 'market_snapshot',
        summaryScope: 'daily',
        title: 'evening summary',
        bodyMarkdown: 'evening body',
        generatedAt: new Date('2026-04-18T19:00:00+09:00'),
        structuredJson: {
          schema_name: 'daily_summary',
          schema_version: '1.0',
          insufficient_context: false,
          payload: {},
        },
        generationContextJson: { summary_type: 'evening' },
      },
      {
        id: 'daily-morning',
        targetEntityType: 'market_snapshot',
        summaryScope: 'daily',
        title: 'morning summary',
        bodyMarkdown: 'morning body',
        generatedAt: new Date('2026-04-18T08:00:00+09:00'),
        structuredJson: {
          schema_name: 'daily_summary',
          schema_version: '1.0',
          insufficient_context: true,
          payload: {},
        },
        generationContextJson: { summary_type: 'morning' },
      },
    ],
    marketSnapshotCount: 1,
    alertCount: 1,
    referenceCount: 1,
    nextJobId: 1,
  };
}

function nextJobId() {
  const id = `job-${runtime.nextJobId}`;
  runtime.nextJobId += 1;
  return id;
}

vi.mock('../src/db', () => {
  const prisma = {
    alertEvent: {
      findUnique: async () => {
        if (!runtime.alertExists) return null;
        return {
          id: 'alert-1',
          userId: 'user-1',
          processingStatus: 'received',
          externalReferences: runtime.references.map((id) => ({ id })),
        };
      },
      update: async () => ({}),
      count: async () => runtime.alertCount,
    },
    aiJob: {
      findFirst: async ({ where, orderBy, select }: any) => {
        let rows = [...runtime.aiJobs];
        if (where?.targetEntityType) {
          rows = rows.filter((r) => r.targetEntityType === where.targetEntityType);
        }
        if (where?.targetEntityId) {
          rows = rows.filter((r) => r.targetEntityId === where.targetEntityId);
        }
        if (where?.jobType) {
          rows = rows.filter((r) => r.jobType === where.jobType);
        }
        if (rows.length === 0) return null;
        // In this simple mock, assuming the latest is the last one added
        const job = rows[rows.length - 1];
        if (select) {
          const result: Record<string, unknown> = {};
          for (const key of Object.keys(select)) {
            if (key in job) {
              result[key] = (job as any)[key];
            } else if (key === 'createdAt' || key === 'completedAt') {
              // mock might not have all dates, provide fallback
              result[key] = new Date();
            } else if (key === 'retryCount') {
              result[key] = 0;
            }
          }
          return result;
        }
        return job;
      },
      create: async ({ data }: any) => {
        const row: AiJobRow = {
          id: nextJobId(),
          jobType: data.jobType,
          targetEntityType: data.targetEntityType,
          targetEntityId: data.targetEntityId,
          status: data.status ?? 'queued',
          startedAt: null,
          completedAt: null,
          responsePayload: null,
          modelName: null,
          promptVersion: null,
        };
        runtime.aiJobs.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = runtime.aiJobs.find((job) => job.id === where.id);
        if (!row) {
          throw new Error(`job not found: ${where.id}`);
        }
        Object.assign(row, data);
        return row;
      },
    },
    aiSummary: {
      findFirst: async ({ where }: any) => {
        if (where?.summaryScope === 'daily') {
          return runtime.dailySummaries
            .filter((row) => row.summaryScope === 'daily')
            .sort((a, b) => (b.generatedAt?.getTime() ?? 0) - (a.generatedAt?.getTime() ?? 0))[0] ?? null;
        }
        return runtime.summaries.find((row) => {
          if (row.targetEntityType !== where.targetEntityType) return false;
          if (row.targetEntityId !== where.targetEntityId) return false;
          if (row.summaryScope !== where.summaryScope) return false;
          if (where.inputSnapshotHash && row.inputSnapshotHash !== where.inputSnapshotHash) return false;
          return true;
        }) ?? null;
      },
      findMany: async ({ where }: any) => {
        if (where?.summaryScope !== 'daily') return [];
        let rows = runtime.dailySummaries
          .filter((row) => row.summaryScope === 'daily' && row.targetEntityType === 'market_snapshot');
        if (where.generatedAt?.gte && where.generatedAt?.lt) {
          const gte = (where.generatedAt.gte as Date).getTime();
          const lt = (where.generatedAt.lt as Date).getTime();
          rows = rows.filter((row) => {
            const ts = row.generatedAt?.getTime();
            return typeof ts === 'number' && ts >= gte && ts < lt;
          });
        }
        return rows.sort((a, b) => (b.generatedAt?.getTime() ?? 0) - (a.generatedAt?.getTime() ?? 0));
      },
      create: async ({ data }: any) => {
        const row = {
          id: `sum-${runtime.summaries.length + 1}`,
          ...data,
        };
        if (data.summaryScope === 'daily') {
          runtime.dailySummaries.push({
            id: row.id,
            targetEntityType: row.targetEntityType,
            summaryScope: row.summaryScope,
            title: row.title ?? null,
            bodyMarkdown: row.bodyMarkdown,
            generatedAt: row.generatedAt ?? null,
            structuredJson: row.structuredJson ?? null,
            generationContextJson: row.generationContextJson ?? null,
          });
        } else {
          runtime.summaries.push(row);
        }
        return row;
      },
    },
    marketSnapshot: {
      count: async () => runtime.marketSnapshotCount,
    },
    externalReference: {
      count: async () => runtime.referenceCount,
    },
  };
  return { prisma };
});

vi.mock('../src/ai/context-builder', () => ({
  buildAlertSummaryContext: vi.fn(async () => ({
    alertEventId: 'alert-1',
    alertName: 'seed alert',
    alertType: 'technical',
    timeframe: 'D',
    triggerPrice: 3021.5,
    triggeredAt: new Date('2026-04-18T09:00:00+09:00'),
    symbol: {
      id: 'sym-7203',
      displayName: 'トヨタ自動車',
      tradingviewSymbol: 'TSE:7203',
      marketCode: 'JP_STOCK',
    },
    rawPayload: {},
    referenceIds: runtime.references,
    references: runtime.references.map((id) => ({
      id,
      referenceType: 'news',
      sourceType: 'news',
      title: `reference ${id}`,
      sourceName: 'seed',
      sourceUrl: null,
      publishedAt: null,
      publishedAtIso: null,
      summaryText: 'summary',
      relevanceScore: 50,
    })),
  })),
}));

vi.mock('../src/ai/home-ai-service', () => ({
  HomeAiService: class {
    async generateAlertSummary(context: any) {
      const insufficient = !Array.isArray(context.referenceIds) || context.referenceIds.length === 0;
      return {
        output: {
          title: 'generated title',
          bodyMarkdown: 'generated markdown',
          structuredJson: {
            schema_name: 'alert_reason_summary',
            schema_version: '1.0',
            confidence: insufficient ? 'low' : 'medium',
            insufficient_context: insufficient,
            payload: {},
          },
          modelName: 'mock-v1',
          promptVersion: 'v1.0.0-mock',
        },
        log: {
          initialModel: 'mock-v1',
          finalModel: 'mock-v1',
          escalated: false,
          escalationReason: null,
          retryCount: 0,
          durationMs: 5,
          estimatedTokens: 12,
          estimatedCostUsd: 0,
        },
      };
    }

    async generateDailySummary(context: any) {
      const insufficient =
        context.marketSnapshotCount === 0 || context.alertCount === 0 || context.referenceCount === 0;
      return {
        output: {
          title: `daily ${context.summaryType}`,
          bodyMarkdown: `daily body (${context.summaryType})`,
          structuredJson: {
            schema_name: 'daily_summary',
            schema_version: '1.0',
            confidence: insufficient ? 'low' : 'medium',
            insufficient_context: insufficient,
            payload: {
              highlights: [],
              watch_items: ['watch'],
              focus_symbols: [],
              market_context: { tone: 'neutral', summary: 'summary' },
            },
          },
          modelName: 'mock-v1',
          promptVersion: 'v1.0.0-mock',
        },
        log: {
          initialModel: 'mock-v1',
          finalModel: 'mock-v1',
          escalated: false,
          escalationReason: null,
          retryCount: 0,
          durationMs: 5,
          estimatedTokens: 12,
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
  app.register(alertRoutes, { prefix: '/api/alerts' });
  app.register(summaryRoutes, { prefix: '/api/summaries' });
  await app.ready();
  return app;
}

describe('AI summary minimal flow routes', () => {
  beforeEach(() => {
    runtime = createRuntime();
  });

  it('generates alert summary and persists ai_jobs transitions', async () => {
    const app = await createApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/alerts/alert-1/summary/generate',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.summary.status).toBe('available');
    expect(body.data.summary.insufficient_context).toBe(false);
    expect(runtime.aiJobs).toHaveLength(2);
    expect(runtime.aiJobs.map((row) => row.status)).toEqual(['succeeded', 'succeeded']);
    await app.close();
  });

  it('returns unavailable alert summary when nothing exists', async () => {
    runtime.summaries = [];
    const app = await createApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/alerts/alert-1/summary',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.summary).toMatchObject({
      status: 'unavailable',
      insufficient_context: true,
    });
    await app.close();
  });

  it('selects latest/morning/evening daily summary and handles unavailable with insufficient_context', async () => {
    const app = await createApp();

    const latest = await app.inject({ method: 'GET', url: '/api/summaries/daily?type=latest' });
    expect(latest.statusCode).toBe(200);
    expect(latest.json().data).toMatchObject({
      id: 'daily-evening',
      status: 'available',
      summary_type: 'latest',
    });

    const morning = await app.inject({ method: 'GET', url: '/api/summaries/daily?type=morning' });
    expect(morning.statusCode).toBe(200);
    expect(morning.json().data).toMatchObject({
      id: 'daily-morning',
      status: 'available',
      insufficient_context: true,
      summary_type: 'morning',
    });

    runtime.dailySummaries = [];
    runtime.referenceCount = 0;
    const unavailable = await app.inject({ method: 'GET', url: '/api/summaries/daily?type=evening&date=2026-04-18' });
    expect(unavailable.statusCode).toBe(200);
    expect(unavailable.json().data).toMatchObject({
      status: 'unavailable',
      insufficient_context: true,
      summary_type: 'evening',
      date: '2026-04-18',
    });

    await app.close();
  });

  it('generates daily summary via provider and stores ai_job', async () => {
    const app = await createApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/summaries/daily/generate',
      payload: { type: 'morning', date: '2026-04-19' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.summary).toMatchObject({
      status: 'available',
      summary_type: 'morning',
      date: '2026-04-19',
    });
    expect(runtime.aiJobs.some((row) => row.jobType === 'generate_daily_summary')).toBe(true);

    await app.close();
  });
});

