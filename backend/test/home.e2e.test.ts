import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { homeRoutes } from '../src/routes/home';
import { errorHandler } from '../src/utils/response';

type AlertRow = {
  id: string;
  symbolId: string | null;
  alertName: string;
  alertType: string;
  processingStatus: string;
  triggeredAt: Date;
  symbol: {
    id: string;
    symbol: string;
    symbolCode: string;
    marketCode: string;
    tradingviewSymbol: string;
  } | null;
};

type SummaryRow = {
  id: string;
  targetEntityType: string;
  targetEntityId: string;
  summaryScope: string;
  title: string | null;
  bodyMarkdown: string;
  generatedAt: Date | null;
  generationContextJson: Record<string, unknown> | null;
};

type Runtime = {
  alerts: AlertRow[];
  summaries: SummaryRow[];
  externalReferences: Array<{
    id: string;
    publishedAt: Date | null;
    createdAt: Date;
  }>;
  positions: Array<{
    id: string;
    userId: string;
    symbolId: string;
    quantity: { toNumber: () => number };
    averageCost: { toNumber: () => number };
    createdAt: Date;
    symbol: {
      id: string;
      symbol: string;
      symbolCode: string;
      marketCode: string;
      tradingviewSymbol: string;
      displayName: string;
    };
  }>;
  watchlists: Array<{
    id: string;
    userId: string;
    name: string;
    description: string | null;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
  }>;
  watchlistItems: Array<{
    id: string;
    watchlistId: string;
    symbolId: string;
    priority: number | null;
    addedAt: Date;
    symbol: {
      id: string;
      symbol: string;
      symbolCode: string;
      marketCode: string;
      tradingviewSymbol: string;
      displayName: string;
    };
  }>;
  marketSnapshots: Array<{
    id: string;
    snapshotType: string;
    targetCode: string;
    price: { toNumber: () => number };
    changeValue: { toNumber: () => number } | null;
    changeRate: { toNumber: () => number } | null;
    asOf: Date;
  }>;
  investmentCalendarEvents: Array<{
    id: string;
    symbolId: string | null;
    eventDate: Date;
    eventTime: string | null;
    timezone: string;
    eventType: string;
    title: string;
    description: string | null;
    importance: string;
    sourceType: string;
    sourceName: string | null;
    sourceLabel: string | null;
    sourceUrl: string | null;
    externalId?: string | null;
    status: string;
    fetchedAt: Date | null;
    createdAt: Date;
    symbol: any | null;
  }>;
};

let runtime: Runtime;

function createRuntime(): Runtime {
  return {
    alerts: [
      {
        id: 'alert-1',
        symbolId: 'sym-7203',
        alertName: 'Price breakout',
        alertType: 'breakout',
        triggeredAt: new Date('2026-04-12T09:00:00+09:00'),
        processingStatus: 'summarized',
        symbol: {
          id: 'sym-7203',
          symbol: 'TYO:7203',
          symbolCode: '7203',
          marketCode: 'JP',
          tradingviewSymbol: 'TYO:7203',
        },
      },
    ],
    summaries: [
      {
        id: 'alert-summary-1',
        targetEntityType: 'alert_event',
        targetEntityId: 'alert-1',
        summaryScope: 'alert_reason',
        title: 'alert summary',
        bodyMarkdown: 'alert body',
        generatedAt: new Date('2026-04-12T09:05:00+09:00'),
        generationContextJson: null,
      },
      {
        id: 'daily-morning-0410',
        targetEntityType: 'market_snapshot',
        targetEntityId: 'market:jp',
        summaryScope: 'daily',
        title: '2026-04-10 morning',
        bodyMarkdown: 'morning body',
        generatedAt: new Date('2026-04-10T08:00:00+09:00'),
        generationContextJson: { summary_type: 'morning' },
      },
      {
        id: 'daily-evening-0410',
        targetEntityType: 'market_snapshot',
        targetEntityId: 'market:jp',
        summaryScope: 'daily',
        title: '2026-04-10 evening',
        bodyMarkdown: 'evening body',
        generatedAt: new Date('2026-04-10T19:00:00+09:00'),
        generationContextJson: { summary_type: 'evening' },
      },
      {
        id: 'daily-morning-0412',
        targetEntityType: 'market_snapshot',
        targetEntityId: 'market:jp',
        summaryScope: 'daily',
        title: '2026-04-12 morning',
        bodyMarkdown: 'morning body newer',
        generatedAt: new Date('2026-04-12T08:00:00+09:00'),
        generationContextJson: { summary_type: 'morning' },
      },
      {
        id: 'daily-latest',
        targetEntityType: 'market_snapshot',
        targetEntityId: 'market:jp',
        summaryScope: 'daily',
        title: '2026-04-12 evening latest',
        bodyMarkdown: 'latest body',
        generatedAt: new Date('2026-04-12T19:00:00+09:00'),
        generationContextJson: { summary_type: 'evening' },
      },
    ],
    externalReferences: [
      {
        id: 'ref-1',
        publishedAt: new Date('2026-04-12T10:00:00+09:00'),
        createdAt: new Date('2026-04-12T10:00:00+09:00'),
      },
    ],
    positions: [
      {
        id: 'pos-1',
        userId: 'user-1',
        symbolId: 'sym-7203',
        quantity: { toNumber: () => 100 },
        averageCost: { toNumber: () => 2800 },
        createdAt: new Date('2026-04-12T08:00:00+09:00'),
        symbol: {
          id: 'sym-7203',
          symbol: 'TYO:7203',
          symbolCode: '7203',
          marketCode: 'JP',
          tradingviewSymbol: 'TYO:7203',
          displayName: 'Toyota',
        },
      },
    ],
    watchlists: [
      {
        id: 'wl-1',
        userId: 'user-1',
        name: 'default',
        description: 'default watchlist',
        sortOrder: 0,
        createdAt: new Date('2026-04-12T00:00:00+09:00'),
        updatedAt: new Date('2026-04-12T00:00:00+09:00'),
      },
    ],
    watchlistItems: [
      {
        id: 'wli-1',
        watchlistId: 'wl-1',
        symbolId: 'sym-7203',
        priority: 1,
        addedAt: new Date('2026-04-12T00:00:00+09:00'),
        symbol: {
          id: 'sym-7203',
          symbol: 'TYO:7203',
          symbolCode: '7203',
          marketCode: 'JP',
          tradingviewSymbol: 'TYO:7203',
          displayName: 'Toyota',
        },
      },
    ],
    marketSnapshots: [
      {
        id: 'sector-transport-new',
        snapshotType: 'sector',
        targetCode: 'TOPIX_TRANSPORT',
        price: { toNumber: () => 1520.12 },
        changeValue: { toNumber: () => 12.34 },
        changeRate: { toNumber: () => 0.82 },
        asOf: new Date('2026-04-12T06:00:00.000Z'),
      },
      {
        id: 'sector-transport-old',
        snapshotType: 'sector',
        targetCode: 'TOPIX_TRANSPORT',
        price: { toNumber: () => 1500.1 },
        changeValue: { toNumber: () => 10.0 },
        changeRate: { toNumber: () => 0.67 },
        asOf: new Date('2026-04-11T06:00:00.000Z'),
      },
      {
        id: 'sector-electric',
        snapshotType: 'sector',
        targetCode: 'TOPIX_ELECTRIC',
        price: { toNumber: () => 2840.5 },
        changeValue: { toNumber: () => -8.5 },
        changeRate: { toNumber: () => -0.3 },
        asOf: new Date('2026-04-12T06:00:00.000Z'),
      },
      {
        id: 'sector-banks',
        snapshotType: 'sector',
        targetCode: 'TOPIX_BANKS',
        price: { toNumber: () => 920.2 },
        changeValue: null,
        changeRate: null,
        asOf: new Date('2026-04-12T06:00:00.000Z'),
      },
    ],
    investmentCalendarEvents: [
      {
        id: 'cal-1',
        symbolId: 'sym-7203',
        eventDate: new Date('2026-06-10T00:00:00.000Z'),
        eventTime: null,
        timezone: 'Asia/Tokyo',
        eventType: 'earnings',
        title: 'トヨタ自動車 決算発表予定',
        description: null,
        importance: 'high',
        sourceType: 'seed',
        sourceName: 'seed',
        sourceLabel: '決算予定',
        sourceUrl: null,
        externalId: 'seed-7203-earnings',
        status: 'active',
        fetchedAt: new Date('2026-05-26T00:00:00.000Z'),
        createdAt: new Date('2026-05-26T00:00:00.000Z'),
        symbol: {
          id: 'sym-7203',
          symbol: 'TYO:7203',
          symbolCode: '7203',
          marketCode: 'JP',
          tradingviewSymbol: 'TYO:7203',
          displayName: 'トヨタ自動車',
        },
      },
      {
        id: 'cal-market-1',
        symbolId: null,
        eventDate: new Date('2026-06-05T00:00:00.000Z'),
        eventTime: '21:30',
        timezone: 'Asia/Tokyo',
        eventType: 'economic_indicator',
        title: '米雇用統計',
        description: null,
        importance: 'high',
        sourceType: 'seed',
        sourceName: 'seed',
        sourceLabel: '経済指標',
        sourceUrl: null,
        externalId: 'seed-market-payrolls',
        status: 'active',
        fetchedAt: new Date('2026-05-26T00:00:00.000Z'),
        createdAt: new Date('2026-05-26T00:00:00.000Z'),
        symbol: null,
      },
    ],
  };
}

vi.mock('../src/db', () => {
  const prisma = {
    alertEvent: {
      findMany: async ({ where }: any = {}) => {
        let rows = runtime.alerts.slice();
        if (where?.symbolId?.in) {
          const ids: string[] = where.symbolId.in;
          rows = rows.filter((row) => !!row.symbolId && ids.includes(row.symbolId));
        }
        return rows.sort((a, b) => b.triggeredAt.getTime() - a.triggeredAt.getTime());
      },
      count: async ({ where }: any = {}) => {
        if (!where?.OR) {
          return runtime.alerts.length;
        }
        return runtime.alerts.filter((row) => {
          const triggeredTs = row.triggeredAt.getTime();
          return where.OR.some((condition: any) => {
            if (condition.triggeredAt?.gte && condition.triggeredAt?.lt) {
              const gte = (condition.triggeredAt.gte as Date).getTime();
              const lt = (condition.triggeredAt.lt as Date).getTime();
              return triggeredTs >= gte && triggeredTs < lt;
            }
            if (condition.receivedAt?.gte && condition.receivedAt?.lt) {
              const receivedTs = row.triggeredAt.getTime();
              const gte = (condition.receivedAt.gte as Date).getTime();
              const lt = (condition.receivedAt.lt as Date).getTime();
              return receivedTs >= gte && receivedTs < lt;
            }
            return false;
          });
        }).length;
      },
    },
    aiSummary: {
      findMany: async ({ where }: any) => {
        if (where?.summaryScope === 'alert_reason') {
          const ids: string[] = where?.targetEntityId?.in ?? [];
          return runtime.summaries
            .filter(
              (row) =>
                row.summaryScope === 'alert_reason' &&
                row.targetEntityType === 'alert_event' &&
                ids.includes(row.targetEntityId),
            )
            .sort(
              (a, b) =>
                (b.generatedAt?.getTime() ?? 0) - (a.generatedAt?.getTime() ?? 0),
            );
        }

        if (where?.summaryScope === 'daily') {
          let rows = runtime.summaries.filter(
            (row) =>
              row.summaryScope === 'daily' &&
              row.targetEntityType === 'market_snapshot',
          );
          if (where?.generatedAt?.gte && where?.generatedAt?.lt) {
            const gte = (where.generatedAt.gte as Date).getTime();
            const lt = (where.generatedAt.lt as Date).getTime();
            rows = rows.filter((row) => {
              const ts = row.generatedAt?.getTime();
              return typeof ts === 'number' && ts >= gte && ts < lt;
            });
          }
          return rows.sort(
            (a, b) =>
              (b.generatedAt?.getTime() ?? 0) - (a.generatedAt?.getTime() ?? 0),
          );
        }

        return [];
      },
    },
    watchlist: {
      findFirst: async () =>
        runtime.watchlists
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime())[0] ?? null,
    },
    watchlistItem: {
      findMany: async ({ where }: any) =>
        runtime.watchlistItems
          .filter((item) => item.watchlistId === where?.watchlistId)
          .slice()
          .sort((a, b) => a.addedAt.getTime() - b.addedAt.getTime()),
    },
    position: {
      findMany: async () =>
        runtime.positions
          .slice()
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
    },
    marketSnapshot: {
      findMany: async ({ where }: any) =>
        runtime.marketSnapshots
          .filter((row) => {
            if (where?.snapshotType && row.snapshotType !== where.snapshotType) return false;
            const targetCodes: string[] = where?.targetCode?.in ?? [];
            if (targetCodes.length > 0 && !targetCodes.includes(row.targetCode)) return false;
            return true;
          })
          .slice()
          .sort((a, b) => b.asOf.getTime() - a.asOf.getTime()),
      count: async ({ where }: any = {}) =>
        runtime.marketSnapshots.filter((row) => {
          if (!where?.asOf?.gte || !where?.asOf?.lt) return true;
          const ts = row.asOf.getTime();
          const gte = (where.asOf.gte as Date).getTime();
          const lt = (where.asOf.lt as Date).getTime();
          return ts >= gte && ts < lt;
        }).length,
    },
    externalReference: {
      count: async ({ where }: any = {}) => {
        const rows = runtime.externalReferences;
        if (!where?.OR) {
          return rows.length;
        }
        return rows.filter((row) => {
          return where.OR.some((condition: any) => {
            if (condition.publishedAt?.gte && condition.publishedAt?.lt) {
              const ts = row.publishedAt?.getTime();
              if (typeof ts !== 'number') return false;
              const gte = (condition.publishedAt.gte as Date).getTime();
              const lt = (condition.publishedAt.lt as Date).getTime();
              return ts >= gte && ts < lt;
            }
            if (condition.createdAt?.gte && condition.createdAt?.lt) {
              const ts = row.createdAt.getTime();
              const gte = (condition.createdAt.gte as Date).getTime();
              const lt = (condition.createdAt.lt as Date).getTime();
              return ts >= gte && ts < lt;
            }
            return false;
          });
        }).length;
      },
    },
    investmentCalendarEvent: {
      findMany: async ({ where }: any = {}) => runtime.investmentCalendarEvents
        .filter((row) => {
          if (where?.status && row.status !== where.status) return false;
          if (where?.eventDate?.gte && row.eventDate.getTime() < (where.eventDate.gte as Date).getTime()) return false;
          if (where?.eventDate?.lte && row.eventDate.getTime() > (where.eventDate.lte as Date).getTime()) return false;
          if (where?.OR) {
            return where.OR.some((condition: any) => {
              if (condition.symbolId === null) return row.symbolId === null;
              const ids: string[] = condition.symbolId?.in ?? [];
              return row.symbolId ? ids.includes(row.symbolId) : false;
            });
          }
          return true;
        })
        .sort((a, b) => a.eventDate.getTime() - b.eventDate.getTime()),
      findUnique: async ({ where }: any = {}) => {
        const key = where?.sourceType_externalId;
        if (!key) return null;
        return runtime.investmentCalendarEvents.find((row) =>
          row.sourceType === key.sourceType && row.externalId === key.externalId) ?? null;
      },
      upsert: async ({ where, update, create }: any) => {
        const key = where?.sourceType_externalId;
        const existingIndex = runtime.investmentCalendarEvents.findIndex((row) =>
          row.sourceType === key.sourceType && row.externalId === key.externalId);
        if (existingIndex >= 0) {
          runtime.investmentCalendarEvents[existingIndex] = {
            ...runtime.investmentCalendarEvents[existingIndex],
            ...update,
          };
          return runtime.investmentCalendarEvents[existingIndex];
        }
        const symbol = [...runtime.watchlistItems.map((row) => row.symbol), ...runtime.positions.map((row) => row.symbol)]
          .find((row) => row.id === create.symbolId) ?? null;
        const row = {
          id: `calendar-${runtime.investmentCalendarEvents.length + 1}`,
          createdAt: new Date('2026-04-12T00:00:00.000Z'),
          symbol,
          ...create,
        };
        runtime.investmentCalendarEvents.push(row);
        return row;
      },
    },
  };

  return { prisma };
});

vi.mock('../src/market/snapshot', () => ({
  getCurrentSnapshotsForSymbols: vi.fn(async () => {
    const map = new Map();
    map.set('sym-7203', {
      symbol_id: 'sym-7203',
      as_of: '2026-04-12T06:00:00.000Z',
      last_price: 3000,
      change: 36.45,
      change_percent: 1.23,
    });
    map.set('sym-usdjpy', {
      symbol_id: 'sym-usdjpy',
      as_of: '2026-04-12T06:00:00.000Z',
      last_price: 149.82,
      change: 0.45,
      change_percent: 0.3,
    });
    return map;
  }),
}));

vi.mock('../src/home/positions-read-model', () => ({
  rebuildPositionsReadModel: vi.fn(async () => {}),
}));

async function createApp() {
  const app = Fastify({ logger: false });
  app.setErrorHandler(errorHandler);
  app.register(homeRoutes, { prefix: '/api/home' });
  await app.ready();
  return app;
}

describe('GET /api/home daily_summary query handling', () => {
  beforeEach(() => {
    runtime = createRuntime();
  });

  it('returns latest daily summary by default and keeps recent_alerts unchanged', async () => {
    const app = await createApp();

    const res = await app.inject({ method: 'GET', url: '/api/home' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.daily_summary).toMatchObject({
      id: 'daily-latest',
      status: 'available',
      insufficient_context: false,
      summary_type: 'latest',
    });
    expect(body.data.recent_alerts).toHaveLength(1);
    expect(body.data.recent_alerts[0].related_ai_summary.id).toBe('alert-summary-1');
    expect(body.data.recent_alerts[0].current_snapshot.last_price).toBe(3000);
    expect(body.data.market_overview.indices).toHaveLength(1);
    expect(body.data.market_overview.indices[0]).toMatchObject({
      code: '7203',
      display_name: '7203',
      price: 3000,
      change_rate: 1.23,
    });
    expect(body.data.market_overview.fx).toEqual([]);
    expect(body.data.market_overview.sectors).toEqual([
      {
        code: 'TOPIX_TRANSPORT',
        display_name: '輸送用機器',
        price: 1520.12,
        change_value: 12.34,
        change_rate: 0.82,
        as_of: '2026-04-12T06:00:00.000Z',
      },
      {
        code: 'TOPIX_ELECTRIC',
        display_name: '電気機器',
        price: 2840.5,
        change_value: -8.5,
        change_rate: -0.3,
        as_of: '2026-04-12T06:00:00.000Z',
      },
      {
        code: 'TOPIX_BANKS',
        display_name: '銀行業',
        price: 920.2,
        change_value: null,
        change_rate: null,
        as_of: '2026-04-12T06:00:00.000Z',
      },
    ]);

    // Check watchlist_symbols
    expect(body.data.watchlist_symbols).toHaveLength(1);
    expect(body.data.watchlist_symbols[0]).toMatchObject({
      symbol_id: 'sym-7203',
      display_name: 'Toyota',
      tradingview_symbol: 'TYO:7203',
      latest_price: 3000,
      change_rate: 1.23,
      latest_alert_status: 'summarized',
      user_priority: 1,
    });
    expect(body.data.positions).toHaveLength(1);
    expect(body.data.positions[0]).toMatchObject({
      position_id: 'pos-1',
      symbol_id: 'sym-7203',
      display_name: 'Toyota',
      quantity: 100,
      avg_cost: 2800,
      latest_price: 3000,
      unrealized_pnl: 20000,
    });
    expect(body.data.key_events).toHaveLength(1);
    expect(body.data.key_events[0]).toMatchObject({
      label: 'Price breakout',
      date: '2026-04-12',
      symbol_ids: ['sym-7203'],
    });
    expect(body.data.investment_calendar.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope: 'symbol',
          symbol_id: 'sym-7203',
          event_type: 'earnings',
          title: 'トヨタ自動車 決算発表予定',
        }),
        expect.objectContaining({
          scope: 'market',
          symbol_id: null,
          event_type: 'economic_indicator',
          title: '米雇用統計',
        }),
      ]),
    );

    await app.close();
  });

  it('refreshes home investment calendar from the stub provider', async () => {
    const previousProviders = process.env.INVESTMENT_CALENDAR_PROVIDERS;
    const previousProvider = process.env.INVESTMENT_CALENDAR_PROVIDER;
    process.env.INVESTMENT_CALENDAR_PROVIDERS = 'stub';
    const app = await createApp();

    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/home/investment-calendar/refresh',
        payload: { from: '2026-06-01', to: '2026-06-30', include_market_events: true },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data).toMatchObject({
        status: 'succeeded',
        source: 'stub',
        manual_only: true,
      });
      expect(JSON.stringify(res.json())).not.toContain('http://');
      expect(JSON.stringify(res.json())).not.toContain('stack');
      expect(runtime.investmentCalendarEvents.length).toBeGreaterThan(2);
    } finally {
      await app.close();
      if (previousProviders === undefined) delete process.env.INVESTMENT_CALENDAR_PROVIDERS;
      else process.env.INVESTMENT_CALENDAR_PROVIDERS = previousProviders;
      if (previousProvider === undefined) delete process.env.INVESTMENT_CALENDAR_PROVIDER;
      else process.env.INVESTMENT_CALENDAR_PROVIDER = previousProvider;
    }
  });

  it('refreshes home investment calendar from Alpha Vantage fixtures without real external access', async () => {
    const previousProviders = process.env.INVESTMENT_CALENDAR_PROVIDERS;
    const previousProvider = process.env.INVESTMENT_CALENDAR_PROVIDER;
    const previousKey = process.env.INVESTMENT_CALENDAR_ALPHA_VANTAGE_API_KEY;
    process.env.INVESTMENT_CALENDAR_PROVIDERS = 'alpha_vantage';
    process.env.INVESTMENT_CALENDAR_ALPHA_VANTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn(async (url: URL) => {
      const functionName = url.searchParams.get('function');
      if (functionName === 'IPO_CALENDAR') {
        return {
          ok: true,
          text: vi.fn(async () => 'symbol,name,ipoDate,priceRangeLow,priceRangeHigh,currency,exchange\nTEST,Test Holdings,2026-07-01,10,12,USD,NASDAQ\n'),
          json: vi.fn(async () => ({})),
        } as any;
      }
      return {
        ok: true,
        json: vi.fn(async () => ({
          name: 'series',
          data: [{ date: '2026-06-05', value: '100.0' }],
        })),
        text: vi.fn(async () => ''),
      } as any;
    }));
    const app = await createApp();

    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/home/investment-calendar/refresh',
        payload: { from: '2026-06-01', to: '2026-07-31', include_market_events: true },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data).toMatchObject({
        status: 'succeeded',
        source: 'public_provider',
        manual_only: true,
      });
      expect(runtime.investmentCalendarEvents).toEqual(expect.arrayContaining([
        expect.objectContaining({
          sourceType: 'public_provider',
          sourceName: 'alpha_vantage',
          title: '米CPI',
        }),
        expect.objectContaining({
          sourceType: 'public_provider',
          sourceName: 'alpha_vantage',
          title: '米GDP',
        }),
        expect.objectContaining({
          sourceType: 'public_provider',
          sourceName: 'alpha_vantage',
          title: '米PPI',
        }),
        expect.objectContaining({
          sourceType: 'public_provider',
          sourceName: 'alpha_vantage',
          eventType: 'ipo',
          title: 'TEST IPO予定',
        }),
      ]));
      expect(JSON.stringify(res.json())).not.toContain('test-key');
      expect(JSON.stringify(res.json())).not.toContain('alphavantage.co');
      expect(JSON.stringify(res.json())).not.toContain('stack');
    } finally {
      await app.close();
      vi.unstubAllGlobals();
      if (previousProviders === undefined) delete process.env.INVESTMENT_CALENDAR_PROVIDERS;
      else process.env.INVESTMENT_CALENDAR_PROVIDERS = previousProviders;
      if (previousProvider === undefined) delete process.env.INVESTMENT_CALENDAR_PROVIDER;
      else process.env.INVESTMENT_CALENDAR_PROVIDER = previousProvider;
      if (previousKey === undefined) delete process.env.INVESTMENT_CALENDAR_ALPHA_VANTAGE_API_KEY;
      else process.env.INVESTMENT_CALENDAR_ALPHA_VANTAGE_API_KEY = previousKey;
    }
  });

  it('refreshes home investment calendar from J-Quants fixtures without real external access', async () => {
    const previousProviders = process.env.INVESTMENT_CALENDAR_PROVIDERS;
    const previousProvider = process.env.INVESTMENT_CALENDAR_PROVIDER;
    const previousKey = process.env.INVESTMENT_CALENDAR_JQUANTS_API_KEY;
    process.env.INVESTMENT_CALENDAR_PROVIDERS = 'jquants';
    process.env.INVESTMENT_CALENDAR_JQUANTS_API_KEY = 'test-api-key';
    vi.stubGlobal('fetch', vi.fn(async (url: URL | string, init?: RequestInit) => {
      const urlText = String(url);
      expect((init?.headers as Record<string, string>)?.['x-api-key']).toBe('test-api-key');
      if (urlText.includes('/equities/earnings-calendar')) {
        expect(urlText).toContain('from=2026-06-01');
        expect(urlText).toContain('to=2026-06-30');
        return {
          ok: true,
          status: 200,
          json: vi.fn(async () => ({
            data: [
              { Code: '72030', Date: '2026-06-10', CompanyName: 'トヨタ自動車', FiscalQuarter: 'FY' },
            ],
          })),
        } as any;
      }
      if (urlText.includes('/markets/calendar')) {
        expect(urlText).not.toContain('from=');
        expect(urlText).not.toContain('to=');
        return {
          ok: true,
          status: 200,
          json: vi.fn(async () => ({
            data: [
              { Date: '2026-06-15', HolDiv: '1' },
              { Date: '2026-06-16', HolDiv: '0' },
            ],
          })),
        } as any;
      }
      return { ok: false, status: 500, json: vi.fn(async () => ({})) } as any;
    }));
    const app = await createApp();

    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/home/investment-calendar/refresh',
        payload: { from: '2026-06-01', to: '2026-06-30', include_market_events: true },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data).toMatchObject({
        status: 'succeeded',
        source: 'public_provider',
        manual_only: true,
      });
      expect(runtime.investmentCalendarEvents).toEqual(expect.arrayContaining([
        expect.objectContaining({
          sourceType: 'public_provider',
          sourceName: 'jquants',
          eventType: 'earnings',
          symbolId: 'sym-7203',
        }),
        expect.objectContaining({
          sourceType: 'public_provider',
          sourceName: 'jquants',
          eventType: 'market_holiday',
          symbolId: null,
        }),
      ]));
      expect(JSON.stringify(res.json())).not.toContain('test-api-key');
      expect(JSON.stringify(res.json())).not.toContain('api.jquants.com');
      expect(JSON.stringify(res.json())).not.toContain('stack');
    } finally {
      await app.close();
      vi.unstubAllGlobals();
      if (previousProviders === undefined) delete process.env.INVESTMENT_CALENDAR_PROVIDERS;
      else process.env.INVESTMENT_CALENDAR_PROVIDERS = previousProviders;
      if (previousProvider === undefined) delete process.env.INVESTMENT_CALENDAR_PROVIDER;
      else process.env.INVESTMENT_CALENDAR_PROVIDER = previousProvider;
      if (previousKey === undefined) delete process.env.INVESTMENT_CALENDAR_JQUANTS_API_KEY;
      else process.env.INVESTMENT_CALENDAR_JQUANTS_API_KEY = previousKey;
    }
  });

  it('aggregates Alpha Vantage, J-Quants, and official market home calendar providers', async () => {
    const previousProviders = process.env.INVESTMENT_CALENDAR_PROVIDERS;
    const previousAlphaKey = process.env.INVESTMENT_CALENDAR_ALPHA_VANTAGE_API_KEY;
    const previousJquantsKey = process.env.INVESTMENT_CALENDAR_JQUANTS_API_KEY;
    process.env.INVESTMENT_CALENDAR_PROVIDERS = 'alpha_vantage,jquants,official_market';
    process.env.INVESTMENT_CALENDAR_ALPHA_VANTAGE_API_KEY = 'test-alpha-key';
    process.env.INVESTMENT_CALENDAR_JQUANTS_API_KEY = 'test-jquants-key';
    vi.stubGlobal('fetch', vi.fn(async (url: URL | string, init?: RequestInit) => {
      const urlText = String(url);
      if (urlText.includes('alphavantage')) {
        const functionName = (url as URL).searchParams.get('function');
        if (functionName === 'IPO_CALENDAR') {
          return {
            ok: true,
            text: vi.fn(async () => 'symbol,name,ipoDate,priceRangeLow,priceRangeHigh,currency,exchange\nTEST,Test Holdings,2026-07-01,10,12,USD,NASDAQ\n'),
            json: vi.fn(async () => ({})),
          } as any;
        }
        return {
          ok: true,
          json: vi.fn(async () => ({
            name: 'series',
            data: [{ date: '2026-06-05', value: '100.0' }],
          })),
          text: vi.fn(async () => ''),
        } as any;
      }
      expect((init?.headers as Record<string, string>)?.['x-api-key']).toBe('test-jquants-key');
      if (urlText.includes('/equities/earnings-calendar')) {
        return {
          ok: true,
          status: 200,
          json: vi.fn(async () => ({
            data: [{ Code: '72030', Date: '2026-06-10', CompanyName: 'トヨタ自動車', FiscalQuarter: 'FY' }],
          })),
        } as any;
      }
      if (urlText.includes('/markets/calendar')) {
        return {
          ok: true,
          status: 200,
          json: vi.fn(async () => ({
            data: [{ Date: '2026-06-15', HolDiv: '1' }],
          })),
        } as any;
      }
      return { ok: false, status: 500, json: vi.fn(async () => ({})), text: vi.fn(async () => '') } as any;
    }));
    const app = await createApp();

    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/home/investment-calendar/refresh',
        payload: { from: '2026-06-01', to: '2026-07-31', include_market_events: true },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data).toMatchObject({
        status: 'succeeded',
        source: 'public_provider',
        manual_only: true,
        providers: [
          expect.objectContaining({ provider: 'alpha_vantage', status: 'succeeded', error_code: null }),
          expect.objectContaining({ provider: 'jquants', status: 'succeeded', error_code: null }),
          expect.objectContaining({ provider: 'official_market', status: 'succeeded', error_code: null }),
        ],
      });
      expect(runtime.investmentCalendarEvents).toEqual(expect.arrayContaining([
        expect.objectContaining({ sourceName: 'alpha_vantage', eventType: 'economic_indicator' }),
        expect.objectContaining({ sourceName: 'alpha_vantage', title: '米GDP' }),
        expect.objectContaining({ sourceName: 'alpha_vantage', title: '米PPI' }),
        expect.objectContaining({ sourceName: 'alpha_vantage', eventType: 'ipo' }),
        expect.objectContaining({ sourceName: 'jquants', eventType: 'earnings' }),
        expect.objectContaining({ sourceName: 'jquants', eventType: 'market_holiday' }),
        expect.objectContaining({ sourceName: 'federal_reserve', eventType: 'central_bank' }),
        expect.objectContaining({ sourceName: 'boj', eventType: 'central_bank' }),
        expect.objectContaining({ sourceName: 'nyse', eventType: 'market_holiday' }),
      ]));
      expect(JSON.stringify(res.json())).not.toContain('test-alpha-key');
      expect(JSON.stringify(res.json())).not.toContain('test-jquants-key');
      expect(JSON.stringify(res.json())).not.toContain('alphavantage.co');
      expect(JSON.stringify(res.json())).not.toContain('api.jquants.com');
      expect(JSON.stringify(res.json())).not.toContain('stack');
    } finally {
      await app.close();
      vi.unstubAllGlobals();
      if (previousProviders === undefined) delete process.env.INVESTMENT_CALENDAR_PROVIDERS;
      else process.env.INVESTMENT_CALENDAR_PROVIDERS = previousProviders;
      if (previousAlphaKey === undefined) delete process.env.INVESTMENT_CALENDAR_ALPHA_VANTAGE_API_KEY;
      else process.env.INVESTMENT_CALENDAR_ALPHA_VANTAGE_API_KEY = previousAlphaKey;
      if (previousJquantsKey === undefined) delete process.env.INVESTMENT_CALENDAR_JQUANTS_API_KEY;
      else process.env.INVESTMENT_CALENDAR_JQUANTS_API_KEY = previousJquantsKey;
    }
  });

  it('refreshes home investment calendar from official market fixtures without real external access', async () => {
    const previousProviders = process.env.INVESTMENT_CALENDAR_PROVIDERS;
    process.env.INVESTMENT_CALENDAR_PROVIDERS = 'official_market';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const app = await createApp();

    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/home/investment-calendar/refresh',
        payload: { from: '2026-05-01', to: '2026-08-31', include_market_events: true },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data).toMatchObject({
        status: 'succeeded',
        source: 'public_provider',
        manual_only: true,
        providers: [
          expect.objectContaining({ provider: 'official_market', status: 'succeeded', error_code: null }),
        ],
      });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(runtime.investmentCalendarEvents).toEqual(expect.arrayContaining([
        expect.objectContaining({ sourceName: 'federal_reserve', eventType: 'central_bank', title: 'FOMC' }),
        expect.objectContaining({ sourceName: 'boj', eventType: 'central_bank', title: '日銀金融政策決定会合' }),
        expect.objectContaining({ sourceName: 'nyse', eventType: 'market_holiday' }),
      ]));
      expect(JSON.stringify(res.json())).not.toContain('http');
      expect(JSON.stringify(res.json())).not.toContain('stack');
    } finally {
      await app.close();
      vi.unstubAllGlobals();
      if (previousProviders === undefined) delete process.env.INVESTMENT_CALENDAR_PROVIDERS;
      else process.env.INVESTMENT_CALENDAR_PROVIDERS = previousProviders;
    }
  });

  it('returns partial_success when one investment calendar provider fails', async () => {
    const previousProviders = process.env.INVESTMENT_CALENDAR_PROVIDERS;
    const previousAlphaKey = process.env.INVESTMENT_CALENDAR_ALPHA_VANTAGE_API_KEY;
    const previousJquantsKey = process.env.INVESTMENT_CALENDAR_JQUANTS_API_KEY;
    process.env.INVESTMENT_CALENDAR_PROVIDERS = 'alpha_vantage,jquants';
    delete process.env.INVESTMENT_CALENDAR_ALPHA_VANTAGE_API_KEY;
    process.env.INVESTMENT_CALENDAR_JQUANTS_API_KEY = 'test-jquants-key';
    vi.stubGlobal('fetch', vi.fn(async (url: URL | string) => {
      const urlText = String(url);
      if (urlText.includes('/equities/earnings-calendar')) {
        return {
          ok: true,
          status: 200,
          json: vi.fn(async () => ({
            data: [{ Code: '72030', Date: '2026-06-10', CompanyName: 'トヨタ自動車', FiscalQuarter: 'FY' }],
          })),
        } as any;
      }
      if (urlText.includes('/markets/calendar')) {
        return { ok: true, status: 200, json: vi.fn(async () => ({ data: [] })) } as any;
      }
      return { ok: false, status: 500, json: vi.fn(async () => ({})) } as any;
    }));
    const app = await createApp();

    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/home/investment-calendar/refresh',
        payload: { from: '2026-06-01', to: '2026-06-30', include_market_events: true },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data).toMatchObject({
        status: 'partial_success',
        failed_count: 1,
        providers: [
          expect.objectContaining({
            provider: 'alpha_vantage',
            status: 'failed',
            error_code: 'INVESTMENT_CALENDAR_PROVIDER_UNAVAILABLE',
          }),
          expect.objectContaining({ provider: 'jquants', status: 'succeeded' }),
        ],
      });
      expect(JSON.stringify(res.json())).not.toContain('test-jquants-key');
      expect(JSON.stringify(res.json())).not.toContain('stack');
    } finally {
      await app.close();
      vi.unstubAllGlobals();
      if (previousProviders === undefined) delete process.env.INVESTMENT_CALENDAR_PROVIDERS;
      else process.env.INVESTMENT_CALENDAR_PROVIDERS = previousProviders;
      if (previousAlphaKey === undefined) delete process.env.INVESTMENT_CALENDAR_ALPHA_VANTAGE_API_KEY;
      else process.env.INVESTMENT_CALENDAR_ALPHA_VANTAGE_API_KEY = previousAlphaKey;
      if (previousJquantsKey === undefined) delete process.env.INVESTMENT_CALENDAR_JQUANTS_API_KEY;
      else process.env.INVESTMENT_CALENDAR_JQUANTS_API_KEY = previousJquantsKey;
    }
  });

  it('returns failed when all investment calendar providers fail', async () => {
    const previousProviders = process.env.INVESTMENT_CALENDAR_PROVIDERS;
    const previousAlphaKey = process.env.INVESTMENT_CALENDAR_ALPHA_VANTAGE_API_KEY;
    const previousJquantsKey = process.env.INVESTMENT_CALENDAR_JQUANTS_API_KEY;
    process.env.INVESTMENT_CALENDAR_PROVIDERS = 'alpha_vantage,jquants';
    delete process.env.INVESTMENT_CALENDAR_ALPHA_VANTAGE_API_KEY;
    delete process.env.INVESTMENT_CALENDAR_JQUANTS_API_KEY;
    const app = await createApp();

    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/home/investment-calendar/refresh',
        payload: { from: '2026-06-01', to: '2026-06-30', include_market_events: true },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data).toMatchObject({
        status: 'failed',
        saved_count: 0,
        updated_count: 0,
        failed_count: 2,
        providers: [
          expect.objectContaining({ provider: 'alpha_vantage', status: 'failed' }),
          expect.objectContaining({ provider: 'jquants', status: 'failed' }),
        ],
      });
      expect(JSON.stringify(res.json())).not.toContain('stack');
      expect(JSON.stringify(res.json())).not.toContain('http');
    } finally {
      await app.close();
      if (previousProviders === undefined) delete process.env.INVESTMENT_CALENDAR_PROVIDERS;
      else process.env.INVESTMENT_CALENDAR_PROVIDERS = previousProviders;
      if (previousAlphaKey === undefined) delete process.env.INVESTMENT_CALENDAR_ALPHA_VANTAGE_API_KEY;
      else process.env.INVESTMENT_CALENDAR_ALPHA_VANTAGE_API_KEY = previousAlphaKey;
      if (previousJquantsKey === undefined) delete process.env.INVESTMENT_CALENDAR_JQUANTS_API_KEY;
      else process.env.INVESTMENT_CALENDAR_JQUANTS_API_KEY = previousJquantsKey;
    }
  });

  it('switches daily summary by summary_type', async () => {
    const app = await createApp();

    const morning = await app.inject({
      method: 'GET',
      url: '/api/home?summary_type=morning',
    });
    expect(morning.statusCode).toBe(200);
    expect(morning.json().data.daily_summary).toMatchObject({
      id: 'daily-morning-0412',
      status: 'available',
      summary_type: 'morning',
    });

    const evening = await app.inject({
      method: 'GET',
      url: '/api/home?summary_type=evening',
    });
    expect(evening.statusCode).toBe(200);
    expect(evening.json().data.daily_summary).toMatchObject({
      id: 'daily-latest',
      status: 'available',
      summary_type: 'evening',
    });

    await app.close();
  });

  it('applies date filter together with summary_type', async () => {
    const app = await createApp();

    const eveningOnDate = await app.inject({
      method: 'GET',
      url: '/api/home?summary_type=evening&date=2026-04-10',
    });
    expect(eveningOnDate.statusCode).toBe(200);
    expect(eveningOnDate.json().data.daily_summary).toMatchObject({
      id: 'daily-evening-0410',
      status: 'available',
      summary_type: 'evening',
      date: '2026-04-10',
    });

    const morningMissing = await app.inject({
      method: 'GET',
      url: '/api/home?summary_type=morning&date=2026-04-11',
    });
    expect(morningMissing.statusCode).toBe(200);
    expect(morningMissing.json().data.daily_summary).toMatchObject({
      id: null,
      status: 'unavailable',
      summary_type: 'morning',
      date: '2026-04-11',
      insufficient_context: true,
    });

    await app.close();
  });

  it('returns validation errors for unsupported summary_type and invalid date', async () => {
    const app = await createApp();

    const invalidType = await app.inject({
      method: 'GET',
      url: '/api/home?summary_type=night',
    });
    expect(invalidType.statusCode).toBe(400);
    expect(invalidType.json().error.code).toBe('VALIDATION_ERROR');

    const invalidDate = await app.inject({
      method: 'GET',
      url: '/api/home?summary_type=latest&date=2026/04/12',
    });
    expect(invalidDate.statusCode).toBe(400);
    expect(invalidDate.json().error.code).toBe('VALIDATION_ERROR');

    const impossibleDate = await app.inject({
      method: 'GET',
      url: '/api/home?summary_type=latest&date=2026-02-31',
    });
    expect(impossibleDate.statusCode).toBe(400);
    expect(impossibleDate.json().error.code).toBe('VALIDATION_ERROR');

    await app.close();
  });

  it('builds market_overview.fx from recent alerts and keeps indices unchanged', async () => {
    runtime.alerts.unshift({
      id: 'alert-fx-1',
      symbolId: 'sym-usdjpy',
      alertName: 'USDJPY intraday move',
      alertType: 'fx_move',
      triggeredAt: new Date('2026-04-12T11:30:00+09:00'),
      processingStatus: 'received',
      symbol: {
        id: 'sym-usdjpy',
        symbol: 'USD/JPY',
        symbolCode: 'USDJPY',
        marketCode: 'FX',
        tradingviewSymbol: 'FOREX:USDJPY',
      },
    });

    const app = await createApp();
    const res = await app.inject({ method: 'GET', url: '/api/home' });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.data.market_overview.indices).toHaveLength(1);
    expect(body.data.market_overview.indices[0].code).toBe('7203');
    expect(body.data.market_overview.fx).toHaveLength(1);
    expect(body.data.market_overview.fx[0]).toMatchObject({
      code: 'USDJPY',
      display_name: 'USDJPY',
      price: 149.82,
      change_value: 0.45,
      change_rate: 0.3,
    });

    await app.close();
  });

  it('returns empty key_events when there are no recent alerts', async () => {
    runtime.alerts = [];
    runtime.positions = [];
    runtime.watchlistItems = [];
    const app = await createApp();

    const res = await app.inject({ method: 'GET', url: '/api/home' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.key_events).toEqual([]);
    expect(res.json().data.positions).toEqual([]);

    await app.close();
  });

  it('returns watchlist symbols ordered by priority asc, null priority last, then addedAt asc', async () => {
    runtime.watchlistItems = [
      {
        id: 'wli-null-priority',
        watchlistId: 'wl-1',
        symbolId: 'sym-9984',
        priority: null,
        addedAt: new Date('2026-04-12T00:02:00+09:00'),
        symbol: {
          id: 'sym-9984',
          symbol: 'TYO:9984',
          symbolCode: '9984',
          marketCode: 'JP',
          tradingviewSymbol: 'TYO:9984',
          displayName: 'SoftBank Group',
        },
      },
      {
        id: 'wli-priority-2-later',
        watchlistId: 'wl-1',
        symbolId: 'sym-6758',
        priority: 2,
        addedAt: new Date('2026-04-12T00:03:00+09:00'),
        symbol: {
          id: 'sym-6758',
          symbol: 'TYO:6758',
          symbolCode: '6758',
          marketCode: 'JP',
          tradingviewSymbol: 'TYO:6758',
          displayName: 'Sony Group',
        },
      },
      {
        id: 'wli-priority-2-earlier',
        watchlistId: 'wl-1',
        symbolId: 'sym-9432',
        priority: 2,
        addedAt: new Date('2026-04-12T00:01:00+09:00'),
        symbol: {
          id: 'sym-9432',
          symbol: 'TYO:9432',
          symbolCode: '9432',
          marketCode: 'JP',
          tradingviewSymbol: 'TYO:9432',
          displayName: 'NTT',
        },
      },
      runtime.watchlistItems[0],
    ];

    const app = await createApp();
    const res = await app.inject({ method: 'GET', url: '/api/home' });

    expect(res.statusCode).toBe(200);
    expect(
      res.json().data.watchlist_symbols.map((row: any) => [row.symbol_id, row.user_priority]),
    ).toEqual([
      ['sym-7203', 1],
      ['sym-9432', 2],
      ['sym-6758', 2],
      ['sym-9984', null],
    ]);

    await app.close();
  });

  it('keeps watchlist and positions rows even when snapshots are unavailable', async () => {
    runtime.watchlistItems.push({
      id: 'wli-no-snapshot',
      watchlistId: 'wl-1',
      symbolId: 'sym-6501',
      priority: 3,
      addedAt: new Date('2026-04-12T00:04:00+09:00'),
      symbol: {
        id: 'sym-6501',
        symbol: 'TYO:6501',
        symbolCode: '6501',
        marketCode: 'JP',
        tradingviewSymbol: 'TYO:6501',
        displayName: 'Hitachi',
      },
    });
    runtime.positions.push({
      id: 'pos-no-snapshot',
      userId: 'user-1',
      symbolId: 'sym-6501',
      quantity: { toNumber: () => 20 },
      averageCost: { toNumber: () => 1000 },
      createdAt: new Date('2026-04-12T08:05:00+09:00'),
      symbol: {
        id: 'sym-6501',
        symbol: 'TYO:6501',
        symbolCode: '6501',
        marketCode: 'JP',
        tradingviewSymbol: 'TYO:6501',
        displayName: 'Hitachi',
      },
    });

    const app = await createApp();
    const res = await app.inject({ method: 'GET', url: '/api/home' });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.data.watchlist_symbols).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          symbol_id: 'sym-6501',
          display_name: 'Hitachi',
          latest_price: null,
          change_rate: null,
          user_priority: 3,
        }),
      ]),
    );
    expect(body.data.positions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          position_id: 'pos-no-snapshot',
          symbol_id: 'sym-6501',
          display_name: 'Hitachi',
          latest_price: null,
          unrealized_pnl: null,
        }),
      ]),
    );

    await app.close();
  });

  it('keeps sectors as partial success when some sector snapshots are missing', async () => {
    runtime.marketSnapshots = runtime.marketSnapshots.filter(
      (row) => row.targetCode === 'TOPIX_TRANSPORT',
    );

    const app = await createApp();
    const res = await app.inject({ method: 'GET', url: '/api/home' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.market_overview.sectors).toEqual([
      {
        code: 'TOPIX_TRANSPORT',
        display_name: '輸送用機器',
        price: 1520.12,
        change_value: 12.34,
        change_rate: 0.82,
        as_of: '2026-04-12T06:00:00.000Z',
      },
    ]);

    await app.close();
  });

  it('returns sectors as empty when all sector snapshots are missing', async () => {
    runtime.marketSnapshots = [];

    const app = await createApp();
    const res = await app.inject({ method: 'GET', url: '/api/home' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.market_overview.sectors).toEqual([]);

    await app.close();
  });
});
