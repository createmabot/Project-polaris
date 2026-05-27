import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AlphaVantageInvestmentCalendarProvider } from '../src/investment-calendar/alpha-vantage-provider';
import { createInvestmentCalendarProvider } from '../src/investment-calendar/provider';

const ORIGINAL_ENV = { ...process.env };

function createInput() {
  return {
    from: '2026-05-01',
    to: '2026-07-31',
    includeMarketEvents: true,
    symbols: [],
  };
}

function jsonResponse(payload: unknown, ok = true) {
  return {
    ok,
    json: vi.fn(async () => payload),
    text: vi.fn(async () => ''),
  } as any;
}

function textResponse(payload: string, ok = true) {
  return {
    ok,
    json: vi.fn(async () => ({})),
    text: vi.fn(async () => payload),
  } as any;
}

function economicPayload(date: string) {
  return {
    name: 'series',
    interval: 'monthly',
    unit: 'value',
    data: [
      { date, value: '100.0' },
      { date: '2025-01-01', value: '99.0' },
    ],
  };
}

describe('AlphaVantageInvestmentCalendarProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.INVESTMENT_CALENDAR_PROVIDERS;
    process.env.INVESTMENT_CALENDAR_ALPHA_VANTAGE_API_KEY = 'test-key';
    process.env.INVESTMENT_CALENDAR_ALPHA_VANTAGE_TIMEOUT_MS = '1000';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    process.env = { ...ORIGINAL_ENV };
  });

  it('normalizes Alpha Vantage economic and IPO fixtures without exposing raw provider details', async () => {
    const fetchMock = vi.fn(async (url: URL) => {
      const functionName = url.searchParams.get('function');
      if (functionName === 'CPI') return jsonResponse(economicPayload('2026-05-13'));
      if (functionName === 'RETAIL_SALES') return jsonResponse(economicPayload('2026-05-15'));
      if (functionName === 'UNEMPLOYMENT') return jsonResponse(economicPayload('2026-06-05'));
      if (functionName === 'NONFARM_PAYROLL') return jsonResponse(economicPayload('2026-06-05'));
      if (functionName === 'REAL_GDP') {
        expect(url.searchParams.get('interval')).toBe('quarterly');
        return jsonResponse(economicPayload('2026-07-01'));
      }
      if (functionName === 'PPI') return jsonResponse(economicPayload('2026-07-15'));
      if (functionName === 'IPO_CALENDAR') {
        return textResponse('symbol,name,ipoDate,priceRangeLow,priceRangeHigh,currency,exchange\nTEST,Test Holdings,2026-07-01,10,12,USD,NASDAQ\nOLD,Old Holdings,2025-01-01,10,12,USD,NYSE\n');
      }
      return jsonResponse({}, false);
    });
    vi.stubGlobal('fetch', fetchMock);

    const events = await new AlphaVantageInvestmentCalendarProvider().fetchEvents(createInput());

    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        externalId: 'alpha-vantage-cpi-2026-05-13',
        eventType: 'economic_indicator',
        title: '米CPI',
        sourceName: 'alpha_vantage',
        sourceLabel: '発表済みデータ由来',
      }),
      expect.objectContaining({
        externalId: 'alpha-vantage-ipo-TEST-2026-07-01',
        eventType: 'ipo',
        title: 'TEST IPO予定',
        sourceLabel: 'IPO calendar',
      }),
      expect.objectContaining({
        externalId: 'alpha-vantage-real-gdp-2026-07-01',
        eventType: 'economic_indicator',
        title: '米GDP',
        sourceLabel: 'GDP（発表済みデータ由来）',
      }),
      expect.objectContaining({
        externalId: 'alpha-vantage-ppi-2026-07-15',
        eventType: 'economic_indicator',
        title: '米PPI',
        sourceLabel: 'PPI（発表済みデータ由来）',
      }),
    ]));
    expect(events).toHaveLength(7);
    expect(JSON.stringify(events)).not.toContain('test-key');
    expect(JSON.stringify(events)).not.toContain('alphavantage.co');
    expect(JSON.stringify(events)).not.toContain('raw');
  });

  it('returns no events for symbol-only refresh instead of applying US market data to JP symbols', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const events = await new AlphaVantageInvestmentCalendarProvider().fetchEvents({
      ...createInput(),
      includeMarketEvents: false,
      symbols: [{ id: 'sym-7203', symbol: '7203', symbolCode: '7203', marketCode: 'JP_STOCK', displayName: 'Toyota' }],
    });

    expect(events).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails with a sanitized missing API key error', async () => {
    delete process.env.INVESTMENT_CALENDAR_ALPHA_VANTAGE_API_KEY;

    await expect(new AlphaVantageInvestmentCalendarProvider().fetchEvents(createInput())).rejects.toMatchObject({
      code: 'INVESTMENT_CALENDAR_PROVIDER_UNAVAILABLE',
      details: { provider: 'alpha_vantage', reason: 'missing_api_key' },
    });
  });

  it('fails with a sanitized invalid response error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ unexpected: true })));

    await expect(new AlphaVantageInvestmentCalendarProvider().fetchEvents(createInput())).rejects.toMatchObject({
      code: 'INVESTMENT_CALENDAR_INVALID_RESPONSE',
      details: { provider: 'alpha_vantage' },
    });
  });

  it('fails with a sanitized provider rejection error', async () => {
    const fetchMock = vi.fn(async (url: URL) => {
      const functionName = url.searchParams.get('function');
      if (functionName === 'IPO_CALENDAR') return textResponse('Note: rate limited raw provider note');
      return jsonResponse({ Note: 'rate limited raw provider note' });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(new AlphaVantageInvestmentCalendarProvider().fetchEvents(createInput())).rejects.toMatchObject({
      code: 'INVESTMENT_CALENDAR_REFRESH_FAILED',
      details: { provider: 'alpha_vantage', reason: 'provider_rejected_or_rate_limited' },
    });
  });

  it('skips rejected Alpha Vantage endpoints when at least one endpoint succeeds', async () => {
    const fetchMock = vi.fn(async (url: URL) => {
      const functionName = url.searchParams.get('function');
      if (functionName === 'CPI') return jsonResponse(economicPayload('2026-05-13'));
      if (functionName === 'IPO_CALENDAR') {
        return textResponse('symbol,name,ipoDate,priceRangeLow,priceRangeHigh,currency,exchange\nTEST,Test Holdings,2026-07-01,10,12,USD,NASDAQ\n');
      }
      return jsonResponse({ Information: 'provider rejected endpoint for this key' });
    });
    vi.stubGlobal('fetch', fetchMock);

    const events = await new AlphaVantageInvestmentCalendarProvider().fetchEvents(createInput());

    expect(events).toEqual([
      expect.objectContaining({
        externalId: 'alpha-vantage-cpi-2026-05-13',
        eventType: 'economic_indicator',
      }),
      expect.objectContaining({
        externalId: 'alpha-vantage-ipo-TEST-2026-07-01',
        eventType: 'ipo',
      }),
    ]);
    expect(JSON.stringify(events)).not.toContain('provider rejected');
    expect(JSON.stringify(events)).not.toContain('test-key');
    expect(JSON.stringify(events)).not.toContain('alphavantage.co');
  });

  it('creates alpha_vantage provider mode from env', () => {
    process.env.INVESTMENT_CALENDAR_PROVIDER = 'alpha_vantage';
    expect(createInvestmentCalendarProvider()).toBeInstanceOf(AlphaVantageInvestmentCalendarProvider);
  });
});
