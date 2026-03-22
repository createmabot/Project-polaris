import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetSnapshotCacheForTests, getCurrentSnapshotForSymbol } from '../src/market/snapshot';
import { prisma } from '../src/db';

const symbol = {
  id: 'sym-1',
  symbol: '7203',
  symbolCode: '7203',
  marketCode: 'TSE',
  tradingviewSymbol: 'TSE:7203',
};

describe('current_snapshot failover', () => {
  beforeEach(() => {
    __resetSnapshotCacheForTests();
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.spyOn(prisma.snapshotReasonDailyMetric, 'upsert').mockResolvedValue({
      id: 'metric-1',
      metricDate: new Date('2026-03-18T00:00:00+09:00'),
      sourceName: 'yahoo_chart',
      reasonCode: 'open_but_stale',
      count: 1,
      createdAt: new Date('2026-03-18T00:00:00Z'),
      updatedAt: new Date('2026-03-18T00:00:00Z'),
    } as any);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('uses primary provider when stooq succeeds', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () => [
          'Date,Open,High,Low,Close,Volume',
          '2026-03-20,3300,3360,3290,3340,12000000',
          '2026-03-21,3340,3410,3330,3404,15583800',
        ].join('\n'),
      });

    vi.stubGlobal('fetch', fetchMock);

    const snapshot = await getCurrentSnapshotForSymbol(symbol);

    expect(snapshot).not.toBeNull();
    expect(snapshot?.source_name).toBe('stooq_daily');
    expect(snapshot?.last_price).toBe(3404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails over to secondary provider when primary fails', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('primary_down'))
      .mockResolvedValueOnce({
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
      });

    vi.stubGlobal('fetch', fetchMock);

    const snapshot = await getCurrentSnapshotForSymbol(symbol);

    expect(snapshot).not.toBeNull();
    expect(snapshot?.source_name).toBe('yahoo_chart');
    expect(snapshot?.last_price).toBe(3412);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns null when both providers fail', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('primary_down'))
      .mockRejectedValueOnce(new Error('secondary_down'));

    vi.stubGlobal('fetch', fetchMock);

    const snapshot = await getCurrentSnapshotForSymbol(symbol);

    expect(snapshot).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reflects provider name in source_name', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-21T01:00:00.000Z')); // 10:00 JST

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          chart: {
            result: [
              {
                meta: {
                  regularMarketPrice: 3500,
                  chartPreviousClose: 3400,
                  regularMarketVolume: 12345678,
                  regularMarketTime: 1774063200, // 2026-03-21T03:20:00Z
                  marketState: 'REGULAR',
                },
              },
            ],
          },
        }),
      });

    vi.stubGlobal('fetch', fetchMock);
    const snapshot = await getCurrentSnapshotForSymbol(symbol);

    expect(snapshot?.source_name).toBe('yahoo_chart');
    expect(snapshot?.market_status).toBe('unknown');
  });

  it('marks stooq daily snapshot as closed when fresh', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-21T08:00:00.000Z')); // 17:00 JST

    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      text: async () => [
        'Date,Open,High,Low,Close,Volume',
        '2026-03-20,3300,3360,3290,3340,12000000',
        '2026-03-21,3340,3410,3330,3404,15583800',
      ].join('\n'),
    });

    vi.stubGlobal('fetch', fetchMock);

    const snapshot = await getCurrentSnapshotForSymbol(symbol);
    expect(snapshot?.source_name).toBe('stooq_daily');
    expect(snapshot?.market_status).toBe('closed');
  });

  it('marks stale yahoo open state as unknown', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-21T01:00:00.000Z')); // 10:00 JST

    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('primary_down'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          chart: {
            result: [
              {
                meta: {
                  regularMarketPrice: 3412,
                  previousClose: 3404,
                  regularMarketVolume: 11111111,
                  regularMarketTime: 1774056000, // 2026-03-21T01:20:00Z (40 min stale)
                  marketState: 'REGULAR',
                },
              },
            ],
          },
        }),
      });

    vi.stubGlobal('fetch', fetchMock);

    const snapshot = await getCurrentSnapshotForSymbol(symbol);
    expect(snapshot?.source_name).toBe('yahoo_chart');
    expect(snapshot?.market_status).toBe('unknown');
  });

  it('logs reason_code=open_but_stale for yahoo regular stale snapshot', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-18T01:00:00.000Z')); // 10:00 JST (Wednesday)

    const staleEpochSec = Math.floor((Date.now() - 40 * 60 * 1000) / 1000); // 40 min stale
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('primary_down'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          chart: {
            result: [
              {
                meta: {
                  regularMarketPrice: 3412,
                  previousClose: 3404,
                  regularMarketVolume: 11111111,
                  regularMarketTime: staleEpochSec,
                  marketState: 'REGULAR',
                },
              },
            ],
          },
        }),
      });

    const warn = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await getCurrentSnapshotForSymbol(symbol, { warn });

    const statusLog = warn.mock.calls.find((call) => call[1] === 'current_snapshot_status_evaluated');
    expect(statusLog).toBeTruthy();
    expect(statusLog?.[0]).toMatchObject({
      source_name: 'yahoo_chart',
      market_status_candidate: 'open',
      freshness_status: 'stale',
      market_status: 'unknown',
      reason_code: 'open_but_stale',
    });
    expect(prisma.snapshotReasonDailyMetric.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          sourceName: 'yahoo_chart',
          reasonCode: 'open_but_stale',
        }),
      })
    );
  });

  it('does not emit threshold warning when open_but_stale is below threshold', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-18T01:00:00.000Z')); // 10:00 JST (Wednesday)
    vi.spyOn(prisma.snapshotReasonDailyMetric, 'upsert').mockResolvedValueOnce({
      id: 'metric-below',
      metricDate: new Date('2026-03-18T00:00:00+09:00'),
      sourceName: 'yahoo_chart',
      reasonCode: 'open_but_stale',
      count: 19,
      createdAt: new Date('2026-03-18T00:00:00Z'),
      updatedAt: new Date('2026-03-18T00:00:00Z'),
    } as any);

    const warn = vi.fn();
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('primary_down'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          chart: {
            result: [
              {
                meta: {
                  regularMarketPrice: 3412,
                  previousClose: 3404,
                  regularMarketVolume: 11111111,
                  regularMarketTime: Math.floor((Date.now() - 40 * 60 * 1000) / 1000),
                  marketState: 'REGULAR',
                },
              },
            ],
          },
        }),
      });
    vi.stubGlobal('fetch', fetchMock);
    await getCurrentSnapshotForSymbol(symbol, { warn });

    const thresholdLog = warn.mock.calls.find((call) => call[1] === 'snapshot_reason_threshold_exceeded');
    expect(thresholdLog).toBeUndefined();
  });

  it('emits threshold warning when open_but_stale reaches threshold', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-18T01:00:00.000Z')); // 10:00 JST (Wednesday)
    vi.spyOn(prisma.snapshotReasonDailyMetric, 'upsert').mockResolvedValueOnce({
      id: 'metric-threshold',
      metricDate: new Date('2026-03-18T00:00:00+09:00'),
      sourceName: 'yahoo_chart',
      reasonCode: 'open_but_stale',
      count: 20,
      createdAt: new Date('2026-03-18T00:00:00Z'),
      updatedAt: new Date('2026-03-18T00:00:00Z'),
    } as any);

    const warn = vi.fn();
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('primary_down'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          chart: {
            result: [
              {
                meta: {
                  regularMarketPrice: 3412,
                  previousClose: 3404,
                  regularMarketVolume: 11111111,
                  regularMarketTime: Math.floor((Date.now() - 40 * 60 * 1000) / 1000),
                  marketState: 'REGULAR',
                },
              },
            ],
          },
        }),
      });
    vi.stubGlobal('fetch', fetchMock);
    await getCurrentSnapshotForSymbol(symbol, { warn });

    const thresholdLog = warn.mock.calls.find((call) => call[1] === 'snapshot_reason_threshold_exceeded');
    expect(thresholdLog).toBeTruthy();
    expect(thresholdLog?.[0]).toMatchObject({
      source_name: 'yahoo_chart',
      reason_code: 'open_but_stale',
      count: 20,
      threshold: 20,
      event_name: 'snapshot_reason_threshold_exceeded',
    });
  });

  it('marks expired yahoo open state as unknown', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-21T01:00:00.000Z')); // 10:00 JST

    const expiredEpochSec = Math.floor(new Date('2026-03-10T01:00:00.000Z').getTime() / 1000); // > 7 days old
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('primary_down'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          chart: {
            result: [
              {
                meta: {
                  regularMarketPrice: 3412,
                  previousClose: 3404,
                  regularMarketVolume: 11111111,
                  regularMarketTime: expiredEpochSec,
                  marketState: 'REGULAR',
                },
              },
            ],
          },
        }),
      });

    vi.stubGlobal('fetch', fetchMock);

    const snapshot = await getCurrentSnapshotForSymbol(symbol);
    expect(snapshot?.source_name).toBe('yahoo_chart');
    expect(snapshot?.market_status).toBe('unknown');
  });

  it('logs reason_code=freshness_invalid for future yahoo timestamp', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-21T01:00:00.000Z')); // 10:00 JST

    const futureEpochSec = Math.floor(new Date('2026-03-21T02:00:00.000Z').getTime() / 1000); // +1h in future
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('primary_down'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          chart: {
            result: [
              {
                meta: {
                  regularMarketPrice: 3412,
                  previousClose: 3404,
                  regularMarketVolume: 11111111,
                  regularMarketTime: futureEpochSec,
                  marketState: 'REGULAR',
                },
              },
            ],
          },
        }),
      });

    const warn = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await getCurrentSnapshotForSymbol(symbol, { warn });

    const statusLog = warn.mock.calls.find((call) => call[1] === 'current_snapshot_status_evaluated');
    expect(statusLog).toBeTruthy();
    expect(statusLog?.[0]).toMatchObject({
      source_name: 'yahoo_chart',
      freshness_status: 'invalid',
      market_status: 'unknown',
      reason_code: 'freshness_invalid',
    });
    expect(prisma.snapshotReasonDailyMetric.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          sourceName: 'yahoo_chart',
          reasonCode: 'freshness_invalid',
        }),
      })
    );
  });

  it('logs reason_code=freshness_expired for expired yahoo timestamp', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-21T01:00:00.000Z')); // 10:00 JST

    const expiredEpochSec = Math.floor(new Date('2026-03-10T01:00:00.000Z').getTime() / 1000); // > 7 days old
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('primary_down'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          chart: {
            result: [
              {
                meta: {
                  regularMarketPrice: 3412,
                  previousClose: 3404,
                  regularMarketVolume: 11111111,
                  regularMarketTime: expiredEpochSec,
                  marketState: 'REGULAR',
                },
              },
            ],
          },
        }),
      });

    const warn = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await getCurrentSnapshotForSymbol(symbol, { warn });

    const statusLog = warn.mock.calls.find((call) => call[1] === 'current_snapshot_status_evaluated');
    expect(statusLog).toBeTruthy();
    expect(statusLog?.[0]).toMatchObject({
      source_name: 'yahoo_chart',
      freshness_status: 'expired',
      market_status: 'unknown',
      reason_code: 'freshness_expired',
    });
    expect(prisma.snapshotReasonDailyMetric.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          sourceName: 'yahoo_chart',
          reasonCode: 'freshness_expired',
        }),
      })
    );
  });

  it('marks fresh yahoo REGULAR as open during JP trading session on a non-holiday weekday', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-18T01:00:00.000Z')); // 10:00 JST (Wednesday)

    const freshEpochSec = Math.floor(new Date('2026-03-18T00:55:00.000Z').getTime() / 1000); // 09:55 JST
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('primary_down'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          chart: {
            result: [
              {
                meta: {
                  regularMarketPrice: 3412,
                  previousClose: 3404,
                  regularMarketVolume: 11111111,
                  regularMarketTime: freshEpochSec,
                  marketState: 'REGULAR',
                },
              },
            ],
          },
        }),
      });

    vi.stubGlobal('fetch', fetchMock);

    const snapshot = await getCurrentSnapshotForSymbol(symbol);
    expect(snapshot?.source_name).toBe('yahoo_chart');
    expect(snapshot?.market_status).toBe('open');
  });

  it('marks yahoo REGULAR as closed on JP market holiday', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T01:00:00.000Z')); // 10:00 JST (New Year holiday)

    const freshEpochSec = Math.floor(new Date('2026-01-01T00:55:00.000Z').getTime() / 1000); // 09:55 JST
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('primary_down'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          chart: {
            result: [
              {
                meta: {
                  regularMarketPrice: 3412,
                  previousClose: 3404,
                  regularMarketVolume: 11111111,
                  regularMarketTime: freshEpochSec,
                  marketState: 'REGULAR',
                },
              },
            ],
          },
        }),
      });

    const warn = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const snapshot = await getCurrentSnapshotForSymbol(symbol, { warn });
    expect(snapshot?.source_name).toBe('yahoo_chart');
    expect(snapshot?.market_status).toBe('closed');
    const statusLog = warn.mock.calls.find((call) => call[1] === 'current_snapshot_status_evaluated');
    expect(statusLog?.[0]).toMatchObject({
      source_name: 'yahoo_chart',
      reason_code: 'jp_market_holiday',
      market_status: 'closed',
    });
    expect(prisma.snapshotReasonDailyMetric.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          sourceName: 'yahoo_chart',
          reasonCode: 'jp_market_holiday',
        }),
      })
    );
  });

  it('does not fail snapshot response when metrics persistence fails', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-18T01:00:00.000Z')); // 10:00 JST

    vi.spyOn(prisma.snapshotReasonDailyMetric, 'upsert').mockRejectedValueOnce(new Error('metric_write_failed'));
    const warn = vi.fn();
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('primary_down'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          chart: {
            result: [
              {
                meta: {
                  regularMarketPrice: 3412,
                  previousClose: 3404,
                  regularMarketVolume: 11111111,
                  regularMarketTime: Math.floor((Date.now() - 40 * 60 * 1000) / 1000),
                  marketState: 'REGULAR',
                },
              },
            ],
          },
        }),
      });

    vi.stubGlobal('fetch', fetchMock);
    const snapshot = await getCurrentSnapshotForSymbol(symbol, { warn });
    expect(snapshot?.source_name).toBe('yahoo_chart');
    expect(snapshot?.market_status).toBe('unknown');
  });

  it('marks yahoo REGULAR as closed on weekend for JP market', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-22T01:00:00.000Z')); // 10:00 JST (Sunday)

    const freshEpochSec = Math.floor(new Date('2026-03-22T00:55:00.000Z').getTime() / 1000); // 09:55 JST
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('primary_down'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          chart: {
            result: [
              {
                meta: {
                  regularMarketPrice: 3412,
                  previousClose: 3404,
                  regularMarketVolume: 11111111,
                  regularMarketTime: freshEpochSec,
                  marketState: 'REGULAR',
                },
              },
            ],
          },
        }),
      });

    vi.stubGlobal('fetch', fetchMock);

    const snapshot = await getCurrentSnapshotForSymbol(symbol);
    expect(snapshot?.source_name).toBe('yahoo_chart');
    expect(snapshot?.market_status).toBe('closed');
  });
});
