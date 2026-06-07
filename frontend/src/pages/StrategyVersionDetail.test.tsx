import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const mockUseSWR = vi.fn();
const mockFetchApi = vi.fn();
const mockPostApi = vi.fn();
const mockPatchApi = vi.fn();
const mockUseLocation = vi.fn();
const mockUseSearch = vi.fn();
const mockMutateNormalizedSpec = vi.fn();
const buttonRenderCalls = vi.hoisted(() => [] as Array<{
  text: string;
  props: {
    onClick?: () => void | Promise<void>;
    disabled?: boolean;
    'data-testid'?: string;
  };
}>);

vi.mock('swr', () => ({
  default: (...args: unknown[]) => mockUseSWR(...args),
}));

vi.mock('wouter', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  useLocation: () => mockUseLocation(),
  useSearch: () => mockUseSearch(),
}));

vi.mock('../api/client', async () => {
  const actual = await vi.importActual('../api/client');
  return {
    ...actual,
    fetchApi: (...args: unknown[]) => mockFetchApi(...args),
    postApi: (...args: unknown[]) => mockPostApi(...args),
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
        props: props as { onClick?: () => void | Promise<void>; disabled?: boolean; 'data-testid'?: string },
      });
      return ReactModule.createElement('button', props, children);
    },
  };
});

import StrategyVersionDetail, {
  buildSourceBacktestImprovementMemo,
  buildApplyImprovedVersionFailureMessage,
  findNextPriorityVersionId,
  parseImproveApplicationContext,
} from './StrategyVersionDetail';
import PineGenerationProgress from '../components/ui/PineGenerationProgress';

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
        label: null,
            note: null,
            is_favorite: false,
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
        label: null,
            note: null,
            is_favorite: false,
            has_warnings: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ],
  };
}

function createLineagePayload() {
  return {
    strategy: {
      id: 'str-1',
      title: '検証用ルール',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    nodes: [
      {
        id: 'ver-0',
        strategy_id: 'str-1',
        cloned_from_version_id: null,
        annotation: { label: 'base', note: null, is_favorite: false },
        status: 'draft',
        market: 'JP_STOCK',
        timeframe: 'D',
        has_warnings: false,
        has_forward_validation_note: false,
        has_diff_from_clone: null,
        backtest_count: 0,
        application_count: 0,
        latest_backtest_metrics: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'ver-1',
        strategy_id: 'str-1',
        cloned_from_version_id: 'ver-0',
        annotation: { label: 'improvement', note: null, is_favorite: true },
        status: 'generated',
        market: 'JP_STOCK',
        timeframe: 'D',
        has_warnings: false,
        has_forward_validation_note: true,
        has_diff_from_clone: true,
        backtest_count: 1,
        application_count: 1,
        latest_backtest_metrics: {
          backtest_id: 'bt-source-1',
          status: 'imported',
          execution_source: 'tradingview',
          updated_at: '2026-05-02T00:00:00.000Z',
          total_trades: 42,
          win_rate: 57.1,
          profit_factor: 1.63,
          max_drawdown: -8.4,
          net_profit: 120000,
        },
        created_at: '2026-01-02T00:00:00.000Z',
        updated_at: '2026-01-02T00:00:00.000Z',
      },
    ],
    edges: [{ from_version_id: 'ver-0', to_version_id: 'ver-1', relation: 'clone' }],
    meta: { limit: 300, total: 2, truncated: false },
  };
}

function createNormalizedSpecPayload() {
  return {
    strategy_version_id: 'ver-1',
    status: 'available',
    normalized_spec: {
      schema_name: 'normalized_strategy_spec',
      schema_version: '1.0',
      source: {
        strategy_version_id: 'ver-1',
        generated_from: 'natural_language_rule',
        generated_at: '2026-06-01T00:00:00.000Z',
        provider: 'local_llm',
        provider_task: 'strategy_spec_normalization',
        fallback_used: true,
        requested_provider: 'local_llm',
      },
      market: 'JP_STOCK',
      timeframe: 'D',
      side: 'long_only',
      strategy_family: 'trend_following_ma',
      indicators: [
        { id: 'sma_25', type: 'SMA', length: 25, source: 'close' },
        { id: 'rsi_14', type: 'RSI', length: 14, source: 'close' },
      ],
      entry: {
        logic: 'all',
        conditions: [
          { id: 'entry_close_above_sma_25', type: 'price_vs_indicator', indicator: 'sma_25', rule: '終値が25期間SMAを上回る' },
        ],
      },
      exit: {
        logic: 'any',
        conditions: [
          { id: 'exit_close_below_sma_25', type: 'price_vs_indicator', indicator: 'sma_25', rule: '終値が25期間SMAを下回る' },
        ],
      },
      risk: {
        stop_loss: { type: 'percent', value: 5 },
      },
      filters: [
        { id: 'filter_volume_above_volume_sma_20', type: 'volume_filter', indicator: 'volume_sma_20', rule: '出来高が20期間平均以上' },
      ],
      warnings: ['測定可能なexit条件を確認してください。'],
      assumptions: ['MVPでは long_only として解釈します。'],
      validation: {
        supported_for_internal_backtest: false,
        unsupported_features: [],
        warnings: ['測定可能なexit条件を確認してください。'],
        assumptions: ['MVPでは long_only として解釈します。'],
      },
    },
    meta: {
      schema_name: 'normalized_strategy_spec',
      schema_version: '1.0',
      internal_backtest_ready: false,
      internal_backtest_ready_reason: 'foundation artifact',
    },
  };
}

function createInternalBacktestReadyNormalizedSpecPayload() {
  const payload = createNormalizedSpecPayload();
  return {
    ...payload,
    normalized_spec: {
      ...payload.normalized_spec,
      validation: {
        ...payload.normalized_spec.validation,
        supported_for_internal_backtest: true,
        warnings: [],
      },
      warnings: [],
    },
    meta: {
      ...payload.meta,
      internal_backtest_ready: true,
      internal_backtest_ready_reason: 'normalized_strategy_spec v1 is ready for internal backtest.',
    },
  };
}

function createUnavailableNormalizedSpecPayload() {
  return {
    strategy_version_id: 'ver-1',
    status: 'unavailable',
    normalized_spec: null,
    meta: {
      schema_name: 'normalized_strategy_spec',
      schema_version: '1.0',
      internal_backtest_ready: false,
      internal_backtest_ready_reason: 'foundation artifact',
    },
  };
}

function createAlignmentPayload(overrides: Record<string, unknown> = {}) {
  return {
    schema_name: 'strategy_implementation_alignment',
    schema_version: '1.0',
    strategy_version_id: 'ver-1',
    status: 'warning',
    summary: {
      matched_count: 2,
      mismatch_count: 1,
      missing_in_pine_count: 1,
      missing_in_spec_count: 0,
    },
    matched: [
      { area: 'indicator', label: 'SMA 25', spec: 'SMA 25', pine: 'SMA 25' },
    ],
    mismatches: [
      {
        area: 'entry',
        severity: 'warning',
        label: 'rsi_14 >= 50',
        spec: 'rsi_14 >= 50',
        pine: 'rsi_14 crosses_above 50',
        message: 'RSI condition differs between spec and Pine.',
      },
    ],
    missing_in_pine: [
      { area: 'filter', severity: 'warning', label: 'volume filter', spec: 'volume >= volume_sma_20 * 1.5' },
    ],
    missing_in_spec: [],
    warnings: [],
    assumptions: ['deterministic diagnostics'],
    ...overrides,
  };
}

function createSourceBacktestPayload() {
  return {
    backtest: {
      id: 'bt-source-1',
      strategy_version_id: 'ver-source-1',
      title: 'source validation report',
      execution_source: 'tradingview',
      market: 'JP_STOCK',
      timeframe: 'D',
      status: 'imported',
      created_at: '2026-05-01T00:00:00.000Z',
      updated_at: '2026-05-02T00:00:00.000Z',
    },
    used_strategy: {
      strategy_id: 'str-1',
      strategy_version_id: 'ver-source-1',
      snapshot: null,
    },
    latest_import: {
      id: 'imp-source-1',
      file_name: 'raw-result.csv',
      file_size: 100,
      content_type: 'text/csv',
      parse_status: 'parsed',
      parse_error: null,
      parsed_summary: {
        totalTrades: 42,
        winRate: 57.1,
        profitFactor: 1.63,
        maxDrawdown: -8.4,
        netProfit: 120000,
        periodFrom: '2025-01-01',
        periodTo: '2025-12-31',
      },
      created_at: '2026-05-01T00:00:00.000Z',
      updated_at: '2026-05-01T00:00:00.000Z',
    },
    ai_review: {
      summary_id: 'sum-source-1',
      title: 'Source validation AI summary',
      body_markdown: 'Profit factor is improved, but drawdown risk remains around entries after sharp gaps.',
      structured_json: {
        payload: {
          next_actions: [
            'entry trigger を出来高条件と分けて再検証する',
            'exit と stop loss の幅を比較する',
          ],
          overall_view: '自然言語ルール改善案: entry / exit / risk 条件を分けてルール本文に反映する。',
          risks: ['最大DDが拡大する局面を切り分ける'],
          strengths: ['PFはbaselineを上回る'],
          rule_refinement_candidates: [
            {
              title: 'entry filter強化',
              target_area: 'entry',
              rationale: '勝率の低さを切り分ける',
              change_summary: '出来高filterとtrend filterをentry条件に追加する',
              entry_change: '出来高が20日平均を上回り、終値が25日移動平均を上回る場合のみentryする',
              exit_change: null,
              risk_change: '最大DD抑制のため5% stop lossを比較する',
              validation_plan: '現行ルールとentry filter追加版を同じ期間で比較する',
            },
          ],
        },
        key_points: [
          'Profit factor is above the baseline.',
          'Drawdown should be controlled before scaling.',
          'raw prompt token endpoint should be hidden',
        ],
        raw_prompt: 'do not show this prompt',
      },
      generated_at: '2026-05-03T00:00:00.000Z',
      status: 'available',
      insufficient_context: false,
    },
    imports: [],
    symbol_strategy_application: {
      application_id: 'app-1',
      application_status: 'active',
      application_source: 'manual',
      application_memo: null,
      application_created_at: '2026-05-01T00:00:00.000Z',
      application_updated_at: '2026-05-02T00:00:00.000Z',
      run_id: 'run-1',
      run_type: 'csv_import',
      run_status: 'succeeded',
      run_created_at: '2026-05-01T01:00:00.000Z',
      run_updated_at: '2026-05-02T01:00:00.000Z',
      symbol: {
        id: 'sym-1',
        symbol: 'TYO:7203',
        symbol_code: '7203',
        market_code: 'JP',
        tradingview_symbol: 'TYO:7203',
        display_name: 'Toyota',
      },
      strategy: {
        id: 'str-1',
        title: 'Breakout strategy',
      },
      strategy_version: {
        id: 'ver-source-1',
        market: 'JP_STOCK',
        timeframe: 'D',
      },
      current_report: null,
      related_reports: [
        {
          backtest_id: 'bt-related',
          title: 'related report',
          execution_source: 'internal_backtest',
          status: 'completed',
          run_type: 'internal_backtest',
          run_status: 'succeeded',
          updated_at: '2026-05-04T00:00:00.000Z',
          metrics: null,
        },
      ],
    },
  };
}

function setupSWR(
  detailPayload: ReturnType<typeof createPayload>,
  listPayload = createListPayload(),
  pinePayload: any = null,
  sourceBacktestPayload: any = null,
  sourceBacktestError: Error | null = null,
  refinementCandidatePayload: any = null,
  refinementCandidateError: Error | null = null,
  normalizedSpecPayload: any = createUnavailableNormalizedSpecPayload(),
) {
  mockUseSWR.mockImplementation((key: string) => {
    if (typeof key === 'string' && key.startsWith('/api/strategy-refinement-candidates/')) {
      return {
        isLoading: false,
        error: refinementCandidateError,
        mutate: vi.fn(),
        data: refinementCandidateError ? null : refinementCandidatePayload,
      };
    }
    if (typeof key === 'string' && key.startsWith('/api/backtests/')) {
      return {
        isLoading: false,
        error: sourceBacktestError,
        mutate: vi.fn(),
        data: sourceBacktestError ? null : sourceBacktestPayload,
      };
    }
    if (typeof key === 'string' && key.endsWith('/pine')) {
      return {
        isLoading: false,
        error: null,
        mutate: vi.fn(),
        data: pinePayload,
      };
    }
    if (typeof key === 'string' && key.endsWith('/normalized-spec')) {
      return {
        isLoading: false,
        error: null,
        mutate: mockMutateNormalizedSpec,
        data: normalizedSpecPayload,
      };
    }
    if (typeof key === 'string' && key.startsWith('/api/strategy-versions/')) {
      return {
        isLoading: false,
        error: null,
        mutate: vi.fn(),
        data: detailPayload,
      };
    }
    if (typeof key === 'string' && key.includes('/version-lineage')) {
      return {
        isLoading: false,
        error: null,
        mutate: vi.fn(),
        data: createLineagePayload(),
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
    return { isLoading: false, error: null, mutate: vi.fn(), data: null };
  });
}

describe('StrategyVersionDetail', () => {
  beforeEach(() => {
    buttonRenderCalls.length = 0;
    mockFetchApi.mockReset();
    mockPostApi.mockReset();
    mockPatchApi.mockReset();
    mockMutateNormalizedSpec.mockReset();
    mockUseSearch.mockReset();
    mockUseSearch.mockReturnValue('');
  });

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

  it('parses optional source_backtest_id and safe backtest return path', () => {
    const query = new URLSearchParams({
      mode: 'improve_application',
      symbol_id: 'sym-1',
      symbol_code: '7203',
      symbol_name: 'Toyota',
      application_id: 'app-1',
      source_version_id: 'ver-source-1',
      source_backtest_id: 'bt-source-1',
      refinement_candidate_id: 'cand-1',
      return_to: '/backtests/bt-source-1',
    });

    expect(parseImproveApplicationContext(query.toString())).toEqual({
      symbolId: 'sym-1',
      symbolCode: '7203',
      symbolName: 'Toyota',
      applicationId: 'app-1',
      sourceVersionId: 'ver-source-1',
      sourceBacktestId: 'bt-source-1',
      refinementCandidateId: 'cand-1',
      returnTo: '/backtests/bt-source-1',
    });
  });

  it('builds sanitized source backtest improvement memo without raw prompt details', () => {
    const memo = buildSourceBacktestImprovementMemo(createSourceBacktestPayload() as any);
    expect(memo).toContain('source validation report');
    expect(memo).toContain('主要指標');
    expect(memo).toContain('Profit Factor=1.63');
    expect(memo).toContain('AI summary rule refinement candidates');
    expect(memo).toContain('entry filter強化');
    expect(memo).toContain('出来高filterとtrend filter');
    expect(memo).toContain('AI summary next actions');
    expect(memo).toContain('entry trigger を出来高条件と分けて再検証する');
    expect(memo).toContain('AI summary improvement memo');
    expect(memo).toContain('entry / exit / risk 条件を分けてルール本文に反映する');
    expect(memo).toContain('最大DDが拡大する局面を切り分ける');
    expect(memo).not.toContain('raw prompt token endpoint');
    expect(memo).not.toContain('do not show this prompt');
  });

  it('falls back to source backtest AI summary body excerpt when structured payload is missing', () => {
    const payload = createSourceBacktestPayload();
    payload.ai_review.structured_json = {
      key_points: [],
    } as any;
    payload.ai_review.body_markdown = 'Body excerpt fallback recommends reviewing exit timing without source file details.';

    const memo = buildSourceBacktestImprovementMemo(payload as any);

    expect(memo).toContain('AI summary excerpt');
    expect(memo).toContain('Body excerpt fallback recommends reviewing exit timing');
    expect(memo).not.toContain('raw CSV');
    expect(memo).not.toContain('raw prompt');
  });

  it('renders shared loading and error states for detail fetch', () => {
    mockUseSWR.mockReset();
    mockUseLocation.mockReset();
    mockUseLocation.mockReturnValue(['/strategy-versions/ver-1', vi.fn()]);
    mockUseSWR.mockReturnValue({
      isLoading: true,
      error: null,
      mutate: vi.fn(),
      data: null,
    });

    const loadingHtml = renderToStaticMarkup(<StrategyVersionDetail params={{ versionId: 'ver-1' }} />);
    expect(loadingHtml).toContain('rule version を読み込み中...');

    mockUseSWR.mockReturnValue({
      isLoading: false,
      error: { message: 'network failed' },
      mutate: vi.fn(),
      data: null,
    });

    const errorHtml = renderToStaticMarkup(<StrategyVersionDetail params={{ versionId: 'ver-1' }} />);
    expect(errorHtml).toContain('rule version の取得に失敗しました');
    expect(errorHtml).toContain('エラー: network failed');
  });

  it('renders shared empty state when detail payload is missing', () => {
    mockUseSWR.mockReset();
    mockUseLocation.mockReset();
    mockUseLocation.mockReturnValue(['/strategy-versions/ver-1', vi.fn()]);
    mockUseSWR.mockReturnValue({
      isLoading: false,
      error: null,
      mutate: vi.fn(),
      data: null,
    });

    const html = renderToStaticMarkup(<StrategyVersionDetail params={{ versionId: 'ver-1' }} />);
    expect(html).toContain('rule version が見つかりません');
  });

  it('shows minimal diff and next priority link when compare base exists', () => {
    mockUseSWR.mockReset();
    mockPostApi.mockReset();
    mockPatchApi.mockReset();
    mockUseLocation.mockReset();
    mockUseLocation.mockReturnValue(['/strategy-versions/ver-1', vi.fn()]);
    mockUseSearch.mockReturnValue('return=%2Fstrategies%2Fstr-1%2Fversions%3Fq%3DRSI%26page%3D2');

    setupSWR(createPayload({ withCompareBase: true, samePine: false }));

    const html = renderToStaticMarkup(<StrategyVersionDetail params={{ versionId: 'ver-1' }} />);
    expect(html).toContain('rule version 詳細');
    expect(html).toContain('Pine生成対象は JP_STOCK / US_STOCK、日足（D）/ 4時間足（4H）/ 1時間足（1H）');
    expect(html).toContain('internal backtestの対応範囲拡張ではありません');
    expect(html).toContain('比較元との差分（最小）');
    expect(html).toContain('比較サマリ');
    expect(html).toContain('全体: 変更あり');
    expect(html).toContain('優先確認ポイント');
    expect(html).toContain('最初に確認: naturalLanguageRule');
    expect(html).toContain('naturalLanguageRule');
    expect(html).toContain('Pine');
    expect(html).toContain('警告');
    expect(html).toContain('未対応条件を無視しました');
    expect(html).toContain('前提');
    expect(html).toContain('long_only を前提にしました');
    expect(html).not.toContain('>warnings<');
    expect(html).not.toContain('>assumptions<');
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
    expect(html).not.toContain('次の検証ノート');
    expect(html).not.toContain('<strong>現在のノート:</strong> 次回は RSI 55 以上で再検証');
    expect(html).not.toContain('ノート更新目安:');
    expect(html).not.toContain('内製バックテスト（最小）');
    expect(html).not.toContain('内製バックテストを開始');
    expect(html).not.toContain('/api/internal-backtests/executions');
    expect(html).not.toContain('TradingView 検証用バックテスト');
    expect(html).not.toContain('TradingView検証用バックテストを作成');
    expect(html).not.toContain('TradingViewでバックテストを実行し、その結果CSVを取り込むためのコンテナを作成します。');
    expect(html).toContain('Pine生成対象は JP_STOCK / US_STOCK、日足（D）/ 4時間足（4H）/ 1時間足（1H）');
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
    mockUseLocation.mockReturnValue(['/strategy-versions/ver-1', vi.fn()]);
    mockUseSearch.mockReturnValue('return=%2Fexternal');
    setupSWR(createPayload({ withCompareBase: false }));

    const html = renderToStaticMarkup(<StrategyVersionDetail params={{ versionId: 'ver-1' }} />);
    expect(html).toContain('比較元の version はありません。');
    expect(html).toContain('href="/strategies/str-1/versions"');
    expect(html).not.toContain('<strong>現在のノート:</strong> 未設定');
    expect(html).not.toContain('<strong>ノート更新目安:</strong> -');
  });

  it('renders improve application context banner with safe return link', () => {
    mockUseSWR.mockReset();
    mockUseLocation.mockReset();
    const query = new URLSearchParams({
      mode: 'improve_application',
      symbol_id: 'sym-1',
      symbol_code: '7203',
      symbol_name: 'トヨタ自動車',
      application_id: 'app-1',
      source_version_id: 'ver-source-1',
      source_backtest_id: 'bt-source-1',
      return_to: '/symbols/sym-1?tab=applications&application_id=app-1',
    });
    mockUseLocation.mockReturnValue(['/strategy-versions/ver-1', vi.fn()]);
    mockUseSearch.mockReturnValue(query.toString());
    setupSWR(createPayload({ withCompareBase: true, samePine: false }));

    const html = renderToStaticMarkup(<StrategyVersionDetail params={{ versionId: 'ver-1' }} />);
    expect(html).toContain('data-testid="improve-application-banner"');
    expect(html).toContain('7203 トヨタ自動車 の適用 strategy を改善中');
    expect(html).toContain('source application: <code>app-1</code>');
    expect(html).toContain('source version: <code>ver-source-1</code>');
    expect(html).toContain('source backtest: <code>bt-source-1</code>');
    expect(html).toContain('href="/symbols/sym-1?tab=applications&amp;application_id=app-1"');
    expect(html).toContain('銘柄ページへ戻る');
    expect(html).toContain('この銘柄に改善版を適用');
    expect(html).toContain('data-testid="apply-improved-version"');
    expect(html).not.toContain('Optimization Session を開く');
    expect(html).not.toContain('/strategy-optimization-sessions/');
    expect(html).toContain('現在の branch');
    expect(html).toContain('現在の version がどの branch にいるかを確認します。');
    expect(html).toContain('現在表示中');
    expect(html).toContain('improvement');
    expect(html).toContain('PF 1.63');
    expect(html).toContain('href="/strategy-versions/ver-1"');
  });

  it('renders read-only source backtest improvement context and memo handoff controls', async () => {
    mockUseSWR.mockReset();
    mockPostApi.mockReset();
    mockUseLocation.mockReset();
    const query = new URLSearchParams({
      mode: 'improve_application',
      symbol_id: 'sym-1',
      symbol_code: '7203',
      symbol_name: 'トヨタ自動車',
      application_id: 'app-1',
      source_version_id: 'ver-source-1',
      source_backtest_id: 'bt-source-1',
      refinement_candidate_id: 'cand-1',
      return_to: '/backtests/bt-source-1',
    });
    mockUseLocation.mockReturnValue(['/strategy-versions/ver-1', vi.fn()]);
    mockUseSearch.mockReturnValue(query.toString());
    setupSWR(
      createPayload({ withCompareBase: true, samePine: false }),
      createListPayload(),
      null,
      createSourceBacktestPayload(),
      null,
      {
        refinement_candidate: {
          id: 'cand-1',
          session_id: 'sess-1',
          source_backtest_id: 'bt-source-1',
          parent_strategy_version_id: 'ver-source-1',
          created_strategy_version_id: 'ver-1',
          candidate_index: 1,
          status: 'version_created',
          title: 'entry filterを強化する',
          target_area: 'entry',
          rationale: 'PFを改善するため。',
          change_summary: '出来高filterを追加する。',
          entry_change: '出来高が20日平均以上の場合だけentryする。',
          exit_change: null,
          risk_change: null,
          validation_plan: '候補1のPFと勝率を比較する。',
          expected_metric_effect: {
            profit_factor: '改善候補',
            win_rate: null,
            max_drawdown: null,
            trade_count: null,
          },
          selected_at: null,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      },
    );

    const html = renderToStaticMarkup(<StrategyVersionDetail params={{ versionId: 'ver-1' }} />);
    expect(html).toContain('href="/backtests/bt-source-1"');
    expect(html).toContain('検証結果へ戻る');
    expect(html).toContain('検証結果からの改善メモ');
    expect(html).toContain('元 backtest report を read-only context として確認');
    expect(html).toContain('strategy logic の改善は自然言語ルール本文に反映');
    expect(html).toContain('source backtest id');
    expect(html).toContain('bt-source-1');
    expect(html).toContain('source validation report');
    expect(html).toContain('execution source');
    expect(html).toContain('tradingview');
    expect(html).toContain('JP_STOCK / D');
    expect(html).toContain('key metrics available');
    expect(html).toContain('総取引数');
    expect(html).toContain('42');
    expect(html).toContain('Profit Factor');
    expect(html).toContain('1.63');
    expect(html).toContain('AI summary context');
    expect(html).toContain('Source validation AI summary');
    expect(html).toContain('Profit factor is above the baseline.');
    expect(html).toContain('Drawdown should be controlled before scaling.');
    expect(html).toContain('同じ application の関連レポートが 1 件あります。');
    expect(html).toContain('改善メモ');
    expect(html).toContain('LLMで新しいルール本文を作る');
    expect(html).toContain('Optimization Session を開く');
    expect(html).toContain('href="/strategy-optimization-sessions/sess-1"');
    expect(html).toContain('この候補を含む改善探索 session で、base version と候補 version の検証結果を比較できます。');
    expect(html).toContain('元ルール、検証結果、AI総評、改善メモをもとに');
    expect(html).toContain('押下だけでは保存・Pine生成・検証・適用は行いません');
    expect(html).toContain('data-testid="llm-rewrite-natural-language-rule"');
    expect(html).toContain('現在の branch');
    expect(html).toContain('現在表示中');
    expect(html).not.toContain('改善案から新しいルール本文を作る');
    expect(html).not.toContain('改善メモを Pine 修正依頼に反映');
    expect(html).not.toContain('data-testid="reflect-source-backtest-memo-to-rule"');
    expect(html).not.toContain('data-testid="reflect-source-backtest-memo"');
    expect(html).not.toContain('raw-result.csv');
    expect(html).not.toContain('raw_prompt');
    expect(html).not.toContain('do not show this prompt');
    expect(html).not.toContain('raw prompt token endpoint');

    expect(mockPostApi).not.toHaveBeenCalled();
    expect(mockPatchApi).not.toHaveBeenCalled();
    expect(mockPostApi).not.toHaveBeenCalled();
  });

  it('calls rule rewrite draft endpoint without auto save or Pine generation', async () => {
    mockUseSWR.mockReset();
    mockPostApi.mockReset();
    mockPatchApi.mockReset();
    mockFetchApi.mockReset();
    mockUseLocation.mockReset();
    const query = new URLSearchParams({
      mode: 'improve_application',
      symbol_id: 'sym-1',
      symbol_code: '7203',
      symbol_name: 'トヨタ自動車',
      application_id: 'app-1',
      source_version_id: 'ver-source-1',
      source_backtest_id: 'bt-source-1',
      refinement_candidate_id: 'cand-1',
      return_to: '/backtests/bt-source-1',
    });
    mockUseLocation.mockReturnValue(['/strategy-versions/ver-1', vi.fn()]);
    mockUseSearch.mockReturnValue(query.toString());
    setupSWR(
      createPayload({ withCompareBase: true, samePine: false }),
      createListPayload(),
      null,
      createSourceBacktestPayload(),
      null,
      {
        refinement_candidate: {
          id: 'cand-1',
          session_id: 'sess-1',
          source_backtest_id: 'bt-source-1',
          parent_strategy_version_id: 'ver-source-1',
          created_strategy_version_id: 'ver-1',
          candidate_index: 1,
          status: 'version_created',
          title: 'entry filterを強化する',
          target_area: 'entry',
          rationale: 'PFを改善するため。',
          change_summary: '出来高filterを追加する。',
          entry_change: '出来高が20日平均以上の場合だけentryする。',
          exit_change: null,
          risk_change: null,
          validation_plan: '候補1のPFと勝率を比較する。',
          expected_metric_effect: {
            profit_factor: '改善候補',
            win_rate: null,
            max_drawdown: null,
            trade_count: null,
          },
          selected_at: null,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      },
    );
    mockPostApi.mockResolvedValue({
      draft: {
        natural_language_rule: 'LLMで再構成した単一の自然言語ルール本文',
        source: 'llm_rewrite',
        base_version_id: 'ver-1',
        source_backtest_id: 'bt-source-1',
        warnings: ['保存は未実行です。'],
        assumptions: [],
      },
    });

    const html = renderToStaticMarkup(<StrategyVersionDetail params={{ versionId: 'ver-1' }} />);
    expect(html).toContain('選択中の改善候補');
    expect(html).toContain('候補1: entry filterを強化する');
    expect(mockPostApi).not.toHaveBeenCalled();

    const rewriteButton = buttonRenderCalls.find((call) => call.props['data-testid'] === 'llm-rewrite-natural-language-rule');
    expect(rewriteButton?.text).toBe('LLMで新しいルール本文を作る');
    await rewriteButton?.props.onClick?.();

    expect(mockPostApi).toHaveBeenCalledTimes(1);
    expect(mockPostApi).toHaveBeenCalledWith(
      '/api/strategy-versions/ver-1/natural-language-rule/rewrite-draft',
      expect.objectContaining({
        source_backtest_id: 'bt-source-1',
        refinement_candidate_id: 'cand-1',
        improvement_memo: expect.stringContaining('検証結果 source validation report'),
        current_rule: expect.any(String),
        mode: 'improvement_from_backtest',
      }),
    );
    expect(mockPatchApi).not.toHaveBeenCalled();
    expect(mockFetchApi).not.toHaveBeenCalledWith('/api/strategy-versions/ver-1/pine/generation-jobs/pine-job-1');
    expect(mockPostApi.mock.calls.map((call) => call[0])).not.toContain('/api/strategy-versions/ver-1/pine/generation-jobs');
    expect(mockPostApi.mock.calls.map((call) => call[0])).not.toContain('/api/strategy-versions/ver-1/pine/regeneration-jobs');
  });

  it('renders clarified rule, Pine, clone, and revision action labels with disabled source Pine reason', () => {
    mockUseSWR.mockReset();
    mockUseLocation.mockReset();
    const query = new URLSearchParams({
      mode: 'improve_application',
      symbol_id: 'sym-1',
      symbol_code: '7203',
      symbol_name: 'トヨタ自動車',
      source_backtest_id: 'bt-source-1',
      return_to: '/backtests/bt-source-1',
    });
    mockUseLocation.mockReturnValue(['/strategy-versions/ver-1', vi.fn()]);
    mockUseSearch.mockReturnValue(query.toString());
    setupSWR(
      createPayload({ withCompareBase: true, samePine: false }),
      createListPayload(),
      null,
      createSourceBacktestPayload(),
    );

    const html = renderToStaticMarkup(<StrategyVersionDetail params={{ versionId: 'ver-1' }} />);
    expect(html).toContain('ルール本文を保存');
    expect(html).toContain('保存済みルールから Pine を作り直す');
    expect(html).toContain('この version を複製する');
    expect(html).toContain('<summary class="cursor-pointer font-semibold text-slate-900">その他の version 操作</summary>');
    expect(html).toContain('<summary class="cursor-pointer font-semibold text-slate-900">詳細情報</summary>');
    expect(html).toContain('修正依頼をもとに Pine を再生成');
    expect(html).toContain('Pine 修正再生成には source_pine_script_id が必要です。');
    expect(html).toContain('既存 Pine を元にした修正再生成はできません。');
    expect(html).toContain('既存 Pine の細部を継承するとは限りません。');
    expect(html).toContain('LLM rewrite で作った draft は保存されません。');
    expect(html).toContain('TradingView の compile error や Pine 実装上の微修正に使います。');
    expect(html).toContain('戦略条件そのものを変える場合は、自然言語ルール本文を更新してから Pine を作り直してください。');
    expect(html).toContain('rows="8"');
    expect(html).toContain('rows="6"');
    expect(html).not.toContain('次の検証ノート');
    expect(html).not.toContain('forward validation の確認内容');

    const revisionButton = buttonRenderCalls.find((call) => call.props['data-testid'] === 'pine-regenerate-button');
    expect(revisionButton?.text).toBe('修正依頼をもとに Pine を再生成');
    expect(revisionButton?.props.disabled).toBe(true);
  });

  it('renders available normalized strategy spec without triggering generation', () => {
    mockUseSWR.mockReset();
    mockPostApi.mockReset();
    mockUseLocation.mockReset();
    mockUseLocation.mockReturnValue(['/strategy-versions/ver-1', vi.fn()]);
    setupSWR(
      createPayload({ withCompareBase: true, samePine: false }),
      createListPayload(),
      null,
      null,
      null,
      null,
      null,
      createNormalizedSpecPayload(),
    );

    const html = renderToStaticMarkup(<StrategyVersionDetail params={{ versionId: 'ver-1' }} />);

    expect(html).toContain('構造化ルール spec');
    expect(html).toContain('normalized_strategy_spec');
    expect(html).toContain('source:');
    expect(html).toContain('local_llm');
    expect(html).toContain('fallback');
    expect(html).toContain('trend_following_ma');
    expect(html).toContain('SMA / sma_25');
    expect(html).toContain('RSI / rsi_14');
    expect(html).toContain('終値が25期間SMAを上回る');
    expect(html).toContain('stop_loss: percent 5');
    expect(mockPostApi).not.toHaveBeenCalled();
  });

  it('generates normalized strategy spec only after explicit button click', async () => {
    mockUseSWR.mockReset();
    mockPostApi.mockReset();
    mockUseLocation.mockReset();
    mockUseLocation.mockReturnValue(['/strategy-versions/ver-1', vi.fn()]);
    setupSWR(createPayload({ withCompareBase: true, samePine: false }));
    mockPostApi.mockResolvedValue({
      strategy_version: {
        id: 'ver-1',
        strategy_id: 'str-1',
        status: 'generated',
        market: 'JP_STOCK',
        timeframe: 'D',
        updated_at: '2026-06-01T00:00:00.000Z',
      },
      normalized_spec: createNormalizedSpecPayload().normalized_spec,
      warnings: [],
      assumptions: ['MVPでは long_only として解釈します。'],
    });

    const html = renderToStaticMarkup(<StrategyVersionDetail params={{ versionId: 'ver-1' }} />);
    expect(html).toContain('構造化specはまだありません');
    expect(mockPostApi).not.toHaveBeenCalled();

    const generateButton = buttonRenderCalls.find((call) => call.props['data-testid'] === 'generate-normalized-spec-button');
    expect(generateButton?.text).toBe('構造化specを生成');

    await generateButton?.props.onClick?.();

    expect(mockPostApi).toHaveBeenCalledTimes(1);
    expect(mockPostApi).toHaveBeenCalledWith('/api/strategy-versions/ver-1/normalized-spec/generate', {});
    expect(mockMutateNormalizedSpec).toHaveBeenCalledWith(
      expect.objectContaining({
        strategy_version_id: 'ver-1',
        status: 'available',
        normalized_spec: expect.objectContaining({ schema_name: 'normalized_strategy_spec' }),
      }),
      false,
    );
    expect(mockFetchApi).not.toHaveBeenCalledWith('/api/strategy-versions/ver-1/pine/generation-jobs/pine-job-1');
    expect(mockPostApi.mock.calls.map((call) => call[0])).not.toContain('/api/strategy-versions/ver-1/pine/generation-jobs');
    expect(mockPostApi.mock.calls.map((call) => call[0])).not.toContain('/api/strategy-versions/ver-1/pine/regeneration-jobs');
    expect(mockPostApi.mock.calls.map((call) => call[0])).not.toContain('/api/symbols/sym-1/strategy-applications');
  });

  it('renders implementation alignment section without auto checking', () => {
    mockUseSWR.mockReset();
    mockFetchApi.mockReset();
    mockPostApi.mockReset();
    mockUseLocation.mockReset();
    mockUseLocation.mockReturnValue(['/strategy-versions/ver-1', vi.fn()]);
    setupSWR(
      createPayload({ withCompareBase: true, samePine: false }),
      createListPayload(),
      null,
      null,
      null,
      null,
      null,
      createInternalBacktestReadyNormalizedSpecPayload(),
    );

    const html = renderToStaticMarkup(<StrategyVersionDetail params={{ versionId: 'ver-1' }} />);

    expect(html).toContain('実装整合性チェック');
    expect(html).toContain('Pine script と構造化specが同じ自然言語ルールを同じ意味で表しているか確認します。');
    expect(html).toContain('整合性チェックは未実行です');
    expect(mockFetchApi).not.toHaveBeenCalled();
    expect(mockPostApi).not.toHaveBeenCalled();
  });

  it('checks implementation alignment only after explicit button click', async () => {
    mockUseSWR.mockReset();
    mockFetchApi.mockReset();
    mockPostApi.mockReset();
    mockUseLocation.mockReset();
    mockUseLocation.mockReturnValue(['/strategy-versions/ver-1', vi.fn()]);
    setupSWR(
      createPayload({ withCompareBase: true, samePine: false }),
      createListPayload(),
      null,
      null,
      null,
      null,
      null,
      createInternalBacktestReadyNormalizedSpecPayload(),
    );
    mockFetchApi.mockResolvedValue(createAlignmentPayload());

    renderToStaticMarkup(<StrategyVersionDetail params={{ versionId: 'ver-1' }} />);

    const checkButton = buttonRenderCalls.find((call) => call.props['data-testid'] === 'check-implementation-alignment-button');
    expect(checkButton?.text).toBe('Pineとspecの整合性を確認');
    await checkButton?.props.onClick?.();

    expect(mockFetchApi).toHaveBeenCalledWith('/api/strategy-versions/ver-1/implementation-alignment');
    expect(mockPostApi).not.toHaveBeenCalledWith('/api/strategy-versions/ver-1/pine/generation-jobs', {});
    expect(mockPostApi).not.toHaveBeenCalledWith('/api/strategy-versions/ver-1/normalized-spec/generate', {});
    expect(mockPostApi).not.toHaveBeenCalledWith('/api/strategy-versions/ver-1/internal-backtests', expect.anything());
  });

  it('runs internal backtest only after explicit button click with symbol context', async () => {
    mockUseSWR.mockReset();
    mockPostApi.mockReset();
    mockUseLocation.mockReset();
    const query = new URLSearchParams({
      mode: 'improve_application',
      symbol_id: 'sym-1',
      symbol_code: '7203',
      symbol_name: 'Toyota',
      application_id: 'app-1',
      source_version_id: 'ver-source-1',
      return_to: '/symbols/sym-1',
    });
    mockUseLocation.mockReturnValue(['/strategy-versions/ver-1', vi.fn()]);
    mockUseSearch.mockReturnValue(query.toString());
    setupSWR(
      createPayload({ withCompareBase: true, samePine: false }),
      createListPayload(),
      undefined,
      null,
      null,
      null,
      null,
      createInternalBacktestReadyNormalizedSpecPayload(),
    );
    mockPostApi.mockResolvedValue({
      backtest: {
        id: 'bt-internal-1',
        strategy_version_id: 'ver-1',
        title: 'Internal Backtest',
        execution_source: 'internal_backtest',
        market: 'JP_STOCK',
        timeframe: 'D',
        status: 'succeeded',
        created_at: '2026-06-01T00:00:00.000Z',
        updated_at: '2026-06-01T00:00:00.000Z',
      },
      result_summary: {
        period: { from: '2024-01-01', to: '2024-03-01', bar_count: 40 },
        metrics: {
          trade_count: 3,
          total_return_percent: 4.2,
          profit_factor: 1.5,
          max_drawdown_percent: -2.1,
        },
        warnings: [],
      },
      detail_url: '/backtests/bt-internal-1',
    });

    const html = renderToStaticMarkup(<StrategyVersionDetail params={{ versionId: 'ver-1' }} />);
    expect(html).toContain('内部バックテスト');
    expect(html).toContain('symbol_id:');
    expect(html).toContain('symbol id / code');
    expect(html).toContain('sym-1');
    expect(mockPostApi).not.toHaveBeenCalled();

    const runButton = buttonRenderCalls.find((call) => call.props['data-testid'] === 'run-internal-backtest-button');
    expect(runButton?.text).toBe('内部バックテストを実行');
    expect(runButton?.props.disabled).toBe(false);

    await runButton?.props.onClick?.();

    expect(mockPostApi).toHaveBeenCalledTimes(1);
    expect(mockPostApi).toHaveBeenCalledWith('/api/strategy-versions/ver-1/internal-backtests', {
      symbol_id: 'sym-1',
      initial_capital: 1000000,
    });
    expect(mockPostApi.mock.calls.map((call) => call[0])).not.toContain('/api/strategy-versions/ver-1/pine/generation-jobs');
    expect(mockPostApi.mock.calls.map((call) => call[0])).not.toContain('/api/strategy-versions/ver-1/pine/regeneration-jobs');
    expect(mockPostApi.mock.calls.map((call) => call[0])).not.toContain('/api/symbols/sym-1/strategy-applications');
  });

  it('saves only the natural language rule when clicking the clarified save button', async () => {
    mockUseSWR.mockReset();
    mockUseLocation.mockReset();
    mockUseLocation.mockReturnValue(['/strategy-versions/ver-1', vi.fn()]);
    const payload = createPayload({ withCompareBase: true, samePine: false });
    setupSWR(payload);
    mockPatchApi.mockResolvedValue(payload);

    renderToStaticMarkup(<StrategyVersionDetail params={{ versionId: 'ver-1' }} />);
    const saveButton = buttonRenderCalls.find((call) => call.text === 'ルール本文を保存');
    expect(saveButton).toBeTruthy();

    await saveButton?.props.onClick?.();

    expect(mockPatchApi).toHaveBeenCalledTimes(1);
    expect(mockPatchApi.mock.calls[0]?.[0]).toBe('/api/strategy-versions/ver-1');
    expect(mockPatchApi.mock.calls[0]?.[1]).toEqual({ natural_language_rule: expect.any(String) });
    expect(mockPostApi).not.toHaveBeenCalled();
    expect(mockMutateNormalizedSpec).toHaveBeenCalled();
  });

  it('starts Pine generation job only when clicking the clarified rebuild button', async () => {
    vi.useFakeTimers();
    try {
      mockUseSWR.mockReset();
      mockUseLocation.mockReset();
      mockUseLocation.mockReturnValue(['/strategy-versions/ver-1', vi.fn()]);
      setupSWR(createPayload({ withCompareBase: true, samePine: false }));
      mockPostApi.mockResolvedValue({
        job: {
          id: 'pine-job-1',
          status: 'running',
          current_stage: 'queued',
          stage_history: [],
          error: null,
        },
      });
      mockFetchApi.mockResolvedValue({
        job: {
          id: 'pine-job-1',
          status: 'succeeded',
          current_stage: 'persistence',
          stage_history: [],
          error: null,
        },
      });

      renderToStaticMarkup(<StrategyVersionDetail params={{ versionId: 'ver-1' }} />);
      expect(mockPostApi).not.toHaveBeenCalled();

      const rebuildButton = buttonRenderCalls.find((call) => call.text === '保存済みルールから Pine を作り直す');
      const rebuildPromise = rebuildButton?.props.onClick?.();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(1200);
      await rebuildPromise;

      expect(mockPostApi).toHaveBeenCalledWith('/api/strategy-versions/ver-1/pine/generation-jobs', {});
      expect(mockFetchApi).toHaveBeenCalledWith('/api/strategy-versions/ver-1/pine/generation-jobs/pine-job-1');
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps polling Pine generation jobs beyond the previous short UI timeout', async () => {
    vi.useFakeTimers();
    try {
      mockUseSWR.mockReset();
      mockUseLocation.mockReset();
      mockUseLocation.mockReturnValue(['/strategy-versions/ver-1', vi.fn()]);
      setupSWR(createPayload({ withCompareBase: true, samePine: false }));
      mockPostApi.mockResolvedValue({
        job: {
          id: 'pine-job-1',
          status: 'running',
          current_stage: 'queued',
          stage_history: [],
          error: null,
        },
      });
      let pollCount = 0;
      mockFetchApi.mockImplementation(async () => {
        pollCount += 1;
        return {
          job: {
            id: 'pine-job-1',
            status: pollCount > 181 ? 'succeeded' : 'running',
            current_stage: pollCount > 181 ? 'persistence' : 'generating',
            stage_history: [],
            error: null,
          },
        };
      });

      renderToStaticMarkup(<StrategyVersionDetail params={{ versionId: 'ver-1' }} />);

      const rebuildButton = buttonRenderCalls.find((call) => call.text === '保存済みルールから Pine を作り直す');
      const rebuildPromise = rebuildButton?.props.onClick?.();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(1200 * 182);
      await rebuildPromise;

      expect(pollCount).toBeGreaterThan(180);
      expect(mockFetchApi).toHaveBeenLastCalledWith('/api/strategy-versions/ver-1/pine/generation-jobs/pine-job-1');
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps StrategyVersionDetail usable when source backtest fetch fails', () => {
    mockUseSWR.mockReset();
    mockUseLocation.mockReset();
    const query = new URLSearchParams({
      mode: 'improve_application',
      symbol_id: 'sym-1',
      symbol_code: '7203',
      symbol_name: 'トヨタ自動車',
      source_backtest_id: 'bt-source-1',
      return_to: '/backtests/bt-source-1',
    });
    mockUseLocation.mockReturnValue(['/strategy-versions/ver-1', vi.fn()]);
    mockUseSearch.mockReturnValue(query.toString());
    setupSWR(
      createPayload({ withCompareBase: true, samePine: false }),
      createListPayload(),
      null,
      null,
      new Error('GET /api/backtests/bt-source-1 token stack trace'),
    );

    const html = renderToStaticMarkup(<StrategyVersionDetail params={{ versionId: 'ver-1' }} />);
    expect(html).toContain('rule version 詳細');
    expect(html).toContain('自然言語ルール（編集）');
    expect(html).toContain('元の検証結果メモを取得できませんでした。');
    expect(html).not.toContain('GET /api/backtests');
    expect(html).not.toContain('token stack trace');
    expect(html).not.toContain('検証結果からの改善メモ');
  });

  it('applies improved version only after explicit CTA click', async () => {
    mockUseSWR.mockReset();
    mockPostApi.mockReset();
    mockUseLocation.mockReset();
    mockPostApi.mockResolvedValue({ id: 'new-app-1' });
    const query = new URLSearchParams({
      mode: 'improve_application',
      symbol_id: 'sym-1',
      symbol_code: '7203',
      symbol_name: 'トヨタ自動車',
      application_id: 'old-app-1',
      source_version_id: 'ver-source-1',
      return_to: '/symbols/sym-1?tab=applications&application_id=old-app-1',
    });
    mockUseLocation.mockReturnValue(['/strategy-versions/ver-1', vi.fn()]);
    mockUseSearch.mockReturnValue(query.toString());
    setupSWR(createPayload({ withCompareBase: true, samePine: false }));

    renderToStaticMarkup(<StrategyVersionDetail params={{ versionId: 'ver-1' }} />);

    expect(mockPostApi).not.toHaveBeenCalled();
    const applyButton = buttonRenderCalls.find((call) => call.props['data-testid'] === 'apply-improved-version');
    expect(applyButton?.text).toBe('この銘柄に改善版を適用');

    await applyButton?.props.onClick?.();

    expect(mockPostApi).toHaveBeenCalledTimes(1);
    expect(mockPostApi).toHaveBeenCalledWith('/api/symbols/sym-1/strategy-applications', {
      strategy_id: 'str-1',
      strategy_version_id: 'ver-1',
    });
    const [endpoint, payload] = mockPostApi.mock.calls[0];
    expect(endpoint).not.toContain('archive');
    expect(JSON.stringify(payload)).not.toContain('old-app-1');
  });

  it('does not render apply CTA without improvement context', () => {
    mockUseSWR.mockReset();
    mockPostApi.mockReset();
    mockUseLocation.mockReset();
    mockUseLocation.mockReturnValue(['/strategy-versions/ver-1', vi.fn()]);
    setupSWR(createPayload({ withCompareBase: true, samePine: false }));

    const html = renderToStaticMarkup(<StrategyVersionDetail params={{ versionId: 'ver-1' }} />);

    expect(html).not.toContain('data-testid="apply-improved-version"');
    expect(html).not.toContain('この銘柄に改善版を適用');
    expect(mockPostApi).not.toHaveBeenCalled();
  });

  it('uses sanitized apply failure message instead of raw endpoint details', async () => {
    mockUseSWR.mockReset();
    mockPostApi.mockReset();
    mockUseLocation.mockReset();
    mockPostApi.mockRejectedValue(new Error('409 conflict at /api/symbols/sym-1/strategy-applications model token C:\\Users\\agent\\stack trace'));
    const query = new URLSearchParams({
      mode: 'improve_application',
      symbol_id: 'sym-1',
      symbol_code: '7203',
      symbol_name: 'トヨタ自動車',
    });
    mockUseLocation.mockReturnValue(['/strategy-versions/ver-1', vi.fn()]);
    mockUseSearch.mockReturnValue(query.toString());
    setupSWR(createPayload({ withCompareBase: true, samePine: false }));

    renderToStaticMarkup(<StrategyVersionDetail params={{ versionId: 'ver-1' }} />);
    const applyButton = buttonRenderCalls.find((call) => call.props['data-testid'] === 'apply-improved-version');

    await expect(applyButton?.props.onClick?.()).resolves.toBeUndefined();
    const failureMessage = buildApplyImprovedVersionFailureMessage();
    expect(failureMessage).toContain('適用に失敗しました');
    expect(failureMessage).not.toContain('/api/');
    expect(failureMessage).not.toContain('model');
    expect(failureMessage).not.toContain('token');
    expect(failureMessage).not.toContain('C:\\Users');
    expect(failureMessage).not.toContain('stack trace');
  });

  it('suppresses unsafe improve application query values and unsafe return link', () => {
    mockUseSWR.mockReset();
    mockUseLocation.mockReset();
    const query = new URLSearchParams({
      mode: 'improve_application',
      symbol_id: 'sym-1',
      symbol_code: '7203',
      symbol_name: 'https://endpoint.example.local/model?token=secret',
      application_id: 'app-1',
      source_version_id: 'C:\\Users\\agent\\stack trace',
      return_to: 'https://evil.example/symbols/sym-1?token=secret',
    });
    mockUseLocation.mockReturnValue(['/strategy-versions/ver-1', vi.fn()]);
    mockUseSearch.mockReturnValue(query.toString());
    setupSWR(createPayload({ withCompareBase: true, samePine: false }));

    const html = renderToStaticMarkup(<StrategyVersionDetail params={{ versionId: 'ver-1' }} />);
    expect(html).not.toContain('data-testid="improve-application-banner"');
    expect(html).not.toContain('endpoint.example.local');
    expect(html).not.toContain('token=secret');
    expect(html).not.toContain('C:\\Users');
    expect(html).not.toContain('stack trace');
    expect(html).not.toContain('evil.example');
    expect(html).not.toContain('銘柄ページへ戻る');
  });

  it('keeps banner but omits unsafe source metadata and return_to values', () => {
    mockUseSWR.mockReset();
    mockUseLocation.mockReset();
    const query = new URLSearchParams({
      mode: 'improve_application',
      symbol_id: 'sym-1',
      symbol_code: '7203',
      symbol_name: 'トヨタ自動車',
      application_id: 'secret-token-from-endpoint',
      source_version_id: 'model://provider/version',
      return_to: '//evil.example/symbols/sym-1',
    });
    mockUseLocation.mockReturnValue(['/strategy-versions/ver-1', vi.fn()]);
    mockUseSearch.mockReturnValue(query.toString());
    setupSWR(createPayload({ withCompareBase: true, samePine: false }));

    const html = renderToStaticMarkup(<StrategyVersionDetail params={{ versionId: 'ver-1' }} />);
    expect(html).toContain('data-testid="improve-application-banner"');
    expect(html).toContain('7203 トヨタ自動車 の適用 strategy を改善中');
    expect(html).toContain('source application: <code>-</code>');
    expect(html).toContain('source version: <code>-</code>');
    expect(html).not.toContain('secret-token-from-endpoint');
    expect(html).not.toContain('model://provider/version');
    expect(html).not.toContain('evil.example');
    expect(html).not.toContain('銘柄ページへ戻る');
  });

  it('does not render forward validation note editor controls', () => {
    mockUseSWR.mockReset();
    mockUseLocation.mockReset();
    mockUseLocation.mockReturnValue(['/strategy-versions/ver-1', vi.fn()]);
    setupSWR(createPayload({ withCompareBase: true, samePine: false }));

    const html = renderToStaticMarkup(<StrategyVersionDetail params={{ versionId: 'ver-1' }} />);
    expect(html).not.toContain('次の検証ノート');
    expect(html).not.toContain('placeholder="次に検証したい条件や見直し方針を記録します"');
    expect(html).not.toContain('ノートを保存');
  });

  it('renders pine regenerate controls with lineage summary', () => {
    mockUseSWR.mockReset();
    mockUseLocation.mockReset();
    mockUseLocation.mockReturnValue(['/strategy-versions/ver-1', vi.fn()]);
    setupSWR(
      createPayload({ withCompareBase: true, samePine: false }),
      createListPayload(),
      {
        strategy_rule_version_id: 'ver-1',
        status: 'available',
        pine_script_id: 'pine-2',
        parent_pine_script_id: 'pine-1',
        source_pine_script_id: 'pine-1',
        revision_input_id: 'rev-1',
        generated_script: 'strategy("X")',
        warnings: [],
        latest_revision_input: {
          id: 'rev-1',
          source_pine_script_id: 'pine-1',
          generated_pine_script_id: 'pine-2',
          compile_error_text: 'Undeclared identifier "sma"',
          validation_note: 'entry is late',
          revision_request: 'sma -> ta.sma',
          created_at: new Date().toISOString(),
        },
      },
    );

    const html = renderToStaticMarkup(<StrategyVersionDetail params={{ versionId: 'ver-1' }} />);
    expect(html).toContain('data-testid="strategy-version-copy-pine-button"');
    expect(html).toContain('>コピー<');
    expect(html).toContain('data-testid="pine-regenerate-button"');
    expect(html).toContain('data-testid="pine-lineage-summary"');
    expect(html).toContain('source_pine_script_id: <code>pine-2</code>');
    expect(html).toContain('<strong>parent_pine_script_id:</strong> <code>pine-1</code>');
    expect(html).toContain('<strong>latest_revision_input_id:</strong> <code>rev-1</code>');
    expect(html).toContain('<strong>latest_revision_request:</strong> sma -&gt; ta.sma');
    expect(html).not.toContain('Pine生成中です');
  });

  it('renders Pine generation progress indicator labels', () => {
    const html = renderToStaticMarkup(<PineGenerationProgress currentStage='reviewing' stageHistory={[
      { stage: 'queued', status: 'completed', occurred_at: '2026-05-25T00:00:00.000Z' },
      { stage: 'generating', status: 'completed', occurred_at: '2026-05-25T00:00:01.000Z' },
      { stage: 'reviewing', status: 'running', occurred_at: '2026-05-25T00:00:02.000Z' },
    ]} />);
    expect(html).toContain('data-testid="pine-generation-progress"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('受付');
    expect(html).toContain('LLMでPine生成');
    expect(html).toContain('生成結果レビュー');
    expect(html).toContain('必要に応じて修正');
    expect(html).toContain('最終確認');
    expect(html).not.toContain('raw prompt');
    expect(html).not.toContain('raw provider response');
    expect(html).not.toContain('raw reviewer response');
    expect(html).not.toContain('endpoint');
  });
});

