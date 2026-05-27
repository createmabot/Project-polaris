import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const mockUseSWR = vi.fn();

vi.mock('swr', () => ({
  default: (...args: unknown[]) => mockUseSWR(...args),
}));

vi.mock('wouter', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

import Home, { buildHomeApiPath, getInitialCalendarMonthKey } from './Home';

const sideRailWatchlistFixture = {
  watchlist: { id: 'wl-1', name: 'default', description: null },
  items: [],
};

const sideRailPositionsFixture = {
  portfolio: { id: 'pf-1', name: 'default', is_default: true },
  positions: [],
};

describe('Home', () => {
  it('builds home api path with summary_type and optional date', () => {
    expect(buildHomeApiPath('latest', null)).toBe('/api/home?summary_type=latest');
    expect(buildHomeApiPath('morning', null)).toBe('/api/home?summary_type=morning');
    expect(buildHomeApiPath('evening', '2026-04-12')).toBe('/api/home?summary_type=evening&date=2026-04-12');
  });

  it('renders empty placeholders for home mvp blocks', () => {
    mockUseSWR.mockReset();
    mockUseSWR.mockImplementation((key: string) => {
      if (key === '/api/watchlist-items') {
        return { isLoading: false, error: null, data: sideRailWatchlistFixture };
      }
      if (key === '/api/positions') {
        return { isLoading: false, error: null, data: sideRailPositionsFixture };
      }
      return {
        isLoading: false,
        error: null,
        data: {
          market_overview: { indices: [], fx: [], sectors: [] },
          watchlist_symbols: [],
          positions: [],
          recent_alerts: [],
          daily_summary: {
            id: null,
            title: null,
            body_markdown: null,
            structured_json: null,
            generated_at: null,
            status: 'unavailable',
            insufficient_context: true,
            summary_type: 'latest',
            date: null,
          },
          key_events: [],
          investment_calendar: {
            events: [],
            meta: { from: '2026-05-26', to: '2026-07-25', source: 'watchlist_positions_and_market_events', manual_refresh_available: true },
          },
        },
      };
    });

    const html = renderToStaticMarkup(<Home />);
    expect(mockUseSWR.mock.calls.filter(([key]) => key === '/api/home?summary_type=latest')).toHaveLength(1);
    expect(mockUseSWR).toHaveBeenCalledWith('/api/home?summary_type=latest', expect.any(Function));
    expect(html.match(/北極星/g) ?? []).toHaveLength(1);
    expect(html).not.toContain('概況、AIサマリー、アラート、注目イベントを確認します。');
    expect(html).not.toContain('銘柄比較を開く');
    expect(html).not.toContain('ルール検証ラボを開く');
    expect(html).not.toContain('日次確認の見方');
    expect(html).not.toContain('Daily workspace');
    expect(html).toContain('AIデイリーサマリー');
    expect(html).toContain('AIがマーケット・アラート・参照情報をもとに生成した要約です。');
    expect(html).toContain('最新');
    expect(html).toContain('朝');
    expect(html).toContain('夜');
    expect(html).toContain('マーケット概況');
    expect(html).toContain('マーケット概況データはまだありません。');
    expect(html).toContain('監視銘柄はまだありません。');
    expect(html).toContain('サマリーはまだありません。');
    expect(html).toContain('アラートはありません。');
    expect(html).toContain('投資カレンダー');
    expect(html).toContain('投資カレンダーはまだありません。');
    expect(html).toContain('投資カレンダーを更新');
  });

  it('renders populated market/watchlist/positions/events blocks', () => {
    const currentMonthKey = getInitialCalendarMonthKey(new Date());
    const nextMonthDate = new Date();
    nextMonthDate.setMonth(nextMonthDate.getMonth() + 1, 1);
    const nextMonthKey = getInitialCalendarMonthKey(nextMonthDate);
    const [currentYear, currentMonth] = currentMonthKey.split('-').map(Number);
    const [nextYear, nextMonth] = nextMonthKey.split('-').map(Number);
    const currentMonthLabel = `${currentYear}年${currentMonth}月`;
    const nextMonthLabel = `${nextYear}年${nextMonth}月`;
    mockUseSWR.mockReset();
    mockUseSWR.mockImplementation((key: string) => {
      if (key === '/api/watchlist-items') {
        return {
          isLoading: false,
          error: null,
          data: {
            watchlist: { id: 'wl-1', name: 'default', description: null },
            items: [
              {
                item_id: 'item-1',
                watchlist_id: 'wl-1',
                symbol_id: 'sym_7203',
                symbol_code: '7203',
                display_name: 'トヨタ自動車',
                market_code: 'JP',
                tradingview_symbol: 'TSE:7203',
                priority: 1,
                memo: null,
                added_at: '2026-04-12T00:00:00Z',
                created_at: '2026-04-12T00:00:00Z',
                updated_at: '2026-04-12T00:00:00Z',
              },
            ],
          },
        };
      }
      if (key === '/api/positions') {
        return {
          isLoading: false,
          error: null,
          data: {
            portfolio: { id: 'pf-1', name: 'default', is_default: true },
            positions: [
              {
                position_id: 'pos_1',
                symbol_id: 'sym_6758',
                symbol_code: '6758',
                display_name: 'ソニーグループ',
                market_code: 'JP',
                tradingview_symbol: 'TSE:6758',
                quantity: 100,
                average_cost: 12850,
                created_at: '2026-04-12T00:00:00Z',
                updated_at: '2026-04-12T00:00:00Z',
              },
            ],
          },
        };
      }
      return {
        isLoading: false,
        error: null,
        data: {
          market_overview: {
            indices: [{ display_name: '日経平均', price: 39000, change_rate: 1.2 }],
            fx: [{ display_name: 'USD/JPY', price: 149.2, change_rate: 0.3 }],
            sectors: [{ display_name: '半導体', change_rate: 2.1 }],
          },
          watchlist_symbols: [
            {
              symbol_id: 'sym_7203',
              display_name: 'トヨタ自動車',
              latest_price: 3021.5,
              change_rate: 1.4,
            },
            {
              symbol_id: 'sym_6758',
              display_name: 'ソニーグループ',
              latest_price: 13120,
              change_rate: 0.8,
            },
          ],
          positions: [
            {
              position_id: 'pos_1',
              symbol_id: 'sym_6758',
              display_name: 'Sony Group',
              quantity: 100,
              avg_cost: 12850,
              latest_price: 13120,
              unrealized_pnl: 27000,
            },
          ],
          recent_alerts: [
            {
              id: 'alert_1',
              alertName: 'MA25 breakout',
              triggeredAt: '2026-04-12T09:00:00+09:00',
              receivedAt: null,
              processingStatus: 'summarized',
              symbol: { id: 'sym_7203', displayName: 'トヨタ自動車', symbol: '7203' },
              related_ai_summary: null,
            },
          ],
          daily_summary: {
            id: 'sum_1',
            title: '本日の注目ポイント',
            body_markdown: '自動車株が堅調',
            structured_json: null,
            generated_at: '2026-04-12T09:00:00+09:00',
            status: 'available',
            insufficient_context: false,
            summary_type: 'latest',
            date: null,
          },
          key_events: [{ label: '決算発表', date: '2026-04-13' }],
          investment_calendar: {
            events: [
              {
                id: 'cal-1',
                scope: 'symbol',
                symbol_id: 'sym_7203',
                symbol_code: '7203',
                display_name: 'トヨタ自動車',
                event_date: `${currentMonthKey}-10`,
                event_time: null,
                timezone: 'Asia/Tokyo',
                event_type: 'earnings',
                title: 'トヨタ自動車 決算発表予定',
                importance: 'high',
                source_type: 'seed',
                source_name: 'seed',
                source_label: '決算予定',
                status: 'active',
                fetched_at: '2026-05-26T00:00:00.000Z',
              },
              {
                id: 'cal-1-extra-1',
                scope: 'market',
                symbol_id: null,
                symbol_code: null,
                display_name: null,
                event_date: `${currentMonthKey}-10`,
                event_time: null,
                timezone: 'Asia/Tokyo',
                event_type: 'central_bank',
                title: '日銀金融政策決定会合',
                importance: 'high',
                source_type: 'public_provider',
                source_name: 'boj',
                source_label: '金融政策決定会合',
                status: 'active',
                fetched_at: '2026-05-26T00:00:00.000Z',
                provider: 'official_market',
              },
              {
                id: 'cal-1-extra-2',
                scope: 'market',
                symbol_id: null,
                symbol_code: null,
                display_name: null,
                event_date: `${currentMonthKey}-10`,
                event_time: null,
                timezone: 'Asia/Tokyo',
                event_type: 'economic_indicator',
                title: '米CPI',
                importance: 'high',
                source_type: 'public_provider',
                source_name: 'alpha_vantage',
                source_label: 'CPI（発表済みデータ由来）',
                status: 'active',
                fetched_at: '2026-05-26T00:00:00.000Z',
                provider: 'alpha_vantage',
              },
              {
                id: 'cal-1-extra-3',
                scope: 'market',
                symbol_id: null,
                symbol_code: null,
                display_name: null,
                event_date: `${currentMonthKey}-10`,
                event_time: null,
                timezone: 'Asia/Tokyo',
                event_type: 'ipo',
                title: 'IPO',
                importance: 'medium',
                source_type: 'public_provider',
                source_name: 'alpha_vantage',
                source_label: 'IPO calendar',
                status: 'active',
                fetched_at: '2026-05-26T00:00:00.000Z',
                provider: 'alpha_vantage',
              },
              {
                id: 'cal-market-1',
                scope: 'market',
                symbol_id: null,
                symbol_code: null,
                display_name: null,
                event_date: `${currentMonthKey}-05`,
                event_time: '21:30',
                timezone: 'Asia/Tokyo',
                event_type: 'economic_indicator',
                title: '米雇用統計',
                importance: 'high',
                source_type: 'seed',
                source_name: 'seed',
                source_label: '経済指標',
                status: 'active',
                fetched_at: '2026-05-26T00:00:00.000Z',
              },
              {
                id: 'cal-market-2',
                scope: 'market',
                symbol_id: null,
                symbol_code: null,
                display_name: null,
                event_date: `${nextMonthKey}-01`,
                event_time: null,
                timezone: 'America/New_York',
                event_type: 'economic_indicator',
                title: '米GDP',
                importance: 'high',
                source_type: 'public_provider',
                source_name: 'alpha_vantage',
                source_label: 'GDP（発表済みデータ由来）',
                status: 'active',
                fetched_at: '2000-01-01T00:00:00.000Z',
                provider: 'alpha_vantage',
                is_stale: true,
              },
              {
                id: 'cal-market-3',
                scope: 'market',
                symbol_id: null,
                symbol_code: null,
                display_name: null,
                event_date: `${currentMonthKey}-17`,
                event_time: null,
                timezone: 'America/New_York',
                event_type: 'central_bank',
                title: 'FOMC',
                importance: 'high',
                source_type: 'public_provider',
                source_name: 'federal_reserve',
                source_label: 'FOMC calendar',
                status: 'active',
                fetched_at: '2026-05-26T00:00:00.000Z',
                provider: 'official_market',
              },
              {
                id: 'cal-market-4',
                scope: 'market',
                symbol_id: null,
                symbol_code: null,
                display_name: null,
                event_date: `${nextMonthKey}-03`,
                event_time: null,
                timezone: 'America/New_York',
                event_type: 'market_holiday',
                title: '米国市場 短縮取引',
                importance: 'medium',
                source_type: 'public_provider',
                source_name: 'nyse',
                source_label: 'US market holiday',
                status: 'active',
                fetched_at: '2026-05-26T00:00:00.000Z',
                provider: 'official_market',
              },
              {
                id: 'cal-market-5',
                scope: 'market',
                symbol_id: null,
                symbol_code: null,
                display_name: null,
                event_date: `${currentMonthKey}-12`,
                event_time: null,
                timezone: 'Asia/Tokyo',
                event_type: 'derivatives_settlement',
                title: 'メジャーSQ',
                importance: 'high',
                source_type: 'public_provider',
                source_name: 'official_market',
                source_label: '日本市場 メジャーSQ',
                status: 'active',
                fetched_at: '2026-05-26T00:00:00.000Z',
                provider: 'official_market',
              },
              {
                id: 'cal-market-6',
                scope: 'market',
                symbol_id: null,
                symbol_code: null,
                display_name: null,
                event_date: `${nextMonthKey}-10`,
                event_time: null,
                timezone: 'Asia/Tokyo',
                event_type: 'derivatives_settlement',
                title: 'SQ',
                importance: 'medium',
                source_type: 'public_provider',
                source_name: 'official_market',
                source_label: '日本市場 SQ',
                status: 'active',
                fetched_at: '2026-05-26T00:00:00.000Z',
                provider: 'official_market',
              },
            ],
            meta: {
              from: '2026-05-26',
              to: '2026-07-25',
              source: 'watchlist_positions_and_market_events',
              manual_refresh_available: true,
              last_fetched_at: '2026-05-26T00:00:00.000Z',
              stale_event_count: 1,
              provider_statuses: [
                { provider: 'alpha_vantage', status: 'succeeded', last_fetched_at: '2000-01-01T00:00:00.000Z', stale_event_count: 1 },
                { provider: 'official_market', status: 'succeeded', last_fetched_at: '2026-05-26T00:00:00.000Z', stale_event_count: 0 },
              ],
            },
          },
        },
      };
    });

    const html = renderToStaticMarkup(<Home />);
    expect(mockUseSWR.mock.calls.filter(([key]) => key === '/api/home?summary_type=latest')).toHaveLength(1);
    expect(mockUseSWR.mock.calls.some(([key]) => key === '/api/home?summary_type=morning')).toBe(false);
    expect(mockUseSWR.mock.calls.some(([key]) => key === '/api/home?summary_type=evening')).toBe(false);
    expect(html).toContain('指数');
    expect(html).toContain('為替');
    expect(html).toContain('セクター');
    expect(html).toContain('日経平均');
    expect(html).toContain('USD/JPY');
    expect(html).toContain('半導体');
    expect(html).toContain('値 39,000');
    expect(html).toContain('値 149.2');
    expect(html).toContain('+1.2%');
    expect(html).toContain('+0.3%');
    expect(html).toContain('+2.1%');
    expect(html).toContain('href="/symbols/sym_7203"');
    expect(html).toContain('トヨタ自動車');
    expect(html).toContain('href="/symbols/sym_6758"');
    expect(html).toContain('ソニーグループ');
    expect(html).toContain('aria-label="サイドレールを折りたたむ"');
    expect(html).toContain('aria-label="監視銘柄を追加"');
    expect(html).toContain('aria-label="監視銘柄を編集"');
    expect(html).toContain('aria-label="監視銘柄を削除"');
    expect(html).toContain('+ 監視');
    expect(html).not.toContain('詳細管理');
    expect(html).not.toContain('Sony Group');
    expect(html).toContain('自動車株が堅調');
    expect(html).toContain('href="/alerts/alert_1"');
    expect(html).toContain('投資カレンダー');
    expect(html).toContain(currentMonthLabel);
    expect(html).not.toContain(nextMonthLabel);
    expect(html).toContain('前月');
    expect(html).toContain('次月');
    expect(html).toContain('日');
    expect(html).toContain('月');
    expect(html).toContain('トヨタ自動車 決算発表予定');
    expect(html).toContain('決算 7203');
    expect(html).toContain('+1件');
    expect(html).toContain('米雇用統計');
    expect(html).not.toContain('provider: Alpha Vantage');
    expect(html).toContain('取得:');
    expect(html).toContain('取得情報が古い可能性があります');
    expect(html).toContain('Alpha Vantage: 取得:');
    expect(html).toContain('FOMC');
    expect(html).toContain('メジャーSQ');
    expect(html).toContain('大SQ');
    expect(html).not.toContain('市場全体');
    expect(html).not.toContain('決算予定');
  });

  it('renders snapshot-dependent fields as hyphen when latest values are unavailable', () => {
    mockUseSWR.mockReset();
    mockUseSWR.mockImplementation((key: string) => {
      if (key === '/api/watchlist-items') {
        return {
          isLoading: false,
          error: null,
          data: {
            watchlist: { id: 'wl-1', name: 'default', description: null },
            items: [
              {
                item_id: 'item-6501',
                watchlist_id: 'wl-1',
                symbol_id: 'sym_6501',
                symbol_code: '6501',
                display_name: '日立製作所',
                market_code: 'JP',
                tradingview_symbol: 'TSE:6501',
                priority: null,
                memo: null,
                added_at: '2026-04-12T00:00:00Z',
                created_at: '2026-04-12T00:00:00Z',
                updated_at: '2026-04-12T00:00:00Z',
              },
            ],
          },
        };
      }
      if (key === '/api/positions') {
        return {
          isLoading: false,
          error: null,
          data: {
            portfolio: { id: 'pf-1', name: 'default', is_default: true },
            positions: [
              {
                position_id: 'pos_6501',
                symbol_id: 'sym_6501',
                symbol_code: '6501',
                display_name: '日立製作所',
                market_code: 'JP',
                tradingview_symbol: 'TSE:6501',
                quantity: 20,
                average_cost: 1000,
                created_at: '2026-04-12T00:00:00Z',
                updated_at: '2026-04-12T00:00:00Z',
              },
            ],
          },
        };
      }
      return {
        isLoading: false,
        error: null,
        data: {
          market_overview: {
            indices: [],
            fx: [],
            sectors: [],
          },
          watchlist_symbols: [
            {
              symbol_id: 'sym_6501',
              display_name: '日立製作所',
              latest_price: null,
              change_rate: null,
            },
          ],
          positions: [
            {
              position_id: 'pos_6501',
              symbol_id: 'sym_6501',
              display_name: 'Hitachi',
              quantity: 20,
              avg_cost: 1000,
              latest_price: null,
              unrealized_pnl: null,
            },
          ],
          recent_alerts: [],
          daily_summary: {
            id: null,
            title: null,
            body_markdown: null,
            structured_json: null,
            generated_at: null,
            status: 'unavailable',
            insufficient_context: true,
            summary_type: 'latest',
            date: null,
          },
          key_events: [],
          investment_calendar: {
            events: [],
            meta: { from: '2026-05-26', to: '2026-07-25', source: 'watchlist_positions_and_market_events', manual_refresh_available: true },
          },
        },
      };
    });

    const html = renderToStaticMarkup(<Home />);
    expect(mockUseSWR.mock.calls.filter(([key]) => key === '/api/home?summary_type=latest')).toHaveLength(1);
    expect(html).toContain('href="/symbols/sym_6501"');
    expect(html).toContain('価格: - / 変化率: -');
  });
});
