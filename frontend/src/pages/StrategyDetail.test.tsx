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

import StrategyDetail from './StrategyDetail';

describe('StrategyDetail', () => {
  it('renders strategy data and version rows with stable links', () => {
    mockUseSWR.mockReset();
    mockUseRoute.mockReset();
    mockUseRoute.mockReturnValue([true, { strategyId: 'strategy_1' }]);
    mockUseSWR.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
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
      },
    });

    const html = renderToStaticMarkup(<StrategyDetail />);
    expect(html).toContain('ストラテジー詳細');
    expect(html).toContain('押し目買い戦略');
    expect(html).toContain('strategy_id: <code>strategy_1</code>');
    expect(html).toContain('アーカイブ</button>');
    expect(html).toContain('このストラテジー定義の version、関連検証レポート、適用済み銘柄をここに集約します。');
    expect(html).toContain('version 一覧を開く');
    expect(html).toContain('href="/strategies/strategy_1/versions"');
    expect(html).toContain('href="/strategy-versions/ver-1"');
    expect(html).toContain('JP_STOCK / D');
    expect(html).toContain('href="/strategy-lab"');
    expect(html).toContain('href="/backtests"');
    expect(html).toContain('related reports は準備中です。');
    expect(html).toContain('applied symbols は準備中です。');
    expect(html).toContain('favorite / hard delete は準備中です。archive / restore は status 操作として利用できます。');
    expect(html).toContain('BacktestDetail は個別検証レポート詳細として継続し、この画面には吸収しません。');
    expect(mockUseSWR).toHaveBeenCalledWith(
      '/api/strategies/strategy_1/versions?page=1&limit=50&sort=updated_at&order=desc',
      expect.any(Function),
    );
  });

  it('renders empty version state', () => {
    mockUseSWR.mockReset();
    mockUseRoute.mockReset();
    mockUseRoute.mockReturnValue([true, { strategyId: 'strategy_empty' }]);
    mockUseSWR.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        strategy: {
          id: 'strategy_empty',
          title: '空の戦略',
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
          total: 0,
          has_next: false,
          has_prev: false,
        },
        strategy_versions: [],
      },
    });

    const html = renderToStaticMarkup(<StrategyDetail />);
    expect(html).toContain('空の戦略');
    expect(html).toContain('このストラテジーにはまだ version がありません。');
  });

  it('renders restore action for archived strategy', () => {
    mockUseSWR.mockReset();
    mockUseRoute.mockReset();
    mockUseRoute.mockReturnValue([true, { strategyId: 'strategy_archived' }]);
    mockUseSWR.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        strategy: {
          id: 'strategy_archived',
          title: '休止中の戦略',
          status: 'archived',
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
          total: 0,
          has_next: false,
          has_prev: false,
        },
        strategy_versions: [],
      },
    });

    const html = renderToStaticMarkup(<StrategyDetail />);
    expect(html).toContain('休止中の戦略');
    expect(html).toContain('archived');
    expect(html).toContain('復元</button>');
    expect(html).toContain('このストラテジーにはまだ version がありません。');
  });
});
