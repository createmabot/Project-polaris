import useSWR from 'swr';
import { Link, useLocation } from 'wouter';
import { swrFetcher } from '../api/client';
import { StrategyVersionListData } from '../api/types';

type StrategyVersionListProps = {
  params: { strategyId: string };
};

const PAGE_SIZE = 10;

export function parseStrategyVersionsListQuery(locationPath: string): { page: number } {
  const search = locationPath.includes('?') ? locationPath.slice(locationPath.indexOf('?') + 1) : '';
  const params = new URLSearchParams(search);
  const rawPage = Number(params.get('page') ?? '1');
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  return { page };
}

export function buildStrategyVersionsListUrl(strategyId: string, page: number): string {
  const normalizedPage = Number.isInteger(page) && page > 0 ? page : 1;
  if (normalizedPage === 1) {
    return `/strategies/${strategyId}/versions`;
  }
  return `/strategies/${strategyId}/versions?page=${normalizedPage}`;
}

export function buildStrategyVersionDetailUrl(strategyId: string, versionId: string, page: number): string {
  const returnPath = buildStrategyVersionsListUrl(strategyId, page);
  return `/strategy-versions/${versionId}?return=${encodeURIComponent(returnPath)}`;
}

export default function StrategyVersionList({ params }: StrategyVersionListProps) {
  const { strategyId } = params;
  const [location, setLocation] = useLocation();
  const { page } = parseStrategyVersionsListQuery(location);
  const { data, error, isLoading } = useSWR<StrategyVersionListData>(
    `/api/strategies/${strategyId}/versions`,
    swrFetcher
  );

  if (isLoading) return <div style={{ padding: '2rem' }}>読み込み中...</div>;
  if (error) return <div style={{ padding: '2rem', color: '#a10000' }}>エラー: {error.message}</div>;
  if (!data) return null;
  const total = data.strategy_versions.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const normalizedPage = Math.min(page, totalPages);
  const start = (normalizedPage - 1) * PAGE_SIZE;
  const paginatedVersions = data.strategy_versions.slice(start, start + PAGE_SIZE);

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

    if (kind === 'derived') {
      return { ...style, background: '#eef4ff', color: '#1849a9' };
    }
    if (kind === 'diff') {
      return { ...style, background: '#fff3e6', color: '#9a4d00' };
    }
    if (kind === 'no-diff') {
      return { ...style, background: '#eef8ee', color: '#1f6a1f' };
    }
    if (kind === 'no-base') {
      return { ...style, background: '#f3f3f3', color: '#666' };
    }
    return { ...style, background: '#f0f1f5', color: '#333' };
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

      {data.strategy_versions.length === 0 ? (
        <div style={{ marginTop: '1rem', padding: '1rem', border: '1px solid #ddd', borderRadius: '6px', color: '#666' }}>
          まだ version はありません。
        </div>
      ) : (
        <div style={{ marginTop: '1rem', display: 'grid', gap: '0.8rem' }}>
          {paginatedVersions.map((version) => (
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
                {version.has_diff_from_clone === true && (
                  <span style={badgeStyle('diff')}>差分あり</span>
                )}
                {version.has_diff_from_clone === false && (
                  <span style={badgeStyle('no-diff')}>差分なし</span>
                )}
                <span style={badgeStyle('status')}>status: {statusLabel(version.status)}</span>
              </div>
              <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap', fontSize: '0.95rem' }}>
                <span><strong>市場:</strong> {version.market}</span>
                <span><strong>時間足:</strong> {version.timeframe}</span>
                <span><strong>warnings:</strong> {version.has_warnings ? 'あり' : 'なし'}</span>
              </div>
              <div>
                <Link
                  href={buildStrategyVersionDetailUrl(strategyId, version.id, normalizedPage)}
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
            onClick={() => setLocation(buildStrategyVersionsListUrl(strategyId, Math.max(1, normalizedPage - 1)))}
            disabled={normalizedPage <= 1}
            style={{
              padding: '0.45rem 0.85rem',
              border: '1px solid #ccc',
              borderRadius: '4px',
              background: normalizedPage > 1 ? '#fff' : '#f3f3f3',
              color: '#333',
              cursor: normalizedPage > 1 ? 'pointer' : 'default',
            }}
          >
            前へ
          </button>
          <button
            type='button'
            onClick={() => setLocation(buildStrategyVersionsListUrl(strategyId, normalizedPage + 1))}
            disabled={normalizedPage >= totalPages}
            style={{
              padding: '0.45rem 0.85rem',
              border: '1px solid #ccc',
              borderRadius: '4px',
              background: normalizedPage < totalPages ? '#fff' : '#f3f3f3',
              color: '#333',
              cursor: normalizedPage < totalPages ? 'pointer' : 'default',
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
