import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const mockUseSWR = vi.fn();
const mockUseRoute = vi.fn();

vi.mock('swr', () => ({
  default: (...args: unknown[]) => mockUseSWR(...args),
}));

vi.mock('wouter', () => ({
  Link: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
  useRoute: (...args: unknown[]) => mockUseRoute(...args),
}));

vi.mock('../api/client', () => ({
  swrFetcher: vi.fn(),
}));

import ApplicationDetail from './ApplicationDetail';

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

const applicationSummary = {
  id: 'application_1',
  status: 'active',
  source: 'manual',
  memo: null,
  symbol: {
    id: 'sym-1',
    symbol: 'TYO:7203',
    symbol_code: '7203',
    display_name: 'Toyota',
  },
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
  },
  created_at: '2026-05-01T00:00:00.000Z',
  updated_at: '2026-05-04T00:00:00.000Z',
};

const runsFixture = {
  application: {
    ...applicationSummary,
    run_count: 2,
  },
  query: {
    run_type: null,
    run_status: null,
    sort: 'created_at',
    order: 'desc',
  },
  pagination: {
    page: 1,
    limit: 20,
    total: 2,
    has_next: true,
    has_prev: false,
  },
  runs: [
    {
      id: 'run_internal_1',
      run_type: 'internal_backtest',
      status: 'succeeded',
      created_at: '2026-05-04T00:00:00.000Z',
      updated_at: '2026-05-04T00:10:00.000Z',
      started_at: '2026-05-04T00:01:00.000Z',
      finished_at: '2026-05-04T00:10:00.000Z',
      error_code: null,
      error_message: null,
      linked_backtest: {
        id: 'backtest_internal_1',
        title: '7203 internal report',
        status: 'completed',
        execution_source: 'internal_backtest',
        market: 'JP_STOCK',
        timeframe: 'D',
        created_at: '2026-05-04T00:00:00.000Z',
        updated_at: '2026-05-04T00:10:00.000Z',
      },
      linked_backtest_import: null,
      linked_internal_backtest_execution: {
        id: 'execution_1',
        status: 'succeeded',
        requested_at: '2026-05-04T00:00:00.000Z',
        started_at: '2026-05-04T00:01:00.000Z',
        finished_at: '2026-05-04T00:10:00.000Z',
        engine_version: 'ibtx-v0',
        error_code: null,
      },
    },
    {
      id: 'run_csv_1',
      run_type: 'csv_import',
      status: 'succeeded',
      created_at: '2026-05-03T00:00:00.000Z',
      updated_at: '2026-05-03T00:00:00.000Z',
      started_at: '2026-05-03T00:00:00.000Z',
      finished_at: '2026-05-03T00:00:00.000Z',
      error_code: null,
      error_message: null,
      linked_backtest: {
        id: 'backtest_csv_1',
        title: '7203 CSV report',
        status: 'imported',
        execution_source: 'tradingview',
        market: 'JP_STOCK',
        timeframe: 'D',
        created_at: '2026-05-03T00:00:00.000Z',
        updated_at: '2026-05-03T00:00:00.000Z',
      },
      linked_backtest_import: {
        id: 'import_1',
        backtest_id: 'backtest_csv_1',
        file_name: 'summary.csv',
        parse_status: 'parsed',
        parse_error: null,
        created_at: '2026-05-03T00:00:00.000Z',
        updated_at: '2026-05-03T00:00:00.000Z',
      },
      linked_internal_backtest_execution: null,
    },
  ],
};

const reportsFixture = {
  application: {
    ...applicationSummary,
    report_count: 2,
  },
  query: {
    execution_source: null,
    run_type: null,
    status: null,
    with_metrics: true,
    sort: 'created_at',
    order: 'desc',
  },
  pagination: {
    page: 1,
    limit: 20,
    total: 2,
    has_next: true,
    has_prev: false,
  },
  reports: [
    {
      id: 'backtest_internal_1',
      title: '7203 internal report',
      status: 'completed',
      execution_source: 'internal_backtest',
      report_origin: 'internal_backtest',
      market: 'JP_STOCK',
      timeframe: 'D',
      created_at: '2026-05-04T00:00:00.000Z',
      updated_at: '2026-05-04T00:10:00.000Z',
      linked_run: {
        id: 'run_internal_1',
        run_type: 'internal_backtest',
        status: 'succeeded',
        created_at: '2026-05-04T00:00:00.000Z',
        updated_at: '2026-05-04T00:10:00.000Z',
        started_at: '2026-05-04T00:01:00.000Z',
        finished_at: '2026-05-04T00:10:00.000Z',
      },
      linked_internal_backtest_execution: {
        id: 'execution_1',
        status: 'succeeded',
        requested_at: '2026-05-04T00:00:00.000Z',
        started_at: '2026-05-04T00:01:00.000Z',
        finished_at: '2026-05-04T00:10:00.000Z',
        engine_version: 'ibtx-v0',
        error_code: null,
      },
      metrics: {
        period_from: '2026-01-01',
        period_to: '2026-02-01',
        trade_count: 4,
        total_return_percent: 8.9,
        price_change_percent: 5.1,
        max_drawdown_percent: 10.2,
        profit_factor: 1.42,
        win_rate: 55,
        source: 'backtest.strategy_snapshot_json.result_summary',
      },
      importless_report: true,
      backtest_detail_link: {
        path: '/backtests/backtest_internal_1',
        label: 'BacktestDetail',
      },
    },
  ],
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
  return null;
}

describe('ApplicationDetail', () => {
  it('renders application run and report history', () => {
    mockUseSWR.mockReset();
    mockUseRoute.mockReset();
    mockUseRoute.mockReturnValue([true, { applicationId: 'application_1' }]);
    mockUseSWR.mockImplementation((key: string) => {
      const common = getCommonSWRResult(key);
      if (common) return common;
      if (key === '/api/symbol-strategy-applications/application_1/runs?page=1&limit=20&sort=created_at&order=desc') {
        return { isLoading: false, error: null, data: runsFixture };
      }
      if (key === '/api/symbol-strategy-applications/application_1/reports?page=1&limit=20&sort=created_at&order=desc') {
        return { isLoading: false, error: null, data: reportsFixture };
      }
      return { isLoading: false, error: null, data: null };
    });

    const html = renderToStaticMarkup(<ApplicationDetail />);
    expect(html).toContain('Toyota / 押し目買い戦略');
    expect(html).toContain('application summary');
    expect(html).toContain('application_id:</strong> <code>application_1</code>');
    expect(html).toContain('run count:</strong> 2');
    expect(html).toContain('run履歴');
    expect(html).toContain('run履歴 filter');
    expect(html).toContain('run type');
    expect(html).toContain('run status');
    expect(html).toContain('queued');
    expect(html).toContain('running');
    expect(html).toContain('succeeded');
    expect(html).toContain('failed');
    expect(html).toContain('canceled');
    expect(html).toContain('run 2 / 2 件を表示中');
    expect(html).toContain('page 1');
    expect(html).toContain('前へ');
    expect(html).toContain('次へ');
    expect(html).toContain('run_internal_1');
    expect(html).toContain('linked execution');
    expect(html).toContain('execution_1');
    expect(html).toContain('linked import');
    expect(html).toContain('summary.csv');
    expect(html).toContain('report履歴');
    expect(html).toContain('report履歴 filter');
    expect(html).toContain('execution source');
    expect(html).toContain('report status');
    expect(html).toContain('TradingView');
    expect(html).toContain('imported');
    expect(html).toContain('completed');
    expect(html).toContain('import_failed');
    expect(html).toContain('report 1 / 2 件を表示中');
    expect(html).toContain('metrics の - は、CSV parsed summary または internal result_summary から取得できない項目です。');
    expect(html).toContain('CSV import report は parsed summary、internal backtest report は result_summary がない場合に一部 metrics が未表示になります。');
    expect(html).toContain('report count: 2');
    expect(html).toContain('7203 internal report');
    expect(html).toContain('total_return_percent');
    expect(html).toContain('backtest.strategy_snapshot_json.result_summary');
    expect(html).toContain('href="/backtests/backtest_internal_1"');
    expect(html).toContain('href="/symbols/sym-1"');
    expect(mockUseSWR).toHaveBeenCalledWith(
      '/api/symbol-strategy-applications/application_1/runs?page=1&limit=20&sort=created_at&order=desc',
      expect.any(Function),
    );
    expect(mockUseSWR).toHaveBeenCalledWith(
      '/api/symbol-strategy-applications/application_1/reports?page=1&limit=20&sort=created_at&order=desc',
      expect.any(Function),
    );
  });

  it('renders not found error state', () => {
    mockUseSWR.mockReset();
    mockUseRoute.mockReset();
    mockUseRoute.mockReturnValue([true, { applicationId: 'missing' }]);
    mockUseSWR.mockImplementation((key: string) => {
      const common = getCommonSWRResult(key);
      if (common) return common;
      if (key === '/api/symbol-strategy-applications/missing/runs?page=1&limit=20&sort=created_at&order=desc') {
        return { isLoading: false, error: { code: 'NOT_FOUND', status: 404 }, data: null };
      }
      return { isLoading: false, error: null, data: null };
    });

    const html = renderToStaticMarkup(<ApplicationDetail />);
    expect(html).toContain('application が見つかりません。');
  });
});
