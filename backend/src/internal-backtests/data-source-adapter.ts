import type { InternalBacktestDataSourceSnapshot } from './contracts';
import {
  defaultInternalBacktestMarketDataProvider,
  InternalBacktestProviderInvalidResponseError,
  isProviderInvalidResponseError,
  isProviderUnavailableError,
  type InternalBacktestMarketDataProvider,
} from './market-data-provider';

export const INTERNAL_BACKTEST_DATA_SOURCE_UNAVAILABLE_CODE = 'DATA_SOURCE_UNAVAILABLE';

export class InternalBacktestDataSourceUnavailableError extends Error {
  code: string;

  constructor(message: string) {
    super(message);
    this.name = 'InternalBacktestDataSourceUnavailableError';
    this.code = INTERNAL_BACKTEST_DATA_SOURCE_UNAVAILABLE_CODE;
  }
}

export type InternalBacktestOhlcvBar = {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type InternalBacktestDataSourceFetchInput = {
  symbol: string;
  market: string;
  timeframe: string;
  from: string;
  to: string;
  source_kind: 'daily_ohlcv';
};

export type InternalBacktestDataSourceFetchResult = {
  bars: InternalBacktestOhlcvBar[];
  snapshot: InternalBacktestDataSourceSnapshot;
};

export interface InternalBacktestDataSourceAdapter {
  fetchDailyOhlcv(input: InternalBacktestDataSourceFetchInput): Promise<InternalBacktestDataSourceFetchResult>;
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+\-]\d{2}:\d{2})$/;

function toIsoDateTime(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new InternalBacktestProviderInvalidResponseError('provider bar timestamp is empty');
  }

  if (ISO_DATE_PATTERN.test(trimmed)) {
    return `${trimmed}T00:00:00.000Z`;
  }
  if (ISO_DATE_TIME_PATTERN.test(trimmed)) {
    const parsed = Date.parse(trimmed);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
  }

  throw new InternalBacktestProviderInvalidResponseError('provider bar timestamp must be ISO date or datetime');
}

function assertFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new InternalBacktestProviderInvalidResponseError(`provider bar ${field} must be a finite number`);
  }
  return value;
}

function normalizeProviderBars(
  bars: Array<{
    timestamp: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>,
): InternalBacktestOhlcvBar[] {
  const normalized = bars.map((bar) => {
    const timestamp = toIsoDateTime(bar.timestamp);
    const open = assertFiniteNumber(bar.open, 'open');
    const high = assertFiniteNumber(bar.high, 'high');
    const low = assertFiniteNumber(bar.low, 'low');
    const close = assertFiniteNumber(bar.close, 'close');
    const volume = assertFiniteNumber(bar.volume, 'volume');

    if (high < low) {
      throw new InternalBacktestProviderInvalidResponseError('provider bar high must be >= low');
    }

    return { timestamp, open, high, low, close, volume };
  });

  normalized.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return normalized;
}

export class StubInternalBacktestDataSourceAdapter implements InternalBacktestDataSourceAdapter {
  constructor(
    private readonly provider: InternalBacktestMarketDataProvider = defaultInternalBacktestMarketDataProvider,
  ) {}

  async fetchDailyOhlcv(
    input: InternalBacktestDataSourceFetchInput,
  ): Promise<InternalBacktestDataSourceFetchResult> {
    try {
      const providerResult = await this.provider.fetchDailyOhlcv({
        symbol: input.symbol,
        market: input.market,
        timeframe: input.timeframe,
        from: input.from,
        to: input.to,
        source_kind: input.source_kind,
      });

      const bars = normalizeProviderBars(providerResult.bars);

      return {
        bars,
        snapshot: {
          source_kind: input.source_kind,
          market: input.market,
          timeframe: input.timeframe,
          from: input.from,
          to: input.to,
          fetched_at: providerResult.fetched_at,
          data_revision: providerResult.data_revision,
          bar_count: bars.length,
        },
      };
    } catch (error) {
      if (isProviderUnavailableError(error) || isProviderInvalidResponseError(error)) {
        throw new InternalBacktestDataSourceUnavailableError(
          error instanceof Error ? error.message : 'data source provider unavailable',
        );
      }
      if (error instanceof InternalBacktestDataSourceUnavailableError) {
        throw error;
      }
      throw new InternalBacktestDataSourceUnavailableError(
        error instanceof Error ? error.message : 'data source provider unavailable',
      );
    }
  }
}

export const defaultInternalBacktestDataSourceAdapter = new StubInternalBacktestDataSourceAdapter();

export function isDataSourceUnavailableError(error: unknown): error is { code: string } {
  return (
    !!error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code: string }).code === INTERNAL_BACKTEST_DATA_SOURCE_UNAVAILABLE_CODE
  );
}
