import useSWR from 'swr';
import { Link } from 'wouter';
import { swrFetcher } from '../api/client';
import { StrategyVersionListData } from '../api/types';

type StrategyVersionListProps = {
  params: { strategyId: string };
};

export default function StrategyVersionList({ params }: StrategyVersionListProps) {
  const { strategyId } = params;
  const { data, error, isLoading } = useSWR<StrategyVersionListData>(
    `/api/strategies/${strategyId}/versions`,
    swrFetcher
  );

  if (isLoading) return <div style={{ padding: '2rem' }}>読み込み中...</div>;
  if (error) return <div style={{ padding: '2rem', color: '#a10000' }}>エラー: {error.message}</div>;
  if (!data) return null;

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
                  href={`/strategy-versions/${version.id}`}
                  style={{ color: '#0a5bb5', textDecoration: 'none', fontWeight: 600 }}
                >
                  version 詳細を開く
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
