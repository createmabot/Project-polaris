import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../db';
import { formatSuccess } from '../utils/response';
import { getCurrentSnapshotsForSymbols } from '../market/snapshot';
import { rebuildPositionsReadModel } from '../home/positions-read-model';
import {
  HOME_FX_MASTER,
  HOME_INDEX_MASTER,
  HOME_SECTOR_MASTER,
  type HomeMarketOverviewMasterRow,
} from '../home/market-overview-master';
import { listHomeInvestmentCalendar, refreshHomeInvestmentCalendar } from '../investment-calendar/service';
import {
  normalizeDate,
  normalizeSummaryType,
  resolveDailySummary,
} from '../summaries/daily';

type HomeQuery = {
  summary_type?: string;
  summaryType?: string;
  date?: string;
};
type HomeCalendarRefreshBody = {
  from?: unknown;
  to?: unknown;
  include_market_events?: unknown;
};

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (value && typeof value === 'object' && typeof (value as { toNumber?: unknown }).toNumber === 'function') {
    const numeric = (value as { toNumber: () => number }).toNumber();
    return Number.isFinite(numeric) ? numeric : null;
  }
  return null;
}

async function buildHomeMarketOverviewRows(
  prismaAny: any,
  snapshotType: string,
  masterRows: HomeMarketOverviewMasterRow[],
) {
  const targetCodes = masterRows.map((row) => row.code);
  if (targetCodes.length === 0) return [];

  const rows: Array<{
    snapshotType?: string;
    targetCode?: string;
    price?: unknown;
    changeValue?: unknown;
    changeRate?: unknown;
    asOf?: Date | string | null;
  }> = await prismaAny.marketSnapshot.findMany({
    where: {
      snapshotType,
      targetCode: { in: targetCodes },
    },
    orderBy: [{ asOf: 'desc' }],
  });

  const latestByCode = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const code = typeof row.targetCode === 'string' ? row.targetCode : '';
    if (!code || latestByCode.has(code)) continue;
    latestByCode.set(code, row);
  }

  return masterRows
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((master) => {
      const row = latestByCode.get(master.code);
      if (!row) return null;
      const price = toFiniteNumber(row.price);
      if (price === null) return null;

      const changeValue = toFiniteNumber(row.changeValue);
      const changeRate = toFiniteNumber(row.changeRate);
      const asOfValue = row.asOf instanceof Date ? row.asOf.toISOString() : row.asOf ? String(row.asOf) : null;

      return {
        code: master.code,
        display_name: master.display_name,
        price,
        change_value: changeValue,
        change_rate: changeRate,
        as_of: asOfValue,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);
}

function buildHomeIndices(prismaAny: any) {
  return buildHomeMarketOverviewRows(prismaAny, 'index', HOME_INDEX_MASTER);
}

function buildHomeFx(prismaAny: any) {
  return buildHomeMarketOverviewRows(prismaAny, 'fx', HOME_FX_MASTER);
}

function buildHomeSectors(prismaAny: any) {
  return buildHomeMarketOverviewRows(prismaAny, 'sector', HOME_SECTOR_MASTER);
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
    const dailySummary = await resolveDailySummary(prismaAny, {
      summaryType,
      date,
    });

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
        item_id: item.id,
        symbol_id: symbol?.id ?? null,
        symbol_code: symbol?.symbolCode ?? symbol?.symbol ?? null,
        display_name: symbol?.displayName ?? symbol?.symbolCode ?? symbol?.symbol ?? null,
        market_code: symbol?.marketCode ?? null,
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

    await rebuildPositionsReadModel(prismaAny);
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
        symbol_code: symbol?.symbolCode ?? symbol?.symbol ?? null,
        display_name: symbol?.displayName ?? symbol?.symbolCode ?? symbol?.symbol ?? null,
        market_code: symbol?.marketCode ?? null,
        tradingview_symbol: symbol?.tradingviewSymbol ?? null,
        quantity: Number.isFinite(quantity) ? quantity : null,
        avg_cost: Number.isFinite(avgCost) ? avgCost : null,
        latest_price: latestPrice,
        unrealized_pnl: typeof unrealizedPnl === 'number' && Number.isFinite(unrealizedPnl) ? unrealizedPnl : null,
      };
    });
    const key_events = buildKeyEventsFromRecentAlerts(recentAlerts);
    const investment_calendar = await listHomeInvestmentCalendar();
    const indices = await buildHomeIndices(prismaAny);
    const fx = await buildHomeFx(prismaAny);
    const sectors = await buildHomeSectors(prismaAny);
    const market_overview = {
      indices,
      fx,
      sectors,
    };

    const data = {
      market_overview,
      watchlist_symbols,
      positions,
      recent_alerts: recentAlerts,
      daily_summary: dailySummary,
      key_events,
      investment_calendar,
    };

    return reply.status(200).send(formatSuccess(request, data));
  });

  fastify.post('/investment-calendar/refresh', async (
    request: FastifyRequest<{ Body: HomeCalendarRefreshBody }>,
    reply: FastifyReply,
  ) => {
    const result = await refreshHomeInvestmentCalendar(request.body ?? {});
    return reply.status(200).send(formatSuccess(request, result));
  });
}
