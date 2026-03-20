import { beforeEach, describe, expect, it } from 'vitest';
import { createQueueJobHandlers } from '../src/queue/handlers';
import type { CollectedReference } from '../src/references/collector';

type SymbolRecord = {
  id: string;
  symbolCode: string | null;
  displayName: string | null;
  tradingviewSymbol: string | null;
  marketCode: string | null;
};

type AlertEventRecord = {
  id: string;
  symbolId: string | null;
  alertName: string;
  alertType: string | null;
  timeframe: string | null;
  triggerPrice: number | null;
  triggerPayloadJson: Record<string, unknown>;
  triggeredAt: Date | null;
  processingStatus: string;
};

type AiJobRecord = {
  id: string;
  status: string;
  responsePayload?: Record<string, unknown> | null;
  errorMessage?: string | null;
  completedAt?: Date | null;
  startedAt?: Date | null;
  modelName?: string | null;
  promptVersion?: string | null;
  initialModel?: string | null;
  finalModel?: string | null;
  escalated?: boolean;
  escalationReason?: string | null;
  retryCount?: number;
  durationMs?: number | null;
  estimatedTokens?: number | null;
  estimatedCostUsd?: number | null;
};

type ExternalReferenceRecord = {
  id: string;
  symbolId: string | null;
  alertEventId: string | null;
  referenceType: string;
  title: string;
  sourceName: string | null;
  sourceUrl: string | null;
  publishedAt: Date | null;
  summaryText: string | null;
  metadataJson: Record<string, unknown> | null;
  dedupeKey: string;
  relevanceScore: number | null;
  createdAt: Date;
};

type AiSummaryRecord = {
  id: string;
  aiJobId: string | null;
  targetEntityType: string;
  targetEntityId: string;
  structuredJson: any;
  inputSnapshotHash: string | null;
  title: string | null;
  bodyMarkdown: string;
  modelName: string | null;
  promptVersion: string | null;
  generatedAt: Date | null;
  generationContextJson: any;
};

function createNoopLogger() {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
  };
}

function createState() {
  const symbols = new Map<string, SymbolRecord>();
  const alertEvents = new Map<string, AlertEventRecord>();
  const aiJobs = new Map<string, AiJobRecord>();
  const externalReferences = new Map<string, ExternalReferenceRecord>();
  const aiSummaries = new Map<string, AiSummaryRecord>();
  const dedupeKeyToReferenceId = new Map<string, string>();

  let refSeq = 1;
  let summarySeq = 1;

  const prisma = {
    aiJob: {
      update: async ({ where, data }: any) => {
        const record = aiJobs.get(where.id);
        if (!record) throw new Error(`aiJob_not_found:${where.id}`);
        const next = { ...record, ...data };
        aiJobs.set(where.id, next);
        return next;
      },
    },
    alertEvent: {
      findUniqueOrThrow: async ({ where, include }: any) => {
        const event = alertEvents.get(where.id);
        if (!event) throw new Error(`alert_event_not_found:${where.id}`);
        if (include?.symbol) {
          return {
            ...event,
            symbol: event.symbolId ? symbols.get(event.symbolId) ?? null : null,
          };
        }
        return event;
      },
      update: async ({ where, data }: any) => {
        const event = alertEvents.get(where.id);
        if (!event) throw new Error(`alert_event_not_found:${where.id}`);
        const next = { ...event, ...data };
        alertEvents.set(where.id, next);
        return next;
      },
    },
    externalReference: {
      create: async ({ data }: any) => {
        if (dedupeKeyToReferenceId.has(data.dedupeKey)) {
          const error: any = new Error('duplicate');
          error.code = 'P2002';
          throw error;
        }

        const id = `ref-${refSeq++}`;
        const created: ExternalReferenceRecord = {
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

        externalReferences.set(id, created);
        dedupeKeyToReferenceId.set(data.dedupeKey, id);
        return created;
      },
      findUnique: async ({ where }: any) => {
        const id = dedupeKeyToReferenceId.get(where.dedupeKey);
        return id ? externalReferences.get(id) ?? null : null;
      },
    },
    aiSummary: {
      findFirst: async ({ where }: any) => {
        for (const summary of aiSummaries.values()) {
          if (
            summary.targetEntityId === where.targetEntityId &&
            summary.targetEntityType === where.targetEntityType &&
            summary.inputSnapshotHash === where.inputSnapshotHash
          ) {
            return summary;
          }
        }
        return null;
      },
      create: async ({ data }: any) => {
        const id = `summary-${summarySeq++}`;
        const created: AiSummaryRecord = {
          id,
          aiJobId: data.aiJobId ?? null,
          targetEntityType: data.targetEntityType,
          targetEntityId: data.targetEntityId,
          structuredJson: data.structuredJson,
          inputSnapshotHash: data.inputSnapshotHash ?? null,
          title: data.title ?? null,
          bodyMarkdown: data.bodyMarkdown,
          modelName: data.modelName ?? null,
          promptVersion: data.promptVersion ?? null,
          generatedAt: data.generatedAt ?? null,
          generationContextJson: data.generationContextJson,
        };
        aiSummaries.set(id, created);
        return created;
      },
    },
  };

  function buildContext(alertEventId: string) {
    const event = alertEvents.get(alertEventId);
    if (!event) throw new Error(`alert_event_not_found:${alertEventId}`);

    const typePriority: Record<string, number> = {
      disclosure: 3,
      earnings: 2,
      news: 1,
    };

    const refs = [...externalReferences.values()]
      .filter((ref) => ref.alertEventId === alertEventId)
      .sort((a, b) => {
        const typeDiff = (typePriority[b.referenceType] ?? 0) - (typePriority[a.referenceType] ?? 0);
        if (typeDiff !== 0) return typeDiff;
        return (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0);
      })
      .slice(0, 10)
      .map((ref) => ({
        id: ref.id,
        referenceType: ref.referenceType,
        sourceType: ref.referenceType,
        title: ref.title,
        sourceName: ref.sourceName,
        sourceUrl: ref.sourceUrl,
        publishedAt: ref.publishedAt,
        publishedAtIso: ref.publishedAt ? ref.publishedAt.toISOString() : null,
        summaryText: ref.summaryText,
        relevanceScore: ref.relevanceScore,
      }));

    const symbol = event.symbolId ? symbols.get(event.symbolId) ?? null : null;

    return {
      alertEventId: event.id,
      alertName: event.alertName,
      alertType: event.alertType,
      timeframe: event.timeframe,
      triggerPrice: event.triggerPrice,
      triggeredAt: event.triggeredAt,
      symbol: symbol
        ? {
            id: symbol.id,
            displayName: symbol.displayName,
            tradingviewSymbol: symbol.tradingviewSymbol,
            marketCode: symbol.marketCode,
          }
        : null,
      rawPayload: event.triggerPayloadJson,
      referenceIds: refs.map((ref) => ref.id),
      references: refs,
    };
  }

  return {
    symbols,
    alertEvents,
    aiJobs,
    externalReferences,
    aiSummaries,
    prisma,
    buildContext,
  };
}

function makeReference(params: {
  sourceType: 'news' | 'disclosure' | 'earnings';
  title: string;
  sourceUrl: string;
  sourceName?: string;
  relevanceScore?: number;
}): CollectedReference {
  return {
    sourceType: params.sourceType,
    referenceType: params.sourceType,
    title: params.title,
    sourceName: params.sourceName ?? `${params.sourceType}_source`,
    sourceUrl: params.sourceUrl,
    publishedAt: new Date('2026-03-20T09:00:00+09:00'),
    summaryText: params.title,
    metadataJson: {},
    relevanceScore: params.relevanceScore ?? 70,
    relevanceHint: null,
    category: null,
    rawPayloadJson: { title: params.title },
  };
}

function createRouterFactory() {
  return () => ({
    generateAlertSummary: async (context: any) => {
      const hasRefs = context.referenceIds.length > 0;
      return {
        output: {
          title: `summary:${context.alertName}`,
          bodyMarkdown: 'generated',
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
          estimatedTokens: 42,
          estimatedCostUsd: 0,
        },
      };
    },
  });
}

describe('queue handlers e2e-ish: collect_references_for_alert -> generate_alert_summary', () => {
  let state: ReturnType<typeof createState>;
  let queuedJobs: Array<{ name: string; data: any }>;

  beforeEach(() => {
    state = createState();
    queuedJobs = [];

    state.symbols.set('sym-1', {
      id: 'sym-1',
      symbolCode: '7203',
      displayName: 'トヨタ自動車',
      tradingviewSymbol: 'TSE:7203',
      marketCode: 'TSE',
    });

    state.alertEvents.set('alert-1', {
      id: 'alert-1',
      symbolId: 'sym-1',
      alertName: '価格急騰',
      alertType: 'price',
      timeframe: '1D',
      triggerPrice: 3000,
      triggerPayloadJson: { x: 1 },
      triggeredAt: new Date('2026-03-20T10:00:00+09:00'),
      processingStatus: 'received',
    });

    state.aiJobs.set('collect-1', { id: 'collect-1', status: 'queued' });
    state.aiJobs.set('summary-1', { id: 'summary-1', status: 'queued' });
  });

  it('case1: collect成功 -> summary成功', async () => {
    const handlers = createQueueJobHandlers({
      prisma: state.prisma as any,
      referenceCollector: {
        collectForAlert: async () => [
          makeReference({ sourceType: 'news', title: 'ニュースA', sourceUrl: 'https://example.com/news-a' }),
          makeReference({ sourceType: 'disclosure', title: '開示A', sourceUrl: 'https://example.com/disclosure-a' }),
        ],
      },
      buildAlertSummaryContext: async (id) => state.buildContext(id),
      createAiRouter: createRouterFactory(),
      queue: {
        add: async (name, data) => {
          queuedJobs.push({ name, data });
          return null;
        },
      },
    });

    await handlers.handleCollectReferences(
      {
        id: 'bull-collect-1',
        name: 'collect_references_for_alert',
        data: {
          alert_event_id: 'alert-1',
          ai_job_id: 'collect-1',
          next_job: { name: 'process_alert_event', alert_event_id: 'alert-1', ai_job_id: 'summary-1' },
        },
      } as any,
      createNoopLogger(),
    );

    expect(state.externalReferences.size).toBe(2);
    expect(state.aiJobs.get('collect-1')?.status).toBe('succeeded');
    expect(queuedJobs).toHaveLength(1);

    await handlers.handleGenerateAlertSummary(
      {
        id: 'bull-summary-1',
        name: 'process_alert_event',
        data: queuedJobs[0].data,
      } as any,
      createNoopLogger(),
    );

    expect(state.aiJobs.get('summary-1')?.status).toBe('succeeded');
    expect(state.aiSummaries.size).toBe(1);
    const summary = [...state.aiSummaries.values()][0];
    expect(summary.structuredJson.insufficient_context).toBe(false);
    expect(summary.structuredJson.payload.reference_ids.length).toBe(2);
  });

  it('case2: 一部adapter失敗相当(一部referenceのみ取得)でもsummary成功', async () => {
    const handlers = createQueueJobHandlers({
      prisma: state.prisma as any,
      referenceCollector: {
        collectForAlert: async () => [makeReference({ sourceType: 'news', title: 'ニュースのみ', sourceUrl: 'https://example.com/news-only' })],
      },
      buildAlertSummaryContext: async (id) => state.buildContext(id),
      createAiRouter: createRouterFactory(),
      queue: {
        add: async (name, data) => {
          queuedJobs.push({ name, data });
          return null;
        },
      },
    });

    await handlers.handleCollectReferences(
      {
        id: 'bull-collect-2',
        name: 'collect_references_for_alert',
        data: {
          alert_event_id: 'alert-1',
          ai_job_id: 'collect-1',
          next_job: { name: 'process_alert_event', alert_event_id: 'alert-1', ai_job_id: 'summary-1' },
        },
      } as any,
      createNoopLogger(),
    );

    await handlers.handleGenerateAlertSummary(
      { id: 'bull-summary-2', name: 'process_alert_event', data: queuedJobs[0].data } as any,
      createNoopLogger(),
    );

    expect(state.externalReferences.size).toBe(1);
    expect(state.aiJobs.get('collect-1')?.status).toBe('succeeded');
    expect(state.aiJobs.get('summary-1')?.status).toBe('succeeded');
    expect([...state.aiSummaries.values()][0].structuredJson.insufficient_context).toBe(false);
  });

  it('case3: 全adapter失敗でもsummaryは進み insufficient_context=true で保存', async () => {
    const handlers = createQueueJobHandlers({
      prisma: state.prisma as any,
      referenceCollector: {
        collectForAlert: async () => {
          throw new Error('collect_failed_all_adapters:news:timeout,disclosure:503,earnings:503');
        },
      },
      buildAlertSummaryContext: async (id) => state.buildContext(id),
      createAiRouter: createRouterFactory(),
      queue: {
        add: async (name, data) => {
          queuedJobs.push({ name, data });
          return null;
        },
      },
    });

    const collectResult = await handlers.handleCollectReferences(
      {
        id: 'bull-collect-3',
        name: 'collect_references_for_alert',
        data: {
          alert_event_id: 'alert-1',
          ai_job_id: 'collect-1',
          next_job: { name: 'process_alert_event', alert_event_id: 'alert-1', ai_job_id: 'summary-1' },
        },
      } as any,
      createNoopLogger(),
    );

    expect(collectResult.status).toBe('collect_failed_summary_proceeding');
    expect(state.aiJobs.get('collect-1')?.status).toBe('failed');
    expect(queuedJobs).toHaveLength(1);

    await handlers.handleGenerateAlertSummary(
      { id: 'bull-summary-3', name: 'process_alert_event', data: queuedJobs[0].data } as any,
      createNoopLogger(),
    );

    expect(state.aiJobs.get('summary-1')?.status).toBe('succeeded');
    const summary = [...state.aiSummaries.values()][0];
    expect(summary.structuredJson.insufficient_context).toBe(true);
    expect(summary.structuredJson.payload.reference_ids).toEqual([]);
  });

  it('case4: reference_idsがai_summaryへ反映される(優先順 disclosure > earnings > news)', async () => {
    const handlers = createQueueJobHandlers({
      prisma: state.prisma as any,
      referenceCollector: {
        collectForAlert: async () => [
          makeReference({ sourceType: 'news', title: 'ニュースA', sourceUrl: 'https://example.com/news-a', relevanceScore: 90 }),
          makeReference({ sourceType: 'earnings', title: '決算A', sourceUrl: 'https://example.com/earnings-a', relevanceScore: 50 }),
          makeReference({ sourceType: 'disclosure', title: '開示A', sourceUrl: 'https://example.com/disclosure-a', relevanceScore: 10 }),
        ],
      },
      buildAlertSummaryContext: async (id) => state.buildContext(id),
      createAiRouter: createRouterFactory(),
      queue: {
        add: async (name, data) => {
          queuedJobs.push({ name, data });
          return null;
        },
      },
    });

    await handlers.handleCollectReferences(
      {
        id: 'bull-collect-4',
        name: 'collect_references_for_alert',
        data: {
          alert_event_id: 'alert-1',
          ai_job_id: 'collect-1',
          next_job: { name: 'process_alert_event', alert_event_id: 'alert-1', ai_job_id: 'summary-1' },
        },
      } as any,
      createNoopLogger(),
    );

    await handlers.handleGenerateAlertSummary(
      { id: 'bull-summary-4', name: 'process_alert_event', data: queuedJobs[0].data } as any,
      createNoopLogger(),
    );

    const summary = [...state.aiSummaries.values()][0];
    const referenceIds = summary.structuredJson.payload.reference_ids as string[];
    expect(referenceIds).toHaveLength(3);

    const referencedTypes = referenceIds.map((id) => state.externalReferences.get(id)?.referenceType);
    expect(referencedTypes).toEqual(['disclosure', 'earnings', 'news']);
  });

  it('追加: duplicate reference は dedupeKey で重複保存されない', async () => {
    const handlers = createQueueJobHandlers({
      prisma: state.prisma as any,
      referenceCollector: {
        collectForAlert: async () => [
          makeReference({ sourceType: 'news', title: '重複ニュース', sourceUrl: 'https://example.com/dup' }),
          makeReference({ sourceType: 'news', title: '重複ニュース(別title)', sourceUrl: 'https://example.com/dup' }),
        ],
      },
      buildAlertSummaryContext: async (id) => state.buildContext(id),
      createAiRouter: createRouterFactory(),
      queue: {
        add: async (name, data) => {
          queuedJobs.push({ name, data });
          return null;
        },
      },
    });

    await handlers.handleCollectReferences(
      {
        id: 'bull-collect-5',
        name: 'collect_references_for_alert',
        data: {
          alert_event_id: 'alert-1',
          ai_job_id: 'collect-1',
          next_job: { name: 'process_alert_event', alert_event_id: 'alert-1', ai_job_id: 'summary-1' },
        },
      } as any,
      createNoopLogger(),
    );

    expect(state.externalReferences.size).toBe(1);

    const collectJob = state.aiJobs.get('collect-1');
    expect(collectJob?.status).toBe('succeeded');
    expect(collectJob?.responsePayload).toMatchObject({ saved_count: 1, skipped_count: 1 });
  });
});
