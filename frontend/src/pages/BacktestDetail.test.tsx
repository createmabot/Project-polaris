import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const mockUseSWR = vi.fn();
const mockPostApi = vi.fn();
let mockLocation = '/backtests/bt-1';
const mockSetLocation = vi.fn();
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
  useLocation: () => [mockLocation, mockSetLocation],
}));

vi.mock('../api/client', async () => {
  const actual = await vi.importActual('../api/client');
  return {
    ...actual,
    postApi: (...args: unknown[]) => mockPostApi(...args),
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

import BacktestDetail, {
  RuleRefinementCandidatesSection,
  buildBacktestImprovementCloneFailureMessage,
  parseBacktestsReturnPath,
} from './BacktestDetail';

describe('parseBacktestsReturnPath', () => {
  it('accepts /backtests with q/page', () => {
    const path = '/backtests/bt-1?return=%2Fbacktests%3Fq%3Dma%26page%3D2';
    expect(parseBacktestsReturnPath(path)).toBe('/backtests?q=ma&page=2');
  });

  it('drops unsupported query keys', () => {
    const path = '/backtests/bt-1?return=%2Fbacktests%3Ffoo%3Dbar';
    expect(parseBacktestsReturnPath(path)).toBe('/backtests');
  });

  it('drops invalid page while keeping valid q', () => {
    const path = '/backtests/bt-1?return=%2Fbacktests%3Fq%3Dma%26page%3Dabc';
    expect(parseBacktestsReturnPath(path)).toBe('/backtests?q=ma');
  });

  it('rejects non-list path and falls back', () => {
    const path = '/backtests/bt-1?return=%2Fbacktests%2F123';
    expect(parseBacktestsReturnPath(path)).toBeNull();
  });

  it('rejects external url or malformed return', () => {
    expect(parseBacktestsReturnPath('/backtests/bt-1?return=https%3A%2F%2Fexample.com')).toBeNull();
    expect(parseBacktestsReturnPath('/backtests/bt-1?return=%E0%A4%A')).toBeNull();
  });
});

describe('BacktestDetail', () => {
  beforeEach(() => {
    buttonRenderCalls.length = 0;
    mockPostApi.mockReset();
    mockSetLocation.mockReset();
  });

  it('renders shared loading state text while fetching detail data', () => {
    mockLocation = '/backtests/bt-loading';
    mockUseSWR.mockReset();
    mockUseSWR.mockReturnValue({
      isLoading: true,
      error: null,
      data: null,
    });

    const html = renderToStaticMarkup(<BacktestDetail params={{ backtestId: 'bt-loading' }} />);
    expect(html).toContain('読み込み中...');
  });

  it('renders shared error state text when detail fetch fails', () => {
    mockLocation = '/backtests/bt-error';
    mockUseSWR.mockReset();
    mockUseSWR.mockReturnValue({
      isLoading: false,
      error: new Error('detail failed'),
      data: null,
    });

    const html = renderToStaticMarkup(<BacktestDetail params={{ backtestId: 'bt-error' }} />);
    expect(html).toContain('エラー: detail failed');
  });

  it('renders parsed summary and uses validated return link', () => {
    mockLocation = '/backtests/bt-1?return=%2Fbacktests%3Fq%3Dma%26page%3D2';
    mockUseSWR.mockReset();
    mockUseSWR.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        backtest: {
          id: 'bt-1',
          strategy_version_id: 'ver-1',
          title: 'テスト',
          execution_source: 'tradingview',
          market: 'JP_STOCK',
          timeframe: 'D',
          status: 'ready',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        used_strategy: {
          strategy_id: 'str-1',
          strategy_version_id: 'ver-1',
          snapshot: {
            strategy_id: 'str-1',
            strategy_version_id: 'ver-1',
            natural_language_rule: '25日移動平均を上抜けで買い',
            generated_pine: 'strategy(\"base\")',
            market: 'JP_STOCK',
            timeframe: 'D',
            warnings: [],
            assumptions: [],
            captured_at: new Date().toISOString(),
          },
        },
        latest_import: {
          id: 'imp-1',
          file_name: 'result.csv',
          file_size: 100,
          content_type: 'text/csv',
          parse_status: 'parsed',
          parse_error: null,
          parsed_summary: {
            totalTrades: 120,
            winRate: 58.2,
            profitFactor: 1.42,
            maxDrawdown: -12.5,
            netProfit: 340000,
            periodFrom: '2025-01-01',
            periodTo: '2025-12-31',
          },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        ai_review: {
          summary_id: 'sum-bt-1',
          title: 'AI総評タイトル',
          body_markdown:
            '## AI総評タイトル\n\n### 結論\n総評\n\n### 良い点\n- 収益性\n\n### 懸念点\n- ドローダウン\n\n### 次に確認すべき点\n- 期間分割検証',
          structured_json: null,
          generated_at: '2026-01-01T00:00:00.000Z',
          status: 'available',
          insufficient_context: false,
        },
        imports: [],
      },
    });

    const html = renderToStaticMarkup(<BacktestDetail params={{ backtestId: 'bt-1' }} />);
    expect(html).toContain('主要指標');
    expect(html).toContain('backtest ID:</strong> <code>bt-1</code>');
    expect(html).toContain('まず「基本情報 / 主指標」を確認し、次に「AI 総評」と「import 履歴」を確認してください。');
    expect(html).toContain('総取引数');
    expect(html).toContain('取引発生期間（開始）');
    expect(html).toContain('2025-01-01');
    expect(html).toContain('取引発生期間（終了）');
    expect(html).toContain('2025-12-31');
    expect(html).not.toContain('検証データ期間（開始）');
    expect(html).toContain('解析成功');
    expect(html).toContain('href="/backtests?q=ma&amp;page=2"');
    expect(html).toContain('AI 総評');
    expect(html).toContain('CSV import / TradingView report の AI summary input は BacktestImport parsed summary、comparison diff、TradingView report 文脈が中心です。');
    expect(html).toContain('CSV import report は、parse_status=parsed になった直後に AI summary 自動生成の対象です。parse failed import は対象外です。');
    expect(html).toContain('job 状態は手動再読み込み時点の read-only 表示です。');
    expect(html).toContain('latest AI summary job');
    expect(html).toContain('最新 AI summary job はまだありません。');
    expect(html).toContain('AI総評を再生成');
    expect(html).toContain('data-testid="regenerate-ai-review"');
    expect(html).toContain('### 結論');
    expect(html).toContain('### 良い点');
    expect(html).toContain('### 懸念点');
    expect(html).toContain('### 次に確認すべき点');
    expect(html).toContain('使用した Strategy');
    expect(html).toContain('href="/strategy-versions/ver-1?return=%2Fstrategies%2Fstr-1%2Fversions%3Fsort%3Dupdated_at%26order%3Ddesc%26page%3D1"');
    expect(html).toContain('href="/strategies/str-1/versions?sort=updated_at&amp;order=desc&amp;page=1"');
    expect(html).toContain('次アクション（Rule Lab）');
    expect(html).toContain('比較可能な run が不足しています。解析済み import が2件以上あると比較できます。');
    expect(html).not.toContain('この検証結果をもとに改善版を作る');
  });

  it('regenerates an available AI review only after explicit click', async () => {
    mockLocation = '/backtests/bt-regen';
    mockUseSWR.mockReset();
    mockPostApi.mockResolvedValue({});
    const mutate = vi.fn();
    mockUseSWR.mockReturnValue({
      isLoading: false,
      error: null,
      mutate,
      data: {
        backtest: {
          id: 'bt-regen',
          strategy_version_id: 'ver-1',
          title: 'トヨタ MA',
          execution_source: 'tradingview',
          market: 'JP_STOCK',
          timeframe: 'D',
          status: 'imported',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        used_strategy: {
          strategy_id: 'str-1',
          strategy_version_id: 'ver-1',
          snapshot: null,
        },
        latest_import: null,
        ai_review: {
          summary_id: 'sum-existing',
          title: '既存AI総評',
          body_markdown: '既存の総評本文',
          structured_json: null,
          generated_at: '2026-01-01T00:00:00.000Z',
          status: 'available',
          insufficient_context: false,
        },
        imports: [],
      },
    });

    renderToStaticMarkup(<BacktestDetail params={{ backtestId: 'bt-regen' }} />);

    expect(mockPostApi).not.toHaveBeenCalled();
    const regenerateButton = buttonRenderCalls.find((call) => call.props['data-testid'] === 'regenerate-ai-review');
    expect(regenerateButton?.text).toBe('AI総評を再生成');

    await regenerateButton?.props.onClick?.();

    expect(mockPostApi).toHaveBeenCalledTimes(1);
    expect(mockPostApi).toHaveBeenCalledWith('/api/backtests/bt-regen/summary/generate', { force: true });
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it('shows AI rule refinement candidates and creates a candidate version only after explicit click', async () => {
    mockLocation = '/backtests/bt-candidates';
    const fullDetailUrl =
      '/strategy-versions/ver-candidate-1?mode=improve_application&symbol_id=sym-1&symbol_code=7203&symbol_name=%E3%83%88%E3%83%A8%E3%82%BF%E8%87%AA%E5%8B%95%E8%BB%8A&application_id=app-1&source_version_id=ver-1&source_backtest_id=bt-candidates&refinement_candidate_id=cand-1&return_to=%2Fbacktests%2Fbt-candidates';
    mockUseSWR.mockReset();
    mockPostApi
      .mockResolvedValueOnce({
        optimization_session: {
          id: 'sess-1',
          candidates: [
            {
              id: 'cand-1',
              candidate_index: 1,
              title: 'entry filterを強化する',
              status: 'proposed',
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        strategy_version: { id: 'ver-candidate-1' },
        refinement_candidate: {
          id: 'cand-1',
          detail_url: fullDetailUrl,
        },
        detail_url: fullDetailUrl,
      });
    mockUseSWR.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        backtest: {
          id: 'bt-candidates',
          strategy_version_id: 'ver-1',
          title: 'candidate source',
          execution_source: 'tradingview',
          market: 'JP_STOCK',
          timeframe: 'D',
          status: 'imported',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        used_strategy: {
          strategy_id: 'str-1',
          strategy_version_id: 'ver-1',
          snapshot: null,
        },
        latest_import: null,
        imports: [],
        ai_review: {
          summary_id: 'sum-candidates',
          title: 'AI総評',
          body_markdown: '改善候補あり',
          structured_json: {
            payload: {
              rule_refinement_candidates: [
                {
                  title: 'entry filterを強化する',
                  target_area: 'entry',
                  rationale: 'PFを改善するため。',
                  change_summary: '出来高filterを追加する。',
                  entry_change: '出来高が20日平均以上の場合のみentryする。',
                  validation_plan: '候補1のPFと勝率を比較する。',
                  expected_metric_effect: {
                    profit_factor: '改善候補',
                  },
                },
              ],
            },
          },
          generated_at: '2026-01-01T00:00:00.000Z',
          status: 'available',
          insufficient_context: false,
        },
      },
    });

    const html = renderToStaticMarkup(<BacktestDetail params={{ backtestId: 'bt-candidates' }} />);
    expect(html).toContain('改善候補');
    expect(html).toContain('候補1: entry filterを強化する');
    expect(html).toContain('出来高filterを追加する。');
    expect(mockPostApi).not.toHaveBeenCalled();

    const button = buttonRenderCalls.find((call) => call.props['data-testid'] === 'create-refinement-candidate-1');
    expect(button).toBeTruthy();
    await button?.props.onClick?.();

    expect(mockPostApi).toHaveBeenNthCalledWith(1, '/api/backtests/bt-candidates/optimization-sessions', { objective_type: 'balanced' });
    expect(mockPostApi).toHaveBeenNthCalledWith(2, '/api/strategy-refinement-candidates/cand-1/create-version', {});
    const navigatedUrl = mockSetLocation.mock.calls[0][0];
    expect(navigatedUrl).toBe(fullDetailUrl);
    const parsedUrl = new URL(navigatedUrl, 'http://localhost');
    expect(parsedUrl.searchParams.get('mode')).toBe('improve_application');
    expect(parsedUrl.searchParams.get('symbol_id')).toBe('sym-1');
    expect(parsedUrl.searchParams.get('symbol_code')).toBe('7203');
    expect(parsedUrl.searchParams.get('source_backtest_id')).toBe('bt-candidates');
    expect(parsedUrl.searchParams.get('refinement_candidate_id')).toBe('cand-1');
  });

  it('shows Optimization Session link with created refinement candidate version links without triggering APIs on render', () => {
    const html = renderToStaticMarkup(
      <RuleRefinementCandidatesSection
        candidates={[
          {
            title: 'entry filterを強化する',
            target_area: 'entry',
            rationale: 'PFを改善するため。',
            change_summary: '出来高filterを追加する。',
            entry_change: '出来高が20日平均以上の場合のみentryする。',
            exit_change: null,
            risk_change: null,
            validation_plan: '候補1のPFと勝率を比較する。',
            expected_metric_effect: {
              profit_factor: '改善候補',
            },
          },
        ]}
        isAiReviewAvailable
        creatingCandidateIndex={null}
        createdCandidateLinks={{ 1: '/strategy-versions/ver-candidate-1?mode=improve_application' }}
        optimizationSessionId="sess-1"
        candidateCreateError={null}
        onCreateCandidateVersion={vi.fn()}
      />,
    );

    expect(html).toContain('作成済み version を開く');
    expect(html).toContain('Optimization Session を開く');
    expect(html).toContain('href="/strategy-optimization-sessions/sess-1"');
    expect(mockPostApi).not.toHaveBeenCalled();
  });

  it('shows parse error on failed parse', () => {
    mockLocation = '/backtests/bt-2';
    mockUseSWR.mockReset();
    mockUseSWR.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        backtest: {
          id: 'bt-2',
          strategy_version_id: 'ver-2',
          title: 'テスト',
          execution_source: 'tradingview',
          market: 'JP_STOCK',
          timeframe: 'D',
          status: 'ready',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        used_strategy: {
          strategy_id: 'str-1',
          strategy_version_id: 'ver-2',
          snapshot: {
            strategy_id: 'str-1',
            strategy_version_id: 'ver-2',
            natural_language_rule: 'RSIで買い',
            generated_pine: null,
            market: 'JP_STOCK',
            timeframe: 'D',
            warnings: ['unsupported'],
            assumptions: [],
            captured_at: new Date().toISOString(),
          },
        },
        latest_import: {
          id: 'imp-2',
          file_name: 'bad.csv',
          file_size: 80,
          content_type: 'text/csv',
          parse_status: 'failed',
          parse_error: 'Missing required columns',
          parsed_summary: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        ai_review: {
          summary_id: null,
          title: null,
          body_markdown: null,
          structured_json: null,
          generated_at: null,
          status: 'unavailable',
          insufficient_context: true,
        },
        latest_ai_summary_job: {
          job_id: 'job-failed',
          status: 'failed',
          trigger: 'csv_import_auto',
          error_message: 'provider failed',
          duration_ms: 2000,
          estimated_cost_usd: 0,
          created_at: '2026-01-02T00:00:00.000Z',
          started_at: '2026-01-02T00:00:00.000Z',
          completed_at: '2026-01-02T00:00:02.000Z',
        },
        imports: [],
      },
    });

    const html = renderToStaticMarkup(<BacktestDetail params={{ backtestId: 'bt-2' }} />);
    expect(html).toContain('解析失敗');
    expect(html).toContain('解析エラー');
    expect(html).toContain('Missing required columns');
    expect(html).toContain('AI総評は未生成です。');
    expect(html).toContain('latest AI summary job');
    expect(html).toContain('CSV import auto');
    expect(html).toContain('最新 AI summary job は failed です。自動 retry は行いません。必要な場合は下の手動生成ボタンで再試行してください。');
    expect(html).toContain('失敗理由は provider error の詳細を出しすぎない範囲で扱います。必要なら手動生成で retry してください。');
    expect(html).toContain('自動生成が未完了、queued / running 中、または provider failure により failed job として残っている可能性があります。');
    expect(html).toContain('failed の場合も、既存の「AI総評を生成」から手動生成 / 再生成に進めます。');
    expect(html).toContain('AI総評を生成');
  });

  it('shows helper text when latest import is failed but parsed imports exist', () => {
    mockLocation = '/backtests/bt-failed-with-history';
    mockUseSWR.mockReset();
    mockUseSWR.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        backtest: {
          id: 'bt-failed-with-history',
          strategy_version_id: 'ver-2',
          title: 'テスト',
          execution_source: 'tradingview',
          market: 'JP_STOCK',
          timeframe: 'D',
          status: 'ready',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        used_strategy: {
          strategy_id: 'str-1',
          strategy_version_id: 'ver-2',
          snapshot: null,
        },
        latest_import: {
          id: 'imp-failed',
          file_name: 'bad.csv',
          file_size: 80,
          content_type: 'text/csv',
          parse_status: 'failed',
          parse_error: 'Missing required columns',
          parsed_summary: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        ai_review: {
          summary_id: null,
          title: null,
          body_markdown: null,
          structured_json: null,
          generated_at: null,
          status: 'unavailable',
          insufficient_context: true,
        },
        imports: [
          {
            id: 'imp-failed',
            backtest_id: 'bt-failed-with-history',
            file_name: 'bad.csv',
            file_size: 80,
            content_type: 'text/csv',
            parse_status: 'failed',
            parse_error: 'Missing required columns',
            parsed_summary: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: 'imp-parsed-1',
            backtest_id: 'bt-failed-with-history',
            file_name: 'good.csv',
            file_size: 100,
            content_type: 'text/csv',
            parse_status: 'parsed',
            parse_error: null,
            parsed_summary: {
              totalTrades: 100,
              winRate: 50,
              profitFactor: 1.2,
              maxDrawdown: -10,
              netProfit: 100000,
              periodFrom: '2025-01-01',
              periodTo: '2025-12-31',
            },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      },
    });

    const html = renderToStaticMarkup(<BacktestDetail params={{ backtestId: 'bt-failed-with-history' }} />);
    expect(html).toContain('解析失敗');
    expect(html).toContain('解析成功済みの取込:</strong> 1 件');
    expect(html).toContain('失敗した取込:</strong> 1 件');
    expect(html).toContain('最新のCSV取込は失敗しましたが、過去に解析成功した取込結果があります。');
  });

  it('falls back to /backtests when return query is absent', () => {
    mockLocation = '/backtests/bt-3';
    mockUseSWR.mockReset();
    mockUseSWR.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        backtest: {
          id: 'bt-3',
          strategy_version_id: 'ver-3',
          title: 'テスト',
          execution_source: 'tradingview',
          market: 'JP_STOCK',
          timeframe: 'D',
          status: 'ready',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        used_strategy: {
          strategy_id: null,
          strategy_version_id: null,
          snapshot: null,
        },
        latest_import: null,
        ai_review: {
          summary_id: null,
          title: null,
          body_markdown: null,
          structured_json: null,
          generated_at: null,
          status: 'unavailable',
          insufficient_context: true,
        },
        imports: [],
      },
    });

    const html = renderToStaticMarkup(<BacktestDetail params={{ backtestId: 'bt-3' }} />);
    expect(html).toContain('href="/backtests"');
  });

  it('renders inline comparison when parsed imports are at least two', () => {
    mockLocation = '/backtests/bt-4';
    mockUseSWR.mockReset();
    mockUseSWR.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        backtest: {
          id: 'bt-4',
          strategy_version_id: 'ver-4',
          title: '比較テスト',
          execution_source: 'tradingview',
          market: 'JP_STOCK',
          timeframe: 'D',
          status: 'ready',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        used_strategy: {
          strategy_id: 'str-1',
          strategy_version_id: 'ver-4',
          snapshot: null,
        },
        latest_import: null,
        ai_review: {
          summary_id: null,
          title: null,
          body_markdown: null,
          structured_json: null,
          generated_at: null,
          status: 'unavailable',
          insufficient_context: true,
        },
        imports: [
          {
            id: 'imp-compare-base',
            backtest_id: 'bt-4',
            file_name: 'a.csv',
            file_size: 100,
            content_type: 'text/csv',
            parse_status: 'parsed',
            parse_error: null,
            parsed_summary: {
              totalTrades: 100,
              winRate: 50,
              profitFactor: 1.2,
              maxDrawdown: -10,
              netProfit: 100000,
              periodFrom: '2025-01-01',
              periodTo: '2025-12-31',
            },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: 'imp-compare-target',
            backtest_id: 'bt-4',
            file_name: 'b.csv',
            file_size: 100,
            content_type: 'text/csv',
            parse_status: 'parsed',
            parse_error: null,
            parsed_summary: {
              totalTrades: 120,
              winRate: 55,
              profitFactor: 1.4,
              maxDrawdown: -12,
              netProfit: 140000,
              periodFrom: '2025-01-01',
              periodTo: '2025-12-31',
            },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      },
    });

    const html = renderToStaticMarkup(<BacktestDetail params={{ backtestId: 'bt-4' }} />);
    expect(html).toContain('バックテスト比較 inline');
    expect(html).toContain('比較元 run');
    expect(html).toContain('比較対象 run');
    expect(html).toContain('差分（対象-元）');
    expect(html).toContain('この2件で比較を保存する');
    expect(html).toContain('imp-compare-base');
    expect(html).toContain('imp-compare-target');
    expect(html).toContain('+20.00');
  });

  it('restores saved comparison summary from comparisonId query', () => {
    mockLocation = '/backtests/bt-5?comparisonId=cmp-1';
    mockUseSWR.mockReset();
    mockUseSWR.mockImplementation((key: string | null) => {
      if (key === '/api/backtest-comparisons/cmp-1') {
        return {
          isLoading: false,
          error: null,
          data: {
            comparison: {
              comparison_id: 'cmp-1',
              base_backtest_id: 'bt-5',
              base_import_id: 'imp-base',
              target_backtest_id: 'bt-5',
              target_import_id: 'imp-target',
              metrics_diff: {
                schema_version: '1.0',
                total_trades_diff: 2,
                win_rate_diff_pt: 3.5,
                profit_factor_diff: 0.2,
                max_drawdown_diff: -0.8,
                net_profit_diff: 12000,
              },
              tradeoff_summary: '- 総取引数差分: +2',
              ai_summary: 'AI比較総評',
              created_at: new Date().toISOString(),
            },
          },
        };
      }

      return {
        isLoading: false,
        error: null,
        data: {
          backtest: {
            id: 'bt-5',
            strategy_version_id: 'ver-5',
            title: '比較保存確認',
            execution_source: 'tradingview',
            market: 'JP_STOCK',
            timeframe: 'D',
            status: 'ready',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          used_strategy: {
            strategy_id: 'str-1',
            strategy_version_id: 'ver-5',
            snapshot: null,
          },
          latest_import: null,
          ai_review: {
            summary_id: null,
            title: null,
            body_markdown: null,
            structured_json: null,
            generated_at: null,
            status: 'unavailable',
            insufficient_context: true,
          },
          imports: [
            {
              id: 'imp-base',
              backtest_id: 'bt-5',
              file_name: 'a.csv',
              file_size: 100,
              content_type: 'text/csv',
              parse_status: 'parsed',
              parse_error: null,
              parsed_summary: {
                totalTrades: 10,
                winRate: 45,
                profitFactor: 1.1,
                maxDrawdown: -6,
                netProfit: 50000,
                periodFrom: '2025-01-01',
                periodTo: '2025-12-31',
              },
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            {
              id: 'imp-target',
              backtest_id: 'bt-5',
              file_name: 'b.csv',
              file_size: 100,
              content_type: 'text/csv',
              parse_status: 'parsed',
              parse_error: null,
              parsed_summary: {
                totalTrades: 12,
                winRate: 48.5,
                profitFactor: 1.3,
                maxDrawdown: -6.8,
                netProfit: 62000,
                periodFrom: '2025-01-01',
                periodTo: '2025-12-31',
              },
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ],
        },
      };
    });

    const html = renderToStaticMarkup(<BacktestDetail params={{ backtestId: 'bt-5' }} />);
    expect(html).toContain('保存済み比較（要約）');
    expect(html).toContain('比較ID:');
    expect(html).toContain('AI比較総評');
    expect(html).toContain('href="/backtest-comparisons/cmp-1"');
  });

  it('renders symbol strategy application backlink when present', () => {
    mockLocation = '/backtests/bt-application';
    mockUseSWR.mockReset();
    mockUseSWR.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        backtest: {
          id: 'bt-application',
          strategy_version_id: 'ver-1',
          title: 'application report',
          execution_source: 'tradingview',
          market: 'JP_STOCK',
          timeframe: 'D',
          status: 'imported',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        used_strategy: {
          strategy_id: 'str-1',
          strategy_version_id: 'ver-1',
          snapshot: null,
        },
        latest_import: null,
        ai_review: {
          summary_id: null,
          title: null,
          body_markdown: null,
          structured_json: null,
          generated_at: null,
          status: 'unavailable',
          insufficient_context: true,
        },
        imports: [],
        symbol_strategy_application: {
          application_id: 'app-1',
          application_status: 'active',
          application_source: 'manual',
          application_memo: 'watch for breakout',
          application_created_at: '2026-01-01T00:00:00.000Z',
          application_updated_at: '2026-01-02T00:00:00.000Z',
          run_id: 'run-1',
          run_type: 'csv_import',
          run_status: 'succeeded',
          run_created_at: '2026-01-01T01:00:00.000Z',
          run_updated_at: '2026-01-02T01:00:00.000Z',
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
            id: 'ver-1',
            market: 'JP_STOCK',
            timeframe: 'D',
          },
          current_report: {
            backtest_id: 'bt-application',
            title: 'application report',
            execution_source: 'tradingview',
            status: 'imported',
            run_type: 'csv_import',
            run_status: 'succeeded',
            updated_at: '2026-01-02T00:00:00.000Z',
            metrics: {
              period_from: '2024-01-01',
              period_to: '2025-12-31',
              trade_count: 120,
              total_return_percent: null,
              price_change_percent: null,
              max_drawdown_percent: -8.2,
              profit_factor: 1.42,
              win_rate: 48.5,
            },
            ai_review: {
              summary_id: 'sum-current',
              title: 'CSV import AI summary',
              body_markdown: 'CSV import summary says external validation risk is low.',
              structured_json: null,
              generated_at: '2026-01-04T00:00:00.000Z',
              status: 'available',
              insufficient_context: false,
            },
          },
          related_reports: [
            {
              backtest_id: 'bt-internal',
              title: 'internal related report',
              execution_source: 'internal_backtest',
              status: 'completed',
              run_type: 'internal_backtest',
              run_status: 'succeeded',
              updated_at: '2026-01-03T00:00:00.000Z',
              metrics: {
                period_from: '2024-01-01',
                period_to: '2025-12-31',
                trade_count: 4,
                total_return_percent: 12.3,
                price_change_percent: 10.5,
                max_drawdown_percent: -4.2,
                profit_factor: 1.8,
                win_rate: 55,
              },
              ai_review: {
                summary_id: 'sum-related',
                title: 'Internal backtest AI summary',
                body_markdown: 'Internal summary says engine result has a stronger simulated profile.',
                structured_json: null,
                generated_at: '2026-01-05T00:00:00.000Z',
                status: 'available',
                insufficient_context: false,
              },
            },
          ],
        },
      },
    });

    const html = renderToStaticMarkup(<BacktestDetail params={{ backtestId: 'bt-application' }} />);
    expect(html).toContain('銘柄起点の適用情報');
    expect(html).toContain('この検証レポートは、保存済み Symbol Strategy Application の run から作成されています。');
    expect(html).toContain('application ID:</strong> <code>app-1</code>');
    expect(html).toContain('status:</strong>');
    expect(html).toContain('active');
    expect(html).toContain('source:</strong> <code>manual</code>');
    expect(html).toContain('memo:</strong> watch for breakout');
    expect(html).toContain('run ID:</strong> <code>run-1</code>');
    expect(html).toContain('run status:</strong>');
    expect(html).toContain('succeeded');
    expect(html).toContain('market_code:</strong> <code>JP</code>');
    expect(html).toContain('strategy ID:</strong> <code>str-1</code>');
    expect(html).toContain('market / timeframe:</strong> JP_STOCK / D');
    expect(html).toContain('href="/symbols/sym-1"');
    expect(html).toContain('SymbolDetail に戻る');
    expect(html).toContain('href="/strategies/str-1"');
    expect(html).toContain('StrategyDetail に戻る');
    expect(html).toContain('href="/strategy-versions/ver-1"');
    expect(html).toContain('StrategyVersionDetail に戻る');
    expect(html).toContain('この検証結果をもとに改善版を作る');
    expect(html).toContain('data-testid="create-improved-version-from-backtest"');
    expect(html).toContain('同じ application の関連レポート');
    expect(html).toContain('internal related report');
    expect(html).toContain('href="/backtests/bt-internal"');
    expect(html).toContain('report type:</strong> internal backtest report');
    expect(html).toContain('source:</strong> <code>internal_backtest</code>');
    expect(html).toContain('metrics 横並び比較');
    expect(html).toContain('CSV import report は BacktestImport parsed summary、internal backtest report は strategySnapshotJson.result_summary 由来です。');
    expect(html).toContain('`-` は取得元に該当 metric がないことを示します。');
    expect(html).toContain('current report');
    expect(html).toContain('related report');
    expect(html).toContain('metrics root:</strong> BacktestImport parsed summary');
    expect(html).toContain('metrics root:</strong> strategySnapshotJson.result_summary');
    expect(html).toContain('trade_count');
    expect(html).toContain('120');
    expect(html).toContain('total_return_percent');
    expect(html).toContain('12.3');
    expect(html).toContain('AI summary 横並び確認');
    expect(html).toContain('保存済み AI summary を read-only に並べます');
    expect(html).toContain('current report AI summary');
    expect(html).toContain('related report AI summary');
    expect(html).toContain('CSV import AI summary');
    expect(html).toContain('Internal backtest AI summary');
    expect(html).toContain('CSV import summary says external validation risk is low.');
    expect(html).toContain('Internal summary says engine result has a stronger simulated profile.');
  });

  it('clones source strategy version for improvement only after explicit BacktestDetail click', async () => {
    mockLocation = '/backtests/bt-application';
    mockUseSWR.mockReset();
    mockPostApi.mockResolvedValue({
      strategy_version: {
        id: 'ver-cloned',
        strategy_id: 'str-1',
        natural_language_rule: 'rule',
        market: 'JP_STOCK',
        timeframe: 'D',
        status: 'draft',
        normalized_rule_json: {},
        generated_pine: null,
        forward_validation_note: null,
        forward_validation_note_updated_at: null,
        warnings: [],
        assumptions: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      compare_base: null,
    });
    mockUseSWR.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        backtest: {
          id: 'bt-application',
          strategy_version_id: 'ver-source',
          title: 'application report',
          execution_source: 'tradingview',
          market: 'JP_STOCK',
          timeframe: 'D',
          status: 'imported',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        used_strategy: {
          strategy_id: 'str-1',
          strategy_version_id: 'ver-source',
          snapshot: null,
        },
        latest_import: null,
        ai_review: {
          summary_id: null,
          title: null,
          body_markdown: null,
          structured_json: null,
          generated_at: null,
          status: 'unavailable',
          insufficient_context: true,
        },
        imports: [],
        symbol_strategy_application: {
          application_id: 'app-1',
          application_status: 'active',
          application_source: 'manual',
          application_memo: null,
          application_created_at: '2026-01-01T00:00:00.000Z',
          application_updated_at: '2026-01-02T00:00:00.000Z',
          run_id: 'run-1',
          run_type: 'csv_import',
          run_status: 'succeeded',
          run_created_at: '2026-01-01T01:00:00.000Z',
          run_updated_at: '2026-01-02T01:00:00.000Z',
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
            id: 'ver-source',
            market: 'JP_STOCK',
            timeframe: 'D',
          },
          current_report: null,
          related_reports: [],
        },
      },
    });

    renderToStaticMarkup(<BacktestDetail params={{ backtestId: 'bt-application' }} />);

    expect(mockPostApi).not.toHaveBeenCalled();
    const improveButton = buttonRenderCalls.find((call) => call.props['data-testid'] === 'create-improved-version-from-backtest');
    expect(improveButton?.text).toBe('この検証結果をもとに改善版を作る');

    await improveButton?.props.onClick?.();

    expect(mockPostApi).toHaveBeenCalledTimes(1);
    expect(mockPostApi).toHaveBeenCalledWith('/api/strategy-versions/ver-source/clone', {});
    const navigatedTo = mockSetLocation.mock.calls[0]?.[0] as string;
    expect(navigatedTo).toContain('/strategy-versions/ver-cloned?');
    expect(navigatedTo).toContain('mode=improve_application');
    expect(navigatedTo).toContain('symbol_id=sym-1');
    expect(navigatedTo).toContain('symbol_code=7203');
    expect(navigatedTo).toContain('symbol_name=Toyota');
    expect(navigatedTo).toContain('application_id=app-1');
    expect(navigatedTo).toContain('source_version_id=ver-source');
    expect(navigatedTo).toContain('source_backtest_id=bt-application');
    expect(navigatedTo).toContain('return_to=%2Fbacktests%2Fbt-application');
    expect(navigatedTo).not.toContain('raw');
    expect(navigatedTo).not.toContain('token');
  });

  it('uses sanitized BacktestDetail improvement clone failure text', () => {
    const message = buildBacktestImprovementCloneFailureMessage();
    expect(message).toContain('改善版の作成に失敗しました');
    expect(message).not.toContain('/api/');
    expect(message).not.toContain('model');
    expect(message).not.toContain('token');
    expect(message).not.toContain('C:\\Users');
    expect(message).not.toContain('stack trace');
  });

  it('renders internal backtest report without imports', () => {
    mockLocation = '/backtests/bt-internal';
    mockUseSWR.mockReset();
    mockUseSWR.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        backtest: {
          id: 'bt-internal',
          strategy_version_id: 'ver-1',
          title: 'internal report',
          execution_source: 'internal_backtest',
          market: 'JP_STOCK',
          timeframe: 'D',
          status: 'completed',
          created_at: '2026-05-01T00:00:00.000Z',
          updated_at: '2026-05-01T00:00:00.000Z',
        },
        used_strategy: {
          strategy_id: 'str-1',
          strategy_version_id: 'ver-1',
          snapshot: {
            strategy_id: 'str-1',
            strategy_version_id: 'ver-1',
            natural_language_rule: '25?????????????',
            generated_pine: 'strategy("base")',
            market: 'JP_STOCK',
            timeframe: 'D',
            warnings: [],
            assumptions: [],
            captured_at: '2026-05-01T00:00:00.000Z',
            execution_source: 'internal_backtest',
            internal_backtest_execution_id: 'exec-1',
            result_summary: {
              summary_kind: 'internal_backtest_v1',
              period: {
                from: '2025-01-01',
                to: '2025-12-31',
                bar_count: 245,
              },
              trade_period: {
                first_entry_at: '2025-02-03T00:00:00.000Z',
                last_exit_at: '2025-11-28T00:00:00.000Z',
                first_trade_at: '2025-02-03T00:00:00.000Z',
                last_trade_at: '2025-11-28T00:00:00.000Z',
              },
              metrics: {
                total_trades: 12,
                trade_count: 12,
                win_rate: 58.33,
                profit_factor: 1.42,
                max_drawdown: 120000,
                max_drawdown_percent: 8.5,
                net_profit: 340000,
                total_return_percent: 34,
                average_trade: 28333.33,
                gross_profit: 520000,
                gross_loss: -180000,
                price_change_percent: 12.34,
                range_percent: 26.32,
              },
            },
            artifact_pointer: {
              kind: 'internal_backtest_result',
              type: 'json',
              execution_id: 'exec-1',
              path: '/internal-backtests/executions/exec-1',
              summary_mode: 'engine_estimated',
            },
            reported_at: '2026-05-01T01:00:00.000Z',
          },
        },
        latest_import: null,
        ai_review: {
          summary_id: null,
          title: null,
          body_markdown: null,
          structured_json: null,
          generated_at: null,
          status: 'unavailable',
          insufficient_context: true,
        },
        imports: [],
        symbol_strategy_application: {
          application_id: 'app-1',
          application_status: 'active',
          application_source: 'manual',
          application_memo: null,
          application_created_at: '2026-05-01T00:00:00.000Z',
          application_updated_at: '2026-05-01T00:00:00.000Z',
          run_id: 'run-1',
          run_type: 'internal_backtest',
          run_status: 'succeeded',
          run_created_at: '2026-05-01T00:10:00.000Z',
          run_updated_at: '2026-05-01T00:10:00.000Z',
          symbol: {
            id: 'sym-1',
            symbol: 'TSE:2148',
            symbol_code: '2148',
            market_code: 'JP',
            tradingview_symbol: 'TSE:2148',
            display_name: 'Sample Corp',
          },
          strategy: {
            id: 'str-1',
            title: 'Breakout strategy',
          },
          strategy_version: {
            id: 'ver-1',
            market: 'JP_STOCK',
            timeframe: 'D',
          },
        },
      },
    });

    const html = renderToStaticMarkup(<BacktestDetail params={{ backtestId: 'bt-internal' }} />);
    expect(html).toContain('internal backtest report');
    expect(html).toContain('BacktestImport');
    expect(html).toContain('exec-1');
    expect(html).toContain('internal_backtest_v1');
    expect(html).toContain('bar_count');
    expect(html).toContain('245');
    expect(html).toContain('主要指標');
    expect(html).toContain('総取引数');
    expect(html).toContain('12');
    expect(html).toContain('勝率');
    expect(html).toContain('58.33%');
    expect(html).toContain('Profit Factor');
    expect(html).toContain('1.42');
    expect(html).toContain('最大ドローダウン');
    expect(html).toContain('120,000');
    expect(html).toContain('最大ドローダウン率');
    expect(html).toContain('8.50%');
    expect(html).toContain('純利益');
    expect(html).toContain('340,000');
    expect(html).toContain('総リターン率');
    expect(html).toContain('34.00%');
    expect(html).toContain('検証データ期間（開始）');
    expect(html).toContain('2025-01-01');
    expect(html).toContain('検証データ期間（終了）');
    expect(html).toContain('2025-12-31');
    expect(html).toContain('取引発生期間（開始）');
    expect(html).toContain('2025-02-03T00:00:00.000Z');
    expect(html).toContain('取引発生期間（終了）');
    expect(html).toContain('2025-11-28T00:00:00.000Z');
    expect(html).toContain('data period from');
    expect(html).toContain('trade period from');
    expect(html).toContain('artifact_pointer');
    expect(html).toContain('internal_backtest_result');
    expect(html).toContain('artifact path は非表示化し、artifact file の実体読込、download、diff は行いません。');
    expect(html).toContain('type');
    expect(html).toContain('json');
    expect(html).toContain('path');
    expect(html).toContain('非表示（artifact path）');
    expect(html).not.toContain('/internal-backtests/executions/exec-1');
    expect(html).toContain('summary_mode');
    expect(html).toContain('raw artifact JSON は保存済み pointer metadata の確認用です。path 系 metadata は非表示化し、file 内容の読み込み、download、JSON diff は後続判断です。');
    expect(html).toContain('raw artifact JSON');
    expect(html).toContain('internal_backtest report の AI summary input は strategySnapshotJson.result_summary / artifact_pointer / internal_backtest_execution_id が中心です。');
    expect(html).toContain('internal backtest report は、新規 report conversion 完了直後に AI summary 自動生成の対象です。');
  });

  it('shows a neutral message when internal backtest artifact is missing', () => {
    mockLocation = '/backtests/bt-internal-no-artifact';
    mockUseSWR.mockReset();
    mockUseSWR.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        backtest: {
          id: 'bt-internal-no-artifact',
          strategy_version_id: 'ver-1',
          title: 'internal report',
          execution_source: 'internal_backtest',
          market: 'JP_STOCK',
          timeframe: 'D',
          status: 'completed',
          created_at: '2026-05-01T00:00:00.000Z',
          updated_at: '2026-05-01T00:00:00.000Z',
        },
        used_strategy: {
          strategy_id: 'str-1',
          strategy_version_id: 'ver-1',
          snapshot: {
            strategy_id: 'str-1',
            strategy_version_id: 'ver-1',
            natural_language_rule: 'rule',
            generated_pine: null,
            market: 'JP_STOCK',
            timeframe: 'D',
            warnings: [],
            assumptions: [],
            captured_at: '2026-05-01T00:00:00.000Z',
            execution_source: 'internal_backtest',
            internal_backtest_execution_id: 'exec-no-artifact',
            result_summary: {
              summary_kind: 'engine_estimated',
              period: {
                from: '2025-01-01',
                to: '2025-12-31',
              },
              metrics: {
                bar_count: 245,
              },
            },
            artifact_pointer: null,
            reported_at: '2026-05-01T01:00:00.000Z',
          },
        },
        latest_import: null,
        ai_review: {
          summary_id: null,
          title: null,
          body_markdown: null,
          structured_json: null,
          generated_at: null,
          status: 'unavailable',
          insufficient_context: true,
        },
        imports: [],
        symbol_strategy_application: null,
      },
    });

    const html = renderToStaticMarkup(<BacktestDetail params={{ backtestId: 'bt-internal-no-artifact' }} />);
    expect(html).toContain('internal backtest report');
    expect(html).toContain('artifact metadata は未生成、または strategy snapshot に保存されていません。');
  });
});
