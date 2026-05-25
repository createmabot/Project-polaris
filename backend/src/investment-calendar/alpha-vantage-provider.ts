import { AppError } from '../utils/response';
import { normalizeProviderEvent } from './normalization';
import { InvestmentCalendarFetchInput, InvestmentCalendarProviderEvent } from './types';
import type { InvestmentCalendarProvider } from './provider';

const ALPHA_VANTAGE_BASE_URL = 'https://www.alphavantage.co/query';

type EconomicSeriesConfig = {
  functionName: string;
  title: string;
  externalPrefix: string;
};

const ECONOMIC_SERIES: EconomicSeriesConfig[] = [
  { functionName: 'CPI', title: '米CPI', externalPrefix: 'cpi' },
  { functionName: 'RETAIL_SALES', title: '米小売売上高', externalPrefix: 'retail-sales' },
  { functionName: 'UNEMPLOYMENT', title: '米失業率', externalPrefix: 'unemployment' },
  { functionName: 'NONFARM_PAYROLL', title: '米雇用統計', externalPrefix: 'nonfarm-payroll' },
];

function getApiKey() {
  return process.env.INVESTMENT_CALENDAR_ALPHA_VANTAGE_API_KEY?.trim() || null;
}

function getTimeoutMs() {
  const raw = process.env.INVESTMENT_CALENDAR_ALPHA_VANTAGE_TIMEOUT_MS
    ?? process.env.INVESTMENT_CALENDAR_FETCH_TIMEOUT_MS;
  const value = raw ? Number(raw) : 10000;
  return Number.isFinite(value) && value > 0 ? value : 10000;
}

function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isInRange(date: string, from: string, to: string) {
  return date >= from && date <= to;
}

function providerUnavailable(reason: string): AppError {
  return new AppError(
    502,
    'INVESTMENT_CALENDAR_PROVIDER_UNAVAILABLE',
    'Investment calendar provider is not configured. Use stub provider or configure Alpha Vantage for manual refresh.',
    { provider: 'alpha_vantage', reason },
  );
}

function providerRefreshFailed(reason: string): AppError {
  return new AppError(
    502,
    'INVESTMENT_CALENDAR_REFRESH_FAILED',
    'Investment calendar refresh failed. Please try again later.',
    { provider: 'alpha_vantage', reason },
  );
}

function providerInvalidResponse(reason: string): AppError {
  return new AppError(
    502,
    'INVESTMENT_CALENDAR_INVALID_RESPONSE',
    'Investment calendar provider returned an invalid response.',
    { provider: 'alpha_vantage', reason },
  );
}

function buildAlphaVantageUrl(functionName: string, apiKey: string) {
  const url = new URL(ALPHA_VANTAGE_BASE_URL);
  url.searchParams.set('function', functionName);
  url.searchParams.set('apikey', apiKey);
  return url;
}

async function fetchAlphaVantage(functionName: string, apiKey: string): Promise<Response> {
  try {
    return await fetch(buildAlphaVantageUrl(functionName, apiKey), {
      signal: AbortSignal.timeout(getTimeoutMs()),
    });
  } catch {
    throw providerRefreshFailed('fetch_failed_or_timeout');
  }
}

function assertNoProviderError(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return;
  const row = payload as Record<string, unknown>;
  if (typeof row.Note === 'string' || typeof row['Error Message'] === 'string' || typeof row.Information === 'string') {
    throw providerRefreshFailed('provider_rejected_or_rate_limited');
  }
}

function normalizeEconomicPayload(
  payload: unknown,
  config: EconomicSeriesConfig,
  input: InvestmentCalendarFetchInput,
): InvestmentCalendarProviderEvent[] {
  assertNoProviderError(payload);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw providerInvalidResponse('economic_payload_not_object');
  }
  const rows = (payload as { data?: unknown }).data;
  if (!Array.isArray(rows)) {
    throw providerInvalidResponse('economic_data_missing');
  }

  return rows
    .map((row): InvestmentCalendarProviderEvent | null => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
      const date = typeof (row as { date?: unknown }).date === 'string'
        ? (row as { date: string }).date.trim()
        : '';
      if (!isCalendarDate(date) || !isInRange(date, input.from, input.to)) return null;
      return normalizeProviderEvent({
        externalId: `alpha-vantage-${config.externalPrefix}-${date}`,
        symbolCode: null,
        eventDate: date,
        eventTime: null,
        timezone: 'America/New_York',
        eventType: 'economic_indicator',
        title: config.title,
        description: 'Alpha Vantage の発表済み経済指標データ系列に基づく日付です。将来予定ではありません。',
        importance: 'high',
        sourceName: 'alpha_vantage',
        sourceLabel: '発表済みデータ由来',
        sourceUrl: null,
      });
    })
    .filter((event): event is InvestmentCalendarProviderEvent => event !== null);
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === ',' && !quoted) {
      values.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  values.push(current);
  return values.map((value) => value.trim());
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length <= 1) return [];
  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? '';
    });
    return row;
  });
}

function normalizeIpoCsv(text: string, input: InvestmentCalendarFetchInput): InvestmentCalendarProviderEvent[] {
  if (/(^|\n)\s*(Note|Information|Error Message)\s*[:{]/i.test(text)) {
    throw providerRefreshFailed('provider_rejected_or_rate_limited');
  }
  const rows = parseCsv(text);
  return rows
    .map((row): InvestmentCalendarProviderEvent | null => {
      const symbol = row.symbol?.trim();
      const name = row.name?.trim();
      const date = row.ipoDate?.trim();
      if (!symbol || !name || !isCalendarDate(date) || !isInRange(date, input.from, input.to)) return null;
      return normalizeProviderEvent({
        externalId: `alpha-vantage-ipo-${symbol}-${date}`,
        symbolCode: null,
        eventDate: date,
        eventTime: null,
        timezone: 'America/New_York',
        eventType: 'ipo',
        title: `${symbol} IPO予定`,
        description: `${name} の IPO calendar event です。`,
        importance: 'medium',
        sourceName: 'alpha_vantage',
        sourceLabel: 'IPO calendar',
        sourceUrl: null,
      });
    })
    .filter((event): event is InvestmentCalendarProviderEvent => event !== null);
}

export class AlphaVantageInvestmentCalendarProvider implements InvestmentCalendarProvider {
  readonly name = 'alpha_vantage' as const;

  async fetchEvents(input: InvestmentCalendarFetchInput): Promise<InvestmentCalendarProviderEvent[]> {
    if (!input.includeMarketEvents) return [];
    const apiKey = getApiKey();
    if (!apiKey) throw providerUnavailable('missing_api_key');

    const events: InvestmentCalendarProviderEvent[] = [];
    for (const config of ECONOMIC_SERIES) {
      const response = await fetchAlphaVantage(config.functionName, apiKey);
      if (!response.ok) throw providerRefreshFailed('provider_http_error');
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw providerInvalidResponse('economic_json_invalid');
      }
      events.push(...normalizeEconomicPayload(payload, config, input));
    }

    const ipoResponse = await fetchAlphaVantage('IPO_CALENDAR', apiKey);
    if (!ipoResponse.ok) throw providerRefreshFailed('provider_http_error');
    let csvText: string;
    try {
      csvText = await ipoResponse.text();
    } catch {
      throw providerInvalidResponse('ipo_csv_invalid');
    }
    events.push(...normalizeIpoCsv(csvText, input));

    return events;
  }
}
