import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const mockUseSWR = vi.fn();
const mockSetLocation = vi.fn();
const mockUseLocation = vi.fn();

vi.mock('swr', () => ({
  default: (...args: unknown[]) => mockUseSWR(...args),
}));

vi.mock('wouter', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  useLocation: () => mockUseLocation(),
}));

import StrategyVersionList from './StrategyVersionList';

describe('StrategyVersionList', () => {
  it('renders version rows', () => {
    mockUseSWR.mockReset();
    mockUseLocation.mockReset();
    mockUseLocation.mockReturnValue(['/strategies/str-1/versions?page=1', mockSetLocation]);
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
            cloned_from_version_id: 'ver-1',
            is_derived: true,
            has_diff_from_clone: true,
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
    expect(html).toContain('派生');
    expect(html).toContain('差分あり');
    expect(html).toContain('status: 生成済み');
    expect(html).toContain('/strategy-versions/ver-2?return=%2Fstrategies%2Fstr-1%2Fversions');
  });

  it('renders no-base badge when version has no compare source', () => {
    mockUseSWR.mockReset();
    mockUseLocation.mockReset();
    mockUseLocation.mockReturnValue(['/strategies/str-2/versions?page=1', mockSetLocation]);
    mockUseSWR.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        strategy: {
          id: 'str-2',
          title: '単独ルール',
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        strategy_versions: [
          {
            id: 'ver-10',
            strategy_id: 'str-2',
            cloned_from_version_id: null,
            is_derived: false,
            has_diff_from_clone: null,
            market: 'JP_STOCK',
            timeframe: 'D',
            status: 'draft',
            has_warnings: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      },
    });

    const html = renderToStaticMarkup(<StrategyVersionList params={{ strategyId: 'str-2' }} />);
    expect(html).toContain('比較元なし');
    expect(html).toContain('status: 下書き');
  });
});
