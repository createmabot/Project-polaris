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
      marketCode?: string | null;
      tradingviewSymbol?: string | null;
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
  const fx: Array<{
    code: string;
    display_name: string;
    price: number;
    change_value: number | null;
    change_rate: number | null;
  }> = [];

  const FX_CODE_PATTERN = /^[A-Z]{6}$/;
  const FX_TV_PREFIXES = ['FOREX:', 'FX_IDC:'];

  function normalizeCandidate(value?: string | null): string {
    return (value ?? '').trim().toUpperCase();
  }

  function normalizeFxCode(value?: string | null): string {
    return normalizeCandidate(value).replace(/[^A-Z]/g, '');
  }

  function isFxSymbol(symbol: {
    symbol?: string | null;
    symbolCode?: string | null;
    marketCode?: string | null;
    tradingviewSymbol?: string | null;
  }): boolean {
    const marketCode = normalizeCandidate(symbol.marketCode);
    if (marketCode === 'FX' || marketCode === 'FOREX') {
      return true;
    }

    const tradingview = normalizeCandidate(symbol.tradingviewSymbol);
    if (FX_TV_PREFIXES.some((prefix) => tradingview.startsWith(prefix))) {
      return true;
    }

    // If market code is explicitly non-FX, do not classify as FX by ticker pattern.
    if (marketCode) {
      return false;
    }

    const symbolCode = normalizeFxCode(symbol.symbolCode);
    const symbolText = normalizeFxCode(symbol.symbol);
    return FX_CODE_PATTERN.test(symbolCode) || FX_CODE_PATTERN.test(symbolText);
  }

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
    const row = {
      code,
      display_name: symbol.displayName ?? code,
      price: snapshot.last_price,
      change_value:
        typeof snapshot.change === 'number' && Number.isFinite(snapshot.change) ? snapshot.change : null,
      change_rate:
        typeof snapshot.change_percent === 'number' && Number.isFinite(snapshot.change_percent)
          ? snapshot.change_percent
          : null,
    };

    if (isFxSymbol(symbol)) {
      fx.push(row);
    } else {
      indices.push(row);
    }
  }

  return {
    indices,
    fx,
    sectors: [],
  };
}

function toJstDateText(input?: Date | string | null): string | null {
  if (!input) return null;
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
}

function buildKeyEventsFromRecentAlerts(
  recentAlerts: Array<{
    alertName?: string | null;
    alertType?: string | null;
    triggeredAt?: Date | string | null;
    receivedAt?: Date | string | null;
    symbolId?: string | null;
  }>,
) {
  const rows: Array<{ label: string; date: string; symbol_ids: string[] }> = [];
  const indexByKey = new Map<string, number>();

  for (const alert of recentAlerts) {
    const date = toJstDateText(alert.triggeredAt ?? alert.receivedAt);
    if (!date) continue;
    const label = (alert.alertName ?? '').trim() || (alert.alertType ?? '').trim() || '注目アラート';
    const key = `${label}::${date}`;
    const currentIndex = indexByKey.get(key);

    if (currentIndex === undefined) {
      rows.push({
        label,
        date,
        symbol_ids: alert.symbolId ? [alert.symbolId] : [],
      });
      indexByKey.set(key, rows.length - 1);
      continue;
    }

    if (alert.symbolId && !rows[currentIndex].symbol_ids.includes(alert.symbolId)) {
      rows[currentIndex].symbol_ids.push(alert.symbolId);
    }
  }

  return rows.slice(0, 10);
}

export async function homeRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const prismaAny = prisma as any;
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

    // 3. watchlist_symbols: watchlist_items を正本にする
    const defaultWatchlist = await prismaAny.watchlist.findFirst({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const watchlistItemsRaw = defaultWatchlist
      ? await prismaAny.watchlistItem.findMany({
          where: { watchlistId: defaultWatchlist.id },
          include: { symbol: true },
          orderBy: [{ addedAt: 'asc' }],
        })
      : [];
    const watchlistItems = watchlistItemsRaw
      .slice()
      .sort((a: any, b: any) => {
        const aPriority = typeof a.priority === 'number' ? a.priority : Number.MAX_SAFE_INTEGER;
        const bPriority = typeof b.priority === 'number' ? b.priority : Number.MAX_SAFE_INTEGER;
        if (aPriority !== bPriority) return aPriority - bPriority;
        return new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime();
      });

    // 最新アラートを一括取得（N+1 回避）
    const symbolIds = watchlistItems
      .map((item: any) => item.symbolId)
      .filter((id: any) => typeof id === 'string' && id.length > 0);
    const latestAlertsRaw = symbolIds.length > 0
      ? await prisma.alertEvent.findMany({
          where: { symbolId: { in: symbolIds } },
          orderBy: { triggeredAt: 'desc' },
        })
      : [];

    // symbolId → 最初に見つかった（= 最新）アラートのステータス
    const latestAlertStatusBySymbolId = new Map<string, string>();
    for (const alert of latestAlertsRaw) {
      if (alert.symbolId && !latestAlertStatusBySymbolId.has(alert.symbolId)) {
        latestAlertStatusBySymbolId.set(alert.symbolId, alert.processingStatus);
      }
    }

    // スナップショット取得
    const watchlistSymbolRefs = watchlistItems
      .map((item: any) => item.symbol)
      .filter((symbol: any) => !!symbol && !!symbol.id)
      .map((symbol: any) => ({
        id: symbol.id,
        symbol: symbol.symbol,
        symbolCode: symbol.symbolCode,
        marketCode: symbol.marketCode,
        tradingviewSymbol: symbol.tradingviewSymbol,
      }));
    const watchlistSnapshotMap = watchlistSymbolRefs.length > 0
      ? await getCurrentSnapshotsForSymbols(watchlistSymbolRefs, fastify.log)
      : new Map();

    const watchlist_symbols = watchlistItems.map((item: any) => {
      const symbol = item.symbol;
      const snap = symbol?.id ? (watchlistSnapshotMap.get(symbol.id) ?? null) : null;
      return {
        symbol_id: symbol?.id ?? null,
        display_name: symbol?.displayName ?? symbol?.symbolCode ?? symbol?.symbol ?? null,
        tradingview_symbol: symbol?.tradingviewSymbol ?? null,
        latest_price: snap && typeof snap.last_price === 'number' && Number.isFinite(snap.last_price)
          ? snap.last_price
          : null,
        change_rate: snap && typeof snap.change_percent === 'number' && Number.isFinite(snap.change_percent)
          ? snap.change_percent
          : null,
        latest_alert_status: symbol?.id ? (latestAlertStatusBySymbolId.get(symbol.id) ?? null) : null,
        user_priority: typeof item.priority === 'number' ? item.priority : null,
      };
    });

    const positionRows = await prisma.position.findMany({
      orderBy: { createdAt: 'asc' },
      include: { symbol: true },
    });
    const positionSymbolRefs = positionRows
      .map((row: any) => row.symbol)
      .filter((symbol: any) => !!symbol && !!symbol.id)
      .map((symbol: any) => ({
        id: symbol.id,
        symbol: symbol.symbol,
        symbolCode: symbol.symbolCode,
        marketCode: symbol.marketCode,
        tradingviewSymbol: symbol.tradingviewSymbol,
      }));
    const positionSnapshotMap = positionSymbolRefs.length > 0
      ? await getCurrentSnapshotsForSymbols(positionSymbolRefs, fastify.log)
      : new Map();
    const positions = positionRows.map((row: any) => {
      const symbol = row.symbol;
      const snap = symbol?.id ? (positionSnapshotMap.get(symbol.id) ?? null) : null;
      const quantity =
        typeof row.quantity?.toNumber === 'function' ? row.quantity.toNumber() : Number(row.quantity);
      const avgCost =
        typeof row.averageCost?.toNumber === 'function'
          ? row.averageCost.toNumber()
          : Number(row.averageCost);
      const latestPrice =
        snap && typeof snap.last_price === 'number' && Number.isFinite(snap.last_price)
          ? snap.last_price
          : null;
      const unrealizedPnl =
        typeof latestPrice === 'number' && Number.isFinite(quantity) && Number.isFinite(avgCost)
          ? (latestPrice - avgCost) * quantity
          : null;

      return {
        position_id: row.id,
        symbol_id: symbol?.id ?? null,
        display_name: symbol?.displayName ?? symbol?.symbolCode ?? symbol?.symbol ?? null,
        quantity: Number.isFinite(quantity) ? quantity : null,
        avg_cost: Number.isFinite(avgCost) ? avgCost : null,
        latest_price: latestPrice,
        unrealized_pnl: typeof unrealizedPnl === 'number' && Number.isFinite(unrealizedPnl) ? unrealizedPnl : null,
      };
    });
    const key_events = buildKeyEventsFromRecentAlerts(recentAlerts);
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
