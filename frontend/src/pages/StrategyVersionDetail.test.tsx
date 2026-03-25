import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const mockUseSWR = vi.fn();
const mockPostApi = vi.fn();
const mockPatchApi = vi.fn();
const mockUseLocation = vi.fn();

vi.mock('swr', () => ({
  default: (...args: unknown[]) => mockUseSWR(...args),
}));

vi.mock('wouter', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  useLocation: () => mockUseLocation(),
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

function createPayload(withCompareBase: boolean) {
  return {
    strategy_version: {
      id: 'ver-1',
      strategy_id: 'str-1',
      cloned_from_version_id: withCompareBase ? 'ver-0' : null,
      natural_language_rule: '25日移動平均を上抜けたら買い\nRSIが50以上',
      market: 'JP_STOCK',
      timeframe: 'D',
      status: 'generated',
      normalized_rule_json: {},
      generated_pine: 'strategy("Hokkyokusei Generated Strategy")',
      warnings: ['未対応条件を無視しました'],
      assumptions: ['long_only を前提にしました'],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    compare_base: withCompareBase
      ? {
          id: 'ver-0',
          natural_language_rule: '25日移動平均を上抜けたら買い',
          status: 'draft',
          updated_at: new Date(Date.now() - 60_000).toISOString(),
        }
      : null,
  };
}

describe('StrategyVersionDetail', () => {
  it('renders compare section when compare base exists', () => {
    mockUseSWR.mockReset();
    mockPostApi.mockReset();
    mockPatchApi.mockReset();
    mockUseLocation.mockReset();
    mockUseLocation.mockReturnValue(['/strategy-versions/ver-1?return=%2Fstrategies%2Fstr-1%2Fversions%3Fpage%3D2', vi.fn()]);

    mockUseSWR.mockReturnValue({
      isLoading: false,
      error: null,
      mutate: vi.fn(),
      data: createPayload(true),
    });

    const html = renderToStaticMarkup(<StrategyVersionDetail params={{ versionId: 'ver-1' }} />);
    expect(html).toContain('rule version 詳細');
    expect(html).toContain('比較元との差分（最小）');
    expect(html).toContain('比較元 version_id');
    expect(html).toContain('status:');
    expect(html).toContain('自然言語ルール差分');
    expect(html).toContain('RSIが50以上');
    expect(html).toContain('href="/strategies/str-1/versions?page=2"');
  });

  it('renders fallback message when compare base does not exist', () => {
    mockUseSWR.mockReset();
    mockUseLocation.mockReset();
    mockUseLocation.mockReturnValue(['/strategy-versions/ver-1?return=%2Fexternal', vi.fn()]);
    mockUseSWR.mockReturnValue({
      isLoading: false,
      error: null,
      mutate: vi.fn(),
      data: createPayload(false),
    });

    const html = renderToStaticMarkup(<StrategyVersionDetail params={{ versionId: 'ver-1' }} />);
    expect(html).toContain('比較元の version はありません。');
    expect(html).toContain('href="/strategies/str-1/versions"');
  });
});
