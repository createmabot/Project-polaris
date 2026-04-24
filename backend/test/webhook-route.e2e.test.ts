import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'crypto';

type CollectMode = 'success' | 'all_fail' | 'partial_success';

type RuntimeState = {
  collectMode: CollectMode;
  queueSeq: number;
  aiJobSeq: number;
  refSeq: number;
  summarySeq: number;
  receiptSeq: number;
  queuedJobs: Array<{ name: string; data: any }>;
  redisKeys: Set<string>;
  users: Map<string, { id: string }>;
  webhookTokens: Map<string, { id: string; token: string; isActive: boolean; userId: string; sharedSecretHash: string | null }>;
  symbols: Map<string, { id: string; symbol: string | null; tradingviewSymbol: string | null; marketCode: string | null; symbolCode: string | null; displayName: string | null }>;
  alertEvents: Map<string, any>;
  alertEventByDedupeKey: Map<string, string>;
  aiJobs: Map<string, any>;
  externalReferences: Map<string, any>;
  referenceByDedupeKey: Map<string, string>;
  aiSummaries: Map<string, any>;
  webhookReceipts: Map<string, any>;
};

let runtime: RuntimeState;

function createRuntime(): RuntimeState {
  return {
    collectMode: 'success',
    queueSeq: 1,
    aiJobSeq: 1,
    refSeq: 1,
    summarySeq: 1,
    receiptSeq: 1,
    queuedJobs: [],
    redisKeys: new Set<string>(),
    users: new Map<string, { id: string }>(),
    webhookTokens: new Map(),
    symbols: new Map(),
    alertEvents: new Map(),
    alertEventByDedupeKey: new Map(),
    aiJobs: new Map(),
    externalReferences: new Map(),
    referenceByDedupeKey: new Map(),
    aiSummaries: new Map(),
    webhookReceipts: new Map(),
  };
}

vi.mock('../src/db', () => {
  class FakePrismaKnownError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  }

  const prisma = {
    webhookReceipt: {
      create: async ({ data }: any) => {
        const id = `receipt-${runtime.receiptSeq++}`;
        const row = { id, ...data };
        runtime.webhookReceipts.set(id, row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = runtime.webhookReceipts.get(where.id);
        if (!row) throw new Error(`receipt_not_found:${where.id}`);
        const next = { ...row, ...data };
        runtime.webhookReceipts.set(where.id, next);
        return next;
      },
    },
    webhookToken: {
      findFirst: async ({ where }: any) => {
        const token = runtime.webhookTokens.get(where.token);
        if (!token) return null;
        if (where.isActive !== undefined && token.isActive !== where.isActive) return null;
        return token;
      },
    },
    symbol: {
      findFirst: async ({ where }: any) => {
        const rows = [...runtime.symbols.values()];
        return (
          rows.find((row) => {
            if (where.tradingviewSymbol !== undefined) return row.tradingviewSymbol === where.tradingviewSymbol;
            if (where.marketCode !== undefined && where.symbolCode !== undefined) {
              return row.marketCode === where.marketCode && row.symbolCode === where.symbolCode;
            }
            if (where.symbol !== undefined) return row.symbol === where.symbol;
            if (where.symbolCode !== undefined) return row.symbolCode === where.symbolCode;
            if (where.displayName !== undefined) return row.displayName === where.displayName;
            return false;
          }) ?? null
        );
      },
    },
    alertEvent: {
      create: async ({ data }: any) => {
        if (runtime.alertEventByDedupeKey.has(data.dedupeKey)) {
          throw new FakePrismaKnownError('P2002');
        }
        const id = `alert-${runtime.alertEvents.size + 1}`;
        const row = {
          id,
          userId: data.userId ?? null,
          symbolId: data.symbolId ?? null,
          sourceType: data.sourceType,
          alertType: data.alertType ?? null,
          alertName: data.alertName,
          timeframe: data.timeframe ?? null,
          triggerPrice: data.triggerPrice ?? null,
          triggerPayloadJson: data.triggerPayloadJson,
          dedupeKey: data.dedupeKey,
          eventId: data.eventId ?? null,
          triggeredAt: data.triggeredAt ?? null,
          receivedAt: data.receivedAt ?? new Date(),
          processingStatus: data.processingStatus,
        };
        runtime.alertEvents.set(id, row);
        runtime.alertEventByDedupeKey.set(data.dedupeKey, id);
        return row;
      },
      findUniqueOrThrow: async ({ where, include }: any) => {
        const row = runtime.alertEvents.get(where.id);
        if (!row) throw new Error(`alert_not_found:${where.id}`);

        if (include?.symbol || include?.externalReferences) {
          const symbol = row.symbolId ? runtime.symbols.get(row.symbolId) ?? null : null;
          const refs = [...runtime.externalReferences.values()]
            .filter((ref) => ref.alertEventId === row.id)
            .sort((a, b) => {
              const publishedDiff = (b.publishedAt ? b.publishedAt.getTime() : 0) - (a.publishedAt ? a.publishedAt.getTime() : 0);
              if (publishedDiff !== 0) return publishedDiff;
              return b.createdAt.getTime() - a.createdAt.getTime();
            });

          return {
            ...row,
            symbol,
            externalReferences: refs,
          };
        }

        return row;
      },
      update: async ({ where, data }: any) => {
        const row = runtime.alertEvents.get(where.id);
        if (!row) throw new Error(`alert_not_found:${where.id}`);
        const next = { ...row, ...data };
        runtime.alertEvents.set(where.id, next);
        return next;
      },
    },
    aiJob: {
      create: async ({ data }: any) => {
        const id = `ai-job-${runtime.aiJobSeq++}`;
        const row = {
          id,
          jobType: data.jobType,
          targetEntityType: data.targetEntityType,
          targetEntityId: data.targetEntityId,
          requestPayload: data.requestPayload ?? null,
          responsePayload: null,
          modelName: null,
          promptVersion: null,
          errorMessage: null,
          status: data.status ?? 'queued',
          startedAt: null,
          completedAt: null,
          initialModel: null,
          finalModel: null,
          escalated: false,
          escalationReason: null,
          retryCount: 0,
          durationMs: null,
          estimatedTokens: null,
          estimatedCostUsd: null,
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
    externalReference: {
      create: async ({ data }: any) => {
        if (runtime.referenceByDedupeKey.has(data.dedupeKey)) {
          const error: any = new Error('duplicate');
          error.code = 'P2002';
          throw error;
        }

        const id = `ref-${runtime.refSeq++}`;
        const row = {
          id,
          symbolId: data.symbolId ?? null,
          alertEventId: data.alertEventId ?? null,
          referenceType: data.referenceType,
          title: data.title,
          sourceName: data.sourceName ?? null,
          sourceUrl: data.sourceUrl ?? null,
          publishedAt: data.publishedAt ?? null,
          summaryText: data.summaryText ?? null,
          metadataJson: data.metadataJson ?? null,
          dedupeKey: data.dedupeKey,
          relevanceScore: data.relevanceScore ?? null,
          createdAt: new Date(),
        };

        runtime.externalReferences.set(id, row);
        runtime.referenceByDedupeKey.set(data.dedupeKey, id);
        return row;
      },
      findUnique: async ({ where }: any) => {
        const id = runtime.referenceByDedupeKey.get(where.dedupeKey);
        return id ? runtime.externalReferences.get(id) ?? null : null;
      },
    },
    aiSummary: {
      findFirst: async ({ where }: any) => {
        for (const row of runtime.aiSummaries.values()) {
          if (
            row.targetEntityId === where.targetEntityId &&
            row.targetEntityType === where.targetEntityType &&
            row.inputSnapshotHash === where.inputSnapshotHash
          ) {
            return row;
          }
        }
        return null;
      },
      create: async ({ data }: any) => {
        const id = `summary-${runtime.summarySeq++}`;
        const row = {
          id,
          aiJobId: data.aiJobId ?? null,
          summaryScope: data.summaryScope,
          targetEntityType: data.targetEntityType,
          targetEntityId: data.targetEntityId,
          title: data.title ?? null,
          bodyMarkdown: data.bodyMarkdown,
          structuredJson: data.structuredJson,
          modelName: data.modelName ?? null,
          promptVersion: data.promptVersion ?? null,
          generatedAt: data.generatedAt ?? null,
          inputSnapshotHash: data.inputSnapshotHash ?? null,
          generationContextJson: data.generationContextJson,
        };
        runtime.aiSummaries.set(id, row);
        return row;
      },
    },
  };

  return { prisma };
});

vi.mock('../src/redis', () => {
  const redis = {
    ping: async () => 'PONG',
    set: async (key: string, _value: string, _ex: string, _ttl: number, flag: string) => {
      if (flag === 'NX') {
        if (runtime.redisKeys.has(key)) return null;
        runtime.redisKeys.add(key);
        return 'OK';
      }
      runtime.redisKeys.add(key);
      return 'OK';
    },
    del: async (key: string) => {
      runtime.redisKeys.delete(key);
      return 1;
    },
  };
  return { redis };
});

vi.mock('../src/queue', () => {
  const webhookQueue = {
    add: async (name: string, data: any) => {
      runtime.queuedJobs.push({ name, data });
      return { id: `queue-${runtime.queueSeq++}`, name, data };
    },
  };

  return {
    webhookQueue,
    WEBHOOK_PROCESS_QUEUE: 'webhook_process_queue',
    setupWorker: () => ({ close: async () => {} }),
  };
});

vi.mock('../src/references/collector', () => {
  const buildDedupeKey = (params: {
    symbolId: string | null;
    sourceName: string;
    sourceUrl: string | null;
    referenceType: string;
    title: string;
    publishedAt: Date | null;
  }) => {
    const raw = [
      params.symbolId ?? '',
      params.referenceType,
      params.sourceName,
      params.sourceUrl ?? '',
      params.title,
      params.publishedAt?.toISOString() ?? '',
    ].join('|');

    return crypto.createHash('sha256').update(raw).digest('hex');
  };

  const referenceCollector = {
    collectForAlert: async () => {
      if (runtime.collectMode === 'all_fail') {
        throw new Error('collect_failed_all_adapters:news:timeout,disclosure:503,earnings:503');
      }

      if (runtime.collectMode === 'partial_success') {
        return [
          {
            sourceType: 'news' as const,
            referenceType: 'news' as const,
            title: '部分成功ニュース',
            sourceName: 'stub_news',
            sourceUrl: 'https://example.com/news/partial',
            publishedAt: new Date('2026-03-20T09:00:00+09:00'),
            summaryText: 'partial success',
            metadataJson: { partial: true },
            relevanceScore: 55,
            relevanceHint: 'partial_success',
            category: 'market_news',
            rawPayloadJson: { source: 'stub' },
          },
        ];
      }

      return [
        {
          sourceType: 'disclosure' as const,
          referenceType: 'disclosure' as const,
          title: '適時開示A',
          sourceName: 'stub_disclosure',
          sourceUrl: 'https://example.com/disclosure/a',
          publishedAt: new Date('2026-03-20T08:30:00+09:00'),
          summaryText: 'disclosure',
          metadataJson: {},
          relevanceScore: 80,
          relevanceHint: 'high',
          category: 'financial_results',
          rawPayloadJson: { source: 'stub' },
        },
        {
          sourceType: 'news' as const,
          referenceType: 'news' as const,
          title: 'ニュースA',
          sourceName: 'stub_news',
          sourceUrl: 'https://example.com/news/a',
          publishedAt: new Date('2026-03-20T09:00:00+09:00'),
          summaryText: 'news',
          metadataJson: {},
          relevanceScore: 50,
          relevanceHint: 'medium',
          category: 'market_news',
          rawPayloadJson: { source: 'stub' },
        },
      ];
    },
    collectForSymbol: async () => [],
  };

  return { referenceCollector, buildDedupeKey };
});

vi.mock('../src/ai/home-ai-service', () => {
  class HomeAiService {
    async generateAlertSummary(context: any) {
      const hasRefs = context.referenceIds.length > 0;
      return {
        output: {
          title: `summary:${context.alertName}`,
          bodyMarkdown: 'generated-by-test',
          structuredJson: {
            schema_name: 'alert_reason_summary',
            schema_version: '1.0',
            confidence: hasRefs ? 'medium' : 'low',
            insufficient_context: !hasRefs,
            payload: {
              what_happened: 'test',
              fact_points: ['f1'],
              reason_hypotheses: [
                {
                  text: 'h1',
                  confidence: 'low',
                  reference_ids: context.referenceIds.slice(0, 1),
                },
              ],
              watch_points: ['w1'],
              next_actions: ['n1'],
              reference_ids: context.referenceIds,
            },
          },
          modelName: 'mock-v1',
          promptVersion: 'test-v1',
        },
        log: {
          initialModel: 'mock-v1',
          finalModel: 'mock-v1',
          escalated: false,
          escalationReason: null,
          retryCount: 0,
          durationMs: 10,
          estimatedTokens: 100,
          estimatedCostUsd: 0,
          provider: 'stub',
          fallbackToStub: false,
        },
      };
    }
  }

  return { HomeAiService };
});

vi.mock('@prisma/client', () => {
  class FakePrismaKnownError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  }

  return {
    Prisma: {
      PrismaClientKnownRequestError: FakePrismaKnownError,
    },
  };
});

import { errorHandler } from '../src/utils/response';
import { webhookRoutes } from '../src/routes/webhooks';
import { createQueueJobHandlers } from '../src/queue/handlers';

function createNoopLogger() {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
  };
}

async function createApp() {
  const app = Fastify({ logger: false });
  app.setErrorHandler(errorHandler);
  app.addContentTypeParser('text/plain', { parseAs: 'string' }, (_req, body, done) => {
    done(null, body);
  });
  app.register(webhookRoutes, { prefix: '/api/integrations' });
  await app.ready();
  return app;
}

async function drainWebhookQueue() {
  const handlers = createQueueJobHandlers({
    queue: {
      add: async (name: string, data: any) => {
        runtime.queuedJobs.push({ name, data });
        return { id: `queue-${runtime.queueSeq++}` };
      },
    } as any,
  });

  while (runtime.queuedJobs.length > 0) {
    const job = runtime.queuedJobs.shift();
    if (!job) break;

    if (job.name === 'collect_references_for_alert') {
      await handlers.handleCollectReferences(
        {
          id: `job-${runtime.queueSeq++}`,
          name: job.name,
          data: job.data,
        } as any,
        createNoopLogger(),
      );
      continue;
    }

    if (job.name === 'process_alert_event') {
      await handlers.handleGenerateAlertSummary(
        {
          id: `job-${runtime.queueSeq++}`,
          name: job.name,
          data: job.data,
        } as any,
        createNoopLogger(),
      );
    }
  }
}

function seedBaseData() {
  runtime.users.set('user-1', { id: 'user-1' });
  runtime.webhookTokens.set('valid-token', {
    id: 'token-1',
    token: 'valid-token',
    isActive: true,
    userId: 'user-1',
    sharedSecretHash: null,
  });
  runtime.symbols.set('sym-1', {
    id: 'sym-1',
    symbol: '7203',
    tradingviewSymbol: 'TSE:7203',
    marketCode: 'TSE',
    symbolCode: '7203',
    displayName: 'トヨタ自動車',
  });
}

function validWebhookPayload() {
  return {
    alert_name: '価格急騰',
    alert_type: 'price',
    tradingview_symbol: 'TSE:7203',
    timeframe: '1D',
    triggered_at: '2026-03-20T01:00:00.000Z',
    trigger_price: 3000,
  };
}

describe('webhook e2e-ish: Fastify webhook -> queue chain -> ai_summary', () => {
  beforeEach(() => {
    runtime = createRuntime();
    seedBaseData();
  });

  it('正常系: webhook受信からai_summary保存まで到達し reference_ids が入る', async () => {
    const app = await createApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/integrations/tradingview/webhook?token=valid-token',
      payload: validWebhookPayload(),
      headers: { 'content-type': 'application/json' },
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.data.accepted).toBe(true);
    expect(body.data.status).toBe('received');

    expect(runtime.alertEvents.size).toBe(1);
    expect(runtime.aiJobs.size).toBe(2);
    expect(runtime.queuedJobs.length).toBe(1);

    await drainWebhookQueue();

    expect(runtime.externalReferences.size).toBe(2);
    expect(runtime.aiSummaries.size).toBe(1);

    const summary = [...runtime.aiSummaries.values()][0];
    expect(summary.structuredJson.payload.reference_ids.length).toBeGreaterThan(0);
    expect(summary.structuredJson.insufficient_context).toBe(false);

    const statuses = [...runtime.aiJobs.values()].map((job) => job.status);
    expect(statuses).toEqual(['succeeded', 'succeeded']);

    await app.close();
  });

  it('unresolved_symbol: 受理されるが ai_job は起票されない', async () => {
    const app = await createApp();

    const payload = {
      ...validWebhookPayload(),
      tradingview_symbol: 'TSE:9999',
      symbol: '9999',
    };

    const response = await app.inject({
      method: 'POST',
      url: '/api/integrations/tradingview/webhook?token=valid-token',
      payload,
      headers: { 'content-type': 'application/json' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.status).toBe('unresolved_symbol');

    expect(runtime.alertEvents.size).toBe(1);
    const alert = [...runtime.alertEvents.values()][0];
    expect(alert.processingStatus).toBe('unresolved_symbol');
    expect(runtime.aiJobs.size).toBe(0);
    expect(runtime.queuedJobs.length).toBe(0);

    await app.close();
  });

  it('needs_review: 純textは受理されるが ai_job は起票されない', async () => {
    const app = await createApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/integrations/tradingview/webhook?token=valid-token',
      payload: 'this is not json',
      headers: { 'content-type': 'text/plain' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.status).toBe('needs_review');

    expect(runtime.alertEvents.size).toBe(1);
    const alert = [...runtime.alertEvents.values()][0];
    expect(alert.processingStatus).toBe('needs_review');
    expect(runtime.aiJobs.size).toBe(0);
    expect(runtime.queuedJobs.length).toBe(0);

    await app.close();
  });

  it('collect全失敗: collect failed でも summary は進み insufficient_context=true で保存', async () => {
    runtime.collectMode = 'all_fail';
    const app = await createApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/integrations/tradingview/webhook?token=valid-token',
      payload: validWebhookPayload(),
      headers: { 'content-type': 'application/json' },
    });

    expect(response.statusCode).toBe(200);
    expect(runtime.aiJobs.size).toBe(2);

    await drainWebhookQueue();

    const collectJob = [...runtime.aiJobs.values()].find((job) => job.jobType === 'collect_references_for_alert');
    const summaryJob = [...runtime.aiJobs.values()].find((job) => job.jobType === 'generate_alert_summary');

    expect(collectJob?.status).toBe('failed');
    expect(summaryJob?.status).toBe('succeeded');

    expect(runtime.aiSummaries.size).toBe(1);
    const summary = [...runtime.aiSummaries.values()][0];
    expect(summary.structuredJson.insufficient_context).toBe(true);
    expect(summary.structuredJson.payload.reference_ids).toEqual([]);

    const queued = [...runtime.aiJobs.values()].filter((job) => job.status === 'queued');
    expect(queued).toHaveLength(0);

    await app.close();
  });

  it('duplicate webhook: 重複alert_event/ai_job起票を防ぎ duplicate_ignored を返す', async () => {
    const app = await createApp();
    const payload = validWebhookPayload();

    const response1 = await app.inject({
      method: 'POST',
      url: '/api/integrations/tradingview/webhook?token=valid-token',
      payload,
      headers: { 'content-type': 'application/json' },
    });
    expect(response1.statusCode).toBe(200);

    const alertCountAfterFirst = runtime.alertEvents.size;
    const aiJobCountAfterFirst = runtime.aiJobs.size;

    const response2 = await app.inject({
      method: 'POST',
      url: '/api/integrations/tradingview/webhook?token=valid-token',
      payload,
      headers: { 'content-type': 'application/json' },
    });

    expect(response2.statusCode).toBe(200);
    const body2 = response2.json();
    expect(body2.data.status).toBe('duplicate_ignored');

    expect(runtime.alertEvents.size).toBe(alertCountAfterFirst);
    expect(runtime.aiJobs.size).toBe(aiJobCountAfterFirst);

    await app.close();
  });

  it('partial failure相当: 一部referenceのみでもsummary成功し insufficient_context=false', async () => {
    runtime.collectMode = 'partial_success';
    const app = await createApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/integrations/tradingview/webhook?token=valid-token',
      payload: validWebhookPayload(),
      headers: { 'content-type': 'application/json' },
    });

    expect(response.statusCode).toBe(200);

    await drainWebhookQueue();

    expect(runtime.externalReferences.size).toBe(1);
    expect(runtime.aiSummaries.size).toBe(1);
    const summary = [...runtime.aiSummaries.values()][0];
    expect(summary.structuredJson.insufficient_context).toBe(false);
    expect(summary.structuredJson.payload.reference_ids.length).toBe(1);

    await app.close();
  });
});
