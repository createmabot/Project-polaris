import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetSnapshotCacheForTests, getCurrentSnapshotForSymbol } from '../src/market/snapshot';

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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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
                  regularMarketTime: 1774063200,
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
});
