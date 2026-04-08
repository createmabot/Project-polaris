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
  artifactPointerPath?: string | null;
  // engine_actual 固有
  tradeCount?: number | null;
  winRate?: number | null;
  totalReturnPercent?: number | null;
  maxDrawdownPercent?: number | null;
  holdingPeriodAvgBars?: number | null;
  firstTradeAt?: string | null;
  lastTradeAt?: string | null;
  actualRules?: Array<{ kind: string; [key: string]: unknown }> | null;
  actualRulesObject?: {
    entry_rule?: { kind: string; [key: string]: unknown };
    exit_rule?: { kind: string; [key: string]: unknown };
  } | null;
  compareBaseExecutionId?: string | null;
  executionTargetSymbol?: string | null;
  dataRange?: { from: string; to: string } | null;
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
        // engine_actual 固有（optional）
        trade_count: params?.tradeCount ?? null,
        win_rate: params?.winRate ?? null,
        total_return_percent: params?.totalReturnPercent ?? null,
        max_drawdown_percent: params?.maxDrawdownPercent ?? null,
        holding_period_avg_bars: params?.holdingPeriodAvgBars ?? null,
        first_trade_at: params?.firstTradeAt ?? null,
        last_trade_at: params?.lastTradeAt ?? null,
      },
    },
    artifact_pointer:
      params?.artifactPointerPath === null
        ? null
        : {
            type: 'internal_backtest_engine_actual',
            execution_id: params?.executionId ?? 'exec-1',
            path:
              params?.artifactPointerPath ??
              `/api/internal-backtests/executions/${
                params?.executionId ?? 'exec-1'
              }/artifacts/engine_actual/trades-and-equity`,
          },
    input_snapshot: {
      data_source_snapshot: {
        bar_count: params?.snapshotBarCount ?? metricsBarCount,
      },
      execution_target: {
        symbol: params?.executionTargetSymbol ?? '7203',
        source_kind: 'daily_ohlcv',
      },
      data_range: params?.dataRange ?? {
        from: '2024-01-01',
        to: '2025-12-31',
      },
      engine_config: {
        summary_mode: params?.summaryKind ?? 'engine_estimated',
        actual_rules: params?.actualRulesObject ?? null,
        compare_base_execution_id: params?.compareBaseExecutionId ?? null,
      },
      actual_rules: params?.actualRules ?? null,
    },
  };
}

function createInternalExecutionArtifactData(params?: {
  executionId?: string;
  tradesCount?: number;
  equityCount?: number;
}) {
  const executionId = params?.executionId ?? 'exec-1';
  const tradesCount = params?.tradesCount ?? 2;
  const equityCount = params?.equityCount ?? 3;
  return {
    execution_id: executionId,
    status: 'succeeded',
    artifact_pointer: {
      type: 'internal_backtest_engine_actual',
      execution_id: executionId,
      path: `/api/internal-backtests/executions/${executionId}/artifacts/engine_actual/trades-and-equity`,
    },
    artifact: {
      trades: Array.from({ length: tradesCount }).map((_, index) => ({
        entry_at: `2025-01-${String(index + 1).padStart(2, '0')}`,
        entry_price: 100 + index,
        exit_at: `2025-01-${String(index + 2).padStart(2, '0')}`,
        exit_price: 101 + index,
        return_percent: 1 + index,
        holding_bars: 1 + index,
      })),
      equity_curve: Array.from({ length: equityCount }).map((_, index) => ({
        at: `2025-01-${String(index + 1).padStart(2, '0')}`,
        equity_index: 100 + index,
      })),
    },
  };
}

function setupSWR(
  detailPayload: ReturnType<typeof createPayload>,
  listPayload = createListPayload(),
  internalStatusData: ReturnType<typeof createInternalExecutionStatusData> | null = null,
  internalResultData: ReturnType<typeof createInternalExecutionResultData> | null = null,
  internalArtifactData: ReturnType<typeof createInternalExecutionArtifactData> | null = null,
  internalArtifactError: { message: string; code?: string } | null = null,
  compareSourceStatusData: ReturnType<typeof createInternalExecutionStatusData> | null = null,
  compareSourceResultData: ReturnType<typeof createInternalExecutionResultData> | null = null,
) {
  const compareSourceExecutionId = compareSourceStatusData?.execution?.id ?? null;
  const currentExecutionId = internalStatusData?.execution?.id ?? null;
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
      if (
        compareSourceExecutionId &&
        key.includes(`/api/internal-backtests/executions/${compareSourceExecutionId}/result`)
      ) {
        return {
          isLoading: false,
          error: null,
          mutate: vi.fn(),
          data: compareSourceResultData,
        };
      }
      return {
        isLoading: false,
        error: null,
        mutate: vi.fn(),
        data: internalResultData,
      };
    }
    if (
      typeof key === 'string' &&
      key.startsWith('/api/internal-backtests/executions/') &&
      key.includes('/artifacts/engine_actual/trades-and-equity')
    ) {
      return {
        isLoading: false,
        error: internalArtifactError,
        mutate: vi.fn(),
        data: internalArtifactData,
      };
    }
    if (typeof key === 'string' && key.startsWith('/api/internal-backtests/executions/')) {
      if (
        compareSourceExecutionId &&
        key === `/api/internal-backtests/executions/${compareSourceExecutionId}`
      ) {
        return {
          isLoading: false,
          error: null,
          mutate: vi.fn(),
          data: compareSourceStatusData,
        };
      }
      if (
        currentExecutionId &&
        key === `/api/internal-backtests/executions/${currentExecutionId}`
      ) {
        return {
          isLoading: false,
          error: null,
          mutate: vi.fn(),
          data: internalStatusData,
        };
      }
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

  it('shows engine_actual artifact trades and equity when execution succeeded', () => {
    mockUseSWR.mockReset();
    mockUseLocation.mockReset();
    mockUseLocation.mockReturnValue(['/strategy-versions/ver-1?internalExecutionId=exec-actual-success', vi.fn()]);
    setupSWR(
      createPayload({ withCompareBase: true, samePine: false }),
      createListPayload(),
      createInternalExecutionStatusData({ executionId: 'exec-actual-success', status: 'succeeded' }),
      createInternalExecutionResultData({
        executionId: 'exec-actual-success',
        summaryKind: 'engine_actual',
        metricsBarCount: 5,
        snapshotBarCount: 5,
      }),
      createInternalExecutionArtifactData({
        executionId: 'exec-actual-success',
        tradesCount: 2,
        equityCount: 3,
      }),
    );

    const html = renderToStaticMarkup(<StrategyVersionDetail params={{ versionId: 'ver-1' }} />);
    expect(html).toContain('engine_actual artifact（最小）');
    expect(html).toContain('data-testid="engine-actual-artifact-trades"');
    expect(html).toContain('entry_at');
    expect(html).toContain('data-testid="engine-actual-artifact-equity"');
    expect(html).toContain('equity_index');
  });

  it('shows engine_actual no-trade artifact as non-error empty state', () => {
    mockUseSWR.mockReset();
    mockUseLocation.mockReset();
    mockUseLocation.mockReturnValue(['/strategy-versions/ver-1?internalExecutionId=exec-actual-empty', vi.fn()]);
    setupSWR(
      createPayload({ withCompareBase: true, samePine: false }),
      createListPayload(),
      createInternalExecutionStatusData({ executionId: 'exec-actual-empty', status: 'succeeded' }),
      createInternalExecutionResultData({
        executionId: 'exec-actual-empty',
        summaryKind: 'engine_actual',
        metricsBarCount: 0,
        snapshotBarCount: 0,
      }),
      createInternalExecutionArtifactData({
        executionId: 'exec-actual-empty',
        tradesCount: 0,
        equityCount: 0,
      }),
    );

    const html = renderToStaticMarkup(<StrategyVersionDetail params={{ versionId: 'ver-1' }} />);
    expect(html).toContain('data-testid="engine-actual-artifact-no-trade"');
    expect(html).toContain('no-trade（trades は 0 件）です。');
    expect(html).toContain('data-testid="engine-actual-artifact-equity-empty"');
    expect(html).not.toContain('data-testid="engine-actual-artifact-error"');
  });

  it('shows RESULT_NOT_READY state for engine_actual artifact read', () => {
    mockUseSWR.mockReset();
    mockUseLocation.mockReset();
    mockUseLocation.mockReturnValue(['/strategy-versions/ver-1?internalExecutionId=exec-actual-not-ready', vi.fn()]);
    setupSWR(
      createPayload({ withCompareBase: true, samePine: false }),
      createListPayload(),
      createInternalExecutionStatusData({ executionId: 'exec-actual-not-ready', status: 'succeeded' }),
      createInternalExecutionResultData({
        executionId: 'exec-actual-not-ready',
        summaryKind: 'engine_actual',
      }),
      null,
      { message: 'RESULT_NOT_READY', code: 'RESULT_NOT_READY' },
    );

    const html = renderToStaticMarkup(<StrategyVersionDetail params={{ versionId: 'ver-1' }} />);
    expect(html).toContain('data-testid="engine-actual-artifact-not-ready"');
    expect(html).toContain('artifact はまだ利用できません（RESULT_NOT_READY）。');
  });

  it('shows NOT_FOUND state for engine_actual artifact read', () => {
    mockUseSWR.mockReset();
    mockUseLocation.mockReset();
    mockUseLocation.mockReturnValue(['/strategy-versions/ver-1?internalExecutionId=exec-actual-not-found', vi.fn()]);
    setupSWR(
      createPayload({ withCompareBase: true, samePine: false }),
      createListPayload(),
      createInternalExecutionStatusData({ executionId: 'exec-actual-not-found', status: 'succeeded' }),
      createInternalExecutionResultData({
        executionId: 'exec-actual-not-found',
        summaryKind: 'engine_actual',
      }),
      null,
      { message: 'NOT_FOUND', code: 'NOT_FOUND' },
    );

    const html = renderToStaticMarkup(<StrategyVersionDetail params={{ versionId: 'ver-1' }} />);
    expect(html).toContain('data-testid="engine-actual-artifact-not-found"');
    expect(html).toContain('artifact は見つかりません（NOT_FOUND）。');
  });

  it('shows generic fetch error state for engine_actual artifact read', () => {
    mockUseSWR.mockReset();
    mockUseLocation.mockReset();
    mockUseLocation.mockReturnValue(['/strategy-versions/ver-1?internalExecutionId=exec-actual-fetch-error', vi.fn()]);
    setupSWR(
      createPayload({ withCompareBase: true, samePine: false }),
      createListPayload(),
      createInternalExecutionStatusData({ executionId: 'exec-actual-fetch-error', status: 'succeeded' }),
      createInternalExecutionResultData({
        executionId: 'exec-actual-fetch-error',
        summaryKind: 'engine_actual',
      }),
      null,
      { message: 'network failed' },
    );

    const html = renderToStaticMarkup(<StrategyVersionDetail params={{ versionId: 'ver-1' }} />);
    expect(html).toContain('data-testid="engine-actual-artifact-error"');
    expect(html).toContain('artifact 取得に失敗しました: network failed');
  });

  it('shows engine_actual summary card with trade metrics and rule pattern', () => {
    mockUseSWR.mockReset();
    mockUseLocation.mockReset();
    mockUseLocation.mockReturnValue(['/strategy-versions/ver-1?internalExecutionId=exec-actual-with-metrics', vi.fn()]);
    setupSWR(
      createPayload({ withCompareBase: true, samePine: false }),
      createListPayload(),
      createInternalExecutionStatusData({ executionId: 'exec-actual-with-metrics', status: 'succeeded' }),
      createInternalExecutionResultData({
        executionId: 'exec-actual-with-metrics',
        summaryKind: 'engine_actual',
        metricsBarCount: 50,
        snapshotBarCount: 50,
        tradeCount: 8,
        winRate: 62.5,
        totalReturnPercent: 8.34,
        maxDrawdownPercent: -5.12,
        holdingPeriodAvgBars: 3,
        firstTradeAt: '2025-01-05',
        lastTradeAt: '2025-03-28',
        actualRules: [{ kind: 'price_above_sma', period: 25 }],
      }),
      createInternalExecutionArtifactData({
        executionId: 'exec-actual-with-metrics',
        tradesCount: 8,
        equityCount: 50,
      }),
    );

    const html = renderToStaticMarkup(<StrategyVersionDetail params={{ versionId: 'ver-1' }} />);
    // summary card 表示
    expect(html).toContain('data-testid="engine-actual-summary-card"');
    expect(html).toContain('実行サマリー');
    // rule パターン
    expect(html).toContain('data-testid="engine-actual-rule-pattern"');
    expect(html).toContain('price_above_sma (period=25)');
    // 主要指標
    expect(html).toContain('data-testid="engine-actual-trade-count"');
    expect(html).toContain('>8<');
    expect(html).toContain('data-testid="engine-actual-win-rate"');
    expect(html).toContain('62.5%');
    expect(html).toContain('data-testid="engine-actual-total-return"');
    expect(html).toContain('+8.34%');
    expect(html).toContain('data-testid="engine-actual-max-drawdown"');
    expect(html).toContain('-5.12%');
    // オプショナル項目
    expect(html).toContain('3 bar');
    expect(html).toContain('2025-01-05');
    expect(html).toContain('2025-03-28');
    // 既存 artifact テーブルも維持
    expect(html).toContain('data-testid="engine-actual-artifact-trades"');
    expect(html).toContain('data-testid="engine-actual-artifact-equity"');
  });

  it('shows engine_actual summary card with default rule label when actual_rules is null', () => {
    mockUseSWR.mockReset();
    mockUseLocation.mockReset();
    mockUseLocation.mockReturnValue(['/strategy-versions/ver-1?internalExecutionId=exec-actual-default-rule', vi.fn()]);
    setupSWR(
      createPayload({ withCompareBase: true, samePine: false }),
      createListPayload(),
      createInternalExecutionStatusData({ executionId: 'exec-actual-default-rule', status: 'succeeded' }),
      createInternalExecutionResultData({
        executionId: 'exec-actual-default-rule',
        summaryKind: 'engine_actual',
        metricsBarCount: 30,
        tradeCount: 3,
        winRate: 66.7,
        totalReturnPercent: 4.0,
        maxDrawdownPercent: -2.0,
        actualRules: null,
      }),
      createInternalExecutionArtifactData({
        executionId: 'exec-actual-default-rule',
        tradesCount: 3,
        equityCount: 30,
      }),
    );

    const html = renderToStaticMarkup(<StrategyVersionDetail params={{ versionId: 'ver-1' }} />);
    expect(html).toContain('data-testid="engine-actual-summary-card"');
    expect(html).toContain('data-testid="engine-actual-rule-pattern"');
    expect(html).toContain('>default<');
  });

  it('engine_estimated display is not broken after engine_actual summary card addition', () => {
    mockUseSWR.mockReset();
    mockUseLocation.mockReset();
    mockUseLocation.mockReturnValue(['/strategy-versions/ver-1?internalExecutionId=exec-estimated-regression', vi.fn()]);
    setupSWR(
      createPayload({ withCompareBase: true, samePine: false }),
      createListPayload(),
      createInternalExecutionStatusData({ executionId: 'exec-estimated-regression', status: 'succeeded' }),
      createInternalExecutionResultData({
        executionId: 'exec-estimated-regression',
        summaryKind: 'engine_estimated',
        metricsBarCount: 12,
        snapshotBarCount: 12,
      }),
    );

    const html = renderToStaticMarkup(<StrategyVersionDetail params={{ versionId: 'ver-1' }} />);
    // engine_estimated 表示は変わらない
    expect(html).toContain('判定カテゴリ:</strong> <code>success_with_data</code>');
    expect(html).toContain('<div style="font-weight:600;margin-bottom:0.35rem">metrics</div>');
    expect(html).toContain('bar_count: 12');
    // engine_actual summary card は表示されない（該当 execution が engine_actual でないため）
    expect(html).not.toContain('data-testid="engine-actual-summary-card"');
  });

  it('shows restore button when engine_actual execution has restorable preset in input_snapshot', () => {
    mockUseSWR.mockReset();
    mockUseLocation.mockReset();
    mockUseLocation.mockReturnValue(['/strategy-versions/ver-1?internalExecutionId=exec-actual-restore', vi.fn()]);
    setupSWR(
      createPayload({ withCompareBase: true, samePine: false }),
      createListPayload(),
      createInternalExecutionStatusData({ executionId: 'exec-actual-restore', status: 'succeeded' }),
      createInternalExecutionResultData({
        executionId: 'exec-actual-restore',
        summaryKind: 'engine_actual',
        actualRulesObject: {
          entry_rule: { kind: 'price_above_sma', period: 25 },
          exit_rule: { kind: 'price_below_sma', period: 25 },
        },
      }),
      createInternalExecutionArtifactData({
        executionId: 'exec-actual-restore',
        tradesCount: 1,
        equityCount: 2,
      }),
    );

    const html = renderToStaticMarkup(<StrategyVersionDetail params={{ versionId: 'ver-1' }} />);
    expect(html).toContain('data-testid="engine-actual-restore-button"');
    expect(html).toContain('この条件で再実行');
    expect(html).not.toContain('data-testid="engine-actual-restore-unavailable"');
  });

  it('shows restore-unavailable message when preset cannot be mapped', () => {
    mockUseSWR.mockReset();
    mockUseLocation.mockReset();
    mockUseLocation.mockReturnValue(['/strategy-versions/ver-1?internalExecutionId=exec-actual-restore-unavailable', vi.fn()]);
    setupSWR(
      createPayload({ withCompareBase: true, samePine: false }),
      createListPayload(),
      createInternalExecutionStatusData({ executionId: 'exec-actual-restore-unavailable', status: 'succeeded' }),
      createInternalExecutionResultData({
        executionId: 'exec-actual-restore-unavailable',
        summaryKind: 'engine_actual',
        actualRulesObject: {
          entry_rule: { kind: 'price_above_sma', period: 25 },
          exit_rule: { kind: 'price_below_threshold', threshold: 500 },
        },
      }),
      createInternalExecutionArtifactData({
        executionId: 'exec-actual-restore-unavailable',
        tradesCount: 1,
        equityCount: 2,
      }),
    );

    const html = renderToStaticMarkup(<StrategyVersionDetail params={{ versionId: 'ver-1' }} />);
    expect(html).toContain('data-testid="engine-actual-restore-unavailable"');
    expect(html).toContain('この execution のルール条件は preset 復元できません。');
    expect(html).not.toContain('data-testid="engine-actual-restore-button"');
  });

  it('does not render engine_actual rerun compare before compare target exists', () => {
    mockUseSWR.mockReset();
    mockUseLocation.mockReset();
    mockUseLocation.mockReturnValue(['/strategy-versions/ver-1?internalExecutionId=exec-actual-no-compare', vi.fn()]);
    setupSWR(
      createPayload({ withCompareBase: true, samePine: false }),
      createListPayload(),
      createInternalExecutionStatusData({ executionId: 'exec-actual-no-compare', status: 'succeeded' }),
      createInternalExecutionResultData({
        executionId: 'exec-actual-no-compare',
        summaryKind: 'engine_actual',
        tradeCount: 4,
        winRate: 50,
        totalReturnPercent: 2.5,
        maxDrawdownPercent: -1.2,
        actualRules: [{ kind: 'price_above_sma', period: 25 }],
      }),
      createInternalExecutionArtifactData({
        executionId: 'exec-actual-no-compare',
        tradesCount: 4,
        equityCount: 6,
      }),
    );

    const html = renderToStaticMarkup(<StrategyVersionDetail params={{ versionId: 'ver-1' }} />);
    expect(html).not.toContain('data-testid="engine-actual-rerun-compare"');
  });

  it('renders engine_actual rerun compare when source and rerun executions are available', () => {
    mockUseSWR.mockReset();
    mockUseLocation.mockReset();
    mockUseLocation.mockReturnValue([
      '/strategy-versions/ver-1?internalExecutionId=exec-rerun&internalCompareSourceExecutionId=exec-source',
      vi.fn(),
    ]);
    setupSWR(
      createPayload({ withCompareBase: true, samePine: false }),
      createListPayload(),
      createInternalExecutionStatusData({ executionId: 'exec-rerun', status: 'succeeded' }),
      createInternalExecutionResultData({
        executionId: 'exec-rerun',
        summaryKind: 'engine_actual',
        tradeCount: 6,
        winRate: 66.7,
        totalReturnPercent: 7.5,
        maxDrawdownPercent: -2.4,
        actualRules: [{ kind: 'price_above_sma', period: 25 }],
      }),
      createInternalExecutionArtifactData({
        executionId: 'exec-rerun',
        tradesCount: 6,
        equityCount: 10,
      }),
      null,
      createInternalExecutionStatusData({ executionId: 'exec-source', status: 'succeeded' }),
      createInternalExecutionResultData({
        executionId: 'exec-source',
        summaryKind: 'engine_actual',
        tradeCount: 3,
        winRate: 33.3,
        totalReturnPercent: 1.2,
        maxDrawdownPercent: -4.1,
        actualRules: [{ kind: 'price_above_threshold', threshold: 500 }],
      }),
    );

    const html = renderToStaticMarkup(<StrategyVersionDetail params={{ versionId: 'ver-1' }} />);
    expect(html).toContain('data-testid="engine-actual-rerun-compare"');
    expect(html).toContain('data-testid="engine-actual-rerun-compare-table"');
    expect(html).toContain('元: <code>exec-source</code> / 再実行: <code>exec-rerun</code>');
    expect(html).toContain('trade_count');
    expect(html).toContain('win_rate');
    expect(html).toContain('total_return_percent');
    expect(html).toContain('max_drawdown_percent');
  });

  it('restores rerun compare linkage from persisted input_snapshot engine_config on revisit', () => {
    mockUseSWR.mockReset();
    mockUseLocation.mockReset();
    mockUseLocation.mockReturnValue([
      '/strategy-versions/ver-1?internalExecutionId=exec-rerun-persisted',
      vi.fn(),
    ]);
    setupSWR(
      createPayload({ withCompareBase: true, samePine: false }),
      createListPayload(),
      createInternalExecutionStatusData({ executionId: 'exec-rerun-persisted', status: 'succeeded' }),
      createInternalExecutionResultData({
        executionId: 'exec-rerun-persisted',
        summaryKind: 'engine_actual',
        tradeCount: 5,
        winRate: 60,
        totalReturnPercent: 6.1,
        maxDrawdownPercent: -2.0,
        actualRules: [{ kind: 'price_above_sma', period: 25 }],
        compareBaseExecutionId: 'exec-source-persisted',
      }),
      createInternalExecutionArtifactData({
        executionId: 'exec-rerun-persisted',
        tradesCount: 5,
        equityCount: 8,
      }),
      null,
      createInternalExecutionStatusData({ executionId: 'exec-source-persisted', status: 'succeeded' }),
      createInternalExecutionResultData({
        executionId: 'exec-source-persisted',
        summaryKind: 'engine_actual',
        tradeCount: 2,
        winRate: 50,
        totalReturnPercent: 1.0,
        maxDrawdownPercent: -3.8,
        actualRules: [{ kind: 'price_above_threshold', threshold: 500 }],
      }),
    );

    const html = renderToStaticMarkup(<StrategyVersionDetail params={{ versionId: 'ver-1' }} />);
    expect(html).toContain('data-testid="engine-actual-rerun-compare"');
    expect(html).toContain('元: <code>exec-source-persisted</code> / 再実行: <code>exec-rerun-persisted</code>');
  });
});
