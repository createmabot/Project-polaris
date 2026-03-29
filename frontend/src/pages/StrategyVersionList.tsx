import { FormEvent, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Link, useLocation } from 'wouter';
import { swrFetcher } from '../api/client';
import { StrategyVersionListData } from '../api/types';

type StrategyVersionListProps = {
  params: { strategyId: string };
};

const PAGE_SIZE = 20;
const PRIORITY_VERSION_HASH_PREFIX = '#priority-version-';
const NOTE_FRESHNESS_BADGE_LABEL = '最新ノート';

function formatNoteFreshness(noteUpdatedAt: string | null): string {
  if (!noteUpdatedAt) {
    return '-';
  }
  const updated = new Date(noteUpdatedAt);
  if (Number.isNaN(updated.getTime())) {
    return '更新時刻不明';
  }
  return `${updated.toLocaleDateString('ja-JP')} 更新`;
}

export type StrategyVersionsListQueryState = {
  page: number;
  q: string;
  status: string;
  sort: 'created_at' | 'updated_at';
  order: 'asc' | 'desc';
};

export function resolvePriorityVersionIdFromHash(
  hash: string,
  versions: Array<{
    id: string;
    is_derived: boolean;
    has_diff_from_clone: boolean | null;
    has_forward_validation_note: boolean;
  }>,
): string | null {
  if (!hash.startsWith(PRIORITY_VERSION_HASH_PREFIX)) {
    return null;
  }

  const rawId = hash.slice(PRIORITY_VERSION_HASH_PREFIX.length).trim();
  if (!rawId) {
    return null;
  }

  let decodedId: string;
  try {
    decodedId = decodeURIComponent(rawId);
  } catch {
    return null;
  }
  const match = versions.find(
    (version) =>
      version.id === decodedId &&
      version.is_derived &&
      version.has_diff_from_clone === true &&
      version.has_forward_validation_note,
  );

  return match ? match.id : null;
}

function buildPriorityVersionHash(versionId: string): string {
  return `${PRIORITY_VERSION_HASH_PREFIX}${encodeURIComponent(versionId)}`;
}

function toSafeTimestamp(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const ts = new Date(value).getTime();
  return Number.isNaN(ts) ? null : ts;
}

function normalizeStrategyVersionsSort(value: string | null | undefined): 'created_at' | 'updated_at' {
  return value === 'updated_at' ? 'updated_at' : 'created_at';
}

function normalizeStrategyVersionsOrder(value: string | null | undefined): 'asc' | 'desc' {
  return value === 'asc' ? 'asc' : 'desc';
}

export function parseStrategyVersionsListQuery(locationPath: string): StrategyVersionsListQueryState {
  const search = locationPath.includes('?') ? locationPath.slice(locationPath.indexOf('?') + 1) : '';
  const params = new URLSearchParams(search);
  const rawPage = Number(params.get('page') ?? '1');
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const q = (params.get('q') ?? '').trim();
  const status = (params.get('status') ?? '').trim();
  const sort = normalizeStrategyVersionsSort(params.get('sort'));
  const order = normalizeStrategyVersionsOrder(params.get('order'));
  return { page, q, status, sort, order };
}

export function buildStrategyVersionsListUrl(
  strategyId: string,
  page: number,
  q = '',
  status = '',
  sort: 'created_at' | 'updated_at' = 'created_at',
  order: 'asc' | 'desc' = 'desc',
): string {
  const normalizedPage = Number.isInteger(page) && page > 0 ? page : 1;
  const normalizedQ = q.trim();
  const normalizedStatus = status.trim();
  const params = new URLSearchParams();
  if (normalizedQ) {
    params.set('q', normalizedQ);
  }
  if (normalizedStatus) {
    params.set('status', normalizedStatus);
  }
  if (sort !== 'created_at') {
    params.set('sort', sort);
  }
  if (order !== 'desc') {
    params.set('order', order);
  }
  if (normalizedPage > 1) {
    params.set('page', String(normalizedPage));
  }
  const query = params.toString();
  return query ? `/strategies/${strategyId}/versions?${query}` : `/strategies/${strategyId}/versions`;
}

export function buildStrategyVersionDetailUrl(
  strategyId: string,
  versionId: string,
  page: number,
  q = '',
  status = '',
  sort: 'created_at' | 'updated_at' = 'created_at',
  order: 'asc' | 'desc' = 'desc',
): string {
  const returnPath = buildStrategyVersionsListUrl(strategyId, page, q, status, sort, order);
  return `/strategy-versions/${versionId}?return=${encodeURIComponent(returnPath)}`;
}

export default function StrategyVersionList({ params }: StrategyVersionListProps) {
  const { strategyId } = params;
  const [location, setLocation] = useLocation();
  const { page, q, status, sort, order } = parseStrategyVersionsListQuery(location);
  const [searchInput, setSearchInput] = useState(q);
  const [statusInput, setStatusInput] = useState(status);
  const [sortInput, setSortInput] = useState<'created_at' | 'updated_at'>(sort);
  const [orderInput, setOrderInput] = useState<'asc' | 'desc'>(order);
  const [highlightedPriorityVersionId, setHighlightedPriorityVersionId] = useState<string | null>(null);
  const [priorityCursorVersionId, setPriorityCursorVersionId] = useState<string | null>(null);

  useEffect(() => {
    setSearchInput(q);
    setStatusInput(status);
    setSortInput(sort);
    setOrderInput(order);
  }, [q, status, sort, order, strategyId]);

  const listApiPath = useMemo(() => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(PAGE_SIZE));
    if (q) {
      params.set('q', q);
    }
    if (status) {
      params.set('status', status);
    }
    params.set('sort', sort);
    params.set('order', order);
    return `/api/strategies/${strategyId}/versions?${params.toString()}`;
  }, [strategyId, page, q, status, sort, order]);

  const { data, error, isLoading } = useSWR<StrategyVersionListData>(listApiPath, swrFetcher);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const versions = data?.strategy_versions ?? [];
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const applyHashHighlight = () => {
      const targetId = resolvePriorityVersionIdFromHash(window.location.hash, versions);
      setHighlightedPriorityVersionId(targetId);
      setPriorityCursorVersionId((current) => targetId ?? current);
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (targetId) {
        timeoutId = setTimeout(() => {
          setHighlightedPriorityVersionId(null);
        }, 2200);
      }
    };

    applyHashHighlight();
    window.addEventListener('hashchange', applyHashHighlight);
    return () => {
      window.removeEventListener('hashchange', applyHashHighlight);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [data?.strategy_versions]);

  if (isLoading) return <div style={{ padding: '2rem' }}>読み込み中...</div>;
  if (error) return <div style={{ padding: '2rem', color: '#a10000' }}>エラー: {error.message}</div>;
  if (!data) return null;

  const normalizedPage = data.pagination.page;
  const totalPages = Math.max(1, Math.ceil(data.pagination.total / data.pagination.limit));

  const statusLabel = (status: string) => {
    if (status === 'generated') return '生成済み';
    if (status === 'draft') return '下書き';
    if (status === 'failed') return '生成失敗';
    return status;
  };

  const isNeedsReviewDiff = (version: StrategyVersionListData['strategy_versions'][number]) =>
    version.is_derived && version.has_diff_from_clone === true;

  const isNeedsReviewWithNote = (version: StrategyVersionListData['strategy_versions'][number]) =>
    isNeedsReviewDiff(version) && version.has_forward_validation_note;

  const badgeStyle = (kind: 'derived' | 'diff' | 'no-diff' | 'no-base' | 'status' | 'note' | 'priority' | 'note-fresh' | 'read-now') => {
    const style = {
      display: 'inline-block',
      padding: '0.2rem 0.5rem',
      borderRadius: '999px',
      fontSize: '0.78rem',
      fontWeight: 600,
    };

    if (kind === 'derived') return { ...style, background: '#eef4ff', color: '#1849a9' };
    if (kind === 'diff') return { ...style, background: '#fff3e6', color: '#9a4d00' };
    if (kind === 'no-diff') return { ...style, background: '#eef8ee', color: '#1f6a1f' };
    if (kind === 'no-base') return { ...style, background: '#f3f3f3', color: '#666' };
    if (kind === 'note') return { ...style, background: '#fff7dd', color: '#755200' };
    if (kind === 'note-fresh') return { ...style, background: '#e8f6ff', color: '#0e577c' };
    if (kind === 'read-now') return { ...style, background: '#ffe9fb', color: '#7b1e68' };
    if (kind === 'priority') return { ...style, background: '#ffdede', color: '#8a1212' };
    return { ...style, background: '#f0f1f5', color: '#333' };
  };

  const onSearch = (event: FormEvent) => {
    event.preventDefault();
    setLocation(buildStrategyVersionsListUrl(strategyId, 1, searchInput, statusInput, sortInput, orderInput));
  };

  const onClear = () => {
    setSearchInput('');
    setStatusInput('');
    setSortInput('created_at');
    setOrderInput('desc');
    setLocation(buildStrategyVersionsListUrl(strategyId, 1, '', '', 'created_at', 'desc'));
  };

  const needsReviewCount = data.strategy_versions.filter(isNeedsReviewDiff).length;
  const noteCount = data.strategy_versions.filter((version) => version.has_forward_validation_note).length;
  const needsReviewWithNoteCount = data.strategy_versions.filter(isNeedsReviewWithNote).length;
  const latestForwardNoteTimestamp = data.strategy_versions.reduce<number | null>((latestTs, version) => {
    if (!version.has_forward_validation_note) {
      return latestTs;
    }
    const noteTs = toSafeTimestamp(version.forward_validation_note_updated_at);
    if (noteTs === null) {
      return latestTs;
    }
    if (latestTs === null || noteTs > latestTs) {
      return noteTs;
    }
    return latestTs;
  }, null);
  const latestForwardNoteVersionIds = new Set(
    data.strategy_versions
      .filter((version) =>
        version.has_forward_validation_note &&
        latestForwardNoteTimestamp !== null &&
        toSafeTimestamp(version.forward_validation_note_updated_at) === latestForwardNoteTimestamp,
      )
      .map((version) => version.id),
  );
  const latestForwardNoteCount = latestForwardNoteVersionIds.size;
  const readNowCandidateCount = data.strategy_versions.filter(
    (version) => isNeedsReviewWithNote(version) && latestForwardNoteVersionIds.has(version.id),
  ).length;
  const latestForwardNoteLabel =
    latestForwardNoteTimestamp === null
      ? '-'
      : new Date(latestForwardNoteTimestamp).toLocaleString('ja-JP');
  const firstNeedsReviewWithNoteVersion = data.strategy_versions.find(isNeedsReviewWithNote);
  const priorityVersionIds = data.strategy_versions.filter(isNeedsReviewWithNote).map((version) => version.id);

  const moveToNextPriorityVersion = () => {
    if (typeof window === 'undefined' || priorityVersionIds.length === 0) {
      return;
    }

    const currentIndex = priorityCursorVersionId ? priorityVersionIds.indexOf(priorityCursorVersionId) : -1;
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % priorityVersionIds.length : 0;
    const nextVersionId = priorityVersionIds[nextIndex];
    const nextHash = buildPriorityVersionHash(nextVersionId);

    if (window.location.hash === nextHash) {
      setHighlightedPriorityVersionId(nextVersionId);
      setPriorityCursorVersionId(nextVersionId);
      return;
    }

    window.location.hash = nextHash;
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <div style={{ marginBottom: '1rem', display: 'flex', gap: '1rem' }}>
        <Link href='/' style={{ color: '#666', textDecoration: 'none' }}>ホームへ戻る</Link>
        <Link href='/strategy-lab' style={{ color: '#666', textDecoration: 'none' }}>ルール検証ラボへ戻る</Link>
      </div>

      <h1>ルール version 一覧</h1>
      <p style={{ color: '#666' }}>
        strategy: <code>{data.strategy.id}</code> / {data.strategy.title}
      </p>

      <form onSubmit={onSearch} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '0.8rem' }}>
        <input
          type='text'
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder='ルール文で検索（部分一致）'
          style={{
            flex: '1 1 320px',
            minWidth: '220px',
            padding: '0.5rem 0.65rem',
            border: '1px solid #ccc',
            borderRadius: '4px',
          }}
        />
        <button
          type='submit'
          style={{
            padding: '0.5rem 0.9rem',
            border: 'none',
            borderRadius: '4px',
            background: '#0a5bb5',
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          検索
        </button>
        <button
          type='button'
          onClick={onClear}
          style={{
            padding: '0.5rem 0.9rem',
            border: '1px solid #ccc',
            borderRadius: '4px',
            background: '#fff',
            color: '#333',
            cursor: 'pointer',
          }}
        >
          クリア
        </button>
        <select
          value={statusInput}
          onChange={(event) => setStatusInput(event.target.value)}
          style={{ padding: '0.5rem 0.6rem', border: '1px solid #ccc', borderRadius: '4px' }}
        >
          <option value=''>状態: すべて</option>
          <option value='draft'>draft</option>
          <option value='generated'>generated</option>
          <option value='failed'>failed</option>
        </select>
        <select
          value={sortInput}
          onChange={(event) => setSortInput(event.target.value === 'updated_at' ? 'updated_at' : 'created_at')}
          style={{ padding: '0.5rem 0.6rem', border: '1px solid #ccc', borderRadius: '4px' }}
        >
          <option value='created_at'>並び替え: 作成日時</option>
          <option value='updated_at'>並び替え: 更新日時</option>
        </select>
        <select
          value={orderInput}
          onChange={(event) => setOrderInput(event.target.value === 'asc' ? 'asc' : 'desc')}
          style={{ padding: '0.5rem 0.6rem', border: '1px solid #ccc', borderRadius: '4px' }}
        >
          <option value='desc'>降順</option>
          <option value='asc'>昇順</option>
        </select>
      </form>

      {(q || status || sort !== 'created_at' || order !== 'desc') && (
        <div style={{ marginTop: '0.45rem', color: '#666', fontSize: '0.9rem', display: 'flex', gap: '0.7rem', flexWrap: 'wrap' }}>
          {q && (
            <span>
              検索中: <code>{q}</code>
            </span>
          )}
          {status && (
            <span>
              状態: <code>{status}</code>
            </span>
          )}
          <span>
            並び: <code>{sort}</code> / <code>{order}</code>
          </span>
        </div>
      )}

      {data.strategy_versions.length === 0 ? (
        <div style={{ marginTop: '1rem', padding: '1rem', border: '1px solid #ddd', borderRadius: '6px', color: '#666' }}>
          {q ? '検索条件に一致する version はありません。' : 'まだ version はありません。'}
        </div>
      ) : (
        <div style={{ marginTop: '1rem', display: 'grid', gap: '0.8rem' }}>
          <div style={{ padding: '0.65rem 0.8rem', border: '1px solid #e5e5e5', borderRadius: '6px', background: '#fafafa', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ color: '#333', fontSize: '0.9rem' }}>
              このページ内の要確認差分: <strong>{needsReviewCount}</strong> 件
            </span>
            <span style={{ color: '#333', fontSize: '0.9rem' }}>
              このページ内の検証ノートあり: <strong>{noteCount}</strong> 件
            </span>
            <span style={{ color: '#333', fontSize: '0.9rem' }}>
              このページ内の要確認差分かつ検証ノートあり: <strong>{needsReviewWithNoteCount}</strong> 件
            </span>
            <span style={{ color: '#333', fontSize: '0.9rem' }}>
              このページ内の{NOTE_FRESHNESS_BADGE_LABEL}: <strong>{latestForwardNoteCount}</strong> 件
            </span>
            <span style={{ color: '#333', fontSize: '0.9rem' }}>
              このページ内の今読む候補: <strong>{readNowCandidateCount}</strong> 件
            </span>
            {latestForwardNoteCount > 0 && (
              <span style={{ color: '#666', fontSize: '0.85rem' }}>
                最新ノート更新: {latestForwardNoteLabel}
              </span>
            )}
            {firstNeedsReviewWithNoteVersion && (
              <a
                href={buildPriorityVersionHash(firstNeedsReviewWithNoteVersion.id)}
                style={{ color: '#0a5bb5', fontSize: '0.85rem', textDecoration: 'none', fontWeight: 600 }}
              >
                最優先確認の先頭へ移動
              </a>
            )}
            {needsReviewWithNoteCount > 1 && (
              <button
                type='button'
                onClick={moveToNextPriorityVersion}
                style={{
                  padding: '0.2rem 0.55rem',
                  border: '1px solid #d4d4d4',
                  borderRadius: '999px',
                  background: '#fff',
                  color: '#333',
                  cursor: 'pointer',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                }}
              >
                次の最優先確認へ
              </button>
            )}
            {needsReviewWithNoteCount > 0 && (
              <span style={{ color: '#8a1212', fontSize: '0.85rem' }}>
                `最優先確認` バッジ付き version から確認してください
              </span>
            )}
            {needsReviewCount > 0 && (
              <span style={{ color: '#666', fontSize: '0.85rem' }}>
                `要確認差分` バッジ付き version を優先確認してください
              </span>
            )}
          </div>
          {data.strategy_versions.map((version) => {
            const isLatestForwardNote = latestForwardNoteVersionIds.has(version.id);
            const isReadNowCandidate = isNeedsReviewWithNote(version) && isLatestForwardNote;
            return (
            <div
              key={version.id}
              id={isNeedsReviewWithNote(version) ? `priority-version-${version.id}` : undefined}
              style={{
                border: highlightedPriorityVersionId === version.id
                  ? '2px solid #d62828'
                  : isNeedsReviewWithNote(version)
                  ? '1px solid #e58080'
                  : isNeedsReviewDiff(version)
                    ? '1px solid #f0b46d'
                    : '1px solid #ddd',
                borderRadius: '8px',
                padding: '1rem',
                display: 'grid',
                gap: '0.45rem',
                background: highlightedPriorityVersionId === version.id
                  ? '#ffecec'
                  : isNeedsReviewWithNote(version)
                  ? '#fff5f5'
                  : isNeedsReviewDiff(version)
                    ? '#fffaf3'
                    : '#fff',
                boxShadow: highlightedPriorityVersionId === version.id ? '0 0 0 3px rgba(214, 40, 40, 0.15)' : 'none',
                transition: 'background-color 220ms ease, box-shadow 220ms ease, border-color 220ms ease',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.8rem', flexWrap: 'wrap' }}>
                <div style={{ fontWeight: 600 }}>
                  version: <code>{version.id}</code>
                </div>
                <div style={{ color: '#666', fontSize: '0.9rem' }}>
                  作成: {new Date(version.created_at).toLocaleString('ja-JP')}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                {version.is_derived ? (
                  <span style={badgeStyle('derived')}>派生</span>
                ) : (
                  <span style={badgeStyle('no-base')}>比較元なし</span>
                )}
                {isNeedsReviewWithNote(version) && <span style={badgeStyle('priority')}>最優先確認</span>}
                {isReadNowCandidate && <span style={badgeStyle('read-now')}>今読む候補</span>}
                {isNeedsReviewDiff(version) && <span style={{ ...badgeStyle('diff'), background: '#ffedd4' }}>要確認差分</span>}
                {version.has_diff_from_clone === true && <span style={badgeStyle('diff')}>差分あり</span>}
                {version.has_diff_from_clone === false && <span style={badgeStyle('no-diff')}>差分なし</span>}
                {version.has_forward_validation_note && <span style={badgeStyle('note')}>検証ノートあり</span>}
                {isLatestForwardNote && <span style={badgeStyle('note-fresh')}>{NOTE_FRESHNESS_BADGE_LABEL}</span>}
                <span style={badgeStyle('status')}>status: {statusLabel(version.status)}</span>
              </div>
              <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap', fontSize: '0.95rem' }}>
                <span><strong>市場:</strong> {version.market}</span>
                <span><strong>時間足:</strong> {version.timeframe}</span>
                <span><strong>warnings:</strong> {version.has_warnings ? 'あり' : 'なし'}</span>
                {version.has_forward_validation_note && (
                  <span><strong>ノート更新目安:</strong> {formatNoteFreshness(version.forward_validation_note_updated_at)}</span>
                )}
              </div>
              <div>
                <Link
                  href={buildStrategyVersionDetailUrl(strategyId, version.id, normalizedPage, q, status, sort, order)}
                  style={{ color: '#0a5bb5', textDecoration: 'none', fontWeight: 600 }}
                >
                  version 詳細を開く
                </Link>
              </div>
            </div>
            );
          })}
        </div>
      )}

      {data.strategy_versions.length > 0 && (
        <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button
            type='button'
            onClick={() => setLocation(buildStrategyVersionsListUrl(strategyId, Math.max(1, normalizedPage - 1), q, status, sort, order))}
            disabled={!data.pagination.has_prev}
            style={{
              padding: '0.45rem 0.85rem',
              border: '1px solid #ccc',
              borderRadius: '4px',
              background: data.pagination.has_prev ? '#fff' : '#f3f3f3',
              color: '#333',
              cursor: data.pagination.has_prev ? 'pointer' : 'default',
            }}
          >
            前へ
          </button>
          <button
            type='button'
            onClick={() => setLocation(buildStrategyVersionsListUrl(strategyId, normalizedPage + 1, q, status, sort, order))}
            disabled={!data.pagination.has_next}
            style={{
              padding: '0.45rem 0.85rem',
              border: '1px solid #ccc',
              borderRadius: '4px',
              background: data.pagination.has_next ? '#fff' : '#f3f3f3',
              color: '#333',
              cursor: data.pagination.has_next ? 'pointer' : 'default',
            }}
          >
            次へ
          </button>
          <span style={{ color: '#666', fontSize: '0.9rem' }}>
            {normalizedPage} / {totalPages} ページ
          </span>
        </div>
      )}
    </div>
  );
}
