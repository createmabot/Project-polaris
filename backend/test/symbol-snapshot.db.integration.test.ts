import Fastify from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { prisma } from '../src/db';
import { __resetSnapshotCacheForTests } from '../src/market/snapshot';
import { errorHandler } from '../src/utils/response';
import { symbolRoutes } from '../src/routes/symbols';

type FetchMode = 'primary_success' | 'secondary_success' | 'all_fail';

const TEST_SYMBOL_CODE = '7203';
const TEST_MARKET_CODE = 'TSE';

let symbolId = '';
let fetchMode: FetchMode = 'primary_success';
let dbAvailable = true;
let dbSkipReason = '';

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

describe('symbols route current_snapshot db integration', () => {
  beforeAll(async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      dbAvailable = false;
      dbSkipReason = error instanceof Error ? error.message : String(error);
      return;
    }

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
  });

  afterAll(async () => {
    if (!dbAvailable) {
      await prisma.$disconnect();
      return;
    }

    if (symbolId) {
      await prisma.symbol.deleteMany({
        where: { id: symbolId },
      });
    }
    vi.unstubAllGlobals();
    await prisma.$disconnect();
  });

  it('keeps API contract across failover cases with real DB symbol', async () => {
    if (!dbAvailable) {
      console.warn(`symbol-snapshot db integration skipped: ${dbSkipReason}`);
      return;
    }

    const app = await createApp();
    const fetchStub = createFetchStub();
    vi.stubGlobal('fetch', fetchStub);

    const scenarios: Array<{
      mode: FetchMode;
      expectedSource: string | null;
    }> = [
      { mode: 'primary_success', expectedSource: 'stooq_daily' },
      { mode: 'secondary_success', expectedSource: 'yahoo_chart' },
      { mode: 'all_fail', expectedSource: null },
    ];

    for (const scenario of scenarios) {
      fetchMode = scenario.mode;
      __resetSnapshotCacheForTests();

      const res = await app.inject({
        method: 'GET',
        url: `/api/symbols/${symbolId}`,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data).toBeTruthy();
      expect(body.meta).toBeTruthy();
      expect(body.error).toBeNull();

      if (scenario.expectedSource === null) {
        expect(body.data.current_snapshot).toBeNull();
      } else {
        expect(body.data.current_snapshot).toBeTruthy();
        assertSnapshotShape(body.data.current_snapshot);
        expect(body.data.current_snapshot.source_name).toBe(scenario.expectedSource);
      }
    }

    await app.close();
  });
});
