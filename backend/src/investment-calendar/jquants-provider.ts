import { AppError } from '../utils/response';
import { normalizeProviderEvent } from './normalization';
import type { InvestmentCalendarProvider } from './provider';
import { InvestmentCalendarFetchInput, InvestmentCalendarProviderEvent } from './types';

const JQUANTS_BASE_URL = 'https://api.jquants.com/v1';

type CalendarSymbol = InvestmentCalendarFetchInput['symbols'][number];

function getRefreshToken() {
  return process.env.INVESTMENT_CALENDAR_JQUANTS_REFRESH_TOKEN?.trim()
    || process.env.INVESTMENT_CALENDAR_JQUANTS_API_KEY?.trim()
    || null;
}

function getTimeoutMs() {
  const raw = process.env.INVESTMENT_CALENDAR_JQUANTS_TIMEOUT_MS
    ?? process.env.INVESTMENT_CALENDAR_FETCH_TIMEOUT_MS;
  const value = raw ? Number(raw) : 10000;
  return Number.isFinite(value) && value > 0 ? value : 10000;
}

function providerUnavailable(reason: string): AppError {
  return new AppError(
    502,
    'INVESTMENT_CALENDAR_PROVIDER_UNAVAILABLE',
    'Investment calendar provider is not configured. Use stub provider or configure J-Quants for manual refresh.',
    { provider: 'jquants', reason },
  );
}

function providerRefreshFailed(reason: string): AppError {
  return new AppError(
    502,
    'INVESTMENT_CALENDAR_REFRESH_FAILED',
    'Investment calendar refresh failed. Please try again later.',
    { provider: 'jquants', reason },
  );
}

function providerInvalidResponse(reason: string): AppError {
  return new AppError(
    502,
    'INVESTMENT_CALENDAR_INVALID_RESPONSE',
    'Investment calendar provider returned an invalid response.',
    { provider: 'jquants', reason },
  );
}

function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isInRange(date: string, from: string, to: string) {
  return date >= from && date <= to;
}

function toProviderDate(date: string) {
  return date.replace(/-/g, '');
}

function toCalendarDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (/^\d{8}$/.test(trimmed)) {
    const normalized = `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`;
    return isCalendarDate(normalized) ? normalized : null;
  }
  return isCalendarDate(trimmed) ? trimmed : null;
}

function normalizeJpSymbolCode(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const raw = String(value).trim().toUpperCase();
  if (!raw) return null;
  if (/^\d{5}$/.test(raw) && raw.endsWith('0')) return raw.slice(0, 4);
  if (/^\d{4}$/.test(raw)) return raw;
  return raw;
}

function toJquantsCode(value: string) {
  return /^\d{4}$/.test(value) ? `${value}0` : value;
}

function buildSymbolLookup(symbols: CalendarSymbol[]) {
  const byCode = new Map<string, CalendarSymbol>();
  for (const symbol of symbols) {
    for (const value of [symbol.symbolCode, symbol.symbol]) {
      const normalized = normalizeJpSymbolCode(value);
      if (!normalized) continue;
      byCode.set(normalized, symbol);
      byCode.set(toJquantsCode(normalized), symbol);
    }
  }
  return byCode;
}

function getString(row: Record<string, unknown>, names: string[]): string | null {
  for (const name of names) {
    const value = row[name];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number') return String(value);
  }
  return null;
}

function getArrayPayload(payload: unknown, names: string[], reason: string): unknown[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw providerInvalidResponse(reason);
  }
  const row = payload as Record<string, unknown>;
  for (const name of names) {
    if (Array.isArray(row[name])) return row[name] as unknown[];
  }
  throw providerInvalidResponse(reason);
}

async function fetchJson(url: URL, init?: RequestInit): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(getTimeoutMs()),
    });
  } catch {
    throw providerRefreshFailed('fetch_failed_or_timeout');
  }

  if (response.status === 401 || response.status === 403 || response.status === 429) {
    throw providerRefreshFailed('provider_rejected_or_rate_limited');
  }
  if (!response.ok) throw providerRefreshFailed('provider_http_error');

  try {
    return await response.json();
  } catch {
    throw providerInvalidResponse('json_invalid');
  }
}

async function fetchIdToken(refreshToken: string): Promise<string> {
  const url = new URL(`${JQUANTS_BASE_URL}/token/auth_refresh`);
  url.searchParams.set('refreshtoken', refreshToken);
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      signal: AbortSignal.timeout(getTimeoutMs()),
    });
  } catch {
    throw providerRefreshFailed('fetch_failed_or_timeout');
  }

  if (response.status === 400 || response.status === 401 || response.status === 403) {
    throw providerRefreshFailed('invalid_or_expired_refresh_token');
  }
  if (response.status === 429) {
    throw providerRefreshFailed('provider_rejected_or_rate_limited');
  }
  if (!response.ok) throw providerRefreshFailed('provider_http_error');

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw providerInvalidResponse('auth_json_invalid');
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw providerInvalidResponse('auth_payload_not_object');
  }
  const token = (payload as { idToken?: unknown }).idToken;
  if (typeof token !== 'string' || !token.trim()) {
    throw providerInvalidResponse('auth_token_missing');
  }
  return token.trim();
}

async function fetchJquantsData(pathname: string, idToken: string, params: Record<string, string>): Promise<unknown> {
  const url = new URL(`${JQUANTS_BASE_URL}${pathname}`);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }
  return fetchJson(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });
}

function normalizeAnnouncementRows(
  payload: unknown,
  input: InvestmentCalendarFetchInput,
): InvestmentCalendarProviderEvent[] {
  const rows = getArrayPayload(payload, ['announcement', 'announcements', 'data'], 'announcement_data_missing');
  const symbolLookup = buildSymbolLookup(input.symbols);

  return rows
    .map((value): InvestmentCalendarProviderEvent | null => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
      const row = value as Record<string, unknown>;
      const rawCode = getString(row, ['Code', 'code', 'LocalCode', 'localCode']);
      const code = normalizeJpSymbolCode(rawCode);
      if (!code || !symbolLookup.has(code)) return null;

      const date = toCalendarDate(getString(row, ['Date', 'date', 'AnnouncementDate', 'announcementDate', 'DisclosedDate']));
      if (!date || !isInRange(date, input.from, input.to)) return null;

      const symbol = symbolLookup.get(code);
      const companyName = getString(row, ['CompanyName', 'companyName', 'CompanyNameJapanese', 'CompanyNameEnglish'])
        ?? symbol?.displayName
        ?? code;
      const fiscalQuarter = getString(row, ['FiscalQuarter', 'fiscalQuarter', 'FiscalYear', 'fiscalYear']) ?? 'unknown';

      return normalizeProviderEvent({
        externalId: `jquants-earnings-${code}-${date}-${fiscalQuarter}`,
        symbolCode: code,
        eventDate: date,
        eventTime: null,
        timezone: 'Asia/Tokyo',
        eventType: 'earnings',
        title: `${companyName} 決算発表予定`,
        description: null,
        importance: 'high',
        sourceName: 'jquants',
        sourceLabel: '決算発表予定日',
        sourceUrl: null,
      });
    })
    .filter((event): event is InvestmentCalendarProviderEvent => event !== null);
}

function isMarketHolidayDivision(value: unknown): boolean {
  const normalized = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  return normalized === '0' || normalized === '3';
}

function normalizeTradingCalendarRows(
  payload: unknown,
  input: InvestmentCalendarFetchInput,
): InvestmentCalendarProviderEvent[] {
  const rows = getArrayPayload(payload, ['trading_calendar', 'tradingCalendar', 'calendar', 'data'], 'trading_calendar_data_missing');
  return rows
    .map((value): InvestmentCalendarProviderEvent | null => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
      const row = value as Record<string, unknown>;
      const date = toCalendarDate(getString(row, ['Date', 'date']));
      if (!date || !isInRange(date, input.from, input.to)) return null;
      if (!isMarketHolidayDivision(row.HolidayDivision ?? row.holidayDivision)) return null;

      return normalizeProviderEvent({
        externalId: `jquants-market-holiday-${date}`,
        symbolCode: null,
        eventDate: date,
        eventTime: null,
        timezone: 'Asia/Tokyo',
        eventType: 'market_holiday',
        title: '東京市場 休場日',
        description: null,
        importance: 'medium',
        sourceName: 'jquants',
        sourceLabel: '取引カレンダー',
        sourceUrl: null,
      });
    })
    .filter((event): event is InvestmentCalendarProviderEvent => event !== null);
}

export class JQuantsInvestmentCalendarProvider implements InvestmentCalendarProvider {
  readonly name = 'jquants' as const;

  async fetchEvents(input: InvestmentCalendarFetchInput): Promise<InvestmentCalendarProviderEvent[]> {
    const refreshToken = getRefreshToken();
    if (!refreshToken) throw providerUnavailable('missing_refresh_token');

    const idToken = await fetchIdToken(refreshToken);
    const events: InvestmentCalendarProviderEvent[] = [];
    if (input.symbols.length > 0) {
      const announcementPayload = await fetchJquantsData('/fins/announcement', idToken, {});
      events.push(...normalizeAnnouncementRows(announcementPayload, input));
    }

    if (input.includeMarketEvents) {
      const tradingCalendarPayload = await fetchJquantsData('/markets/trading_calendar', idToken, {
        from: toProviderDate(input.from),
        to: toProviderDate(input.to),
      });
      events.push(...normalizeTradingCalendarRows(tradingCalendarPayload, input));
    }

    return events;
  }
}
