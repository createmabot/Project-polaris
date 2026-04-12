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
  it('accepts /backtests with q/page', () => {
    const path = '/backtests/bt-1?return=%2Fbacktests%3Fq%3Dma%26page%3D2';
    expect(parseBacktestsReturnPath(path)).toBe('/backtests?q=ma&page=2');
  });

  it('drops unsupported query keys', () => {
    const path = '/backtests/bt-1?return=%2Fbacktests%3Ffoo%3Dbar';
    expect(parseBacktestsReturnPath(path)).toBe('/backtests');
  });

  it('drops invalid page while keeping valid q', () => {
    const path = '/backtests/bt-1?return=%2Fbacktests%3Fq%3Dma%26page%3Dabc';
    expect(parseBacktestsReturnPath(path)).toBe('/backtests?q=ma');
  });

  it('rejects non-list path and falls back', () => {
    const path = '/backtests/bt-1?return=%2Fbacktests%2F123';
    expect(parseBacktestsReturnPath(path)).toBeNull();
  });

  it('rejects external url or malformed return', () => {
    expect(parseBacktestsReturnPath('/backtests/bt-1?return=https%3A%2F%2Fexample.com')).toBeNull();
    expect(parseBacktestsReturnPath('/backtests/bt-1?return=%E0%A4%A')).toBeNull();
  });
});

describe('BacktestDetail', () => {
  it('renders parsed summary and uses validated return link', () => {
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
        used_strategy: {
          strategy_id: 'str-1',
          strategy_version_id: 'ver-1',
          snapshot: {
            strategy_id: 'str-1',
            strategy_version_id: 'ver-1',
            natural_language_rule: '25日移動平均を上抜けで買い',
            generated_pine: 'strategy(\"base\")',
            market: 'JP_STOCK',
            timeframe: 'D',
            warnings: [],
            assumptions: [],
            captured_at: new Date().toISOString(),
          },
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
        ai_review: {
          summary_id: 'sum-bt-1',
          title: 'AI総評タイトル',
          body_markdown: 'AI総評本文',
          generated_at: '2026-01-01T00:00:00.000Z',
        },
        imports: [],
      },
    });

    const html = renderToStaticMarkup(<BacktestDetail params={{ backtestId: 'bt-1' }} />);
    expect(html).toContain('主要指標');
    expect(html).toContain('まず「基本情報 / 主指標」を確認し、次に「AI 総評」と「import 履歴」を確認してください。');
    expect(html).toContain('総取引数');
    expect(html).toContain('解析成功');
    expect(html).toContain('href="/backtests?q=ma&amp;page=2"');
    expect(html).toContain('AI 総評');
    expect(html).toContain('AI総評本文');
    expect(html).toContain('使用した Strategy');
    expect(html).toContain('href="/strategy-versions/ver-1?return=%2Fstrategies%2Fstr-1%2Fversions%3Fsort%3Dupdated_at%26order%3Ddesc%26page%3D1"');
    expect(html).toContain('href="/strategies/str-1/versions?sort=updated_at&amp;order=desc&amp;page=1"');
    expect(html).toContain('次アクション（Rule Lab）');
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
        used_strategy: {
          strategy_id: 'str-1',
          strategy_version_id: 'ver-2',
          snapshot: {
            strategy_id: 'str-1',
            strategy_version_id: 'ver-2',
            natural_language_rule: 'RSIで買い',
            generated_pine: null,
            market: 'JP_STOCK',
            timeframe: 'D',
            warnings: ['unsupported'],
            assumptions: [],
            captured_at: new Date().toISOString(),
          },
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
        ai_review: null,
        imports: [],
      },
    });

    const html = renderToStaticMarkup(<BacktestDetail params={{ backtestId: 'bt-2' }} />);
    expect(html).toContain('解析失敗');
    expect(html).toContain('解析エラー');
    expect(html).toContain('Missing required columns');
    expect(html).toContain('AI総評はまだ生成されていません。');
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
        used_strategy: {
          strategy_id: null,
          strategy_version_id: null,
          snapshot: null,
        },
        latest_import: null,
        ai_review: null,
        imports: [],
      },
    });

    const html = renderToStaticMarkup(<BacktestDetail params={{ backtestId: 'bt-3' }} />);
    expect(html).toContain('href="/backtests"');
  });
});
