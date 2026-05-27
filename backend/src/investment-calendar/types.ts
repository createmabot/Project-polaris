export type InvestmentCalendarProviderName = 'stub' | 'public' | 'alpha_vantage' | 'jquants' | 'official_market';

export type InvestmentCalendarFetchInput = {
  from: string;
  to: string;
  symbols: Array<{
    id: string;
    symbol: string | null;
    symbolCode: string | null;
    marketCode: string | null;
    displayName: string | null;
  }>;
  includeMarketEvents: boolean;
};

export type InvestmentCalendarProviderEvent = {
  externalId: string;
  symbolCode?: string | null;
  eventDate: string;
  eventTime?: string | null;
  timezone: string;
  eventType: string;
  title: string;
  description?: string | null;
  importance: string;
  sourceName: string;
  sourceLabel?: string | null;
  sourceUrl?: string | null;
};

export type InvestmentCalendarRefreshResult = {
  status: 'succeeded' | 'partial_success' | 'failed';
  saved_count: number;
  updated_count: number;
  skipped_count: number;
  failed_count: number;
  from: string;
  to: string;
  source: 'stub' | 'public_provider';
  manual_only: true;
  provider?: string;
  providers?: Array<{
    provider: string;
    status: 'succeeded' | 'failed' | 'skipped';
    saved_count: number;
    updated_count: number;
    skipped_count: number;
    failed_count: number;
    error_code?: string | null;
  }>;
};
