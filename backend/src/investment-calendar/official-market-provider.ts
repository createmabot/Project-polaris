import { AppError } from '../utils/response';
import { normalizeProviderEvent } from './normalization';
import type { InvestmentCalendarProvider } from './provider';
import { InvestmentCalendarFetchInput, InvestmentCalendarProviderEvent } from './types';

type OfficialMarketSource = 'fomc' | 'boj' | 'us_market_holiday';

type OfficialFixtureEvent = {
  date: string;
  kind?: string | null;
  title?: string | null;
  description?: string | null;
};

const BUILTIN_FOMC_FIXTURE = JSON.stringify({
  events: [
    { date: '2026-06-17', title: 'FOMC' },
    { date: '2026-07-29', title: 'FOMC' },
  ],
});

const BUILTIN_BOJ_FIXTURE = JSON.stringify({
  events: [
    { date: '2026-06-19', title: '日銀金融政策決定会合' },
    { date: '2026-07-31', title: '日銀金融政策決定会合' },
  ],
});

const BUILTIN_US_MARKET_HOLIDAY_FIXTURE = JSON.stringify({
  events: [
    { date: '2026-05-25', kind: 'holiday', title: '米国市場 休場日' },
    { date: '2026-07-03', kind: 'early_close', title: '米国市場 短縮取引' },
  ],
});

function getTimeoutMs() {
  const raw = process.env.INVESTMENT_CALENDAR_OFFICIAL_MARKET_TIMEOUT_MS
    ?? process.env.INVESTMENT_CALENDAR_FETCH_TIMEOUT_MS;
  const value = raw ? Number(raw) : 10000;
  return Number.isFinite(value) && value > 0 ? value : 10000;
}

function providerRefreshFailed(reason: string, sourceName?: string): AppError {
  return new AppError(
    502,
    'INVESTMENT_CALENDAR_REFRESH_FAILED',
    'Investment calendar refresh failed. Please try again later.',
    { provider: 'official_market', source: sourceName ?? null, reason },
  );
}

function providerInvalidResponse(reason: string, sourceName?: string): AppError {
  return new AppError(
    502,
    'INVESTMENT_CALENDAR_INVALID_RESPONSE',
    'Investment calendar provider returned an invalid response.',
    { provider: 'official_market', source: sourceName ?? null, reason },
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

function getSourceUrl(source: OfficialMarketSource): string | null {
  const key = {
    fomc: 'INVESTMENT_CALENDAR_OFFICIAL_MARKET_FOMC_URL',
    boj: 'INVESTMENT_CALENDAR_OFFICIAL_MARKET_BOJ_URL',
    us_market_holiday: 'INVESTMENT_CALENDAR_OFFICIAL_MARKET_US_HOLIDAY_URL',
  }[source];
  const value = process.env[key]?.trim();
  return value || null;
}

function getBuiltinFixture(source: OfficialMarketSource): string {
  if (source === 'fomc') return BUILTIN_FOMC_FIXTURE;
  if (source === 'boj') return BUILTIN_BOJ_FIXTURE;
  return BUILTIN_US_MARKET_HOLIDAY_FIXTURE;
}

async function fetchSourcePayload(source: OfficialMarketSource): Promise<string> {
  const url = getSourceUrl(source);
  if (!url) return getBuiltinFixture(source);

  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(getTimeoutMs()) });
  } catch {
    throw providerRefreshFailed('fetch_failed_or_timeout', source);
  }
  if (!response.ok) throw providerRefreshFailed('provider_http_error', source);
  try {
    return await response.text();
  } catch {
    throw providerInvalidResponse('text_invalid', source);
  }
}

function readAttribute(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`${name}=["']([^"']+)["']`, 'i'));
  return match?.[1]?.trim() || null;
}

function parseJsonEvents(payload: string): OfficialFixtureEvent[] | null {
  try {
    const parsed = JSON.parse(payload) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const events = (parsed as { events?: unknown }).events;
    if (!Array.isArray(events)) return null;
    return events
      .map((row): OfficialFixtureEvent | null => {
        if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
        const event = row as Record<string, unknown>;
        const date = typeof event.date === 'string' ? event.date.trim() : '';
        if (!date) return null;
        return {
          date,
          kind: typeof event.kind === 'string' ? event.kind.trim() : null,
          title: typeof event.title === 'string' ? event.title.trim() : null,
          description: typeof event.description === 'string' ? event.description.trim() : null,
        };
      })
      .filter((event): event is OfficialFixtureEvent => event !== null);
  } catch {
    return null;
  }
}

function parseHtmlEvents(payload: string): OfficialFixtureEvent[] {
  const events: OfficialFixtureEvent[] = [];
  const tagPattern = /<[^>]+data-calendar-event=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(payload)) !== null) {
    const tag = match[0];
    const date = readAttribute(tag, 'data-date');
    if (!date) continue;
    events.push({
      date,
      kind: readAttribute(tag, 'data-kind'),
      title: readAttribute(tag, 'data-title'),
      description: readAttribute(tag, 'data-description'),
    });
  }
  return events;
}

export function parseOfficialMarketEvents(
  source: OfficialMarketSource,
  payload: string,
  input: Pick<InvestmentCalendarFetchInput, 'from' | 'to'>,
): InvestmentCalendarProviderEvent[] {
  const parsedEvents = parseJsonEvents(payload) ?? parseHtmlEvents(payload);
  return parsedEvents
    .map((row): InvestmentCalendarProviderEvent | null => {
      const date = row.date.trim();
      if (!isCalendarDate(date) || !isInRange(date, input.from, input.to)) return null;

      if (source === 'fomc') {
        return normalizeProviderEvent({
          externalId: `official-market-fomc-${date}`,
          symbolCode: null,
          eventDate: date,
          eventTime: null,
          timezone: 'America/New_York',
          eventType: 'central_bank',
          title: row.title || 'FOMC',
          description: row.description || 'FOMC meeting end / statement date.',
          importance: 'high',
          sourceName: 'federal_reserve',
          sourceLabel: 'FOMC calendar',
          sourceUrl: null,
        });
      }

      if (source === 'boj') {
        return normalizeProviderEvent({
          externalId: `official-market-boj-${date}`,
          symbolCode: null,
          eventDate: date,
          eventTime: null,
          timezone: 'Asia/Tokyo',
          eventType: 'central_bank',
          title: row.title || '日銀金融政策決定会合',
          description: row.description || '会合最終日または公表日を優先した日付です。',
          importance: 'high',
          sourceName: 'boj',
          sourceLabel: '金融政策決定会合',
          sourceUrl: null,
        });
      }

      const isEarlyClose = row.kind === 'early_close';
      return normalizeProviderEvent({
        externalId: `official-market-us-${isEarlyClose ? 'early-close' : 'holiday'}-${date}`,
        symbolCode: null,
        eventDate: date,
        eventTime: null,
        timezone: 'America/New_York',
        eventType: 'market_holiday',
        title: row.title || (isEarlyClose ? '米国市場 短縮取引' : '米国市場 休場日'),
        description: row.description || (isEarlyClose ? 'US market early close.' : 'US market holiday.'),
        importance: 'medium',
        sourceName: 'nyse',
        sourceLabel: 'US market holiday',
        sourceUrl: null,
      });
    })
    .filter((event): event is InvestmentCalendarProviderEvent => event !== null);
}

export class OfficialMarketInvestmentCalendarProvider implements InvestmentCalendarProvider {
  readonly name = 'official_market' as const;

  async fetchEvents(input: InvestmentCalendarFetchInput): Promise<InvestmentCalendarProviderEvent[]> {
    if (!input.includeMarketEvents) return [];

    const events: InvestmentCalendarProviderEvent[] = [];
    let successCount = 0;
    let failureCount = 0;
    const sources: OfficialMarketSource[] = ['fomc', 'boj', 'us_market_holiday'];

    for (const source of sources) {
      try {
        const payload = await fetchSourcePayload(source);
        events.push(...parseOfficialMarketEvents(source, payload, input));
        successCount += 1;
      } catch {
        failureCount += 1;
      }
    }

    if (successCount === 0 && failureCount > 0) {
      throw providerRefreshFailed('all_sources_failed');
    }

    return events;
  }
}
