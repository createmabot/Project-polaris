import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type RuntimeState = {
  symbolSeq: number;
  sessionSeq: number;
  resultSeq: number;
  jobSeq: number;
  summarySeq: number;
  symbols: Map<string, any>;
  alertEvents: Map<string, any>;
  aiSummaries: Map<string, any>;
  researchNotes: Map<string, any>;
  externalReferences: Map<string, any>;
  comparisonSessions: Map<string, any>;
  comparisonSessionSymbols: Map<string, Array<{ symbolId: string; sortOrder: number }>>;
  comparisonResults: Map<string, any>;
  aiJobs: Map<string, any>;
  homeAiMode: 'ok' | 'throw' | 'fallback';
};

let runtime: RuntimeState;

function createRuntime(): RuntimeState {
  return {
    symbolSeq: 1,
    sessionSeq: 1,
    resultSeq: 1,
    jobSeq: 1,
    summarySeq: 1,
    symbols: new Map(),
    alertEvents: new Map(),
    aiSummaries: new Map(),
    researchNotes: new Map(),
    externalReferences: new Map(),
    comparisonSessions: new Map(),
    comparisonSessionSymbols: new Map(),
    comparisonResults: new Map(),
    aiJobs: new Map(),
    homeAiMode: 'ok',
  };
}

function descTime(value: Date | null | undefined): number {
  return value instanceof Date ? value.getTime() : 0;
}

vi.mock('../src/db', () => {
  const prisma = {
    symbol: {
      findMany: async ({ where }: any) => {
        const symbols = [...runtime.symbols.values()];

        if (where?.id?.in) {
          const ids: string[] = where.id.in;
          return symbols.filter((symbol) => ids.includes(symbol.id));
        }

        const orConditions: any[] = Array.isArray(where?.OR) ? where.OR : [];
        if (orConditions.length === 0) {
          return [];
        }

        const matched = new Map<string, any>();
        for (const condition of orConditions) {
          if (condition?.id?.in) {
            const ids: string[] = condition.id.in;
            symbols.filter((symbol) => ids.includes(symbol.id)).forEach((symbol) => matched.set(symbol.id, symbol));
          }
          if (condition?.symbolCode?.in) {
            const values: string[] = condition.symbolCode.in;
            symbols.filter((symbol) => symbol.symbolCode && values.includes(symbol.symbolCode)).forEach((symbol) => matched.set(symbol.id, symbol));
          }
          if (condition?.symbol?.in) {
            const values: string[] = condition.symbol.in;
            symbols.filter((symbol) => symbol.symbol && values.includes(symbol.symbol)).forEach((symbol) => matched.set(symbol.id, symbol));
          }
          if (condition?.tradingviewSymbol?.in) {
            const values: string[] = condition.tradingviewSymbol.in;
            symbols.filter((symbol) => symbol.tradingviewSymbol && values.includes(symbol.tradingviewSymbol)).forEach((symbol) => matched.set(symbol.id, symbol));
          }
          if (condition?.displayName?.in) {
            const values: string[] = condition.displayName.in;
            symbols.filter((symbol) => symbol.displayName && values.includes(symbol.displayName)).forEach((symbol) => matched.set(symbol.id, symbol));
          }
        }

        return [...matched.values()];
      },
    },
    alertEvent: {
      findMany: async ({ where }: any) => {
        const ids: string[] = where?.symbolId?.in ?? [];
        return [...runtime.alertEvents.values()]
          .filter((alert) => alert.symbolId && ids.includes(alert.symbolId))
          .sort((a, b) => {
            const triggerDiff = descTime(b.triggeredAt) - descTime(a.triggeredAt);
            if (triggerDiff !== 0) return triggerDiff;
            return b.receivedAt.getTime() - a.receivedAt.getTime();
          });
      },
    },
    aiSummary: {
      findMany: async ({ where }: any) => {
        const targetIds: string[] = where?.targetEntityId?.in ?? [];
        const targetType = where?.targetEntityType;
        const summaryScope = where?.summaryScope;

        return [...runtime.aiSummaries.values()]
          .filter((summary) => {
            if (targetType && summary.targetEntityType !== targetType) return false;
            if (summaryScope && summary.summaryScope !== summaryScope) return false;
            if (targetIds.length > 0 && !targetIds.includes(summary.targetEntityId)) return false;
            return true;
          })
          .sort((a, b) => descTime(b.generatedAt) - descTime(a.generatedAt));
      },
      findFirst: async ({ where }: any) => {
        const rows = [...runtime.aiSummaries.values()].filter((summary) => {
          if (where?.id && summary.id !== where.id) return false;
          if (where?.aiJobId && summary.aiJobId !== where.aiJobId) return false;
          if (where?.targetEntityType && summary.targetEntityType !== where.targetEntityType) return false;
          if (where?.targetEntityId && summary.targetEntityId !== where.targetEntityId) return false;
          if (where?.summaryScope && summary.summaryScope !== where.summaryScope) return false;
          if (where?.inputSnapshotHash && summary.inputSnapshotHash !== where.inputSnapshotHash) return false;
          return true;
        });
        rows.sort((a, b) => descTime(b.generatedAt) - descTime(a.generatedAt));
        return rows[0] ?? null;
      },
      create: async ({ data }: any) => {
        const id = `sum-${runtime.summarySeq++}`;
        const row = {
          id,
          aiJobId: data.aiJobId ?? null,
          summaryScope: data.summaryScope,
          targetEntityType: data.targetEntityType,
          targetEntityId: data.targetEntityId,
          title: data.title ?? null,
          bodyMarkdown: data.bodyMarkdown,
          structuredJson: data.structuredJson ?? null,
          modelName: data.modelName ?? null,
          promptVersion: data.promptVersion ?? null,
          inputSnapshotHash: data.inputSnapshotHash ?? null,
          generationContextJson: data.generationContextJson ?? null,
          generatedAt: data.generatedAt ?? new Date(),
        };
        runtime.aiSummaries.set(id, row);
        return row;
      },
    },
    researchNote: {
      findMany: async ({ where }: any) => {
        const ids: string[] = where?.symbolId?.in ?? [];
        const status = where?.status;
        return [...runtime.researchNotes.values()]
          .filter((note) => ids.includes(note.symbolId) && (!status || note.status === status))
          .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
      },
    },
    externalReference: {
      findMany: async ({ where }: any) => {
        const ids: string[] = where?.symbolId?.in ?? [];
        return [...runtime.externalReferences.values()]
          .filter((ref) => ref.symbolId && ids.includes(ref.symbolId))
          .sort((a, b) => {
            const publishedDiff = descTime(b.publishedAt) - descTime(a.publishedAt);
            if (publishedDiff !== 0) return publishedDiff;
            return b.createdAt.getTime() - a.createdAt.getTime();
          });
      },
    },
    comparisonSession: {
      create: async ({ data }: any) => {
        const id = `cmp-${runtime.sessionSeq++}`;
        const now = new Date();
        const created = {
          id,
          name: data.name,
          comparisonType: data.comparisonType,
          status: data.status,
          createdAt: now,
          updatedAt: now,
        };
        const symbols = (data.comparisonSymbols?.create ?? []).map((item: any) => ({
          symbolId: item.symbolId,
          sortOrder: item.sortOrder,
        }));
        runtime.comparisonSessions.set(id, created);
        runtime.comparisonSessionSymbols.set(id, symbols);
        return {
          ...created,
          comparisonSymbols: [...symbols].sort((a, b) => a.sortOrder - b.sortOrder),
        };
      },
      findUnique: async ({ where, include }: any) => {
        const session = runtime.comparisonSessions.get(where.id) ?? null;
        if (!session) return null;
        if (include?.comparisonSymbols) {
          const symbols = [...(runtime.comparisonSessionSymbols.get(where.id) ?? [])]
            .sort((a, b) => a.sortOrder - b.sortOrder);
          return { ...session, comparisonSymbols: symbols };
        }
        return session;
      },
    },
    comparisonResult: {
      findFirst: async ({ where }: any) => {
        const sessionId = where?.comparisonSessionId;
        const rows = [...runtime.comparisonResults.values()]
          .filter((row) => row.comparisonSessionId === sessionId)
          .sort((a, b) => descTime(b.generatedAt) - descTime(a.generatedAt));
        return rows[0] ?? null;
      },
      create: async ({ data }: any) => {
        const id = `cmp-result-${runtime.resultSeq++}`;
        const row = {
          id,
          comparisonSessionId: data.comparisonSessionId,
          aiJobId: data.aiJobId ?? null,
          title: data.title ?? null,
          bodyMarkdown: data.bodyMarkdown ?? null,
          structuredJson: data.structuredJson ?? null,
          modelName: data.modelName ?? null,
          promptVersion: data.promptVersion ?? null,
          comparedMetricJson: data.comparedMetricJson,
          generatedAt: data.generatedAt ?? new Date(),
        };
        runtime.comparisonResults.set(id, row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = runtime.comparisonResults.get(where.id);
        if (!row) throw new Error(`comparison_result_not_found:${where.id}`);
        const next = { ...row, ...data };
        runtime.comparisonResults.set(where.id, next);
        return next;
      },
    },
    aiJob: {
      findUnique: async ({ where }: any) => {
        const row = runtime.aiJobs.get(where.id) ?? null;
        if (!row) return null;
        return { responsePayload: row.responsePayload ?? null };
      },
      create: async ({ data }: any) => {
        const id = `ai-job-${runtime.jobSeq++}`;
        const row = {
          id,
          status: data.status ?? 'queued',
          jobType: data.jobType,
          targetEntityType: data.targetEntityType,
          targetEntityId: data.targetEntityId,
          requestPayload: data.requestPayload ?? null,
          responsePayload: data.responsePayload ?? null,
          startedAt: data.startedAt ?? null,
          completedAt: data.completedAt ?? null,
          modelName: data.modelName ?? null,
          promptVersion: data.promptVersion ?? null,
          initialModel: null,
          finalModel: null,
          escalated: false,
          escalationReason: null,
          retryCount: 0,
          durationMs: null,
          estimatedTokens: null,
          estimatedCostUsd: null,
          errorMessage: null,
        };
        runtime.aiJobs.set(id, row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = runtime.aiJobs.get(where.id);
        if (!row) throw new Error(`ai_job_not_found:${where.id}`);
        const next = { ...row, ...data };
        runtime.aiJobs.set(where.id, next);
        return next;
      },
    },
  };

  return { prisma };
});

vi.mock('../src/ai/home-ai-service', () => {
  class HomeAiService {
    async generateComparisonSummary(_context: any) {
      if (runtime.homeAiMode === 'throw') {
        throw new Error('provider failed');
      }
      if (runtime.homeAiMode === 'fallback') {
        return {
          output: {
            title: 'fallback comparison summary',
            bodyMarkdown: 'fallback body',
            structuredJson: {
              schema_name: 'comparison_summary',
              schema_version: '1.0',
              confidence: 'low',
              insufficient_context: true,
              payload: {
                key_differences: ['fallback'],
                risk_points: ['limited context'],
                next_actions: ['re-check'],
                compared_symbols: ['sym-1', 'sym-2'],
                reference_ids: [],
                overall_view: 'fallback',
              },
            },
            modelName: 'stub-compare-v1',
            promptVersion: 'v1.0.0-compare-stub',
          },
          log: {
            initialModel: 'gemma4-ns',
            finalModel: 'stub-compare-v1',
            escalated: false,
            escalationReason: 'provider_failed_fallback_to_stub',
            retryCount: 0,
            durationMs: 20,
            estimatedTokens: 120,
            estimatedCostUsd: 0,
            provider: 'local_llm',
            fallbackToStub: true,
          },
        };
      }

      return {
        output: {
          title: 'comparison summary',
          bodyMarkdown: 'A is stronger than B in recent momentum.',
          structuredJson: {
            schema_name: 'comparison_summary',
            schema_version: '1.0',
            confidence: 'medium',
            insufficient_context: false,
            payload: {
              key_differences: ['Momentum gap'],
              risk_points: ['Volatility'],
              next_actions: ['Track next earnings'],
              compared_symbols: ['sym-1', 'sym-2'],
              reference_ids: ['ref-1'],
              overall_view: 'Balanced with slight edge to A',
            },
          },
          modelName: 'gemma4-ns',
          promptVersion: 'v1.0.0-compare-local',
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
  }

  return { HomeAiService };
});

vi.mock('../src/market/snapshot', () => {
  return {
    getCurrentSnapshotForSymbol: async () => ({
      last_price: 3210.5,
      change: 12.3,
      change_percent: 0.38,
      volume: 1234567,
      as_of: '2026-03-21T06:00:00.000Z',
      market_status: 'closed',
      source_name: 'test_stub',
    }),
    getCurrentSnapshotsForSymbols: async (symbols: Array<{ id: string }>) => {
      const entries = symbols.map((symbol) => [
        symbol.id,
        {
          last_price: symbol.id === 'sym-1' ? 3210.5 : 18950.1,
          change: symbol.id === 'sym-1' ? 12.3 : -55.2,
          change_percent: symbol.id === 'sym-1' ? 0.38 : -0.29,
          volume: symbol.id === 'sym-1' ? 1234567 : 987654,
          as_of: '2026-03-21T06:00:00.000Z',
          market_status: 'closed',
          source_name: 'test_stub',
        },
      ] as const);
      return new Map(entries);
    },
  };
});

import { errorHandler } from '../src/utils/response';
import { comparisonRoutes } from '../src/routes/comparisons';

async function createApp() {
  const app = Fastify({ logger: false });
  app.setErrorHandler(errorHandler);
  app.register(comparisonRoutes, { prefix: '/api/comparisons' });
  await app.ready();
  return app;
}

function seedBaseData() {
  runtime.symbols.set('sym-1', {
    id: 'sym-1',
    symbol: '7203',
    symbolCode: '7203',
    displayName: 'Toyota',
    marketCode: 'TSE',
    tradingviewSymbol: 'TSE:7203',
  });
  runtime.symbols.set('sym-2', {
    id: 'sym-2',
    symbol: '6758',
    symbolCode: '6758',
    displayName: 'Sony',
    marketCode: 'TSE',
    tradingviewSymbol: 'TSE:6758',
  });

  runtime.alertEvents.set('alert-1', {
    id: 'alert-1',
    symbolId: 'sym-1',
    alertName: 'Price breakout',
    alertType: 'price',
    timeframe: '1D',
    triggeredAt: new Date('2026-03-21T09:00:00+09:00'),
    receivedAt: new Date('2026-03-21T09:01:00+09:00'),
    processingStatus: 'completed',
  });
  runtime.alertEvents.set('alert-2', {
    id: 'alert-2',
    symbolId: 'sym-2',
    alertName: 'Volatility up',
    alertType: 'volatility',
    timeframe: '4H',
    triggeredAt: new Date('2026-03-21T08:30:00+09:00'),
    receivedAt: new Date('2026-03-21T08:31:00+09:00'),
    processingStatus: 'completed',
  });

  runtime.aiSummaries.set('sum-sym-1', {
    id: 'sum-sym-1',
    summaryScope: 'thesis',
    targetEntityType: 'symbol',
    targetEntityId: 'sym-1',
    title: 'Toyota thesis',
    bodyMarkdown: 'Summary A',
    structuredJson: { payload: { bullish_points: ['a'] } },
    generatedAt: new Date('2026-03-21T10:00:00+09:00'),
  });
  runtime.aiSummaries.set('sum-sym-2', {
    id: 'sum-sym-2',
    summaryScope: 'thesis',
    targetEntityType: 'symbol',
    targetEntityId: 'sym-2',
    title: 'Sony thesis',
    bodyMarkdown: 'Summary B',
    structuredJson: { payload: { bullish_points: ['b'] } },
    generatedAt: new Date('2026-03-21T10:00:00+09:00'),
  });

  runtime.researchNotes.set('note-1', {
    id: 'note-1',
    symbolId: 'sym-1',
    title: 'Toyota memo',
    status: 'active',
    updatedAt: new Date('2026-03-21T10:10:00+09:00'),
  });

  runtime.externalReferences.set('ref-1', {
    id: 'ref-1',
    symbolId: 'sym-1',
    referenceType: 'disclosure',
    title: 'Disclosure A',
    sourceName: 'tdnet',
    sourceUrl: 'https://example.com/disclosure-a',
    publishedAt: new Date('2026-03-21T08:00:00+09:00'),
    summaryText: 'Disclosure summary',
    createdAt: new Date('2026-03-21T08:01:00+09:00'),
  });
  runtime.externalReferences.set('ref-2', {
    id: 'ref-2',
    symbolId: 'sym-2',
    referenceType: 'news',
    title: 'News B',
    sourceName: 'rss',
    sourceUrl: 'https://example.com/news-b',
    publishedAt: new Date('2026-03-21T07:30:00+09:00'),
    summaryText: 'News summary',
    createdAt: new Date('2026-03-21T07:31:00+09:00'),
  });
}

async function createComparison(app: Awaited<ReturnType<typeof createApp>>, symbolIds: string[]) {
  const createResponse = await app.inject({
    method: 'POST',
    url: '/api/comparisons',
    payload: {
      name: 'Comparison test',
      symbol_ids: symbolIds,
    },
    headers: { 'content-type': 'application/json' },
  });
  expect(createResponse.statusCode).toBe(201);
  return createResponse.json().data.comparison_session.id as string;
}

describe('comparison generate e2e-ish: create -> generate -> detail', () => {
  beforeEach(() => {
    runtime = createRuntime();
    seedBaseData();
  });

  it('generates comparison summary and stores ai_jobs/ai_summaries', async () => {
    const app = await createApp();
    const comparisonId = await createComparison(app, ['sym-1', 'sym-2']);

    const response = await app.inject({
      method: 'POST',
      url: `/api/comparisons/${comparisonId}/generate`,
      payload: {
        include_ai_summary: true,
      },
      headers: { 'content-type': 'application/json' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.error).toBeNull();
    expect(body.data.comparison_result_id).toBeTruthy();
    expect(body.data.ai_summary.title).toContain('comparison summary');

    expect(runtime.comparisonResults.size).toBe(1);
    expect(runtime.aiJobs.size).toBe(1);
    expect(runtime.aiSummaries.size).toBeGreaterThan(2);
    const aiJob = [...runtime.aiJobs.values()][0];
    expect(aiJob.status).toBe('succeeded');
    expect(aiJob.modelName).toBe('gemma4-ns');

    await app.close();
  });

  it('returns latest_result with ai_summary from ai_summaries on GET', async () => {
    const app = await createApp();
    const comparisonId = await createComparison(app, ['sym-1', 'sym-2']);

    await app.inject({
      method: 'POST',
      url: `/api/comparisons/${comparisonId}/generate`,
      payload: { include_ai_summary: true },
      headers: { 'content-type': 'application/json' },
    });

    const detail = await app.inject({
      method: 'GET',
      url: `/api/comparisons/${comparisonId}`,
    });

    expect(detail.statusCode).toBe(200);
    const detailBody = detail.json();
    expect(detailBody.data.latest_result).toBeTruthy();
    expect(detailBody.data.latest_result.ai_summary.title).toContain('comparison summary');
    expect(detailBody.data.latest_result.ai_summary_id).toBeTruthy();
    expect(detailBody.data.latest_result.compared_metric_json.schema_name).toBe('comparison_metric_snapshot');

    await app.close();
  });

  it('keeps ai_summary retrievable after deduplicated regenerate', async () => {
    const app = await createApp();
    const comparisonId = await createComparison(app, ['sym-1', 'sym-2']);

    const first = await app.inject({
      method: 'POST',
      url: `/api/comparisons/${comparisonId}/generate`,
      payload: { include_ai_summary: true },
      headers: { 'content-type': 'application/json' },
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: 'POST',
      url: `/api/comparisons/${comparisonId}/generate`,
      payload: { include_ai_summary: true },
      headers: { 'content-type': 'application/json' },
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().data.ai_summary_id).toBeTruthy();

    const detail = await app.inject({
      method: 'GET',
      url: `/api/comparisons/${comparisonId}`,
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().data.latest_result.ai_summary).toBeTruthy();
    expect(detail.json().data.latest_result.ai_summary.summary_id).toBe(second.json().data.ai_summary_id);

    await app.close();
  });

  it('creates a new ai_summary when force_regenerate is true', async () => {
    const app = await createApp();
    const comparisonId = await createComparison(app, ['sym-1', 'sym-2']);

    const first = await app.inject({
      method: 'POST',
      url: `/api/comparisons/${comparisonId}/generate`,
      payload: { include_ai_summary: true },
      headers: { 'content-type': 'application/json' },
    });
    expect(first.statusCode).toBe(200);
    const firstSummaryId = first.json().data.ai_summary_id as string;
    expect(firstSummaryId).toBeTruthy();

    const second = await app.inject({
      method: 'POST',
      url: `/api/comparisons/${comparisonId}/generate`,
      payload: { include_ai_summary: true, force_regenerate: true },
      headers: { 'content-type': 'application/json' },
    });
    expect(second.statusCode).toBe(200);
    const secondSummaryId = second.json().data.ai_summary_id as string;
    expect(secondSummaryId).toBeTruthy();
    expect(secondSummaryId).not.toBe(firstSummaryId);

    await app.close();
  });

  it('falls back to legacy comparison_result summary fields on GET', async () => {
    const app = await createApp();
    const comparisonId = await createComparison(app, ['sym-1', 'sym-2']);
    runtime.comparisonResults.set('cmp-legacy-1', {
      id: 'cmp-legacy-1',
      comparisonSessionId: comparisonId,
      aiJobId: null,
      title: 'legacy summary title',
      bodyMarkdown: 'legacy summary body',
      structuredJson: { schema_name: 'comparison_summary' },
      modelName: 'legacy-model',
      promptVersion: 'legacy-prompt',
      comparedMetricJson: { schema_name: 'comparison_metric_snapshot', symbol_metrics: [] },
      generatedAt: new Date('2026-04-25T05:00:00.000Z'),
    });

    const detail = await app.inject({
      method: 'GET',
      url: `/api/comparisons/${comparisonId}`,
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().data.latest_result.ai_summary).toMatchObject({
      title: 'legacy summary title',
      body_markdown: 'legacy summary body',
      model_name: 'legacy-model',
      prompt_version: 'legacy-prompt',
    });

    await app.close();
  });

  it('sets ai_jobs to failed when provider returns error', async () => {
    runtime.homeAiMode = 'throw';
    const app = await createApp();
    const comparisonId = await createComparison(app, ['sym-1', 'sym-2']);

    const response = await app.inject({
      method: 'POST',
      url: `/api/comparisons/${comparisonId}/generate`,
      payload: { include_ai_summary: true },
      headers: { 'content-type': 'application/json' },
    });

    expect(response.statusCode).toBe(500);
    expect(runtime.aiJobs.size).toBe(1);
    const aiJob = [...runtime.aiJobs.values()][0];
    expect(aiJob.status).toBe('failed');
    expect(aiJob.errorMessage).toContain('provider failed');

    await app.close();
  });

  it('persists summary with fallback metadata when provider falls back', async () => {
    runtime.homeAiMode = 'fallback';
    const app = await createApp();
    const comparisonId = await createComparison(app, ['sym-1', 'sym-2']);

    const response = await app.inject({
      method: 'POST',
      url: `/api/comparisons/${comparisonId}/generate`,
      payload: { include_ai_summary: true },
      headers: { 'content-type': 'application/json' },
    });

    expect(response.statusCode).toBe(200);
    const createdSummary = [...runtime.aiSummaries.values()]
      .filter((summary) => summary.targetEntityType === 'comparison_session')
      .sort((a, b) => descTime(b.generatedAt) - descTime(a.generatedAt))[0];
    expect(createdSummary).toBeTruthy();
    expect(createdSummary.generationContextJson?.fallback_to_stub).toBe(true);

    await app.close();
  });

  it('normalizes insufficient_context to true when comparison references are empty', async () => {
    runtime.externalReferences.clear();
    const app = await createApp();
    const comparisonId = await createComparison(app, ['sym-1', 'sym-2']);

    const response = await app.inject({
      method: 'POST',
      url: `/api/comparisons/${comparisonId}/generate`,
      payload: { include_ai_summary: true },
      headers: { 'content-type': 'application/json' },
    });

    expect(response.statusCode).toBe(200);
    const createdSummary = [...runtime.aiSummaries.values()]
      .filter((summary) => summary.targetEntityType === 'comparison_session')
      .sort((a, b) => descTime(b.generatedAt) - descTime(a.generatedAt))[0];
    expect(createdSummary.generationContextJson?.reference_count).toBe(0);
    expect(createdSummary.structuredJson?.insufficient_context).toBe(true);
    expect(response.json().data.ai_summary.structured_json.insufficient_context).toBe(true);

    await app.close();
  });

  it('normalizes existing comparison summary view when stored reference_count is zero', async () => {
    const app = await createApp();
    const comparisonId = await createComparison(app, ['sym-1', 'sym-2']);
    runtime.aiSummaries.set('sum-cmp-existing-zero-ref', {
      id: 'sum-cmp-existing-zero-ref',
      aiJobId: 'ai-job-existing-zero-ref',
      summaryScope: 'comparison',
      targetEntityType: 'comparison_session',
      targetEntityId: comparisonId,
      title: 'Comparison Summary',
      bodyMarkdown: 'A is stronger',
      structuredJson: {
        schema_name: 'comparison_summary',
        schema_version: '1.0',
        confidence: 'medium',
        insufficient_context: false,
        payload: {},
      },
      generationContextJson: {
        reference_count: 0,
      },
      generatedAt: new Date('2026-04-25T05:00:00.000Z'),
    });
    runtime.aiJobs.set('ai-job-existing-zero-ref', {
      id: 'ai-job-existing-zero-ref',
      status: 'succeeded',
      jobType: 'generate_comparison_summary',
      targetEntityType: 'comparison_session',
      targetEntityId: comparisonId,
      requestPayload: null,
      responsePayload: { summary_id: 'sum-cmp-existing-zero-ref' },
      startedAt: new Date('2026-04-25T05:00:00.000Z'),
      completedAt: new Date('2026-04-25T05:00:00.000Z'),
      modelName: 'gemma4-ns',
      promptVersion: 'v1.0.0-compare-local',
      initialModel: null,
      finalModel: null,
      escalated: false,
      escalationReason: null,
      retryCount: 0,
      durationMs: null,
      estimatedTokens: null,
      estimatedCostUsd: null,
      errorMessage: null,
    });
    runtime.comparisonResults.set('cmp-with-ai-summary', {
      id: 'cmp-with-ai-summary',
      comparisonSessionId: comparisonId,
      aiJobId: 'ai-job-existing-zero-ref',
      title: null,
      bodyMarkdown: null,
      structuredJson: null,
      modelName: null,
      promptVersion: null,
      comparedMetricJson: { schema_name: 'comparison_metric_snapshot', symbol_metrics: [] },
      generatedAt: new Date('2026-04-25T05:01:00.000Z'),
    });

    const detail = await app.inject({
      method: 'GET',
      url: `/api/comparisons/${comparisonId}`,
    });

    expect(detail.statusCode).toBe(200);
    expect(detail.json().data.latest_result.ai_summary.structured_json.insufficient_context).toBe(true);

    await app.close();
  });

  it('returns validation error when symbol count is insufficient', async () => {
    const app = await createApp();
    runtime.comparisonSessions.set('cmp-single', {
      id: 'cmp-single',
      name: 'single',
      comparisonType: 'symbol',
      status: 'ready',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    runtime.comparisonSessionSymbols.set('cmp-single', [{ symbolId: 'sym-1', sortOrder: 0 }]);

    const response = await app.inject({
      method: 'POST',
      url: '/api/comparisons/cmp-single/generate',
      payload: { include_ai_summary: true },
      headers: { 'content-type': 'application/json' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');

    await app.close();
  });

  it('returns 404 when comparisonId is missing', async () => {
    const app = await createApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/comparisons/not-found/generate',
      payload: { include_ai_summary: true },
      headers: { 'content-type': 'application/json' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('NOT_FOUND');

    await app.close();
  });
});
