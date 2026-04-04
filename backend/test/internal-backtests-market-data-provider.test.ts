import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createInternalBacktestMarketDataProvider,
  InternalBacktestProviderUnavailableError,
  StooqDailyInternalBacktestMarketDataProvider,
  StubInternalBacktestMarketDataProvider,
} from '../src/internal-backtests/market-data-provider';

describe('internal backtest market data provider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('selects stub provider when mode is stub', () => {
    const provider = createInternalBacktestMarketDataProvider('stub');
    expect(provider).toBeInstanceOf(StubInternalBacktestMarketDataProvider);
  });

  it('selects stooq provider when mode is stooq', () => {
    const provider = createInternalBacktestMarketDataProvider('stooq');
    expect(provider).toBeInstanceOf(StooqDailyInternalBacktestMarketDataProvider);
  });

  it('fetches and filters JP_STOCK daily bars from stooq csv', async () => {
    const csv = [
      'Date,Open,High,Low,Close,Volume',
      '2024-01-01,100,110,90,105,1000',
      '2024-01-02,106,112,102,110,1200',
      '2024-01-03,109,115,108,114,1300',
    ].join('\n');

    const fetchMock = vi.fn(async () => new Response(csv, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = new StooqDailyInternalBacktestMarketDataProvider();
    const result = await provider.fetchDailyOhlcv({
      symbol: '7203',
      market: 'JP_STOCK',
      timeframe: 'D',
      from: '2024-01-02',
      to: '2024-01-03',
      source_kind: 'daily_ohlcv',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('stooq.com');
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('7203.jp');
    expect(result.bars).toHaveLength(2);
    expect(result.bars[0]?.timestamp).toBe('2024-01-02T00:00:00.000Z');
    expect(result.bars[1]?.close).toBe(114);
    expect(result.data_revision).toContain('stooq-daily-v1:7203.jp:2024-01-03');
  });

  it('returns empty bars when range has no rows', async () => {
    const csv = [
      'Date,Open,High,Low,Close,Volume',
      '2024-01-01,100,110,90,105,1000',
    ].join('\n');

    vi.stubGlobal('fetch', vi.fn(async () => new Response(csv, { status: 200 })));

    const provider = new StooqDailyInternalBacktestMarketDataProvider();
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
    vi.stubGlobal('fetch', vi.fn(async () => new Response('upstream error', { status: 503 })));
    const provider = new StooqDailyInternalBacktestMarketDataProvider();

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
      expect(e.providerName).toBe('stooq');
      expect(e.details?.http_status).toBe(503);
    }
  });

  it('classifies network exception as provider_network_error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('fetch failed');
    }));
    const provider = new StooqDailyInternalBacktestMarketDataProvider();

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
      providerName: 'stooq',
    });
  });

  it('classifies invalid csv response as provider_parse_error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('invalid_csv_payload', { status: 200 })));
    const provider = new StooqDailyInternalBacktestMarketDataProvider();

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
      providerName: 'stooq',
    });
  });
});
