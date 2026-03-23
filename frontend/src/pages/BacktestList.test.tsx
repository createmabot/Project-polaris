import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const mockUseSWR = vi.fn();
const mockSetLocation = vi.fn();
let mockLocation = '/backtests';

vi.mock('swr', () => ({
  default: (...args: unknown[]) => mockUseSWR(...args),
}));

vi.mock('wouter', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  useLocation: () => [mockLocation, mockSetLocation],
}));

import BacktestList, {
  buildBacktestListPath,
  buildBacktestsListUrl,
  parseBacktestsListQuery,
} from './BacktestList';

describe('buildBacktestListPath', () => {
  it('q なしで page/limit を組み立てる', () => {
    expect(buildBacktestListPath(2, 20, '')).toBe('/api/backtests?page=2&limit=20');
  });

  it('q ありで page/limit と検索条件を組み立てる', () => {
    expect(buildBacktestListPath(1, 20, 'トヨタ 日足')).toBe('/api/backtests?page=1&limit=20&q=%E3%83%88%E3%83%A8%E3%82%BF+%E6%97%A5%E8%B6%B3');
  });
});

describe('backtests list query helpers', () => {
  it('URL クエリから q/page を復元できる', () => {
    expect(parseBacktestsListQuery('/backtests?q=toyota&page=3')).toEqual({ q: 'toyota', page: 3 });
    expect(parseBacktestsListQuery('/backtests')).toEqual({ q: '', page: 1 });
    expect(parseBacktestsListQuery('/backtests?page=abc')).toEqual({ q: '', page: 1 });
  });

  it('q/page から一覧URLを構築できる', () => {
    expect(buildBacktestsListUrl('toyota', 2)).toBe('/backtests?q=toyota&page=2');
    expect(buildBacktestsListUrl('', 1)).toBe('/backtests?page=1');
  });
});

describe('BacktestList', () => {
  it('一覧ゼロ件の空状態を表示する', () => {
    mockLocation = '/backtests';
    mockSetLocation.mockReset();
    mockUseSWR.mockReset();
    mockUseSWR.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        backtests: [],
        pagination: { page: 1, limit: 20, q: '', total: 0, has_next: false, has_prev: false },
      },
    });

    const html = renderToStaticMarkup(<BacktestList />);
    expect(html).toContain('検証履歴一覧（直近）');
    expect(html).toContain('まだ検証履歴はありません');
    expect(html).toContain('1 / 1 ページ');
  });

  it('一覧から詳細遷移リンクを表示する', () => {
    mockLocation = '/backtests?q=%E3%83%88%E3%83%A8%E3%82%BF&page=1';
    mockSetLocation.mockReset();
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
        pagination: { page: 1, limit: 20, q: '', total: 21, has_next: true, has_prev: false },
      },
    });

    const html = renderToStaticMarkup(<BacktestList />);
    expect(html).toContain('トヨタ日足');
    expect(html).toContain('解析成功');
    expect(html).toContain('/backtests/bt-1');
    expect(html).toContain('次へ');
    expect(html).toContain('1 / 2 ページ');
    expect(html).toContain('検索条件:');
    expect(html).toContain('トヨタ');
  });
});

