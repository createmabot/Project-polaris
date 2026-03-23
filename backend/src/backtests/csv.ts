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

const SUPPORTED_HEADERS = [
  'Net Profit',
  'Total Closed Trades',
  'Percent Profitable',
  'Profit Factor',
  'Max Drawdown',
  'From',
  'To',
];

function parseNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[,%\s]/g, '');
  if (cleaned.length === 0) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
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

export function parseTradingViewSummaryCsv(rawCsv: string): ParseCsvResult {
  const text = normalizeLineEndings(rawCsv).trim();
  if (!text) {
    return { ok: false, error: 'CSV is empty.' };
  }

  const lines = text.split('\n').filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    return { ok: false, error: 'CSV must include header and one data row.' };
  }

  const headers = splitCsvLine(lines[0]);
  const values = splitCsvLine(lines[1]);

  const missingHeaders = SUPPORTED_HEADERS.filter((header) => !headers.includes(header));
  if (missingHeaders.length > 0) {
    return {
      ok: false,
      error: `Unsupported CSV header. Missing required columns: ${missingHeaders.join(', ')}`,
    };
  }

  const indexOf = (header: string) => headers.indexOf(header);

  const summary: ParsedBacktestSummary = {
    netProfit: parseNumber(values[indexOf('Net Profit')]),
    totalTrades: parseNumber(values[indexOf('Total Closed Trades')]),
    winRate: parseNumber(values[indexOf('Percent Profitable')]),
    profitFactor: parseNumber(values[indexOf('Profit Factor')]),
    maxDrawdown: parseNumber(values[indexOf('Max Drawdown')]),
    periodFrom: values[indexOf('From')] ?? null,
    periodTo: values[indexOf('To')] ?? null,
  };

  return { ok: true, summary };
}
