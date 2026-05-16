import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const mockUseSWR = vi.fn();
const mockUseLocation = vi.fn();
const mockUseState = vi.fn();

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

vi.mock('../api/client', async () => {
  const actual = await vi.importActual('../api/client');
  return {
    ...actual,
    postApi: vi.fn(),
  };
});

import StrategyLab from './StrategyLab';

const DEFAULT_RULE =
  '25日移動平均線の上で、RSIが50以上、出来高が20日平均の1.5倍以上で買い。終値が5日線を下回ったら手仕舞い。';

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
}) {
  mockUseState.mockReset();
  const setters = Array.from({ length: 19 }).map(() => vi.fn());
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
}

describe('StrategyLab', () => {
  it('renders initial guidance and core actions', () => {
    primeDefaultState();
    mockUseSWR.mockReset();
    mockUseLocation.mockReset();
    mockUseLocation.mockReturnValue(['/strategy-lab', vi.fn()]);
    mockUseSWR.mockReturnValue({
      isLoading: false,
      error: null,
      data: null,
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
    mockUseSWR.mockReset();
    mockUseLocation.mockReset();
    mockUseLocation.mockReturnValue(['/strategy-lab', vi.fn()]);
    mockUseSWR.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        strategy_versions: [],
      },
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
    mockUseSWR.mockReset();
    mockUseLocation.mockReset();
    mockUseLocation.mockReturnValue(['/strategy-lab', vi.fn()]);
    mockUseSWR.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        strategy_versions: [],
      },
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
    mockUseSWR.mockReset();
    mockUseLocation.mockReset();
    mockUseLocation.mockReturnValue(['/strategy-lab', vi.fn()]);
    mockUseSWR.mockReturnValue({
      isLoading: false,
      error: null,
      data: null,
    });

    const html = renderToStaticMarkup(<StrategyLab />);
    expect(html).toContain('provider:');
    expect(html).toContain('stub / deterministic');
    expect(html).toContain('web search:');
    expect(html).toContain('disabled');
    expect(html).toContain('保存:');
    expect(html).toContain('なし');
    expect(html).toContain('移動平均トレンドフォロー候補');
    expect(html).toContain('この候補を使う');
    expect(html).toContain('trend_following');
    expect(html).toContain('Pine feasibility:');
    expect(html).toContain('検証候補の提案です。投資助言ではありません。');
    expect(html).toContain('保存してPine生成');
    expect(html).not.toContain('生成結果');
    expect(html).not.toContain('CSV取込（MVP）');
  });
});
