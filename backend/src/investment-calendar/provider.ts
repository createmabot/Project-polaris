import { AppError } from '../utils/response';
import { AlphaVantageInvestmentCalendarProvider } from './alpha-vantage-provider';
import { JQuantsInvestmentCalendarProvider } from './jquants-provider';
import {
  normalizeProviderEvent,
} from './normalization';
import {
  InvestmentCalendarFetchInput,
  InvestmentCalendarProviderEvent,
  InvestmentCalendarProviderName,
} from './types';

export interface InvestmentCalendarProvider {
  readonly name: InvestmentCalendarProviderName;
  fetchEvents(input: InvestmentCalendarFetchInput): Promise<InvestmentCalendarProviderEvent[]>;
}

function getPublicProviderUrlTemplate() {
  return process.env.INVESTMENT_CALENDAR_PUBLIC_SOURCE_URL_TEMPLATE?.trim() || null;
}

function getCalendarFetchTimeoutMs() {
  const raw = process.env.INVESTMENT_CALENDAR_FETCH_TIMEOUT_MS;
  const value = raw ? Number(raw) : 10000;
  return Number.isFinite(value) && value > 0 ? value : 10000;
}

function getConfiguredProviderName(): InvestmentCalendarProviderName {
  if (process.env.INVESTMENT_CALENDAR_PROVIDER === 'alpha_vantage') return 'alpha_vantage';
  if (process.env.INVESTMENT_CALENDAR_PROVIDER === 'jquants') return 'jquants';
  return process.env.INVESTMENT_CALENDAR_PROVIDER === 'public' ? 'public' : 'stub';
}

function parseProviderName(value: string): InvestmentCalendarProviderName | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'alpha_vantage') return 'alpha_vantage';
  if (normalized === 'jquants') return 'jquants';
  if (normalized === 'public') return 'public';
  if (normalized === 'stub') return 'stub';
  return null;
}

export function getConfiguredProviderNames(): InvestmentCalendarProviderName[] {
  const configuredList = process.env.INVESTMENT_CALENDAR_PROVIDERS
    ?.split(',')
    .map(parseProviderName)
    .filter((name): name is InvestmentCalendarProviderName => name !== null) ?? [];
  const deduped = Array.from(new Set(configuredList));
  return deduped.length > 0 ? deduped : [getConfiguredProviderName()];
}

export class StubInvestmentCalendarProvider implements InvestmentCalendarProvider {
  readonly name = 'stub' as const;

  async fetchEvents(input: InvestmentCalendarFetchInput): Promise<InvestmentCalendarProviderEvent[]> {
    const fromDate = new Date(`${input.from}T00:00:00.000Z`);
    const events: InvestmentCalendarProviderEvent[] = [];
    const symbol = input.symbols[0] ?? null;
    if (symbol) {
      const earningsDate = new Date(fromDate);
      earningsDate.setUTCDate(earningsDate.getUTCDate() + 7);
      events.push({
        externalId: `stub-symbol-${symbol.id}-earnings-${earningsDate.toISOString().slice(0, 10)}`,
        symbolCode: symbol.symbolCode ?? symbol.symbol ?? null,
        eventDate: earningsDate.toISOString().slice(0, 10),
        eventTime: null,
        timezone: 'Asia/Tokyo',
        eventType: 'earnings',
        title: `${symbol.displayName ?? symbol.symbolCode ?? symbol.symbol ?? '対象銘柄'} 決算発表予定`,
        description: null,
        importance: 'high',
        sourceName: 'stub',
        sourceLabel: 'seed fixture',
        sourceUrl: null,
      });
    }

    if (input.includeMarketEvents) {
      const cpiDate = new Date(fromDate);
      cpiDate.setUTCDate(cpiDate.getUTCDate() + 3);
      events.push({
        externalId: `stub-market-cpi-${cpiDate.toISOString().slice(0, 10)}`,
        symbolCode: null,
        eventDate: cpiDate.toISOString().slice(0, 10),
        eventTime: '21:30',
        timezone: 'Asia/Tokyo',
        eventType: 'economic_indicator',
        title: '米CPI発表',
        description: null,
        importance: 'high',
        sourceName: 'stub',
        sourceLabel: 'economic calendar',
        sourceUrl: null,
      });
    }

    return events;
  }
}

export class PublicInvestmentCalendarProvider implements InvestmentCalendarProvider {
  readonly name = 'public' as const;

  async fetchEvents(input: InvestmentCalendarFetchInput): Promise<InvestmentCalendarProviderEvent[]> {
    const template = getPublicProviderUrlTemplate();
    if (!template) {
      throw new AppError(
        502,
        'INVESTMENT_CALENDAR_PROVIDER_UNAVAILABLE',
        'Investment calendar provider is not configured. Use stub provider or configure a public source for manual refresh.',
        { provider: 'public' },
      );
    }

    const symbolCodes = input.symbols
      .map((symbol) => symbol.symbolCode ?? symbol.symbol)
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map((value) => value.trim())
      .join(',');
    const url = template
      .replace('{from}', encodeURIComponent(input.from))
      .replace('{to}', encodeURIComponent(input.to))
      .replace('{symbols}', encodeURIComponent(symbolCodes))
      .replace('{include_market_events}', input.includeMarketEvents ? 'true' : 'false');

    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(getCalendarFetchTimeoutMs()) });
    } catch {
      throw new AppError(502, 'INVESTMENT_CALENDAR_REFRESH_FAILED', 'Investment calendar refresh failed. Please try again later.');
    }

    if (!response.ok) {
      throw new AppError(502, 'INVESTMENT_CALENDAR_REFRESH_FAILED', 'Investment calendar refresh failed. Please try again later.');
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new AppError(502, 'INVESTMENT_CALENDAR_INVALID_RESPONSE', 'Investment calendar provider returned an invalid response.');
    }

    const rows = Array.isArray(payload)
      ? payload
      : payload && typeof payload === 'object' && Array.isArray((payload as { events?: unknown }).events)
        ? (payload as { events: unknown[] }).events
        : [];
    return rows
      .map((row) => normalizeProviderEvent(row))
      .filter((event): event is InvestmentCalendarProviderEvent => event !== null);
  }
}

export function createInvestmentCalendarProvider(
  providerName: InvestmentCalendarProviderName = getConfiguredProviderName(),
): InvestmentCalendarProvider {
  if (providerName === 'alpha_vantage') return new AlphaVantageInvestmentCalendarProvider();
  if (providerName === 'jquants') return new JQuantsInvestmentCalendarProvider();
  if (providerName === 'public') return new PublicInvestmentCalendarProvider();
  return new StubInvestmentCalendarProvider();
}

export function createInvestmentCalendarProviders(
  providerNames: InvestmentCalendarProviderName[] = getConfiguredProviderNames(),
): InvestmentCalendarProvider[] {
  return providerNames.map((providerName) => createInvestmentCalendarProvider(providerName));
}
