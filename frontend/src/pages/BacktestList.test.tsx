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

import BacktestList from './BacktestList';

describe('BacktestList', () => {
  it('一覧ゼロ件の空状態を表示する', () => {
    mockUseSWR.mockReset();
    mockUseSWR.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        backtests: [],
        pagination: { page: 1, limit: 20, total: 0, has_next: false, has_prev: false },
      },
    });

    const html = renderToStaticMarkup(<BacktestList />);
    expect(html).toContain('検証履歴一覧（直近）');
    expect(html).toContain('まだ検証履歴はありません');
    expect(html).toContain('1 / 1 ページ');
  });

  it('一覧から詳細遷移リンクを表示する', () => {
    mockUseSWR.mockReset();
    mockUseSWR.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        backtests: [
          {
            id: 'bt-1',
            strategy_version_id: 'ver-1',
            title: 'トヨタ日足',
            execution_source: 'tradingview',
            market: 'JP_STOCK',
            timeframe: 'D',
            status: 'imported',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            latest_import: {
              id: 'imp-1',
              parse_status: 'parsed',
              parse_error: null,
              created_at: new Date().toISOString(),
            },
          },
        ],
        pagination: { page: 1, limit: 20, total: 21, has_next: true, has_prev: false },
      },
    });

    const html = renderToStaticMarkup(<BacktestList />);
    expect(html).toContain('トヨタ日足');
    expect(html).toContain('解析成功');
    expect(html).toContain('/backtests/bt-1');
    expect(html).toContain('次へ');
    expect(html).toContain('1 / 2 ページ');
  });
});

