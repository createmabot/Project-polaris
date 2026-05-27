import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OfficialMarketInvestmentCalendarProvider,
  parseOfficialMarketEvents,
} from '../src/investment-calendar/official-market-provider';
import { createInvestmentCalendarProvider } from '../src/investment-calendar/provider';

const ORIGINAL_ENV = { ...process.env };

function createInput(includeMarketEvents = true) {
  return {
    from: '2026-05-01',
    to: '2026-08-31',
    includeMarketEvents,
    symbols: [],
  };
}

function textResponse(payload: string, ok = true, status = ok ? 200 : 500) {
  return {
    ok,
    status,
    text: vi.fn(async () => payload),
  } as any;
}

describe('OfficialMarketInvestmentCalendarProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.INVESTMENT_CALENDAR_PROVIDERS;
    delete process.env.INVESTMENT_CALENDAR_OFFICIAL_MARKET_FOMC_URL;
    delete process.env.INVESTMENT_CALENDAR_OFFICIAL_MARKET_BOJ_URL;
    delete process.env.INVESTMENT_CALENDAR_OFFICIAL_MARKET_US_HOLIDAY_URL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    process.env = { ...ORIGINAL_ENV };
  });

  it('parses FOMC fixture JSON as central bank events', () => {
    const events = parseOfficialMarketEvents('fomc', JSON.stringify({
      events: [{ date: '2026-06-17', title: 'FOMC' }],
    }), createInput());

    expect(events).toEqual([
      expect.objectContaining({
        externalId: 'official-market-fomc-2026-06-17',
        eventType: 'central_bank',
        title: 'FOMC',
        importance: 'high',
        sourceName: 'federal_reserve',
        sourceLabel: 'FOMC calendar',
      }),
    ]);
  });

  it('parses BOJ fixture HTML as central bank events', () => {
    const html = '<div data-calendar-event="1" data-date="2026-07-31" data-title="日銀金融政策決定会合"></div>';

    const events = parseOfficialMarketEvents('boj', html, createInput());

    expect(events).toEqual([
      expect.objectContaining({
        externalId: 'official-market-boj-2026-07-31',
        eventType: 'central_bank',
        title: '日銀金融政策決定会合',
        sourceName: 'boj',
        sourceLabel: '金融政策決定会合',
      }),
    ]);
  });

  it('parses US market holidays and early close fixtures', () => {
    const events = parseOfficialMarketEvents('us_market_holiday', JSON.stringify({
      events: [
        { date: '2026-05-25', kind: 'holiday' },
        { date: '2026-07-03', kind: 'early_close' },
      ],
    }), createInput());

    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        externalId: 'official-market-us-holiday-2026-05-25',
        eventType: 'market_holiday',
        title: '米国市場 休場日',
        sourceName: 'nyse',
        sourceLabel: 'US market holiday',
      }),
      expect.objectContaining({
        externalId: 'official-market-us-early-close-2026-07-03',
        eventType: 'market_holiday',
        title: '米国市場 短縮取引',
        description: 'US market early close.',
      }),
    ]));
  });

  it('returns bundled official market events without real external access by default', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const events = await new OfficialMarketInvestmentCalendarProvider().fetchEvents(createInput());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ eventType: 'central_bank', sourceName: 'federal_reserve' }),
      expect.objectContaining({ eventType: 'central_bank', sourceName: 'boj' }),
      expect.objectContaining({ eventType: 'market_holiday', sourceName: 'nyse' }),
    ]));
    expect(JSON.stringify(events)).not.toContain('http');
    expect(JSON.stringify(events)).not.toContain('raw');
  });

  it('uses mocked source fetch and does not expose source URLs in normalized events', async () => {
    process.env.INVESTMENT_CALENDAR_OFFICIAL_MARKET_FOMC_URL = 'https://official.test/fomc';
    process.env.INVESTMENT_CALENDAR_OFFICIAL_MARKET_BOJ_URL = 'https://official.test/boj';
    process.env.INVESTMENT_CALENDAR_OFFICIAL_MARKET_US_HOLIDAY_URL = 'https://official.test/us-holidays';
    vi.stubGlobal('fetch', vi.fn(async (url: URL | string) => {
      const urlText = String(url);
      if (urlText.includes('fomc')) {
        return textResponse(JSON.stringify({ events: [{ date: '2026-06-17', title: 'FOMC' }] }));
      }
      if (urlText.includes('boj')) {
        return textResponse('<div data-calendar-event="1" data-date="2026-07-31" data-title="日銀金融政策決定会合"></div>');
      }
      return textResponse(JSON.stringify({ events: [{ date: '2026-07-03', kind: 'early_close' }] }));
    }));

    const events = await new OfficialMarketInvestmentCalendarProvider().fetchEvents(createInput());

    expect(events).toHaveLength(3);
    expect(JSON.stringify(events)).not.toContain('official.test');
    expect(JSON.stringify(events)).not.toContain('stack');
  });

  it('fails with sanitized error when all configured sources fail', async () => {
    process.env.INVESTMENT_CALENDAR_OFFICIAL_MARKET_FOMC_URL = 'https://official.test/fomc';
    process.env.INVESTMENT_CALENDAR_OFFICIAL_MARKET_BOJ_URL = 'https://official.test/boj';
    process.env.INVESTMENT_CALENDAR_OFFICIAL_MARKET_US_HOLIDAY_URL = 'https://official.test/us-holidays';
    vi.stubGlobal('fetch', vi.fn(async () => textResponse('unavailable', false, 500)));

    await expect(new OfficialMarketInvestmentCalendarProvider().fetchEvents(createInput())).rejects.toMatchObject({
      code: 'INVESTMENT_CALENDAR_REFRESH_FAILED',
      details: { provider: 'official_market', reason: 'all_sources_failed' },
    });
  });

  it('returns no events for symbol-only refresh', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const events = await new OfficialMarketInvestmentCalendarProvider().fetchEvents(createInput(false));

    expect(events).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('creates official_market provider mode from env', () => {
    process.env.INVESTMENT_CALENDAR_PROVIDER = 'official_market';
    expect(createInvestmentCalendarProvider()).toBeInstanceOf(OfficialMarketInvestmentCalendarProvider);
  });
});
