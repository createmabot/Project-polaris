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
  return vi.fn(async (url: URL | string) => {
    const urlText = String(url);
    if (urlText.includes('/token/auth_refresh')) return jsonResponse({ idToken: 'test-id-token' });
    if (urlText.includes('/fins/announcement')) {
      return jsonResponse({
        announcement: [
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
    if (urlText.includes('/markets/trading_calendar')) {
      return jsonResponse({
        trading_calendar: [
          { Date: '2026-06-15', HolidayDivision: '0' },
          { Date: '2026-06-16', HolidayDivision: '1' },
          { Date: '2026-06-17', HolidayDivision: '2' },
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
    process.env.INVESTMENT_CALENDAR_JQUANTS_REFRESH_TOKEN = 'test-refresh-token';
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
    expect(JSON.stringify(events)).not.toContain('test-refresh-token');
    expect(JSON.stringify(events)).not.toContain('api.jquants.com');
    expect(JSON.stringify(events)).not.toContain('raw');
    const announcementCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/fins/announcement'));
    expect(announcementCall).toBeTruthy();
    expect(String(announcementCall?.[0])).not.toContain('from=');
    expect(String(announcementCall?.[0])).not.toContain('to=');
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
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/markets/trading_calendar'))).toBe(false);
  });

  it('fails with a sanitized missing API key error', async () => {
    delete process.env.INVESTMENT_CALENDAR_JQUANTS_REFRESH_TOKEN;
    delete process.env.INVESTMENT_CALENDAR_JQUANTS_API_KEY;

    await expect(new JQuantsInvestmentCalendarProvider().fetchEvents(createInput())).rejects.toMatchObject({
      code: 'INVESTMENT_CALENDAR_PROVIDER_UNAVAILABLE',
      details: { provider: 'jquants', reason: 'missing_refresh_token' },
    });
  });

  it('fails with a sanitized invalid refresh token error', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: URL | string) => {
      if (String(url).includes('/token/auth_refresh')) return jsonResponse({ message: 'invalid raw provider message' }, false, 400);
      return jsonResponse({});
    }));

    await expect(new JQuantsInvestmentCalendarProvider().fetchEvents(createInput())).rejects.toMatchObject({
      code: 'INVESTMENT_CALENDAR_REFRESH_FAILED',
      details: { provider: 'jquants', reason: 'invalid_or_expired_refresh_token' },
    });
  });

  it('fails with a sanitized provider rejection error', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: URL | string) => {
      if (String(url).includes('/token/auth_refresh')) return jsonResponse({ idToken: 'test-id-token' });
      return jsonResponse({ message: 'rate limited raw provider body' }, false, 429);
    }));

    await expect(new JQuantsInvestmentCalendarProvider().fetchEvents(createInput())).rejects.toMatchObject({
      code: 'INVESTMENT_CALENDAR_REFRESH_FAILED',
      details: { provider: 'jquants', reason: 'provider_rejected_or_rate_limited' },
    });
  });

  it('fails with a sanitized invalid response error', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: URL | string) => {
      if (String(url).includes('/token/auth_refresh')) return jsonResponse({ idToken: 'test-id-token' });
      return jsonResponse({ unexpected: true });
    }));

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
