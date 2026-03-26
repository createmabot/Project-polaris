import { FormEvent, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Link, useLocation } from 'wouter';
import { swrFetcher } from '../api/client';
import { StrategyVersionListData } from '../api/types';

type StrategyVersionListProps = {
  params: { strategyId: string };
};

const PAGE_SIZE = 20;

export function parseStrategyVersionsListQuery(locationPath: string): { page: number; q: string } {
  const search = locationPath.includes('?') ? locationPath.slice(locationPath.indexOf('?') + 1) : '';
  const params = new URLSearchParams(search);
  const rawPage = Number(params.get('page') ?? '1');
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const q = (params.get('q') ?? '').trim();
  return { page, q };
}

export function buildStrategyVersionsListUrl(strategyId: string, page: number, q = ''): string {
  const normalizedPage = Number.isInteger(page) && page > 0 ? page : 1;
  const normalizedQ = q.trim();
  const params = new URLSearchParams();
  if (normalizedQ) {
    params.set('q', normalizedQ);
  }
  if (normalizedPage > 1) {
    params.set('page', String(normalizedPage));
  }
  const query = params.toString();
  return query ? `/strategies/${strategyId}/versions?${query}` : `/strategies/${strategyId}/versions`;
}

export function buildStrategyVersionDetailUrl(strategyId: string, versionId: string, page: number, q = ''): string {
  const returnPath = buildStrategyVersionsListUrl(strategyId, page, q);
  return `/strategy-versions/${versionId}?return=${encodeURIComponent(returnPath)}`;
}

export default function StrategyVersionList({ params }: StrategyVersionListProps) {
  const { strategyId } = params;
  const [location, setLocation] = useLocation();
  const { page, q } = parseStrategyVersionsListQuery(location);
  const [searchInput, setSearchInput] = useState(q);

  useEffect(() => {
    setSearchInput(q);
  }, [q, strategyId]);

  const listApiPath = useMemo(() => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(PAGE_SIZE));
    if (q) {
      params.set('q', q);
    }
    return `/api/strategies/${strategyId}/versions?${params.toString()}`;
  }, [strategyId, page, q]);

  const { data, error, isLoading } = useSWR<StrategyVersionListData>(listApiPath, swrFetcher);

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

  const badgeStyle = (kind: 'derived' | 'diff' | 'no-diff' | 'no-base' | 'status') => {
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
    return { ...style, background: '#f0f1f5', color: '#333' };
  };

  const onSearch = (event: FormEvent) => {
    event.preventDefault();
    setLocation(buildStrategyVersionsListUrl(strategyId, 1, searchInput));
  };

  const onClear = () => {
    setSearchInput('');
    setLocation(buildStrategyVersionsListUrl(strategyId, 1, ''));
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
      </form>

      {q && (
        <div style={{ marginTop: '0.45rem', color: '#666', fontSize: '0.9rem' }}>
          検索中: <code>{q}</code>
        </div>
      )}

      {data.strategy_versions.length === 0 ? (
        <div style={{ marginTop: '1rem', padding: '1rem', border: '1px solid #ddd', borderRadius: '6px', color: '#666' }}>
          {q ? '検索条件に一致する version はありません。' : 'まだ version はありません。'}
        </div>
      ) : (
        <div style={{ marginTop: '1rem', display: 'grid', gap: '0.8rem' }}>
          {data.strategy_versions.map((version) => (
            <div
              key={version.id}
              style={{
                border: '1px solid #ddd',
                borderRadius: '8px',
                padding: '1rem',
                display: 'grid',
                gap: '0.45rem',
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
                {version.has_diff_from_clone === true && <span style={badgeStyle('diff')}>差分あり</span>}
                {version.has_diff_from_clone === false && <span style={badgeStyle('no-diff')}>差分なし</span>}
                <span style={badgeStyle('status')}>status: {statusLabel(version.status)}</span>
              </div>
              <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap', fontSize: '0.95rem' }}>
                <span><strong>市場:</strong> {version.market}</span>
                <span><strong>時間足:</strong> {version.timeframe}</span>
                <span><strong>warnings:</strong> {version.has_warnings ? 'あり' : 'なし'}</span>
              </div>
              <div>
                <Link
                  href={buildStrategyVersionDetailUrl(strategyId, version.id, normalizedPage, q)}
                  style={{ color: '#0a5bb5', textDecoration: 'none', fontWeight: 600 }}
                >
                  version 詳細を開く
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {data.strategy_versions.length > 0 && (
        <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button
            type='button'
            onClick={() => setLocation(buildStrategyVersionsListUrl(strategyId, Math.max(1, normalizedPage - 1), q))}
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
            onClick={() => setLocation(buildStrategyVersionsListUrl(strategyId, normalizedPage + 1, q))}
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
