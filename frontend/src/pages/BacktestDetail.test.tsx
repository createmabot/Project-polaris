import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const mockUseSWR = vi.fn();
let mockLocation = '/backtests/bt-1';

vi.mock('swr', () => ({
  default: (...args: unknown[]) => mockUseSWR(...args),
}));

vi.mock('wouter', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  useLocation: () => [mockLocation, vi.fn()],
}));

import BacktestDetail, { parseBacktestsReturnPath } from './BacktestDetail';

describe('parseBacktestsReturnPath', () => {
  it('parses valid return path', () => {
    const path = '/backtests/bt-1?return=%2Fbacktests%3Fq%3Dma%26page%3D2';
    expect(parseBacktestsReturnPath(path)).toBe('/backtests?q=ma&page=2');
  });

  it('returns null for missing/invalid return path', () => {
    expect(parseBacktestsReturnPath('/backtests/bt-1')).toBeNull();
    expect(parseBacktestsReturnPath('/backtests/bt-1?return=%2Fstrategy-lab')).toBeNull();
    expect(parseBacktestsReturnPath('/backtests/bt-1?return=%E0%A4%A')).toBeNull();
  });
});

describe('BacktestDetail', () => {
  it('renders parsed summary', () => {
    mockLocation = '/backtests/bt-1?return=%2Fbacktests%3Fq%3Dma%26page%3D2';
    mockUseSWR.mockReset();
    mockUseSWR.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        backtest: {
          id: 'bt-1',
          strategy_version_id: 'ver-1',
          title: 'テスト',
          execution_source: 'tradingview',
          market: 'JP_STOCK',
          timeframe: 'D',
          status: 'ready',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        latest_import: {
          id: 'imp-1',
          file_name: 'result.csv',
          file_size: 100,
          content_type: 'text/csv',
          parse_status: 'parsed',
          parse_error: null,
          parsed_summary: {
            totalTrades: 120,
            winRate: 58.2,
            profitFactor: 1.42,
            maxDrawdown: -12.5,
            netProfit: 340000,
            periodFrom: '2025-01-01',
            periodTo: '2025-12-31',
          },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        imports: [],
      },
    });

    const html = renderToStaticMarkup(<BacktestDetail params={{ backtestId: 'bt-1' }} />);
    expect(html).toContain('主要指標');
    expect(html).toContain('総取引数');
    expect(html).toContain('勝率');
    expect(html).toContain('Profit Factor');
    expect(html).toContain('/backtests?q=ma&amp;page=2');
  });

  it('shows parse error on failed parse', () => {
    mockLocation = '/backtests/bt-2';
    mockUseSWR.mockReset();
    mockUseSWR.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        backtest: {
          id: 'bt-2',
          strategy_version_id: 'ver-2',
          title: 'テスト',
          execution_source: 'tradingview',
          market: 'JP_STOCK',
          timeframe: 'D',
          status: 'ready',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        latest_import: {
          id: 'imp-2',
          file_name: 'bad.csv',
          file_size: 80,
          content_type: 'text/csv',
          parse_status: 'failed',
          parse_error: 'Missing required columns',
          parsed_summary: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        imports: [],
      },
    });

    const html = renderToStaticMarkup(<BacktestDetail params={{ backtestId: 'bt-2' }} />);
    expect(html).toContain('解析失敗');
    expect(html).toContain('解析エラー');
    expect(html).toContain('Missing required columns');
  });

  it('falls back to /backtests when return query is absent', () => {
    mockLocation = '/backtests/bt-3';
    mockUseSWR.mockReset();
    mockUseSWR.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        backtest: {
          id: 'bt-3',
          strategy_version_id: 'ver-3',
          title: 'テスト',
          execution_source: 'tradingview',
          market: 'JP_STOCK',
          timeframe: 'D',
          status: 'ready',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        latest_import: null,
        imports: [],
      },
    });

    const html = renderToStaticMarkup(<BacktestDetail params={{ backtestId: 'bt-3' }} />);
    expect(html).toContain('href="/backtests"');
  });
});
