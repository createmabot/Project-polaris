import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../db';
import { AppError, formatSuccess } from '../utils/response';
import { getCurrentSnapshotsForSymbols } from '../market/snapshot';

function toWatchlistSymbolRefs(items: Array<{ symbol: any }>) {
  return items
    .map((item) => item.symbol)
    .filter((symbol) => !!symbol && !!symbol.id)
    .map((symbol) => ({
      id: symbol.id,
      symbol: symbol.symbol,
      symbolCode: symbol.symbolCode,
      marketCode: symbol.marketCode,
      tradingviewSymbol: symbol.tradingviewSymbol,
    }));
}

function sortItemsByPriorityAndAddedAt(items: any[]) {
  return items.slice().sort((a, b) => {
    const aPriority = typeof a.priority === 'number' ? a.priority : Number.MAX_SAFE_INTEGER;
    const bPriority = typeof b.priority === 'number' ? b.priority : Number.MAX_SAFE_INTEGER;
    if (aPriority !== bPriority) return aPriority - bPriority;
    return new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime();
  });
}

export async function watchlistRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const prismaAny = prisma as any;
    const watchlists = await prismaAny.watchlist.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        _count: {
          select: {
            items: true,
          },
        },
      },
    });

    const data = {
      watchlists: watchlists.map((watchlist: any) => ({
        id: watchlist.id,
        name: watchlist.name,
        description: watchlist.description,
        sort_order: watchlist.sortOrder,
        item_count: watchlist._count.items,
        created_at: watchlist.createdAt,
        updated_at: watchlist.updatedAt,
      })),
    };

    return reply.status(200).send(formatSuccess(request, data));
  });

  fastify.get(
    '/:watchlistId/items',
    async (
      request: FastifyRequest<{ Params: { watchlistId: string } }>,
      reply: FastifyReply,
    ) => {
      const prismaAny = prisma as any;
      const { watchlistId } = request.params;
      const watchlist = await prismaAny.watchlist.findUnique({
        where: { id: watchlistId },
      });

      if (!watchlist) {
        throw new AppError(404, 'NOT_FOUND', 'The specified watchlist was not found.');
      }

      const itemsRaw = await prismaAny.watchlistItem.findMany({
        where: { watchlistId },
        include: { symbol: true },
        orderBy: [{ addedAt: 'asc' }],
      });
      const items = sortItemsByPriorityAndAddedAt(itemsRaw);
      const symbolIds = items
        .map((item) => item.symbolId)
        .filter((id) => typeof id === 'string' && id.length > 0);

      const latestAlertsRaw = symbolIds.length > 0
        ? await prisma.alertEvent.findMany({
            where: { symbolId: { in: symbolIds } },
            orderBy: { triggeredAt: 'desc' },
          })
        : [];
      const latestAlertStatusBySymbolId = new Map<string, string>();
      for (const alert of latestAlertsRaw) {
        if (alert.symbolId && !latestAlertStatusBySymbolId.has(alert.symbolId)) {
          latestAlertStatusBySymbolId.set(alert.symbolId, alert.processingStatus);
        }
      }

      const snapshotMap = await getCurrentSnapshotsForSymbols(toWatchlistSymbolRefs(items), fastify.log);

      const data = {
        watchlist: {
          id: watchlist.id,
          name: watchlist.name,
          description: watchlist.description,
          sort_order: watchlist.sortOrder,
          created_at: watchlist.createdAt,
          updated_at: watchlist.updatedAt,
        },
        items: items.map((item) => {
          const symbol = item.symbol;
          const snap = symbol?.id ? (snapshotMap.get(symbol.id) ?? null) : null;
          return {
            symbol_id: symbol?.id ?? null,
            display_name: symbol?.displayName ?? symbol?.symbolCode ?? symbol?.symbol ?? null,
            tradingview_symbol: symbol?.tradingviewSymbol ?? null,
            latest_price:
              snap && typeof snap.last_price === 'number' && Number.isFinite(snap.last_price)
                ? snap.last_price
                : null,
            change_rate:
              snap && typeof snap.change_percent === 'number' && Number.isFinite(snap.change_percent)
                ? snap.change_percent
                : null,
            latest_alert_status: symbol?.id ? (latestAlertStatusBySymbolId.get(symbol.id) ?? null) : null,
            user_priority: typeof item.priority === 'number' ? item.priority : null,
          };
        }),
      };

      return reply.status(200).send(formatSuccess(request, data));
    },
  );
}
