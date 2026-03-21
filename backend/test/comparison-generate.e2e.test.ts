import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type RuntimeState = {
  symbolSeq: number;
  sessionSeq: number;
  resultSeq: number;
  jobSeq: number;
  symbols: Map<string, any>;
  alertEvents: Map<string, any>;
  aiSummaries: Map<string, any>;
  researchNotes: Map<string, any>;
  externalReferences: Map<string, any>;
  comparisonSessions: Map<string, any>;
  comparisonSessionSymbols: Map<string, Array<{ symbolId: string; sortOrder: number }>>;
  comparisonResults: Map<string, any>;
  aiJobs: Map<string, any>;
};

let runtime: RuntimeState;

function createRuntime(): RuntimeState {
  return {
    symbolSeq: 1,
    sessionSeq: 1,
    resultSeq: 1,
    jobSeq: 1,
    symbols: new Map(),
    alertEvents: new Map(),
    aiSummaries: new Map(),
    researchNotes: new Map(),
    externalReferences: new Map(),
    comparisonSessions: new Map(),
    comparisonSessionSymbols: new Map(),
    comparisonResults: new Map(),
    aiJobs: new Map(),
  };
}

function descTime(value: Date | null | undefined): number {
  return value instanceof Date ? value.getTime() : 0;
}

vi.mock('../src/db', () => {
  const prisma = {
    symbol: {
      findMany: async ({ where }: any) => {
        const ids: string[] = where?.id?.in ?? [];
        return [...runtime.symbols.values()].filter((symbol) => ids.includes(symbol.id));
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
          .sort((a, b) => b.generatedAt.getTime() - a.generatedAt.getTime());
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
      create: async ({ data }: any) => {
        const id = `ai-job-${runtime.jobSeq++}`;
        const row = {
          id,
          status: data.status ?? 'queued',
          jobType: data.jobType,
          targetEntityType: data.targetEntityType,
          targetEntityId: data.targetEntityId,
          requestPayload: data.requestPayload ?? null,
          startedAt: data.startedAt ?? null,
          completedAt: null,
          modelName: null,
          promptVersion: null,
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

vi.mock('../src/ai/router', () => {
  class AiRouter {
    async generateAlertSummary(_context: any) {
      return {
        output: {
          title: '比較総評',
          bodyMarkdown: '銘柄Aは短期強め、銘柄Bは安定推移。',
          structuredJson: {
            schema_name: 'alert_reason_summary',
            schema_version: '1.0',
            confidence: 'medium',
            insufficient_context: false,
            payload: {
              what_happened: '比較結果の要約',
              fact_points: ['論点1', '論点2'],
              watch_points: ['注意点1'],
              next_actions: ['次の確認1'],
            },
          },
          modelName: 'qwen3-test',
          promptVersion: 'compare-v1',
        },
        log: {
          initialModel: 'qwen3-test',
          finalModel: 'qwen3-test',
          escalated: false,
          escalationReason: null,
          retryCount: 0,
          durationMs: 25,
          estimatedTokens: 120,
          estimatedCostUsd: 0,
        },
      };
    }
  }

  return { AiRouter };
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
    displayName: 'トヨタ自動車',
    marketCode: 'TSE',
    tradingviewSymbol: 'TSE:7203',
  });
  runtime.symbols.set('sym-2', {
    id: 'sym-2',
    symbol: '6758',
    symbolCode: '6758',
    displayName: 'ソニーグループ',
    marketCode: 'TSE',
    tradingviewSymbol: 'TSE:6758',
  });

  runtime.alertEvents.set('alert-1', {
    id: 'alert-1',
    symbolId: 'sym-1',
    alertName: '価格急騰',
    alertType: 'price',
    timeframe: '1D',
    triggeredAt: new Date('2026-03-21T09:00:00+09:00'),
    receivedAt: new Date('2026-03-21T09:01:00+09:00'),
    processingStatus: 'completed',
  });
  runtime.alertEvents.set('alert-2', {
    id: 'alert-2',
    symbolId: 'sym-2',
    alertName: 'ボラティリティ上昇',
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
    title: 'トヨタ論点',
    bodyMarkdown: '論点A',
    structuredJson: { payload: { bullish_points: ['a'] } },
    generatedAt: new Date('2026-03-21T10:00:00+09:00'),
  });
  runtime.aiSummaries.set('sum-sym-2', {
    id: 'sum-sym-2',
    summaryScope: 'thesis',
    targetEntityType: 'symbol',
    targetEntityId: 'sym-2',
    title: 'ソニー論点',
    bodyMarkdown: '論点B',
    structuredJson: { payload: { bullish_points: ['b'] } },
    generatedAt: new Date('2026-03-21T10:00:00+09:00'),
  });

  runtime.researchNotes.set('note-1', {
    id: 'note-1',
    symbolId: 'sym-1',
    title: 'トヨタメモ',
    status: 'active',
    updatedAt: new Date('2026-03-21T10:10:00+09:00'),
  });

  runtime.externalReferences.set('ref-1', {
    id: 'ref-1',
    symbolId: 'sym-1',
    referenceType: 'disclosure',
    title: '開示A',
    sourceName: 'tdnet',
    sourceUrl: 'https://example.com/disclosure-a',
    publishedAt: new Date('2026-03-21T08:00:00+09:00'),
    summaryText: '開示サマリ',
    createdAt: new Date('2026-03-21T08:01:00+09:00'),
  });
  runtime.externalReferences.set('ref-2', {
    id: 'ref-2',
    symbolId: 'sym-2',
    referenceType: 'news',
    title: 'ニュースB',
    sourceName: 'rss',
    sourceUrl: 'https://example.com/news-b',
    publishedAt: new Date('2026-03-21T07:30:00+09:00'),
    summaryText: 'ニュースサマリ',
    createdAt: new Date('2026-03-21T07:31:00+09:00'),
  });
}

async function createComparison(app: Awaited<ReturnType<typeof createApp>>, symbolIds: string[]) {
  const createResponse = await app.inject({
    method: 'POST',
    url: '/api/comparisons',
    payload: {
      name: '比較テスト',
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

  it('case1: comparison作成済み -> generate成功 -> comparison_results保存', async () => {
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
    expect(body.data.ai_summary.title).toContain('比較総評');

    expect(runtime.comparisonResults.size).toBe(1);
    expect(runtime.aiJobs.size).toBe(1);
    const aiJob = [...runtime.aiJobs.values()][0];
    expect(aiJob.status).toBe('succeeded');
    expect(aiJob.modelName).toBe('qwen3-test');

    await app.close();
  });

  it('case2: latest_result が GET /api/comparisons/:comparisonId に反映される', async () => {
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
    expect(detailBody.data.latest_result.ai_summary.title).toContain('比較総評');
    expect(detailBody.data.latest_result.compared_metric_json.schema_name).toBe('comparison_metric_snapshot');
    expect(detailBody.data.symbols[0].current_snapshot).toBeTruthy();
    expect(detailBody.data.symbols[0].current_snapshot.last_price).toBeGreaterThan(0);

    await app.close();
  });

  it('case3: 対象symbol数不足なら validation error', async () => {
    const app = await createApp();
    runtime.comparisonSessions.set('cmp-single', {
      id: 'cmp-single',
      name: '1銘柄比較',
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
    const body = response.json();
    expect(body.data).toBeNull();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.meta.request_id).toBeTruthy();

    await app.close();
  });

  it('case4: comparisonId 不正なら 404', async () => {
    const app = await createApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/comparisons/not-found/generate',
      payload: { include_ai_summary: true },
      headers: { 'content-type': 'application/json' },
    });

    expect(response.statusCode).toBe(404);
    const body = response.json();
    expect(body.data).toBeNull();
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.meta.request_id).toBeTruthy();

    await app.close();
  });

  it('case5: structured_json と comparedMetricJson を保存し、再生成は最新1件更新', async () => {
    const app = await createApp();
    const comparisonId = await createComparison(app, ['sym-1', 'sym-2']);

    const first = await app.inject({
      method: 'POST',
      url: `/api/comparisons/${comparisonId}/generate`,
      payload: { include_ai_summary: true },
      headers: { 'content-type': 'application/json' },
    });
    expect(first.statusCode).toBe(200);
    const firstResultId = first.json().data.comparison_result_id;

    const second = await app.inject({
      method: 'POST',
      url: `/api/comparisons/${comparisonId}/generate`,
      payload: { include_ai_summary: true, metrics: ['recent_alert_count', 'recent_reference_count'] },
      headers: { 'content-type': 'application/json' },
    });
    expect(second.statusCode).toBe(200);
    const secondBody = second.json();
    expect(secondBody.data.comparison_result_id).toBe(firstResultId);

    expect(runtime.comparisonResults.size).toBe(1);
    const saved = [...runtime.comparisonResults.values()][0];
    expect(saved.comparedMetricJson.metrics).toEqual(['recent_alert_count', 'recent_reference_count']);
    expect(saved.structuredJson.schema_name).toBe('comparison_summary');
    expect(saved.structuredJson.payload.reference_ids.length).toBeGreaterThan(0);
    expect(saved.comparedMetricJson.symbol_metrics[0].last_price).toBeDefined();
    expect(saved.comparedMetricJson.symbol_metrics[0].change_percent).toBeDefined();
    expect(saved.modelName).toBe('qwen3-test');
    expect(saved.promptVersion).toBe('compare-v1');

    await app.close();
  });
});
