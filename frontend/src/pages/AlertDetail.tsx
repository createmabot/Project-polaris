import useSWR from 'swr';
import { useRoute, Link } from 'wouter';
import { swrFetcher } from '../api/client';
import { AlertDetailData } from '../api/types';

export default function AlertDetail() {
  const [, params] = useRoute('/alerts/:alertId');
  const alertId = params?.alertId;

  const { data, error, isLoading } = useSWR<AlertDetailData>(
    alertId ? `/api/alerts/${alertId}` : null,
    swrFetcher
  );

  if (isLoading) return <div style={{ padding: '2rem' }}>読み込み中...</div>;
  
  if (error) {
    if (error.code === 'ALERT_NOT_FOUND' || error.message.includes('404')) {
      return (
        <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
          <h2>アラートが見つかりません</h2>
          <p>指定されたアラートは存在しないか、削除されました。</p>
          <Link href="/">← ホームへ戻る</Link>
        </div>
      );
    }
    return <div style={{ padding: '2rem', color: 'red' }}>エラーが発生しました: {error.message}</div>;
  }

  if (!data) return null;

  const { alert_event, symbol, related_ai_summary, related_references, processing_status } = data;

  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <div style={{ marginBottom: '1rem' }}>
        <Link href="/" style={{ color: '#666', textDecoration: 'none' }}>← ホームへ戻る</Link>
      </div>

      <h1>{symbol?.displayName || symbol?.symbol || '不明な銘柄'} - {alert_event.alertName}</h1>
      <p style={{ color: '#666' }}>
        ステータス: <code>{processing_status}</code> |
        発生日時: {new Date(alert_event.triggeredAt || alert_event.receivedAt || '').toLocaleString('ja-JP')}
      </p>

      <section style={{ marginTop: '2rem' }}>
        <h2>🤖 AIの分析: 今日なぜ動いたか</h2>
        {related_ai_summary ? (
          <div style={{ background: '#f5f5f5', padding: '1rem', borderRadius: '4px' }}>
            {related_ai_summary.title && <h3>{related_ai_summary.title}</h3>}
            <div style={{ whiteSpace: 'pre-wrap' }}>
              {related_ai_summary.bodyMarkdown}
            </div>
            <div style={{ marginTop: '1rem', fontSize: '0.8rem', color: '#999' }}>
              Model: {related_ai_summary.modelName} | Generated: {new Date(related_ai_summary.generatedAt || '').toLocaleString('ja-JP')}
            </div>
          </div>
        ) : (
          <div style={{ padding: '1rem', border: '1px dashed #ccc', color: '#666' }}>
            AI要約はまだ生成されていません。（ステータス: {processing_status}）
          </div>
        )}
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2>📰 関連情報 (References)</h2>
        {related_references && related_references.length > 0 ? (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {related_references.map((ref) => (
              <li key={ref.id} style={{ marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid #eee' }}>
                <div style={{ fontSize: '0.85rem', color: '#666', marginBottom: '4px' }}>
                  [{ref.referenceType}] {new Date(ref.publishedAt || '').toLocaleString('ja-JP')}
                </div>
                <strong>
                  {ref.sourceUrl ? (
                    <a href={ref.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#0066cc' }}>{ref.title}</a>
                  ) : (
                    ref.title
                  )}
                </strong>
                {ref.summaryText && <p style={{ margin: '4px 0 0 0', fontSize: '0.9rem' }}>{ref.summaryText}</p>}
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ color: '#666' }}>関連するニュースや開示情報はありません。</p>
        )}
      </section>
      
      <section style={{ marginTop: '2rem' }}>
        <h2>⚙️ アラート詳細 (Raw Event)</h2>
        <pre style={{ background: '#2d2d2d', color: '#fff', padding: '1rem', overflowX: 'auto', borderRadius: '4px' }}>
          {JSON.stringify(alert_event, null, 2)}
        </pre>
      </section>
    </div>
  );
}
