import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../src/utils/response';
import { watchlistItemRoutes } from '../src/routes/watchlist-items';
import { positionRoutes } from '../src/routes/positions';
import { homeRoutes } from '../src/routes/home';

type RuntimeSymbol = {
  id: string;
  symbol: string;
  symbolCode: string | null;
  marketCode: string | null;
  tradingviewSymbol: string | null;
  displayName: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type Runtime = {
  user: { id: string; email: string; name: string | null; createdAt: Date };
  watchlists: Array<{ id: string; userId: string; name: string; description: string | null; sortOrder: number; createdAt: Date; updatedAt: Date }>;
  watchlistItems: Array<{ id: string; watchlistId: string; symbolId: string; priority: number | null; memo: string | null; addedAt: Date; createdAt: Date; updatedAt: Date }>;
  portfolios: Array<{ id: string; userId: string; name: string; isDefault: boolean; baseCurrency: string; createdAt: Date; updatedAt: Date }>;
  symbols: RuntimeSymbol[];
  transactions: Array<{ id: string; userId: string; portfolioId: string; symbolId: string; side: 'buy' | 'sell'; quantity: number; price: number; feeAmount: number; executedAt: Date; source: string; memo: string | null; createdAt: Date; updatedAt: Date }>;
  positions: Array<{ id: string; userId: string; portfolioId: string; symbolId: string; quantity: { toNumber: () => number }; averageCost: { toNumber: () => number }; createdAt: Date; updatedAt: Date }>;
  alertEvents: Array<{ id: string; symbolId: string; alertName: string; alertType: string | null; timeframe: string | null; triggerPrice: number | null; triggeredAt: Date; receivedAt: Date; processingStatus: string }>;
  aiSummaries: Array<{ id: string; summaryScope: string; targetEntityType: string; targetEntityId: string; title: string | null; bodyMarkdown: string; structuredJson: Record<string, unknown> | null; generatedAt: Date; generationContextJson: Record<string, unknown> | null }>;
  marketSnapshots: Array<{ id: string; snapshotType: string; targetCode: string; asOf: Date; price: { toNumber: () => number }; changeValue: { toNumber: () => number } | null; changeRate: { toNumber: () => number } | null }>;
  externalReferences: Array<{ id: string; symbolId: string; publishedAt: Date; createdAt: Date }>;
  seq: number;
};

let runtime: Runtime;

function asDecimal(value: number) {
  return { toNumber: () => value };
}

function nextId(prefix: string): string {
  runtime.seq += 1;
  return `${prefix}-${runtime.seq}`;
}

function findSymbol(symbolId: string) {
  return runtime.symbols.find((row) => row.id === symbolId) ?? null;
}

function sortByDateAsc<T extends { executedAt: Date; id: string }>(rows: T[]) {
  return rows
    .slice()
    .sort((a, b) => a.executedAt.getTime() - b.executedAt.getTime() || a.id.localeCompare(b.id));
}

function rebuildPositionsFromTransactions() {
  const state = new Map<string, { userId: string; portfolioId: string; symbolId: string; quantity: number; averageCost: number }>();
  const sorted = sortByDateAsc(runtime.transactions);
  for (const tx of sorted) {
    const key = `${tx.portfolioId}:${tx.symbolId}`;
    const current = state.get(key) ?? {
      userId: tx.userId,
      portfolioId: tx.portfolioId,
      symbolId: tx.symbolId,
      quantity: 0,
      averageCost: 0,
    };

    if (tx.side === 'buy') {
      const nextQty = current.quantity + tx.quantity;
      const nextAvg = nextQty > 0 ? (current.quantity * current.averageCost + tx.quantity * tx.price) / nextQty : 0;
      state.set(key, { ...current, quantity: nextQty, averageCost: nextAvg });
      continue;
    }

    const nextQty = current.quantity - tx.quantity;
    if (nextQty <= 0) {
      state.delete(key);
      continue;
    }
    state.set(key, { ...current, quantity: nextQty, averageCost: current.averageCost });
  }

  runtime.positions = Array.from(state.values()).map((row) => ({
    id: nextId('pos'),
    userId: row.userId,
    portfolioId: row.portfolioId,
    symbolId: row.symbolId,
    quantity: asDecimal(Number(row.quantity.toFixed(6))),
    averageCost: asDecimal(Number(row.averageCost.toFixed(6))),
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
}

function createRuntime(): Runtime {
  const now = new Date('2026-04-27T00:00:00.000Z');
  return {
    user: { id: 'user-1', email: 'test@example.com', name: 'Test', createdAt: now },
    watchlists: [],
    watchlistItems: [],
    portfolios: [],
    symbols: [
      {
        id: 'sym-7203',
        symbol: '7203',
        symbolCode: '7203',
        marketCode: 'JP_STOCK',
        tradingviewSymbol: 'TSE:7203',
        displayName: 'トヨタ自動車',
        createdAt: now,
        updatedAt: now,
      },
    ],
    transactions: [],
    positions: [],
    alertEvents: [],
    aiSummaries: [
      {
        id: 'daily-1',
        summaryScope: 'daily',
        targetEntityType: 'market_snapshot',
        targetEntityId: 'market:jp',
        title: 'デイリー',
        bodyMarkdown: 'daily summary',
        structuredJson: { summary_type: 'latest' },
        generatedAt: now,
        generationContextJson: { summary_type: 'latest' },
      },
    ],
    marketSnapshots: [],
    externalReferences: [],
    seq: 100,
  };
}

vi.mock('../src/market/snapshot', () => ({
  getCurrentSnapshotsForSymbols: vi.fn(async (symbols: Array<{ id: string }>) => {
    const map = new Map<string, any>();
    for (const symbol of symbols) {
      map.set(symbol.id, {
        last_price: symbol.id === 'sym-6758' ? 3200 : 3000,
        change: 5,
        change_percent: 0.2,
        volume: 1000,
        as_of: '2026-04-27T00:00:00.000Z',
        market_status: 'unknown',
        source_name: 'test',
      });
    }
    return map;
  }),
}));

vi.mock('../src/home/positions-read-model', () => ({
  rebuildPositionsReadModel: vi.fn(async () => {
    rebuildPositionsFromTransactions();
  }),
  rebuildPositionsReadModelForUser: vi.fn(async () => {
    rebuildPositionsFromTransactions();
  }),
}));

vi.mock('../src/db', () => {
  const prisma = {
    user: {
      findFirst: async () => runtime.user,
      create: async ({ data }: any) => {
        runtime.user = { id: nextId('user'), email: data.email, name: data.name ?? null, createdAt: new Date() };
        return runtime.user;
      },
    },
    watchlist: {
      findFirst: async ({ where }: any = {}) => {
        const filtered = where?.userId
          ? runtime.watchlists.filter((row) => row.userId === where.userId)
          : runtime.watchlists.slice();
        if (filtered.length === 0) return null;
        return filtered
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime())[0];
      },
      create: async ({ data }: any) => {
        const row = {
          id: nextId('wl'),
          userId: data.userId,
          name: data.name,
          description: data.description ?? null,
          sortOrder: data.sortOrder ?? 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        runtime.watchlists.push(row);
        return row;
      },
    },
    watchlistItem: {
      findMany: async ({ where }: any) => {
        const rows = runtime.watchlistItems
          .filter((row) => row.watchlistId === where.watchlistId)
          .map((row) => ({ ...row, symbol: findSymbol(row.symbolId) }));
        return rows;
      },
      findUnique: async ({ where }: any) => {
        if (where?.id) {
          const row = runtime.watchlistItems.find((item) => item.id === where.id);
          return row ? { ...row, symbol: findSymbol(row.symbolId) } : null;
        }
        const key = where?.watchlistId_symbolId;
        if (key) {
          const row = runtime.watchlistItems.find(
            (item) => item.watchlistId === key.watchlistId && item.symbolId === key.symbolId,
          );
          return row ? { ...row, symbol: findSymbol(row.symbolId) } : null;
        }
        return null;
      },
      create: async ({ data }: any) => {
        const row = {
          id: nextId('wli'),
          watchlistId: data.watchlistId,
          symbolId: data.symbolId,
          priority: data.priority ?? null,
          memo: data.memo ?? null,
          addedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        runtime.watchlistItems.push(row);
        return { ...row, symbol: findSymbol(row.symbolId) };
      },
      update: async ({ where, data }: any) => {
        const row = runtime.watchlistItems.find((item) => item.id === where.id);
        if (!row) throw new Error('not found');
        if (Object.prototype.hasOwnProperty.call(data, 'priority')) row.priority = data.priority;
        if (Object.prototype.hasOwnProperty.call(data, 'memo')) row.memo = data.memo;
        row.updatedAt = new Date();
        return { ...row, symbol: findSymbol(row.symbolId) };
      },
      delete: async ({ where }: any) => {
        runtime.watchlistItems = runtime.watchlistItems.filter((row) => row.id !== where.id);
        return { id: where.id };
      },
    },
    symbol: {
      findUnique: async ({ where }: any) => {
        if (where?.tradingviewSymbol) {
          return runtime.symbols.find((row) => row.tradingviewSymbol === where.tradingviewSymbol) ?? null;
        }
        if (where?.id) {
          return runtime.symbols.find((row) => row.id === where.id) ?? null;
        }
        return null;
      },
      findFirst: async ({ where }: any) => {
        const values: string[] = [];
        for (const row of where?.OR ?? []) {
          if (row?.symbolCode) values.push(row.symbolCode);
          if (row?.symbol) values.push(row.symbol);
        }
        return runtime.symbols.find((row) => values.includes(row.symbolCode ?? '') || values.includes(row.symbol)) ?? null;
      },
      create: async ({ data }: any) => {
        const row: RuntimeSymbol = {
          id: nextId('sym'),
          symbol: data.symbol,
          symbolCode: data.symbolCode ?? null,
          marketCode: data.marketCode ?? null,
          tradingviewSymbol: data.tradingviewSymbol ?? null,
          displayName: data.displayName ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        runtime.symbols.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = runtime.symbols.find((item) => item.id === where.id);
        if (!row) throw new Error('not found');
        if (data.symbolCode !== undefined) row.symbolCode = data.symbolCode;
        if (data.marketCode !== undefined) row.marketCode = data.marketCode;
        if (data.tradingviewSymbol !== undefined) row.tradingviewSymbol = data.tradingviewSymbol;
        if (data.displayName !== undefined) row.displayName = data.displayName;
        row.updatedAt = new Date();
        return row;
      },
    },
    portfolio: {
      findFirst: async ({ where }: any) => {
        return (
          runtime.portfolios.find(
            (row) =>
              row.userId === where.userId &&
              (where.isDefault === undefined || row.isDefault === where.isDefault),
          ) ?? null
        );
      },
      create: async ({ data }: any) => {
        const row = {
          id: nextId('pf'),
          userId: data.userId,
          name: data.name,
          isDefault: Boolean(data.isDefault),
          baseCurrency: data.baseCurrency ?? 'JPY',
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        runtime.portfolios.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = runtime.portfolios.find((item) => item.id === where.id);
        if (!row) throw new Error('not found');
        if (data.isDefault !== undefined) row.isDefault = data.isDefault;
        row.updatedAt = new Date();
        return row;
      },
    },
    transaction: {
      create: async ({ data }: any) => {
        const row = {
          id: nextId('tx'),
          userId: data.userId,
          portfolioId: data.portfolioId,
          symbolId: data.symbolId,
          side: data.side,
          quantity: Number(data.quantity.toString()),
          price: Number(data.price.toString()),
          feeAmount: Number(data.feeAmount.toString()),
          executedAt: new Date(data.executedAt),
          source: data.source,
          memo: data.memo ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        runtime.transactions.push(row);
        return row;
      },
      findMany: async ({ where }: any) => {
        return runtime.transactions
          .filter((row) => (where?.userId ? row.userId === where.userId : true))
          .map((row) => ({
            id: row.id,
            userId: row.userId,
            portfolioId: row.portfolioId,
            symbolId: row.symbolId,
            side: row.side,
            quantity: asDecimal(row.quantity),
            price: asDecimal(row.price),
            executedAt: row.executedAt,
          }));
      },
    },
    position: {
      findUnique: async ({ where, include }: any) => {
        let row: any | undefined;
        if (where?.id) row = runtime.positions.find((item) => item.id === where.id);
        if (where?.portfolioId_symbolId) {
          row = runtime.positions.find(
            (item) =>
              item.portfolioId === where.portfolioId_symbolId.portfolioId &&
              item.symbolId === where.portfolioId_symbolId.symbolId,
          );
        }
        if (!row) return null;
        if (include?.symbol) return { ...row, symbol: findSymbol(row.symbolId) };
        return row;
      },
      findMany: async ({ where, include }: any = {}) => {
        const rows = runtime.positions.filter((row) => {
          if (where?.portfolioId && row.portfolioId !== where.portfolioId) return false;
          return true;
        });
        if (include?.symbol) return rows.map((row) => ({ ...row, symbol: findSymbol(row.symbolId) }));
        return rows;
      },
    },
    alertEvent: {
      findMany: async ({ where, include, orderBy, take }: any = {}) => {
        let rows = runtime.alertEvents.slice();
        if (where?.symbolId?.in) {
          rows = rows.filter((row) => where.symbolId.in.includes(row.symbolId));
        }
        rows.sort((a, b) => {
          if (orderBy?.triggeredAt === 'desc') return b.triggeredAt.getTime() - a.triggeredAt.getTime();
          return 0;
        });
        if (typeof take === 'number') rows = rows.slice(0, take);
        if (include?.symbol) return rows.map((row) => ({ ...row, symbol: findSymbol(row.symbolId) }));
        return rows;
      },
      count: async () => runtime.alertEvents.length,
    },
    aiSummary: {
      findMany: async ({ where, orderBy }: any = {}) => {
        let rows = runtime.aiSummaries.slice();
        if (where?.targetEntityType) rows = rows.filter((row) => row.targetEntityType === where.targetEntityType);
        if (where?.summaryScope) rows = rows.filter((row) => row.summaryScope === where.summaryScope);
        if (where?.targetEntityId?.in) rows = rows.filter((row) => where.targetEntityId.in.includes(row.targetEntityId));
        rows.sort((a, b) => {
          if (orderBy?.generatedAt === 'desc') return b.generatedAt.getTime() - a.generatedAt.getTime();
          return 0;
        });
        return rows;
      },
    },
    marketSnapshot: {
      findMany: async () => runtime.marketSnapshots.slice(),
      count: async () => runtime.marketSnapshots.length,
    },
    externalReference: {
      count: async () => runtime.externalReferences.length,
    },
  };
  return { prisma };
});

describe('watchlist/positions management routes', () => {
  beforeEach(() => {
    runtime = createRuntime();
  });

  it('supports watchlist add, duplicate, update, and delete', async () => {
    const app = Fastify({ logger: false });
    app.setErrorHandler(errorHandler);
    app.register(watchlistItemRoutes, { prefix: '/api/watchlist-items' });
    await app.ready();

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/watchlist-items',
      payload: {
        symbol_code: '7203',
        market_code: 'JP_STOCK',
        tradingview_symbol: 'TSE:7203',
        display_name: 'トヨタ自動車',
        priority: 1,
        memo: 'core',
      },
    });
    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json().data.item;
    expect(created.symbol_code).toBe('7203');

    const duplicateResponse = await app.inject({
      method: 'POST',
      url: '/api/watchlist-items',
      payload: { symbol_code: '7203' },
    });
    expect(duplicateResponse.statusCode).toBe(200);
    expect(duplicateResponse.json().data.status).toBe('already_exists');

    const patchResponse = await app.inject({
      method: 'PATCH',
      url: `/api/watchlist-items/${created.item_id}`,
      payload: { priority: 3, memo: 'updated memo' },
    });
    expect(patchResponse.statusCode).toBe(200);
    expect(patchResponse.json().data.item.priority).toBe(3);

    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: `/api/watchlist-items/${created.item_id}`,
    });
    expect(deleteResponse.statusCode).toBe(200);
    expect(deleteResponse.json().data.deleted).toBe(true);

    await app.close();
  });

  it('supports positions create/update/delete and reflects in home api', async () => {
    const app = Fastify({ logger: false });
    app.setErrorHandler(errorHandler);
    app.register(positionRoutes, { prefix: '/api/positions' });
    app.register(homeRoutes, { prefix: '/api/home' });
    await app.ready();

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/positions',
      payload: {
        symbol_code: '6758',
        display_name: 'ソニーグループ',
        market_code: 'JP_STOCK',
        tradingview_symbol: 'TSE:6758',
        quantity: 100,
        average_cost: 13000,
      },
    });
    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.json().data.action).toBe('created');
    const homeAfterCreate = await app.inject({
      method: 'GET',
      url: '/api/home?summary_type=latest',
    });
    expect(homeAfterCreate.statusCode).toBe(200);
    expect(homeAfterCreate.json().data.positions).toHaveLength(1);
    expect(homeAfterCreate.json().data.positions[0].quantity).toBe(100);
    const positionId = homeAfterCreate.json().data.positions[0].position_id as string;

    const updateResponse = await app.inject({
      method: 'PATCH',
      url: `/api/positions/${positionId}`,
      payload: { quantity: 150, average_cost: 12500 },
    });
    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json().data.action).toBe('updated');

    const homeAfterUpdate = await app.inject({
      method: 'GET',
      url: '/api/home?summary_type=latest',
    });
    expect(homeAfterUpdate.statusCode).toBe(200);
    expect(homeAfterUpdate.json().data.positions).toHaveLength(1);
    expect(homeAfterUpdate.json().data.positions[0].quantity).toBe(150);
    const updatedPositionId = homeAfterUpdate.json().data.positions[0].position_id as string;

    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: `/api/positions/${updatedPositionId}`,
    });
    expect(deleteResponse.statusCode).toBe(200);

    const homeAfterDelete = await app.inject({
      method: 'GET',
      url: '/api/home?summary_type=latest',
    });
    expect(homeAfterDelete.statusCode).toBe(200);
    expect(homeAfterDelete.json().data.positions).toHaveLength(0);

    const invalidResponse = await app.inject({
      method: 'POST',
      url: '/api/positions',
      payload: {
        symbol_code: '7203',
        quantity: 0,
        average_cost: -1,
      },
    });
    expect(invalidResponse.statusCode).toBe(400);

    await app.close();
  });
});
