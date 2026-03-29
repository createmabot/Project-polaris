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
  buildBacktestDetailUrl,
  buildBacktestListPath,
  buildBacktestsListUrl,
  parseBacktestsListQuery,
} from './BacktestList';

describe('buildBacktestListPath', () => {
  it('builds page/limit without query', () => {
    expect(buildBacktestListPath(2, 20, '')).toBe('/api/backtests?page=2&limit=20&sort=created_at&order=desc');
  });

  it('builds page/limit with query', () => {
    expect(buildBacktestListPath(1, 20, 'トヨタ 日足', 'imported', 'updated_at', 'asc')).toBe('/api/backtests?page=1&limit=20&q=%E3%83%88%E3%83%A8%E3%82%BF+%E6%97%A5%E8%B6%B3&status=imported&sort=updated_at&order=asc');
  });
});

describe('backtests list query helpers', () => {
  it('parses q/page from url query', () => {
    expect(parseBacktestsListQuery('/backtests?q=toyota&page=3&status=imported&sort=updated_at&order=asc')).toEqual({
      q: 'toyota',
      page: 3,
      status: 'imported',
      sort: 'updated_at',
      order: 'asc',
    });
    expect(parseBacktestsListQuery('/backtests')).toEqual({ q: '', page: 1, status: '', sort: 'created_at', order: 'desc' });
    expect(parseBacktestsListQuery('/backtests?page=abc')).toEqual({ q: '', page: 1, status: '', sort: 'created_at', order: 'desc' });
  });

  it('builds list url from q/page', () => {
    expect(buildBacktestsListUrl('toyota', 2, 'imported', 'updated_at', 'asc')).toBe('/backtests?q=toyota&status=imported&sort=updated_at&order=asc&page=2');
    expect(buildBacktestsListUrl('', 1)).toBe('/backtests?page=1');
  });

  it('builds detail url with encoded return path', () => {
    expect(buildBacktestDetailUrl('bt-1', 'toyota', 3, 'imported', 'updated_at', 'asc')).toBe('/backtests/bt-1?return=%2Fbacktests%3Fq%3Dtoyota%26status%3Dimported%26sort%3Dupdated_at%26order%3Dasc%26page%3D3');
  });
});

describe('BacktestList', () => {
  it('renders empty state', () => {
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
    expect(html).toContain('検証履歴一覧');
    expect(html).toContain('1 / 1 ページ');
  });

  it('renders list and detail link with return query', () => {
    mockLocation = '/backtests?q=%E3%83%88%E3%83%A8%E3%82%BF&status=imported&sort=updated_at&order=asc&page=2';
    mockSetLocation.mockReset();
    mockUseSWR.mockReset();
    mockUseSWR.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        backtests: [
          {
            strategy_id: 'str-1',
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
        pagination: {
          page: 2,
          limit: 20,
          q: 'トヨタ',
          status: 'imported',
          sort: 'updated_at',
          order: 'asc',
          total: 21,
          has_next: false,
          has_prev: true,
        },
      },
    });

    const html = renderToStaticMarkup(<BacktestList />);
    expect(html).toContain('トヨタ日足');
    expect(html).toContain('検索条件:');
    expect(html).toContain('<code>トヨタ</code>');
    expect(html).toContain('実行時Strategy');
    expect(html).toContain('str-1');
    expect(html).toContain('実行時Version');
    expect(html).toContain('ver-1');
    expect(html).toContain(buildBacktestDetailUrl('bt-1', 'トヨタ', 2, 'imported', 'updated_at', 'asc'));
    expect(html).toContain('/strategy-versions/ver-1?return=%2Fstrategies%2Fstr-1%2Fversions%3Fsort%3Dupdated_at%26order%3Ddesc%26page%3D1');
    expect(html).toContain('Rule Lab で見直す');
    expect(html).toContain('前へ');
    expect(html).toContain('2 / 2 ページ');
  });
});
