import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const mockUseSWR = vi.fn();
const mockFetchApi = vi.fn();
const mockPostApi = vi.fn();
const mockPatchApi = vi.fn();
const mockUseLocation = vi.fn();
const mockUseSearch = vi.fn();
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
  buildNaturalLanguageRuleImprovementDraft,
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
) {
  mockUseSWR.mockImplementation((key: string) => {
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
    return { isLoading: false, error: null, mutate: vi.fn(), data: null };
  });
}

describe('StrategyVersionDetail', () => {
  beforeEach(() => {
    buttonRenderCalls.length = 0;
    mockFetchApi.mockReset();
    mockPostApi.mockReset();
    mockPatchApi.mockReset();
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
      return_to: '/backtests/bt-source-1',
    });

    expect(parseImproveApplicationContext(query.toString())).toEqual({
      symbolId: 'sym-1',
      symbolCode: '7203',
      symbolName: 'Toyota',
      applicationId: 'app-1',
      sourceVersionId: 'ver-source-1',
      sourceBacktestId: 'bt-source-1',
      returnTo: '/backtests/bt-source-1',
    });
  });

  it('builds sanitized source backtest improvement memo without raw prompt details', () => {
    const memo = buildSourceBacktestImprovementMemo(createSourceBacktestPayload() as any);
    expect(memo).toContain('source validation report');
    expect(memo).toContain('主要指標');
    expect(memo).toContain('Profit Factor=1.63');
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

  it('builds a replacement natural language rule draft without appending improvement history', () => {
    const draft = buildNaturalLanguageRuleImprovementDraft(
      '既存ルール: SMA 上抜けで entry する。',
      'entry 条件に出来高 filter を追加し、exit と stop loss を分けて検証する。',
    );

    expect(draft).toContain('自然言語ルール本文ドラフト');
    expect(draft).toContain('ベース戦略: 既存ルール: SMA 上抜けで entry する。');
    expect(draft).toContain('entry 条件に出来高 filter を追加');
    expect(draft).not.toContain('---');
    expect(draft).not.toContain('改善案:');
  });

  it('rebuilds replacement natural language rule drafts from saved base rule instead of nesting prior drafts', () => {
    const savedRule = '既存ルール: SMA 上抜けで entry する。';
    const firstDraft = buildNaturalLanguageRuleImprovementDraft(
      savedRule,
      'entry 条件に出来高 filter を追加し、exit と stop loss を分けて検証する。',
    );
    const secondDraft = buildNaturalLanguageRuleImprovementDraft(
      savedRule,
      'entry 条件は RSI 55 以上、exit は SMA 下抜け、risk は 5% stop とする。',
    );

    expect(secondDraft).toContain('ベース戦略: 既存ルール: SMA 上抜けで entry する。');
    expect(secondDraft).toContain('entry 条件は RSI 55 以上');
    expect(secondDraft).not.toContain('ベース戦略: 自然言語ルール本文ドラフト');
    expect(secondDraft).not.toContain('出来高 filter を追加');
    expect(firstDraft).toContain('出来高 filter を追加');
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
    expect(html).toContain('次の検証ノート');
    expect(html).toContain('<strong>現在のノート:</strong> 次回は RSI 55 以上で再検証');
    expect(html).toContain('ノート更新目安:');
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
    expect(html).toContain('<strong>現在のノート:</strong> 未設定');
    expect(html).toContain('<strong>ノート更新目安:</strong> -');
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
    expect(html).toContain('改善案から新しいルール本文を作る');
    expect(html).toContain('改善メモを Pine 修正依頼に反映');
    expect(html).toContain('戦略条件そのものを変える改善は、自然言語ルール本文を単一の最新ルールとして書き換えて保存');
    expect(html).toContain('改善メモは履歴として追記せず');
    expect(html).toContain('Pine 修正依頼は、既存ルールの意図を維持した compile error');
    expect(html).toContain('data-testid="reflect-source-backtest-memo-to-rule"');
    expect(html).toContain('data-testid="reflect-source-backtest-memo"');
    expect(html).not.toContain('raw-result.csv');
    expect(html).not.toContain('raw_prompt');
    expect(html).not.toContain('do not show this prompt');
    expect(html).not.toContain('raw prompt token endpoint');

    expect(mockPostApi).not.toHaveBeenCalled();
    const reflectRuleButton = buttonRenderCalls.find((call) => call.props['data-testid'] === 'reflect-source-backtest-memo-to-rule');
    await reflectRuleButton?.props.onClick?.();
    expect(mockPatchApi).not.toHaveBeenCalled();
    expect(mockPostApi).not.toHaveBeenCalled();

    const reflectRevisionButton = buttonRenderCalls.find((call) => call.props['data-testid'] === 'reflect-source-backtest-memo');
    await reflectRevisionButton?.props.onClick?.();
    expect(mockPostApi).not.toHaveBeenCalled();
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
    expect(html).toContain('修正依頼をもとに Pine を再生成');
    expect(html).toContain('Pine 修正再生成には source_pine_script_id が必要です。');
    expect(html).toContain('既存 Pine を元にした修正再生成はできません。');
    expect(html).toContain('既存 Pine の細部を継承するとは限りません。');
    expect(html).toContain('検証結果をもとに entry / exit / risk 条件を改善する場合は、まず自然言語ルール本文を単一の最新ルール本文として書き換え');
    expect(html).toContain('Pine 修正再生成は既存ルールの意図を保った実装修正に限定');
    expect(html).toContain('戦略条件そのものを変える改善は、自然言語ルール本文側に反映');
    expect(html).toContain('rows="8"');
    expect(html).toContain('rows="6"');

    const revisionButton = buttonRenderCalls.find((call) => call.props['data-testid'] === 'pine-regenerate-button');
    expect(revisionButton?.text).toBe('修正依頼をもとに Pine を再生成');
    expect(revisionButton?.props.disabled).toBe(true);
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

