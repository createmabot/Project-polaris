import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type RuntimeState = {
  snapshotMode: 'success' | 'fail';
};

let runtime: RuntimeState;

vi.mock('../src/db', () => {
  const prisma = {
    symbol: {
      findUnique: async ({ where }: any) => {
        if (where.id !== 'sym-1') return null;
        return {
          id: 'sym-1',
          symbol: '7203',
          symbolCode: '7203',
          displayName: 'トヨタ自動車',
          marketCode: 'TSE',
          tradingviewSymbol: 'TSE:7203',
        };
      },
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

vi.mock('../src/market/snapshot', () => {
  return {
    getCurrentSnapshotForSymbol: async () => {
      if (runtime.snapshotMode === 'fail') return null;
      return {
        last_price: 3404,
        change: 45,
        change_percent: 1.34,
        volume: 15583800,
        as_of: '2026-03-21T06:00:00.000Z',
        market_status: 'closed',
        source_name: 'test_stub',
      };
    },
  };
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

describe('symbols route current_snapshot', () => {
  beforeEach(() => {
    runtime = { snapshotMode: 'success' };
  });

  it('returns current_snapshot on success', async () => {
    const app = await createApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/symbols/sym-1',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.current_snapshot).toBeTruthy();
    expect(body.data.current_snapshot.last_price).toBe(3404);
    expect(body.data.current_snapshot.market_status).toBe('closed');
    await app.close();
  });

  it('keeps API alive with current_snapshot=null when source fails', async () => {
    runtime.snapshotMode = 'fail';
    const app = await createApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/symbols/sym-1',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.current_snapshot).toBeNull();
    expect(body.error).toBeNull();
    await app.close();
  });
});
