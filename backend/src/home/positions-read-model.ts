import { Prisma } from '@prisma/client';

type TransactionRow = {
  id: string;
  userId: string;
  portfolioId: string;
  symbolId: string;
  side: 'buy' | 'sell';
  quantity: Prisma.Decimal | number;
  price: Prisma.Decimal | number;
  executedAt: Date;
};

type DerivedPosition = {
  userId: string;
  portfolioId: string;
  symbolId: string;
  quantity: number;
  averageCost: number;
};

function toNumber(value: Prisma.Decimal | number): number {
  if (typeof value === 'number') return value;
  if (typeof (value as any)?.toNumber === 'function') return (value as any).toNumber();
  return Number(value);
}

function positionKey(portfolioId: string, symbolId: string): string {
  return `${portfolioId}:${symbolId}`;
}

export function derivePositionsFromTransactions(transactions: TransactionRow[]): DerivedPosition[] {
  const sorted = transactions
    .slice()
    .sort((a, b) => a.executedAt.getTime() - b.executedAt.getTime() || a.id.localeCompare(b.id));

  const state = new Map<
    string,
    {
      userId: string;
      portfolioId: string;
      symbolId: string;
      quantity: number;
      averageCost: number;
    }
  >();

  for (const tx of sorted) {
    const qty = toNumber(tx.quantity);
    const price = toNumber(tx.price);
    if (!Number.isFinite(qty) || !Number.isFinite(price) || qty <= 0 || price < 0) continue;

    const key = positionKey(tx.portfolioId, tx.symbolId);
    const current = state.get(key) ?? {
      userId: tx.userId,
      portfolioId: tx.portfolioId,
      symbolId: tx.symbolId,
      quantity: 0,
      averageCost: 0,
    };

    if (tx.side === 'buy') {
      const nextQuantity = current.quantity + qty;
      const nextAverageCost =
        nextQuantity > 0
          ? (current.quantity * current.averageCost + qty * price) / nextQuantity
          : 0;
      state.set(key, {
        ...current,
        quantity: nextQuantity,
        averageCost: nextAverageCost,
      });
      continue;
    }

    const nextQuantity = current.quantity - qty;
    if (nextQuantity <= 0) {
      state.delete(key);
      continue;
    }
    state.set(key, {
      ...current,
      quantity: nextQuantity,
      averageCost: current.averageCost,
    });
  }

  return Array.from(state.values()).map((row) => ({
    userId: row.userId,
    portfolioId: row.portfolioId,
    symbolId: row.symbolId,
    quantity: row.quantity,
    averageCost: row.averageCost,
  }));
}

export async function rebuildPositionsReadModelForUser(
  prismaClient: any,
  userId: string,
): Promise<void> {
  const transactions = await prismaClient.transaction.findMany({
    where: { userId },
    orderBy: [{ executedAt: 'asc' }, { id: 'asc' }],
  });

  const derived = derivePositionsFromTransactions(transactions);
  const existingPositions = await prismaClient.position.findMany({
    where: { userId },
  });

  const desiredByKey = new Map<string, DerivedPosition>();
  for (const row of derived) {
    desiredByKey.set(positionKey(row.portfolioId, row.symbolId), row);
  }

  for (const row of derived) {
    await prismaClient.position.upsert({
      where: {
        portfolioId_symbolId: {
          portfolioId: row.portfolioId,
          symbolId: row.symbolId,
        },
      },
      update: {
        userId: row.userId,
        quantity: new Prisma.Decimal(row.quantity.toFixed(6)),
        averageCost: new Prisma.Decimal(row.averageCost.toFixed(6)),
      },
      create: {
        userId: row.userId,
        portfolioId: row.portfolioId,
        symbolId: row.symbolId,
        quantity: new Prisma.Decimal(row.quantity.toFixed(6)),
        averageCost: new Prisma.Decimal(row.averageCost.toFixed(6)),
      },
    });
  }

  const staleIds = existingPositions
    .filter(
      (row: any) =>
        !desiredByKey.has(
          positionKey(row.portfolioId ?? '', row.symbolId),
        ),
    )
    .map((row: any) => row.id);

  if (staleIds.length > 0) {
    await prismaClient.position.deleteMany({
      where: {
        id: { in: staleIds },
      },
    });
  }
}

export async function rebuildPositionsReadModel(prismaClient: any): Promise<void> {
  const usersWithTransactions = await prismaClient.transaction.findMany({
    select: { userId: true },
    distinct: ['userId'],
  });

  for (const row of usersWithTransactions) {
    if (row.userId) {
      await rebuildPositionsReadModelForUser(prismaClient, row.userId);
    }
  }
}

