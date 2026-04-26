import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const mockUseSWR = vi.fn();
const mockUseRoute = vi.fn();

vi.mock('swr', () => ({
  default: (...args: unknown[]) => mockUseSWR(...args),
}));

vi.mock('wouter', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  useRoute: (...args: unknown[]) => mockUseRoute(...args),
}));

vi.mock('../api/client', () => ({
  swrFetcher: vi.fn(),
  postApi: vi.fn(async () => ({})),
}));

import SymbolDetail from './SymbolDetail';

const baseSymbolData = {
  symbol: {
    id: 'sym-1',
    symbol: 'TYO:7203',
    symbol_code: '7203',
    display_name: 'Toyota',
    market_code: 'JP',
    tradingview_symbol: 'TYO:7203',
  },
  current_snapshot: {
    last_price: 3050,
    change: 12.5,
    change_percent: 0.41,
    volume: 1200000,
    as_of: '2026-04-21T06:00:00.000Z',
    market_status: 'closed',
    source_name: 'stooq_daily',
  },
  tradingview_symbol: 'TYO:7203',
  chart: { widget_symbol: 'TYO:7203', default_interval: 'D' },
  recent_alerts: [],
  latest_ai_thesis_summary: null,
  related_references: [],
  latest_active_note: null,
  latest_processing_status: 'idle',
};

describe('SymbolDetail', () => {
  it('shows ai summary loading state', () => {
    mockUseSWR.mockReset();
    mockUseRoute.mockReset();
    mockUseRoute.mockReturnValue([true, { symbolId: 'sym-1' }]);
    mockUseSWR.mockImplementation((key: string) => {
      if (key === '/api/symbols/sym-1') {
        return { isLoading: false, error: null, data: baseSymbolData };
      }
      return { isLoading: true, error: null, data: null, mutate: vi.fn() };
    });

    const html = renderToStaticMarkup(<SymbolDetail />);
    expect(html).toContain('AI論点カードを読み込み中');
  });

  it('shows unavailable state when ai summary is unavailable', () => {
    mockUseSWR.mockReset();
    mockUseRoute.mockReset();
    mockUseRoute.mockReturnValue([true, { symbolId: 'sym-1' }]);
    mockUseSWR.mockImplementation((key: string) => {
      if (key === '/api/symbols/sym-1') {
        return { isLoading: false, error: null, data: baseSymbolData };
      }
      return {
        isLoading: false,
        error: null,
        mutate: vi.fn(),
        data: {
          symbol_id: 'sym-1',
          scope: 'thesis',
          summary: {
            summary_id: null,
            title: null,
            body_markdown: null,
            structured_json: null,
            generated_at: null,
            status: 'unavailable',
            insufficient_context: true,
            scope: 'thesis',
          },
        },
      };
    });

    const html = renderToStaticMarkup(<SymbolDetail />);
    expect(html).toContain('AI論点カードは未生成です');
    expect(html).toContain('AI論点カード生成');
  });

  it('shows available ai summary content', () => {
    mockUseSWR.mockReset();
    mockUseRoute.mockReset();
    mockUseRoute.mockReturnValue([true, { symbolId: 'sym-1' }]);
    mockUseSWR.mockImplementation((key: string) => {
      if (key === '/api/symbols/sym-1') {
        return { isLoading: false, error: null, data: baseSymbolData };
      }
      return {
        isLoading: false,
        error: null,
        mutate: vi.fn(),
        data: {
          symbol_id: 'sym-1',
          scope: 'thesis',
          summary: {
            summary_id: 'sum-1',
            title: 'Toyota thesis',
            body_markdown: 'Body text',
            structured_json: {
              payload: {
                bullish_points: ['Margin improvement'],
                bearish_points: ['FX risk'],
              },
            },
            generated_at: '2026-04-22T10:00:00+09:00',
            status: 'available',
            insufficient_context: false,
            scope: 'thesis',
          },
        },
      };
    });

    const html = renderToStaticMarkup(<SymbolDetail />);
    expect(html).toContain('Toyota thesis');
    expect(html).toContain('Margin improvement');
    expect(html).toContain('FX risk');
    expect(html).toContain('AI論点カードを再生成');
  });
});
