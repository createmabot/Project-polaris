import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const mockUseRoute = vi.fn();

vi.mock('wouter', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  useRoute: (...args: unknown[]) => mockUseRoute(...args),
}));

import StrategyDetail from './StrategyDetail';

describe('StrategyDetail', () => {
  it('renders placeholder page content', () => {
    mockUseRoute.mockReset();
    mockUseRoute.mockReturnValue([true, { strategyId: 'strategy_1' }]);

    const html = renderToStaticMarkup(<StrategyDetail />);
    expect(html).toContain('ストラテジー詳細');
    expect(html).toContain('strategy_id: <code>strategy_1</code>');
    expect(html).toContain('このストラテジー定義の version、関連検証レポート、適用済み銘柄をここに集約します。');
    expect(html).toContain('version 一覧を開く');
    expect(html).toContain('href="/strategies/strategy_1/versions"');
    expect(html).toContain('href="/strategy-lab"');
    expect(html).toContain('href="/backtests"');
    expect(html).toContain('BacktestDetail は個別検証レポート詳細として継続し、この画面には吸収しません。');
  });
});
