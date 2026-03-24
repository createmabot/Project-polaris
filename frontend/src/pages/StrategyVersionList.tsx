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
              <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap', fontSize: '0.95rem' }}>
                <span><strong>市場:</strong> {version.market}</span>
                <span><strong>時間足:</strong> {version.timeframe}</span>
                <span><strong>状態:</strong> <code>{version.status}</code></span>
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

