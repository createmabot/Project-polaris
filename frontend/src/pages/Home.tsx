import useSWR from 'swr';
import { Link } from 'wouter';
import { swrFetcher } from '../api/client';
import { HomeData } from '../api/types';

export default function Home() {
  const { data, error, isLoading } = useSWR<HomeData>('/api/home', swrFetcher);

  if (isLoading) return <div style={{ padding: '2rem' }}>読み込み中...</div>;
  if (error) return <div style={{ padding: '2rem', color: 'red' }}>エラーが発生しました: {error.message}</div>;
  if (!data) return null;

  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h1>北極星 (Project Polaris)</h1>
      <p style={{ color: '#666' }}>今日何が動いたか</p>

      <section style={{ marginTop: '2rem' }}>
        <h2>📝 本日のサマリー (プレースホルダー)</h2>
        <div style={{ background: '#f5f5f5', padding: '1rem', borderRadius: '4px' }}>
          {data.daily_summary ? (
             <p>{data.daily_summary.bodyMarkdown}</p>
          ) : (
             <p style={{ color: '#aaa' }}>まだ本日のサマリーは生成されていません。</p>
          )}
        </div>
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2>🚨 最近のアラート</h2>
        {data.recent_alerts.length === 0 ? (
          <p>最近のアラートはありません。</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {data.recent_alerts.map((alert) => (
              <li key={alert.id} style={{ borderBottom: '1px solid #eee', padding: '1rem 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <strong>
                      <Link href={`/alerts/${alert.id}`} style={{ color: '#0066cc', textDecoration: 'none' }}>
                        {alert.symbol?.displayName || alert.symbol?.symbol || '不明な銘柄'} - {alert.alertName}
                      </Link>
                    </strong>
                    <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '4px' }}>
                      発生時刻: {new Date(alert.triggeredAt || alert.receivedAt || '').toLocaleString('ja-JP')} |
                      ステータス: <code>{alert.processingStatus}</code>
                    </div>
                  </div>
                </div>
                {alert.related_ai_summary && (
                  <div style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#333', background: '#f9f9f9', padding: '0.5rem', borderLeft: '3px solid #0066cc' }}>
                    <strong>{alert.related_ai_summary.title || 'AI要約'}</strong>
                    <p style={{ margin: '4px 0 0 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {alert.related_ai_summary.bodyMarkdown}
                    </p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: '2rem', opacity: 0.5 }}>
        <h2>📊 マーケット概況 (未実装)</h2>
        <p>Indices, FX, Sectors data will appear here.</p>
      </section>
    </div>
  );
}
