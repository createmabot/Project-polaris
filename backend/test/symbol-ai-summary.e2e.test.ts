import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { symbolRoutes } from '../src/routes/symbols';
import { errorHandler } from '../src/utils/response';

type AiJobRow = {
  id: string;
  jobType: string;
  targetEntityType: string;
  targetEntityId: string;
  status: string;
  errorMessage?: string | null;
  responsePayload?: Record<string, unknown> | null;
};

type AiSummaryRow = {
  id: string;
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

type Runtime = {
  symbolExists: boolean;
  references: Array<{
    id: string;
    symbolId: string;
    title: string;
    referenceType: string;
    summaryText: string | null;
    publishedAt: Date | null;
    updatedAt: Date;
  }>;
  latestNote: {
    id: string;
    userId: string | null;
    title: string;
    thesisText: string | null;
    updatedAt: Date;
    status: string;
    symbolId: string;
  } | null;
  aiJobs: AiJobRow[];
  aiSummaries: AiSummaryRow[];
  nextJobId: number;
  nextSummaryId: number;
  homeAiMode: 'ok' | 'throw' | 'fallback';
};

let runtime: Runtime;

function createRuntime(): Runtime {
  return {
    symbolExists: true,
    references: [
      {
        id: 'ref-1',
        symbolId: 'sym-1',
        title: 'Q4 earnings update',
        referenceType: 'earnings',
        summaryText: 'Revenue grew 8% YoY',
        publishedAt: new Date('2026-04-20T09:00:00+09:00'),
        updatedAt: new Date('2026-04-21T10:00:00+09:00'),
      },
    ],
    latestNote: {
      id: 'note-1',
      userId: 'user-1',
      title: 'Long-term thesis',
      thesisText: 'EV expansion remains core growth driver',
      updatedAt: new Date('2026-04-21T12:00:00+09:00'),
      status: 'active',
      symbolId: 'sym-1',
    },
    aiJobs: [],
    aiSummaries: [],
    nextJobId: 1,
    nextSummaryId: 1,
    homeAiMode: 'ok',
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
    symbol: {
      findUnique: async ({ where }: any) => {
        if (!runtime.symbolExists || where?.id !== 'sym-1') return null;
        return {
          id: 'sym-1',
          symbol: 'TYO:7203',
          symbolCode: '7203',
          displayName: 'Toyota',
          marketCode: 'JP',
          tradingviewSymbol: 'TYO:7203',
        };
      },
    },
    externalReference: {
      findMany: async ({ where }: any) => {
        const ids: string[] = where?.id?.in ?? [];
        return runtime.references
          .filter((ref) => ref.symbolId === where?.symbolId && ids.includes(ref.id))
          .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0));
      },
    },
    researchNote: {
      findFirst: async ({ where }: any) => {
        if (!runtime.latestNote) return null;
        if (runtime.latestNote.symbolId !== where?.symbolId) return null;
        if (runtime.latestNote.status !== where?.status) return null;
        return runtime.latestNote;
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
          if (where?.targetEntityType && summary.targetEntityType !== where.targetEntityType) return false;
          if (where?.targetEntityId && summary.targetEntityId !== where.targetEntityId) return false;
          if (where?.summaryScope && summary.summaryScope !== where.summaryScope) return false;
          if (where?.inputSnapshotHash && summary.inputSnapshotHash !== where.inputSnapshotHash) return false;
          return true;
        });
        rows.sort((a, b) => (b.generatedAt?.getTime() ?? 0) - (a.generatedAt?.getTime() ?? 0));
        return rows[0] ?? null;
      },
      create: async ({ data }: any) => {
        const row: AiSummaryRow = {
          id: nextSummaryId(),
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
    alertEvent: {
      findMany: async () => [],
    },
  };

  return { prisma };
});

vi.mock('../src/market/snapshot', () => ({
  getCurrentSnapshotForSymbol: vi.fn(async () => ({
    last_price: 3050,
    change: 12.5,
    change_percent: 0.41,
    volume: 1200000,
    as_of: '2026-04-21T06:00:00.000Z',
    market_status: 'closed',
    source_name: 'stooq_daily',
  })),
}));

vi.mock('../src/ai/home-ai-service', () => ({
  HomeAiService: class {
    async generateSymbolThesisSummary(_context: any) {
      if (runtime.homeAiMode === 'throw') {
        throw new Error('provider failed');
      }

      if (runtime.homeAiMode === 'fallback') {
        return {
          output: {
            title: 'fallback thesis',
            bodyMarkdown: 'fallback body',
            structuredJson: {
              schema_name: 'symbol_thesis_summary',
              schema_version: '1.0',
              confidence: 'low',
              insufficient_context: true,
              payload: {
                bullish_points: [],
                bearish_points: [],
                watch_kpis: [],
                next_events: [],
                invalidation_conditions: [],
                overall_view: 'fallback',
              },
            },
            modelName: 'stub-symbol-v1',
            promptVersion: 'v1.0.0-symbol-stub',
          },
          log: {
            initialModel: 'gemma4-ns',
            finalModel: 'stub-symbol-v1',
            escalated: false,
            escalationReason: 'provider_failed_fallback_to_stub',
            retryCount: 0,
            durationMs: 10,
            estimatedTokens: 20,
            estimatedCostUsd: 0,
            provider: 'local_llm',
            fallbackToStub: true,
          },
        };
      }

      return {
        output: {
          title: 'generated thesis',
          bodyMarkdown: 'generated body',
          structuredJson: {
            schema_name: 'symbol_thesis_summary',
            schema_version: '1.0',
            confidence: 'medium',
            insufficient_context: false,
            payload: {
              bullish_points: ['Growth remains resilient'],
              bearish_points: ['Execution risk'],
              watch_kpis: ['Operating margin'],
              next_events: ['Earnings call'],
              invalidation_conditions: ['Guidance cut'],
              overall_view: 'Balanced but constructive',
            },
          },
          modelName: 'gemma4-ns',
          promptVersion: 'v1.0.0-symbol-local',
        },
        log: {
          initialModel: 'gemma4-ns',
          finalModel: 'gemma4-ns',
          escalated: false,
          escalationReason: null,
          retryCount: 0,
          durationMs: 10,
          estimatedTokens: 20,
          estimatedCostUsd: 0,
          provider: 'local_llm',
          fallbackToStub: false,
        },
      };
    }
  },
}));

async function createApp() {
  const app = Fastify({ logger: false });
  app.setErrorHandler(errorHandler);
  app.register(symbolRoutes, { prefix: '/api/symbols' });
  await app.ready();
  return app;
}

describe('symbol ai-summary routes', () => {
  beforeEach(() => {
    runtime = createRuntime();
  });

  it('generates thesis summary and stores ai_jobs/ai_summaries', async () => {
    const app = await createApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/symbols/sym-1/ai-summary/generate',
      payload: {
        scope: 'thesis',
        reference_ids: ['ref-1'],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.status).toBe('queued');
    expect(body.data.summary.status).toBe('available');
    expect(runtime.aiJobs).toHaveLength(1);
    expect(runtime.aiJobs[0].status).toBe('succeeded');
    expect(runtime.aiSummaries).toHaveLength(1);
    expect(runtime.aiSummaries[0].summaryScope).toBe('thesis');

    await app.close();
  });

  it('returns available summary for scope thesis/latest', async () => {
    runtime.aiSummaries.push({
      id: 'sum-existing',
      summaryScope: 'thesis',
      targetEntityType: 'symbol',
      targetEntityId: 'sym-1',
      title: 'existing',
      bodyMarkdown: 'existing body',
      structuredJson: {
        schema_name: 'symbol_thesis_summary',
        schema_version: '1.0',
        confidence: 'medium',
        insufficient_context: false,
        payload: {},
      },
      generatedAt: new Date('2026-04-22T10:00:00+09:00'),
    });

    const app = await createApp();
    const thesisRes = await app.inject({
      method: 'GET',
      url: '/api/symbols/sym-1/ai-summary?scope=thesis',
    });
    expect(thesisRes.statusCode).toBe(200);
    expect(thesisRes.json().data.summary).toMatchObject({
      status: 'available',
      scope: 'thesis',
      title: 'existing',
    });

    const latestRes = await app.inject({
      method: 'GET',
      url: '/api/symbols/sym-1/ai-summary?scope=latest',
    });
    expect(latestRes.statusCode).toBe(200);
    expect(latestRes.json().data.summary).toMatchObject({
      status: 'available',
      scope: 'latest',
      title: 'existing',
    });

    await app.close();
  });

  it('sets ai_jobs to failed when provider returns error', async () => {
    runtime.homeAiMode = 'throw';
    const app = await createApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/symbols/sym-1/ai-summary/generate',
      payload: {
        scope: 'thesis',
        reference_ids: ['ref-1'],
      },
    });

    expect(res.statusCode).toBe(500);
    expect(runtime.aiJobs).toHaveLength(1);
    expect(runtime.aiJobs[0].status).toBe('failed');
    expect(runtime.aiJobs[0].errorMessage).toContain('provider failed');

    await app.close();
  });

  it('persists summary with fallback metadata when provider falls back to stub', async () => {
    runtime.homeAiMode = 'fallback';
    const app = await createApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/symbols/sym-1/ai-summary/generate',
      payload: {
        scope: 'thesis',
        reference_ids: ['ref-1'],
      },
    });

    expect(res.statusCode).toBe(200);
    expect(runtime.aiSummaries).toHaveLength(1);
    expect(runtime.aiSummaries[0].generationContextJson?.fallback_to_stub).toBe(true);
    expect(runtime.aiJobs[0].status).toBe('succeeded');

    await app.close();
  });

  it('rejects latest scope for generation endpoint', async () => {
    const app = await createApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/symbols/sym-1/ai-summary/generate',
      payload: {
        scope: 'latest',
        reference_ids: ['ref-1'],
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');

    await app.close();
  });
});
