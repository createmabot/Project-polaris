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

import Home, { buildHomeApiPath } from './Home';

describe('Home', () => {
  it('builds home api path with summary_type and optional date', () => {
    expect(buildHomeApiPath('latest', null)).toBe('/api/home?summary_type=latest');
    expect(buildHomeApiPath('morning', null)).toBe('/api/home?summary_type=morning');
    expect(buildHomeApiPath('evening', '2026-04-12')).toBe('/api/home?summary_type=evening&date=2026-04-12');
  });

  it('renders empty placeholders for home mvp blocks', () => {
    mockUseSWR.mockReset();
    mockUseSWR.mockReturnValue({
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
      },
    });

    const html = renderToStaticMarkup(<Home />);
    expect(mockUseSWR).toHaveBeenCalledWith('/api/home?summary_type=latest', expect.any(Function));
    expect(html).toContain('デイリーサマリー');
    expect(html).toContain('最新');
    expect(html).toContain('朝');
    expect(html).toContain('夜');
    expect(html).toContain('マーケット概況');
    expect(html).toContain('マーケット概況データはまだありません。');
    expect(html).toContain('監視銘柄はまだありません。');
    expect(html).toContain('保有銘柄はまだありません。');
    expect(html).toContain('サマリーはまだありません。');
    expect(html).toContain('アラートはありません。');
    expect(html).toContain('注目イベントはまだありません。');
  });

  it('renders populated market/watchlist/positions/events blocks', () => {
    mockUseSWR.mockReset();
    mockUseSWR.mockReturnValue({
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
        ],
        positions: [
          {
            position_id: 'pos_1',
            display_name: 'ソニーグループ',
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
      },
    });

    const html = renderToStaticMarkup(<Home />);
    expect(html).toContain('指数: 日経平均 / 値: 39000 / 変化率: 1.2');
    expect(html).toContain('為替: USD/JPY / 値: 149.2 / 変化率: 0.3');
    expect(html).toContain('セクター: 半導体 / 変化率: 2.1');
    expect(html).toContain('href="/symbols/sym_7203"');
    expect(html).toContain('トヨタ自動車');
    expect(html).toContain('数量: 100 / 平均取得: 12850 / 現在値: 13120 / 評価損益: 27000');
    expect(html).toContain('自動車株が堅調');
    expect(html).toContain('href="/alerts/alert_1"');
    expect(html).toContain('決算発表');
    expect(html).toContain('日付: 2026-04-13');
  });
});
