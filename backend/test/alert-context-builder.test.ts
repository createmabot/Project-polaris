import { beforeEach, describe, expect, it, vi } from 'vitest';

type AlertEventRow = {
  id: string;
  alertName: string;
  alertType: string | null;
  timeframe: string | null;
  triggerPrice: number | null;
  triggeredAt: Date | null;
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

vi.mock('../src/db', () => {
  const prisma = {
    alertEvent: {
      findUniqueOrThrow: vi.fn(async () => alertEventRow),
    },
    externalReference: {
      findMany: vi.fn(async () => symbolFallbackReferences),
    },
  };
  return { prisma };
});

describe('buildAlertSummaryContext', () => {
  beforeEach(() => {
    alertEventRow = {
      id: 'alert-1',
      alertName: 'test-alert',
      alertType: 'technical',
      timeframe: 'D',
      triggerPrice: 3000,
      triggeredAt: new Date('2026-05-05T09:00:00Z'),
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

  it('alert_event 直結 refs が 0 件でも symbol refs を補助参照する', async () => {
    const { buildAlertSummaryContext } = await import('../src/ai/context-builder');
    const context = await buildAlertSummaryContext('alert-1');

    expect(context.referenceIds).toEqual(['ref-2', 'ref-1']);
    expect(context.references).toHaveLength(2);
    expect(context.references[0].referenceType).toBe('disclosure');
    expect(context.references[1].referenceType).toBe('news');
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
  });
});
