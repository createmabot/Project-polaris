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

import StrategyList from './StrategyList';

describe('StrategyList', () => {
  it('renders existing strategy rows with stable links', () => {
    mockUseSWR.mockReset();
    mockUseSWR.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        query: { q: '', status: '', sort: 'updated_at', order: 'desc' },
        pagination: {
          page: 1,
          limit: 20,
          q: '',
          status: '',
          sort: 'updated_at',
          order: 'desc',
          total: 1,
          has_next: false,
          has_prev: false,
        },
        strategies: [
          {
            id: 'str-1',
            title: '押し目買い戦略',
            status: 'active',
            created_at: '2026-05-01T00:00:00.000Z',
            updated_at: '2026-05-02T00:00:00.000Z',
            version_count: 2,
            latest_version: {
              id: 'ver-2',
              market: 'JP_STOCK',
              timeframe: 'D',
              status: 'generated',
              created_at: '2026-05-02T00:00:00.000Z',
              updated_at: '2026-05-02T00:00:00.000Z',
            },
          },
        ],
      },
    });

    const html = renderToStaticMarkup(<StrategyList />);
    expect(html).toContain('ストラテジーリスト');
    expect(html).toContain('押し目買い戦略');
    expect(html).toContain('href="/strategies/str-1"');
    expect(html).toContain('version count');
    expect(html).toContain('JP_STOCK / D / generated');
    expect(html).toContain('href="/strategy-lab"');
    expect(html).toContain('ストラテジー作成を開く');
    expect(html).toContain('href="/backtests"');
    expect(html).toContain('検証レポート一覧を開く');
    expect(html).toContain('BacktestList は検証レポート一覧として継続し、この画面の代替にはしません。');
    expect(mockUseSWR).toHaveBeenCalledWith('/api/strategies?page=1&limit=20&sort=updated_at&order=desc', expect.any(Function));
  });

  it('renders empty state when no strategy data exists', () => {
    mockUseSWR.mockReset();
    mockUseSWR.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        query: { q: '', status: '', sort: 'updated_at', order: 'desc' },
        pagination: {
          page: 1,
          limit: 20,
          q: '',
          status: '',
          sort: 'updated_at',
          order: 'desc',
          total: 0,
          has_next: false,
          has_prev: false,
        },
        strategies: [],
      },
    });

    const html = renderToStaticMarkup(<StrategyList />);
    expect(html).toContain('既存のストラテジー定義はまだありません。');
    expect(html).toContain('StrategyLab で作成したルール定義と version は、後続でここに表示されます。');
  });
});
