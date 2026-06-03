import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const mockUseSWR = vi.fn();
const mockSetLocation = vi.fn();
const mockUseLocation = vi.fn();
const mockPatchApi = vi.fn();

vi.mock('swr', () => ({
  default: (...args: unknown[]) => mockUseSWR(...args),
}));

vi.mock('wouter', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  useLocation: () => mockUseLocation(),
}));

vi.mock('../api/client', () => ({
  swrFetcher: vi.fn(),
  patchApi: (...args: unknown[]) => mockPatchApi(...args),
}));

import StrategyVersionList, {
  applyAnnotationToLineageData,
  applyAnnotationToListData,
  buildLineageLayout,
  buildStrategyVersionsListUrl,
  parseStrategyVersionsListQuery,
  patchStrategyVersionAnnotation,
  resolveNextLineageZoom,
  resolvePriorityVersionIdFromHash,
} from './StrategyVersionList';

describe('StrategyVersionList', () => {
  it('renders version rows with api pagination data', () => {
    mockUseSWR.mockReset();
    mockUseLocation.mockReset();
    mockUseLocation.mockReturnValue(['/strategies/str-1/versions?q=RSI&status=generated&sort=updated_at&order=asc&page=2', mockSetLocation]);
    mockUseSWR.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        strategy: {
          id: 'str-1',
          title: '検証用ルール',
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        query: { q: 'RSI', status: 'generated', sort: 'updated_at', order: 'asc' },
        pagination: {
          page: 2,
          limit: 20,
          q: 'RSI',
          status: 'generated',
          sort: 'updated_at',
          order: 'asc',
          total: 21,
          has_next: false,
          has_prev: true,
        },
        strategy_versions: [
          {
            id: 'ver-2',
            strategy_id: 'str-1',
            cloned_from_version_id: 'ver-1',
            is_derived: true,
            has_forward_validation_note: true,
            forward_validation_note_updated_at: '2026-03-29T10:20:00.000Z',
            has_diff_from_clone: true,
            market: 'JP_STOCK',
            timeframe: 'D',
            status: 'generated',
            label: null,
            note: null,
            is_favorite: false,
            has_warnings: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      },
    });

    const html = renderToStaticMarkup(<StrategyVersionList params={{ strategyId: 'str-1' }} />);
    expect(html).toContain('ver-2');
    expect(html).toContain('このページ内の要確認差分: <strong>1</strong> 件');
    expect(html).toContain('このページ内の要確認差分かつ検証ノートあり: <strong>1</strong> 件');
    expect(html).toContain('このページ内の最新ノート: <strong>1</strong> 件');
    expect(html).toContain('このページ内の今読む候補: <strong>1</strong> 件');
    expect(html).toContain('今読む候補の先頭へ移動');
    expect(html).not.toContain('次の今読む候補へ');
    expect(html).toContain('最新ノート更新:');
    expect(html).toContain('href="#priority-version-ver-2"');
    expect(html).not.toContain('次の最優先確認へ');
    expect(html).toContain('要確認差分');
    expect(html).toContain('検証ノートあり');
    expect(html).toContain('ノート更新目安:');
    expect(html).toContain('/strategy-versions/ver-2?return=%2Fstrategies%2Fstr-1%2Fversions%3Fq%3DRSI%26status%3Dgenerated%26sort%3Dupdated_at%26order%3Dasc%26page%3D2');
    expect(html).toContain('value="RSI"');
    expect(mockUseSWR).toHaveBeenCalledWith('/api/strategies/str-1/versions?page=2&limit=20&q=RSI&status=generated&sort=updated_at&order=asc', expect.any(Function));
  });

  it('renders no-base badge when version has no compare source', () => {
    mockUseSWR.mockReset();
    mockUseLocation.mockReset();
    mockUseLocation.mockReturnValue(['/strategies/str-2/versions?page=1', mockSetLocation]);
    mockUseSWR.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        strategy: {
          id: 'str-2',
          title: '派生なしルール',
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        query: { q: '', status: '', sort: 'created_at', order: 'desc' },
        pagination: {
          page: 1,
          limit: 20,
          q: '',
          status: '',
          sort: 'created_at',
          order: 'desc',
          total: 1,
          has_next: false,
          has_prev: false,
        },
        strategy_versions: [
          {
            id: 'ver-10',
            strategy_id: 'str-2',
            cloned_from_version_id: null,
            is_derived: false,
            has_forward_validation_note: false,
            forward_validation_note_updated_at: null,
            has_diff_from_clone: null,
            market: 'JP_STOCK',
            timeframe: 'D',
            status: 'draft',
            label: null,
            note: null,
            is_favorite: false,
            has_warnings: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      },
    });

    const html = renderToStaticMarkup(<StrategyVersionList params={{ strategyId: 'str-2' }} />);
    expect(html).toContain('ver-10');
    expect(html).toContain('このページ内の要確認差分: <strong>0</strong> 件');
    expect(html).toContain('このページ内の検証ノートあり: <strong>0</strong> 件');
    expect(html).toContain('このページ内の要確認差分かつ検証ノートあり: <strong>0</strong> 件');
    expect(html).toContain('このページ内の最新ノート: <strong>0</strong> 件');
    expect(html).toContain('このページ内の今読む候補: <strong>0</strong> 件');
    expect(html).not.toContain('最新ノート更新:');
    expect(html).not.toContain('最優先確認の先頭へ移動');
    expect(html).not.toContain('次の最優先確認へ');
    expect(html).not.toContain('今読む候補の先頭へ移動');
    expect(html).not.toContain('次の今読む候補へ');
    expect(html).not.toContain('検証ノートあり</span>');
    expect(html).not.toContain('ノート更新目安:');
    expect(html).not.toContain('`要確認差分` バッジ付き version を優先確認してください');
  });

  it('parses q/page from URL query and builds list URL with q', () => {
    expect(parseStrategyVersionsListQuery('/strategies/str-1/versions?q=MA&status=generated&sort=updated_at&order=asc&page=3')).toEqual({
      q: 'MA',
      page: 3,
      status: 'generated',
      sort: 'updated_at',
      order: 'asc',
      favorite: false,
    });
    expect(parseStrategyVersionsListQuery('/strategies/str-1/versions?page=abc&q=&favorite=true')).toEqual({
      q: '',
      page: 1,
      status: '',
      sort: 'created_at',
      order: 'desc',
      favorite: true,
    });

    expect(buildStrategyVersionsListUrl('str-1', 1, '')).toBe('/strategies/str-1/versions');
    expect(buildStrategyVersionsListUrl('str-1', 1, 'RSI')).toBe('/strategies/str-1/versions?q=RSI');
    expect(buildStrategyVersionsListUrl('str-1', 2, 'RSI', 'generated', 'updated_at', 'asc'))
      .toBe('/strategies/str-1/versions?q=RSI&status=generated&sort=updated_at&order=asc&page=2');
    expect(buildStrategyVersionsListUrl('str-1', 1, '', '', 'created_at', 'desc', true))
      .toBe('/strategies/str-1/versions?favorite=true');
  });

  it('resolves priority target id only for eligible hash + version combination', () => {
    const versions = [
      {
        id: 'ver-priority',
        is_derived: true,
        has_diff_from_clone: true,
        has_forward_validation_note: true,
      },
      {
        id: 'ver-normal',
        is_derived: false,
        has_diff_from_clone: null,
        has_forward_validation_note: false,
      },
    ];

    expect(resolvePriorityVersionIdFromHash('#priority-version-ver-priority', versions)).toBe('ver-priority');
    expect(resolvePriorityVersionIdFromHash('#priority-version-ver-normal', versions)).toBeNull();
    expect(resolvePriorityVersionIdFromHash('#other-hash', versions)).toBeNull();
    expect(resolvePriorityVersionIdFromHash('#priority-version-%E0%A4%A', versions)).toBeNull();
  });

  it('shows combined priority signal for versions with both diff and forward note', () => {
    mockUseSWR.mockReset();
    mockUseLocation.mockReset();
    mockUseLocation.mockReturnValue(['/strategies/str-3/versions', mockSetLocation]);
    mockUseSWR.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        strategy: {
          id: 'str-3',
          title: '検証優先度テスト',
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        query: { q: '', status: '', sort: 'created_at', order: 'desc' },
        pagination: {
          page: 1,
          limit: 20,
          q: '',
          status: '',
          sort: 'created_at',
          order: 'desc',
          total: 5,
          has_next: false,
          has_prev: false,
        },
        strategy_versions: [
          {
            id: 'ver-priority',
            strategy_id: 'str-3',
            cloned_from_version_id: 'ver-base',
            is_derived: true,
            has_forward_validation_note: true,
            forward_validation_note_updated_at: '2026-03-29T09:00:00.000Z',
            has_diff_from_clone: true,
            market: 'JP_STOCK',
            timeframe: 'D',
            status: 'generated',
            label: null,
            note: null,
            is_favorite: false,
            has_warnings: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: 'ver-diff-only',
            strategy_id: 'str-3',
            cloned_from_version_id: 'ver-base',
            is_derived: true,
            has_forward_validation_note: false,
            forward_validation_note_updated_at: null,
            has_diff_from_clone: true,
            market: 'JP_STOCK',
            timeframe: 'D',
            status: 'generated',
            label: null,
            note: null,
            is_favorite: false,
            has_warnings: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: 'ver-priority-2',
            strategy_id: 'str-3',
            cloned_from_version_id: 'ver-base',
            is_derived: true,
            has_forward_validation_note: true,
            forward_validation_note_updated_at: '2026-03-29T09:00:00.000Z',
            has_diff_from_clone: true,
            market: 'JP_STOCK',
            timeframe: 'D',
            status: 'generated',
            label: null,
            note: null,
            is_favorite: false,
            has_warnings: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: 'ver-note-only',
            strategy_id: 'str-3',
            cloned_from_version_id: null,
            is_derived: false,
            has_forward_validation_note: true,
            forward_validation_note_updated_at: '2026-03-28T08:00:00.000Z',
            has_diff_from_clone: null,
            market: 'JP_STOCK',
            timeframe: 'D',
            status: 'draft',
            label: null,
            note: null,
            is_favorite: false,
            has_warnings: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: 'ver-normal',
            strategy_id: 'str-3',
            cloned_from_version_id: null,
            is_derived: false,
            has_forward_validation_note: false,
            forward_validation_note_updated_at: null,
            has_diff_from_clone: null,
            market: 'JP_STOCK',
            timeframe: 'D',
            status: 'draft',
            label: null,
            note: null,
            is_favorite: false,
            has_warnings: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      },
    });

    const html = renderToStaticMarkup(<StrategyVersionList params={{ strategyId: 'str-3' }} />);
    expect(html).toContain('このページ内の要確認差分: <strong>3</strong> 件');
    expect(html).toContain('このページ内の検証ノートあり: <strong>3</strong> 件');
    expect(html).toContain('このページ内の要確認差分かつ検証ノートあり: <strong>2</strong> 件');
    expect(html).toContain('このページ内の最新ノート: <strong>2</strong> 件');
    expect(html).toContain('このページ内の今読む候補: <strong>2</strong> 件');
    expect(html).toContain('今読む候補の先頭へ移動');
    expect(html).toContain('次の今読む候補へ');
    expect(html).toContain('最優先確認の先頭へ移動');
    expect(html).toContain('次の最優先確認へ');
    expect(html).toContain('id="priority-version-ver-priority"');
    expect(html).toContain('href="#priority-version-ver-priority"');
    expect(html).toContain('`最優先確認` バッジ付き version から確認してください');
    expect(html).toContain('ver-priority');
    expect(html).toContain('最優先確認');
    expect(html).toContain('今読む候補');
  });

  it('renders lineage tree section with clickable detail nodes and annotation label', () => {
    mockUseSWR.mockReset();
    mockUseLocation.mockReset();
    mockUseLocation.mockReturnValue(['/strategies/str-tree/versions?favorite=true', mockSetLocation]);
    mockUseSWR.mockImplementation((key: string) => {
      if (key.includes('/version-lineage')) {
        return {
          error: null,
          data: {
            strategy: {
              id: 'str-tree',
              title: 'tree',
              status: 'active',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            nodes: [
              {
                id: 'ver-root',
                strategy_id: 'str-tree',
                cloned_from_version_id: null,
                annotation: { label: '起点', note: null, is_favorite: false },
                status: 'draft',
                market: 'JP_STOCK',
                timeframe: 'D',
                has_warnings: false,
                has_forward_validation_note: false,
                has_diff_from_clone: null,
                backtest_count: 0,
                application_count: 0,
                created_at: '2026-01-01T00:00:00.000Z',
                updated_at: '2026-01-01T00:00:00.000Z',
              },
              {
                id: 'ver-child',
                strategy_id: 'str-tree',
                cloned_from_version_id: 'ver-root',
                annotation: { label: '本命ラベル', note: 'memo', is_favorite: true },
                status: 'generated',
                market: 'JP_STOCK',
                timeframe: '4H',
                has_warnings: false,
                has_forward_validation_note: true,
                has_diff_from_clone: true,
                backtest_count: 0,
                application_count: 0,
                created_at: '2026-01-02T00:00:00.000Z',
                updated_at: '2026-01-02T00:00:00.000Z',
              },
            ],
            edges: [{ from_version_id: 'ver-root', to_version_id: 'ver-child', relation: 'clone' }],
            meta: { limit: 300, total: 2, truncated: false },
          },
        };
      }
      return {
        isLoading: false,
        error: null,
        data: {
          strategy: {
            id: 'str-tree',
            title: 'tree',
            status: 'active',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          query: { q: '', status: '', sort: 'created_at', order: 'desc', favorite: true },
          pagination: {
            page: 1,
            limit: 20,
            q: '',
            status: '',
            sort: 'created_at',
            order: 'desc',
            favorite: true,
            total: 1,
            has_next: false,
            has_prev: false,
          },
          strategy_versions: [
            {
              id: 'ver-child',
              strategy_id: 'str-tree',
              cloned_from_version_id: 'ver-root',
              is_derived: true,
              has_forward_validation_note: true,
              forward_validation_note_updated_at: '2026-01-02T00:00:00.000Z',
              has_diff_from_clone: true,
              market: 'JP_STOCK',
              timeframe: '4H',
              status: 'generated',
              label: '本命ラベル',
              note: 'memo',
              is_favorite: true,
              has_warnings: false,
              created_at: '2026-01-02T00:00:00.000Z',
              updated_at: '2026-01-02T00:00:00.000Z',
            },
          ],
        },
      };
    });

    const html = renderToStaticMarkup(<StrategyVersionList params={{ strategyId: 'str-tree' }} />);
    expect(html).toContain('履歴ツリー');
    expect(html).toContain('縮小');
    expect(html).toContain('100%');
    expect(html).toContain('拡大');
    expect(html).toContain('本命ラベル');
    expect(html).toContain('/strategy-versions/ver-child?return=%2Fstrategies%2Fstr-tree%2Fversions%3Ffavorite%3Dtrue');
    expect(mockUseSWR).toHaveBeenCalledWith('/api/strategies/str-tree/versions?page=1&limit=20&favorite=true&sort=created_at&order=desc', expect.any(Function));
  });

  it('calculates lineage layout and zoom steps', () => {
    expect(resolveNextLineageZoom(1, 'in')).toBe(1.2);
    expect(resolveNextLineageZoom(1, 'out')).toBe(0.8);
    expect(resolveNextLineageZoom(1.8, 'in')).toBe(1.8);
    expect(resolveNextLineageZoom(0.6, 'out')).toBe(0.6);
    expect(resolveNextLineageZoom(1.4, 'reset')).toBe(1);

    const layout = buildLineageLayout({
      strategy: {
        id: 'str-layout',
        title: 'layout',
        status: 'active',
        created_at: '',
        updated_at: '',
      },
      nodes: [
        {
          id: 'root',
          strategy_id: 'str-layout',
          cloned_from_version_id: null,
          annotation: { label: null, note: null, is_favorite: false },
          status: 'draft',
          market: 'JP_STOCK',
          timeframe: 'D',
          has_warnings: false,
          has_forward_validation_note: false,
          has_diff_from_clone: null,
          backtest_count: 0,
          application_count: 0,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'child',
          strategy_id: 'str-layout',
          cloned_from_version_id: 'root',
          annotation: { label: null, note: null, is_favorite: false },
          status: 'draft',
          market: 'JP_STOCK',
          timeframe: 'D',
          has_warnings: false,
          has_forward_validation_note: false,
          has_diff_from_clone: false,
          backtest_count: 0,
          application_count: 0,
          created_at: '2026-01-02T00:00:00.000Z',
          updated_at: '2026-01-02T00:00:00.000Z',
        },
      ],
      edges: [{ from_version_id: 'root', to_version_id: 'child', relation: 'clone' }],
      meta: { limit: 300, total: 2, truncated: false },
    });

    expect(layout.nodes.find((node) => node.id === 'child')!.x).toBeGreaterThan(layout.nodes.find((node) => node.id === 'root')!.x);
    expect(layout.edges).toHaveLength(1);
  });

  it('calls annotation PATCH helper and applies annotation cache updates', async () => {
    mockPatchApi.mockReset();
    mockPatchApi.mockResolvedValue({ annotation: { label: '本命', note: '確認', is_favorite: true } });

    await expect(patchStrategyVersionAnnotation('ver-1', { is_favorite: true })).resolves.toEqual({
      annotation: { label: '本命', note: '確認', is_favorite: true },
    });
    expect(mockPatchApi).toHaveBeenCalledWith('/api/strategy-versions/ver-1/annotation', { is_favorite: true });

    const list = applyAnnotationToListData({
      strategy: { id: 'str-1', title: 's', status: 'active', created_at: '', updated_at: '' },
      query: { q: '', status: '', sort: 'created_at', order: 'desc' },
      pagination: { page: 1, limit: 20, q: '', status: '', sort: 'created_at', order: 'desc', total: 1, has_next: false, has_prev: false },
      strategy_versions: [
        {
          id: 'ver-1',
          strategy_id: 'str-1',
          cloned_from_version_id: null,
          is_derived: false,
          has_forward_validation_note: false,
          forward_validation_note_updated_at: null,
          has_diff_from_clone: null,
          market: 'JP_STOCK',
          timeframe: 'D',
          status: 'draft',
          label: null,
          note: null,
          is_favorite: false,
          has_warnings: false,
          created_at: '',
          updated_at: '',
        },
      ],
    }, 'ver-1', { label: '本命', note: '確認', is_favorite: true });
    expect(list?.strategy_versions[0].label).toBe('本命');
    expect(list?.strategy_versions[0].is_favorite).toBe(true);

    const lineage = applyAnnotationToLineageData({
      strategy: { id: 'str-1', title: 's', status: 'active', created_at: '', updated_at: '' },
      nodes: [
        {
          id: 'ver-1',
          strategy_id: 'str-1',
          cloned_from_version_id: null,
          annotation: { label: null, note: null, is_favorite: false },
          status: 'draft',
          market: 'JP_STOCK',
          timeframe: 'D',
          has_warnings: false,
          has_forward_validation_note: false,
          has_diff_from_clone: null,
          backtest_count: 0,
          application_count: 0,
          created_at: '',
          updated_at: '',
        },
      ],
      edges: [],
      meta: { limit: 300, total: 1, truncated: false },
    }, 'ver-1', { label: '本命', note: '確認', is_favorite: true });
    expect(lineage?.nodes[0].annotation.label).toBe('本命');
    expect(lineage?.nodes[0].annotation.is_favorite).toBe(true);
  });
});
