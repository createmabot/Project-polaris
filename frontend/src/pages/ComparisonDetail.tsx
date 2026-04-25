import { useState } from 'react';
import useSWR from 'swr';
import { Link, useRoute } from 'wouter';
import { postApi, swrFetcher } from '../api/client';
import { ComparisonDetailData, ComparisonGenerateData } from '../api/types';

function formatDate(value: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ja-JP');
}

function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  return value.toLocaleString('ja-JP', { maximumFractionDigits: digits });
}

function toSummaryPreview(bodyMarkdown: string): string {
  return bodyMarkdown.length <= 220 ? bodyMarkdown : `${bodyMarkdown.slice(0, 220)}...`;
}

const EMPTY_STATE_HINT = 'データ未生成の場合は「比較総評を生成」を実行し、ページを再読み込みしてください。';

export default function ComparisonDetail() {
  const [, params] = useRoute('/comparisons/:comparisonId');
  const comparisonId = params?.comparisonId;

  const { data, error, isLoading, mutate } = useSWR<ComparisonDetailData>(
    comparisonId ? `/api/comparisons/${comparisonId}` : null,
    swrFetcher
  );

  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generateInfo, setGenerateInfo] = useState<string | null>(null);

  const onGenerate = async () => {
    if (!comparisonId) return;
    setGenerateError(null);
    setGenerateInfo(null);
    setIsGenerating(true);
    try {
      const result = await postApi<ComparisonGenerateData>(`/api/comparisons/${comparisonId}/generate`, {
        metrics: ['thesis_presence', 'active_note_presence', 'recent_alert_count', 'recent_reference_count', 'latest_processing_status'],
        include_ai_summary: true,
      });
      setGenerateInfo(`比較結果を更新しました（result: ${result.comparison_result_id}）`);
      await mutate();
    } catch (err: any) {
      setGenerateError(err?.message ?? '比較総評の生成に失敗しました。');
    } finally {
      setIsGenerating(false);
    }
  };

  if (isLoading) {
    return <div style={{ padding: '2rem' }}>比較データを読み込み中...</div>;
  }

  if (error) {
    return (
      <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
        <h2>比較データの取得に失敗しました</h2>
        <p style={{ color: '#a10000' }}>{error.message}</p>
        <Link href="/compare">比較作成へ戻る</Link>
      </div>
    );
  }

  if (!data) return null;

  if (data.symbols.length === 0) {
    return (
      <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
        <h2>比較対象がありません</h2>
        <p>比較対象の銘柄が0件です。比較を作り直してください。</p>
        <Link href="/compare">比較作成へ</Link>
      </div>
    );
  }

  const metricSnapshot = data.latest_result?.compared_metric_json;
  const symbolMetrics = Array.isArray(metricSnapshot?.symbol_metrics) ? metricSnapshot.symbol_metrics : [];
  const aiSummaryState: 'loading' | 'empty' | 'unavailable' | 'available' =
    isGenerating
      ? 'loading'
      : !data.latest_result
        ? 'empty'
        : data.latest_result.ai_summary
          ? 'available'
          : 'unavailable';

  return (
    <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <div style={{ marginBottom: '1rem', display: 'flex', gap: '1rem' }}>
        <Link href="/" style={{ color: '#666', textDecoration: 'none' }}>ホーム</Link>
        <Link href="/compare" style={{ color: '#666', textDecoration: 'none' }}>比較作成</Link>
      </div>

      <h1>{data.comparison_header.name || '銘柄比較'}</h1>
      <p style={{ color: '#666' }}>
        比較ID: <code>{data.comparison_header.comparison_id}</code> |
        件数: {data.comparison_header.symbol_count} |
        更新: {formatDate(data.comparison_header.updated_at)}
      </p>
      <p style={{ marginTop: '-0.35rem', marginBottom: '1rem', color: '#666', fontSize: '0.9rem' }}>
        まず「比較メトリクス」を確認し、次に「AI 比較総評」で要点を確認する流れです。
      </p>
      <div style={{ marginBottom: '1rem' }}>
        <button
          type="button"
          onClick={onGenerate}
          disabled={isGenerating}
          style={{
            padding: '0.6rem 1rem',
            border: 'none',
            borderRadius: '4px',
            background: isGenerating ? '#9cbbe0' : '#0a5bb5',
            color: '#fff',
            cursor: isGenerating ? 'default' : 'pointer',
          }}
        >
          {isGenerating ? '生成中...' : '比較総評を生成'}
        </button>
      </div>
      {generateError && <div style={{ marginBottom: '1rem', color: '#a10000' }}>{generateError}</div>}
      {generateInfo && <div style={{ marginBottom: '1rem', color: '#1a6b1a' }}>{generateInfo}</div>}

      <section style={{ marginBottom: '1.5rem', border: '1px solid #ddd', borderRadius: '6px', padding: '1rem', background: '#fafafa' }}>
        <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>比較メトリクス</h2>
        {data.latest_result ? (
          <>
            <div style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.5rem' }}>
              生成日時: {formatDate(data.latest_result.generated_at)}
            </div>
            {symbolMetrics.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '0.4rem' }}>銘柄</th>
                      <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '0.4rem' }}>現在値</th>
                      <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '0.4rem' }}>前日比</th>
                      <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '0.4rem' }}>変化率</th>
                      <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '0.4rem' }}>thesis</th>
                      <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '0.4rem' }}>note</th>
                      <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '0.4rem' }}>alerts</th>
                      <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '0.4rem' }}>references</th>
                      <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '0.4rem' }}>status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {symbolMetrics.map((row: any) => (
                      <tr key={row.symbol_id}>
                        <td style={{ borderBottom: '1px solid #eee', padding: '0.4rem' }}>{row.display_name || row.symbol_id}</td>
                        <td style={{ borderBottom: '1px solid #eee', padding: '0.4rem' }}>{formatNumber(row.last_price, 3)}</td>
                        <td style={{ borderBottom: '1px solid #eee', padding: '0.4rem' }}>{formatNumber(row.change, 3)}</td>
                        <td style={{ borderBottom: '1px solid #eee', padding: '0.4rem' }}>
                          {row.change_percent === null || row.change_percent === undefined
                            ? '-'
                            : `${formatNumber(row.change_percent, 2)}%`}
                        </td>
                        <td style={{ borderBottom: '1px solid #eee', padding: '0.4rem' }}>{row.thesis_presence}</td>
                        <td style={{ borderBottom: '1px solid #eee', padding: '0.4rem' }}>{row.active_note_presence}</td>
                        <td style={{ borderBottom: '1px solid #eee', padding: '0.4rem' }}>{row.recent_alert_count}</td>
                        <td style={{ borderBottom: '1px solid #eee', padding: '0.4rem' }}>{row.recent_reference_count}</td>
                        <td style={{ borderBottom: '1px solid #eee', padding: '0.4rem' }}>{row.latest_processing_status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={{ color: '#666', margin: 0 }}>比較メトリクスはまだありません。</p>
            )}
          </>
        ) : (
          <div style={{ color: '#666' }}>
            <p style={{ marginTop: 0, marginBottom: '0.35rem' }}>未生成です。「比較総評を生成」を実行してください。</p>
            <p style={{ margin: 0, fontSize: '0.82rem' }}>{EMPTY_STATE_HINT}</p>
          </div>
        )}
      </section>

      <section style={{ marginBottom: '1.5rem', border: '1px solid #ddd', borderRadius: '6px', padding: '1rem', background: '#fff' }}>
        <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>AI 比較総評</h2>
        {aiSummaryState === 'loading' ? (
          <div style={{ color: '#666' }}>
            <p style={{ marginTop: 0, marginBottom: '0.35rem' }}>AI総評を生成中です...</p>
          </div>
        ) : aiSummaryState === 'available' && data.latest_result?.ai_summary ? (
          <>
            <h3 style={{ marginBottom: '0.4rem' }}>{data.latest_result.ai_summary.title || '比較総評'}</h3>
            <p style={{ whiteSpace: 'pre-wrap', marginTop: 0 }}>{data.latest_result.ai_summary.body_markdown}</p>
            <div style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.5rem' }}>
              model: {data.latest_result.ai_summary.model_name || '-'} | prompt: {data.latest_result.ai_summary.prompt_version || '-'}
            </div>
            <div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(data.latest_result?.ai_summary?.body_markdown || '');
                  alert('比較総評をクリップボードにコピーしました。研究ノート等に貼り付けてご利用ください。');
                }}
                style={{
                  padding: '0.4rem 0.8rem',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  background: '#f9f9f9',
                  cursor: 'pointer',
                  fontSize: '0.9rem'
                }}
              >
                📋 総評をコピーしてノートで使う
              </button>
            </div>
          </>
        ) : aiSummaryState === 'unavailable' ? (
          <div style={{ color: '#666' }}>
            <p style={{ marginTop: 0, marginBottom: '0.35rem' }}>比較結果はありますが、AI総評は未利用または利用不可です。</p>
            <p style={{ margin: 0, fontSize: '0.82rem' }}>{EMPTY_STATE_HINT}</p>
          </div>
        ) : (
          <div style={{ color: '#666' }}>
            <p style={{ marginTop: 0, marginBottom: '0.35rem' }}>比較総評はまだ生成されていません。</p>
            <p style={{ margin: 0, fontSize: '0.82rem' }}>{EMPTY_STATE_HINT}</p>
          </div>
        )}
      </section>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${Math.min(data.symbols.length, 4)}, minmax(260px, 1fr))`,
          gap: '1rem',
          alignItems: 'start',
        }}
      >
        {data.symbols.map((item) => (
          <article key={item.symbol.id} style={{ border: '1px solid #ddd', borderRadius: '6px', padding: '1rem', background: '#fff' }}>
            <header style={{ marginBottom: '1rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.1rem' }}>
                <Link href={`/symbols/${item.symbol.id}`} style={{ color: '#0a5bb5', textDecoration: 'none' }}>
                  {item.symbol.display_name || item.symbol.symbol}
                </Link>
              </h2>
              <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '4px' }}>
                コード: {item.symbol.symbol_code || item.symbol.symbol} | 市場: {item.symbol.market_code || '-'}
              </div>
              <div style={{ fontSize: '0.85rem', color: '#666' }}>
                処理状態: <code>{item.latest_processing_status}</code>
              </div>
              <div style={{ fontSize: '0.85rem', color: '#333', marginTop: '6px' }}>
                現在値: {item.current_snapshot ? formatNumber(item.current_snapshot.last_price, 3) : '-'} | 前日比:{' '}
                {item.current_snapshot ? formatNumber(item.current_snapshot.change, 3) : '-'} | 変化率:{' '}
                {item.current_snapshot && item.current_snapshot.change_percent !== null
                  ? `${formatNumber(item.current_snapshot.change_percent, 2)}%`
                  : '-'}
              </div>
            </header>

            <section style={{ marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1rem', marginBottom: '0.4rem' }}>最新AI論点</h3>
              {item.latest_ai_thesis_summary ? (
                <>
                  {item.latest_ai_thesis_summary.title && (
                    <div style={{ fontWeight: 600, marginBottom: '0.35rem' }}>{item.latest_ai_thesis_summary.title}</div>
                  )}
                  <p style={{ margin: 0, fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>
                    {toSummaryPreview(item.latest_ai_thesis_summary.body_markdown)}
                  </p>
                </>
              ) : (
                <p style={{ margin: 0, color: '#666' }}>AI要約は未生成です。</p>
              )}
            </section>

            <section style={{ marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1rem', marginBottom: '0.4rem' }}>アクティブノート要点</h3>
              {item.latest_active_note ? (
                <>
                  <div style={{ fontWeight: 600 }}>
                    <Link href={`/notes/${item.latest_active_note.id}`} style={{ color: '#0a5bb5', textDecoration: 'none' }}>
                      {item.latest_active_note.title}
                    </Link>
                  </div>
                  <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.9rem' }}>
                    {item.latest_active_note.thesisText || item.latest_active_note.scenarioText || '要点テキストなし'}
                  </p>
                </>
              ) : (
                <p style={{ margin: 0, color: '#666' }}>アクティブノートはありません。</p>
              )}
            </section>

            <section style={{ marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1rem', marginBottom: '0.4rem' }}>最近のアラート</h3>
              {item.recent_alerts.length === 0 ? (
                <p style={{ margin: 0, color: '#666' }}>アラートなし</p>
              ) : (
                <ul style={{ margin: 0, paddingLeft: '1rem' }}>
                  {item.recent_alerts.map((alert) => (
                    <li key={alert.id} style={{ marginBottom: '0.5rem' }}>
                      <Link href={`/alerts/${alert.id}`} style={{ color: '#0a5bb5', textDecoration: 'none' }}>{alert.alert_name}</Link>
                      <div style={{ fontSize: '0.8rem', color: '#666' }}>{formatDate(alert.triggered_at || alert.received_at)}</div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 style={{ fontSize: '1rem', marginBottom: '0.4rem' }}>最近の関連参照</h3>
              {item.related_references.length === 0 ? (
                <p style={{ margin: 0, color: '#666' }}>参照情報なし</p>
              ) : (
                <ul style={{ margin: 0, paddingLeft: '1rem' }}>
                  {item.related_references.map((reference) => (
                    <li key={reference.id} style={{ marginBottom: '0.5rem' }}>
                      {reference.source_url ? (
                        <a href={reference.source_url} target="_blank" rel="noopener noreferrer" style={{ color: '#0a5bb5' }}>
                          {reference.title}
                        </a>
                      ) : (
                        <span>{reference.title}</span>
                      )}
                      <div style={{ fontSize: '0.8rem', color: '#666' }}>
                        [{reference.reference_type}] {formatDate(reference.published_at)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </article>
        ))}
      </div>
    </div>
  );
}

