import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { marketDataRoutes } from '../src/routes/market-data';
import { errorHandler } from '../src/utils/response';

type Runtime = {
  symbols: Array<{
    id: string;
    symbol: string;
    symbolCode: string | null;
    displayName: string | null;
  }>;
  bars: any[];
  imports: any[];
  seq: number;
};

let runtime: Runtime;

function now() {
  return new Date('2026-06-07T00:00:00.000Z');
}

function createRuntime(): Runtime {
  return {
    symbols: [
      {
        id: 'sym-1',
        symbol: '5253',
        symbolCode: '5253',
        displayName: 'カバー',
      },
    ],
    bars: [],
    imports: [],
    seq: 1,
  };
}

function matchesBarWhere(row: any, where: any = {}) {
  if (where.symbolId && row.symbolId !== where.symbolId) return false;
  if (where.timeframe && row.timeframe !== where.timeframe) return false;
  if (where.barTime?.gte && row.barTime.getTime() < (where.barTime.gte as Date).getTime()) return false;
  if (where.barTime?.lte && row.barTime.getTime() > (where.barTime.lte as Date).getTime()) return false;
  return true;
}

vi.mock('../src/db', () => ({
  prisma: {
    symbol: {
      findUnique: async ({ where }: any) => runtime.symbols.find((symbol) => symbol.id === where.id) ?? null,
    },
    marketPriceBar: {
      findUnique: async ({ where }: any) => {
        const key = where.symbolId_timeframe_barTime_sourceType;
        return runtime.bars.find((bar) =>
          bar.symbolId === key.symbolId &&
          bar.timeframe === key.timeframe &&
          bar.barTime.getTime() === (key.barTime as Date).getTime() &&
          bar.sourceType === key.sourceType) ?? null;
      },
      upsert: async ({ where, update, create }: any) => {
        const key = where.symbolId_timeframe_barTime_sourceType;
        const index = runtime.bars.findIndex((bar) =>
          bar.symbolId === key.symbolId &&
          bar.timeframe === key.timeframe &&
          bar.barTime.getTime() === (key.barTime as Date).getTime() &&
          bar.sourceType === key.sourceType);
        if (index >= 0) {
          runtime.bars[index] = {
            ...runtime.bars[index],
            ...update,
            updatedAt: now(),
          };
          return runtime.bars[index];
        }
        const row = {
          id: `bar-${runtime.seq++}`,
          createdAt: now(),
          updatedAt: now(),
          ...create,
        };
        runtime.bars.push(row);
        return row;
      },
      findMany: async ({ where, orderBy, take }: any = {}) => {
        let rows = runtime.bars.filter((row) => matchesBarWhere(row, where));
        if (orderBy?.[0]?.barTime === 'desc') {
          rows = rows.sort((a, b) => b.barTime.getTime() - a.barTime.getTime());
        } else {
          rows = rows.sort((a, b) => a.barTime.getTime() - b.barTime.getTime());
        }
        return typeof take === 'number' ? rows.slice(0, take) : rows;
      },
    },
    marketDataImport: {
      create: async ({ data }: any) => {
        const row = {
          id: `import-${runtime.seq++}`,
          createdAt: now(),
          updatedAt: now(),
          ...data,
        };
        runtime.imports.push(row);
        return row;
      },
      findMany: async ({ where, orderBy, take }: any = {}) => {
        let rows = runtime.imports.filter((row) => {
          if (where?.symbolId && row.symbolId !== where.symbolId) return false;
          if (where?.timeframe && row.timeframe !== where.timeframe) return false;
          return true;
        });
        if (orderBy?.[0]?.createdAt === 'desc') {
          rows = rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }
        return typeof take === 'number' ? rows.slice(0, take) : rows;
      },
    },
  },
}));

async function buildApp() {
  const app = Fastify({ logger: false });
  app.setErrorHandler(errorHandler);
  await app.register(marketDataRoutes, { prefix: '/api/symbols' });
  return app;
}

describe('market data routes', () => {
  beforeEach(() => {
    runtime = createRuntime();
  });

  it('imports valid OHLCV CSV and exposes coverage and latest bars without raw CSV', async () => {
    const app = await buildApp();
    const csvText = [
      'date,open,high,low,close,volume,adjusted_close',
      '2026-01-01,100,110,95,105,1000,104',
      '2026-01-02,106,112,101,108,1500,107',
    ].join('\n');
    const res = await app.inject({
      method: 'POST',
      url: '/api/symbols/sym-1/market-data/import-csv',
      payload: {
        timeframe: 'D',
        source_name: 'manual',
        file_name: 'cover_daily.csv',
        csv_text: csvText,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.import.row_count).toBe(2);
    expect(body.data.import.inserted_count).toBe(2);
    expect(body.data.import.updated_count).toBe(0);
    expect(body.data.coverage.bar_count).toBe(2);
    expect(body.data.coverage.period_from).toBe('2026-01-01T00:00:00.000Z');
    expect(body.data.coverage.latest_bar_time).toBe('2026-01-02T00:00:00.000Z');
    expect(JSON.stringify(body)).not.toContain(csvText);
    expect(JSON.stringify(runtime.imports)).not.toContain(csvText);

    const coverageRes = await app.inject({
      method: 'GET',
      url: '/api/symbols/sym-1/market-data/coverage?timeframe=D',
    });
    expect(coverageRes.statusCode).toBe(200);
    const coverageBody = JSON.parse(coverageRes.body);
    expect(coverageBody.data.symbol.symbol_code).toBe('5253');
    expect(coverageBody.data.coverage[0].bar_count).toBe(2);
    expect(coverageBody.data.coverage[0].adjusted_count).toBe(2);
    expect(coverageBody.data.meta.internal_backtest_ready).toBe(false);

    const barsRes = await app.inject({
      method: 'GET',
      url: '/api/symbols/sym-1/market-data/bars?timeframe=D&limit=1',
    });
    expect(barsRes.statusCode).toBe(200);
    const barsBody = JSON.parse(barsRes.body);
    expect(barsBody.data.bars).toHaveLength(1);
    expect(barsBody.data.bars[0].bar_time).toBe('2026-01-02T00:00:00.000Z');
    expect(barsBody.data.bars[0].close).toBe(108);
    expect(barsBody.data.pagination.has_next).toBe(true);
  });

  it('normalizes 1D to D, skips invalid rows, and upserts duplicate bars', async () => {
    const app = await buildApp();
    const first = await app.inject({
      method: 'POST',
      url: '/api/symbols/sym-1/market-data/import-csv',
      payload: {
        timeframe: '1D',
        csv_text: [
          '日付,始値,高値,安値,終値,出来高',
          '2026-01-01,100,110,95,105,1000',
          'bad-date,100,110,95,105,1000',
        ].join('\n'),
      },
    });
    expect(first.statusCode).toBe(200);
    const firstBody = JSON.parse(first.body);
    expect(firstBody.data.import.timeframe).toBe('D');
    expect(firstBody.data.import.inserted_count).toBe(1);
    expect(firstBody.data.import.skipped_count).toBe(1);

    const second = await app.inject({
      method: 'POST',
      url: '/api/symbols/sym-1/market-data/import-csv',
      payload: {
        timeframe: 'D',
        csv_text: [
          'date,open,high,low,close,volume',
          '2026-01-01,101,111,96,106,2000',
        ].join('\n'),
      },
    });
    expect(second.statusCode).toBe(200);
    const secondBody = JSON.parse(second.body);
    expect(secondBody.data.import.inserted_count).toBe(0);
    expect(secondBody.data.import.updated_count).toBe(1);
    expect(runtime.bars).toHaveLength(1);
    expect(runtime.bars[0].close.toNumber()).toBe(106);
  });

  it('rejects unsupported timeframe and missing required headers with safe errors', async () => {
    const app = await buildApp();
    const timeframeRes = await app.inject({
      method: 'POST',
      url: '/api/symbols/sym-1/market-data/import-csv',
      payload: {
        timeframe: '4H',
        csv_text: 'date,open,high,low,close\n2026-01-01,1,2,1,2',
      },
    });
    expect(timeframeRes.statusCode).toBe(400);
    expect(timeframeRes.body).toContain('timeframe must be D');

    const headerRes = await app.inject({
      method: 'POST',
      url: '/api/symbols/sym-1/market-data/import-csv',
      payload: {
        timeframe: 'D',
        csv_text: 'date,open,high,close\n2026-01-01,1,2,2',
      },
    });
    expect(headerRes.statusCode).toBe(400);
    const serialized = headerRes.body;
    expect(serialized).toContain('low column is required');
    expect(serialized).not.toContain('token');
    expect(serialized).not.toContain('stack');
    expect(serialized).not.toContain('C:\\');
  });
});
