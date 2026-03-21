import useSWR from 'swr';
import { useRoute, Link } from 'wouter';
import { swrFetcher } from '../api/client';
import { AlertDetailData } from '../api/types';

function formatDate(value: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ja-JP');
}

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
          <p>指定されたアラートは存在しないか、削除されています。</p>
          <Link href="/">ホームへ戻る</Link>
        </div>
      );
    }

    return <div style={{ padding: '2rem', color: 'red' }}>エラー: {error.message}</div>;
  }

  if (!data) return null;

  const { alert_event, symbol, related_ai_summary, related_references, processing_status } = data;

  return (
    <div style={{ padding: '2rem', maxWidth: '860px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <div style={{ marginBottom: '1rem' }}>
        <Link href="/" style={{ color: '#666', textDecoration: 'none' }}>
          ホームへ戻る
        </Link>
      </div>

      <h1>
        {symbol?.id ? (
          <Link href={`/symbols/${symbol.id}`} style={{ color: '#0066cc', textDecoration: 'none' }}>
            {symbol.displayName || symbol.symbol || '不明銘柄'}
          </Link>
        ) : (
          symbol?.displayName || symbol?.symbol || '不明銘柄'
        )}{' '}
        - {alert_event.alertName}
      </h1>
      <p style={{ color: '#666' }}>
        状態: <code>{processing_status}</code> | 発生時刻: {formatDate(alert_event.triggeredAt || alert_event.receivedAt)}
      </p>
      {symbol?.id && (
        <div style={{ marginBottom: '1rem' }}>
          <Link href={`/compare?symbolIds=${symbol.id}`} style={{ color: '#0066cc', textDecoration: 'none' }}>
            この銘柄を比較に追加
          </Link>
        </div>
      )}

      <section style={{ marginTop: '2rem' }}>
        <h2>AI要約</h2>
        {related_ai_summary ? (
          <div style={{ background: '#f5f5f5', padding: '1rem', borderRadius: '4px' }}>
            {related_ai_summary.title && <h3 style={{ marginTop: 0 }}>{related_ai_summary.title}</h3>}
            <div style={{ whiteSpace: 'pre-wrap' }}>{related_ai_summary.bodyMarkdown}</div>
            <div style={{ marginTop: '1rem', fontSize: '0.8rem', color: '#777' }}>
              model: {related_ai_summary.modelName || '-'} | generated: {formatDate(related_ai_summary.generatedAt)}
            </div>
          </div>
        ) : (
          <div style={{ padding: '1rem', border: '1px dashed #ccc', color: '#666' }}>
            AI要約はまだ生成されていません。
          </div>
        )}
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2>関連参照情報</h2>
        {related_references.length === 0 ? (
          <p style={{ color: '#666' }}>参照情報はありません。</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {related_references.map((ref) => (
              <li key={ref.id} style={{ marginBottom: '1rem', borderBottom: '1px solid #eee', paddingBottom: '1rem' }}>
                <div style={{ fontSize: '0.85rem', color: '#666', marginBottom: '4px' }}>
                  [{ref.referenceType}] {formatDate(ref.publishedAt)}
                </div>
                {ref.sourceUrl ? (
                  <a href={ref.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#0066cc' }}>
                    {ref.title}
                  </a>
                ) : (
                  <strong>{ref.title}</strong>
                )}
                {ref.summaryText && <p style={{ margin: '4px 0 0 0' }}>{ref.summaryText}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

