import { describe, expect, it } from 'vitest';
import {
  StubInternalBacktestDataSourceAdapter,
  InternalBacktestDataSourceUnavailableError,
} from '../src/internal-backtests/data-source-adapter';

describe('internal backtest data source adapter (minimal stub)', () => {
  const adapter = new StubInternalBacktestDataSourceAdapter();

  it('returns deterministic bars and snapshot for JP_STOCK/D daily_ohlcv', async () => {
    const first = await adapter.fetchDailyOhlcv({
      instrument_id: 'ver-1',
      market: 'JP_STOCK',
      timeframe: 'D',
      from: '2024-01-01',
      to: '2024-01-10',
      source_kind: 'daily_ohlcv',
    });
    const second = await adapter.fetchDailyOhlcv({
      instrument_id: 'ver-1',
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
      instrument_id: 'ver-1',
      market: 'JP_STOCK',
      timeframe: 'D',
      from: '2024-01-01',
      to: '2024-01-05',
      source_kind: 'daily_ohlcv',
    });
    const longRange = await adapter.fetchDailyOhlcv({
      instrument_id: 'ver-1',
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
        instrument_id: 'ver-1',
        market: 'US_STOCK',
        timeframe: 'D',
        from: '2024-01-01',
        to: '2024-01-10',
        source_kind: 'daily_ohlcv',
      }),
    ).rejects.toBeInstanceOf(InternalBacktestDataSourceUnavailableError);
  });
});
