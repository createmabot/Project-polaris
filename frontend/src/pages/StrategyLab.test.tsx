import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const mockUseSWR = vi.fn();
const mockUseLocation = vi.fn();
const mockUseState = vi.fn();
const renderedButtons: Array<{
  children: React.ReactNode;
  onClick?: () => void | Promise<void>;
  disabled?: boolean;
}> = [];

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    useState: (...args: unknown[]) => mockUseState(...args),
  };
});

vi.mock('swr', () => ({
  default: (...args: unknown[]) => mockUseSWR(...args),
}));

vi.mock('wouter', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  useLocation: () => mockUseLocation(),
}));

vi.mock('../components/ui/Button', () => ({
  default: ({ children, onClick, disabled }: {
    children: React.ReactNode;
    onClick?: () => void | Promise<void>;
    disabled?: boolean;
  }) => {
    renderedButtons.push({ children, onClick, disabled });
    return <button disabled={disabled} onClick={onClick}>{children}</button>;
  },
}));

vi.mock('../api/client', async () => {
  const actual = await vi.importActual('../api/client');
  return {
    ...actual,
    postApi: vi.fn(),
  };
});

import StrategyLab from './StrategyLab';
import { ApiError, postApi } from '../api/client';
import { buildProposalErrorMessage } from './StrategyLab';

const DEFAULT_RULE =
  '25日移動平均線の上で、RSIが50以上、出来高が20日平均の1.5倍以上で買い。終値が5日線を下回ったら手仕舞い。';

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

function primeDefaultState() {
  mockUseState.mockReset();
  mockUseState.mockImplementation((initial: unknown) => [initial, vi.fn()]);
}

function primeScenarioState(params: {
  result?: Record<string, unknown> | null;
  strategyId?: string | null;
  backtest?: Record<string, unknown> | null;
  importState?: Record<string, unknown> | null;
  importError?: string | null;
  proposalData?: Record<string, unknown> | null;
  proposalError?: string | null;
  selectedProposalRunId?: string | null;
  proposalSelectionError?: string | null;
  selectingProposalCandidateId?: string | null;
  setters?: Array<ReturnType<typeof vi.fn>>;
}) {
  mockUseState.mockReset();
  const setters = params.setters ?? Array.from({ length: 22 }).map(() => vi.fn());
  const values = [
    '監視銘柄比較ルール',
    DEFAULT_RULE,
    'JP_STOCK',
    'D',
    'balanced',
    'any',
    params.proposalData ?? null,
    params.proposalError ?? null,
    false,
    params.selectedProposalRunId ?? null,
    params.proposalSelectionError ?? null,
    params.selectingProposalCandidateId ?? null,
    false,
    null,
    params.result ?? null,
    params.strategyId ?? null,
    params.backtest ?? null,
    null,
    params.importState ?? null,
    params.importError ?? null,
    false,
    null,
  ];
  values.forEach((value, index) => {
    mockUseState.mockImplementationOnce(() => [value, setters[index]]);
  });
  return setters;
}

describe('StrategyLab', () => {
  beforeEach(() => {
    renderedButtons.length = 0;
    mockUseSWR.mockReset();
    mockUseLocation.mockReset();
    mockUseLocation.mockReturnValue(['/strategy-lab', vi.fn()]);
    vi.mocked(postApi).mockReset();
  });

  it('appends sanitized provider observation details to proposal errors', () => {
    const message = buildProposalErrorMessage(new ApiError(
      'provider failed with raw diagnostics',
      'PROVIDER_INVALID_RESPONSE',
      {
        provider_observation: {
          status: 'timeout',
          invalid_reason: 'timeout',
          latency_bucket: 'timeout',
          fallback_used: false,
          provider_name: 'local_llm',
          model_category: 'configured',
        },
      },
      502,
    ));

    expect(message).toContain('サーバー側で候補取得に失敗しました。時間をおいて再試行してください。');
    expect(message).toContain('provider status: timeout / reason: timeout / latency: timeout');
    expect(message).not.toContain('raw diagnostics');
    expect(message).not.toContain('local_llm');
    expect(message).not.toContain('configured');
  });

  it('renders initial guidance and core actions', () => {
    primeDefaultState();
    mockUseSWR.mockReturnValue({
      isLoading: false,
      error: null,
      data: null,
      mutate: vi.fn(),
    });

    const html = renderToStaticMarkup(<StrategyLab />);
    expect(html).toContain('ホームへ戻る');
    expect(html).toContain('履歴一覧を見る');
    expect(html).toContain('ルール検証ラボ');
    expect(html).toContain('自然言語ルールから Pine を生成し、その後 TradingView の検証CSVを取り込んで parse 状態を確認します。');
    expect(html).toContain('ストラテジー候補の提案');
    expect(html).toContain('候補は検証用のたたき台です。売買推奨ではありません。');
    expect(html).toContain('リスク設定');
    expect(html).toContain('戦略タイプ');
    expect(html).toContain('ストラテジーを提案');
    expect(html).toContain('最近の提案');
    expect(html).toContain('戦略タイトル');
    expect(html).toContain('自然言語ルール');
    expect(html).toContain('市場');
    expect(html).toContain('時間足');
    expect(html).toContain(DEFAULT_RULE);
    expect(html).toContain('保存してPine生成');
    expect(html).toContain('日本語入力中心 / 日足(D)中心 / long_only');
  });

  it('renders generated result texts when generation has succeeded', () => {
    primeScenarioState({
      strategyId: 'str-1',
      backtest: {
        id: 'bt-1',
      },
      result: {
        id: 'ver-1',
        status: 'generated',
        warnings: ['未対応条件を無視しました'],
        assumptions: ['long_only を前提にしました'],
        generated_pine: 'strategy("test")',
      },
    });
    mockUseSWR.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        strategy_versions: [],
      },
      mutate: vi.fn(),
    });

    const html = renderToStaticMarkup(<StrategyLab />);
    expect(html).toContain('生成結果');
    expect(html).toContain('strategy_id:');
    expect(html).toContain('version_id:');
    expect(html).toContain('status:');
    expect(html).toContain('backtest_id:');
    expect(html).toContain('version 一覧を開く');
    expect(html).toContain('この version 詳細を開く');
    expect(html).toContain('warnings');
    expect(html).toContain('assumptions');
    expect(html).toContain('generated pine');
    expect(html).toContain('コピー');
    expect(html).toContain('CSV取込（MVP）');
    expect(html).toContain('対応CSV: Performance Summary（英語・日本語ヘッダー）/ List of Trades（英語・日本語ヘッダー）。');
    expect(html).toContain('CSVを取込');
    expect(html).toContain('検証レポートを開く');
  });

  it('renders failed import guidance when parse_status is failed', () => {
    primeScenarioState({
      strategyId: 'str-1',
      backtest: {
        id: 'bt-1',
      },
      result: {
        id: 'ver-1',
        status: 'generated',
        warnings: [],
        assumptions: [],
        generated_pine: null,
      },
      importState: {
        id: 'imp-1',
        parse_status: 'failed',
        parse_error: 'CSV is empty. Missing required columns. Need header and one data row.',
        parsed_summary: null,
      },
    });
    mockUseSWR.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        strategy_versions: [],
      },
      mutate: vi.fn(),
    });

    const html = renderToStaticMarkup(<StrategyLab />);
    expect(html).toContain('生成に失敗しました');
    expect(html).toContain('warnings を確認してください。');
    expect(html).toContain('parse_status:');
    expect(html).toContain('parse_error:');
    expect(html).toContain('対応形式: Performance Summary または List of Trades（英語ヘッダー / 日本語ヘッダー対応）。');
    expect(html).toContain('CSVが空です。TradingView のエクスポート内容が1行以上あることを確認してください。');
    expect(html).toContain('ヘッダー行とデータ行が不足しています。エクスポート直後のCSVをそのまま使用してください。');
    expect(html).toContain('必要列が不足しています。Performance Summary なら主要指標列、List of Trades なら約定列を含むCSVを使用してください。');
  });

  it('renders strategy proposal candidates without auto-generating pine', () => {
    primeScenarioState({
      proposalData: {
        provider: {
          name: 'stub',
          mode: 'deterministic',
          web_search: false,
          persisted: false,
        },
        provider_observation: {
          provider_name: 'stub',
          selected_by: 'default',
          elapsed_ms: 20,
          latency_bucket: 'fast',
          status: 'succeeded',
          candidate_count: 1,
          invalid_reason: 'none',
          validation_error_count: 0,
          fallback_used: false,
          fallback_reason: null,
          schema_valid: true,
          model_category: 'unknown',
        },
        candidates: [
          {
            candidate_id: 'stub-1',
            title: '移動平均トレンドフォロー候補',
            summary: '中期移動平均と出来高で上昇トレンドを確認してから入る検証候補。',
            strategy_type: 'trend_following',
            confidence: 'medium',
            pine_feasibility: 'high',
            entry_logic: ['終値が25日移動平均を上回る'],
            risk_management: ['1回の損失を限定する'],
            backtest_cautions: ['長期上昇相場に過剰適合しないか確認する'],
          },
        ],
        disclaimer: '検証候補の提案です。投資助言ではありません。',
      },
    });
    mockUseSWR.mockReturnValue({
      isLoading: false,
      error: null,
      data: null,
      mutate: vi.fn(),
    });

    const html = renderToStaticMarkup(<StrategyLab />);
    expect(html).toContain('provider:');
    expect(html).toContain('stub / deterministic');
    expect(html).toContain('web search:');
    expect(html).toContain('disabled');
    expect(html).toContain('保存:');
    expect(html).toContain('なし');
    expect(html).toContain('provider status:');
    expect(html).toContain('succeeded');
    expect(html).toContain('latency:');
    expect(html).toContain('fast / 20ms');
    expect(html).toContain('fallback:');
    expect(html).toContain('schema:');
    expect(html).toContain('valid');
    expect(html).toContain('移動平均トレンドフォロー候補');
    expect(html).toContain('この候補を使う');
    expect(html).toContain('trend_following');
    expect(html).toContain('Pine feasibility:');
    expect(html).toContain('検証候補の提案です。投資助言ではありません。');
    expect(html).toContain('保存してPine生成');
    expect(html).not.toContain('生成結果');
    expect(html).not.toContain('CSV取込（MVP）');
  });

  it('calls select API before using current proposal candidates when proposal_run_id exists', async () => {
    const setters = primeScenarioState({
      proposalData: {
        proposal_run_id: 'proposal-run-1',
        provider: {
          name: 'stub',
          mode: 'deterministic',
          web_search: false,
          persisted: true,
        },
        candidates: [
          {
            candidate_id: 'stub-1',
            title: '選択候補',
            summary: '検証候補。',
            strategy_type: 'trend_following',
            confidence: 'medium',
            pine_feasibility: 'high',
            entry_logic: ['entry'],
            risk_management: ['risk'],
            backtest_cautions: ['caution'],
            suggested_natural_language_spec: '選択候補の自然言語ルール',
          },
        ],
        disclaimer: '検証候補の提案です。投資助言ではありません。',
      },
    });
    mockUseSWR.mockReturnValue({
      isLoading: false,
      error: null,
      data: null,
      mutate: vi.fn(),
    });
    vi.mocked(postApi).mockResolvedValue({
      proposal_run: {},
      selected_candidate: {},
    });

    renderToStaticMarkup(<StrategyLab />);
    const useCandidateButton = renderedButtons.find((button) => button.children === 'この候補を使う');
    await useCandidateButton?.onClick?.();
    await flushPromises();

    expect(postApi).toHaveBeenCalledWith('/api/strategy-lab/proposals/proposal-run-1/select', {
      candidate_id: 'stub-1',
    });
    expect(setters[0]).toHaveBeenCalledWith('選択候補');
    expect(setters[1]).toHaveBeenCalledWith('選択候補の自然言語ルール');
    expect(postApi).not.toHaveBeenCalledWith(expect.stringContaining('/pine/generate'), expect.anything());
    expect(postApi).not.toHaveBeenCalledWith('/api/backtests', expect.anything());
  });

  it('renders history list', () => {
    primeDefaultState();
    mockUseSWR.mockImplementation((key: string | null) => {
      if (key === '/api/strategy-lab/proposals?limit=5') {
        return {
          isLoading: false,
          error: null,
          data: {
            proposal_runs: [
              {
                id: 'proposal-run-1',
                status: 'succeeded',
                provider_name: 'stub',
                provider_mode: 'deterministic',
                selected_by: 'default',
                input: {},
                provider_observation: null,
                candidate_count: 2,
                selected_candidate_id: 'proposal-candidate-1',
                completed_at: '2026-05-17T00:00:00.000Z',
                created_at: '2026-05-17T00:00:00.000Z',
                updated_at: '2026-05-17T00:00:00.000Z',
              },
            ],
            limit: 5,
          },
          mutate: vi.fn(),
        };
      }
      return { isLoading: false, error: null, data: null, mutate: vi.fn() };
    });

    const html = renderToStaticMarkup(<StrategyLab />);
    expect(html).toContain('最近の提案');
    expect(html).toContain('succeeded');
    expect(html).toContain('stub');
    expect(html).toContain('candidate count:');
    expect(html).toContain('2');
    expect(html).toContain('selected:');
    expect(html).toContain('あり');
    expect(html).toContain('候補を見る');
  });

  it('applies title and natural language spec from history detail candidate', async () => {
    const setters = primeScenarioState({
      selectedProposalRunId: 'proposal-run-1',
    });
    mockUseSWR.mockImplementation((key: string | null) => {
      if (key === '/api/strategy-lab/proposals?limit=5') {
        return {
          isLoading: false,
          error: null,
          data: {
            proposal_runs: [
              {
                id: 'proposal-run-1',
                status: 'succeeded',
                provider_name: 'stub',
                provider_mode: 'deterministic',
                selected_by: 'default',
                input: {},
                provider_observation: null,
                candidate_count: 1,
                selected_candidate_id: null,
                completed_at: null,
                created_at: '2026-05-17T00:00:00.000Z',
                updated_at: '2026-05-17T00:00:00.000Z',
              },
            ],
            limit: 5,
          },
          mutate: vi.fn(),
        };
      }
      if (key === '/api/strategy-lab/proposals/proposal-run-1') {
        return {
          isLoading: false,
          error: null,
          data: {
            proposal_run: {
              id: 'proposal-run-1',
              status: 'succeeded',
            },
            candidates: [
              {
                id: 'proposal-candidate-1',
                proposal_run_id: 'proposal-run-1',
                provider_candidate_id: 'stub-1',
                rank: 1,
                selected_at: null,
                created_at: '2026-05-17T00:00:00.000Z',
                candidate: {
                  candidate_id: 'stub-1',
                  title: '履歴候補タイトル',
                  summary: '履歴から使う候補。',
                  strategy_type: 'mean_reversion',
                  suggested_natural_language_spec: '履歴候補の自然言語ルール',
                },
              },
            ],
          },
          mutate: vi.fn(),
        };
      }
      return { isLoading: false, error: null, data: null, mutate: vi.fn() };
    });
    vi.mocked(postApi).mockResolvedValue({
      proposal_run: {},
      selected_candidate: {},
    });

    renderToStaticMarkup(<StrategyLab />);
    const useHistoryCandidateButton = renderedButtons.find((button) => button.children === 'この候補を使う');
    await useHistoryCandidateButton?.onClick?.();
    await flushPromises();

    expect(postApi).toHaveBeenCalledWith('/api/strategy-lab/proposals/proposal-run-1/select', {
      proposal_candidate_id: 'proposal-candidate-1',
    });
    expect(setters[0]).toHaveBeenCalledWith('履歴候補タイトル');
    expect(setters[1]).toHaveBeenCalledWith('履歴候補の自然言語ルール');
  });

  it('renders history empty, error, and loading states', () => {
    primeDefaultState();
    mockUseSWR.mockImplementation((key: string | null) => {
      if (key === '/api/strategy-lab/proposals?limit=5') {
        return { isLoading: false, error: null, data: { proposal_runs: [], limit: 5 }, mutate: vi.fn() };
      }
      return { isLoading: false, error: null, data: null, mutate: vi.fn() };
    });
    expect(renderToStaticMarkup(<StrategyLab />)).toContain('最近の提案はありません');

    renderedButtons.length = 0;
    primeDefaultState();
    mockUseSWR.mockImplementation((key: string | null) => {
      if (key === '/api/strategy-lab/proposals?limit=5') {
        return { isLoading: false, error: new Error('failed'), data: null, mutate: vi.fn() };
      }
      return { isLoading: false, error: null, data: null, mutate: vi.fn() };
    });
    expect(renderToStaticMarkup(<StrategyLab />)).toContain('提案履歴を読み込めませんでした');

    renderedButtons.length = 0;
    primeDefaultState();
    mockUseSWR.mockImplementation((key: string | null) => {
      if (key === '/api/strategy-lab/proposals?limit=5') {
        return { isLoading: true, error: null, data: null, mutate: vi.fn() };
      }
      return { isLoading: false, error: null, data: null, mutate: vi.fn() };
    });
    expect(renderToStaticMarkup(<StrategyLab />)).toContain('提案履歴を読み込み中です');
  });
});
