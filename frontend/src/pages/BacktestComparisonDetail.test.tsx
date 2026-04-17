import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const mockUseSWR = vi.fn();

vi.mock('swr', () => ({
  default: (...args: unknown[]) => mockUseSWR(...args),
}));

vi.mock('wouter', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  useRoute: () => [true, { comparisonId: 'cmp-1' }],
}));

import BacktestComparisonDetail from './BacktestComparisonDetail';

describe('BacktestComparisonDetail', () => {
  it('renders saved comparison detail', () => {
    mockUseSWR.mockReset();
    mockUseSWR.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        comparison: {
          comparison_id: 'cmp-1',
          base_backtest_id: 'bt-1',
          base_import_id: 'imp-1',
          target_backtest_id: 'bt-2',
          target_import_id: 'imp-2',
          metrics_diff: {
            schema_version: '1.0',
            total_trades_diff: 2,
            win_rate_diff_pt: 3.5,
            profit_factor_diff: 0.2,
            max_drawdown_diff: -0.8,
            net_profit_diff: 12000,
          },
          tradeoff_summary: '- 総取引数差分: +2',
          ai_summary: 'AI比較総評',
          created_at: new Date().toISOString(),
        },
      },
    });

    const html = renderToStaticMarkup(<BacktestComparisonDetail />);
    expect(html).toContain('保存済みバックテスト比較');
    expect(html).toContain('比較対象');
    expect(html).toContain('主要差分');
    expect(html).toContain('tradeoff 要約');
    expect(html).toContain('AI比較総評');
    expect(html).toContain('href="/backtests/bt-1?comparisonId=cmp-1"');
  });
});

