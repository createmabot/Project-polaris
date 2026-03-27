import Fastify from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { prisma } from '../src/db';
import { __resetSnapshotCacheForTests } from '../src/market/snapshot';
import { errorHandler } from '../src/utils/response';
import { symbolRoutes } from '../src/routes/symbols';

type FetchMode = 'primary_success' | 'secondary_success' | 'secondary_stale_open' | 'all_fail';

const TEST_SYMBOL_CODE = '7203';
const TEST_MARKET_CODE = 'TSE';

let fetchMode: FetchMode = 'primary_success';
let symbolId = '';

function createFetchStub() {
  return vi.fn(async (input: string | URL) => {
    const url = String(input);
    const isPrimary = url.includes('stooq');
    const isSecondary = url.includes('finance.yahoo.com');

    if (fetchMode === 'all_fail') {
      throw new Error('snapshot_source_down');
    }

    if (fetchMode === 'secondary_success' && isPrimary) {
      throw new Error('primary_down');
    }
    if (fetchMode === 'secondary_stale_open' && isPrimary) {
      throw new Error('primary_down');
    }

    if (isPrimary) {
      return {
        ok: true,
        text: async () => [
          'Date,Open,High,Low,Close,Volume',
          '2026-03-20,0,0,0,3359,10000000',
          '2026-03-21,0,0,0,3404,15583800',
        ].join('\n'),
      };
    }

    if (isSecondary) {
      const staleEpoch = Math.floor((Date.now() - 40 * 60 * 1000) / 1000);
      if (fetchMode === 'secondary_stale_open') {
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
                    regularMarketTime: staleEpoch,
                    marketState: 'REGULAR',
                  },
                },
              ],
            },
          }),
        };
      }
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

async function createApp() {
  const app = Fastify({ logger: false });
  app.setErrorHandler(errorHandler);
  app.register(symbolRoutes, { prefix: '/api/symbols' });
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

function toMetricDateJst(now: Date): Date {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(jst.getUTCDate()).padStart(2, '0');
  return new Date(`${y}-${m}-${d}T00:00:00+09:00`);
}

async function waitForReasonMetricCount(input: {
  metricDate: Date;
  sourceName: string;
  reasonCode: string;
  expectedCount: number;
  timeoutMs?: number;
  intervalMs?: number;
}) {
  const timeoutMs = input.timeoutMs ?? 1500;
  const intervalMs = input.intervalMs ?? 50;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const metric = await prisma.snapshotReasonDailyMetric.findUnique({
      where: {
        metricDate_sourceName_reasonCode: {
          metricDate: input.metricDate,
          sourceName: input.sourceName,
          reasonCode: input.reasonCode,
        },
      },
    });

    if (metric?.count === input.expectedCount) {
      return metric;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return prisma.snapshotReasonDailyMetric.findUnique({
    where: {
      metricDate_sourceName_reasonCode: {
        metricDate: input.metricDate,
        sourceName: input.sourceName,
        reasonCode: input.reasonCode,
      },
    },
  });
}

describe('symbols route current_snapshot db integration', () => {
  beforeAll(async () => {
    await prisma.$queryRaw`SELECT 1`;
    const unique = randomUUID().slice(0, 8);
    const created = await prisma.symbol.create({
      data: {
        symbol: `it-snapshot-${unique}`,
        symbolCode: TEST_SYMBOL_CODE,
        marketCode: TEST_MARKET_CODE,
        displayName: 'Integration Snapshot Symbol',
        tradingviewSymbol: `TSE:${TEST_SYMBOL_CODE}-${unique}`,
      },
    });
    symbolId = created.id;
    await prisma.snapshotReasonDailyMetric.deleteMany({
      where: {
        sourceName: 'yahoo_chart',
      },
    });
  });

  afterAll(async () => {
    if (symbolId) {
      await prisma.symbol.deleteMany({
        where: { id: symbolId },
      });
    }
    await prisma.snapshotReasonDailyMetric.deleteMany({
      where: {
        sourceName: 'yahoo_chart',
      },
    });
    vi.unstubAllGlobals();
    await prisma.$disconnect();
  });

  it.each([
    { mode: 'primary_success' as const, expectedSource: 'stooq_daily' as const },
    { mode: 'secondary_success' as const, expectedSource: 'yahoo_chart' as const },
    { mode: 'all_fail' as const, expectedSource: null },
  ])(
    'keeps API contract for failover case: $mode',
    async ({ mode, expectedSource }) => {
      fetchMode = mode;
      __resetSnapshotCacheForTests();

    const app = await createApp();
    const fetchStub = createFetchStub();
    vi.stubGlobal('fetch', fetchStub);
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/api/symbols/${symbolId}`,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data).toBeTruthy();
      expect(body.meta).toBeTruthy();
      expect(body.error).toBeNull();

      if (expectedSource === null) {
        expect(body.data.current_snapshot).toBeNull();
      } else {
        expect(body.data.current_snapshot).toBeTruthy();
        assertSnapshotShape(body.data.current_snapshot);
        expect(body.data.current_snapshot.source_name).toBe(expectedSource);
      }
    } finally {
      await app.close();
    }
  });

  it('increments same-day reason metric for same source + reason_code', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-18T01:00:00.000Z')); // 10:00 JST
    fetchMode = 'secondary_stale_open';
    __resetSnapshotCacheForTests();
    const metricDate = toMetricDateJst(new Date());

    await prisma.snapshotReasonDailyMetric.deleteMany({
      where: {
        metricDate,
        sourceName: 'yahoo_chart',
        reasonCode: 'open_but_stale',
      },
    });

    const app = await createApp();
    vi.stubGlobal('fetch', createFetchStub());
    try {
      const res1 = await app.inject({
        method: 'GET',
        url: `/api/symbols/${symbolId}`,
      });
      expect(res1.statusCode).toBe(200);

      __resetSnapshotCacheForTests();
      const res2 = await app.inject({
        method: 'GET',
        url: `/api/symbols/${symbolId}`,
      });
      expect(res2.statusCode).toBe(200);
    } finally {
      await app.close();
      vi.useRealTimers();
    }

    const metric = await waitForReasonMetricCount({
      metricDate,
      sourceName: 'yahoo_chart',
      reasonCode: 'open_but_stale',
      expectedCount: 2,
    });

    expect(metric).toBeTruthy();
    expect(metric?.count).toBe(2);
  });
});
