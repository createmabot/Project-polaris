import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createInternalBacktestMarketDataProvider,
  InternalBacktestProviderUnavailableError,
  StooqDailyInternalBacktestMarketDataProvider,
  StubInternalBacktestMarketDataProvider,
  YahooDailyInternalBacktestMarketDataProvider,
} from '../src/internal-backtests/market-data-provider';

describe('internal backtest market data provider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('selects stub provider when mode is stub', () => {
    const provider = createInternalBacktestMarketDataProvider('stub');
    expect(provider).toBeInstanceOf(StubInternalBacktestMarketDataProvider);
  });

  it('selects yahoo provider when mode is yahoo', () => {
    const provider = createInternalBacktestMarketDataProvider('yahoo');
    expect(provider).toBeInstanceOf(YahooDailyInternalBacktestMarketDataProvider);
  });

  it('keeps stooq provider selectable for explicit compatibility mode', () => {
    const provider = createInternalBacktestMarketDataProvider('stooq');
    expect(provider).toBeInstanceOf(StooqDailyInternalBacktestMarketDataProvider);
  });

  it('fetches and filters JP_STOCK daily bars from yahoo chart', async () => {
    const body = {
      chart: {
        result: [
          {
            timestamp: [1704067200, 1704153600, 1704240000],
            indicators: {
              quote: [
                {
                  open: [100, 106, null],
                  high: [110, 112, null],
                  low: [90, 102, null],
                  close: [105, 110, null],
                  volume: [1000, 1200, null],
                },
              ],
            },
          },
        ],
        error: null,
      },
    };

    const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = new YahooDailyInternalBacktestMarketDataProvider();
    const result = await provider.fetchDailyOhlcv({
      symbol: '7203',
      market: 'JP_STOCK',
      timeframe: 'D',
      from: '2024-01-01',
      to: '2024-01-03',
      source_kind: 'daily_ohlcv',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('query1.finance.yahoo.com');
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('7203.T');
    expect(result.bars).toHaveLength(2);
    expect(result.bars[0]?.timestamp).toBe('2024-01-01T00:00:00.000Z');
    expect(result.bars[1]?.close).toBe(110);
    expect(result.data_revision).toContain('yahoo-chart-v8:7203.T:2024-01-02');
  });

  it('returns empty bars when range has no rows', async () => {
    const body = {
      chart: {
        result: [
          {
            timestamp: [1704067200],
            indicators: {
              quote: [
                {
                  open: [100],
                  high: [110],
                  low: [90],
                  close: [105],
                  volume: [1000],
                },
              ],
            },
          },
        ],
        error: null,
      },
    };

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })));

    const provider = new YahooDailyInternalBacktestMarketDataProvider();
    const result = await provider.fetchDailyOhlcv({
      symbol: '7203',
      market: 'JP_STOCK',
      timeframe: 'D',
      from: '2024-02-01',
      to: '2024-02-10',
      source_kind: 'daily_ohlcv',
    });

    expect(result.bars).toHaveLength(0);
    expect(result.data_revision).toContain('2024-02-10');
  });

  it('throws provider unavailable on non-200 response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('too many requests', { status: 429 })));
    const provider = new YahooDailyInternalBacktestMarketDataProvider();

    try {
      await provider.fetchDailyOhlcv({
        symbol: '7203',
        market: 'JP_STOCK',
        timeframe: 'D',
        from: '2024-01-01',
        to: '2024-01-02',
        source_kind: 'daily_ohlcv',
      });
      throw new Error('expected provider to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(InternalBacktestProviderUnavailableError);
      const e = error as InternalBacktestProviderUnavailableError;
      expect(e.reasonCode).toBe('provider_http_error');
      expect(e.providerName).toBe('yahoo_chart');
      expect(e.details?.http_status).toBe(429);
    }
  });

  it('classifies network exception as provider_network_error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('fetch failed');
    }));
    const provider = new YahooDailyInternalBacktestMarketDataProvider();

    await expect(
      provider.fetchDailyOhlcv({
        symbol: '7203',
        market: 'JP_STOCK',
        timeframe: 'D',
        from: '2024-01-01',
        to: '2024-01-02',
        source_kind: 'daily_ohlcv',
      }),
    ).rejects.toMatchObject({
      reasonCode: 'provider_network_error',
      providerName: 'yahoo_chart',
    });
  });

  it('classifies invalid json response as provider_parse_error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not_json', { status: 200 })));
    const provider = new YahooDailyInternalBacktestMarketDataProvider();

    await expect(
      provider.fetchDailyOhlcv({
        symbol: '7203',
        market: 'JP_STOCK',
        timeframe: 'D',
        from: '2024-01-01',
        to: '2024-01-02',
        source_kind: 'daily_ohlcv',
      }),
    ).rejects.toMatchObject({
      reasonCode: 'provider_parse_error',
      providerName: 'yahoo_chart',
    });
  });
});
