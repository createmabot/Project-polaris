import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const mockUseSWR = vi.fn();
const mockPostApi = vi.fn();
const mockPatchApi = vi.fn();

vi.mock('swr', () => ({
  default: (...args: unknown[]) => mockUseSWR(...args),
}));

vi.mock('wouter', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  useLocation: () => ['/strategy-versions/ver-1', vi.fn()],
}));

vi.mock('../api/client', async () => {
  const actual = await vi.importActual('../api/client');
  return {
    ...actual,
    postApi: (...args: unknown[]) => mockPostApi(...args),
    patchApi: (...args: unknown[]) => mockPatchApi(...args),
  };
});

import StrategyVersionDetail from './StrategyVersionDetail';

function createPayload(params: {
  withCompareBase: boolean;
  samePine?: boolean;
}) {
  const samePine = params.samePine ?? false;
  const basePine = 'strategy("A")\nentryCondition = close > sma(close, 25)\nif (entryCondition)\n    strategy.entry("L", strategy.long)';
  const currentPine = samePine
    ? basePine
    : 'strategy("B")\nentryCondition = close > sma(close, 20)\nif (entryCondition)\n    strategy.entry("L", strategy.long)';
  return {
    strategy_version: {
      id: 'ver-1',
      strategy_id: 'str-1',
      cloned_from_version_id: params.withCompareBase ? 'ver-0' : null,
      natural_language_rule: '25日移動平均を上抜けたら買い\nRSIが50以上',
      market: 'JP_STOCK',
      timeframe: 'D',
      status: 'generated',
      normalized_rule_json: {},
      generated_pine: currentPine,
      warnings: ['未対応条件を無視しました'],
      assumptions: ['long_only を前提にしました'],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    compare_base: params.withCompareBase
      ? {
          id: 'ver-0',
          natural_language_rule: '25日移動平均を上抜けたら買い',
          status: 'draft',
          generated_pine: basePine,
          updated_at: new Date(Date.now() - 60_000).toISOString(),
        }
      : null,
  };
}

describe('StrategyVersionDetail', () => {
  it('shows minimal diff and pine changed marker when compare base exists', () => {
    mockUseSWR.mockReset();
    mockPostApi.mockReset();
    mockPatchApi.mockReset();

    mockUseSWR.mockReturnValue({
      isLoading: false,
      error: null,
      mutate: vi.fn(),
      data: createPayload({ withCompareBase: true, samePine: false }),
    });

    const html = renderToStaticMarkup(<StrategyVersionDetail params={{ versionId: 'ver-1' }} />);
    expect(html).toContain('rule version 詳細');
    expect(html).toContain('比較元との差分（最小）');
    expect(html).toContain('自然言語ルール差分');
    expect(html).toContain('Pine 差分（最小）');
    expect(html).toContain('変更有無:</strong> 変更あり');
    expect(html).toContain('差分抜粋（先頭');
    expect(html).toContain('- base:</strong> strategy(&quot;A&quot;)');
    expect(html).toContain('+ current:</strong> strategy(&quot;B&quot;)');
  });

  it('shows pine unchanged when generated pine is identical', () => {
    mockUseSWR.mockReset();
    mockUseSWR.mockReturnValue({
      isLoading: false,
      error: null,
      mutate: vi.fn(),
      data: createPayload({ withCompareBase: true, samePine: true }),
    });

    const html = renderToStaticMarkup(<StrategyVersionDetail params={{ versionId: 'ver-1' }} />);
    expect(html).toContain('変更有無:</strong> 変更なし');
    expect(html).not.toContain('差分抜粋（先頭');
  });

  it('renders fallback message when compare base does not exist', () => {
    mockUseSWR.mockReset();
    mockUseSWR.mockReturnValue({
      isLoading: false,
      error: null,
      mutate: vi.fn(),
      data: createPayload({ withCompareBase: false }),
    });

    const html = renderToStaticMarkup(<StrategyVersionDetail params={{ versionId: 'ver-1' }} />);
    expect(html).toContain('比較元の version はありません。');
  });
});
