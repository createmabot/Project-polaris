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

import StrategyVersionList from './StrategyVersionList';

describe('StrategyVersionList', () => {
  it('renders version rows', () => {
    mockUseSWR.mockReset();
    mockUseSWR.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        strategy: {
          id: 'str-1',
          title: '監視銘柄比較',
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        strategy_versions: [
          {
            id: 'ver-2',
            strategy_id: 'str-1',
            market: 'JP_STOCK',
            timeframe: 'D',
            status: 'generated',
            has_warnings: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      },
    });

    const html = renderToStaticMarkup(<StrategyVersionList params={{ strategyId: 'str-1' }} />);
    expect(html).toContain('ルール version 一覧');
    expect(html).toContain('ver-2');
    expect(html).toContain('version 詳細を開く');
  });
});

