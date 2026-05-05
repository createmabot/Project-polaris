import { beforeEach, describe, expect, it, vi } from 'vitest';

type AlertEventRow = {
  id: string;
  alertName: string;
  alertType: string | null;
  timeframe: string | null;
  triggerPrice: number | null;
  triggeredAt: Date | null;
  receivedAt: Date;
  createdAt?: Date | null;
  symbolId: string | null;
  symbol: {
    id: string;
    displayName: string | null;
    tradingviewSymbol: string | null;
    marketCode: string | null;
  } | null;
  triggerPayloadJson: Record<string, unknown>;
  externalReferences: Array<any>;
};

let alertEventRow: AlertEventRow;
let symbolFallbackReferences: Array<any>;
let mockedPrisma: any;

vi.mock('../src/db', () => {
  mockedPrisma = {
    alertEvent: {
      findUniqueOrThrow: vi.fn(async () => alertEventRow),
    },
    externalReference: {
      findMany: vi.fn(async () => symbolFallbackReferences),
    },
  };
  return { prisma: mockedPrisma };
});

describe('buildAlertSummaryContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    alertEventRow = {
      id: 'alert-1',
      alertName: 'test-alert',
      alertType: 'technical',
      timeframe: 'D',
      triggerPrice: 3000,
      triggeredAt: new Date('2026-05-05T09:00:00Z'),
      receivedAt: new Date('2026-05-05T09:01:00Z'),
      createdAt: new Date('2026-05-05T09:01:00Z'),
      symbolId: 'symbol-1',
      symbol: {
        id: 'symbol-1',
        displayName: 'テスト銘柄',
        tradingviewSymbol: 'TSE:9999',
        marketCode: 'JP_STOCK',
      },
      triggerPayloadJson: { alert_name: 'test-alert' },
      externalReferences: [],
    };

    symbolFallbackReferences = [
      {
        id: 'ref-1',
        referenceType: 'news',
        title: 'ニュース1',
        sourceName: 'google_news_rss',
        sourceUrl: 'https://example.com/1',
        publishedAt: new Date('2026-05-05T08:00:00Z'),
        summaryText: 'summary-1',
        relevanceScore: 50,
        createdAt: new Date('2026-05-05T08:01:00Z'),
      },
      {
        id: 'ref-2',
        referenceType: 'disclosure',
        title: '開示2',
        sourceName: 'tdnet',
        sourceUrl: 'https://example.com/2',
        publishedAt: new Date('2026-05-05T07:00:00Z'),
        summaryText: 'summary-2',
        relevanceScore: 60,
        createdAt: new Date('2026-05-05T07:01:00Z'),
      },
    ];
  });

  it('alert_event 直結 refs が 0 件でも alert 発火前の symbol refs だけを補助参照する', async () => {
    symbolFallbackReferences.push({
      id: 'ref-after',
      referenceType: 'earnings',
      title: '発火後の決算資料',
      sourceName: 'tdnet',
      sourceUrl: 'https://example.com/after',
      publishedAt: new Date('2026-05-05T10:00:00Z'),
      summaryText: 'summary-after',
      relevanceScore: 99,
      createdAt: new Date('2026-05-05T10:01:00Z'),
    });

    const { buildAlertSummaryContext } = await import('../src/ai/context-builder');
    const context = await buildAlertSummaryContext('alert-1');

    expect(context.referenceIds).toEqual(['ref-2', 'ref-1']);
    expect(context.references).toHaveLength(2);
    expect(context.references[0].referenceType).toBe('disclosure');
    expect(context.references[1].referenceType).toBe('news');
    expect(context.referenceIds).not.toContain('ref-after');
    expect(mockedPrisma.externalReference.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          symbolId: 'symbol-1',
        }),
        take: 30,
      }),
    );
  });

  it('publishedAt が null の fallback refs は createdAt <= eventTime のものだけ使う', async () => {
    symbolFallbackReferences = [
      {
        id: 'ref-created-before',
        referenceType: 'news',
        title: 'created before',
        sourceName: 'google_news_rss',
        sourceUrl: 'https://example.com/before',
        publishedAt: null,
        summaryText: 'before',
        relevanceScore: 40,
        createdAt: new Date('2026-05-05T08:30:00Z'),
      },
      {
        id: 'ref-created-after',
        referenceType: 'news',
        title: 'created after',
        sourceName: 'google_news_rss',
        sourceUrl: 'https://example.com/after-created',
        publishedAt: null,
        summaryText: 'after',
        relevanceScore: 80,
        createdAt: new Date('2026-05-05T09:30:00Z'),
      },
    ];

    const { buildAlertSummaryContext } = await import('../src/ai/context-builder');
    const context = await buildAlertSummaryContext('alert-1');

    expect(context.referenceIds).toEqual(['ref-created-before']);
    expect(context.referenceIds).not.toContain('ref-created-after');
  });

  it('triggeredAt が null の場合は createdAt を基準に fallback refs を絞り込む', async () => {
    alertEventRow.triggeredAt = null;
    alertEventRow.createdAt = new Date('2026-05-05T09:05:00Z');
    alertEventRow.receivedAt = new Date('2026-05-05T09:06:00Z');
    symbolFallbackReferences = [
      {
        id: 'ref-before-createdAt',
        referenceType: 'news',
        title: 'before createdAt',
        sourceName: 'google_news_rss',
        sourceUrl: 'https://example.com/before-createdAt',
        publishedAt: new Date('2026-05-05T09:00:00Z'),
        summaryText: 'before-createdAt',
        relevanceScore: 10,
        createdAt: new Date('2026-05-05T09:00:10Z'),
      },
      {
        id: 'ref-after-createdAt',
        referenceType: 'news',
        title: 'after createdAt',
        sourceName: 'google_news_rss',
        sourceUrl: 'https://example.com/after-createdAt',
        publishedAt: new Date('2026-05-05T09:10:00Z'),
        summaryText: 'after-createdAt',
        relevanceScore: 10,
        createdAt: new Date('2026-05-05T09:10:10Z'),
      },
    ];

    const { buildAlertSummaryContext } = await import('../src/ai/context-builder');
    const context = await buildAlertSummaryContext('alert-1');

    expect(context.referenceIds).toEqual(['ref-before-createdAt']);
    expect(context.referenceIds).not.toContain('ref-after-createdAt');
  });

  it('alert_event 直結 refs がある場合はそれを優先する', async () => {
    alertEventRow.externalReferences = [
      {
        id: 'event-ref-1',
        referenceType: 'earnings',
        title: '決算資料',
        sourceName: 'tdnet',
        sourceUrl: 'https://example.com/event',
        publishedAt: new Date('2026-05-05T10:00:00Z'),
        summaryText: 'event-summary',
        relevanceScore: 90,
        createdAt: new Date('2026-05-05T10:01:00Z'),
      },
    ];

    const { buildAlertSummaryContext } = await import('../src/ai/context-builder');
    const context = await buildAlertSummaryContext('alert-1');

    expect(context.referenceIds).toEqual(['event-ref-1']);
    expect(context.references).toHaveLength(1);
    expect(context.references[0].referenceType).toBe('earnings');
    expect(mockedPrisma.externalReference.findMany).not.toHaveBeenCalled();
  });
});
