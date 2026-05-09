import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('wouter', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

import StrategyList from './StrategyList';

describe('StrategyList', () => {
  it('renders placeholder page content', () => {
    const html = renderToStaticMarkup(<StrategyList />);
    expect(html).toContain('ストラテジーリスト');
    expect(html).toContain('再利用可能なストラテジー定義をここに集約します。');
    expect(html).toContain('現在は準備中です。StrategyLab で作成したルール定義、version、関連検証結果は後続タスクで接続します。');
    expect(html).toContain('href="/strategy-lab"');
    expect(html).toContain('ストラテジー作成を開く');
    expect(html).toContain('href="/backtests"');
    expect(html).toContain('検証レポート一覧を開く');
    expect(html).toContain('BacktestList は検証レポート一覧として継続し、この画面の代替にはしません。');
  });
});
