import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeProviderEvent } from '../src/investment-calendar/normalization';
import { symbolRoutes } from '../src/routes/symbols';
import { errorHandler } from '../src/utils/response';

const runtime = {
  events: [] as any[],
};

vi.mock('../src/db', () => ({
  prisma: {
    symbol: {
      findUnique: vi.fn(async ({ where }: any) => {
        if (where.id !== 'sym-7203') return null;
        return {
          id: 'sym-7203',
          symbol: '7203',
          symbolCode: '7203',
          marketCode: 'JP_STOCK',
          displayName: 'トヨタ自動車',
          tradingviewSymbol: 'TSE:7203',
        };
      }),
    },
    investmentCalendarEvent: {
      findMany: vi.fn(async () => runtime.events),
      findUnique: vi.fn(async ({ where }: any) =>
        runtime.events.find((event) =>
          event.sourceType === where.sourceType_externalId.sourceType &&
          event.externalId === where.sourceType_externalId.externalId) ?? null,
      ),
      upsert: vi.fn(async ({ where, update, create }: any) => {
        const existingIndex = runtime.events.findIndex((event) =>
          event.sourceType === where.sourceType_externalId.sourceType &&
          event.externalId === where.sourceType_externalId.externalId,
        );
        if (existingIndex >= 0) {
          runtime.events[existingIndex] = { ...runtime.events[existingIndex], ...update };
          return runtime.events[existingIndex];
        }
        const row = {
          id: `cal-${runtime.events.length + 1}`,
          createdAt: new Date('2026-05-26T00:00:00.000Z'),
          symbol: null,
          ...create,
        };
        runtime.events.push(row);
        return row;
      }),
    },
  },
}));

vi.mock('../src/market/snapshot', () => ({ getCurrentSnapshotForSymbol: vi.fn(async () => null) }));
vi.mock('../src/ai/home-ai-service', () => ({ HomeAiService: vi.fn() }));

async function createApp() {
  const app = Fastify({ logger: false });
  app.setErrorHandler(errorHandler);
  app.register(symbolRoutes, { prefix: '/api/symbols' });
  await app.ready();
  return app;
}

describe('investment calendar APIs', () => {
  beforeEach(() => {
    runtime.events = [
      {
        id: 'cal-1',
        symbolId: 'sym-7203',
        symbol: { id: 'sym-7203', symbol: '7203', symbolCode: '7203', displayName: 'トヨタ自動車' },
        eventDate: new Date('2026-06-10T00:00:00.000Z'),
        eventTime: null,
        timezone: 'Asia/Tokyo',
        eventType: 'earnings',
        title: 'トヨタ自動車 決算発表予定',
        description: null,
        importance: 'high',
        sourceType: 'seed',
        sourceName: 'seed',
        sourceLabel: '決算予定',
        sourceUrl: null,
        externalId: 'seed-7203-earnings',
        status: 'active',
        fetchedAt: new Date('2026-05-26T00:00:00.000Z'),
        createdAt: new Date('2026-05-26T00:00:00.000Z'),
      },
    ];
  });

  it('returns symbol calendar events without raw provider details', async () => {
    const app = await createApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/symbols/sym-7203/calendar-events?from=2026-06-01&to=2026-06-30',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.events[0]).toMatchObject({
      symbol_id: 'sym-7203',
      event_type: 'earnings',
      title: 'トヨタ自動車 決算発表予定',
      source_label: '決算予定',
    });
    expect(JSON.stringify(body)).not.toContain('stack');
    expect(JSON.stringify(body)).not.toContain('raw');
    await app.close();
  });

  it('refreshes symbol calendar events with stub provider', async () => {
    const app = await createApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/symbols/sym-7203/calendar-events/refresh',
      payload: { from: '2026-06-01', to: '2026-06-30' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({
      status: 'succeeded',
      manual_only: true,
      source: 'stub',
    });
    expect(runtime.events.length).toBeGreaterThan(1);
    await app.close();
  });

  it('refreshes symbol calendar events from J-Quants fixtures without real external access', async () => {
    const previousProviders = process.env.INVESTMENT_CALENDAR_PROVIDERS;
    const previousProvider = process.env.INVESTMENT_CALENDAR_PROVIDER;
    const previousKey = process.env.INVESTMENT_CALENDAR_JQUANTS_API_KEY;
    process.env.INVESTMENT_CALENDAR_PROVIDERS = 'alpha_vantage,jquants';
    process.env.INVESTMENT_CALENDAR_JQUANTS_API_KEY = 'test-api-key';
    const fetchMock = vi.fn(async (url: URL | string, init?: RequestInit) => {
      const urlText = String(url);
      expect((init?.headers as Record<string, string>)?.['x-api-key']).toBe('test-api-key');
      if (urlText.includes('/equities/earnings-calendar')) {
        expect(urlText).toContain('from=2026-06-01');
        expect(urlText).toContain('to=2026-06-30');
        return {
          ok: true,
          status: 200,
          json: vi.fn(async () => ({
            data: [
              { Code: '72030', Date: '2026-06-10', CompanyName: 'トヨタ自動車', FiscalQuarter: 'FY' },
              { Code: '99990', Date: '2026-06-11', CompanyName: '未登録銘柄', FiscalQuarter: 'FY' },
            ],
          })),
        } as any;
      }
      return { ok: false, status: 500, json: vi.fn(async () => ({})) } as any;
    });
    vi.stubGlobal('fetch', fetchMock);
    const app = await createApp();

    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/symbols/sym-7203/calendar-events/refresh',
        payload: { from: '2026-06-01', to: '2026-06-30' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data).toMatchObject({
        status: 'succeeded',
        source: 'public_provider',
        manual_only: true,
      });
      expect(runtime.events).toEqual(expect.arrayContaining([
        expect.objectContaining({
          sourceType: 'public_provider',
          sourceName: 'jquants',
          eventType: 'earnings',
          symbolId: 'sym-7203',
          title: 'トヨタ自動車 決算発表予定',
        }),
      ]));
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/markets/calendar'))).toBe(false);
      expect(JSON.stringify(res.json())).not.toContain('test-api-key');
      expect(JSON.stringify(res.json())).not.toContain('api.jquants.com');
      expect(JSON.stringify(res.json())).not.toContain('stack');
    } finally {
      await app.close();
      vi.unstubAllGlobals();
      if (previousProviders === undefined) delete process.env.INVESTMENT_CALENDAR_PROVIDERS;
      else process.env.INVESTMENT_CALENDAR_PROVIDERS = previousProviders;
      if (previousProvider === undefined) delete process.env.INVESTMENT_CALENDAR_PROVIDER;
      else process.env.INVESTMENT_CALENDAR_PROVIDER = previousProvider;
      if (previousKey === undefined) delete process.env.INVESTMENT_CALENDAR_JQUANTS_API_KEY;
      else process.env.INVESTMENT_CALENDAR_JQUANTS_API_KEY = previousKey;
    }
  });

  it('keeps only http and https provider source URLs', () => {
    const base = {
      externalId: 'provider-event-1',
      eventDate: '2026-06-10',
      eventType: 'earnings',
      title: '決算発表予定',
      importance: 'high',
      sourceName: 'provider',
    };

    expect(normalizeProviderEvent({ ...base, sourceUrl: 'https://example.test/calendar' })?.sourceUrl)
      .toBe('https://example.test/calendar');
    expect(normalizeProviderEvent({ ...base, sourceUrl: 'javascript:alert(1)' })?.sourceUrl).toBeNull();
    expect(normalizeProviderEvent({ ...base, sourceUrl: 'file:///tmp/raw.html' })?.sourceUrl).toBeNull();
  });
});
