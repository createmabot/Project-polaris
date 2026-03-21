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

function inferMarketStatus(dateText: string): 'open' | 'closed' | 'unknown' {
  const asOf = toAsOf(dateText);
  if (!asOf) return 'unknown';
  const now = new Date();
  const asOfDate = new Date(asOf);

  const sameDay =
    now.getUTCFullYear() === asOfDate.getUTCFullYear() &&
    now.getUTCMonth() === asOfDate.getUTCMonth() &&
    now.getUTCDate() === asOfDate.getUTCDate();

  if (!sameDay) return 'closed';
  return 'open';
}

function inferMarketStatusFromYahoo(stateRaw: unknown): 'open' | 'closed' | 'unknown' {
  if (typeof stateRaw !== 'string') return 'unknown';
  const state = stateRaw.toUpperCase();
  if (state === 'REGULAR' || state === 'PRE' || state === 'PREPRE') return 'open';
  if (state === 'POST' || state === 'POSTPOST' || state === 'CLOSED') return 'closed';
  return 'unknown';
}

function toAsOfFromUnixSeconds(epochRaw: unknown): string | null {
  if (typeof epochRaw !== 'number' || !Number.isFinite(epochRaw)) return null;
  const date = new Date(epochRaw * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
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

  return {
    last_price: latest.close,
    change,
    change_percent: changePercent,
    volume: latest.volume,
    as_of: asOf,
    market_status: inferMarketStatus(latest.date),
    source_name: 'stooq_daily',
  };
}

async function fetchYahooChartSnapshot(symbol: SymbolRef): Promise<CurrentSnapshot | null> {
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

  return {
    last_price: price,
    change,
    change_percent: changePercent,
    volume,
    as_of: asOf,
    market_status: inferMarketStatusFromYahoo(meta.marketState),
    source_name: 'yahoo_chart',
  };
}

export async function getCurrentSnapshotForSymbol(
  symbol: SymbolRef,
  logger?: { warn: (obj: unknown, msg?: string) => void }
): Promise<CurrentSnapshot | null> {
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
    const secondary = await fetchYahooChartSnapshot(symbol);
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
}
