import { AppError } from '../utils/response';

type ResolveSymbolInput = {
  symbolCode: string;
  marketCode?: string | null;
  tradingviewSymbol?: string | null;
  displayName?: string | null;
};

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function toOptionalText(value: unknown): string | null {
  return normalizeText(value);
}

export function toOptionalInteger(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'priority must be an integer.');
  }
  return parsed;
}

export function toRequiredPositiveNumber(value: unknown, fieldName: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} must be a number greater than 0.`);
  }
  return parsed;
}

export function toRequiredNonNegativeNumber(value: unknown, fieldName: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} must be a number greater than or equal to 0.`);
  }
  return parsed;
}

export async function resolveOrCreateDefaultUser(prismaAny: any) {
  const existing = await prismaAny.user.findFirst({
    orderBy: { createdAt: 'asc' },
  });
  if (existing) return existing;

  return prismaAny.user.create({
    data: {
      email: 'local-user@hokkyokusei.local',
      name: 'Local User',
    },
  });
}

export async function resolveOrCreateDefaultWatchlist(prismaAny: any, userId: string) {
  const existing = await prismaAny.watchlist.findFirst({
    where: { userId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  if (existing) return existing;

  return prismaAny.watchlist.create({
    data: {
      userId,
      name: 'default',
      description: 'default watchlist',
      sortOrder: 0,
    },
  });
}

export async function resolveOrCreateDefaultPortfolio(prismaAny: any, userId: string) {
  const defaultPortfolio = await prismaAny.portfolio.findFirst({
    where: {
      userId,
      isDefault: true,
    },
    orderBy: { createdAt: 'asc' },
  });
  if (defaultPortfolio) return defaultPortfolio;

  const fallback = await prismaAny.portfolio.findFirst({
    where: { userId },
    orderBy: { createdAt: 'asc' },
  });
  if (fallback) {
    return prismaAny.portfolio.update({
      where: { id: fallback.id },
      data: { isDefault: true },
    });
  }

  return prismaAny.portfolio.create({
    data: {
      userId,
      name: 'default',
      isDefault: true,
      baseCurrency: 'JPY',
    },
  });
}

export async function resolveOrCreateSymbol(prismaAny: any, input: ResolveSymbolInput) {
  const symbolCode = input.symbolCode.trim();
  if (symbolCode.length === 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'symbol_code is required.');
  }

  const marketCode = normalizeText(input.marketCode) ?? null;
  const tradingviewSymbol = normalizeText(input.tradingviewSymbol) ?? null;
  const displayName = normalizeText(input.displayName) ?? symbolCode;

  let symbol: any | null = null;
  if (tradingviewSymbol) {
    symbol = await prismaAny.symbol.findUnique({
      where: { tradingviewSymbol },
    });
  }
  if (!symbol) {
    symbol = await prismaAny.symbol.findFirst({
      where: {
        OR: [{ symbolCode }, { symbol: symbolCode }],
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  if (!symbol) {
    return prismaAny.symbol.create({
      data: {
        symbol: symbolCode,
        symbolCode,
        marketCode,
        tradingviewSymbol,
        displayName,
      },
    });
  }

  if (tradingviewSymbol && symbol.tradingviewSymbol && symbol.tradingviewSymbol !== tradingviewSymbol) {
    throw new AppError(
      409,
      'CONFLICT',
      'tradingview_symbol is already mapped to a different symbol.',
    );
  }

  const nextData: Record<string, unknown> = {};
  if (!symbol.symbolCode) nextData.symbolCode = symbolCode;
  if (!symbol.displayName || symbol.displayName.trim().length === 0) nextData.displayName = displayName;
  if (!symbol.marketCode && marketCode) nextData.marketCode = marketCode;
  if (!symbol.tradingviewSymbol && tradingviewSymbol) nextData.tradingviewSymbol = tradingviewSymbol;

  if (Object.keys(nextData).length === 0) return symbol;

  return prismaAny.symbol.update({
    where: { id: symbol.id },
    data: nextData,
  });
}
