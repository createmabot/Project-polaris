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
  patchApi: vi.fn(async () => ({})),
  swrFetcher: vi.fn(),
}));

import StrategyDetail from './StrategyDetail';

const versionsData = {
  strategy: {
    id: 'strategy_1',
    title: 'Breakout strategy',
    status: 'active',
    created_at: '2026-05-01T00:00:00.000Z',
    updated_at: '2026-05-02T00:00:00.000Z',
  },
  query: { q: '', status: '', sort: 'updated_at', order: 'desc' },
  pagination: {
    page: 1,
    limit: 50,
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
      id: 'ver-1',
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

const emptyApplicationsData = {
  strategy: { id: 'strategy_1', title: 'Breakout strategy', status: 'active' },
  query: { status: 'active', sort: 'updated_at', order: 'desc' },
  pagination: { page: 1, limit: 20, total: 0, has_next: false, has_prev: false },
  applications: [],
};

const applicationItem = {
  id: 'application_1',
  status: 'active',
  source: 'manual',
  memo: null,
  created_at: '2026-05-03T00:00:00.000Z',
  updated_at: '2026-05-04T00:00:00.000Z',
  symbol: {
    id: 'sym-1',
    symbol: 'TYO:7203',
    symbol_code: '7203',
    display_name: 'Toyota',
    market_code: 'JP',
    tradingview_symbol: 'TYO:7203',
  },
  strategy_version: {
    id: 'ver-1',
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
    backtest_id: 'backtest_1',
    backtest_import_id: 'import_1',
    internal_backtest_execution_id: null,
    created_at: '2026-05-04T00:00:00.000Z',
    updated_at: '2026-05-04T00:00:00.000Z',
  },
  latest_backtest_report: {
    id: 'backtest_1',
    title: '7203 strategy report',
    status: 'imported',
    execution_source: 'tradingview',
    market: 'JP_STOCK',
    timeframe: 'D',
    created_at: '2026-05-04T00:00:00.000Z',
    updated_at: '2026-05-04T00:00:00.000Z',
  },
  run_count: 1,
};

const applicationsData = {
  strategy: { id: 'strategy_1', title: 'Breakout strategy', status: 'active' },
  query: { status: 'active', sort: 'updated_at', order: 'desc' },
  pagination: { page: 1, limit: 20, total: 1, has_next: false, has_prev: false },
  applications: [applicationItem],
};

const archivedApplicationsData = {
  ...applicationsData,
  query: { status: 'archived', sort: 'updated_at', order: 'desc' },
  applications: [{ ...applicationItem, id: 'application_archived', status: 'archived' }],
};

function mockSWR(applications: any = emptyApplicationsData) {
  mockUseSWR.mockImplementation((key: string) => {
    if (key === '/api/strategies/strategy_1/symbol-applications?status=active&page=1&limit=20&sort=updated_at&order=desc') {
      return { isLoading: false, error: null, data: applications, mutate: vi.fn() };
    }
    return { isLoading: false, error: null, data: versionsData, mutate: vi.fn() };
  });
}

describe('StrategyDetail', () => {
  it('renders strategy versions and fetches related application data', () => {
    mockUseSWR.mockReset();
    mockUseRoute.mockReset();
    mockUseRoute.mockReturnValue([true, { strategyId: 'strategy_1' }]);
    mockSWR();

    const html = renderToStaticMarkup(<StrategyDetail />);
    expect(html).toContain('Breakout strategy');
    expect(html).toContain('strategy_id: <code>strategy_1</code>');
    expect(html).toContain('href="/strategies/strategy_1/versions"');
    expect(html).toContain('href="/strategy-versions/ver-1"');
    expect(html).toContain('JP_STOCK / D');
    expect(html).toContain('適用済み銘柄');
    expect(html).toContain('この strategy はまだ銘柄に適用されていません。');
    expect(html).toContain('関連検証レポート');
    expect(html).toContain('関連検証レポートはまだありません。');
    expect(html).toContain('表示対象');
    expect(html).toContain('有効');
    expect(html).toContain('アーカイブ');
    expect(html).toContain('すべて');
    expect(mockUseSWR).toHaveBeenCalledWith(
      '/api/strategies/strategy_1/versions?page=1&limit=50&sort=updated_at&order=desc',
      expect.any(Function),
    );
    expect(mockUseSWR).toHaveBeenCalledWith(
      '/api/strategies/strategy_1/symbol-applications?status=active&page=1&limit=20&sort=updated_at&order=desc',
      expect.any(Function),
    );
  });

  it('renders applied symbols and related reports', () => {
    mockUseSWR.mockReset();
    mockUseRoute.mockReset();
    mockUseRoute.mockReturnValue([true, { strategyId: 'strategy_1' }]);
    mockSWR(applicationsData);

    const html = renderToStaticMarkup(<StrategyDetail />);
    expect(html).toContain('適用済み銘柄');
    expect(html).toContain('Toyota');
    expect(html).toContain('href="/symbols/sym-1"');
    expect(html).toContain('runs: 1');
    expect(html).toContain('アーカイブ');
    expect(html).toContain('関連検証レポート');
    expect(html).toContain('7203 strategy report');
    expect(html).toContain('href="/backtests/backtest_1"');
  });

  it('renders restore action for archived applications', () => {
    mockUseSWR.mockReset();
    mockUseRoute.mockReset();
    mockUseRoute.mockReturnValue([true, { strategyId: 'strategy_1' }]);
    mockSWR(archivedApplicationsData);

    const html = renderToStaticMarkup(<StrategyDetail />);
    expect(html).toContain('application: <code>application_archived</code> / status: archived');
    expect(html).toContain('復元');
  });
});