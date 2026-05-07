import { beforeEach, describe, expect, it } from 'vitest';
import { createQueueJobHandlers } from '../src/queue/handlers';
import type { CollectedReference } from '../src/references/collector';

type SymbolRecord = {
  id: string;
  symbolCode: string | null;
  displayName: string | null;
  tradingviewSymbol: string | null;
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
  const dedupeKeyToReferenceId = new Map<string, string>();

  let refSeq = 1;

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
        return {
          ...event,
          symbol: include?.symbol && event.symbolId ? symbols.get(event.symbolId) ?? null : null,
        };
      },
      update: async ({ where, data }: any) => {
        const record = alertEvents.get(where.id);
        if (!record) throw new Error(`alert_event_not_found:${where.id}`);
        const next = { ...record, ...data };
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
      findFirst: async () => null,
      create: async () => {
        throw new Error('aiSummary.create should not be called in collect-only test');
      },
    },
  };

  return { symbols, alertEvents, aiJobs, externalReferences, prisma };
}

function makeTdnetReference(params: {
  sourceType: 'disclosure' | 'earnings';
  sourceName: string;
  title: string;
  sourceUrl: string;
  metadataJson: Record<string, unknown>;
  category: string;
}): CollectedReference {
  return {
    sourceType: params.sourceType,
    referenceType: params.sourceType,
    title: params.title,
    sourceName: params.sourceName,
    sourceUrl: params.sourceUrl,
    publishedAt: new Date('2026-05-01T15:30:00+09:00'),
    summaryText: params.title,
    metadataJson: params.metadataJson,
    relevanceScore: 80,
    relevanceHint: 'symbol_and_time_match',
    category: params.category,
    rawPayloadJson: { title: params.title },
  };
}

describe('queue handlers tdnet save-path', () => {
  let state: ReturnType<typeof createState>;
  let queuedJobs: Array<{ name: string; data: any }>;

  beforeEach(() => {
    state = createState();
    queuedJobs = [];

    state.symbols.set('sym-2148', {
      id: 'sym-2148',
      symbolCode: '2148',
      displayName: 'ＩＴＭ',
      tradingviewSymbol: 'TSE:2148',
    });

    state.alertEvents.set('alert-2148', {
      id: 'alert-2148',
      symbolId: 'sym-2148',
      alertName: '決算確認',
      alertType: 'technical',
      timeframe: '1D',
      triggerPrice: 1000,
      triggerPayloadJson: {},
      triggeredAt: new Date('2026-05-01T16:00:00+09:00'),
      processingStatus: 'received',
    });

    state.aiJobs.set('collect-2148', { id: 'collect-2148', status: 'queued' });
  });

  it('persists tdnet disclosure/earnings refs and diagnostics into external_references + ai_jobs', async () => {
    const refs = [
      makeTdnetReference({
        sourceType: 'disclosure',
        sourceName: 'tdnet_disclosure',
        title: '2026年３月期 決算短信〔ＩＦＲＳ〕（連結）',
        sourceUrl: 'https://example.com/disclosure-2148.pdf',
        metadataJson: {
          disclosure_code: '2148',
          query_date: '20260501',
          match_reason: 'code',
          category: 'financial_results',
        },
        category: 'financial_results',
      }),
      makeTdnetReference({
        sourceType: 'earnings',
        sourceName: 'tdnet_earnings',
        title: '2026年３月期 決算短信〔ＩＦＲＳ〕（連結）',
        sourceUrl: 'https://example.com/earnings-2148.pdf',
        metadataJson: {
          disclosure_code: '2148',
          query_date: '20260501',
          match_reason: 'code',
          category: 'earnings_results',
        },
        category: 'earnings_results',
      }),
    ] as CollectedReference[] & { diagnostics?: Record<string, unknown> };
    refs.diagnostics = {
      disclosure: {
        source_type: 'disclosure',
        dates_checked: 1,
        fetched_dates: 1,
        fetch_failed_dates: 0,
        no_file_dates: 0,
        parse_zero_row_dates: 0,
        rows_parsed: 2,
        symbol_matches: 1,
        earnings_candidates: 1,
        returned_count: 1,
        reason: null,
        checked_dates: ['20260501'],
        per_date: [],
      },
      earnings: {
        source_type: 'earnings',
        dates_checked: 1,
        fetched_dates: 1,
        fetch_failed_dates: 0,
        no_file_dates: 0,
        parse_zero_row_dates: 0,
        rows_parsed: 2,
        symbol_matches: 1,
        earnings_candidates: 1,
        returned_count: 1,
        reason: null,
        checked_dates: ['20260501'],
        per_date: [],
      },
    };

    const handlers = createQueueJobHandlers({
      prisma: state.prisma as any,
      referenceCollector: {
        collectForAlert: async () => refs,
      },
      buildAlertSummaryContext: async () => {
        throw new Error('buildAlertSummaryContext should not be called in collect-only test');
      },
      createHomeAiService: () => ({
        generateAlertSummary: async () => {
          throw new Error('generateAlertSummary should not be called in collect-only test');
        },
      }),
      queue: {
        add: async (name, data) => {
          queuedJobs.push({ name, data });
          return null;
        },
      },
    });

    await handlers.handleCollectReferences(
      {
        id: 'collect-job',
        name: 'collect_references_for_alert',
        data: {
          alert_event_id: 'alert-2148',
          ai_job_id: 'collect-2148',
        },
      } as any,
      createNoopLogger(),
    );

    const savedRefs = [...state.externalReferences.values()];
    expect(savedRefs).toHaveLength(2);
    expect(savedRefs.map((ref) => ref.referenceType)).toEqual(['disclosure', 'earnings']);
    expect(savedRefs.map((ref) => ref.sourceName)).toEqual(['tdnet_disclosure', 'tdnet_earnings']);
    expect(savedRefs[0].metadataJson).toMatchObject({
      disclosure_code: '2148',
      query_date: '20260501',
      match_reason: 'code',
      category: 'financial_results',
      source_type: 'disclosure',
    });
    expect(savedRefs[1].metadataJson).toMatchObject({
      disclosure_code: '2148',
      query_date: '20260501',
      match_reason: 'code',
      category: 'earnings_results',
      source_type: 'earnings',
    });

    expect(state.aiJobs.get('collect-2148')?.responsePayload).toMatchObject({
      saved_count: 2,
      skipped_count: 0,
      source_breakdown: {
        disclosure: 1,
        earnings: 1,
      },
      diagnostics: {
        disclosure: {
          symbol_matches: 1,
          returned_count: 1,
          reason: null,
        },
        earnings: {
          symbol_matches: 1,
          returned_count: 1,
          reason: null,
        },
      },
    });
    expect(queuedJobs).toHaveLength(0);
  });
});
