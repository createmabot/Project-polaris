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

import WatchlistManage from './WatchlistManage';

describe('WatchlistManage', () => {
  it('renders list and add form', () => {
    mockUseSWR.mockReset();
    mockUseSWR.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        watchlist: { id: 'wl-1', name: 'default', description: null },
        items: [
          {
            item_id: 'item-1',
            watchlist_id: 'wl-1',
            symbol_id: 'sym-7203',
            symbol_code: '7203',
            display_name: 'トヨタ自動車',
            market_code: 'JP_STOCK',
            tradingview_symbol: 'TSE:7203',
            priority: 1,
            memo: 'core',
            added_at: '2026-04-27T00:00:00.000Z',
            created_at: '2026-04-27T00:00:00.000Z',
            updated_at: '2026-04-27T00:00:00.000Z',
          },
        ],
      },
      mutate: vi.fn(),
    });

    const html = renderToStaticMarkup(<WatchlistManage />);
    expect(html).toContain('監視銘柄管理');
    expect(html).toContain('symbol_code (例: 7203)');
    expect(html).toContain('href="/symbols/sym-7203"');
    expect(html).toContain('更新');
    expect(html).toContain('削除');
  });
});
