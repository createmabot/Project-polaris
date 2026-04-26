import { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { AppError, formatSuccess } from '../utils/response';
import { rebuildPositionsReadModelForUser } from '../home/positions-read-model';
import {
  resolveOrCreateDefaultPortfolio,
  resolveOrCreateDefaultUser,
  resolveOrCreateSymbol,
  toOptionalText,
  toRequiredNonNegativeNumber,
  toRequiredPositiveNumber,
} from './portfolio-context';

type CreatePositionBody = {
  symbol_code?: unknown;
  market_code?: unknown;
  tradingview_symbol?: unknown;
  display_name?: unknown;
  quantity?: unknown;
  average_cost?: unknown;
};

type UpdatePositionBody = {
  quantity?: unknown;
  average_cost?: unknown;
};

function toDecimal(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value.toFixed(6));
}

function toPositionView(row: any) {
  const quantity =
    typeof row.quantity?.toNumber === 'function' ? row.quantity.toNumber() : Number(row.quantity);
  const averageCost =
    typeof row.averageCost?.toNumber === 'function' ? row.averageCost.toNumber() : Number(row.averageCost);
  return {
    position_id: row.id,
    symbol_id: row.symbol?.id ?? null,
    symbol_code: row.symbol?.symbolCode ?? row.symbol?.symbol ?? null,
    display_name: row.symbol?.displayName ?? row.symbol?.symbolCode ?? row.symbol?.symbol ?? null,
    market_code: row.symbol?.marketCode ?? null,
    tradingview_symbol: row.symbol?.tradingviewSymbol ?? null,
    quantity: Number.isFinite(quantity) ? quantity : null,
    average_cost: Number.isFinite(averageCost) ? averageCost : null,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

function toNumberFromDecimal(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value && typeof (value as any).toNumber === 'function') return (value as any).toNumber();
  return Number(value);
}

async function setPositionWithManualTransactions(params: {
  prismaAny: any;
  userId: string;
  portfolioId: string;
  symbolId: string;
  quantity: number;
  averageCost: number;
}) {
  const { prismaAny, userId, portfolioId, symbolId, quantity, averageCost } = params;
  let replacementExecutedAt = new Date();
  const existing = await prismaAny.position.findUnique({
    where: {
      portfolioId_symbolId: {
        portfolioId,
        symbolId,
      },
    },
  });

  if (existing) {
    const existingQty = toNumberFromDecimal(existing.quantity);
    const existingAvg = toNumberFromDecimal(existing.averageCost);
    if (existingQty === quantity && existingAvg === averageCost) {
      await rebuildPositionsReadModelForUser(prismaAny, userId);
      const current = await prismaAny.position.findUnique({
        where: {
          portfolioId_symbolId: {
            portfolioId,
            symbolId,
          },
        },
        include: { symbol: true },
      });
      return { action: 'unchanged', position: current };
    }

    if (Number.isFinite(existingQty) && existingQty > 0) {
      const resetExecutedAt = new Date();
      replacementExecutedAt = new Date(resetExecutedAt.getTime() + 1);
      await prismaAny.transaction.create({
        data: {
          userId,
          portfolioId,
          symbolId,
          side: 'sell',
          quantity: toDecimal(existingQty),
          price: toDecimal(Number.isFinite(existingAvg) && existingAvg >= 0 ? existingAvg : averageCost),
          feeAmount: new Prisma.Decimal('0'),
          executedAt: resetExecutedAt,
          source: 'manual',
          memo: 'position reset before manual update',
        },
      });
    }
  }

  await prismaAny.transaction.create({
    data: {
      userId,
      portfolioId,
      symbolId,
      side: 'buy',
      quantity: toDecimal(quantity),
      price: toDecimal(averageCost),
      feeAmount: new Prisma.Decimal('0'),
      executedAt: replacementExecutedAt,
      source: 'manual',
      memo: 'position set by manual management',
    },
  });

  await rebuildPositionsReadModelForUser(prismaAny, userId);
  const updated = await prismaAny.position.findUnique({
    where: {
      portfolioId_symbolId: {
        portfolioId,
        symbolId,
      },
    },
    include: { symbol: true },
  });
  return { action: existing ? 'updated' : 'created', position: updated };
}

export const positionRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', async (request, reply) => {
    const prismaAny = prisma as any;
    const user = await resolveOrCreateDefaultUser(prismaAny);
    const portfolio = await resolveOrCreateDefaultPortfolio(prismaAny, user.id);
    await rebuildPositionsReadModelForUser(prismaAny, user.id);

    const rows = await prismaAny.position.findMany({
      where: { portfolioId: portfolio.id },
      include: { symbol: true },
      orderBy: [{ createdAt: 'asc' }],
    });

    return reply.status(200).send(
      formatSuccess(request, {
        portfolio: {
          id: portfolio.id,
          name: portfolio.name,
          is_default: portfolio.isDefault,
        },
        positions: rows.map(toPositionView),
      }),
    );
  });

  fastify.post<{ Body: CreatePositionBody }>('/', async (request, reply) => {
    const prismaAny = prisma as any;
    const symbolCode = toOptionalText(request.body?.symbol_code);
    if (!symbolCode) {
      throw new AppError(400, 'VALIDATION_ERROR', 'symbol_code is required.');
    }
    const quantity = toRequiredPositiveNumber(request.body?.quantity, 'quantity');
    const averageCost = toRequiredNonNegativeNumber(request.body?.average_cost, 'average_cost');

    const user = await resolveOrCreateDefaultUser(prismaAny);
    const portfolio = await resolveOrCreateDefaultPortfolio(prismaAny, user.id);
    const symbol = await resolveOrCreateSymbol(prismaAny, {
      symbolCode,
      marketCode: toOptionalText(request.body?.market_code),
      tradingviewSymbol: toOptionalText(request.body?.tradingview_symbol),
      displayName: toOptionalText(request.body?.display_name),
    });

    const result = await setPositionWithManualTransactions({
      prismaAny,
      userId: user.id,
      portfolioId: portfolio.id,
      symbolId: symbol.id,
      quantity,
      averageCost,
    });

    return reply.status(201).send(
      formatSuccess(request, {
        action: result.action,
        position: result.position ? toPositionView(result.position) : null,
      }),
    );
  });

  fastify.patch<{ Params: { positionId: string }; Body: UpdatePositionBody }>(
    '/:positionId',
    async (request, reply) => {
      const prismaAny = prisma as any;
      const { positionId } = request.params;

      const current = await prismaAny.position.findUnique({
        where: { id: positionId },
        include: { symbol: true },
      });
      if (!current) {
        throw new AppError(404, 'NOT_FOUND', 'position was not found.');
      }

      const currentQuantity = toNumberFromDecimal(current.quantity);
      const currentAverageCost = toNumberFromDecimal(current.averageCost);
      const quantity =
        request.body?.quantity === undefined
          ? currentQuantity
          : toRequiredPositiveNumber(request.body.quantity, 'quantity');
      const averageCost =
        request.body?.average_cost === undefined
          ? currentAverageCost
          : toRequiredNonNegativeNumber(request.body.average_cost, 'average_cost');

      const result = await setPositionWithManualTransactions({
        prismaAny,
        userId: current.userId,
        portfolioId: current.portfolioId,
        symbolId: current.symbolId,
        quantity,
        averageCost,
      });

      return reply.status(200).send(
        formatSuccess(request, {
          action: result.action,
          position: result.position ? toPositionView(result.position) : null,
        }),
      );
    },
  );

  fastify.delete<{ Params: { positionId: string } }>('/:positionId', async (request, reply) => {
    const prismaAny = prisma as any;
    const { positionId } = request.params;
    const current = await prismaAny.position.findUnique({
      where: { id: positionId },
    });
    if (!current) {
      throw new AppError(404, 'NOT_FOUND', 'position was not found.');
    }

    const quantity = toNumberFromDecimal(current.quantity);
    const averageCost = toNumberFromDecimal(current.averageCost);
    if (Number.isFinite(quantity) && quantity > 0) {
      await prismaAny.transaction.create({
        data: {
          userId: current.userId,
          portfolioId: current.portfolioId,
          symbolId: current.symbolId,
          side: 'sell',
          quantity: toDecimal(quantity),
          price: toDecimal(Number.isFinite(averageCost) && averageCost >= 0 ? averageCost : 0),
          feeAmount: new Prisma.Decimal('0'),
          executedAt: new Date(),
          source: 'manual',
          memo: 'position closed by manual management',
        },
      });
    }

    await rebuildPositionsReadModelForUser(prismaAny, current.userId);

    return reply.status(200).send(
      formatSuccess(request, {
        deleted: true,
        position_id: positionId,
      }),
    );
  });
};
