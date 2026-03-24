import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const mockUseSWR = vi.fn();
const mockPostApi = vi.fn();

vi.mock('swr', () => ({
  default: (...args: unknown[]) => mockUseSWR(...args),
}));

vi.mock('wouter', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

vi.mock('../api/client', async () => {
  const actual = await vi.importActual('../api/client');
  return {
    ...actual,
    postApi: (...args: unknown[]) => mockPostApi(...args),
  };
});

import StrategyVersionDetail from './StrategyVersionDetail';

describe('StrategyVersionDetail', () => {
  it('renders natural rule, warnings, assumptions and generated pine', () => {
    mockUseSWR.mockReset();
    mockPostApi.mockReset();
    mockUseSWR.mockReturnValue({
      isLoading: false,
      error: null,
      mutate: vi.fn(),
      data: {
        strategy_version: {
          id: 'ver-1',
          strategy_id: 'str-1',
          natural_language_rule: '25日移動平均線を上回ったら買い',
          market: 'JP_STOCK',
          timeframe: 'D',
          status: 'generated',
          normalized_rule_json: {},
          generated_pine: 'strategy("Hokkyokusei Generated Strategy")',
          warnings: ['未対応条件を無視しました'],
          assumptions: ['long_only を前提に変換しました'],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      },
    });

    const html = renderToStaticMarkup(<StrategyVersionDetail params={{ versionId: 'ver-1' }} />);
    expect(html).toContain('rule version 詳細');
    expect(html).toContain('自然言語ルール');
    expect(html).toContain('未対応条件を無視しました');
    expect(html).toContain('long_only を前提に変換しました');
    expect(html).toContain('strategy(&quot;Hokkyokusei Generated Strategy&quot;)');
  });
});

