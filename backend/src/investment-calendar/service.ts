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
import { createInvestmentCalendarProvider, InvestmentCalendarProvider } from './provider';
import { InvestmentCalendarFetchInput, InvestmentCalendarRefreshResult } from './types';

type CalendarSymbol = {
  id: string;
  symbol: string | null;
  symbolCode: string | null;
  marketCode: string | null;
  displayName: string | null;
};

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
          sourceType: provider.name === 'public' ? 'public_provider' : 'seed',
          externalId: event.externalId,
        },
      },
      select: { id: true },
    });
    await (prisma as any).investmentCalendarEvent.upsert({
      where: {
        sourceType_externalId: {
          sourceType: provider.name === 'public' ? 'public_provider' : 'seed',
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
        sourceType: provider.name === 'public' ? 'public_provider' : 'seed',
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
    source: provider.name === 'public' ? 'public_provider' : 'stub',
    manual_only: true,
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
    },
  };
}

export async function refreshHomeInvestmentCalendar(input: { from?: unknown; to?: unknown; include_market_events?: unknown }) {
  const range = normalizeDateRange(input);
  const symbols = await getHomeCalendarSymbols();
  const includeMarketEvents = input.include_market_events !== false;
  return refreshInvestmentCalendarEvents({
    from: range.from,
    to: range.to,
    symbols,
    includeMarketEvents,
  });
}
