import useSWR from 'swr';
import { Link, useRoute } from 'wouter';
import { swrFetcher } from '../api/client';
import { SymbolDetailData } from '../api/types';

function formatDate(value: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ja-JP');
}

function getThesisPoints(structuredJson: any): string[] {
  const payload = structuredJson?.payload;
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const points: string[] = [];
  const candidates = [...(payload.bullish_points ?? []), ...(payload.bearish_points ?? [])];
  for (const point of candidates) {
    if (typeof point === 'string' && point.trim()) {
      points.push(point.trim());
    } else if (point && typeof point === 'object' && typeof point.text === 'string' && point.text.trim()) {
      points.push(point.text.trim());
    }
  }
  return points.slice(0, 4);
}

export default function SymbolDetail() {
  const [, params] = useRoute('/symbols/:symbolId');
  const symbolId = params?.symbolId;

  const { data, error, isLoading } = useSWR<SymbolDetailData>(
    symbolId ? `/api/symbols/${symbolId}` : null,
    swrFetcher
  );

  if (isLoading) return <div style={{ padding: '2rem' }}>銘柄情報を読み込み中...</div>;

  if (error) {
    if (error.code === 'NOT_FOUND' || error.message.includes('404')) {
      return (
        <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
          <h2>銘柄が見つかりません</h2>
          <p>指定された銘柄IDは存在しないか、参照できません。</p>
          <Link href="/">← ホームへ戻る</Link>
        </div>
      );
    }

    return (
      <div style={{ padding: '2rem', color: 'red', fontFamily: 'sans-serif' }}>
        エラーが発生しました: {error.message}
      </div>
    );
  }

  if (!data) return null;

  const thesisPoints = getThesisPoints(data.latest_ai_thesis_summary?.structured_json);

  return (
    <div style={{ padding: '2rem', maxWidth: '920px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <div style={{ marginBottom: '1rem' }}>
        <Link href="/" style={{ color: '#666', textDecoration: 'none' }}>← ホームへ戻る</Link>
      </div>

      <h1>{data.symbol.display_name || data.symbol.symbol}</h1>
      <p style={{ color: '#666' }}>
        コード: <code>{data.symbol.symbol_code || data.symbol.symbol}</code> |
        市場: <code>{data.symbol.market_code || '-'}</code> |
        処理状態: <code>{data.latest_processing_status}</code>
      </p>

      <section style={{ marginTop: '2rem' }}>
        <h2>最近のアラート</h2>
        {data.recent_alerts.length === 0 ? (
          <p style={{ color: '#666' }}>この銘柄のアラートはまだありません。</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {data.recent_alerts.map((alert) => (
              <li key={alert.id} style={{ borderBottom: '1px solid #eee', padding: '1rem 0' }}>
                <div>
                  <strong>
                    <Link href={`/alerts/${alert.id}`} style={{ color: '#0066cc', textDecoration: 'none' }}>
                      {alert.alert_name}
                    </Link>
                  </strong>
                  <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '4px' }}>
                    発生時刻: {formatDate(alert.triggered_at || alert.received_at)} |
                    ステータス: <code>{alert.processing_status}</code>
                  </div>
                </div>
                {alert.related_ai_summary && alert.related_ai_summary.key_points.length > 0 && (
                  <ul style={{ margin: '0.5rem 0 0 1rem', color: '#333' }}>
                    {alert.related_ai_summary.key_points.map((point, index) => (
                      <li key={`${alert.related_ai_summary?.id}-${index}`}>{point}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2>主要なAI論点</h2>
        {data.latest_ai_thesis_summary ? (
          <div style={{ background: '#f5f5f5', padding: '1rem', borderRadius: '4px' }}>
            {data.latest_ai_thesis_summary.title && <h3 style={{ marginTop: 0 }}>{data.latest_ai_thesis_summary.title}</h3>}
            {data.latest_ai_thesis_summary.overall_view && (
              <p style={{ marginTop: 0 }}>{data.latest_ai_thesis_summary.overall_view}</p>
            )}
            {thesisPoints.length > 0 && (
              <ul style={{ margin: '0.5rem 0 0 1rem' }}>
                {thesisPoints.map((point, index) => (
                  <li key={`thesis-${index}`}>{point}</li>
                ))}
              </ul>
            )}
            {thesisPoints.length === 0 && (
              <p style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>{data.latest_ai_thesis_summary.body_markdown}</p>
            )}
            <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: '#777' }}>
              生成日時: {formatDate(data.latest_ai_thesis_summary.generated_at)}
            </div>
          </div>
        ) : (
          <div style={{ padding: '1rem', border: '1px dashed #ccc', color: '#666' }}>
            銘柄のAI論点はまだ生成されていません。
          </div>
        )}
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2>関連情報リンク</h2>
        {data.related_references.length === 0 ? (
          <p style={{ color: '#666' }}>関連するニュース・開示情報はありません。</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {data.related_references.map((reference) => (
              <li key={reference.id} style={{ borderBottom: '1px solid #eee', padding: '0.75rem 0' }}>
                <div style={{ fontSize: '0.85rem', color: '#666', marginBottom: '4px' }}>
                  [{reference.reference_type}] {formatDate(reference.published_at)}
                </div>
                {reference.source_url ? (
                  <a href={reference.source_url} target="_blank" rel="noopener noreferrer" style={{ color: '#0066cc' }}>
                    {reference.title}
                  </a>
                ) : (
                  <strong>{reference.title}</strong>
                )}
                {reference.summary_text && (
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.9rem' }}>{reference.summary_text}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

