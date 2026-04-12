import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../db';
import { AppError, formatSuccess } from '../utils/response';
import { getCurrentSnapshotsForSymbols } from '../market/snapshot';

type HomeSummaryType = 'latest' | 'morning' | 'evening';

type HomeQuery = {
  summary_type?: string;
  summaryType?: string;
  date?: string;
};

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function normalizeSummaryType(input?: string): HomeSummaryType {
  const normalized = (input ?? 'latest').trim().toLowerCase();
  if (normalized === '' || normalized === 'latest') {
    return 'latest';
  }
  if (normalized === 'morning' || normalized === 'evening') {
    return normalized;
  }
  throw new AppError(400, 'VALIDATION_ERROR', 'summary_type must be one of latest|morning|evening');
}

function normalizeDate(input?: string): string | null {
  if (!input) {
    return null;
  }
  const trimmed = input.trim();
  if (!DATE_ONLY_PATTERN.test(trimmed)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'date must be YYYY-MM-DD');
  }
  const [yearText, monthText, dayText] = trimmed.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  const isSameDate =
    utcDate.getUTCFullYear() === year &&
    utcDate.getUTCMonth() === month - 1 &&
    utcDate.getUTCDate() === day;
  if (!isSameDate) {
    throw new AppError(400, 'VALIDATION_ERROR', 'date must be YYYY-MM-DD');
  }
  return trimmed;
}

function buildJstDayRange(date: string): { gte: Date; lt: Date } {
  const start = new Date(`${date}T00:00:00+09:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { gte: start, lt: end };
}

function inferDailySummaryType(summary: any): HomeSummaryType {
  const context = summary?.generationContextJson && typeof summary.generationContextJson === 'object'
    ? summary.generationContextJson
    : null;
  const candidates = [
    context?.summary_type,
    context?.summaryType,
    context?.time_of_day,
    context?.timeOfDay,
    context?.slot,
    context?.summary_slot,
  ];

  for (const candidate of candidates) {
    const normalized = typeof candidate === 'string' ? candidate.trim().toLowerCase() : '';
    if (normalized === 'morning' || normalized === 'evening' || normalized === 'latest') {
      return normalized as HomeSummaryType;
    }
  }

  const generatedAt =
    summary?.generatedAt instanceof Date
      ? summary.generatedAt
      : summary?.generatedAt
        ? new Date(summary.generatedAt)
        : null;
  if (generatedAt && !Number.isNaN(generatedAt.getTime())) {
    const hourInJst = Number(
      generatedAt.toLocaleString('en-US', {
        hour: '2-digit',
        hour12: false,
        timeZone: 'Asia/Tokyo',
      }),
    );
    return hourInJst < 15 ? 'morning' : 'evening';
  }

  return 'latest';
}

function selectDailySummary(
  summaries: any[],
  summaryType: HomeSummaryType,
): any | null {
  if (summaries.length === 0) {
    return null;
  }
  if (summaryType === 'latest') {
    return summaries[0] ?? null;
  }
  return summaries.find((summary) => inferDailySummaryType(summary) === summaryType) ?? null;
}

function buildMarketOverviewFromRecentAlerts(
  recentAlerts: Array<{
    symbol: {
      id: string;
      symbol?: string | null;
      symbolCode?: string | null;
      displayName?: string | null;
    } | null;
    current_snapshot?: {
      last_price?: number | null;
      change?: number | null;
      change_percent?: number | null;
    } | null;
  }>,
) {
  const seen = new Set<string>();
  const indices: Array<{
    code: string;
    display_name: string;
    price: number;
    change_value: number | null;
    change_rate: number | null;
  }> = [];

  for (const alert of recentAlerts) {
    const symbol = alert.symbol;
    const snapshot = alert.current_snapshot;
    if (!symbol?.id || seen.has(symbol.id)) continue;
    if (!snapshot || typeof snapshot.last_price !== 'number' || !Number.isFinite(snapshot.last_price)) {
      continue;
    }

    seen.add(symbol.id);
    const symbolCode = (symbol.symbolCode ?? '').trim();
    const fallbackCode = (symbol.symbol ?? '').trim();
    const code = symbolCode || fallbackCode || symbol.id;
    indices.push({
      code,
      display_name: symbol.displayName ?? code,
      price: snapshot.last_price,
      change_value:
        typeof snapshot.change === 'number' && Number.isFinite(snapshot.change) ? snapshot.change : null,
      change_rate:
        typeof snapshot.change_percent === 'number' && Number.isFinite(snapshot.change_percent)
          ? snapshot.change_percent
          : null,
    });
  }

  return {
    indices,
    fx: [],
    sectors: [],
  };
}

export async function homeRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = (request.query ?? {}) as HomeQuery;
    const summaryType = normalizeSummaryType(query.summary_type ?? query.summaryType);
    const date = normalizeDate(query.date);

    // 1. Fetch recent alerts (e.g., last 10)
    // We join the symbol to display the name/ticker, and we also try to get the associated aiSummary
    // If it's unresolved_symbol or needs_review, it might not have an ai_summary, which is fine.
    const recentAlertsRaw = await prisma.alertEvent.findMany({
      take: 10,
      orderBy: {
        triggeredAt: 'desc',
      },
      include: {
        symbol: true,
        // Since an alert could theoretically have multiple summaries over time, 
        // we could just fetch the latest one directly or via a nested query.
      },
    });

    // To get the latest ai_summary for each alert efficiently, we can fetch them separately
    // based on targetEntityId, or just use findMany.
    const alertIds = recentAlertsRaw.map((a: any) => a.id);
    const summaries = await prisma.aiSummary.findMany({
      where: {
        targetEntityType: 'alert_event',
        targetEntityId: { in: alertIds },
        summaryScope: 'alert_reason', // As per specs docs/5
      },
      orderBy: { generatedAt: 'desc' },
    });

    const alertSymbols = recentAlertsRaw
      .map((alert: any) => alert.symbol)
      .filter((symbol: any) => !!symbol && !!symbol.id)
      .map((symbol: any) => ({
        id: symbol.id,
        symbol: symbol.symbol,
        symbolCode: symbol.symbolCode,
        marketCode: symbol.marketCode,
        tradingviewSymbol: symbol.tradingviewSymbol,
      }));

    const snapshotMap = await getCurrentSnapshotsForSymbols(alertSymbols, fastify.log);

    // Map summaries to alerts (simplest: first matching summary is the latest due to orderBy)
    const recentAlerts = recentAlertsRaw.map((alert: any) => {
      const relatedSummary = summaries.find((s: any) => s.targetEntityId === alert.id) || null;
      return {
        ...alert,
        current_snapshot: alert.symbolId ? (snapshotMap.get(alert.symbolId) ?? null) : null,
        related_ai_summary: relatedSummary,
      };
    });

    // 2. Fetch daily summary
    // Latest / morning / evening can be selected via query while preserving existing response shape.
    const dateRange = date ? buildJstDayRange(date) : null;
    const dailySummaries = await prisma.aiSummary.findMany({
      where: {
        targetEntityType: 'market_snapshot',
        summaryScope: 'daily',
        ...(dateRange ? { generatedAt: { gte: dateRange.gte, lt: dateRange.lt } } : {}),
      },
      orderBy: { generatedAt: 'desc' },
    });
    const dailySummary = selectDailySummary(dailySummaries, summaryType);

    // 3. Watchlists and key events (Empty placeholders for MVP)
    const watchlist_symbols: any[] = [];
    const positions: any[] = [];
    const key_events: any[] = [];
    const market_overview = buildMarketOverviewFromRecentAlerts(recentAlerts);

    const data = {
      market_overview,
      watchlist_symbols,
      positions,
      recent_alerts: recentAlerts,
      daily_summary: dailySummary,
      key_events,
    };

    return reply.status(200).send(formatSuccess(request, data));
  });
}
