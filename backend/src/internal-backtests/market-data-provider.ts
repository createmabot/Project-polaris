import { env } from '../env';

export const INTERNAL_BACKTEST_PROVIDER_UNAVAILABLE_CODE = 'INTERNAL_BACKTEST_PROVIDER_UNAVAILABLE';
export const INTERNAL_BACKTEST_PROVIDER_INVALID_RESPONSE_CODE =
  'INTERNAL_BACKTEST_PROVIDER_INVALID_RESPONSE';

export type InternalBacktestProviderFailureReasonCode =
  | 'provider_http_error'
  | 'provider_timeout'
  | 'provider_network_error'
  | 'provider_invalid_response'
  | 'provider_parse_error'
  | 'provider_not_configured'
  | 'provider_unsupported_target';

type InternalBacktestProviderErrorOptions = {
  reasonCode: InternalBacktestProviderFailureReasonCode;
  providerName: string;
  details?: Record<string, unknown>;
};

export class InternalBacktestProviderUnavailableError extends Error {
  code: string;
  reasonCode: InternalBacktestProviderFailureReasonCode;
  providerName: string;
  details?: Record<string, unknown>;

  constructor(message: string, options?: InternalBacktestProviderErrorOptions) {
    super(message);
    this.name = 'InternalBacktestProviderUnavailableError';
    this.code = INTERNAL_BACKTEST_PROVIDER_UNAVAILABLE_CODE;
    this.reasonCode = options?.reasonCode ?? 'provider_network_error';
    this.providerName = options?.providerName ?? 'unknown';
    this.details = options?.details;
  }
}

export class InternalBacktestProviderInvalidResponseError extends Error {
  code: string;
  reasonCode: InternalBacktestProviderFailureReasonCode;
  providerName: string;
  details?: Record<string, unknown>;

  constructor(message: string, options?: InternalBacktestProviderErrorOptions) {
    super(message);
    this.name = 'InternalBacktestProviderInvalidResponseError';
    this.code = INTERNAL_BACKTEST_PROVIDER_INVALID_RESPONSE_CODE;
    this.reasonCode = options?.reasonCode ?? 'provider_invalid_response';
    this.providerName = options?.providerName ?? 'unknown';
    this.details = options?.details;
  }
}

export type InternalBacktestProviderBar = {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type InternalBacktestProviderFetchInput = {
  symbol: string;
  market: string;
  timeframe: string;
  from: string;
  to: string;
  source_kind: 'daily_ohlcv';
};

export type InternalBacktestProviderFetchResult = {
  bars: InternalBacktestProviderBar[];
  fetched_at: string;
  data_revision: string;
};

export interface InternalBacktestMarketDataProvider {
  fetchDailyOhlcv(input: InternalBacktestProviderFetchInput): Promise<InternalBacktestProviderFetchResult>;
}

export type InternalBacktestMarketDataProviderMode = 'stub' | 'stooq';

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
}): InternalBacktestProviderBar[] {
  const start = toDate(args.from);
  const end = toDate(args.to);
  const bars: InternalBacktestProviderBar[] = [];
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

function toStooqCodeForJpStock(symbol: string): string {
  return `${symbol.toLowerCase()}.jp`;
}

type CsvRow = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

function parseStooqDailyCsv(content: string): CsvRow[] {
  const endpointKind = 'stooq_daily_csv';
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return [];
  }

  const header = lines[0] ?? '';
  if (!/^date,open,high,low,close,volume$/i.test(header)) {
    throw new InternalBacktestProviderInvalidResponseError('stooq csv header is invalid', {
      reasonCode: 'provider_parse_error',
      providerName: 'stooq',
      details: { endpoint_kind: endpointKind },
    });
  }

  if (lines.length === 1) {
    return [];
  }

  const rows: CsvRow[] = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(',');
    if (cols.length < 6) continue;
    const date = cols[0]?.trim() ?? '';
    const open = Number(cols[1]);
    const high = Number(cols[2]);
    const low = Number(cols[3]);
    const close = Number(cols[4]);
    const volume = Number(cols[5]);
    if (!date || !Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) {
      continue;
    }
    rows.push({
      date,
      open,
      high,
      low,
      close,
      volume: Number.isFinite(volume) ? volume : 0,
    });
  }

  if (lines.length > 1 && rows.length === 0) {
    throw new InternalBacktestProviderInvalidResponseError('stooq csv rows are not parseable', {
      reasonCode: 'provider_parse_error',
      providerName: 'stooq',
      details: { endpoint_kind: endpointKind },
    });
  }

  return rows;
}

function toIsoDateTimeFromDate(date: string): string {
  return `${date}T00:00:00.000Z`;
}

function isDateInRange(date: string, from: string, to: string): boolean {
  return date >= from && date <= to;
}

export class StooqDailyInternalBacktestMarketDataProvider implements InternalBacktestMarketDataProvider {
  async fetchDailyOhlcv(input: InternalBacktestProviderFetchInput): Promise<InternalBacktestProviderFetchResult> {
    const providerName = 'stooq';
    const endpointKind = 'stooq_daily_csv';
    if (input.source_kind !== 'daily_ohlcv') {
      throw new InternalBacktestProviderUnavailableError(
        `unsupported source_kind: ${input.source_kind}`,
        {
          reasonCode: 'provider_unsupported_target',
          providerName,
          details: { endpoint_kind: endpointKind },
        },
      );
    }
    if (input.market !== 'JP_STOCK' || input.timeframe !== 'D') {
      throw new InternalBacktestProviderUnavailableError(
        `unsupported market/timeframe: ${input.market}/${input.timeframe}`,
        {
          reasonCode: 'provider_unsupported_target',
          providerName,
          details: { endpoint_kind: endpointKind },
        },
      );
    }

    if (!env.SNAPSHOT_STOOQ_DAILY_URL_TEMPLATE.includes('{symbol}')) {
      throw new InternalBacktestProviderUnavailableError('stooq url template is not configured', {
        reasonCode: 'provider_not_configured',
        providerName,
        details: { endpoint_kind: endpointKind },
      });
    }

    const stooqCode = toStooqCodeForJpStock(input.symbol);
    const url = env.SNAPSHOT_STOOQ_DAILY_URL_TEMPLATE.replace(
      '{symbol}',
      encodeURIComponent(stooqCode),
    );

    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(env.SNAPSHOT_FETCH_TIMEOUT_MS) });
    } catch (error) {
      const reasonCode: InternalBacktestProviderFailureReasonCode =
        error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
          ? 'provider_timeout'
          : 'provider_network_error';
      throw new InternalBacktestProviderUnavailableError(
        error instanceof Error ? error.message : 'stooq fetch failed',
        {
          reasonCode,
          providerName,
          details: { endpoint_kind: endpointKind },
        },
      );
    }

    if (!response.ok) {
      throw new InternalBacktestProviderUnavailableError(`stooq_http_${response.status}`, {
        reasonCode: 'provider_http_error',
        providerName,
        details: { http_status: response.status, endpoint_kind: endpointKind },
      });
    }

    const text = await response.text();
    const csvRows = parseStooqDailyCsv(text);
    const filtered = csvRows.filter((row) => isDateInRange(row.date, input.from, input.to));

    const bars: InternalBacktestProviderBar[] = filtered.map((row) => ({
      timestamp: toIsoDateTimeFromDate(row.date),
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume,
    }));

    const latestDate = filtered.length > 0 ? filtered[filtered.length - 1]!.date : input.to;
    return {
      bars,
      fetched_at: new Date().toISOString(),
      data_revision: `stooq-daily-v1:${stooqCode}:${latestDate}`,
    };
  }
}

export class StubInternalBacktestMarketDataProvider implements InternalBacktestMarketDataProvider {
  async fetchDailyOhlcv(input: InternalBacktestProviderFetchInput): Promise<InternalBacktestProviderFetchResult> {
    const providerName = 'stub';
    if (input.source_kind !== 'daily_ohlcv') {
      throw new InternalBacktestProviderUnavailableError(
        `unsupported source_kind: ${input.source_kind}`,
        {
          reasonCode: 'provider_unsupported_target',
          providerName,
        },
      );
    }
    if (input.market !== 'JP_STOCK' || input.timeframe !== 'D') {
      throw new InternalBacktestProviderUnavailableError(
        `unsupported market/timeframe: ${input.market}/${input.timeframe}`,
        {
          reasonCode: 'provider_unsupported_target',
          providerName,
        },
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
      fetched_at: `${input.to}T00:00:00.000Z`,
      data_revision: `stub-daily-ohlcv-v1:${input.market}:${input.timeframe}:${input.from}:${input.to}`,
    };
  }
}

export const defaultInternalBacktestMarketDataProvider = new StubInternalBacktestMarketDataProvider();

export function createInternalBacktestMarketDataProvider(mode?: InternalBacktestMarketDataProviderMode): InternalBacktestMarketDataProvider {
  const isTestRuntime =
    env.APP_ENV === 'test' || process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
  const selectedMode =
    mode ??
    env.INTERNAL_BACKTEST_MARKET_DATA_PROVIDER ??
    (isTestRuntime ? 'stub' : 'stooq');

  if (selectedMode === 'stooq') {
    return new StooqDailyInternalBacktestMarketDataProvider();
  }
  return new StubInternalBacktestMarketDataProvider();
}

export function isProviderUnavailableError(error: unknown): error is { code: string } {
  return (
    !!error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code: string }).code === INTERNAL_BACKTEST_PROVIDER_UNAVAILABLE_CODE
  );
}

export function isProviderInvalidResponseError(error: unknown): error is { code: string } {
  return (
    !!error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code: string }).code === INTERNAL_BACKTEST_PROVIDER_INVALID_RESPONSE_CODE
  );
}
