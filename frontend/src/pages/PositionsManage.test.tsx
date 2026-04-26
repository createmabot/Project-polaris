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

import PositionsManage from './PositionsManage';

describe('PositionsManage', () => {
  it('renders list and add/update form', () => {
    mockUseSWR.mockReset();
    mockUseSWR.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        portfolio: { id: 'pf-1', name: 'default', is_default: true },
        positions: [
          {
            position_id: 'pos-1',
            symbol_id: 'sym-6758',
            symbol_code: '6758',
            display_name: 'ソニーグループ',
            market_code: 'JP_STOCK',
            tradingview_symbol: 'TSE:6758',
            quantity: 100,
            average_cost: 13000,
            created_at: '2026-04-27T00:00:00.000Z',
            updated_at: '2026-04-27T00:00:00.000Z',
          },
        ],
      },
      mutate: vi.fn(),
    });

    const html = renderToStaticMarkup(<PositionsManage />);
    expect(html).toContain('保有銘柄管理');
    expect(html).toContain('quantity (必須, &gt; 0)');
    expect(html).toContain('average_cost (必須, &gt;= 0)');
    expect(html).toContain('href="/symbols/sym-6758"');
    expect(html).toContain('更新');
    expect(html).toContain('削除');
  });
});
