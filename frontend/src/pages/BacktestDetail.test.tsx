import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const mockUseSWR = vi.fn();
let mockLocation = '/backtests/bt-1';

vi.mock('swr', () => ({
  default: (...args: unknown[]) => mockUseSWR(...args),
}));

vi.mock('wouter', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  useLocation: () => [mockLocation, vi.fn()],
}));

import BacktestDetail, { parseBacktestsReturnPath } from './BacktestDetail';

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
    expect(html).toContain('まず「基本情報 / 主指標」を確認し、次に「AI 総評」と「import 履歴」を確認してください。');
    expect(html).toContain('総取引数');
    expect(html).toContain('解析成功');
    expect(html).toContain('href="/backtests?q=ma&amp;page=2"');
    expect(html).toContain('AI 総評');
    expect(html).toContain('### 結論');
    expect(html).toContain('### 良い点');
    expect(html).toContain('### 懸念点');
    expect(html).toContain('### 次に確認すべき点');
    expect(html).toContain('使用した Strategy');
    expect(html).toContain('href="/strategy-versions/ver-1?return=%2Fstrategies%2Fstr-1%2Fversions%3Fsort%3Dupdated_at%26order%3Ddesc%26page%3D1"');
    expect(html).toContain('href="/strategies/str-1/versions?sort=updated_at&amp;order=desc&amp;page=1"');
    expect(html).toContain('次アクション（Rule Lab）');
    expect(html).toContain('比較可能な run が不足しています。解析済み import が2件以上あると比較できます。');
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
        imports: [],
      },
    });

    const html = renderToStaticMarkup(<BacktestDetail params={{ backtestId: 'bt-2' }} />);
    expect(html).toContain('解析失敗');
    expect(html).toContain('解析エラー');
    expect(html).toContain('Missing required columns');
    expect(html).toContain('AI総評は未生成です。');
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
        },
      },
    });

    const html = renderToStaticMarkup(<BacktestDetail params={{ backtestId: 'bt-application' }} />);
    expect(html).toContain('銘柄起点の適用情報');
    expect(html).toContain('この検証レポートは、保存済み Symbol Strategy Application の run から作成されています。');
    expect(html).toContain('application ID:</strong> <code>app-1</code>');
    expect(html).toContain('status:</strong> <code>active</code>');
    expect(html).toContain('source:</strong> <code>manual</code>');
    expect(html).toContain('memo:</strong> watch for breakout');
    expect(html).toContain('run ID:</strong> <code>run-1</code>');
    expect(html).toContain('run status:</strong> <code>succeeded</code>');
    expect(html).toContain('market_code:</strong> <code>JP</code>');
    expect(html).toContain('strategy ID:</strong> <code>str-1</code>');
    expect(html).toContain('market / timeframe:</strong> JP_STOCK / D');
    expect(html).toContain('href="/symbols/sym-1"');
    expect(html).toContain('SymbolDetail に戻る');
    expect(html).toContain('href="/strategies/str-1"');
    expect(html).toContain('StrategyDetail に戻る');
    expect(html).toContain('href="/strategy-versions/ver-1"');
    expect(html).toContain('StrategyVersionDetail に戻る');
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
              summary_kind: 'engine_estimated',
              period: {
                from: '2025-01-01',
                to: '2025-12-31',
              },
              metrics: {
                bar_count: 245,
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
    expect(html).toContain('engine_estimated');
    expect(html).toContain('bar_count');
    expect(html).toContain('245');
    expect(html).toContain('artifact_pointer');
    expect(html).toContain('internal_backtest_result');
    expect(html).toContain('artifact file の実体読込は行いません。');
    expect(html).toContain('type');
    expect(html).toContain('json');
    expect(html).toContain('path');
    expect(html).toContain('/internal-backtests/executions/exec-1');
    expect(html).toContain('summary_mode');
    expect(html).toContain('raw artifact JSON');
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
    expect(html).toContain('artifact は未生成、または strategy snapshot に保存されていません。');
  });
});
