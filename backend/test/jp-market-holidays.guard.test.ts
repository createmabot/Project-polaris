import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __getJpMarketHolidayCoverageForTests,
  __resetSnapshotCacheForTests,
  getCurrentSnapshotForSymbol,
} from '../src/market/snapshot';

const symbol = {
  id: 'sym-guard',
  symbol: '7203',
  symbolCode: '7203',
  marketCode: 'TSE',
  tradingviewSymbol: 'TSE:7203',
};

describe('JP market holiday coverage guard', () => {
  beforeEach(() => {
    __resetSnapshotCacheForTests();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('covers current JST year and next year in JP market holiday table', () => {
    const coverage = __getJpMarketHolidayCoverageForTests();
    const currentJstYear = Number(
      new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 4)
    );

    expect(coverage.minYear).toBeGreaterThan(0);
    expect(coverage.maxYear).toBeGreaterThanOrEqual(currentJstYear + 100);
    expect(coverage.years).toContain(currentJstYear);
  });

  it('emits near-limit warning once when current year reaches maxYear-1', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-06-01T00:00:00.000Z'));

    const warn = vi.fn();
    const logger = { warn };
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('primary_down'))
      .mockRejectedValueOnce(new Error('secondary_down'));
    vi.stubGlobal('fetch', fetchMock);

    await getCurrentSnapshotForSymbol(symbol, logger);
    await getCurrentSnapshotForSymbol(symbol, logger);

    const nearLimitCalls = warn.mock.calls.filter((call) => call[1] === 'jp_market_holidays_coverage_near_limit');
    expect(nearLimitCalls.length).toBe(1);
  });

  it('emits expired warning when current year exceeds holiday table range', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2029-01-10T00:00:00.000Z'));

    const warn = vi.fn();
    const logger = { warn };
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('primary_down'))
      .mockRejectedValueOnce(new Error('secondary_down'));
    vi.stubGlobal('fetch', fetchMock);

    await getCurrentSnapshotForSymbol(symbol, logger);

    const expiredCalls = warn.mock.calls.filter((call) => call[1] === 'jp_market_holidays_coverage_expired');
    expect(expiredCalls.length).toBe(1);
  });
});
