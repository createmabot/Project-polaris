import { prisma } from '../db';
import { AppError } from '../utils/response';
import {
  defaultCalendarRange,
  normalizeCalendarDate,
  normalizeEventType,
  normalizeImportance,
  normalizeLimit,
  normalizeStatus,
  toDateRangeWhere,
} from './normalization';
import {
  createInvestmentCalendarProvider,
  createInvestmentCalendarProviders,
  getConfiguredProviderNames,
  InvestmentCalendarProvider,
} from './provider';
import { InvestmentCalendarFetchInput, InvestmentCalendarProviderName, InvestmentCalendarRefreshResult } from './types';

type CalendarSymbol = {
  id: string;
  symbol: string | null;
  symbolCode: string | null;
  marketCode: string | null;
  displayName: string | null;
};

const PUBLIC_PROVIDER_STALE_DAYS = 14;
const OFFICIAL_MARKET_STALE_DAYS = 30;

function toSourceType(provider: InvestmentCalendarProvider): 'seed' | 'public_provider' {
  return provider.name === 'stub' ? 'seed' : 'public_provider';
}

function resolveCalendarProviderName(row: any): string {
  if (row.sourceType === 'seed') return 'seed';
  const sourceName = typeof row.sourceName === 'string' ? row.sourceName : '';
  if (sourceName === 'federal_reserve' || sourceName === 'boj' || sourceName === 'nyse' || sourceName === 'official_market') {
    return 'official_market';
  }
  return sourceName || row.sourceType || 'unknown';
}

function getCalendarStaleThresholdDays(row: any): number | null {
  if (row.sourceType !== 'public_provider') return null;
  return resolveCalendarProviderName(row) === 'official_market'
    ? OFFICIAL_MARKET_STALE_DAYS
    : PUBLIC_PROVIDER_STALE_DAYS;
}

function isCalendarEventStale(row: any, now = new Date()): boolean {
  const thresholdDays = getCalendarStaleThresholdDays(row);
  if (!thresholdDays || !(row.fetchedAt instanceof Date)) return false;
  const ageMs = now.getTime() - row.fetchedAt.getTime();
  return ageMs >= thresholdDays * 24 * 60 * 60 * 1000;
}

export function toCalendarEventView(row: any, scope?: 'symbol' | 'market') {
  const isMarket = !row.symbolId;
  return {
    id: row.id,
    scope: scope ?? (isMarket ? 'market' : 'symbol'),
    symbol_id: row.symbolId ?? null,
    symbol_code: row.symbol?.symbolCode ?? row.symbol?.symbol ?? null,
    display_name: row.symbol?.displayName ?? row.symbol?.symbolCode ?? row.symbol?.symbol ?? null,
    event_date: row.eventDate instanceof Date ? row.eventDate.toISOString().slice(0, 10) : null,
    event_time: row.eventTime ?? null,
    timezone: row.timezone,
    event_type: row.eventType,
    title: row.title,
    description: row.description ?? null,
    importance: row.importance,
    source_type: row.sourceType,
    source_name: row.sourceName ?? null,
    source_label: row.sourceLabel ?? null,
    source_url: row.sourceUrl ?? null,
    status: row.status,
    fetched_at: row.fetchedAt instanceof Date ? row.fetchedAt.toISOString() : null,
    provider: resolveCalendarProviderName(row),
    is_stale: isCalendarEventStale(row),
  };
}

function buildCalendarFreshnessMeta(events: any[]) {
  const lastFetchedAt = events.reduce<Date | null>((latest, event) => {
    if (!(event.fetchedAt instanceof Date)) return latest;
    return latest === null || event.fetchedAt.getTime() > latest.getTime() ? event.fetchedAt : latest;
  }, null);
  const providerMap = new Map<string, { provider: string; lastFetchedAt: Date | null; staleEventCount: number }>();

  for (const event of events) {
    const provider = resolveCalendarProviderName(event);
    const current = providerMap.get(provider) ?? { provider, lastFetchedAt: null, staleEventCount: 0 };
    if (event.fetchedAt instanceof Date && (current.lastFetchedAt === null || event.fetchedAt.getTime() > current.lastFetchedAt.getTime())) {
      current.lastFetchedAt = event.fetchedAt;
    }
    if (isCalendarEventStale(event)) current.staleEventCount += 1;
    providerMap.set(provider, current);
  }

  return {
    last_fetched_at: lastFetchedAt ? lastFetchedAt.toISOString() : null,
    stale_event_count: events.filter((event) => isCalendarEventStale(event)).length,
    provider_statuses: Array.from(providerMap.values())
      .sort((a, b) => a.provider.localeCompare(b.provider))
      .map((status) => ({
        provider: status.provider,
        status: 'succeeded',
        last_fetched_at: status.lastFetchedAt ? status.lastFetchedAt.toISOString() : null,
        stale_event_count: status.staleEventCount,
      })),
  };
}

function normalizeDateRange(input: { from?: unknown; to?: unknown }) {
  const fallback = defaultCalendarRange();
  const from = input.from === undefined || input.from === null || input.from === ''
    ? fallback.from
    : normalizeCalendarDate(input.from, 'from');
  const to = input.to === undefined || input.to === null || input.to === ''
    ? fallback.to
    : normalizeCalendarDate(input.to, 'to');
  if (from > to) {
    throw new AppError(400, 'VALIDATION_ERROR', 'from must be earlier than or equal to to.');
  }
  return { from, to };
}

export function normalizeCalendarListQuery(query: Record<string, unknown>) {
  const range = normalizeDateRange(query);
  return {
    ...range,
    eventType: normalizeEventType(query.event_type),
    importance: normalizeImportance(query.importance),
    status: normalizeStatus(query.status),
    limit: normalizeLimit(query.limit),
  };
}

export function normalizeCalendarRefreshBody(body: Record<string, unknown> | null | undefined) {
  return normalizeDateRange(body ?? {});
}

export async function listSymbolCalendarEvents(symbolId: string, query: Record<string, unknown>) {
  const normalized = normalizeCalendarListQuery(query);
  const where: any = {
    symbolId,
    eventDate: toDateRangeWhere(normalized.from, normalized.to),
  };
  if (normalized.status !== 'all') where.status = normalized.status;
  if (normalized.eventType) where.eventType = normalized.eventType;
  if (normalized.importance) where.importance = normalized.importance;

  const events = await (prisma as any).investmentCalendarEvent.findMany({
    where,
    orderBy: [{ eventDate: 'asc' }, { eventTime: 'asc' }, { createdAt: 'asc' }],
    take: normalized.limit,
    include: { symbol: true },
  });
  return {
    events: events.map((event: any) => toCalendarEventView(event, 'symbol')),
    meta: {
      scope: 'symbol',
      symbol_id: symbolId,
      from: normalized.from,
      to: normalized.to,
      ...buildCalendarFreshnessMeta(events),
    },
  };
}

async function resolveSymbolsByCodes(symbols: CalendarSymbol[]) {
  const byCode = new Map<string, CalendarSymbol>();
  for (const symbol of symbols) {
    for (const value of [symbol.symbolCode, symbol.symbol]) {
      const key = value?.trim().toUpperCase();
      if (key) byCode.set(key, symbol);
    }
  }
  return byCode;
}

export async function refreshInvestmentCalendarEvents(
  input: InvestmentCalendarFetchInput,
  provider: InvestmentCalendarProvider = createInvestmentCalendarProvider(),
): Promise<InvestmentCalendarRefreshResult> {
  const events = await provider.fetchEvents(input);
  const symbolByCode = await resolveSymbolsByCodes(input.symbols);
  let savedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  const fetchedAt = new Date();

  for (const event of events) {
    if (!input.includeMarketEvents && !event.symbolCode) {
      skippedCount += 1;
      continue;
    }
    const symbolCode = event.symbolCode?.trim().toUpperCase();
    const symbol = symbolCode ? symbolByCode.get(symbolCode) ?? null : null;
    if (event.symbolCode && !symbol) {
      skippedCount += 1;
      continue;
    }

    const existing = await (prisma as any).investmentCalendarEvent.findUnique({
      where: {
        sourceType_externalId: {
          sourceType: toSourceType(provider),
          externalId: event.externalId,
        },
      },
      select: { id: true },
    });
    await (prisma as any).investmentCalendarEvent.upsert({
      where: {
        sourceType_externalId: {
          sourceType: toSourceType(provider),
          externalId: event.externalId,
        },
      },
      update: {
        symbolId: symbol?.id ?? null,
        eventDate: new Date(`${event.eventDate}T00:00:00.000Z`),
        eventTime: event.eventTime ?? null,
        timezone: event.timezone,
        eventType: event.eventType,
        title: event.title,
        description: event.description ?? null,
        importance: event.importance,
        sourceName: event.sourceName,
        sourceLabel: event.sourceLabel ?? null,
        sourceUrl: event.sourceUrl ?? null,
        status: 'active',
        fetchedAt,
      },
      create: {
        symbolId: symbol?.id ?? null,
        eventDate: new Date(`${event.eventDate}T00:00:00.000Z`),
        eventTime: event.eventTime ?? null,
        timezone: event.timezone,
        eventType: event.eventType,
        title: event.title,
        description: event.description ?? null,
        importance: event.importance,
        sourceType: toSourceType(provider),
        sourceName: event.sourceName,
        sourceLabel: event.sourceLabel ?? null,
        sourceUrl: event.sourceUrl ?? null,
        externalId: event.externalId,
        status: 'active',
        fetchedAt,
      },
    });
    if (existing) updatedCount += 1;
    else savedCount += 1;
  }

  return {
    status: 'succeeded',
    saved_count: savedCount,
    updated_count: updatedCount,
    skipped_count: skippedCount,
    failed_count: 0,
    from: input.from,
    to: input.to,
    source: provider.name === 'stub' ? 'stub' : 'public_provider',
    manual_only: true,
    provider: provider.name,
    providers: [toProviderRefreshSummary(provider, {
      status: 'succeeded',
      saved_count: savedCount,
      updated_count: updatedCount,
      skipped_count: skippedCount,
      failed_count: 0,
      from: input.from,
      to: input.to,
      source: provider.name === 'stub' ? 'stub' : 'public_provider',
      manual_only: true,
    })],
  };
}

function toProviderRefreshSummary(
  provider: InvestmentCalendarProvider,
  result: InvestmentCalendarRefreshResult,
): NonNullable<InvestmentCalendarRefreshResult['providers']>[number] {
  return {
    provider: provider.name,
    status: 'succeeded',
    saved_count: result.saved_count,
    updated_count: result.updated_count,
    skipped_count: result.skipped_count,
    failed_count: result.failed_count,
    error_code: null,
  };
}

function toProviderFailureSummary(
  provider: InvestmentCalendarProvider,
  error: unknown,
): NonNullable<InvestmentCalendarRefreshResult['providers']>[number] {
  return {
    provider: provider.name,
    status: 'failed',
    saved_count: 0,
    updated_count: 0,
    skipped_count: 0,
    failed_count: 1,
    error_code: error instanceof AppError ? error.code : 'INVESTMENT_CALENDAR_REFRESH_FAILED',
  };
}

function summarizeProviderResults(
  input: InvestmentCalendarFetchInput,
  providerResults: NonNullable<InvestmentCalendarRefreshResult['providers']>,
): InvestmentCalendarRefreshResult {
  const savedCount = providerResults.reduce((sum, result) => sum + result.saved_count, 0);
  const updatedCount = providerResults.reduce((sum, result) => sum + result.updated_count, 0);
  const skippedCount = providerResults.reduce((sum, result) => sum + result.skipped_count, 0);
  const failedCount = providerResults.reduce((sum, result) => sum + result.failed_count, 0);
  const succeededCount = providerResults.filter((result) => result.status === 'succeeded').length;
  const status = succeededCount === providerResults.length
    ? 'succeeded'
    : succeededCount > 0
      ? 'partial_success'
      : 'failed';
  const source = providerResults.length === 1 && providerResults[0].provider === 'stub' ? 'stub' : 'public_provider';
  return {
    status,
    saved_count: savedCount,
    updated_count: updatedCount,
    skipped_count: skippedCount,
    failed_count: failedCount,
    from: input.from,
    to: input.to,
    source,
    manual_only: true,
    providers: providerResults,
  };
}

export async function getHomeCalendarSymbols() {
  const [watchlistItems, positions] = await Promise.all([
    (prisma as any).watchlistItem.findMany({ include: { symbol: true } }),
    (prisma as any).position.findMany({ include: { symbol: true } }),
  ]);
  const byId = new Map<string, CalendarSymbol>();
  for (const row of [...watchlistItems, ...positions]) {
    const symbol = row.symbol;
    if (!symbol?.id || byId.has(symbol.id)) continue;
    byId.set(symbol.id, {
      id: symbol.id,
      symbol: symbol.symbol,
      symbolCode: symbol.symbolCode,
      marketCode: symbol.marketCode,
      displayName: symbol.displayName,
    });
  }
  return Array.from(byId.values());
}

export async function listHomeInvestmentCalendar(from?: string, to?: string) {
  const range = normalizeDateRange({ from, to });
  const symbols = await getHomeCalendarSymbols();
  const symbolIds = symbols.map((symbol) => symbol.id);
  const events = await (prisma as any).investmentCalendarEvent.findMany({
    where: {
      status: 'active',
      eventDate: toDateRangeWhere(range.from, range.to),
      OR: [
        { symbolId: null },
        ...(symbolIds.length > 0 ? [{ symbolId: { in: symbolIds } }] : []),
      ],
    },
    orderBy: [{ eventDate: 'asc' }, { eventTime: 'asc' }, { importance: 'asc' }],
    take: 20,
    include: { symbol: true },
  });
  return {
    events: events.map((event: any) => toCalendarEventView(event)),
    meta: {
      from: range.from,
      to: range.to,
      source: 'watchlist_positions_and_market_events',
      manual_refresh_available: true,
      ...buildCalendarFreshnessMeta(events),
    },
  };
}

export async function refreshHomeInvestmentCalendar(input: { from?: unknown; to?: unknown; include_market_events?: unknown }) {
  const range = normalizeDateRange(input);
  const symbols = await getHomeCalendarSymbols();
  const includeMarketEvents = input.include_market_events !== false;
  const fetchInput = {
    from: range.from,
    to: range.to,
    symbols,
    includeMarketEvents,
  };
  const providers = createInvestmentCalendarProviders();
  const providerResults: NonNullable<InvestmentCalendarRefreshResult['providers']> = [];
  for (const provider of providers) {
    try {
      const result = await refreshInvestmentCalendarEvents(fetchInput, provider);
      providerResults.push(toProviderRefreshSummary(provider, result));
    } catch (error) {
      providerResults.push(toProviderFailureSummary(provider, error));
    }
  }
  return summarizeProviderResults(fetchInput, providerResults);
}

function isJapaneseStockSymbol(symbol: CalendarSymbol) {
  const market = (symbol.marketCode ?? '').trim().toUpperCase();
  const code = (symbol.symbolCode ?? symbol.symbol ?? '').trim().toUpperCase();
  return market.includes('JP') || market.includes('TSE') || market.includes('TYO') || /^\d{4,5}$/.test(code);
}

export function createSymbolCalendarProvider(symbol: CalendarSymbol): InvestmentCalendarProvider {
  const configuredNames = getConfiguredProviderNames();
  if (configuredNames.includes('jquants') && isJapaneseStockSymbol(symbol)) {
    return createInvestmentCalendarProvider('jquants');
  }
  const symbolProviderName = configuredNames.find((name): name is InvestmentCalendarProviderName =>
    name === 'public' || name === 'stub');
  if (symbolProviderName) {
    return createInvestmentCalendarProvider(symbolProviderName);
  }
  if (configuredNames.length === 1) {
    return createInvestmentCalendarProvider(configuredNames[0]);
  }
  return createInvestmentCalendarProvider('alpha_vantage');
}
