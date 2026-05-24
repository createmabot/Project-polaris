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
import { buildProposalErrorMessage, buildProposalHistoryPath } from './StrategyLab';

const DEFAULT_RULE =
  '25日移動平均線の上で、RSIが50以上、出来高が20日平均の1.5倍以上で買い。終値が5日線を下回ったら手仕舞い。';
const DEFAULT_HISTORY_PATH = '/api/strategy-lab/proposals?page=1&limit=10&sort=created_at&order=desc';

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
  timeframe?: string;
  importState?: Record<string, unknown> | null;
  importError?: string | null;
  proposalData?: Record<string, unknown> | null;
  proposalError?: string | null;
  proposalUserHint?: string;
  selectedProposalRunId?: string | null;
  proposalSelectionError?: string | null;
  selectingProposalCandidateId?: string | null;
  codexPromptData?: Record<string, unknown> | null;
  codexPromptError?: string | null;
  codexWebSearchPrompt?: boolean;
  codexImportText?: string;
  codexImportFileName?: string | null;
  codexImportError?: string | null;
  historySearchDraft?: string;
  historyQuery?: string;
  historyProvider?: string;
  historyStatus?: string;
  historySelected?: string;
  historyArchived?: string;
  historyPage?: number;
  submitting?: boolean;
  setters?: Array<ReturnType<typeof vi.fn>>;
}) {
  mockUseState.mockReset();
  const setters = params.setters ?? Array.from({ length: 42 }).map(() => vi.fn());
  const values = [
    '監視銘柄比較ルール',
    DEFAULT_RULE,
    'JP_STOCK',
    params.timeframe ?? 'D',
    'balanced',
    'any',
    params.proposalUserHint ?? '',
    params.proposalData ?? null,
    params.proposalError ?? null,
    false,
    params.selectedProposalRunId ?? null,
    params.proposalSelectionError ?? null,
    params.selectingProposalCandidateId ?? null,
    params.codexPromptData ?? null,
    params.codexPromptError ?? null,
    false,
    params.codexWebSearchPrompt ?? false,
    params.codexImportText ?? '',
    params.codexImportFileName ?? null,
    params.codexImportError ?? null,
    false,
    null,
    params.historySearchDraft ?? '',
    params.historyQuery ?? '',
    params.historyProvider ?? 'all',
    params.historyStatus ?? 'all',
    params.historySelected ?? 'all',
    params.historyArchived ?? 'active',
    params.historyPage ?? 1,
    params.submitting ?? false,
    null,
    params.result ?? null,
    params.strategyId ?? null,
    params.backtest ?? null,
    null,
    params.importState ?? null,
    params.importError ?? null,
    false,
    null,
    0,
  ];
  values.forEach((value, index) => {
    mockUseState.mockImplementationOnce(() => [value, setters[index]]);
  });
  mockUseState.mockImplementation((initial: unknown) => [initial, vi.fn()]);
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

  it('shows a generic retry message for strategy proposal rate limiting', () => {
    const message = buildProposalErrorMessage(new ApiError(
      'rate limited with internal details',
      'RATE_LIMITED',
      {
        rate_limited: true,
        retry_after_ms: 60000,
        provider_mode: 'local_llm',
      },
      429,
    ));

    expect(message).toBe('短時間に候補取得が続いたため、少し時間をおいて再試行してください。');
    expect(message).not.toContain('local_llm');
    expect(message).not.toContain('60000');
    expect(message).not.toContain('internal details');
  });

  it('shows a clearer retry message for incomplete provider candidate JSON', () => {
    const message = buildProposalErrorMessage(new ApiError(
      'provider failed with raw diagnostics',
      'PROVIDER_INVALID_RESPONSE',
      {
        provider_observation: {
          status: 'invalid_response',
          invalid_reason: 'required_field_missing',
          latency_bucket: 'slow',
          missing_required_fields: ['suggested_pine_constraints'],
        },
      },
      502,
    ));

    expect(message).toContain('AI候補の形式が不完全だったため取得できませんでした。もう一度お試しください。');
    expect(message).toContain('provider status: invalid_response / reason: required_field_missing / latency: slow');
    expect(message).not.toContain('provider failed with raw diagnostics');
    expect(message).not.toContain('suggested_pine_constraints');
  });


  it('builds proposal history paths with sanitized filters', () => {
    expect(buildProposalHistoryPath()).toBe(DEFAULT_HISTORY_PATH);
    expect(buildProposalHistoryPath({
      page: 2,
      limit: 10,
      q: '  breakout  ',
      provider: 'codex_cli_manual',
      status: 'succeeded',
      selected: 'selected',
      archived: 'archived',
    })).toBe('/api/strategy-lab/proposals?page=2&limit=10&sort=created_at&order=desc&q=breakout&provider_name=codex_cli_manual&status=succeeded&selected=true&archived=archived');
    expect(buildProposalHistoryPath({ selected: 'unselected' })).toContain('selected=false');
    expect(buildProposalHistoryPath({ archived: 'all' })).toContain('archived=all');
  });

  it.each([
    ['proposal_run_id', { proposal_run_id: 'failed-proposal-run-1' }],
    ['history.proposal_run_id', { history: { proposal_run_id: 'failed-proposal-run-1' } }],
  ])('refreshes recent proposal history when failed proposal details include %s', async (_label, details) => {
    const historyMutate = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    primeDefaultState();
    mockUseSWR.mockImplementation((key: string | null) => {
      if (key === DEFAULT_HISTORY_PATH) {
        return {
          isLoading: false,
          error: null,
          data: null,
          mutate: historyMutate,
        };
      }
      return { isLoading: false, error: null, data: null, mutate: vi.fn() };
    });
    vi.mocked(postApi).mockRejectedValue(new ApiError(
      'provider invalid response',
      'PROVIDER_INVALID_RESPONSE',
      details,
      502,
    ));

    try {
      renderToStaticMarkup(<StrategyLab />);
      const requestProposalButton = renderedButtons.find((button) => button.children === 'ストラテジーを提案');
      expect(requestProposalButton).toBeDefined();
      await requestProposalButton?.onClick?.();
      await flushPromises();

      expect(historyMutate).toHaveBeenCalledTimes(1);
    } finally {
      consoleError.mockRestore();
    }
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
    expect(html).toContain('提案用時間足');
    expect(html).toContain('提案用ヒント（任意）');
    expect(html).toContain('提案の方向性を絞りたい場合だけ入力します');
    expect(html).toContain('Pine生成用ルール文とは別に扱います');
    expect(html).toContain('戦略タイプ');
    expect(html).toContain('ストラテジーを提案');
    expect(html).toContain('Codex CLIで生成した候補JSONを取り込む');
    expect(html).toContain('Codex CLI用プロンプトを作成');
    expect(html).toContain('Codex CLI側でWeb検索を使う前提のpromptにする');
    expect(html).toContain('北極星はWeb検索を自動実行せず');
    expect(html).toContain('Codex CLI出力JSON');
    expect(html).toContain('JSONを取り込む');
    expect(html).toContain('提案履歴');
    expect(html).toContain('戦略タイトル');
    expect(html).toContain('自然言語ルール');
    expect(html).toContain('市場');
    expect(html).toContain('時間足');
    expect(html).toContain('US_STOCK');
    expect(html).toContain('日足（D）');
    expect(html).toContain('4時間足（4H）');
    expect(html).toContain('1時間足（1H）');
    expect(html).not.toContain('value="1D"');
    expect(html).toContain('時間足により提案される戦略候補の前提や注意点が変わります');
    expect(html).toContain(DEFAULT_RULE);
    expect(html).toContain('保存してPine生成');
    expect(html).toContain('Pine生成対象: JP_STOCK / US_STOCK、日足（D）/ 4時間足（4H）/ 1時間足（1H）');
    expect(html).toContain('時間足により提案される戦略候補の前提・注意点が変わります');
    expect(html).toContain('internal backtestの対応範囲拡張ではありません');
    expect(html).toContain('日本語入力中心 / long_only');
  });

  it('sends the selected proposal timeframe to strategy proposal generation without auto-running downstream flows', async () => {
    const historyMutate = vi.fn();
    const trendMutate = vi.fn();
    primeScenarioState({ timeframe: '4H' });
    mockUseSWR.mockImplementation((key: string | null) => {
      if (key === DEFAULT_HISTORY_PATH) {
        return { isLoading: false, error: null, data: null, mutate: historyMutate };
      }
      if (key === '/api/strategy-lab/proposals/provider-quality-trend?limit=50') {
        return { isLoading: false, error: null, data: null, mutate: trendMutate };
      }
      return { isLoading: false, error: null, data: null, mutate: vi.fn() };
    });
    vi.mocked(postApi).mockResolvedValue({
      proposal_run_id: 'proposal-run-4h',
      provider: {
        name: 'stub',
        mode: 'deterministic',
        web_search: false,
        persisted: false,
      },
      candidates: [],
      disclaimer: '検証候補です。',
    });

    renderToStaticMarkup(<StrategyLab />);
    const proposalButton = renderedButtons.find((button) => button.children === 'ストラテジーを提案');
    await proposalButton?.onClick?.();
    await flushPromises();

    expect(postApi).toHaveBeenCalledWith('/api/strategy-lab/proposals', expect.objectContaining({
      market: 'JP_STOCK',
      timeframe: '4H',
      risk_preference: 'balanced',
      strategy_type_bias: 'any',
      proposal_count: 5,
      user_hint: null,
    }));
    expect(postApi).not.toHaveBeenCalledWith(expect.stringContaining('/pine/generate'), expect.anything());
    expect(postApi).not.toHaveBeenCalledWith('/api/backtests', expect.anything());
    expect(historyMutate).toHaveBeenCalled();
    expect(trendMutate).toHaveBeenCalled();
  });

  it('sends the dedicated proposal hint instead of the Pine natural language rule', async () => {
    const historyMutate = vi.fn();
    const trendMutate = vi.fn();
    primeScenarioState({ proposalUserHint: '高値更新後の押し目買いを広めに比較したい' });
    mockUseSWR.mockImplementation((key: string | null) => {
      if (key === DEFAULT_HISTORY_PATH) {
        return { isLoading: false, error: null, data: null, mutate: historyMutate };
      }
      if (key === '/api/strategy-lab/proposals/provider-quality-trend?limit=50') {
        return { isLoading: false, error: null, data: null, mutate: trendMutate };
      }
      return { isLoading: false, error: null, data: null, mutate: vi.fn() };
    });
    vi.mocked(postApi).mockResolvedValue({
      proposal_run_id: 'proposal-run-hint',
      provider: { name: 'stub', mode: 'deterministic', web_search: false, persisted: false },
      candidates: [],
      disclaimer: '検証候補です。',
    });

    renderToStaticMarkup(<StrategyLab />);
    const proposalButton = renderedButtons.find((button) => button.children === 'ストラテジーを提案');
    await proposalButton?.onClick?.();
    await flushPromises();

    expect(postApi).toHaveBeenCalledWith('/api/strategy-lab/proposals', expect.objectContaining({
      user_hint: '高値更新後の押し目買いを広めに比較したい',
    }));
    expect(postApi).not.toHaveBeenCalledWith('/api/strategy-lab/proposals', expect.objectContaining({
      user_hint: DEFAULT_RULE,
    }));
    expect(postApi).not.toHaveBeenCalledWith(expect.stringContaining('/pine/generate'), expect.anything());
    expect(postApi).not.toHaveBeenCalledWith('/api/backtests', expect.anything());
  });

  it('requests a Codex CLI manual import prompt without executing providers', async () => {
    const setters = primeScenarioState({
      timeframe: '1H',
      proposalUserHint: '売買回数少なめの日足戦略',
    });
    mockUseSWR.mockReturnValue({
      isLoading: false,
      error: null,
      data: null,
      mutate: vi.fn(),
    });
    vi.mocked(postApi).mockResolvedValue({
      provider_name: 'codex_cli_manual',
      schema_name: 'strategy_proposal_candidates',
      schema_version: '1.0',
      proposal_count: 5,
      prompt: 'Return only one JSON object',
    });

    renderToStaticMarkup(<StrategyLab />);
    const promptButton = renderedButtons.find((button) => button.children === 'Codex CLI用プロンプトを作成');
    await promptButton?.onClick?.();
    await flushPromises();

    expect(postApi).toHaveBeenCalledWith('/api/strategy-lab/proposals/codex-cli/request', {
      market: 'JP_STOCK',
      timeframe: '1H',
      risk_preference: 'balanced',
      strategy_type_bias: 'any',
      proposal_count: 5,
      user_hint: '売買回数少なめの日足戦略',
      web_search_prompt: false,
    });
    expect(setters[13]).toHaveBeenCalledWith(expect.objectContaining({
      provider_name: 'codex_cli_manual',
      prompt: 'Return only one JSON object',
    }));
    expect(postApi).not.toHaveBeenCalledWith(expect.stringContaining('/pine/generate'), expect.anything());
  });

  it('requests a Codex CLI Web search prompt option with the selected timeframe when checked', async () => {
    primeScenarioState({
      codexWebSearchPrompt: true,
      timeframe: '4H',
      proposalUserHint: '出来高急増を使った短期戦略',
    });
    mockUseSWR.mockReturnValue({
      isLoading: false,
      error: null,
      data: null,
      mutate: vi.fn(),
    });
    vi.mocked(postApi).mockResolvedValue({
      provider_name: 'codex_cli_manual',
      schema_name: 'strategy_proposal_candidates',
      schema_version: '1.0',
      proposal_count: 5,
      web_search_prompt: true,
      prompt: 'Web search guidance. Return only one JSON object',
    });

    renderToStaticMarkup(<StrategyLab />);
    const promptButton = renderedButtons.find((button) => button.children === 'Codex CLI用プロンプトを作成');
    await promptButton?.onClick?.();
    await flushPromises();

    expect(postApi).toHaveBeenCalledWith('/api/strategy-lab/proposals/codex-cli/request', expect.objectContaining({
      timeframe: '4H',
      user_hint: '出来高急増を使った短期戦略',
      web_search_prompt: true,
    }));
  });

  it('imports Codex CLI JSON and displays it as proposal candidates', async () => {
    const historyMutate = vi.fn();
    const trendMutate = vi.fn();
    const setters = primeScenarioState({
      codexImportText: '{"schema_name":"strategy_proposal_candidates"}',
    });
    mockUseSWR.mockImplementation((key: string | null) => {
      if (key === DEFAULT_HISTORY_PATH) {
        return { isLoading: false, error: null, data: null, mutate: historyMutate };
      }
      if (key === '/api/strategy-lab/proposals/provider-quality-trend?limit=50') {
        return { isLoading: false, error: null, data: null, mutate: trendMutate };
      }
      return { isLoading: false, error: null, data: null, mutate: vi.fn() };
    });
    vi.mocked(postApi).mockResolvedValue({
      proposal_run_id: 'proposal-run-codex',
      provider: {
        name: 'codex_cli_manual',
        mode: 'manual_import',
        web_search: false,
        persisted: true,
      },
      candidates: [
        {
          candidate_id: 'codex-1',
          title: 'Codex候補',
          suggested_natural_language_spec: 'Codex候補の自然言語ルール',
        },
      ],
      disclaimer: '検証候補です。',
    });

    renderToStaticMarkup(<StrategyLab />);
    const importButton = renderedButtons.find((button) => button.children === 'JSONを取り込む');
    await importButton?.onClick?.();
    await flushPromises();

    expect(postApi).toHaveBeenCalledWith('/api/strategy-lab/proposals/codex-cli/import', {
      source: 'paste',
      result_json_text: '{"schema_name":"strategy_proposal_candidates"}',
      file_name: null,
    });
    expect(setters[7]).toHaveBeenCalledWith(expect.objectContaining({
      proposal_run_id: 'proposal-run-codex',
    }));
    expect(setters[10]).toHaveBeenCalledWith('proposal-run-codex');
    expect(historyMutate).toHaveBeenCalled();
    expect(trendMutate).toHaveBeenCalled();
    expect(postApi).not.toHaveBeenCalledWith(expect.stringContaining('/pine/generate'), expect.anything());
    expect(postApi).not.toHaveBeenCalledWith('/api/backtests', expect.anything());
  });

  it('shows generic retry guidance when Codex CLI import is rate limited', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const setters = primeScenarioState({
      codexImportText: '{"schema_name":"strategy_proposal_candidates"}',
    });
    mockUseSWR.mockReturnValue({
      isLoading: false,
      error: null,
      data: null,
      mutate: vi.fn(),
    });
    vi.mocked(postApi).mockRejectedValue(new ApiError(
      'rate limited with raw payload marker',
      'RATE_LIMITED',
      {
        rate_limited: true,
        retry_after_ms: 60000,
        provider_mode: 'manual_import',
        rate_limit_key_source: 'request_ip',
      },
      429,
    ));

    try {
      renderToStaticMarkup(<StrategyLab />);
      const importButton = renderedButtons.find((button) => button.children === 'JSONを取り込む');
      await importButton?.onClick?.();
      await flushPromises();

      expect(setters[19]).toHaveBeenCalledWith('短時間にJSON取り込みが続いたため、少し時間をおいて再試行してください。');
      expect(setters[19]).not.toHaveBeenCalledWith(expect.stringContaining('raw payload marker'));
      expect(setters[19]).not.toHaveBeenCalledWith(expect.stringContaining('manual_import'));
      expect(setters[19]).not.toHaveBeenCalledWith(expect.stringContaining('60000'));
    } finally {
      consoleError.mockRestore();
    }
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
    expect(html).toContain('警告');
    expect(html).toContain('前提');
    expect(html).toContain('generated pine');
    expect(html).toContain('コピー');
    expect(html).toContain('CSV取込（MVP）');
    expect(html).toContain('対応CSV: Performance Summary（英語・日本語ヘッダー）/ List of Trades（英語・日本語ヘッダー）。');
    expect(html).toContain('CSVを取込');
    expect(html).toContain('検証レポートを開く');
    expect(html).not.toContain('Pine生成中です');
  });

  it('renders Pine generation progress while submitting', () => {
    primeScenarioState({
      submitting: true,
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
    expect(html).toContain('data-testid="pine-generation-progress"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('生成リクエスト送信');
    expect(html).toContain('Pine生成中です');
    expect(html).toContain('LLMでPine生成');
    expect(html).toContain('生成結果レビュー');
    expect(html).toContain('必要に応じて修正');
    expect(html).toContain('最終確認');
    expect(html).not.toContain('raw prompt');
    expect(html).not.toContain('raw provider response');
    expect(html).not.toContain('raw reviewer response');
    expect(html).not.toContain('endpoint');
    expect(html).not.toContain('model value');
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
    expect(html).toContain('警告を確認してください。');
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
    expect(setters[6]).not.toHaveBeenCalled();
    expect(postApi).not.toHaveBeenCalledWith(expect.stringContaining('/pine/generate'), expect.anything());
    expect(postApi).not.toHaveBeenCalledWith('/api/backtests', expect.anything());
  });

  it('renders history list', () => {
    primeDefaultState();
    mockUseSWR.mockImplementation((key: string | null) => {
      if (key === DEFAULT_HISTORY_PATH) {
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
                archived_at: null,
                is_archived: false,
                completed_at: '2026-05-17T00:00:00.000Z',
                created_at: '2026-05-17T00:00:00.000Z',
                updated_at: '2026-05-17T00:00:00.000Z',
              },
            ],
            limit: 10,
            pagination: {
              page: 1,
              limit: 10,
              total_count: 12,
              has_next: true,
              has_previous: false,
            },
          },
          mutate: vi.fn(),
        };
      }
      return { isLoading: false, error: null, data: null, mutate: vi.fn() };
    });

    const html = renderToStaticMarkup(<StrategyLab />);
    expect(html).toContain('提案履歴');
    expect(html).toContain('履歴検索');
    expect(html).toContain('provider');
    expect(html).toContain('status');
    expect(html).toContain('selected');
    expect(html).toContain('履歴を絞り込む');
    expect(html).toContain('succeeded');
    expect(html).toContain('stub');
    expect(html).toContain('candidate count:');
    expect(html).toContain('2');
    expect(html).toContain('selected:');
    expect(html).toContain('あり');
    expect(html).toContain('archive:');
    expect(html).toContain('active');
    expect(html).toContain('アーカイブ');
    expect(html).toContain('候補を見る');
    expect(html).toContain('page 1 / total 12');
  });

  it('archives and unarchives proposal history runs through sanitized action endpoints', async () => {
    const historyMutate = vi.fn();
    primeScenarioState({ historyArchived: 'archived' });
    mockUseSWR.mockImplementation((key: string | null) => {
      if (key === '/api/strategy-lab/proposals?page=1&limit=10&sort=created_at&order=desc&archived=archived') {
        return {
          isLoading: false,
          error: null,
          data: {
            proposal_runs: [
              {
                id: 'proposal-run-archived',
                status: 'succeeded',
                provider_name: 'codex_cli_manual',
                provider_mode: 'manual_import',
                selected_by: 'manual_import',
                input: {},
                provider_observation: null,
                candidate_count: 1,
                selected_candidate_id: null,
                archived_at: '2026-05-17T00:00:00.000Z',
                is_archived: true,
                completed_at: null,
                created_at: '2026-05-17T00:00:00.000Z',
                updated_at: '2026-05-17T00:00:00.000Z',
              },
            ],
            limit: 10,
          },
          mutate: historyMutate,
        };
      }
      return { isLoading: false, error: null, data: null, mutate: vi.fn() };
    });
    vi.mocked(postApi).mockResolvedValue({
      proposal_run: {
        id: 'proposal-run-archived',
        is_archived: false,
        archived_at: null,
      },
    });

    const html = renderToStaticMarkup(<StrategyLab />);
    expect(html).toContain('アーカイブ済み');
    expect(html).toContain('戻す');
    expect(mockUseSWR).toHaveBeenCalledWith(
      '/api/strategy-lab/proposals?page=1&limit=10&sort=created_at&order=desc&archived=archived',
      expect.any(Function),
    );

    const unarchiveButton = renderedButtons.find((button) => button.children === '戻す');
    await unarchiveButton?.onClick?.();
    await flushPromises();

    expect(postApi).toHaveBeenCalledWith('/api/strategy-lab/proposals/proposal-run-archived/unarchive', {});
    expect(historyMutate).toHaveBeenCalled();

    renderedButtons.length = 0;
    vi.mocked(postApi).mockClear();
    primeDefaultState();
    mockUseSWR.mockImplementation((key: string | null) => {
      if (key === DEFAULT_HISTORY_PATH) {
        return {
          isLoading: false,
          error: null,
          data: {
            proposal_runs: [
              {
                id: 'proposal-run-active',
                status: 'succeeded',
                provider_name: 'stub',
                provider_mode: 'deterministic',
                selected_by: 'default',
                input: {},
                provider_observation: null,
                candidate_count: 1,
                selected_candidate_id: null,
                archived_at: null,
                is_archived: false,
                completed_at: null,
                created_at: '2026-05-17T00:00:00.000Z',
                updated_at: '2026-05-17T00:00:00.000Z',
              },
            ],
            limit: 10,
          },
          mutate: historyMutate,
        };
      }
      return { isLoading: false, error: null, data: null, mutate: vi.fn() };
    });
    renderToStaticMarkup(<StrategyLab />);
    const archiveButton = renderedButtons.find((button) => button.children === 'アーカイブ');
    await archiveButton?.onClick?.();
    await flushPromises();

    expect(postApi).toHaveBeenCalledWith('/api/strategy-lab/proposals/proposal-run-active/archive', {});
  });

  it('uses filtered proposal history path without changing provider trend key', () => {
    primeScenarioState({
      historySearchDraft: 'breakout',
      historyQuery: 'breakout',
      historyProvider: 'codex_cli_manual',
      historyStatus: 'succeeded',
      historySelected: 'selected',
      historyPage: 2,
    });
    mockUseSWR.mockReturnValue({ isLoading: false, error: null, data: null, mutate: vi.fn() });

    renderToStaticMarkup(<StrategyLab />);

    expect(mockUseSWR).toHaveBeenCalledWith(
      '/api/strategy-lab/proposals?page=2&limit=10&sort=created_at&order=desc&q=breakout&provider_name=codex_cli_manual&status=succeeded&selected=true',
      expect.any(Function),
    );
    expect(mockUseSWR).toHaveBeenCalledWith(
      '/api/strategy-lab/proposals/provider-quality-trend?limit=50',
      expect.any(Function),
    );
  });

  it('renders sanitized provider quality trend without raw diagnostics', () => {
    primeDefaultState();
    mockUseSWR.mockImplementation((key: string | null) => {
      if (key === '/api/strategy-lab/proposals/provider-quality-trend?limit=50') {
        return {
          isLoading: false,
          error: null,
          data: {
            summary: {
              total_runs: 3,
              succeeded_runs: 2,
              failed_runs: 1,
              success_rate: 0.6667,
              selected_runs: 1,
              selected_rate: 0.3333,
              zero_candidate_runs: 1,
              avg_candidate_count: 1.33,
              avg_elapsed_ms: 420,
            },
            by_provider: [
              {
                provider_name: 'local_llm',
                run_count: 2,
                succeeded_runs: 1,
                failed_runs: 1,
                success_rate: 0.5,
                selected_runs: 1,
                selected_rate: 0.5,
                zero_candidate_runs: 1,
                avg_candidate_count: 1,
                avg_elapsed_ms: 600,
                latency_buckets: [{ value: 'slow', count: 1 }],
                status_counts: [{ value: 'invalid_response', count: 1 }],
                invalid_reason_counts: [{ value: 'malformed_json', count: 1 }],
                selected_by_counts: [{ value: 'env', count: 2 }],
                provider_mode_counts: [{ value: 'local_llm', count: 1 }],
              },
            ],
            by_market: [],
            by_strategy_type_bias: [],
            candidate_distribution: {
              strategy_type_counts: [],
              confidence_counts: [],
              pine_feasibility_counts: [],
            },
            recent_failures: [
              {
                proposal_run_id: 'proposal-run-2',
                created_at: '2026-05-17T00:00:00.000Z',
                provider_name: 'local_llm',
                status: 'invalid_response',
                invalid_reason: 'malformed_json',
                candidate_count: 0,
                latency_bucket: 'slow',
              },
            ],
            meta: {
              source: 'strategy_proposal_history',
              sanitized: true,
              raw_prompt_included: false,
              raw_response_included: false,
              limit: 50,
            },
          },
          mutate: vi.fn(),
        };
      }
      if (key === DEFAULT_HISTORY_PATH) {
        return { isLoading: false, error: null, data: { proposal_runs: [], limit: 5 }, mutate: vi.fn() };
      }
      return { isLoading: false, error: null, data: null, mutate: vi.fn() };
    });

    const html = renderToStaticMarkup(<StrategyLab />);
    expect(html).toContain('provider quality trend は直近 50 件');
    expect(html).toContain('候補ランキングや投資判断ではありません');
    expect(html).toContain('runs:');
    expect(html).toContain('success:');
    expect(html).toContain('67%');
    expect(html).toContain('selected:');
    expect(html).toContain('33%');
    expect(html).toContain('avg latency:');
    expect(html).toContain('420ms');
    expect(html).toContain('local_llm');
    expect(html).toContain('recent failure: local_llm / invalid_response / malformed_json');
    expect(html).not.toContain('raw prompt');
    expect(html).not.toContain('raw response');
    expect(html).not.toContain('local-llm.example.test');
    expect(html).not.toContain('proposal-model-test');
    expect(html).not.toContain('C:\\');
    expect(html).not.toContain('stack trace');
  });

  it('applies title and natural language spec from history detail candidate', async () => {
    const setters = primeScenarioState({
      selectedProposalRunId: 'proposal-run-1',
    });
    mockUseSWR.mockImplementation((key: string | null) => {
      if (key === DEFAULT_HISTORY_PATH) {
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
                archived_at: '2026-05-17T00:00:00.000Z',
                is_archived: true,
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
              archived_at: '2026-05-17T00:00:00.000Z',
              is_archived: true,
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
      if (key === DEFAULT_HISTORY_PATH) {
        return { isLoading: false, error: null, data: { proposal_runs: [], limit: 5 }, mutate: vi.fn() };
      }
      return { isLoading: false, error: null, data: null, mutate: vi.fn() };
    });
    expect(renderToStaticMarkup(<StrategyLab />)).toContain('提案履歴はありません');

    renderedButtons.length = 0;
    primeDefaultState();
    mockUseSWR.mockImplementation((key: string | null) => {
      if (key === DEFAULT_HISTORY_PATH) {
        return { isLoading: false, error: new Error('failed'), data: null, mutate: vi.fn() };
      }
      return { isLoading: false, error: null, data: null, mutate: vi.fn() };
    });
    expect(renderToStaticMarkup(<StrategyLab />)).toContain('提案履歴を読み込めませんでした');

    renderedButtons.length = 0;
    primeDefaultState();
    mockUseSWR.mockImplementation((key: string | null) => {
      if (key === DEFAULT_HISTORY_PATH) {
        return { isLoading: true, error: null, data: null, mutate: vi.fn() };
      }
      return { isLoading: false, error: null, data: null, mutate: vi.fn() };
    });
    expect(renderToStaticMarkup(<StrategyLab />)).toContain('提案履歴を読み込み中です');
  });
});
