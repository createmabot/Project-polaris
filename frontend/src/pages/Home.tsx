import useSWR from 'swr';
import { Link } from 'wouter';
import { swrFetcher } from '../api/client';
import { HomeData } from '../api/types';

function formatDate(value: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ja-JP');
}

export default function Home() {
  const { data, error, isLoading } = useSWR<HomeData>('/api/home', swrFetcher);

  if (isLoading) return <div style={{ padding: '2rem' }}>読み込み中...</div>;
  if (error) return <div style={{ padding: '2rem', color: 'red' }}>エラー: {error.message}</div>;
  if (!data) return null;

  return (
    <div style={{ padding: '2rem', maxWidth: '840px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h1>北極星</h1>
      <p style={{ color: '#666' }}>アラート、要約、ノートをまとめて確認します。</p>
      <div style={{ marginBottom: '1.2rem' }}>
        <Link href="/compare" style={{ color: '#0066cc', textDecoration: 'none' }}>
          銘柄比較を開く
        </Link>
      </div>
      <div style={{ marginBottom: '1.2rem' }}>
        <Link href="/strategy-lab" style={{ color: '#0066cc', textDecoration: 'none' }}>
          ルール検証ラボを開く
        </Link>
      </div>

      <section style={{ marginTop: '1.5rem' }}>
        <h2>デイリーサマリー</h2>
        <div style={{ background: '#f5f5f5', padding: '1rem', borderRadius: '4px' }}>
          {data.daily_summary ? (
            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{data.daily_summary.bodyMarkdown}</p>
          ) : (
            <p style={{ margin: 0, color: '#777' }}>サマリーはまだありません。</p>
          )}
        </div>
      </section>

      <section style={{ marginTop: '1.5rem' }}>
        <h2>最近のアラート</h2>
        {data.recent_alerts.length === 0 ? (
          <p style={{ color: '#777' }}>アラートはありません。</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {data.recent_alerts.map((alert) => (
              <li key={alert.id} style={{ padding: '1rem 0', borderBottom: '1px solid #eee' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                  <div>
                    <strong>
                      <Link href={`/alerts/${alert.id}`} style={{ color: '#0066cc', textDecoration: 'none' }}>
                        {alert.alertName}
                      </Link>
                    </strong>
                    <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '4px' }}>
                      銘柄:{' '}
                      {alert.symbol?.id ? (
                        <Link href={`/symbols/${alert.symbol.id}`} style={{ color: '#0066cc', textDecoration: 'none' }}>
                          {alert.symbol.displayName || alert.symbol.symbol}
                        </Link>
                      ) : (
                        <span>{alert.symbol?.displayName || alert.symbol?.symbol || '不明'}</span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#666' }}>
                      発生: {formatDate(alert.triggeredAt || alert.receivedAt)} | 状態: <code>{alert.processingStatus}</code>
                    </div>
                  </div>
                </div>
                {alert.related_ai_summary && (
                  <div style={{ marginTop: '0.5rem', background: '#f9f9f9', borderLeft: '3px solid #0066cc', padding: '0.5rem' }}>
                    <div style={{ fontWeight: 600 }}>{alert.related_ai_summary.title || 'AI要約'}</div>
                    <p style={{ margin: '4px 0 0 0', whiteSpace: 'pre-wrap' }}>{alert.related_ai_summary.bodyMarkdown}</p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

