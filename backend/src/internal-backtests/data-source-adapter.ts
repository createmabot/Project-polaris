import type { InternalBacktestDataSourceSnapshot } from './contracts';
import {
  defaultInternalBacktestMarketDataProvider,
  type InternalBacktestProviderFailureReasonCode,
  InternalBacktestProviderInvalidResponseError,
  isProviderInvalidResponseError,
  isProviderUnavailableError,
  type InternalBacktestMarketDataProvider,
} from './market-data-provider';

export const INTERNAL_BACKTEST_DATA_SOURCE_UNAVAILABLE_CODE = 'DATA_SOURCE_UNAVAILABLE';
export type InternalBacktestDataSourceUnavailableReasonCode =
  | InternalBacktestProviderFailureReasonCode
  | 'provider_unknown_error';

export class InternalBacktestDataSourceUnavailableError extends Error {
  code: string;
  reasonCode: InternalBacktestDataSourceUnavailableReasonCode;
  providerName: string;
  details?: Record<string, unknown>;

  constructor(
    message: string,
    options?: {
      reasonCode?: InternalBacktestDataSourceUnavailableReasonCode;
      providerName?: string;
      details?: Record<string, unknown>;
    },
  ) {
    super(message);
    this.name = 'InternalBacktestDataSourceUnavailableError';
    this.code = INTERNAL_BACKTEST_DATA_SOURCE_UNAVAILABLE_CODE;
    this.reasonCode = options?.reasonCode ?? 'provider_unknown_error';
    this.providerName = options?.providerName ?? 'unknown';
    this.details = options?.details;
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

export type InternalBacktestDataSourceRetryConfig = {
  maxRetries: number;
  baseDelayMs: number;
};

export interface InternalBacktestDataSourceAdapter {
  fetchDailyOhlcv(input: InternalBacktestDataSourceFetchInput): Promise<InternalBacktestDataSourceFetchResult>;
}

type ProviderUnavailableErrorLike = {
  reasonCode?: InternalBacktestProviderFailureReasonCode;
  providerName?: string;
  details?: Record<string, unknown>;
};

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

function delay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryProviderError(error: unknown): boolean {
  if (!isProviderUnavailableError(error)) {
    return false;
  }

  const providerError = error as ProviderUnavailableErrorLike;
  const reasonCode = providerError.reasonCode;
  if (reasonCode === 'provider_timeout' || reasonCode === 'provider_network_error') {
    return true;
  }
  if (reasonCode === 'provider_http_error') {
    const httpStatus = providerError.details?.http_status;
    return typeof httpStatus === 'number' && httpStatus >= 500 && httpStatus < 600;
  }
  return false;
}

function getRetryMetadata(args: {
  attempts: number;
  retryable: boolean;
}): Record<string, unknown> {
  return {
    retry_attempted: args.attempts > 1,
    retry_attempts: args.attempts,
    retry_target: args.retryable,
  };
}

export class StubInternalBacktestDataSourceAdapter implements InternalBacktestDataSourceAdapter {
  private readonly retryConfig: InternalBacktestDataSourceRetryConfig;

  constructor(
    private readonly provider: InternalBacktestMarketDataProvider = defaultInternalBacktestMarketDataProvider,
    retryConfig: Partial<InternalBacktestDataSourceRetryConfig> = {},
    private readonly sleepFn: (ms: number) => Promise<void> = delay,
  ) {
    this.retryConfig = {
      maxRetries: retryConfig.maxRetries ?? 1,
      baseDelayMs: retryConfig.baseDelayMs ?? 120,
    };
  }

  async fetchDailyOhlcv(
    input: InternalBacktestDataSourceFetchInput,
  ): Promise<InternalBacktestDataSourceFetchResult> {
    let attempts = 0;
    let lastRetryable = false;
    try {
      let providerResult: Awaited<ReturnType<InternalBacktestMarketDataProvider['fetchDailyOhlcv']>>;
      // attempt #1 + selective retry (at most maxRetries)
      for (;;) {
        attempts += 1;
        try {
          providerResult = await this.provider.fetchDailyOhlcv({
            symbol: input.symbol,
            market: input.market,
            timeframe: input.timeframe,
            from: input.from,
            to: input.to,
            source_kind: input.source_kind,
          });
          break;
        } catch (error) {
          lastRetryable = shouldRetryProviderError(error);
          if (lastRetryable && attempts <= this.retryConfig.maxRetries) {
            await this.sleepFn(this.retryConfig.baseDelayMs * attempts);
            continue;
          }
          throw error;
        }
      }

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
        const providerError = error as ProviderUnavailableErrorLike;
        const retryMeta = getRetryMetadata({
          attempts: Math.max(1, attempts),
          retryable: lastRetryable,
        });
        throw new InternalBacktestDataSourceUnavailableError(
          error instanceof Error ? error.message : 'data source provider unavailable',
          {
            reasonCode: providerError.reasonCode ?? 'provider_unknown_error',
            providerName: providerError.providerName ?? 'unknown',
            details: {
              ...(providerError.details ?? {}),
              ...retryMeta,
            },
          },
        );
      }
      if (error instanceof InternalBacktestDataSourceUnavailableError) {
        throw error;
      }
      const retryMeta = getRetryMetadata({
        attempts: Math.max(1, attempts),
        retryable: lastRetryable,
      });
      throw new InternalBacktestDataSourceUnavailableError(
        error instanceof Error ? error.message : 'data source provider unavailable',
        {
          reasonCode: 'provider_unknown_error',
          providerName: 'unknown',
          details: retryMeta,
        },
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
