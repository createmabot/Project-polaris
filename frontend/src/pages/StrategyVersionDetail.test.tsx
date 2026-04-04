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

import StrategyVersionDetail, { findNextPriorityVersionId } from './StrategyVersionDetail';

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
      forward_validation_note: params.withCompareBase ? '次回は RSI 55 以上で再検証' : null,
      forward_validation_note_updated_at: params.withCompareBase ? '2026-03-29T11:30:00.000Z' : null,
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

function createListPayload() {
  return {
    strategy: {
      id: 'str-1',
      title: '検証用ルール',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    query: { q: 'RSI', status: '', sort: 'created_at', order: 'desc' },
    pagination: {
      page: 2,
      limit: 20,
      q: 'RSI',
      status: '',
      sort: 'created_at',
      order: 'desc',
      total: 3,
      has_next: false,
      has_prev: true,
    },
    strategy_versions: [
      {
        id: 'ver-1',
        strategy_id: 'str-1',
        cloned_from_version_id: 'ver-0',
        is_derived: true,
        has_forward_validation_note: true,
        forward_validation_note_updated_at: '2026-03-29T10:00:00.000Z',
        has_diff_from_clone: true,
        market: 'JP_STOCK',
        timeframe: 'D',
        status: 'generated',
        has_warnings: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'ver-next',
        strategy_id: 'str-1',
        cloned_from_version_id: 'ver-0',
        is_derived: true,
        has_forward_validation_note: true,
        forward_validation_note_updated_at: '2026-03-29T10:30:00.000Z',
        has_diff_from_clone: true,
        market: 'JP_STOCK',
        timeframe: 'D',
        status: 'generated',
        has_warnings: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ],
  };
}

function createInternalExecutionStatusData(params: {
  executionId?: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled' | string;
  errorCode?: string | null;
}) {
  return {
    execution: {
      id: params.executionId ?? 'exec-1',
      strategy_rule_version_id: 'ver-1',
      status: params.status,
      requested_at: new Date().toISOString(),
      started_at: null,
      finished_at: null,
      error_code: params.errorCode ?? null,
      error_message: params.errorCode ? 'simulated error' : null,
      engine_version: 'estimated-v1',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  };
}

function createInternalExecutionResultData(params?: {
  executionId?: string;
  summaryKind?: string;
  metricsBarCount?: number;
  snapshotBarCount?: number;
}) {
  const metricsBarCount = params?.metricsBarCount ?? 12;
  const firstClose = metricsBarCount > 0 ? 100 : 0;
  const lastClose = metricsBarCount > 0 ? 108 : 0;
  return {
    execution_id: params?.executionId ?? 'exec-1',
    strategy_rule_version_id: 'ver-1',
    status: 'succeeded',
    result_summary: {
      summary_kind: params?.summaryKind ?? 'engine_estimated',
      metrics: {
        bar_count: metricsBarCount,
        first_close: firstClose,
        last_close: lastClose,
        price_change: lastClose - firstClose,
        price_change_percent: firstClose === 0 ? 0 : ((lastClose - firstClose) / firstClose) * 100,
        period_high: metricsBarCount > 0 ? 110 : 0,
        period_low: metricsBarCount > 0 ? 98 : 0,
        range_percent: metricsBarCount > 0 ? 12 : 0,
      },
    },
    input_snapshot: {
      data_source_snapshot: {
        bar_count: params?.snapshotBarCount ?? metricsBarCount,
      },
    },
  };
}

function setupSWR(
  detailPayload: ReturnType<typeof createPayload>,
  listPayload = createListPayload(),
  internalStatusData: ReturnType<typeof createInternalExecutionStatusData> | null = null,
  internalResultData: ReturnType<typeof createInternalExecutionResultData> | null = null,
) {
  mockUseSWR.mockImplementation((key: string) => {
    if (typeof key === 'string' && key.startsWith('/api/strategy-versions/')) {
      return {
        isLoading: false,
        error: null,
        mutate: vi.fn(),
        data: detailPayload,
      };
    }
    if (typeof key === 'string' && key.startsWith('/api/strategies/')) {
      return {
        isLoading: false,
        error: null,
        mutate: vi.fn(),
        data: listPayload,
      };
    }
    if (typeof key === 'string' && key.startsWith('/api/internal-backtests/executions/') && key.endsWith('/result')) {
      return {
        isLoading: false,
        error: null,
        mutate: vi.fn(),
        data: internalResultData,
      };
    }
    if (typeof key === 'string' && key.startsWith('/api/internal-backtests/executions/')) {
      return {
        isLoading: false,
        error: null,
        mutate: vi.fn(),
        data: internalStatusData,
      };
    }
    return { isLoading: false, error: null, mutate: vi.fn(), data: null };
  });
}

describe('StrategyVersionDetail', () => {
  it('finds next priority version id with cyclic order', () => {
    const versions = [
      { id: 'v1', is_derived: true, has_diff_from_clone: true, has_forward_validation_note: true },
      { id: 'v2', is_derived: true, has_diff_from_clone: true, has_forward_validation_note: true },
      { id: 'v3', is_derived: true, has_diff_from_clone: false, has_forward_validation_note: true },
    ];

    expect(findNextPriorityVersionId('v1', versions)).toBe('v2');
    expect(findNextPriorityVersionId('v2', versions)).toBe('v1');
    expect(findNextPriorityVersionId('unknown', versions)).toBe('v1');
    expect(findNextPriorityVersionId('v1', [versions[0]])).toBeNull();
  });

  it('shows minimal diff and next priority link when compare base exists', () => {
    mockUseSWR.mockReset();
    mockPostApi.mockReset();
    mockPatchApi.mockReset();
    mockUseLocation.mockReset();
    mockUseLocation.mockReturnValue(['/strategy-versions/ver-1?return=%2Fstrategies%2Fstr-1%2Fversions%3Fq%3DRSI%26page%3D2', vi.fn()]);

    setupSWR(createPayload({ withCompareBase: true, samePine: false }));

    const html = renderToStaticMarkup(<StrategyVersionDetail params={{ versionId: 'ver-1' }} />);
    expect(html).toContain('rule version 詳細');
    expect(html).toContain('比較元との差分（最小）');
    expect(html).toContain('比較サマリ');
    expect(html).toContain('全体: 変更あり');
    expect(html).toContain('優先確認ポイント');
    expect(html).toContain('最初に確認: naturalLanguageRule');
    expect(html).toContain('naturalLanguageRule');
    expect(html).toContain('Pine');
    expect(html).toContain('status');
    expect(html).toContain('updatedAt');
    expect(html).toContain('ルール差分: +');
    expect(html).toContain('自然言語ルール差分');
    expect(html).toContain('Pine 差分（最小）');
    expect(html).toContain('変更有無:</strong> 変更あり');
    expect(html).toContain('差分抜粋（先頭');
    expect(html).toContain('確認順: 変更 → 追加 → 削除');
    expect(html).toContain('変更 (1)');
    expect(html).toContain('区分: 変更');
    expect(html).toContain('- base:</strong> strategy(&quot;A&quot;)');
    expect(html).toContain('+ current:</strong> strategy(&quot;B&quot;)');
    expect(html).toContain('href="/strategies/str-1/versions?q=RSI&amp;page=2"');
    expect(html).toContain('次の最優先確認へ');
    expect(html).toContain('/strategy-versions/ver-next?return=');
    expect(html).toContain('次の検証ノート');
    expect(html).toContain('現在のノート: 次回は RSI 55 以上で再検証');
    expect(html).toContain('ノート更新目安:');
    expect(html).toContain('内製バックテスト（最小）');
    expect(html).toContain('内製バックテストを開始');
    expect(html).toContain('判定カテゴリ:</strong> <code>not_ready</code>');
  });

  it('shows pine unchanged when generated pine is identical', () => {
    mockUseSWR.mockReset();
    mockUseLocation.mockReset();
    mockUseLocation.mockReturnValue(['/strategy-versions/ver-1', vi.fn()]);
    setupSWR(createPayload({ withCompareBase: true, samePine: true }));

    const html = renderToStaticMarkup(<StrategyVersionDetail params={{ versionId: 'ver-1' }} />);
    expect(html).toContain('比較サマリ');
    expect(html).toContain('全体: 変更あり');
    expect(html).toContain('優先確認ポイント');
    expect(html).toContain('最初に確認: naturalLanguageRule');
    expect(html).toContain('Pine: 変更なし');
    expect(html).toContain('変更有無:</strong> 変更なし');
    expect(html).not.toContain('差分抜粋（先頭');
  });

  it('renders fallback message when compare base does not exist', () => {
    mockUseSWR.mockReset();
    mockUseLocation.mockReset();
    mockUseLocation.mockReturnValue(['/strategy-versions/ver-1?return=%2Fexternal', vi.fn()]);
    setupSWR(createPayload({ withCompareBase: false }));

    const html = renderToStaticMarkup(<StrategyVersionDetail params={{ versionId: 'ver-1' }} />);
    expect(html).toContain('比較元の version はありません。');
    expect(html).toContain('href="/strategies/str-1/versions"');
    expect(html).toContain('現在のノート: 未設定');
    expect(html).toContain('ノート更新目安: -');
  });

  it('renders forward validation note editor controls', () => {
    mockUseSWR.mockReset();
    mockUseLocation.mockReset();
    mockUseLocation.mockReturnValue(['/strategy-versions/ver-1', vi.fn()]);
    setupSWR(createPayload({ withCompareBase: true, samePine: false }));

    const html = renderToStaticMarkup(<StrategyVersionDetail params={{ versionId: 'ver-1' }} />);
    expect(html).toContain('次の検証ノート');
    expect(html).toContain('placeholder="次に検証したい条件や見直し方針を記録します"');
    expect(html).toContain('ノートを保存');
  });

  it('shows not_ready guidance while internal execution is queued', () => {
    mockUseSWR.mockReset();
    mockUseLocation.mockReset();
    mockUseLocation.mockReturnValue(['/strategy-versions/ver-1?internalExecutionId=exec-queued', vi.fn()]);
    setupSWR(
      createPayload({ withCompareBase: true, samePine: false }),
      createListPayload(),
      createInternalExecutionStatusData({ executionId: 'exec-queued', status: 'queued' }),
      null,
    );

    const html = renderToStaticMarkup(<StrategyVersionDetail params={{ versionId: 'ver-1' }} />);
    expect(html).toContain('判定カテゴリ:</strong> <code>not_ready</code>');
    expect(html).toContain('実行中です。完了までお待ちください。');
  });

  it('shows success_no_data branch without rendering metrics table', () => {
    mockUseSWR.mockReset();
    mockUseLocation.mockReset();
    mockUseLocation.mockReturnValue(['/strategy-versions/ver-1?internalExecutionId=exec-empty', vi.fn()]);
    setupSWR(
      createPayload({ withCompareBase: true, samePine: false }),
      createListPayload(),
      createInternalExecutionStatusData({ executionId: 'exec-empty', status: 'succeeded' }),
      createInternalExecutionResultData({
        executionId: 'exec-empty',
        summaryKind: 'engine_estimated',
        metricsBarCount: 0,
        snapshotBarCount: 0,
      }),
    );

    const html = renderToStaticMarkup(<StrategyVersionDetail params={{ versionId: 'ver-1' }} />);
    expect(html).toContain('判定カテゴリ:</strong> <code>success_no_data</code>');
    expect(html).toContain('対象期間のデータがありません（empty bars success）。');
    expect(html).not.toContain('<div style="font-weight:600;margin-bottom:0.35rem">metrics</div>');
  });

  it('shows data_source_unavailable branch as fetch-failure guidance', () => {
    mockUseSWR.mockReset();
    mockUseLocation.mockReset();
    mockUseLocation.mockReturnValue(['/strategy-versions/ver-1?internalExecutionId=exec-failed', vi.fn()]);
    setupSWR(
      createPayload({ withCompareBase: true, samePine: false }),
      createListPayload(),
      createInternalExecutionStatusData({
        executionId: 'exec-failed',
        status: 'failed',
        errorCode: 'DATA_SOURCE_UNAVAILABLE',
      }),
      null,
    );

    const html = renderToStaticMarkup(<StrategyVersionDetail params={{ versionId: 'ver-1' }} />);
    expect(html).toContain('判定カテゴリ:</strong> <code>data_source_unavailable</code>');
    expect(html).toContain('データ取得に失敗しました。symbol / market / timeframe を確認して再試行してください。');
  });

  it('shows success_with_data branch with metrics table', () => {
    mockUseSWR.mockReset();
    mockUseLocation.mockReset();
    mockUseLocation.mockReturnValue(['/strategy-versions/ver-1?internalExecutionId=exec-success', vi.fn()]);
    setupSWR(
      createPayload({ withCompareBase: true, samePine: false }),
      createListPayload(),
      createInternalExecutionStatusData({ executionId: 'exec-success', status: 'succeeded' }),
      createInternalExecutionResultData({
        executionId: 'exec-success',
        summaryKind: 'engine_estimated',
        metricsBarCount: 12,
        snapshotBarCount: 12,
      }),
    );

    const html = renderToStaticMarkup(<StrategyVersionDetail params={{ versionId: 'ver-1' }} />);
    expect(html).toContain('判定カテゴリ:</strong> <code>success_with_data</code>');
    expect(html).toContain('<div style="font-weight:600;margin-bottom:0.35rem">metrics</div>');
    expect(html).toContain('bar_count: 12');
  });
});
