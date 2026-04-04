import { describe, expect, it } from 'vitest';
import {
  StubInternalBacktestDataSourceAdapter,
  InternalBacktestDataSourceUnavailableError,
} from '../src/internal-backtests/data-source-adapter';
import {
  InternalBacktestProviderInvalidResponseError,
  InternalBacktestProviderUnavailableError,
  type InternalBacktestMarketDataProvider,
} from '../src/internal-backtests/market-data-provider';

describe('internal backtest data source adapter (minimal stub)', () => {
  const adapter = new StubInternalBacktestDataSourceAdapter();

  it('returns deterministic bars and snapshot for JP_STOCK/D daily_ohlcv', async () => {
    const first = await adapter.fetchDailyOhlcv({
      symbol: '7203',
      market: 'JP_STOCK',
      timeframe: 'D',
      from: '2024-01-01',
      to: '2024-01-10',
      source_kind: 'daily_ohlcv',
    });
    const second = await adapter.fetchDailyOhlcv({
      symbol: '7203',
      market: 'JP_STOCK',
      timeframe: 'D',
      from: '2024-01-01',
      to: '2024-01-10',
      source_kind: 'daily_ohlcv',
    });

    expect(first.snapshot).toEqual(second.snapshot);
    expect(first.bars).toEqual(second.bars);
    expect(first.snapshot.bar_count).toBe(10);
  });

  it('changes bar_count deterministically by from/to range', async () => {
    const shortRange = await adapter.fetchDailyOhlcv({
      symbol: '7203',
      market: 'JP_STOCK',
      timeframe: 'D',
      from: '2024-01-01',
      to: '2024-01-05',
      source_kind: 'daily_ohlcv',
    });
    const longRange = await adapter.fetchDailyOhlcv({
      symbol: '7203',
      market: 'JP_STOCK',
      timeframe: 'D',
      from: '2024-01-01',
      to: '2024-01-20',
      source_kind: 'daily_ohlcv',
    });

    expect(shortRange.snapshot.bar_count).toBe(5);
    expect(longRange.snapshot.bar_count).toBe(20);
    expect(longRange.snapshot.bar_count).toBeGreaterThan(shortRange.snapshot.bar_count);
  });

  it('throws DATA_SOURCE_UNAVAILABLE for unsupported market/timeframe', async () => {
    await expect(
      adapter.fetchDailyOhlcv({
        symbol: 'AAPL',
        market: 'US_STOCK',
        timeframe: 'D',
        from: '2024-01-01',
        to: '2024-01-10',
        source_kind: 'daily_ohlcv',
      }),
    ).rejects.toBeInstanceOf(InternalBacktestDataSourceUnavailableError);
  });

  it('normalizes provider bars (date timestamp -> ISO datetime) and sorts ascending', async () => {
    const mockProvider: InternalBacktestMarketDataProvider = {
      fetchDailyOhlcv: async () => ({
        fetched_at: '2024-01-05T00:00:00.000Z',
        data_revision: 'mock-rev-1',
        bars: [
          {
            timestamp: '2024-01-03',
            open: 100,
            high: 110,
            low: 90,
            close: 105,
            volume: 1000,
          },
          {
            timestamp: '2024-01-01T00:00:00Z',
            open: 95,
            high: 100,
            low: 90,
            close: 98,
            volume: 900,
          },
        ],
      }),
    };
    const providerBackedAdapter = new StubInternalBacktestDataSourceAdapter(mockProvider);

    const result = await providerBackedAdapter.fetchDailyOhlcv({
      symbol: '7203',
      market: 'JP_STOCK',
      timeframe: 'D',
      from: '2024-01-01',
      to: '2024-01-03',
      source_kind: 'daily_ohlcv',
    });

    expect(result.bars[0]?.timestamp).toBe('2024-01-01T00:00:00.000Z');
    expect(result.bars[1]?.timestamp).toBe('2024-01-03T00:00:00.000Z');
    expect(result.snapshot.bar_count).toBe(2);
    expect(result.snapshot.data_revision).toBe('mock-rev-1');
  });

  it('maps provider unavailable error to DATA_SOURCE_UNAVAILABLE', async () => {
    const mockProvider: InternalBacktestMarketDataProvider = {
      fetchDailyOhlcv: async () => {
        throw new InternalBacktestProviderUnavailableError('provider temporarily unavailable', {
          reasonCode: 'provider_http_error',
          providerName: 'stooq',
          details: { http_status: 503, endpoint_kind: 'stooq_daily_csv' },
        });
      },
    };
    const providerBackedAdapter = new StubInternalBacktestDataSourceAdapter(mockProvider);

    try {
      await providerBackedAdapter.fetchDailyOhlcv({
        symbol: '7203',
        market: 'JP_STOCK',
        timeframe: 'D',
        from: '2024-01-01',
        to: '2024-01-03',
        source_kind: 'daily_ohlcv',
      });
      throw new Error('expected DATA_SOURCE_UNAVAILABLE');
    } catch (error) {
      expect(error).toBeInstanceOf(InternalBacktestDataSourceUnavailableError);
      const e = error as InternalBacktestDataSourceUnavailableError;
      expect(e.reasonCode).toBe('provider_http_error');
      expect(e.providerName).toBe('stooq');
      expect(e.details?.http_status).toBe(503);
      expect(e.details?.endpoint_kind).toBe('stooq_daily_csv');
    }
  });

  it('maps provider invalid response error to DATA_SOURCE_UNAVAILABLE', async () => {
    const mockProvider: InternalBacktestMarketDataProvider = {
      fetchDailyOhlcv: async () => {
        throw new InternalBacktestProviderInvalidResponseError('invalid provider payload', {
          reasonCode: 'provider_parse_error',
          providerName: 'stooq',
          details: { endpoint_kind: 'stooq_daily_csv' },
        });
      },
    };
    const providerBackedAdapter = new StubInternalBacktestDataSourceAdapter(mockProvider);

    await expect(
      providerBackedAdapter.fetchDailyOhlcv({
        symbol: '7203',
        market: 'JP_STOCK',
        timeframe: 'D',
        from: '2024-01-01',
        to: '2024-01-03',
        source_kind: 'daily_ohlcv',
      }),
    ).rejects.toMatchObject({
      code: 'DATA_SOURCE_UNAVAILABLE',
      reasonCode: 'provider_parse_error',
      providerName: 'stooq',
    });
  });

  it('retries once for provider_timeout and succeeds on second attempt', async () => {
    let callCount = 0;
    const retryableProvider: InternalBacktestMarketDataProvider = {
      fetchDailyOhlcv: async () => {
        callCount += 1;
        if (callCount === 1) {
          throw new InternalBacktestProviderUnavailableError('provider timeout once', {
            reasonCode: 'provider_timeout',
            providerName: 'stooq',
            details: { endpoint_kind: 'stooq_daily_csv' },
          });
        }
        return {
          fetched_at: '2024-01-05T00:00:00.000Z',
          data_revision: 'mock-rev-retry-success',
          bars: [
            {
              timestamp: '2024-01-01',
              open: 100,
              high: 101,
              low: 99,
              close: 100.5,
              volume: 1000,
            },
          ],
        };
      },
    };
    const adapterWithRetry = new StubInternalBacktestDataSourceAdapter(
      retryableProvider,
      { maxRetries: 1, baseDelayMs: 0 },
      async () => {},
    );

    const result = await adapterWithRetry.fetchDailyOhlcv({
      symbol: '7203',
      market: 'JP_STOCK',
      timeframe: 'D',
      from: '2024-01-01',
      to: '2024-01-01',
      source_kind: 'daily_ohlcv',
    });

    expect(callCount).toBe(2);
    expect(result.snapshot.bar_count).toBe(1);
  });

  it('retries once for provider_http_error with 5xx then fails as DATA_SOURCE_UNAVAILABLE', async () => {
    let callCount = 0;
    const provider: InternalBacktestMarketDataProvider = {
      fetchDailyOhlcv: async () => {
        callCount += 1;
        throw new InternalBacktestProviderUnavailableError('stooq_http_503', {
          reasonCode: 'provider_http_error',
          providerName: 'stooq',
          details: { http_status: 503, endpoint_kind: 'stooq_daily_csv' },
        });
      },
    };
    const adapterWithRetry = new StubInternalBacktestDataSourceAdapter(
      provider,
      { maxRetries: 1, baseDelayMs: 0 },
      async () => {},
    );

    await expect(
      adapterWithRetry.fetchDailyOhlcv({
        symbol: '7203',
        market: 'JP_STOCK',
        timeframe: 'D',
        from: '2024-01-01',
        to: '2024-01-03',
        source_kind: 'daily_ohlcv',
      }),
    ).rejects.toMatchObject({
      code: 'DATA_SOURCE_UNAVAILABLE',
      reasonCode: 'provider_http_error',
      details: {
        retry_attempted: true,
        retry_attempts: 2,
        retry_target: true,
      },
    });
    expect(callCount).toBe(2);
  });

  it('does not retry for provider_http_error with 4xx', async () => {
    let callCount = 0;
    const provider: InternalBacktestMarketDataProvider = {
      fetchDailyOhlcv: async () => {
        callCount += 1;
        throw new InternalBacktestProviderUnavailableError('stooq_http_404', {
          reasonCode: 'provider_http_error',
          providerName: 'stooq',
          details: { http_status: 404, endpoint_kind: 'stooq_daily_csv' },
        });
      },
    };
    const adapterWithRetry = new StubInternalBacktestDataSourceAdapter(
      provider,
      { maxRetries: 1, baseDelayMs: 0 },
      async () => {},
    );

    await expect(
      adapterWithRetry.fetchDailyOhlcv({
        symbol: '7203',
        market: 'JP_STOCK',
        timeframe: 'D',
        from: '2024-01-01',
        to: '2024-01-03',
        source_kind: 'daily_ohlcv',
      }),
    ).rejects.toMatchObject({
      code: 'DATA_SOURCE_UNAVAILABLE',
      reasonCode: 'provider_http_error',
      details: {
        retry_attempted: false,
        retry_attempts: 1,
        retry_target: false,
      },
    });
    expect(callCount).toBe(1);
  });

  it('does not retry for provider_http_error with 429', async () => {
    let callCount = 0;
    const provider: InternalBacktestMarketDataProvider = {
      fetchDailyOhlcv: async () => {
        callCount += 1;
        throw new InternalBacktestProviderUnavailableError('stooq_http_429', {
          reasonCode: 'provider_http_error',
          providerName: 'stooq',
          details: { http_status: 429, endpoint_kind: 'stooq_daily_csv' },
        });
      },
    };
    const adapterWithRetry = new StubInternalBacktestDataSourceAdapter(
      provider,
      { maxRetries: 1, baseDelayMs: 0 },
      async () => {},
    );

    await expect(
      adapterWithRetry.fetchDailyOhlcv({
        symbol: '7203',
        market: 'JP_STOCK',
        timeframe: 'D',
        from: '2024-01-01',
        to: '2024-01-03',
        source_kind: 'daily_ohlcv',
      }),
    ).rejects.toMatchObject({
      code: 'DATA_SOURCE_UNAVAILABLE',
      reasonCode: 'provider_http_error',
      details: {
        retry_attempted: false,
        retry_attempts: 1,
        retry_target: false,
        http_status: 429,
      },
    });
    expect(callCount).toBe(1);
  });

  it('does not retry for provider_parse_error', async () => {
    let callCount = 0;
    const provider: InternalBacktestMarketDataProvider = {
      fetchDailyOhlcv: async () => {
        callCount += 1;
        throw new InternalBacktestProviderInvalidResponseError('invalid provider payload', {
          reasonCode: 'provider_parse_error',
          providerName: 'stooq',
          details: { endpoint_kind: 'stooq_daily_csv' },
        });
      },
    };
    const adapterWithRetry = new StubInternalBacktestDataSourceAdapter(
      provider,
      { maxRetries: 1, baseDelayMs: 0 },
      async () => {},
    );

    await expect(
      adapterWithRetry.fetchDailyOhlcv({
        symbol: '7203',
        market: 'JP_STOCK',
        timeframe: 'D',
        from: '2024-01-01',
        to: '2024-01-03',
        source_kind: 'daily_ohlcv',
      }),
    ).rejects.toMatchObject({
      code: 'DATA_SOURCE_UNAVAILABLE',
      reasonCode: 'provider_parse_error',
      details: {
        retry_attempted: false,
        retry_attempts: 1,
        retry_target: false,
      },
    });
    expect(callCount).toBe(1);
  });
});
