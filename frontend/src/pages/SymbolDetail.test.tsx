import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const mockUseSWR = vi.fn();
const mockUseRoute = vi.fn();

vi.mock('swr', () => ({
  default: (...args: unknown[]) => mockUseSWR(...args),
}));

vi.mock('wouter', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  useRoute: (...args: unknown[]) => mockUseRoute(...args),
}));

vi.mock('../api/client', () => ({
  swrFetcher: vi.fn(),
  patchApi: vi.fn(async () => ({})),
  postApi: vi.fn(async () => ({})),
}));

import SymbolDetail, { buildStrategySelectionListPath, readCsvFileForImport } from './SymbolDetail';

const sideRailHomeFixture = {
  market_overview: { indices: [], fx: [], sectors: [] },
  watchlist_symbols: [],
  positions: [],
  recent_alerts: [],
  daily_summary: null,
  key_events: [],
};

const sideRailWatchlistFixture = {
  watchlist: { id: 'wl-1', name: 'default', description: null },
  items: [],
};

const sideRailPositionsFixture = {
  portfolio: { id: 'pf-1', name: 'default', is_default: true },
  positions: [],
};

const baseSymbolData = {
  symbol: {
    id: 'sym-1',
    symbol: 'TYO:7203',
    symbol_code: '7203',
    display_name: 'Toyota',
    market_code: 'JP',
    tradingview_symbol: 'TYO:7203',
  },
  current_snapshot: {
    last_price: 3050,
    change: 12.5,
    change_percent: 0.41,
    volume: 1200000,
    as_of: '2026-04-21T06:00:00.000Z',
    market_status: 'closed',
    source_name: 'stooq_daily',
  },
  tradingview_symbol: 'TYO:7203',
  recent_alerts: [],
  latest_ai_thesis_summary: null,
  related_references: [],
  latest_active_note: null,
  latest_processing_status: 'idle',
};

const strategyListFixture = {
  query: { q: '', status: 'active', sort: 'updated_at', order: 'desc' },
  pagination: {
    page: 1,
    limit: 20,
    q: '',
    status: 'active',
    sort: 'updated_at',
    order: 'desc',
    total: 1,
    has_next: false,
    has_prev: false,
  },
  strategies: [
    {
      id: 'strategy_1',
      title: '押し目買い戦略',
      status: 'active',
      created_at: '2026-05-01T00:00:00.000Z',
      updated_at: '2026-05-02T00:00:00.000Z',
      version_count: 1,
      latest_version: {
        id: 'version_1',
        market: 'JP_STOCK',
        timeframe: 'D',
        status: 'generated',
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-02T00:00:00.000Z',
      },
    },
  ],
};

const strategyVersionsFixture = {
  strategy: {
    id: 'strategy_1',
    title: '押し目買い戦略',
    status: 'active',
    created_at: '2026-05-01T00:00:00.000Z',
    updated_at: '2026-05-02T00:00:00.000Z',
  },
  query: { q: '', status: '', sort: 'updated_at', order: 'desc' },
  pagination: {
    page: 1,
    limit: 20,
    q: '',
    status: '',
    sort: 'updated_at',
    order: 'desc',
    total: 1,
    has_next: false,
    has_prev: false,
  },
  strategy_versions: [
    {
      id: 'version_1',
      strategy_id: 'strategy_1',
      cloned_from_version_id: null,
      is_derived: false,
      has_forward_validation_note: false,
      forward_validation_note_updated_at: null,
      has_diff_from_clone: null,
      market: 'JP_STOCK',
      timeframe: 'D',
      status: 'generated',
      has_warnings: false,
      created_at: '2026-05-01T00:00:00.000Z',
      updated_at: '2026-05-02T00:00:00.000Z',
    },
  ],
};

const symbolApplicationsFixture = {
  symbol: {
    id: 'sym-1',
    symbol: 'TYO:7203',
    symbol_code: '7203',
    display_name: 'Toyota',
    market_code: 'JP',
    tradingview_symbol: 'TYO:7203',
  },
  query: {
    status: 'active',
    report_presence: null,
    report_source: null,
    run_type: null,
    run_status: null,
    sort: 'updated_at',
    order: 'desc',
  },
  pagination: {
    page: 1,
    limit: 20,
    total: 2,
    has_next: false,
    has_prev: false,
  },
  applications: [
    {
      id: 'application_1',
      status: 'active',
      source: 'manual',
      memo: null,
      created_at: '2026-05-03T00:00:00.000Z',
      updated_at: '2026-05-04T00:00:00.000Z',
      strategy: {
        id: 'strategy_1',
        title: '押し目買い戦略',
        status: 'active',
      },
      strategy_version: {
        id: 'version_1',
        market: 'JP_STOCK',
        timeframe: 'D',
        status: 'generated',
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-02T00:00:00.000Z',
      },
      latest_run: {
        id: 'run_1',
        run_type: 'csv_import',
        status: 'succeeded',
        created_at: '2026-05-04T00:00:00.000Z',
        updated_at: '2026-05-04T00:00:00.000Z',
        backtest_id: 'backtest_1',
        backtest_import_id: 'import_1',
      },
      latest_backtest_report: {
        id: 'backtest_1',
        title: '7203 strategy report',
        status: 'ready',
        execution_source: 'tradingview',
        market: 'JP_STOCK',
        timeframe: 'D',
        created_at: '2026-05-04T00:00:00.000Z',
        updated_at: '2026-05-04T00:00:00.000Z',
      },
      latest_reports_by_source: {
        csv_import: {
          backtest_id: 'backtest_1',
          title: '7203 strategy report',
          execution_source: 'tradingview',
          status: 'ready',
          run_type: 'csv_import',
          run_status: 'succeeded',
          updated_at: '2026-05-04T00:00:00.000Z',
        },
        internal_backtest: {
          backtest_id: 'backtest_internal_1',
          title: '7203 internal report',
          execution_source: 'internal_backtest',
          status: 'completed',
          run_type: 'internal_backtest',
          run_status: 'succeeded',
          updated_at: '2026-05-07T00:00:00.000Z',
        },
      },
      run_count: 1,
    },
    {
      id: 'application_2',
      status: 'active',
      source: 'manual',
      memo: null,
      created_at: '2026-05-05T00:00:00.000Z',
      updated_at: '2026-05-06T00:00:00.000Z',
      strategy: {
        id: 'strategy_1',
        title: '謚ｼ縺礼岼雋ｷ縺・姶逡･',
        status: 'active',
      },
      strategy_version: {
        id: 'version_1',
        market: 'JP_STOCK',
        timeframe: 'D',
        status: 'generated',
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-02T00:00:00.000Z',
      },
      latest_run: {
        id: 'run_2',
        run_type: 'internal_backtest',
        status: 'queued',
        created_at: '2026-05-06T00:00:00.000Z',
        updated_at: '2026-05-06T00:00:00.000Z',
        backtest_id: null,
        backtest_import_id: null,
      },
      latest_backtest_report: null,
      latest_reports_by_source: {
        csv_import: null,
        internal_backtest: null,
      },
      run_count: 1,
    },
  ],
};

const archivedSymbolApplicationsFixture = {
  ...symbolApplicationsFixture,
  query: {
    ...symbolApplicationsFixture.query,
    status: 'archived',
  },
  pagination: {
    ...symbolApplicationsFixture.pagination,
    total: 1,
  },
  applications: [
    {
      ...symbolApplicationsFixture.applications[0],
      id: 'application_archived_1',
      status: 'archived',
    },
  ],
};

const emptyActiveSymbolApplicationsFixture = {
  ...symbolApplicationsFixture,
  pagination: {
    ...symbolApplicationsFixture.pagination,
    total: 0,
  },
  applications: [],
};

function getCommonSWRResult(key: string | null) {
  if (key === '/api/home?summary_type=latest') {
    return { isLoading: false, error: null, data: sideRailHomeFixture };
  }
  if (key === '/api/watchlist-items') {
    return { isLoading: false, error: null, data: sideRailWatchlistFixture };
  }
  if (key === '/api/positions') {
    return { isLoading: false, error: null, data: sideRailPositionsFixture };
  }
  if (key === '/api/symbols/sym-1/calendar-events?limit=20') {
    return {
      isLoading: false,
      error: null,
      mutate: vi.fn(),
      data: {
        events: [
          {
            id: 'cal-1',
            scope: 'symbol',
            symbol_id: 'sym-1',
            symbol_code: '7203',
            display_name: 'Toyota',
            event_date: '2026-06-10',
            event_time: null,
            timezone: 'Asia/Tokyo',
            event_type: 'earnings',
            title: 'Toyota earnings',
            importance: 'high',
            source_type: 'seed',
            source_name: 'seed',
            source_label: '決算予定',
            status: 'active',
            fetched_at: '2026-05-26T00:00:00.000Z',
          },
        ],
        meta: { from: '2026-05-26', to: '2026-07-25', scope: 'symbol', symbol_id: 'sym-1' },
      },
    };
  }
  if (key === '/api/strategies?page=1&limit=5&sort=updated_at&order=desc&status=active') {
    return { isLoading: false, error: null, data: strategyListFixture };
  }
  if (key === '/api/strategies/strategy_1/versions?page=1&limit=20&sort=updated_at&order=desc') {
    return { isLoading: false, error: null, data: strategyVersionsFixture };
  }
  if (key === '/api/symbols/sym-1/strategy-applications?status=active&page=1&limit=20&sort=updated_at&order=desc') {
    return { isLoading: false, error: null, mutate: vi.fn(), data: symbolApplicationsFixture };
  }
  return null;
}

describe('SymbolDetail', () => {
  it('renders shared error state text when symbol detail fetch fails', () => {
    mockUseSWR.mockReset();
    mockUseRoute.mockReset();
    mockUseRoute.mockReturnValue([true, { symbolId: 'sym-1' }]);
    mockUseSWR.mockImplementation((key: string) => {
      const common = getCommonSWRResult(key);
      if (common) return common;
      if (key === '/api/symbols/sym-1') {
        return { isLoading: false, error: new Error('detail failed'), data: null };
      }
      return { isLoading: false, error: null, data: null, mutate: vi.fn() };
    });

    const html = renderToStaticMarkup(<SymbolDetail />);
    expect(html).toContain('エラー: detail failed');
  });

  it('shows ai summary loading state', () => {
    mockUseSWR.mockReset();
    mockUseRoute.mockReset();
    mockUseRoute.mockReturnValue([true, { symbolId: 'sym-1' }]);
    mockUseSWR.mockImplementation((key: string) => {
      const common = getCommonSWRResult(key);
      if (common) return common;
      if (key === '/api/home?summary_type=latest') {
        return { isLoading: false, error: null, data: sideRailHomeFixture };
      }
      if (key === '/api/watchlist-items') {
        return { isLoading: false, error: null, data: sideRailWatchlistFixture };
      }
      if (key === '/api/positions') {
        return { isLoading: false, error: null, data: sideRailPositionsFixture };
      }
      if (key === '/api/symbols/sym-1') {
        return { isLoading: false, error: null, data: baseSymbolData };
      }
      return { isLoading: true, error: null, data: null, mutate: vi.fn() };
    });

    const html = renderToStaticMarkup(<SymbolDetail />);
    expect(html).toContain('AI論点カードを読み込み中');
  });

  it('shows unavailable state when ai summary is unavailable', () => {
    mockUseSWR.mockReset();
    mockUseRoute.mockReset();
    mockUseRoute.mockReturnValue([true, { symbolId: 'sym-1' }]);
    mockUseSWR.mockImplementation((key: string) => {
      const common = getCommonSWRResult(key);
      if (common) return common;
      if (key === '/api/home?summary_type=latest') {
        return { isLoading: false, error: null, data: sideRailHomeFixture };
      }
      if (key === '/api/watchlist-items') {
        return { isLoading: false, error: null, data: sideRailWatchlistFixture };
      }
      if (key === '/api/positions') {
        return { isLoading: false, error: null, data: sideRailPositionsFixture };
      }
      if (key === '/api/symbols/sym-1') {
        return { isLoading: false, error: null, data: baseSymbolData };
      }
      return {
        isLoading: false,
        error: null,
        mutate: vi.fn(),
        data: {
          symbol_id: 'sym-1',
          scope: 'thesis',
          summary: {
            summary_id: null,
            title: null,
            body_markdown: null,
            structured_json: null,
            generated_at: null,
            status: 'unavailable',
            insufficient_context: true,
            scope: 'thesis',
          },
        },
      };
    });

    const html = renderToStaticMarkup(<SymbolDetail />);
    expect(html).toContain('AI論点カードは未生成です。');
    expect(html).toContain('AI論点カード生成');
  });

  it('shows available ai summary content', () => {
    mockUseSWR.mockReset();
    mockUseRoute.mockReset();
    mockUseRoute.mockReturnValue([true, { symbolId: 'sym-1' }]);
    mockUseSWR.mockImplementation((key: string) => {
      const common = getCommonSWRResult(key);
      if (common) return common;
      if (key === '/api/home?summary_type=latest') {
        return { isLoading: false, error: null, data: sideRailHomeFixture };
      }
      if (key === '/api/watchlist-items') {
        return { isLoading: false, error: null, data: sideRailWatchlistFixture };
      }
      if (key === '/api/positions') {
        return { isLoading: false, error: null, data: sideRailPositionsFixture };
      }
      if (key === '/api/symbols/sym-1') {
        return { isLoading: false, error: null, data: baseSymbolData };
      }
      return {
        isLoading: false,
        error: null,
        mutate: vi.fn(),
        data: {
          symbol_id: 'sym-1',
          scope: 'thesis',
          summary: {
            summary_id: 'sum-1',
            title: 'Toyota thesis',
            body_markdown: 'Body text',
            structured_json: {
              payload: {
                bullish_points: ['Margin improvement'],
                bearish_points: ['FX risk'],
              },
            },
            generated_at: '2026-04-22T10:00:00+09:00',
            status: 'available',
            insufficient_context: false,
            scope: 'thesis',
          },
        },
      };
    });

    const html = renderToStaticMarkup(<SymbolDetail />);
    expect(html).toContain('Toyota thesis');
    expect(html).toContain('Margin improvement');
    expect(html).toContain('FX risk');
    expect(html).toContain('AI論点カードを再生成');
    expect(html).not.toContain('TradingView chart');
    expect(html).not.toContain('tv_chart_');
    expect(html).not.toContain('s3.tradingview.com');
    expect(html).toContain('投資カレンダー');
    expect(html).toContain('カレンダーを更新');
    expect(html).toContain('Toyota earnings');
    expect(html).toContain('決算予定');
    expect(html).toContain('ストラテジー / 検証結果');
    expect(html).toContain('この銘柄に適用したストラテジーと検証結果をここに集約します。');
    expect(html).toContain('保存済みストラテジー適用');
    expect(html).toContain('status');
    expect(html).toContain('active');
    expect(html).toContain('archived');
    expect(html).toContain('表示対象');
    expect(html).toContain('すべて');
    expect(html).toContain('reportあり');
    expect(html).toContain('reportなし');
    expect(html).toContain('source');
    expect(html).toContain('CSV');
    expect(html).toContain('latest run type');
    expect(html).toContain('latest run status');
    expect(html).toContain('strategy_id');
    expect(html).toContain('strategy_version_id');
    expect(html).toContain('placeholder="strategy id"');
    expect(html).toContain('placeholder="version id"');
    expect(html).toContain('running');
    expect(html).toContain('succeeded');
    expect(html).toContain('failed');
    expect(html).toContain('active application 2 / 2 件を表示中');
    expect(html).toContain('CSV report: 1 / internal report: 1');
    expect(mockUseSWR).toHaveBeenCalledWith(
      '/api/symbols/sym-1/strategy-applications?status=active&page=1&limit=20&sort=updated_at&order=desc',
      expect.any(Function),
    );
    expect(html).toContain('application_id:</strong> <code>application_1</code>');
    expect(html).toContain('status:');
    expect(html).toContain('アーカイブ');
    expect((html.match(/アーカイブ/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(html).not.toContain('復元');
    expect(html).toContain('run count:</strong> 1');
    expect(html).toContain('run status:</strong>');
    expect(html).toContain('market / timeframe');
    expect(html).toContain('7203 strategy report');
    expect(html).toContain('report type:</strong> CSV import report');
    expect(html).toContain('source:</strong> <code>tradingview</code>');
    expect(html).toContain('CSV / internal reports');
    expect(html).toContain('CSV import report');
    expect(html).toContain('internal backtest report');
    expect(html).toContain('7203 internal report');
    expect(html).toContain('href="/backtests/backtest_internal_1"');
    expect(html).toContain('run履歴を見る');
    expect(html).toContain('report履歴を見る');
    expect(html).toContain('href="/symbol-strategy-applications/application_1#runs"');
    expect(html).toContain('href="/symbol-strategy-applications/application_1#reports"');
    expect(html).toContain('TradingView CSVを取り込む');
    expect(html).toContain('CSVファイル');
    expect(html).toContain('accept=".csv,text/csv,text/plain"');
    expect(html).toContain('ファイルを選ぶとCSVテキスト欄に読み込みます。');
    expect(html).toContain('CSVテキスト');
    expect(html).toContain('CSV取込を実行');
    expect(html).not.toContain('内部バックテストを開始');
    expect(html).not.toContain('内部バックテスト結果');
    expect(html).not.toContain('execution_id: execution_1');
    expect(html).not.toContain('engine_estimated');
    expect(html).toContain('検証レポートを開く');
    expect(html).toContain('既存ストラテジーを選ぶ');
    expect(html).toContain('保存すると、この銘柄のストラテジー適用として記録されます。');
    expect(html).toContain('strategy 検索');
    expect(html).toContain('placeholder="title を検索"');
    expect(html).toContain('表示件数');
    expect(html).toContain('<option value="5" selected="">5</option>');
    expect(html).toContain('strategy 1 / 1 件を表示中 (page 1)');
    expect(html).toContain('前へ');
    expect(html).toContain('次へ');
    expect(html).toContain('押し目買い戦略');
    expect(html).toContain('strategy_id:');
    expect(html).not.toContain('選択中の version');
    expect(html).not.toContain('未保存');
    expect(html).toContain('適用を保存');
    expect(html).toContain('CSV取込（後続）');
    expect(html).toContain('ストラテジー作成を開く');
    expect(html).toContain('検証レポート一覧を開く');
    expect(mockUseSWR).not.toHaveBeenCalledWith(
      '/api/strategies/strategy_1/versions?page=1&limit=20&sort=updated_at&order=desc',
      expect.any(Function),
    );
  });

  it('renders restore action without breaking archived application rows', () => {
    mockUseSWR.mockReset();
    mockUseRoute.mockReset();
    mockUseRoute.mockReturnValue([true, { symbolId: 'sym-1' }]);
    mockUseSWR.mockImplementation((key: string) => {
      const common = getCommonSWRResult(key);
      if (common?.data === symbolApplicationsFixture) {
        return { ...common, data: archivedSymbolApplicationsFixture };
      }
      if (common) return common;
      if (key === '/api/symbols/sym-1') {
        return { isLoading: false, error: null, data: baseSymbolData };
      }
      return { isLoading: false, error: null, data: null, mutate: vi.fn() };
    });

    const html = renderToStaticMarkup(<SymbolDetail />);
    expect(html).toContain('application_archived_1');
    expect(html).toContain('archived');
    expect(html).toContain('復元');
    expect(html).not.toContain('アーカイブ</button>');
    expect(html).toContain('7203 strategy report');
    expect(html).toContain('CSV / internal reports');
  });

  it('keeps status filter controls visible when default active applications are empty', () => {
    mockUseSWR.mockReset();
    mockUseRoute.mockReset();
    mockUseRoute.mockReturnValue([true, { symbolId: 'sym-1' }]);
    mockUseSWR.mockImplementation((key: string) => {
      const common = getCommonSWRResult(key);
      if (common?.data === symbolApplicationsFixture) {
        return { ...common, data: emptyActiveSymbolApplicationsFixture };
      }
      if (common) return common;
      if (key === '/api/symbols/sym-1') {
        return { isLoading: false, error: null, data: baseSymbolData };
      }
      return { isLoading: false, error: null, data: null, mutate: vi.fn() };
    });

    const html = renderToStaticMarkup(<SymbolDetail />);
    expect(html).toContain('保存済み application はまだありません。');
    expect(html).toContain('status');
    expect(html).toContain('active');
    expect(html).toContain('archived');
    expect(html).toContain('all');
    expect(html).toContain('active application 0 / 0 件を表示中');
    expect(mockUseSWR).toHaveBeenCalledWith(
      '/api/symbols/sym-1/strategy-applications?status=active&page=1&limit=20&sort=updated_at&order=desc',
      expect.any(Function),
    );
  });

  it('shows reference breakdown and shortage note when no references exist', () => {
    mockUseSWR.mockReset();
    mockUseRoute.mockReset();
    mockUseRoute.mockReturnValue([true, { symbolId: 'sym-1' }]);
    mockUseSWR.mockImplementation((key: string) => {
      const common = getCommonSWRResult(key);
      if (common) return common;
      if (key === '/api/home?summary_type=latest') {
        return { isLoading: false, error: null, data: sideRailHomeFixture };
      }
      if (key === '/api/watchlist-items') {
        return { isLoading: false, error: null, data: sideRailWatchlistFixture };
      }
      if (key === '/api/positions') {
        return { isLoading: false, error: null, data: sideRailPositionsFixture };
      }
      if (key === '/api/symbols/sym-1') {
        return { isLoading: false, error: null, data: baseSymbolData };
      }
      return {
        isLoading: false,
        error: null,
        mutate: vi.fn(),
        data: {
          symbol_id: 'sym-1',
          scope: 'thesis',
          summary: {
            summary_id: 'sum-1',
            title: 'Toyota thesis',
            body_markdown: 'Body text',
            structured_json: {},
            generated_at: '2026-04-22T10:00:00+09:00',
            status: 'available',
            insufficient_context: false,
            scope: 'thesis',
          },
        },
      };
    });

    const html = renderToStaticMarkup(<SymbolDetail />);
    expect(html).toContain('news 0 / disclosure 0 / earnings 0');
    expect(html).toContain('参照情報は0件です。');
    expect(html).toContain('関連参照情報を再取得');
  });

  it('reads selected csv file text for the existing text import payload', async () => {
    const file = {
      name: 'tradingview-export.csv',
      text: vi.fn(async () => 'Net Profit,Total Closed Trades\n100,1'),
    };

    await expect(readCsvFileForImport(file)).resolves.toEqual({
      fileName: 'tradingview-export.csv',
      csvText: 'Net Profit,Total Closed Trades\n100,1',
    });
    expect(file.text).toHaveBeenCalledTimes(1);
  });

  it('falls back to a safe file name when selected csv file has no name', async () => {
    const file = {
      name: '',
      text: vi.fn(async () => 'csv body'),
    };

    await expect(readCsvFileForImport(file)).resolves.toEqual({
      fileName: 'tradingview.csv',
      csvText: 'csv body',
    });
  });

  it('builds compact strategy selection list query with optional search', () => {
    expect(buildStrategySelectionListPath({ q: '', page: 2, limit: 5 })).toBe(
      '/api/strategies?page=2&limit=5&sort=updated_at&order=desc&status=active',
    );
    expect(buildStrategySelectionListPath({ q: ' breakout setup ', page: 1, limit: 10 })).toBe(
      '/api/strategies?page=1&limit=10&sort=updated_at&order=desc&status=active&q=breakout+setup',
    );
  });
});
