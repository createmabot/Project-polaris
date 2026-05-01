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

import ComparisonDetail from './ComparisonDetail';

const baseData = {
  comparison_header: {
    comparison_id: 'cmp-1',
    name: 'A vs B',
    comparison_type: 'symbol',
    status: 'ready',
    created_at: '2026-04-24T00:00:00.000Z',
    updated_at: '2026-04-24T00:00:00.000Z',
    symbol_count: 2,
  },
  symbols: [
    {
      symbol: {
        id: 'sym-1',
        symbol: '7203',
        symbol_code: '7203',
        display_name: 'Toyota',
        market_code: 'TSE',
        tradingview_symbol: 'TSE:7203',
      },
      current_snapshot: null,
      latest_ai_thesis_summary: null,
      latest_active_note: null,
      recent_alerts: [],
      related_references: [],
      latest_processing_status: 'idle',
    },
    {
      symbol: {
        id: 'sym-2',
        symbol: '6758',
        symbol_code: '6758',
        display_name: 'Sony',
        market_code: 'TSE',
        tradingview_symbol: 'TSE:6758',
      },
      current_snapshot: null,
      latest_ai_thesis_summary: null,
      latest_active_note: null,
      recent_alerts: [],
      related_references: [],
      latest_processing_status: 'idle',
    },
  ],
  latest_result: null as any,
};

describe('ComparisonDetail', () => {
  it('shows empty state when no comparison result exists', () => {
    mockUseSWR.mockReset();
    mockUseRoute.mockReset();
    mockUseRoute.mockReturnValue([true, { comparisonId: 'cmp-1' }]);
    mockUseSWR.mockReturnValue({
      isLoading: false,
      error: null,
      data: baseData,
      mutate: vi.fn(),
    });

    const html = renderToStaticMarkup(<ComparisonDetail />);
    expect(html).toContain('A vs B');
    expect(html).not.toContain('AI総評は未利用または利用不可です');
  });

  it('shows unavailable state when result exists without ai summary', () => {
    mockUseSWR.mockReset();
    mockUseRoute.mockReset();
    mockUseRoute.mockReturnValue([true, { comparisonId: 'cmp-1' }]);
    mockUseSWR.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        ...baseData,
        latest_result: {
          id: 'cmp-res-1',
          generated_at: '2026-04-24T01:00:00.000Z',
          compared_metric_json: { symbol_metrics: [] },
          ai_summary: null,
        },
      },
      mutate: vi.fn(),
    });

    const html = renderToStaticMarkup(<ComparisonDetail />);
    expect(html).toContain('AI総評は未利用または利用不可です');
  });

  it('shows ai summary content when available', () => {
    mockUseSWR.mockReset();
    mockUseRoute.mockReset();
    mockUseRoute.mockReturnValue([true, { comparisonId: 'cmp-1' }]);
    mockUseSWR.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        ...baseData,
        latest_result: {
          id: 'cmp-res-1',
          generated_at: '2026-04-24T01:00:00.000Z',
          compared_metric_json: { symbol_metrics: [] },
          ai_summary: {
            summary_id: 'sum-1',
            title: 'Comparison Summary',
            body_markdown: 'A is stronger',
            structured_json: {},
            model_name: 'gemma4-ns',
            prompt_version: 'v1.0.0-compare-local',
          },
        },
      },
      mutate: vi.fn(),
    });

    const html = renderToStaticMarkup(<ComparisonDetail />);
    expect(html).toContain('Comparison Summary');
    expect(html).toContain('A is stronger');
  });

  it('shows reference breakdown and shortage note when comparison references are empty', () => {
    mockUseSWR.mockReset();
    mockUseRoute.mockReset();
    mockUseRoute.mockReturnValue([true, { comparisonId: 'cmp-1' }]);
    mockUseSWR.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        ...baseData,
        latest_result: {
          id: 'cmp-res-1',
          generated_at: '2026-04-24T01:00:00.000Z',
          compared_metric_json: { symbol_metrics: [] },
          ai_summary: {
            summary_id: 'sum-1',
            title: 'Comparison Summary',
            body_markdown: 'A is stronger',
            structured_json: {},
            model_name: 'gemma4-ns',
            prompt_version: 'v1.0.0-compare-local',
          },
        },
      },
      mutate: vi.fn(),
    });

    const html = renderToStaticMarkup(<ComparisonDetail />);
    expect(html).toContain('news 0 / disclosure 0 / earnings 0');
    expect(html).toContain('比較に使える参照情報は0件です。');
  });
});
