import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JQuantsInvestmentCalendarProvider } from '../src/investment-calendar/jquants-provider';
import { createInvestmentCalendarProvider } from '../src/investment-calendar/provider';

const ORIGINAL_ENV = { ...process.env };

function createInput(includeMarketEvents = true) {
  return {
    from: '2026-06-01',
    to: '2026-07-31',
    includeMarketEvents,
    symbols: [
      {
        id: 'sym-7203',
        symbol: '7203',
        symbolCode: '7203',
        marketCode: 'JP_STOCK',
        displayName: 'トヨタ自動車',
      },
    ],
  };
}

function jsonResponse(payload: unknown, ok = true, status = ok ? 200 : 500) {
  return {
    ok,
    status,
    json: vi.fn(async () => payload),
    text: vi.fn(async () => JSON.stringify(payload)),
  } as any;
}

function mockJQuantsFetch() {
  return vi.fn(async (url: URL | string, init?: RequestInit) => {
    const urlText = String(url);
    expect((init?.headers as Record<string, string>)?.['x-api-key']).toBe('test-api-key');
    if (urlText.includes('/equities/earnings-calendar')) {
      return jsonResponse({
        data: [
          {
            Code: '72030',
            Date: '2026-06-10',
            CompanyName: 'トヨタ自動車',
            FiscalQuarter: 'FY',
          },
          {
            Code: '99990',
            Date: '2026-06-12',
            CompanyName: '未登録銘柄',
            FiscalQuarter: 'FY',
          },
          {
            Code: '72030',
            Date: '2025-01-01',
            CompanyName: 'トヨタ自動車',
            FiscalQuarter: 'OLD',
          },
        ],
      });
    }
    if (urlText.includes('/markets/calendar')) {
      return jsonResponse({
        data: [
          { Date: '2026-06-15', HolDiv: '1' },
          { Date: '2026-06-16', HolDiv: '0' },
          { Date: '2026-06-17', HolDiv: '2' },
        ],
      });
    }
    return jsonResponse({}, false);
  });
}

describe('JQuantsInvestmentCalendarProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    process.env = { ...ORIGINAL_ENV };
    process.env.INVESTMENT_CALENDAR_JQUANTS_API_KEY = 'test-api-key';
    process.env.INVESTMENT_CALENDAR_JQUANTS_TIMEOUT_MS = '1000';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    process.env = { ...ORIGINAL_ENV };
  });

  it('normalizes J-Quants earnings and trading calendar fixtures without exposing raw provider details', async () => {
    const fetchMock = mockJQuantsFetch();
    vi.stubGlobal('fetch', fetchMock);

    const events = await new JQuantsInvestmentCalendarProvider().fetchEvents(createInput());

    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        externalId: 'jquants-earnings-7203-2026-06-10-FY',
        symbolCode: '7203',
        eventType: 'earnings',
        title: 'トヨタ自動車 決算発表予定',
        sourceName: 'jquants',
        sourceLabel: '決算発表予定日',
      }),
      expect.objectContaining({
        externalId: 'jquants-market-holiday-2026-06-15',
        symbolCode: null,
        eventType: 'market_holiday',
        title: '東京市場 休場日',
        sourceLabel: '取引カレンダー',
      }),
    ]));
    expect(events).toHaveLength(2);
    expect(JSON.stringify(events)).not.toContain('test-api-key');
    expect(JSON.stringify(events)).not.toContain('api.jquants.com');
    expect(JSON.stringify(events)).not.toContain('raw');
    const announcementCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/equities/earnings-calendar'));
    expect(announcementCall).toBeTruthy();
    expect(String(announcementCall?.[0])).toContain('from=2026-06-01');
    expect(String(announcementCall?.[0])).toContain('to=2026-07-31');
    const calendarCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/markets/calendar'));
    expect(calendarCall).toBeTruthy();
    expect(String(calendarCall?.[0])).not.toContain('from=');
    expect(String(calendarCall?.[0])).not.toContain('to=');
  });

  it('skips market events for symbol-only refresh', async () => {
    const fetchMock = mockJQuantsFetch();
    vi.stubGlobal('fetch', fetchMock);

    const events = await new JQuantsInvestmentCalendarProvider().fetchEvents(createInput(false));

    expect(events).toEqual([
      expect.objectContaining({
        eventType: 'earnings',
        symbolCode: '7203',
      }),
    ]);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/markets/calendar'))).toBe(false);
  });

  it('fails with a sanitized missing API key error', async () => {
    delete process.env.INVESTMENT_CALENDAR_JQUANTS_API_KEY;

    await expect(new JQuantsInvestmentCalendarProvider().fetchEvents(createInput())).rejects.toMatchObject({
      code: 'INVESTMENT_CALENDAR_PROVIDER_UNAVAILABLE',
      details: { provider: 'jquants', reason: 'missing_api_key' },
    });
  });

  it('fails with a sanitized invalid API key error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ message: 'invalid raw provider message' }, false, 401)));

    await expect(new JQuantsInvestmentCalendarProvider().fetchEvents(createInput())).rejects.toMatchObject({
      code: 'INVESTMENT_CALENDAR_REFRESH_FAILED',
      details: { provider: 'jquants', reason: 'provider_rejected_or_rate_limited' },
    });
  });

  it('fails with a sanitized provider rejection error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ message: 'rate limited raw provider body' }, false, 429)));

    await expect(new JQuantsInvestmentCalendarProvider().fetchEvents(createInput())).rejects.toMatchObject({
      code: 'INVESTMENT_CALENDAR_REFRESH_FAILED',
      details: { provider: 'jquants', reason: 'provider_rejected_or_rate_limited' },
    });
  });

  it('fails with a sanitized invalid response error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ unexpected: true })));

    await expect(new JQuantsInvestmentCalendarProvider().fetchEvents(createInput())).rejects.toMatchObject({
      code: 'INVESTMENT_CALENDAR_INVALID_RESPONSE',
      details: { provider: 'jquants' },
    });
  });

  it('creates jquants provider mode from env', () => {
    process.env.INVESTMENT_CALENDAR_PROVIDER = 'jquants';
    expect(createInvestmentCalendarProvider()).toBeInstanceOf(JQuantsInvestmentCalendarProvider);
  });
});
