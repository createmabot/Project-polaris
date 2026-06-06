import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseSWR = vi.fn();
const mockPatchApi = vi.fn();
const buttonRenderCalls = vi.hoisted(() => [] as Array<{
  text: string;
  props: {
    onClick?: () => void | Promise<void>;
  };
}>);

vi.mock('swr', () => ({
  default: (...args: unknown[]) => mockUseSWR(...args),
}));

vi.mock('../api/client', async () => {
  const actual = await vi.importActual('../api/client');
  return {
    ...actual,
    patchApi: (...args: unknown[]) => mockPatchApi(...args),
  };
});

vi.mock('../components/ui/Button', async () => {
  const ReactModule = await vi.importActual<typeof import('react')>('react');
  const getTextContent = (value: React.ReactNode): string => {
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (Array.isArray(value)) return value.map(getTextContent).join('');
    return '';
  };
  return {
    default: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => {
      buttonRenderCalls.push({
        text: getTextContent(children),
        props: props as { onClick?: () => void | Promise<void> },
      });
      return ReactModule.createElement('button', props, children);
    },
  };
});

vi.mock('wouter', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

import StrategyOptimizationSessionDetail from './StrategyOptimizationSessionDetail';

describe('StrategyOptimizationSessionDetail', () => {
  beforeEach(() => {
    buttonRenderCalls.length = 0;
    mockPatchApi.mockReset();
    mockUseSWR.mockReset();
  });

  it('renders optimization candidates and updates status only after explicit click', async () => {
    const mutate = vi.fn();
    mockUseSWR.mockReturnValue({
      isLoading: false,
      error: null,
      mutate,
      data: {
        optimization_session: {
          id: 'sess-1',
          symbol_id: 'sym-1',
          strategy_rule_id: 'str-1',
          base_strategy_version_id: 'ver-base',
          source_backtest_id: 'bt-1',
          source_ai_summary_id: 'sum-1',
          objective_type: 'balanced',
          status: 'active',
          candidate_count: 1,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
          source_backtest: {
            id: 'bt-1',
            title: 'source report',
            status: 'imported',
            execution_source: 'tradingview',
            market: 'JP_STOCK',
            timeframe: 'D',
            updated_at: '2026-01-01T00:00:00.000Z',
            metrics: {
              profit_factor: 0.9,
              win_rate: 44,
              max_drawdown: -1200,
              net_profit: -5000,
            },
          },
          candidates: [
            {
              id: 'cand-1',
              session_id: 'sess-1',
              source_backtest_id: 'bt-1',
              parent_strategy_version_id: 'ver-base',
              created_strategy_version_id: 'ver-cand-1',
              candidate_index: 1,
              status: 'version_created',
              title: 'entry filterを強化する',
              target_area: 'entry',
              rationale: 'PF改善',
              change_summary: '出来高filterを追加する。',
              entry_change: null,
              exit_change: null,
              risk_change: null,
              validation_plan: 'PFと勝率を比較する。',
              expected_metric_effect: {
                profit_factor: null,
                win_rate: null,
                max_drawdown: null,
                trade_count: null,
              },
              selected_at: null,
              created_at: '2026-01-01T00:00:00.000Z',
              updated_at: '2026-01-01T00:00:00.000Z',
              detail_url: '/strategy-versions/ver-cand-1?refinement_candidate_id=cand-1',
              latest_backtest_report: {
                id: 'bt-cand-1',
                title: 'candidate report',
                status: 'imported',
                execution_source: 'tradingview',
                market: 'JP_STOCK',
                timeframe: 'D',
                updated_at: '2026-01-02T00:00:00.000Z',
                metrics: {
                  profit_factor: 1.2,
                  win_rate: 52,
                },
                diff_vs_base: {
                  profit_factor: 0.3,
                  win_rate: 8,
                },
              },
            },
          ],
          comparison_rows: [],
          base_version: {
            id: 'ver-base',
            strategy_id: 'str-1',
            market: 'JP_STOCK',
            timeframe: 'D',
            status: 'draft',
            updated_at: '2026-01-01T00:00:00.000Z',
          },
          meta: {
            includes_raw_prompt: false,
            includes_raw_provider_response: false,
            includes_raw_csv: false,
            includes_raw_import_text: false,
            includes_raw_pine: false,
          },
        },
      },
    });

    const html = renderToStaticMarkup(<StrategyOptimizationSessionDetail params={{ sessionId: 'sess-1' }} />);

    expect(html).toContain('Strategy Optimization Session');
    expect(html).toContain('候補1: entry filterを強化する');
    expect(html).toContain('candidate report');
    expect(html).toContain('version を開く');
    expect(html).not.toContain('raw prompt token');
    expect(mockPatchApi).not.toHaveBeenCalled();

    const selectedButton = buttonRenderCalls.find((call) => call.text === 'selected');
    await selectedButton?.props.onClick?.();

    expect(mockPatchApi).toHaveBeenCalledWith('/api/strategy-refinement-candidates/cand-1/status', { status: 'selected' });
    expect(mutate).toHaveBeenCalled();
  });
});
