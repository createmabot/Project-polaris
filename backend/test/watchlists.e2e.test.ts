import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { watchlistRoutes } from '../src/routes/watchlists';
import { errorHandler } from '../src/utils/response';

type Runtime = {
  watchlists: Array<{
    id: string;
    userId: string;
    name: string;
    description: string | null;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
  }>;
  items: Array<{
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
  alerts: Array<{
    id: string;
    symbolId: string;
    triggeredAt: Date;
    processingStatus: string;
  }>;
};

let runtime: Runtime;

function createRuntime(): Runtime {
  return {
    watchlists: [
      {
        id: 'wl-1',
        userId: 'user-1',
        name: 'default',
        description: 'default watchlist',
        sortOrder: 0,
        createdAt: new Date('2026-04-01T00:00:00.000Z'),
        updatedAt: new Date('2026-04-01T00:00:00.000Z'),
      },
    ],
    items: [
      {
        id: 'wli-1',
        watchlistId: 'wl-1',
        symbolId: 'sym-7203',
        priority: 1,
        addedAt: new Date('2026-04-01T00:00:00.000Z'),
        symbol: {
          id: 'sym-7203',
          symbol: '7203',
          symbolCode: '7203',
          marketCode: 'JP_STOCK',
          tradingviewSymbol: 'TSE:7203',
          displayName: 'Toyota',
        },
      },
    ],
    alerts: [
      {
        id: 'alert-1',
        symbolId: 'sym-7203',
        triggeredAt: new Date('2026-04-02T00:00:00.000Z'),
        processingStatus: 'summarized',
      },
    ],
  };
}

vi.mock('../src/db', () => {
  const prisma = {
    watchlist: {
      findMany: async () =>
        runtime.watchlists.map((wl) => ({
          ...wl,
          _count: {
            items: runtime.items.filter((item) => item.watchlistId === wl.id).length,
          },
        })),
      findUnique: async ({ where }: any) => runtime.watchlists.find((wl) => wl.id === where?.id) ?? null,
    },
    watchlistItem: {
      findMany: async ({ where }: any) =>
        runtime.items
          .filter((item) => item.watchlistId === where?.watchlistId)
          .slice()
          .sort((a, b) => a.addedAt.getTime() - b.addedAt.getTime()),
    },
    alertEvent: {
      findMany: async ({ where }: any) => {
        const ids: string[] = where?.symbolId?.in ?? [];
        return runtime.alerts
          .filter((alert) => ids.includes(alert.symbolId))
          .slice()
          .sort((a, b) => b.triggeredAt.getTime() - a.triggeredAt.getTime());
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
      as_of: '2026-04-02T00:00:00.000Z',
      last_price: 3000,
      change: 30,
      change_percent: 1,
    });
    return map;
  }),
}));

async function createApp() {
  const app = Fastify({ logger: false });
  app.setErrorHandler(errorHandler);
  app.register(watchlistRoutes, { prefix: '/api/watchlists' });
  await app.ready();
  return app;
}

describe('watchlists routes', () => {
  beforeEach(() => {
    runtime = createRuntime();
  });

  it('returns watchlist list', async () => {
    const app = await createApp();
    const res = await app.inject({ method: 'GET', url: '/api/watchlists' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.watchlists).toHaveLength(1);
    expect(body.data.watchlists[0]).toMatchObject({
      id: 'wl-1',
      name: 'default',
      item_count: 1,
      sort_order: 0,
    });
    await app.close();
  });

  it('returns watchlist items with home-compatible shape', async () => {
    const app = await createApp();
    const res = await app.inject({ method: 'GET', url: '/api/watchlists/wl-1/items' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.watchlist.id).toBe('wl-1');
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0]).toMatchObject({
      symbol_id: 'sym-7203',
      display_name: 'Toyota',
      tradingview_symbol: 'TSE:7203',
      latest_price: 3000,
      change_rate: 1,
      latest_alert_status: 'summarized',
      user_priority: 1,
    });
    await app.close();
  });

  it('returns NOT_FOUND for unknown watchlist', async () => {
    const app = await createApp();
    const res = await app.inject({ method: 'GET', url: '/api/watchlists/unknown/items' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
    await app.close();
  });
});

