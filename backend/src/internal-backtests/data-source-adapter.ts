import type { InternalBacktestDataSourceSnapshot } from './contracts';

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

function toDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 86400000);
}

function stableHash(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) % 2147483647;
  }
  return hash;
}

function buildDeterministicBars(args: {
  symbol: string;
  market: string;
  timeframe: string;
  from: string;
  to: string;
}): InternalBacktestOhlcvBar[] {
  const start = toDate(args.from);
  const end = toDate(args.to);
  const bars: InternalBacktestOhlcvBar[] = [];
  let cursor = start;
  let index = 0;
  const seedBase = `${args.symbol}|${args.market}|${args.timeframe}|${args.from}|${args.to}`;

  while (cursor.getTime() <= end.getTime()) {
    const dateText = formatDate(cursor);
    const seed = stableHash(`${seedBase}|${dateText}|${index}`);
    const open = 900 + (seed % 200);
    const high = open + (seed % 25);
    const low = Math.max(1, open - (seed % 20));
    const close = low + ((seed % 100) / 100) * (high - low);
    const volume = 100000 + (seed % 900000);
    bars.push({
      timestamp: `${dateText}T00:00:00.000Z`,
      open,
      high,
      low,
      close: Math.round(close * 100) / 100,
      volume,
    });
    cursor = addDays(cursor, 1);
    index += 1;
  }

  return bars;
}

export class StubInternalBacktestDataSourceAdapter implements InternalBacktestDataSourceAdapter {
  async fetchDailyOhlcv(
    input: InternalBacktestDataSourceFetchInput,
  ): Promise<InternalBacktestDataSourceFetchResult> {
    if (input.source_kind !== 'daily_ohlcv') {
      throw new InternalBacktestDataSourceUnavailableError(
        `unsupported source_kind: ${input.source_kind}`,
      );
    }
    if (input.market !== 'JP_STOCK' || input.timeframe !== 'D') {
      throw new InternalBacktestDataSourceUnavailableError(
        `unsupported market/timeframe: ${input.market}/${input.timeframe}`,
      );
    }

    const bars = buildDeterministicBars({
      symbol: input.symbol,
      market: input.market,
      timeframe: input.timeframe,
      from: input.from,
      to: input.to,
    });

    return {
      bars,
      snapshot: {
        source_kind: 'daily_ohlcv',
        market: input.market,
        timeframe: input.timeframe,
        from: input.from,
        to: input.to,
        fetched_at: `${input.to}T00:00:00.000Z`,
        data_revision: `stub-daily-ohlcv-v1:${input.market}:${input.timeframe}:${input.from}:${input.to}`,
        bar_count: bars.length,
      },
    };
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
