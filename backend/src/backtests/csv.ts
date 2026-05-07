export type ParsedBacktestSummary = {
  totalTrades: number | null;
  winRate: number | null;
  profitFactor: number | null;
  maxDrawdown: number | null;
  netProfit: number | null;
  periodFrom: string | null;
  periodTo: string | null;
};

export type ParseCsvResult =
  | { ok: true; summary: ParsedBacktestSummary }
  | { ok: false; error: string };

const SUMMARY_HEADER_ALIASES = {
  netProfit: ['Net Profit', '純利益', '純損益'],
  totalTrades: ['Total Closed Trades', '総クローズトレード数'],
  winRate: ['Percent Profitable', '勝率'],
  profitFactor: ['Profit Factor', 'プロフィットファクター'],
  maxDrawdown: ['Max Drawdown', '最大ドローダウン'],
  periodFrom: ['From', '開始'],
  periodTo: ['To', '終了'],
} as const;

const TRADE_HEADER_ALIASES = {
  tradeNo: ['トレード番号', 'Trade #', 'Trade'],
  type: ['タイプ', 'Type'],
  dateTime: ['日時', 'Date/Time', 'Date'],
  netProfit: ['純損益 JPY', 'Net Profit', 'Profit'],
  cumulativeProfit: ['累積損益 JPY', 'Cumulative Profit'],
} as const;

function parseNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  const wrappedNegative = /^\(.*\)$/.test(trimmed);
  const cleaned = trimmed
    .replace(/^\((.*)\)$/, '$1')
    .replace(/[¥￥]/g, '')
    .replace(/JPY/gi, '')
    .replace(/\u2212/g, '-')
    .replace(/[,%\s,]/g, '')
    .replace(/^\+/, '');
  if (cleaned.length === 0) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return wrappedNegative && value > 0 ? -value : value;
}

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function splitCsvLine(line: string): string[] {
  // MVP simple CSV parser (quoted fields supported minimally)
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
      continue;
    }

    current += ch;
  }
  result.push(current.trim());
  return result;
}

function resolveHeaderIndex(headers: string[], candidates: readonly string[]): number {
  for (const candidate of candidates) {
    const index = headers.indexOf(candidate);
    if (index >= 0) {
      return index;
    }
  }
  return -1;
}

function resolveSummaryHeaderIndexes(headers: string[]) {
  return {
    netProfit: resolveHeaderIndex(headers, SUMMARY_HEADER_ALIASES.netProfit),
    totalTrades: resolveHeaderIndex(headers, SUMMARY_HEADER_ALIASES.totalTrades),
    winRate: resolveHeaderIndex(headers, SUMMARY_HEADER_ALIASES.winRate),
    profitFactor: resolveHeaderIndex(headers, SUMMARY_HEADER_ALIASES.profitFactor),
    maxDrawdown: resolveHeaderIndex(headers, SUMMARY_HEADER_ALIASES.maxDrawdown),
    periodFrom: resolveHeaderIndex(headers, SUMMARY_HEADER_ALIASES.periodFrom),
    periodTo: resolveHeaderIndex(headers, SUMMARY_HEADER_ALIASES.periodTo),
  };
}

function toIsoDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const dateHead = trimmed.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
  if (dateHead) return dateHead;

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;

  const year = parsed.getUTCFullYear();
  const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');
  const day = String(parsed.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseFromTradesCsv(headers: string[], lines: string[], missingSummaryHeaders: string[]): ParseCsvResult {
  const tradeNoIndex = resolveHeaderIndex(headers, TRADE_HEADER_ALIASES.tradeNo);
  const typeIndex = resolveHeaderIndex(headers, TRADE_HEADER_ALIASES.type);
  const dateTimeIndex = resolveHeaderIndex(headers, TRADE_HEADER_ALIASES.dateTime);
  const netProfitIndex = resolveHeaderIndex(headers, TRADE_HEADER_ALIASES.netProfit);
  const cumulativeProfitIndex = resolveHeaderIndex(headers, TRADE_HEADER_ALIASES.cumulativeProfit);

  if (tradeNoIndex < 0 || typeIndex < 0 || dateTimeIndex < 0 || netProfitIndex < 0 || cumulativeProfitIndex < 0) {
    return {
      ok: false,
      error: `Unsupported CSV header. Missing required columns: ${missingSummaryHeaders.join(', ')}`,
    };
  }

  const closedTradeIds = new Set<string>();
  const allTradeIds = new Set<string>();
  const closedTradePnlValues: number[] = [];
  const cumulativeSeries: number[] = [];
  const isoDates: string[] = [];

  for (const line of lines.slice(1)) {
    const row = splitCsvLine(line);
    const tradeNo = row[tradeNoIndex] ?? '';
    const type = (row[typeIndex] ?? '').toLowerCase();
    const isoDate = toIsoDate(row[dateTimeIndex]);
    const netProfit = parseNumber(row[netProfitIndex]);
    const cumulativeProfit = parseNumber(row[cumulativeProfitIndex]);

    if (tradeNo) {
      allTradeIds.add(tradeNo);
    }

    const isClosedRow =
      type.includes('決済') ||
      type.includes('close');
    if (isClosedRow && tradeNo) {
      closedTradeIds.add(tradeNo);
      if (netProfit !== null) {
        closedTradePnlValues.push(netProfit);
      }
    }

    if (cumulativeProfit !== null) {
      cumulativeSeries.push(cumulativeProfit);
    }
    if (isoDate) {
      isoDates.push(isoDate);
    }
  }

  const totalTrades = closedTradeIds.size > 0 ? closedTradeIds.size : allTradeIds.size || null;
  const wins = closedTradePnlValues.filter((value) => value > 0).length;
  const winRate =
    totalTrades && totalTrades > 0 && closedTradePnlValues.length > 0
      ? Number(((wins / totalTrades) * 100).toFixed(2))
      : null;

  const grossProfit = closedTradePnlValues.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
  const grossLossAbs = Math.abs(closedTradePnlValues.filter((value) => value < 0).reduce((sum, value) => sum + value, 0));
  const profitFactor = grossLossAbs > 0 ? Number((grossProfit / grossLossAbs).toFixed(4)) : null;

  let maxDrawdown: number | null = null;
  if (cumulativeSeries.length > 0) {
    let peak = cumulativeSeries[0];
    let worst = 0;
    for (const value of cumulativeSeries) {
      if (value > peak) peak = value;
      const drawdown = value - peak;
      if (drawdown < worst) worst = drawdown;
    }
    maxDrawdown = worst;
  }

  const periodFrom = isoDates.length > 0 ? [...isoDates].sort()[0] : null;
  const periodTo = isoDates.length > 0 ? [...isoDates].sort().slice(-1)[0] : null;
  const netProfit = cumulativeSeries.length > 0 ? cumulativeSeries[cumulativeSeries.length - 1] : null;

  return {
    ok: true,
    summary: {
      totalTrades,
      winRate,
      profitFactor,
      maxDrawdown,
      netProfit,
      periodFrom,
      periodTo,
    },
  };
}

export function parseTradingViewSummaryCsv(rawCsv: string): ParseCsvResult {
  const text = normalizeLineEndings(rawCsv).trim();
  if (!text) {
    return { ok: false, error: 'CSV is empty.' };
  }

  const lines = text.split('\n').filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    return { ok: false, error: 'CSV must include header and one data row.' };
  }

  const headers = splitCsvLine(lines[0]).map((header) => header.replace(/^\uFEFF/, ''));
  const values = splitCsvLine(lines[1]);

  const summaryIndexes = resolveSummaryHeaderIndexes(headers);
  const missingHeaders = (Object.entries(summaryIndexes) as Array<[keyof typeof summaryIndexes, number]>)
    .filter(([, index]) => index < 0)
    .map(([key]) => SUMMARY_HEADER_ALIASES[key][0]);

  if (missingHeaders.length > 0) {
    return parseFromTradesCsv(headers, lines, missingHeaders);
  }

  const summary: ParsedBacktestSummary = {
    netProfit: parseNumber(values[summaryIndexes.netProfit]),
    totalTrades: parseNumber(values[summaryIndexes.totalTrades]),
    winRate: parseNumber(values[summaryIndexes.winRate]),
    profitFactor: parseNumber(values[summaryIndexes.profitFactor]),
    maxDrawdown: parseNumber(values[summaryIndexes.maxDrawdown]),
    periodFrom: values[summaryIndexes.periodFrom] ?? null,
    periodTo: values[summaryIndexes.periodTo] ?? null,
  };

  return { ok: true, summary };
}
