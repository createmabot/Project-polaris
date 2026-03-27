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

import StrategyVersionList, { buildStrategyVersionsListUrl, parseStrategyVersionsListQuery } from './StrategyVersionList';

describe('StrategyVersionList', () => {
  it('renders version rows with api pagination data', () => {
    mockUseSWR.mockReset();
    mockUseLocation.mockReset();
    mockUseLocation.mockReturnValue(['/strategies/str-1/versions?q=RSI&page=1', mockSetLocation]);
    mockUseSWR.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        strategy: {
          id: 'str-1',
          title: '検証用ルール',
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        query: { q: 'RSI' },
        pagination: {
          page: 1,
          limit: 20,
          q: 'RSI',
          total: 1,
          has_next: false,
          has_prev: false,
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
    expect(html).toContain('ver-2');
    expect(html).toContain('/strategy-versions/ver-2?return=%2Fstrategies%2Fstr-1%2Fversions%3Fq%3DRSI');
    expect(html).toContain('value="RSI"');
    expect(mockUseSWR).toHaveBeenCalledWith('/api/strategies/str-1/versions?page=1&limit=20&q=RSI', expect.any(Function));
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
          title: '派生なしルール',
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        query: { q: '' },
        pagination: {
          page: 1,
          limit: 20,
          q: '',
          total: 1,
          has_next: false,
          has_prev: false,
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
    expect(html).toContain('ver-10');
  });

  it('parses q/page from URL query and builds list URL with q', () => {
    expect(parseStrategyVersionsListQuery('/strategies/str-1/versions?q=MA&page=3')).toEqual({
      q: 'MA',
      page: 3,
    });
    expect(parseStrategyVersionsListQuery('/strategies/str-1/versions?page=abc&q=')).toEqual({
      q: '',
      page: 1,
    });

    expect(buildStrategyVersionsListUrl('str-1', 1, '')).toBe('/strategies/str-1/versions');
    expect(buildStrategyVersionsListUrl('str-1', 1, 'RSI')).toBe('/strategies/str-1/versions?q=RSI');
    expect(buildStrategyVersionsListUrl('str-1', 2, 'RSI')).toBe('/strategies/str-1/versions?q=RSI&page=2');
  });
});
