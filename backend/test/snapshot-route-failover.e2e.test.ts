import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetSnapshotCacheForTests } from '../src/market/snapshot';

type FetchMode = 'primary_success' | 'secondary_success' | 'all_fail';

type RuntimeState = {
  fetchMode: FetchMode;
};

let runtime: RuntimeState;

const symbols = [
  {
    id: 'sym-1',
    symbol: '7203',
    symbolCode: '7203',
    displayName: 'Toyota Motor',
    marketCode: 'TSE',
    tradingviewSymbol: 'TSE:7203',
  },
  {
    id: 'sym-2',
    symbol: '6758',
    symbolCode: '6758',
    displayName: 'Sony Group',
    marketCode: 'TSE',
    tradingviewSymbol: 'TSE:6758',
  },
];

const alerts = [
  {
    id: 'alert-1',
    symbolId: 'sym-1',
    alertName: 'MA25 breakout',
    alertType: 'technical',
    timeframe: 'D',
    triggerPrice: 3400,
    triggeredAt: new Date('2026-03-21T00:10:00.000Z'),
    receivedAt: new Date('2026-03-21T00:10:05.000Z'),
    processingStatus: 'summarized',
    symbol: symbols[0],
  },
  {
    id: 'alert-2',
    symbolId: 'sym-2',
    alertName: 'RSI overbought',
    alertType: 'technical',
    timeframe: 'D',
    triggerPrice: 14500,
    triggeredAt: new Date('2026-03-21T00:05:00.000Z'),
    receivedAt: new Date('2026-03-21T00:05:03.000Z'),
    processingStatus: 'summarized',
    symbol: symbols[1],
  },
];

const comparisonSession = {
  id: 'cmp-1',
  name: 'Toyota vs Sony',
  comparisonType: 'symbol',
  status: 'ready',
  createdAt: new Date('2026-03-21T00:00:00.000Z'),
  updatedAt: new Date('2026-03-21T00:00:00.000Z'),
  comparisonSymbols: [
    { symbolId: 'sym-1', sortOrder: 0 },
    { symbolId: 'sym-2', sortOrder: 1 },
  ],
};

function makeCsvForSymbol(symbolCode: string) {
  if (symbolCode.includes('7203')) {
    return [
      'Date,Open,High,Low,Close,Volume',
      '2026-03-20,0,0,0,3359,10000000',
      '2026-03-21,0,0,0,3404,15583800',
    ].join('\n');
  }
  return [
    'Date,Open,High,Low,Close,Volume',
    '2026-03-20,0,0,0,14420,5000000',
    '2026-03-21,0,0,0,14510,5123400',
  ].join('\n');
}

function createFetchStub(mode: FetchMode) {
  return vi.fn(async (input: string | URL) => {
    const url = String(input);
    const isPrimary = url.includes('stooq');
    const isSecondary = url.includes('finance.yahoo.com');

    if (mode === 'all_fail') {
      throw new Error('snapshot_source_down');
    }

    if (mode === 'secondary_success' && isPrimary) {
      throw new Error('primary_down');
    }

    if (isPrimary) {
      const decoded = decodeURIComponent(url).toLowerCase();
      const symbolCode = decoded.includes('6758.jp') ? '6758' : '7203';
      return {
        ok: true,
        text: async () => makeCsvForSymbol(symbolCode),
      };
    }

    if (isSecondary) {
      const decoded = decodeURIComponent(url).toUpperCase();
      const isSony = decoded.includes('6758.T');
      return {
        ok: true,
        json: async () => ({
          chart: {
            result: [
              {
                meta: {
                  regularMarketPrice: isSony ? 14530 : 3412,
                  previousClose: isSony ? 14510 : 3404,
                  regularMarketVolume: isSony ? 5333000 : 11111111,
                  regularMarketTime: 1774063200,
                  marketState: 'CLOSED',
                },
              },
            ],
          },
        }),
      };
    }

    throw new Error(`unexpected_url:${url}`);
  });
}

vi.mock('../src/db', () => {
  const prisma = {
    comparisonSession: {
      findUnique: async ({ where }: any) => (where.id === 'cmp-1' ? comparisonSession : null),
    },
    comparisonResult: {
      findFirst: async () => null,
    },
    symbol: {
      findMany: async ({ where }: any) => {
        const ids = where?.id?.in ?? [];
        return symbols.filter((symbol) => ids.includes(symbol.id));
      },
    },
    alertEvent: {
      findMany: async ({ where }: any) => {
        const ids = where?.symbolId?.in;
        if (Array.isArray(ids)) return alerts.filter((alert) => ids.includes(alert.symbolId));
        return alerts;
      },
    },
    aiSummary: {
      findMany: async () => [],
      findFirst: async () => null,
    },
    researchNote: {
      findMany: async () => [],
    },
    externalReference: {
      findMany: async () => [],
    },
  };
  return { prisma };
});

import { errorHandler } from '../src/utils/response';
import { comparisonRoutes } from '../src/routes/comparisons';
import { homeRoutes } from '../src/routes/home';

async function createApp() {
  const app = Fastify({ logger: false });
  app.setErrorHandler(errorHandler);
  app.register(comparisonRoutes, { prefix: '/api/comparisons' });
  app.register(homeRoutes, { prefix: '/api/home' });
  await app.ready();
  return app;
}

function assertSnapshotShape(snapshot: any) {
  expect(snapshot).toHaveProperty('last_price');
  expect(snapshot).toHaveProperty('change');
  expect(snapshot).toHaveProperty('change_percent');
  expect(snapshot).toHaveProperty('volume');
  expect(snapshot).toHaveProperty('as_of');
  expect(snapshot).toHaveProperty('market_status');
  expect(snapshot).toHaveProperty('source_name');
}

describe('comparison/home routes current_snapshot failover', () => {
  beforeEach(() => {
    runtime = { fetchMode: 'primary_success' };
    __resetSnapshotCacheForTests();
    vi.stubGlobal('fetch', createFetchStub(runtime.fetchMode));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('comparison route: primary success', async () => {
    const app = await createApp();
    const res = await app.inject({ method: 'GET', url: '/api/comparisons/cmp-1' });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.error).toBeNull();
    const snapshots = body.data.symbols.map((item: any) => item.current_snapshot);
    expect(snapshots.every((snapshot: any) => snapshot?.source_name === 'stooq_daily')).toBe(true);
    snapshots.forEach(assertSnapshotShape);
    await app.close();
  });

  it('comparison route: primary fail + secondary success', async () => {
    vi.stubGlobal('fetch', createFetchStub('secondary_success'));
    const app = await createApp();
    const res = await app.inject({ method: 'GET', url: '/api/comparisons/cmp-1' });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.error).toBeNull();
    const snapshots = body.data.symbols.map((item: any) => item.current_snapshot);
    expect(snapshots.every((snapshot: any) => snapshot?.source_name === 'yahoo_chart')).toBe(true);
    snapshots.forEach(assertSnapshotShape);
    await app.close();
  });

  it('comparison route: all fail -> current_snapshot null', async () => {
    vi.stubGlobal('fetch', createFetchStub('all_fail'));
    const app = await createApp();
    const res = await app.inject({ method: 'GET', url: '/api/comparisons/cmp-1' });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.error).toBeNull();
    const snapshots = body.data.symbols.map((item: any) => item.current_snapshot);
    expect(snapshots.every((snapshot: any) => snapshot === null)).toBe(true);
    await app.close();
  });

  it('home route: primary success', async () => {
    const app = await createApp();
    const res = await app.inject({ method: 'GET', url: '/api/home' });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.error).toBeNull();
    expect(body.data.recent_alerts[0].current_snapshot.source_name).toBe('stooq_daily');
    assertSnapshotShape(body.data.recent_alerts[0].current_snapshot);
    expect(body.data.market_overview.indices.length).toBeGreaterThan(0);
    expect(body.data.market_overview.indices[0].price).toBeTypeOf('number');
    expect(body.data.market_overview.fx).toEqual([]);
    expect(body.data.market_overview.sectors).toEqual([]);
    await app.close();
  });

  it('home route: primary fail + secondary success', async () => {
    vi.stubGlobal('fetch', createFetchStub('secondary_success'));
    const app = await createApp();
    const res = await app.inject({ method: 'GET', url: '/api/home' });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.error).toBeNull();
    expect(body.data.recent_alerts[0].current_snapshot.source_name).toBe('yahoo_chart');
    assertSnapshotShape(body.data.recent_alerts[0].current_snapshot);
    await app.close();
  });

  it('home route: all fail keeps partial success with snapshot null', async () => {
    vi.stubGlobal('fetch', createFetchStub('all_fail'));
    const app = await createApp();
    const res = await app.inject({ method: 'GET', url: '/api/home' });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.error).toBeNull();
    expect(body.data.recent_alerts[0].current_snapshot).toBeNull();
    expect(body.data.market_overview.indices).toEqual([]);
    expect(body.data.market_overview.fx).toEqual([]);
    expect(body.data.market_overview.sectors).toEqual([]);
    expect(body.data.recent_alerts.length).toBeGreaterThan(0);
    await app.close();
  });
});
