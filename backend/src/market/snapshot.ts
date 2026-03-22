import { env } from '../env';

export type CurrentSnapshot = {
  last_price: number;
  change: number | null;
  change_percent: number | null;
  volume: number | null;
  as_of: string;
  market_status: 'open' | 'closed' | 'unknown';
  source_name: string;
};

type SymbolRef = {
  id: string;
  symbol: string;
  symbolCode: string | null;
  marketCode: string | null;
  tradingviewSymbol: string | null;
};

type SnapshotCacheEntry = {
  expiresAt: number;
  value: CurrentSnapshot;
};

const snapshotCache = new Map<string, SnapshotCacheEntry>();

function toStooqCode(symbol: Pick<SymbolRef, 'symbol' | 'symbolCode' | 'marketCode' | 'tradingviewSymbol'>): string | null {
  const marketCode = (symbol.marketCode ?? '').toUpperCase();
  const symbolCode = (symbol.symbolCode ?? '').trim();

  if (symbolCode && (marketCode === 'TSE' || marketCode === 'JP' || marketCode === 'TYO')) {
    return `${symbolCode.toLowerCase()}.jp`;
  }

  const tradingview = (symbol.tradingviewSymbol ?? '').trim();
  if (tradingview) {
    const parts = tradingview.split(':');
    if (parts.length === 2) {
      const code = parts[1].trim();
      if (code) {
        return `${code.toLowerCase()}.jp`;
      }
    }
  }

  const fallback = (symbol.symbol ?? '').trim();
  if (fallback) {
    return `${fallback.toLowerCase()}.jp`;
  }

  return null;
}

function parseCsv(content: string): Array<{ date: string; close: number; volume: number | null }> {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) return [];

  const rows = lines.slice(1);
  const parsed: Array<{ date: string; close: number; volume: number | null }> = [];

  for (const row of rows) {
    const cols = row.split(',');
    if (cols.length < 6) continue;
    const date = cols[0]?.trim();
    const close = Number(cols[4]);
    const volumeRaw = cols[5] !== undefined ? Number(cols[5]) : Number.NaN;
    const volume = Number.isFinite(volumeRaw) ? volumeRaw : null;
    if (!date || !Number.isFinite(close)) continue;
    parsed.push({ date, close, volume });
  }

  return parsed;
}

function toAsOf(dateText: string): string | null {
  const iso = `${dateText}T15:00:00+09:00`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const INTRADAY_STALE_MS = 30 * 60 * 1000;
const DAILY_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const DAILY_WARNING_STALE_MS = 24 * 60 * 60 * 1000;

type MarketStatusCandidate = 'open' | 'closed' | 'unknown';
type FreshnessStatus = 'fresh' | 'stale' | 'expired' | 'invalid';
type SnapshotReasonCode =
  | 'daily_source_closed'
  | 'candidate_unknown'
  | 'freshness_invalid'
  | 'freshness_expired'
  | 'open_but_stale'
  | 'jp_market_holiday'
  | 'jp_market_weekend'
  | 'outside_jp_session'
  | 'closed_by_source';

type SnapshotStatusEvaluation = {
  market_status_candidate: MarketStatusCandidate;
  freshness_status: FreshnessStatus;
  market_status: 'open' | 'closed' | 'unknown';
  reason_code: SnapshotReasonCode;
};

function toJstDate(date: Date): Date {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000);
}

function toJstDateKey(date: Date): string {
  const jst = toJstDate(date);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(jst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const JP_MARKET_HOLIDAYS = new Set<string>([
  // 2024
  '2024-01-01', '2024-01-02', '2024-01-03', '2024-01-08', '2024-02-12', '2024-02-23',
  '2024-03-20', '2024-04-29', '2024-05-03', '2024-05-06', '2024-07-15', '2024-08-12',
  '2024-09-16', '2024-09-23', '2024-10-14', '2024-11-04', '2024-11-23', '2024-12-31',
  // 2025
  '2025-01-01', '2025-01-02', '2025-01-03', '2025-01-13', '2025-02-11', '2025-02-24',
  '2025-03-20', '2025-04-29', '2025-05-05', '2025-05-06', '2025-07-21', '2025-08-11',
  '2025-09-15', '2025-09-23', '2025-10-13', '2025-11-03', '2025-11-24', '2025-12-31',
  // 2026
  '2026-01-01', '2026-01-02', '2026-01-03', '2026-01-12', '2026-02-11', '2026-02-23',
  '2026-03-20', '2026-04-29', '2026-05-04', '2026-05-05', '2026-05-06', '2026-07-20',
  '2026-08-11', '2026-09-21', '2026-09-22', '2026-09-23', '2026-10-12', '2026-11-03',
  '2026-11-23', '2026-12-31',
  // 2027
  '2027-01-01', '2027-01-02', '2027-01-03', '2027-01-11', '2027-02-11', '2027-02-23',
  '2027-03-22', '2027-04-29', '2027-05-03', '2027-05-04', '2027-05-05', '2027-07-19',
  '2027-08-11', '2027-09-20', '2027-09-23', '2027-10-11', '2027-11-03', '2027-11-23',
  '2027-12-31',
  // 2028
  '2028-01-01', '2028-01-02', '2028-01-03', '2028-01-10', '2028-02-11', '2028-02-23',
  '2028-03-20', '2028-04-29', '2028-05-03', '2028-05-04', '2028-05-05', '2028-07-17',
  '2028-08-11', '2028-09-18', '2028-09-22', '2028-10-09', '2028-11-03', '2028-11-23',
  '2028-12-31',
]);

const JP_MARKET_HOLIDAY_YEARS = Array.from(
  new Set(
    Array.from(JP_MARKET_HOLIDAYS)
      .map((date) => Number(date.slice(0, 4)))
      .filter((year) => Number.isInteger(year))
  )
).sort((a, b) => a - b);

const JP_MARKET_HOLIDAY_MIN_YEAR = JP_MARKET_HOLIDAY_YEARS[0] ?? 0;
const JP_MARKET_HOLIDAY_MAX_YEAR = JP_MARKET_HOLIDAY_YEARS[JP_MARKET_HOLIDAY_YEARS.length - 1] ?? 0;
let jpHolidayCoverageWarned = false;

function isJpMarketHoliday(now: Date): boolean {
  return JP_MARKET_HOLIDAYS.has(toJstDateKey(now));
}

function warnIfJpHolidayCoverageNearingLimit(
  logger?: { warn: (obj: unknown, msg?: string) => void }
) {
  if (jpHolidayCoverageWarned) return;
  if (!logger?.warn) return;

  const currentJstYear = Number(toJstDateKey(new Date()).slice(0, 4));
  if (!Number.isInteger(currentJstYear)) return;

  if (currentJstYear > JP_MARKET_HOLIDAY_MAX_YEAR) {
    logger.warn(
      {
        current_jst_year: currentJstYear,
        min_year: JP_MARKET_HOLIDAY_MIN_YEAR,
        max_year: JP_MARKET_HOLIDAY_MAX_YEAR,
      },
      'jp_market_holidays_coverage_expired'
    );
    jpHolidayCoverageWarned = true;
    return;
  }

  if (JP_MARKET_HOLIDAY_MAX_YEAR - currentJstYear <= 1) {
    logger.warn(
      {
        current_jst_year: currentJstYear,
        min_year: JP_MARKET_HOLIDAY_MIN_YEAR,
        max_year: JP_MARKET_HOLIDAY_MAX_YEAR,
      },
      'jp_market_holidays_coverage_near_limit'
    );
    jpHolidayCoverageWarned = true;
  }
}

function isWithinJpTradingSession(now: Date): boolean {
  const jst = toJstDate(now);
  const day = jst.getUTCDay();
  if (day === 0 || day === 6) return false;
  if (isJpMarketHoliday(now)) return false;
  const minutes = jst.getUTCHours() * 60 + jst.getUTCMinutes();
  const inMorning = minutes >= 9 * 60 && minutes < 11 * 60 + 30;
  const inAfternoon = minutes >= 12 * 60 + 30 && minutes < 15 * 60;
  return inMorning || inAfternoon;
}

function getJpSessionClosureReason(now: Date): Extract<SnapshotReasonCode, 'jp_market_holiday' | 'jp_market_weekend' | 'outside_jp_session'> {
  const jst = toJstDate(now);
  const day = jst.getUTCDay();
  if (day === 0 || day === 6) return 'jp_market_weekend';
  if (isJpMarketHoliday(now)) return 'jp_market_holiday';
  return 'outside_jp_session';
}

function inferMarketStatusFromYahoo(stateRaw: unknown): MarketStatusCandidate {
  if (typeof stateRaw !== 'string') return 'unknown';
  const state = stateRaw.toUpperCase();
  if (state === 'REGULAR' || state === 'PRE' || state === 'PREPRE') return 'open';
  if (state === 'POST' || state === 'POSTPOST' || state === 'CLOSED') return 'closed';
  return 'unknown';
}

function evaluateFreshness(
  asOf: string,
  thresholds: { staleMs: number; expiredMs: number }
): FreshnessStatus {
  const asOfDate = new Date(asOf);
  if (Number.isNaN(asOfDate.getTime())) return 'invalid';

  const now = new Date();
  const ageMs = now.getTime() - asOfDate.getTime();

  if (ageMs < -FIVE_MINUTES_MS) return 'invalid';
  if (ageMs > thresholds.expiredMs) return 'expired';
  if (ageMs > thresholds.staleMs) return 'stale';
  return 'fresh';
}

function foldMarketStatus(
  candidate: MarketStatusCandidate,
  freshness: FreshnessStatus
): 'open' | 'closed' | 'unknown' {
  if (candidate === 'unknown') return 'unknown';
  if (freshness === 'invalid' || freshness === 'expired') return 'unknown';
  if (candidate === 'open') {
    if (freshness === 'fresh') return 'open';
    return 'unknown';
  }
  // closed + stale keeps "closed" for conservative UX compatibility.
  return 'closed';
}

function buildStooqEvaluation(asOf: string): SnapshotStatusEvaluation {
  const freshness = evaluateFreshness(asOf, {
    staleMs: DAILY_WARNING_STALE_MS,
    expiredMs: DAILY_STALE_MS,
  });

  const market_status = foldMarketStatus('closed', freshness);
  let reason_code: SnapshotReasonCode = 'daily_source_closed';
  if (freshness === 'invalid') reason_code = 'freshness_invalid';
  if (freshness === 'expired') reason_code = 'freshness_expired';

  return {
    market_status_candidate: 'closed',
    freshness_status: freshness,
    market_status,
    reason_code,
  };
}

function toAsOfFromUnixSeconds(epochRaw: unknown): string | null {
  if (typeof epochRaw !== 'number' || !Number.isFinite(epochRaw)) return null;
  const date = new Date(epochRaw * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function inferMarketStatusFromYahooMeta(
  stateRaw: unknown,
  asOf: string,
  symbol: Pick<SymbolRef, 'marketCode'>
): SnapshotStatusEvaluation {
  const base = inferMarketStatusFromYahoo(stateRaw);
  const freshness = evaluateFreshness(asOf, {
    staleMs: INTRADAY_STALE_MS,
    expiredMs: DAILY_STALE_MS,
  });
  const marketCode = (symbol.marketCode ?? '').toUpperCase();
  const isJpEquity = marketCode === 'TSE' || marketCode === 'JP' || marketCode === 'TYO';
  const now = new Date();
  const asOfDate = new Date(asOf);

  if (freshness === 'invalid') {
    return {
      market_status_candidate: base,
      freshness_status: freshness,
      market_status: 'unknown',
      reason_code: 'freshness_invalid',
    };
  }
  if (freshness === 'expired') {
    return {
      market_status_candidate: base,
      freshness_status: freshness,
      market_status: 'unknown',
      reason_code: 'freshness_expired',
    };
  }

  let candidate: MarketStatusCandidate = base;
  let sessionReason: Extract<SnapshotReasonCode, 'jp_market_holiday' | 'jp_market_weekend' | 'outside_jp_session'> | null = null;

  if (isJpEquity) {
    if (candidate === 'open' && !isWithinJpTradingSession(now)) {
      candidate = 'closed';
      sessionReason = getJpSessionClosureReason(now);
    } else if (candidate === 'unknown' && !isWithinJpTradingSession(now)) {
      candidate = 'closed';
      sessionReason = getJpSessionClosureReason(now);
    }
  }

  if (candidate === 'unknown') {
    const sameJstDay = toJstDateKey(now) === toJstDateKey(asOfDate);
    if (sameJstDay && isJpEquity && isWithinJpTradingSession(now)) {
      return {
        market_status_candidate: candidate,
        freshness_status: freshness,
        market_status: 'unknown',
        reason_code: 'candidate_unknown',
      };
    }
  }

  const finalMarketStatus = foldMarketStatus(candidate, freshness);
  let reason_code: SnapshotReasonCode = 'closed_by_source';
  if (candidate === 'unknown') reason_code = 'candidate_unknown';
  if (candidate === 'open' && freshness === 'stale') reason_code = 'open_but_stale';
  if (sessionReason) reason_code = sessionReason;

  return {
    market_status_candidate: candidate,
    freshness_status: freshness,
    market_status: finalMarketStatus,
    reason_code,
  };
}

function shouldLogSnapshotEvaluation(evaluation: SnapshotStatusEvaluation): boolean {
  if (evaluation.market_status === 'unknown') return true;
  if (evaluation.freshness_status !== 'fresh') return true;
  if (
    evaluation.reason_code === 'jp_market_holiday' ||
    evaluation.reason_code === 'jp_market_weekend' ||
    evaluation.reason_code === 'outside_jp_session'
  ) {
    return true;
  }
  return false;
}

function logSnapshotEvaluation(
  logger: { warn: (obj: unknown, msg?: string) => void } | undefined,
  payload: {
    symbol_id: string;
    symbol: string;
    market_code: string | null;
    source_name: string;
    as_of: string;
    evaluation: SnapshotStatusEvaluation;
  }
) {
  if (!logger?.warn) return;
  if (!shouldLogSnapshotEvaluation(payload.evaluation)) return;

  logger.warn(
    {
      symbol_id: payload.symbol_id,
      symbol: payload.symbol,
      market_code: payload.market_code,
      source_name: payload.source_name,
      as_of: payload.as_of,
      market_status_candidate: payload.evaluation.market_status_candidate,
      freshness_status: payload.evaluation.freshness_status,
      market_status: payload.evaluation.market_status,
      reason_code: payload.evaluation.reason_code,
    },
    'current_snapshot_status_evaluated'
  );
}

function getCachedSnapshot(key: string): CurrentSnapshot | undefined {
  const cached = snapshotCache.get(key);
  if (!cached) return undefined;
  if (Date.now() > cached.expiresAt) {
    snapshotCache.delete(key);
    return undefined;
  }
  return cached.value;
}

function setCache(key: string, value: CurrentSnapshot) {
  snapshotCache.set(key, {
    expiresAt: Date.now() + env.SNAPSHOT_CACHE_TTL_MS,
    value,
  });
}

function toYahooCode(symbol: Pick<SymbolRef, 'symbol' | 'symbolCode' | 'marketCode' | 'tradingviewSymbol'>): string | null {
  const marketCode = (symbol.marketCode ?? '').toUpperCase();
  const symbolCode = (symbol.symbolCode ?? '').trim();

  if (symbolCode && (marketCode === 'TSE' || marketCode === 'JP' || marketCode === 'TYO')) {
    return `${symbolCode.toUpperCase()}.T`;
  }

  const tradingview = (symbol.tradingviewSymbol ?? '').trim();
  if (tradingview) {
    const parts = tradingview.split(':');
    if (parts.length === 2) {
      const code = parts[1]?.trim();
      if (code) {
        return `${code.toUpperCase()}.T`;
      }
    }
  }

  const fallback = (symbol.symbol ?? '').trim();
  if (fallback) {
    return `${fallback.toUpperCase()}.T`;
  }

  return null;
}

async function fetchStooqDailySnapshot(
  symbol: SymbolRef,
  logger?: { warn: (obj: unknown, msg?: string) => void }
): Promise<CurrentSnapshot | null> {
  const stooqCode = toStooqCode(symbol);
  if (!stooqCode) return null;

  const url = env.SNAPSHOT_STOOQ_DAILY_URL_TEMPLATE.replace('{symbol}', encodeURIComponent(stooqCode));
  const response = await fetch(url, { signal: AbortSignal.timeout(env.SNAPSHOT_FETCH_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`snapshot_primary_http_${response.status}`);
  }

  const content = await response.text();
  const rows = parseCsv(content);
  if (rows.length === 0) {
    logger?.warn?.(
      {
        symbol_id: symbol.id,
        symbol_code: symbol.symbolCode,
        market_code: symbol.marketCode,
        stooq_code: stooqCode,
      },
      'current_snapshot_primary_empty'
    );
    return null;
  }

  const latest = rows[rows.length - 1];
  const previous = rows.length > 1 ? rows[rows.length - 2] : null;
  const change = previous ? latest.close - previous.close : null;
  const changePercent = previous && previous.close !== 0
    ? (change! / previous.close) * 100
    : null;
  const asOf = toAsOf(latest.date);
  if (!asOf) return null;
  const evaluation = buildStooqEvaluation(asOf);
  logSnapshotEvaluation(logger, {
    symbol_id: symbol.id,
    symbol: symbol.symbol,
    market_code: symbol.marketCode,
    source_name: 'stooq_daily',
    as_of: asOf,
    evaluation,
  });

  return {
    last_price: latest.close,
    change,
    change_percent: changePercent,
    volume: latest.volume,
    as_of: asOf,
    market_status: evaluation.market_status,
    source_name: 'stooq_daily',
  };
}

async function fetchYahooChartSnapshot(
  symbol: SymbolRef,
  logger?: { warn: (obj: unknown, msg?: string) => void }
): Promise<CurrentSnapshot | null> {
  const yahooCode = toYahooCode(symbol);
  if (!yahooCode) return null;

  const url = env.SNAPSHOT_YAHOO_CHART_URL_TEMPLATE.replace('{symbol}', encodeURIComponent(yahooCode));
  const response = await fetch(url, { signal: AbortSignal.timeout(env.SNAPSHOT_FETCH_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`snapshot_secondary_http_${response.status}`);
  }

  const body = await response.json() as any;
  const result = Array.isArray(body?.chart?.result) ? body.chart.result[0] : null;
  const meta = result?.meta;
  if (!meta) return null;

  const price = Number(meta.regularMarketPrice);
  if (!Number.isFinite(price)) return null;
  const previousCloseRaw = Number(meta.previousClose ?? meta.chartPreviousClose);
  const previousClose = Number.isFinite(previousCloseRaw) ? previousCloseRaw : null;
  const change = previousClose !== null ? price - previousClose : null;
  const changePercent = previousClose !== null && previousClose !== 0
    ? (change! / previousClose) * 100
    : null;
  const volumeRaw = Number(meta.regularMarketVolume);
  const volume = Number.isFinite(volumeRaw) ? volumeRaw : null;
  const asOf = toAsOfFromUnixSeconds(meta.regularMarketTime);
  if (!asOf) return null;
  const evaluation = inferMarketStatusFromYahooMeta(meta.marketState, asOf, symbol);
  logSnapshotEvaluation(logger, {
    symbol_id: symbol.id,
    symbol: symbol.symbol,
    market_code: symbol.marketCode,
    source_name: 'yahoo_chart',
    as_of: asOf,
    evaluation,
  });

  return {
    last_price: price,
    change,
    change_percent: changePercent,
    volume,
    as_of: asOf,
    market_status: evaluation.market_status,
    source_name: 'yahoo_chart',
  };
}

export async function getCurrentSnapshotForSymbol(
  symbol: SymbolRef,
  logger?: { warn: (obj: unknown, msg?: string) => void }
): Promise<CurrentSnapshot | null> {
  warnIfJpHolidayCoverageNearingLimit(logger);

  const baseCode = symbol.symbolCode?.trim() || symbol.symbol?.trim() || symbol.id;
  const cacheKey = `snapshot:${baseCode.toLowerCase()}`;
  const cached = getCachedSnapshot(cacheKey);
  if (cached !== undefined) return cached;

  try {
    const primary = await fetchStooqDailySnapshot(symbol, logger);
    if (primary) {
      setCache(cacheKey, primary);
      return primary;
    }
  } catch (error) {
    logger?.warn?.(
      {
        symbol_id: symbol.id,
        symbol_code: symbol.symbolCode,
        market_code: symbol.marketCode,
        error: error instanceof Error ? error.message : String(error),
      },
      'current_snapshot_primary_failed'
    );
  }

  logger?.warn?.(
    {
      symbol_id: symbol.id,
      symbol_code: symbol.symbolCode,
      market_code: symbol.marketCode,
    },
    'current_snapshot_secondary_attempt'
  );

  try {
    const secondary = await fetchYahooChartSnapshot(symbol, logger);
    if (secondary) {
      logger?.warn?.(
        {
          symbol_id: symbol.id,
          symbol_code: symbol.symbolCode,
          market_code: symbol.marketCode,
          source_name: secondary.source_name,
        },
        'current_snapshot_secondary_succeeded'
      );
      setCache(cacheKey, secondary);
      return secondary;
    }
  } catch (error) {
    logger?.warn?.(
      {
        symbol_id: symbol.id,
        symbol_code: symbol.symbolCode,
        market_code: symbol.marketCode,
        error: error instanceof Error ? error.message : String(error),
      },
      'current_snapshot_secondary_failed'
    );
  }

  logger?.warn?.(
    {
      symbol_id: symbol.id,
      symbol_code: symbol.symbolCode,
      market_code: symbol.marketCode,
    },
    'current_snapshot_all_sources_failed'
  );
  return null;
}

export async function getCurrentSnapshotsForSymbols(
  symbols: SymbolRef[],
  logger?: { warn: (obj: unknown, msg?: string) => void }
): Promise<Map<string, CurrentSnapshot | null>> {
  const entries = await Promise.all(
    symbols.map(async (symbol) => {
      const snapshot = await getCurrentSnapshotForSymbol(symbol, logger);
      return [symbol.id, snapshot] as const;
    })
  );

  return new Map(entries);
}

export function __resetSnapshotCacheForTests() {
  snapshotCache.clear();
  jpHolidayCoverageWarned = false;
}

export function __getJpMarketHolidayCoverageForTests() {
  return {
    minYear: JP_MARKET_HOLIDAY_MIN_YEAR,
    maxYear: JP_MARKET_HOLIDAY_MAX_YEAR,
    years: [...JP_MARKET_HOLIDAY_YEARS],
  };
}
