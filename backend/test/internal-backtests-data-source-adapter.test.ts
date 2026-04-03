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
        throw new InternalBacktestProviderUnavailableError('provider temporarily unavailable');
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
    ).rejects.toBeInstanceOf(InternalBacktestDataSourceUnavailableError);
  });

  it('maps provider invalid response error to DATA_SOURCE_UNAVAILABLE', async () => {
    const mockProvider: InternalBacktestMarketDataProvider = {
      fetchDailyOhlcv: async () => {
        throw new InternalBacktestProviderInvalidResponseError('invalid provider payload');
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
    ).rejects.toBeInstanceOf(InternalBacktestDataSourceUnavailableError);
  });
});
