import { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { AppError, formatSuccess } from '../utils/response';

const SOURCE_TYPE = 'manual_csv';
const MAX_CSV_ROWS = 10_000;

type CsvRow = Record<string, string>;
type ParsedBar = {
  barTime: Date;
  open: Prisma.Decimal;
  high: Prisma.Decimal;
  low: Prisma.Decimal;
  close: Prisma.Decimal;
  volume: Prisma.Decimal | null;
  adjustedClose: Prisma.Decimal | null;
  adjusted: boolean;
};

const HEADER_ALIASES = {
  date: ['date', 'Date', 'time', 'Time', 'datetime', 'Datetime', '日付', '日時'],
  open: ['open', 'Open', '始値'],
  high: ['high', 'High', '高値'],
  low: ['low', 'Low', '安値'],
  close: ['close', 'Close', '終値'],
  volume: ['volume', 'Volume', '出来高'],
  adjustedClose: ['adjusted_close', 'adj_close', 'Adj Close', '調整後終値'],
} as const;

function normalizeTimeframe(input: unknown): string {
  if (typeof input !== 'string') {
    throw new AppError(400, 'VALIDATION_ERROR', 'timeframe is required.');
  }
  const normalized = input.trim().toUpperCase();
  if (normalized === 'D' || normalized === '1D') return 'D';
  throw new AppError(400, 'VALIDATION_ERROR', 'timeframe must be D for market data MVP.');
}

function readOptionalText(input: unknown, fieldName: string, maxLength: number): string | null {
  if (input === undefined || input === null) return null;
  if (typeof input !== 'string') {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} must be a string.`);
  }
  const trimmed = input.replace(/\s+/g, ' ').trim();
  if (!trimmed) return null;
  if (
    /(https?:\/\/|file:\/\/|localhost|127\.0\.0\.1|::1|[a-z]:\\|\/users\/|\/home\/|endpoint|model|secret|token|api[_-]?key|password|credential|stack trace|traceback)/i
      .test(trimmed)
  ) {
    return null;
  }
  return trimmed.slice(0, maxLength);
}

function readCsvText(input: unknown): string {
  if (typeof input !== 'string' || input.trim().length === 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'csv_text is required.');
  }
  return input;
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  values.push(current.trim());
  return values;
}

function parseCsv(text: string): CsvRow[] {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n').filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    throw new AppError(400, 'VALIDATION_ERROR', 'CSV must include a header row and at least one data row.');
  }
  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  const rows = lines.slice(1);
  if (rows.length > MAX_CSV_ROWS) {
    throw new AppError(400, 'VALIDATION_ERROR', `CSV row count must be <= ${MAX_CSV_ROWS}.`);
  }
  return rows.map((line) => {
    const values = parseCsvLine(line);
    const row: CsvRow = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? '';
    });
    return row;
  });
}

function resolveHeader(headers: string[], aliases: readonly string[], fieldName: string, required = true): string | null {
  const lowerMap = new Map(headers.map((header) => [header.trim().toLowerCase(), header]));
  for (const alias of aliases) {
    const exact = headers.find((header) => header.trim() === alias);
    if (exact) return exact;
    const lower = lowerMap.get(alias.trim().toLowerCase());
    if (lower) return lower;
  }
  if (required) {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} column is required.`);
  }
  return null;
}

function parseBarTime(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) {
    const numeric = Number(trimmed);
    if (!Number.isSafeInteger(numeric)) return null;
    const timestampMs = numeric >= 1_000_000_000_000
      ? numeric
      : numeric >= 1_000_000_000 && numeric < 10_000_000_000
        ? numeric * 1000
        : null;
    if (timestampMs === null) return null;
    const parsed = new Date(timestampMs);
    if (Number.isNaN(parsed.getTime())) return null;
    return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
  }
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (ymd) {
    const date = new Date(`${ymd[1]}-${ymd[2]}-${ymd[3]}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseDecimal(value: string): Prisma.Decimal | null {
  const normalized = value.replace(/,/g, '').trim();
  if (!normalized) return null;
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  try {
    return new Prisma.Decimal(normalized);
  } catch {
    return null;
  }
}

function decimalToNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  if (typeof (value as { toNumber?: unknown }).toNumber === 'function') {
    return (value as { toNumber: () => number }).toNumber();
  }
  const parsed = Number(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function dateToIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toImportResponse(row: any) {
  return {
    id: row.id,
    symbol_id: row.symbolId,
    timeframe: row.timeframe,
    source_type: row.sourceType,
    source_name: row.sourceName ?? null,
    file_name: row.fileName ?? null,
    row_count: row.rowCount,
    inserted_count: row.insertedCount,
    updated_count: row.updatedCount,
    skipped_count: row.skippedCount,
    period_from: dateToIso(row.periodFrom),
    period_to: dateToIso(row.periodTo),
    status: row.status,
    error_code: row.errorCode ?? null,
    error_message: row.errorMessage ?? null,
    created_at: dateToIso(row.createdAt),
  };
}

function toBarResponse(row: any) {
  return {
    bar_time: dateToIso(row.barTime),
    open: decimalToNumber(row.open),
    high: decimalToNumber(row.high),
    low: decimalToNumber(row.low),
    close: decimalToNumber(row.close),
    volume: decimalToNumber(row.volume),
    adjusted_close: decimalToNumber(row.adjustedClose),
    source_type: row.sourceType,
  };
}

function buildCoverage(symbolId: string, timeframe: string, bars: any[], imports: any[]) {
  const grouped = new Map<string, any[]>();
  for (const bar of bars) {
    if (bar.symbolId !== symbolId || bar.timeframe !== timeframe) continue;
    const key = `${bar.timeframe}::${bar.sourceType}`;
    grouped.set(key, [...(grouped.get(key) ?? []), bar]);
  }
  return [...grouped.entries()].map(([, rows]) => {
    const sorted = rows.slice().sort((a, b) => a.barTime.getTime() - b.barTime.getTime());
    const sourceType = sorted[0]?.sourceType ?? SOURCE_TYPE;
    const latestImport = imports
      .filter((item) => item.symbolId === symbolId && item.timeframe === timeframe && item.sourceType === sourceType)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
    return {
      timeframe,
      source_type: sourceType,
      bar_count: sorted.length,
      period_from: dateToIso(sorted[0]?.barTime),
      period_to: dateToIso(sorted[sorted.length - 1]?.barTime),
      latest_bar_time: dateToIso(sorted[sorted.length - 1]?.barTime),
      adjusted_count: sorted.filter((row) => row.adjusted).length,
      last_imported_at: dateToIso(latestImport?.createdAt),
    };
  });
}

function parseBarsFromCsv(csvText: string): { bars: ParsedBar[]; rowCount: number; skippedCount: number } {
  const rows = parseCsv(csvText);
  const headers = Object.keys(rows[0] ?? {});
  const dateHeader = resolveHeader(headers, HEADER_ALIASES.date, 'date') as string;
  const openHeader = resolveHeader(headers, HEADER_ALIASES.open, 'open') as string;
  const highHeader = resolveHeader(headers, HEADER_ALIASES.high, 'high') as string;
  const lowHeader = resolveHeader(headers, HEADER_ALIASES.low, 'low') as string;
  const closeHeader = resolveHeader(headers, HEADER_ALIASES.close, 'close') as string;
  const volumeHeader = resolveHeader(headers, HEADER_ALIASES.volume, 'volume', false);
  const adjustedCloseHeader = resolveHeader(headers, HEADER_ALIASES.adjustedClose, 'adjusted_close', false);
  const parsedBars: ParsedBar[] = [];
  let skippedCount = 0;

  for (const row of rows) {
    const barTime = parseBarTime(row[dateHeader]);
    const open = parseDecimal(row[openHeader]);
    const high = parseDecimal(row[highHeader]);
    const low = parseDecimal(row[lowHeader]);
    const close = parseDecimal(row[closeHeader]);
    const volume = volumeHeader ? parseDecimal(row[volumeHeader]) : null;
    const adjustedClose = adjustedCloseHeader ? parseDecimal(row[adjustedCloseHeader]) : null;
    if (!barTime || !open || !high || !low || !close) {
      skippedCount += 1;
      continue;
    }
    parsedBars.push({
      barTime,
      open,
      high,
      low,
      close,
      volume,
      adjustedClose,
      adjusted: Boolean(adjustedClose),
    });
  }

  return { bars: parsedBars, rowCount: rows.length, skippedCount };
}

async function getSymbol(symbolId: string) {
  const symbol = await (prisma as any).symbol.findUnique({ where: { id: symbolId } });
  if (!symbol) {
    throw new AppError(404, 'NOT_FOUND', 'symbol was not found.');
  }
  return symbol;
}

async function loadCoverage(symbolId: string, timeframe: string) {
  const [bars, latestImports] = await Promise.all([
    (prisma as any).marketPriceBar.findMany({
      where: { symbolId, timeframe },
      orderBy: [{ barTime: 'asc' }],
    }),
    (prisma as any).marketDataImport.findMany({
      where: { symbolId, timeframe },
      orderBy: [{ createdAt: 'desc' }],
      take: 10,
    }),
  ]);
  return {
    coverage: buildCoverage(symbolId, timeframe, bars, latestImports),
    latestImports,
  };
}

export const marketDataRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Params: { symbolId: string }; Body: Record<string, unknown> }>('/:symbolId/market-data/import-csv', async (request, reply) => {
    const symbolId = request.params.symbolId;
    await getSymbol(symbolId);
    const timeframe = normalizeTimeframe(request.body?.timeframe);
    const sourceName = readOptionalText(request.body?.source_name, 'source_name', 120);
    const fileName = readOptionalText(request.body?.file_name, 'file_name', 180);
    const csvText = readCsvText(request.body?.csv_text);
    const parsed = parseBarsFromCsv(csvText);
    if (parsed.bars.length === 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'CSV does not contain any valid OHLCV rows.');
    }

    let insertedCount = 0;
    let updatedCount = 0;
    const fetchedAt = new Date();
    const sorted = parsed.bars.slice().sort((a, b) => a.barTime.getTime() - b.barTime.getTime());
    for (const bar of sorted) {
      const where = {
        symbolId_timeframe_barTime_sourceType: {
          symbolId,
          timeframe,
          barTime: bar.barTime,
          sourceType: SOURCE_TYPE,
        },
      };
      const existing = await (prisma as any).marketPriceBar.findUnique({ where });
      await (prisma as any).marketPriceBar.upsert({
        where,
        update: {
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: bar.volume,
          adjustedClose: bar.adjustedClose,
          adjusted: bar.adjusted,
          sourceName,
          fetchedAt,
        },
        create: {
          symbolId,
          timeframe,
          barTime: bar.barTime,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: bar.volume,
          adjustedOpen: null,
          adjustedHigh: null,
          adjustedLow: null,
          adjustedClose: bar.adjustedClose,
          adjusted: bar.adjusted,
          sourceType: SOURCE_TYPE,
          sourceName,
          fetchedAt,
        },
      });
      if (existing) updatedCount += 1;
      else insertedCount += 1;
    }

    const importRow = await (prisma as any).marketDataImport.create({
      data: {
        symbolId,
        timeframe,
        sourceType: SOURCE_TYPE,
        sourceName,
        fileName,
        rowCount: parsed.rowCount,
        insertedCount,
        updatedCount,
        skippedCount: parsed.skippedCount,
        periodFrom: sorted[0]?.barTime ?? null,
        periodTo: sorted[sorted.length - 1]?.barTime ?? null,
        status: 'succeeded',
        errorCode: null,
        errorMessage: null,
      },
    });
    const coverage = await loadCoverage(symbolId, timeframe);
    return reply.status(200).send(formatSuccess(request, {
      import: toImportResponse(importRow),
      coverage: coverage.coverage[0] ?? {
        timeframe,
        source_type: SOURCE_TYPE,
        bar_count: 0,
        period_from: null,
        period_to: null,
        latest_bar_time: null,
        adjusted_count: 0,
        last_imported_at: null,
      },
    }));
  });

  fastify.get<{ Params: { symbolId: string }; Querystring: { timeframe?: string } }>('/:symbolId/market-data/coverage', async (request, reply) => {
    const symbol = await getSymbol(request.params.symbolId);
    const timeframe = normalizeTimeframe(request.query.timeframe ?? 'D');
    const coverage = await loadCoverage(symbol.id, timeframe);
    return reply.status(200).send(formatSuccess(request, {
      symbol: {
        id: symbol.id,
        symbol: symbol.symbol,
        symbol_code: symbol.symbolCode ?? null,
        display_name: symbol.displayName ?? null,
      },
      coverage: coverage.coverage,
      latest_imports: coverage.latestImports.map(toImportResponse),
      meta: {
        internal_backtest_ready: false,
        internal_backtest_ready_reason: 'internal_backtest_engine_not_implemented',
      },
    }));
  });

  fastify.get<{ Params: { symbolId: string }; Querystring: { timeframe?: string; from?: string; to?: string; limit?: string } }>('/:symbolId/market-data/bars', async (request, reply) => {
    await getSymbol(request.params.symbolId);
    const timeframe = normalizeTimeframe(request.query.timeframe ?? 'D');
    const limitRaw = Number(request.query.limit ?? 500);
    const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 500;
    const from = request.query.from ? parseBarTime(request.query.from) : null;
    const to = request.query.to ? parseBarTime(request.query.to) : null;
    if (request.query.from && !from) throw new AppError(400, 'VALIDATION_ERROR', 'from must be YYYY-MM-DD or ISO datetime.');
    if (request.query.to && !to) throw new AppError(400, 'VALIDATION_ERROR', 'to must be YYYY-MM-DD or ISO datetime.');
    const rows = await (prisma as any).marketPriceBar.findMany({
      where: {
        symbolId: request.params.symbolId,
        timeframe,
        ...(from || to ? { barTime: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      },
      orderBy: [{ barTime: 'desc' }],
      take: limit + 1,
    });
    const pageRows = rows.slice(0, limit);
    return reply.status(200).send(formatSuccess(request, {
      bars: pageRows.map(toBarResponse),
      pagination: {
        limit,
        has_next: rows.length > limit,
      },
    }));
  });
};
