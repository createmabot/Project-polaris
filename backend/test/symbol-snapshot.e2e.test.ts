import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetSnapshotCacheForTests } from '../src/market/snapshot';

type RuntimeState = {
  fetchMode: 'primary_success' | 'secondary_success' | 'all_fail';
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
];

const makeCsv = (closeYesterday: number, closeToday: number, volumeToday: number) => [
  'Date,Open,High,Low,Close,Volume',
  `2026-03-20,0,0,0,${closeYesterday},10000000`,
  `2026-03-21,0,0,0,${closeToday},${volumeToday}`,
].join('\n');

function createFetchStub(mode: RuntimeState['fetchMode']) {
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
      return {
        ok: true,
        text: async () => makeCsv(3359, 3404, 15583800),
      };
    }

    if (isSecondary) {
      return {
        ok: true,
        json: async () => ({
          chart: {
            result: [
              {
                meta: {
                  regularMarketPrice: 3412,
                  previousClose: 3404,
                  regularMarketVolume: 11111111,
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
    symbol: {
      findUnique: async ({ where }: any) => symbols.find((s) => s.id === where.id) ?? null,
    },
    alertEvent: {
      findMany: async () => [],
    },
    aiSummary: {
      findMany: async () => [],
      findFirst: async () => null,
    },
    externalReference: {
      findMany: async () => [],
    },
    researchNote: {
      findFirst: async () => null,
    },
  };

  return { prisma };
});

import { errorHandler } from '../src/utils/response';
import { symbolRoutes } from '../src/routes/symbols';

async function createApp() {
  const app = Fastify({ logger: false });
  app.setErrorHandler(errorHandler);
  app.register(symbolRoutes, { prefix: '/api/symbols' });
  await app.ready();
  return app;
}

describe('symbols route current_snapshot failover', () => {
  beforeEach(() => {
    runtime = { fetchMode: 'primary_success' };
    __resetSnapshotCacheForTests();
    vi.stubGlobal('fetch', createFetchStub(runtime.fetchMode));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns snapshot with primary source', async () => {
    const app = await createApp();
    const res = await app.inject({ method: 'GET', url: '/api/symbols/sym-1' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.error).toBeNull();
    expect(body.data.current_snapshot).toBeTruthy();
    expect(body.data.current_snapshot.source_name).toBe('stooq_daily');
    await app.close();
  });

  it('returns snapshot with secondary source when primary fails', async () => {
    vi.stubGlobal('fetch', createFetchStub('secondary_success'));
    const app = await createApp();
    const res = await app.inject({ method: 'GET', url: '/api/symbols/sym-1' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.error).toBeNull();
    expect(body.data.current_snapshot).toBeTruthy();
    expect(body.data.current_snapshot.source_name).toBe('yahoo_chart');
    expect(body.data.current_snapshot.last_price).toBe(3412);
    await app.close();
  });

  it('keeps 200 response and returns current_snapshot=null when all sources fail', async () => {
    vi.stubGlobal('fetch', createFetchStub('all_fail'));
    const app = await createApp();
    const res = await app.inject({ method: 'GET', url: '/api/symbols/sym-1' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.error).toBeNull();
    expect(body.data.current_snapshot).toBeNull();
    await app.close();
  });
});
