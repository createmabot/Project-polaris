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
  value: CurrentSnapshot | null;
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

function getCachedSnapshot(key: string): CurrentSnapshot | null | undefined {
  const cached = snapshotCache.get(key);
  if (!cached) return undefined;
  if (Date.now() > cached.expiresAt) {
    snapshotCache.delete(key);
    return undefined;
  }
  return cached.value;
}

function setCache(key: string, value: CurrentSnapshot | null) {
  snapshotCache.set(key, {
    expiresAt: Date.now() + env.SNAPSHOT_CACHE_TTL_MS,
    value,
  });
}

export async function getCurrentSnapshotForSymbol(
  symbol: SymbolRef,
  logger?: { warn: (obj: unknown, msg?: string) => void }
): Promise<CurrentSnapshot | null> {
  const stooqCode = toStooqCode(symbol);
  if (!stooqCode) return null;

  const cacheKey = `stooq:${stooqCode}`;
  const cached = getCachedSnapshot(cacheKey);
  if (cached !== undefined) return cached;

  const url = env.SNAPSHOT_STOOQ_DAILY_URL_TEMPLATE.replace('{symbol}', encodeURIComponent(stooqCode));

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(env.SNAPSHOT_FETCH_TIMEOUT_MS) });
    if (!response.ok) {
      throw new Error(`snapshot_http_${response.status}`);
    }
    const content = await response.text();
    const rows = parseCsv(content);
    if (rows.length === 0) {
      setCache(cacheKey, null);
      return null;
    }

    const latest = rows[rows.length - 1];
    const previous = rows.length > 1 ? rows[rows.length - 2] : null;
    const change = previous ? latest.close - previous.close : null;
    const changePercent = previous && previous.close !== 0
      ? (change! / previous.close) * 100
      : null;
    const asOf = toAsOf(latest.date);
    if (!asOf) {
      setCache(cacheKey, null);
      return null;
    }

    const snapshot: CurrentSnapshot = {
      last_price: latest.close,
      change,
      change_percent: changePercent,
      volume: latest.volume,
      as_of: asOf,
      market_status: inferMarketStatus(latest.date),
      source_name: 'stooq_daily',
    };

    setCache(cacheKey, snapshot);
    return snapshot;
  } catch (error) {
    logger?.warn?.(
      {
        symbol_id: symbol.id,
        symbol_code: symbol.symbolCode,
        market_code: symbol.marketCode,
        stooq_code: stooqCode,
        error: error instanceof Error ? error.message : String(error),
      },
      'current_snapshot_fetch_failed'
    );
    setCache(cacheKey, null);
    return null;
  }
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
