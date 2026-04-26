import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../db';
import { AppError, formatSuccess } from '../utils/response';
import {
  resolveOrCreateDefaultUser,
  resolveOrCreateDefaultWatchlist,
  resolveOrCreateSymbol,
  toOptionalInteger,
  toOptionalText,
} from './portfolio-context';

type CreateWatchlistItemBody = {
  symbol_code?: unknown;
  market_code?: unknown;
  tradingview_symbol?: unknown;
  display_name?: unknown;
  priority?: unknown;
  memo?: unknown;
};

type UpdateWatchlistItemBody = {
  priority?: unknown;
  memo?: unknown;
};

function toItemView(item: any) {
  return {
    item_id: item.id,
    watchlist_id: item.watchlistId,
    symbol_id: item.symbol?.id ?? null,
    symbol_code: item.symbol?.symbolCode ?? item.symbol?.symbol ?? null,
    display_name: item.symbol?.displayName ?? item.symbol?.symbolCode ?? item.symbol?.symbol ?? null,
    market_code: item.symbol?.marketCode ?? null,
    tradingview_symbol: item.symbol?.tradingviewSymbol ?? null,
    priority: typeof item.priority === 'number' ? item.priority : null,
    memo: item.memo ?? null,
    added_at: item.addedAt,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  };
}

export const watchlistItemRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', async (request, reply) => {
    const prismaAny = prisma as any;
    const user = await resolveOrCreateDefaultUser(prismaAny);
    const watchlist = await resolveOrCreateDefaultWatchlist(prismaAny, user.id);

    const items = await prismaAny.watchlistItem.findMany({
      where: { watchlistId: watchlist.id },
      include: { symbol: true },
      orderBy: [{ priority: 'asc' }, { addedAt: 'asc' }],
    });

    return reply.status(200).send(
      formatSuccess(request, {
        watchlist: {
          id: watchlist.id,
          name: watchlist.name,
          description: watchlist.description,
        },
        items: items.map(toItemView),
      }),
    );
  });

  fastify.post<{ Body: CreateWatchlistItemBody }>('/', async (request, reply) => {
    const prismaAny = prisma as any;
    const symbolCode = toOptionalText(request.body?.symbol_code);
    if (!symbolCode) {
      throw new AppError(400, 'VALIDATION_ERROR', 'symbol_code is required.');
    }

    const user = await resolveOrCreateDefaultUser(prismaAny);
    const watchlist = await resolveOrCreateDefaultWatchlist(prismaAny, user.id);
    const symbol = await resolveOrCreateSymbol(prismaAny, {
      symbolCode,
      marketCode: toOptionalText(request.body?.market_code),
      tradingviewSymbol: toOptionalText(request.body?.tradingview_symbol),
      displayName: toOptionalText(request.body?.display_name),
    });

    const priority = toOptionalInteger(request.body?.priority);
    const memo = toOptionalText(request.body?.memo);

    const existing = await prismaAny.watchlistItem.findUnique({
      where: {
        watchlistId_symbolId: {
          watchlistId: watchlist.id,
          symbolId: symbol.id,
        },
      },
      include: { symbol: true },
    });

    if (existing) {
      return reply.status(200).send(
        formatSuccess(request, {
          created: false,
          status: 'already_exists',
          item: toItemView(existing),
        }),
      );
    }

    const created = await prismaAny.watchlistItem.create({
      data: {
        watchlistId: watchlist.id,
        symbolId: symbol.id,
        priority,
        memo,
      },
      include: { symbol: true },
    });

    return reply.status(201).send(
      formatSuccess(request, {
        created: true,
        status: 'created',
        item: toItemView(created),
      }),
    );
  });

  fastify.patch<{ Params: { itemId: string }; Body: UpdateWatchlistItemBody }>(
    '/:itemId',
    async (request, reply) => {
      const prismaAny = prisma as any;
      const { itemId } = request.params;
      const existing = await prismaAny.watchlistItem.findUnique({
        where: { id: itemId },
      });
      if (!existing) {
        throw new AppError(404, 'NOT_FOUND', 'watchlist item was not found.');
      }

      const priority = request.body?.priority === undefined ? undefined : toOptionalInteger(request.body.priority);
      const memo = request.body?.memo === undefined ? undefined : toOptionalText(request.body.memo);

      if (priority === undefined && memo === undefined) {
        throw new AppError(400, 'VALIDATION_ERROR', 'at least one of priority or memo is required.');
      }

      const updated = await prismaAny.watchlistItem.update({
        where: { id: itemId },
        data: {
          ...(priority !== undefined ? { priority } : {}),
          ...(memo !== undefined ? { memo } : {}),
        },
        include: { symbol: true },
      });

      return reply.status(200).send(
        formatSuccess(request, {
          item: toItemView(updated),
        }),
      );
    },
  );

  fastify.delete<{ Params: { itemId: string } }>('/:itemId', async (request, reply) => {
    const prismaAny = prisma as any;
    const { itemId } = request.params;
    const existing = await prismaAny.watchlistItem.findUnique({
      where: { id: itemId },
    });
    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', 'watchlist item was not found.');
    }

    await prismaAny.watchlistItem.delete({
      where: { id: itemId },
    });

    return reply.status(200).send(
      formatSuccess(request, {
        deleted: true,
        item_id: itemId,
      }),
    );
  });
};
