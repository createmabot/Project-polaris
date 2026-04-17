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
  };
}

vi.mock('../src/db', () => {
  const prisma = {
    alertEvent: {
      findMany: async () =>
        runtime.alerts
          .slice()
          .sort((a, b) => b.triggeredAt.getTime() - a.triggeredAt.getTime()),
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
    expect(body.data.daily_summary.id).toBe('daily-latest');
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
    expect(body.data.market_overview.sectors).toEqual([]);

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

    await app.close();
  });

  it('switches daily summary by summary_type', async () => {
    const app = await createApp();

    const morning = await app.inject({
      method: 'GET',
      url: '/api/home?summary_type=morning',
    });
    expect(morning.statusCode).toBe(200);
    expect(morning.json().data.daily_summary.id).toBe('daily-morning-0412');

    const evening = await app.inject({
      method: 'GET',
      url: '/api/home?summary_type=evening',
    });
    expect(evening.statusCode).toBe(200);
    expect(evening.json().data.daily_summary.id).toBe('daily-latest');

    await app.close();
  });

  it('applies date filter together with summary_type', async () => {
    const app = await createApp();

    const eveningOnDate = await app.inject({
      method: 'GET',
      url: '/api/home?summary_type=evening&date=2026-04-10',
    });
    expect(eveningOnDate.statusCode).toBe(200);
    expect(eveningOnDate.json().data.daily_summary.id).toBe('daily-evening-0410');

    const morningMissing = await app.inject({
      method: 'GET',
      url: '/api/home?summary_type=morning&date=2026-04-11',
    });
    expect(morningMissing.statusCode).toBe(200);
    expect(morningMissing.json().data.daily_summary).toBeNull();

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
});
