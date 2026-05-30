import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const mockUseSWR = vi.fn();
const mockUseRoute = vi.fn();
const mockUseLocation = vi.fn(() => ['/symbols/sym-1', vi.fn()]);

vi.mock('swr', () => ({
  default: (...args: unknown[]) => mockUseSWR(...args),
}));

vi.mock('wouter', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  useRoute: (...args: unknown[]) => mockUseRoute(...args),
  useLocation: () => mockUseLocation(),
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

function currentCalendarDate(day = 10): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-${String(day).padStart(2, '0')}`;
}

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
            event_date: currentCalendarDate(10),
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
            provider: 'seed',
            is_stale: false,
          },
          {
            id: 'cal-2',
            scope: 'symbol',
            symbol_id: 'sym-1',
            symbol_code: '7203',
            display_name: 'Toyota',
            event_date: currentCalendarDate(10),
            event_time: null,
            timezone: 'Asia/Tokyo',
            event_type: 'shareholder_meeting',
            title: 'Toyota meeting',
            importance: 'medium',
            source_type: 'seed',
            source_name: 'seed',
            source_label: '株主総会',
            status: 'active',
            fetched_at: '2026-05-26T00:00:00.000Z',
            provider: 'seed',
            is_stale: false,
          },
          {
            id: 'cal-3',
            scope: 'symbol',
            symbol_id: 'sym-1',
            symbol_code: '7203',
            display_name: 'Toyota',
            event_date: currentCalendarDate(10),
            event_time: null,
            timezone: 'Asia/Tokyo',
            event_type: 'ex_dividend',
            title: 'Toyota ex-dividend',
            importance: 'medium',
            source_type: 'seed',
            source_name: 'seed',
            source_label: '権利落ち',
            status: 'active',
            fetched_at: '2026-05-26T00:00:00.000Z',
            provider: 'seed',
            is_stale: false,
          },
          {
            id: 'cal-4',
            scope: 'symbol',
            symbol_id: 'sym-1',
            symbol_code: '7203',
            display_name: 'Toyota',
            event_date: currentCalendarDate(10),
            event_time: null,
            timezone: 'Asia/Tokyo',
            event_type: 'dividend_payment',
            title: 'Toyota dividend',
            importance: 'low',
            source_type: 'seed',
            source_name: 'seed',
            source_label: '配当支払',
            status: 'active',
            fetched_at: '2026-05-26T00:00:00.000Z',
            provider: 'seed',
            is_stale: false,
          },
        ],
        meta: {
          from: '2026-05-26',
          to: '2026-07-25',
          scope: 'symbol',
          symbol_id: 'sym-1',
          last_fetched_at: '2026-05-26T00:00:00.000Z',
          stale_event_count: 0,
          provider_statuses: [
            { provider: 'seed', status: 'succeeded', last_fetched_at: '2026-05-26T00:00:00.000Z', stale_event_count: 0 },
          ],
        },
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
    const sectionOrder = [
      '銘柄概要',
      '投資カレンダー',
      '最新AI論点カード',
      '最新アラート',
      'ストラテジー / 検証結果',
      '関連参照情報',
      'Research Note',
    ].map((heading) => html.indexOf(heading));
    expect(sectionOrder.every((index) => index >= 0)).toBe(true);
    expect(sectionOrder).toEqual([...sectionOrder].sort((a, b) => a - b));
    expect(html).toContain('Toyota thesis');
    expect(html).toContain('Margin improvement');
    expect(html).toContain('FX risk');
    expect(html).toContain('AI論点カードを再生成');
    expect(html).not.toContain('TradingView chart');
    expect(html).not.toContain('tv_chart_');
    expect(html).not.toContain('s3.tradingview.com');
    expect(html).toContain('投資カレンダー');
    expect(html).toContain('この銘柄に関係する予定を確認します。');
    expect(html).toContain('カレンダーを更新');
    expect(html).toContain('前月');
    expect(html).toContain('次月');
    expect(html).toContain('今日');
    expect(html).toContain('日</div>');
    expect(html).toContain('土</div>');
    expect(html).toContain('min-h-8');
    expect(html).toContain('ring-amber-300');
    expect(html).toContain('Toyota earnings');
    expect(html).toContain('決算 7203');
    expect(html).toContain('+1件');
    expect(html).toContain('group-hover:block');
    expect(html).toContain('group-focus-within:block');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('決算予定');
    expect(html).toContain('provider');
    expect(html).toContain('seed');
    expect(html).toContain('取得:');
    expect(html).toContain('銘柄概要');
    expect(html).toContain('現在値:');
    expect(html).toContain('TradingView:');
    expect(html).not.toContain('現在スナップショット');
    expect(html).not.toContain('ホームへ戻る');
    expect(html).toContain('ストラテジー / 検証結果');
    expect(html).toContain('この銘柄に適用したストラテジーと検証結果をここに集約します。');
    expect(html).toContain('保存済みストラテジー適用');
    expect(html).toContain('絞り込み');
    expect(html).toContain('状態');
    expect(html).toContain('active');
    expect(html).toContain('archived');
    expect(html).toContain('レポート');
    expect(html).toContain('すべて');
    expect(html).toContain('reportあり');
    expect(html).toContain('reportなし');
    expect(html).toContain('source');
    expect(html).toContain('CSV');
    expect(html).toContain('run');
    expect(html).toContain('run status');
    expect(html).toContain('strategy');
    expect(html).toContain('version');
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
    expect(html).toContain('検証サマリー');
    expect(html).toContain('詳細なrun / report履歴はApplicationDetail、個別レポートはBacktestDetailで確認します。');
    expect(html).toContain('run status:');
    expect(html).toContain('JP_STOCK / D');
    expect(html).toContain('7203 strategy report');
    expect(html).toContain('CSV import report');
    expect(html).toContain('source: <code>tradingview</code>');
    expect(html).toContain('CSV / internal reports');
    expect(html).toContain('internal backtest report');
    expect(html).toContain('7203 internal report');
    expect(html).toContain('href="/backtests/backtest_internal_1"');
    expect(html).toContain('run履歴を見る');
    expect(html).toContain('report履歴を見る');
    expect(html).toContain('href="/symbol-strategy-applications/application_1#runs"');
    expect(html).toContain('href="/symbol-strategy-applications/application_1#reports"');
    expect(html).toContain('改善版を作る');
    expect(html).toContain('<details class="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">');
    expect(html).toContain('TradingView CSVを取り込む');
    expect(html).toContain('必要なときだけ展開してCSVファイルまたはCSVテキストを取り込みます。');
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
    expect(html).toContain('この銘柄でストラテジー提案');
    expect(html).toContain('href="/strategy-lab?symbol_id=sym-1&amp;symbol_code=7203&amp;symbol_name=Toyota&amp;market=JP_STOCK&amp;timeframe=D&amp;return_to=%2Fsymbols%2Fsym-1"');
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
    expect(html).toContain('絞り込み');
    expect(html).toContain('状態');
    expect(html).toContain('レポート');
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
    expect(html).toContain('ニュース 0件');
    expect(html).toContain('適時開示 0件');
    expect(html).toContain('決算関連 0件');
    expect(html).not.toContain('news 0 / disclosure 0 / earnings 0');
    expect(html).toContain('参照情報は0件です。');
    expect(html).toContain('関連参照情報を再取得');
  });

  it('renders related references with readable labels instead of raw enum tags', () => {
    mockUseSWR.mockReset();
    mockUseRoute.mockReset();
    mockUseRoute.mockReturnValue([true, { symbolId: 'sym-1' }]);
    const symbolDataWithReferences = {
      ...baseSymbolData,
      related_references: [
        {
          id: 'ref-news-1',
          reference_type: 'news',
          title: '<a href="https://raw.example.test/rss">Toyota &amp; production update</a> <font color="#666">Nikkei</font>',
          source_name: 'news_provider_internal',
          source_url: 'https://example.com/toyota-news',
          published_at: '2026-04-21T06:00:00.000Z',
          summary_text: '<p>Production &amp; outlook <b>improved</b></p><script>alert("raw")</script> https://raw.example.test/rss',
        },
        {
          id: 'ref-disclosure-1',
          reference_type: 'disclosure',
          title: 'Toyota disclosure',
          source_name: 'tdnet',
          source_url: null,
          published_at: '2026-04-20T06:00:00.000Z',
          summary_text: 'Disclosure summary.',
        },
        {
          id: 'ref-earnings-1',
          reference_type: 'earnings',
          title: 'Toyota earnings note',
          source_name: 'earnings',
          source_url: null,
          published_at: '2026-04-19T06:00:00.000Z',
          summary_text: 'Earnings summary.',
        },
        {
          id: 'ref-other-1',
          reference_type: 'other',
          title: 'Unsafe source link note',
          source_name: 'internal_provider_raw',
          source_url: 'javascript:alert(1)',
          published_at: '2026-04-18T06:00:00.000Z',
          summary_text: null,
        },
      ],
    };
    mockUseSWR.mockImplementation((key: string) => {
      const common = getCommonSWRResult(key);
      if (common) return common;
      if (key === '/api/symbols/sym-1') {
        return { isLoading: false, error: null, data: symbolDataWithReferences };
      }
      return { isLoading: false, error: null, data: null, mutate: vi.fn() };
    });

    const html = renderToStaticMarkup(<SymbolDetail />);
    expect(html).toContain('ニュース 1件');
    expect(html).toContain('適時開示 1件');
    expect(html).toContain('決算関連 1件');
    expect(html).toContain('その他 1件');
    expect(html).toContain('Toyota &amp; production update Nikkei');
    expect(html).toContain('href="https://example.com/toyota-news"');
    expect((html.match(/https:\/\/example\.com\/toyota-news/g) ?? []).length).toBe(1);
    expect(html).toContain('外部リンク');
    expect(html).toContain('Production &amp; outlook improved');
    expect(html).not.toContain('&lt;a href');
    expect(html).not.toContain('&lt;font');
    expect(html).not.toContain('&lt;script');
    expect(html).not.toContain('raw.example.test/rss');
    expect(html).toContain('Toyota disclosure');
    expect(html).toContain('取得元: TDnet');
    expect(html).toContain('Toyota earnings note');
    expect(html).toContain('Earnings summary.');
    expect(html).toContain('Unsafe source link note');
    expect(html).not.toContain('javascript:alert');
    expect(html).not.toContain('[news]');
    expect(html).not.toContain('[disclosure]');
    expect(html).not.toContain('[earnings]');
    expect(html).not.toContain('news 1 / disclosure 1 / earnings 1');
    expect(html).not.toContain('news_provider_internal');
    expect(html).not.toContain('internal_provider_raw');
    const sectionOrder = [
      '銘柄概要',
      '投資カレンダー',
      '最新AI論点カード',
      '最新アラート',
      'ストラテジー / 検証結果',
      '関連参照情報',
      'Research Note',
    ].map((heading) => html.indexOf(heading));
    expect(sectionOrder.every((index) => index >= 0)).toBe(true);
    expect(sectionOrder).toEqual([...sectionOrder].sort((a, b) => a - b));
  });

  it('hides related reference summaries that duplicate the title', () => {
    mockUseSWR.mockReset();
    mockUseRoute.mockReset();
    mockUseRoute.mockReturnValue([true, { symbolId: 'sym-1' }]);
    const duplicateTitle = 'トヨタ自動車[7203]：一部報道について 2025年6月3日(適時開示) ：日経会社情報DIGITAL';
    const symbolDataWithReferences = {
      ...baseSymbolData,
      related_references: [
        {
          id: 'ref-duplicate-1',
          reference_type: 'news',
          title: duplicateTitle,
          source_name: 'news',
          source_url: 'https://example.com/duplicate-title',
          published_at: '2026-04-21T06:00:00.000Z',
          summary_text: duplicateTitle,
        },
        {
          id: 'ref-source-only-1',
          reference_type: 'news',
          title: `${duplicateTitle} - 日本経済新聞`,
          source_name: 'news',
          source_url: null,
          published_at: '2026-04-20T06:00:00.000Z',
          summary_text: `${duplicateTitle} 日本経済新聞`,
        },
        {
          id: 'ref-useful-1',
          reference_type: 'disclosure',
          title: 'Toyota disclosure',
          source_name: 'tdnet',
          source_url: null,
          published_at: '2026-04-19T06:00:00.000Z',
          summary_text: 'Operating margin improved and management raised guidance.',
        },
      ],
    };
    mockUseSWR.mockImplementation((key: string) => {
      const common = getCommonSWRResult(key);
      if (common) return common;
      if (key === '/api/symbols/sym-1') {
        return { isLoading: false, error: null, data: symbolDataWithReferences };
      }
      return { isLoading: false, error: null, data: null, mutate: vi.fn() };
    });

    const html = renderToStaticMarkup(<SymbolDetail />);
    expect((html.match(/トヨタ自動車\[7203\]：一部報道について 2025年6月3日\(適時開示\) ：日経会社情報DIGITAL/g) ?? []).length).toBe(2);
    expect(html).toContain(`${duplicateTitle} - 日本経済新聞`);
    expect(html).not.toContain(`${duplicateTitle} 日本経済新聞`);
    expect(html).toContain('Toyota disclosure');
    expect(html).toContain('Operating margin improved and management raised guidance.');
    expect(html).toContain('ニュース 2件');
    expect(html).toContain('適時開示 1件');
    expect(html).toContain('href="https://example.com/duplicate-title"');
    expect(html).not.toContain('[news]');
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
