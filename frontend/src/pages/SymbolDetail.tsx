import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { Link, useRoute } from 'wouter';
import { postApi, swrFetcher } from '../api/client';
import { SymbolAiSummaryData, SymbolDetailData } from '../api/types';

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

function getReferenceBreakdown(references: Array<{ reference_type?: string | null }>) {
  return references.reduce(
    (acc, reference) => {
      if (reference.reference_type === 'news') acc.news += 1;
      if (reference.reference_type === 'disclosure') acc.disclosure += 1;
      if (reference.reference_type === 'earnings') acc.earnings += 1;
      return acc;
    },
    { news: 0, disclosure: 0, earnings: 0 },
  );
}

const EMPTY_STATE_HINT = 'データ未投入の場合は、seed 実行後にページを再読み込みしてください。';

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
  const tvContainerRef = useRef<HTMLDivElement>(null);
  const [isGeneratingThesis, setIsGeneratingThesis] = useState(false);
  const [generateThesisError, setGenerateThesisError] = useState<string | null>(null);

  const { data, error, isLoading } = useSWR<SymbolDetailData>(
    symbolId ? `/api/symbols/${symbolId}` : null,
    swrFetcher,
  );
  const {
    data: aiSummaryData,
    error: aiSummaryError,
    isLoading: isAiSummaryLoading,
    mutate: mutateAiSummary,
  } = useSWR<SymbolAiSummaryData>(
    symbolId ? `/api/symbols/${symbolId}/ai-summary?scope=thesis` : null,
    swrFetcher,
  );

  useEffect(() => {
    if (!data?.chart?.widget_symbol || !tvContainerRef.current) return;

    tvContainerRef.current.innerHTML = '';

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/tv.js';
    script.async = true;
    script.onload = () => {
      if (typeof (window as any).TradingView !== 'undefined') {
        new (window as any).TradingView.widget({
          autosize: true,
          symbol: data.chart?.widget_symbol,
          interval: data.chart?.default_interval || 'D',
          timezone: 'Asia/Tokyo',
          theme: 'light',
          style: '1',
          locale: 'ja',
          enable_publishing: false,
          hide_top_toolbar: false,
          hide_legend: false,
          save_image: false,
          container_id: tvContainerRef.current?.id,
        });
      }
    };
    tvContainerRef.current.appendChild(script);
  }, [data?.chart?.widget_symbol, data?.chart?.default_interval]);

  if (isLoading) return <div style={{ padding: '2rem' }}>銘柄情報を読み込み中...</div>;

  if (error) {
    if (error.code === 'NOT_FOUND' || error.message.includes('404')) {
      return (
        <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
          <h2>銘柄が見つかりません</h2>
          <p>指定された銘柄IDは存在しないか、削除されています。</p>
          <Link href="/">ホームへ戻る</Link>
        </div>
      );
    }
    return <div style={{ padding: '2rem', color: 'red' }}>エラー: {error.message}</div>;
  }

  if (!data) return null;

  const aiSummary = aiSummaryData?.summary;
  const availableSummary =
    aiSummary?.status === 'available'
      ? {
          title: aiSummary.title,
          body_markdown: aiSummary.body_markdown ?? '',
          generated_at: aiSummary.generated_at,
          structured_json: aiSummary.structured_json,
        }
      : data.latest_ai_thesis_summary;
  const thesisPoints = getThesisPoints(availableSummary?.structured_json);
  const hasSummaryContent = Boolean(
    availableSummary?.title?.trim() ||
      availableSummary?.body_markdown?.trim() ||
      thesisPoints.length > 0,
  );
  const referenceBreakdown = getReferenceBreakdown(data.related_references);
  const aiSummaryInsufficientContext =
    aiSummary?.insufficient_context === true ||
    availableSummary?.structured_json?.insufficient_context === true;
  const hasNoReferences = data.related_references.length === 0;

  async function handleGenerateThesis(forceRegenerate = false) {
    if (!symbolId || !data) return;
    setIsGeneratingThesis(true);
    setGenerateThesisError(null);
    try {
      await postApi(`/api/symbols/${symbolId}/ai-summary/generate`, {
        scope: 'thesis',
        reference_ids: data.related_references.slice(0, 5).map((item) => item.id),
        force_regenerate: forceRegenerate,
      });
      await mutateAiSummary();
    } catch (err: any) {
      setGenerateThesisError(err?.message ?? 'AI論点カード生成に失敗しました。');
    } finally {
      setIsGeneratingThesis(false);
    }
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '920px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <div style={{ marginBottom: '1rem' }}>
        <Link href="/" style={{ color: '#666', textDecoration: 'none' }}>
          ホームへ戻る
        </Link>
      </div>

      <h1>{data.symbol.display_name || data.symbol.symbol}</h1>
      <p style={{ color: '#666' }}>
        コード: <code>{data.symbol.symbol_code || data.symbol.symbol}</code> | 市場: <code>{data.symbol.market_code || '-'}</code> |
        処理状態: <code>{data.latest_processing_status}</code>
      </p>
      <div style={{ marginBottom: '1rem' }}>
        <Link
          href={`/compare?symbolIds=${encodeURIComponent(data.symbol.symbol_code || data.symbol.symbol)}`}
          style={{ color: '#0066cc', textDecoration: 'none' }}
        >
          比較画面に進む
        </Link>
      </div>

      {data.chart && data.chart.widget_symbol && (
        <section style={{ marginTop: '1.25rem', height: '500px', width: '100%' }}>
          <div id={`tv_chart_${data.symbol.id}`} ref={tvContainerRef} style={{ height: '100%', width: '100%' }} />
        </section>
      )}

      <section style={{ marginTop: '1.25rem' }}>
        <h2>現在スナップショット</h2>
        {data.current_snapshot ? (
          <div style={{ background: '#f7f9fc', border: '1px solid #dde5ef', borderRadius: '6px', padding: '0.9rem' }}>
            <div>
              現在値: <strong>{formatNumber(data.current_snapshot.last_price, 3)}</strong>
            </div>
            <div>
              前日比: {formatNumber(data.current_snapshot.change, 3)} (
              {data.current_snapshot.change_percent === null ? '-' : `${formatNumber(data.current_snapshot.change_percent, 2)}%`})
            </div>
            <div>出来高: {formatNumber(data.current_snapshot.volume, 0)}</div>
            <div style={{ fontSize: '0.85rem', color: '#666' }}>
              ソース: {data.current_snapshot.source_name} | asOf: {formatDate(data.current_snapshot.as_of)} | 市場状態:{' '}
              <code>{data.current_snapshot.market_status}</code>
            </div>
          </div>
        ) : (
          <p style={{ color: '#666' }}>スナップショットを取得できませんでした。</p>
        )}
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2>最新アラート</h2>
        {data.recent_alerts.length === 0 ? (
          <p style={{ color: '#666' }}>この銘柄のアラートはまだありません。</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {data.recent_alerts.map((alert) => (
              <li key={alert.id} style={{ borderBottom: '1px solid #eee', padding: '1rem 0' }}>
                <strong>
                  <Link href={`/alerts/${alert.id}`} style={{ color: '#0066cc', textDecoration: 'none' }}>
                    {alert.alert_name}
                  </Link>
                </strong>
                <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '4px' }}>
                  発生: {formatDate(alert.triggered_at || alert.received_at)} | 状態: <code>{alert.processing_status}</code>
                </div>
                {alert.related_ai_summary && alert.related_ai_summary.key_points.length > 0 && (
                  <ul style={{ margin: '0.5rem 0 0 1rem' }}>
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
        <h2>最新AI論点カード</h2>
        {isAiSummaryLoading ? (
          <div style={{ padding: '1rem', border: '1px dashed #ccc', color: '#666' }}>
            AI論点カードを読み込み中...
          </div>
        ) : availableSummary && hasSummaryContent ? (
          <div style={{ background: '#f5f5f5', padding: '1rem', borderRadius: '4px' }}>
            {availableSummary.title && <h3 style={{ marginTop: 0 }}>{availableSummary.title}</h3>}
            {thesisPoints.length > 0 ? (
              <ul style={{ margin: '0.5rem 0 0 1rem' }}>
                {thesisPoints.map((point, index) => (
                  <li key={`thesis-${index}`}>{point}</li>
                ))}
              </ul>
            ) : (
              <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{availableSummary.body_markdown}</p>
            )}
            <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: '#777' }}>
              生成日時: {formatDate(availableSummary.generated_at)}
            </div>
            <div style={{ marginTop: '0.75rem' }}>
              <button
                onClick={() => handleGenerateThesis(true)}
                disabled={isGeneratingThesis}
                style={{
                  background: isGeneratingThesis ? '#adb5bd' : '#0066cc',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '0.45rem 0.8rem',
                  cursor: isGeneratingThesis ? 'not-allowed' : 'pointer',
                }}
              >
                {isGeneratingThesis ? '生成中...' : 'AI論点カードを再生成'}
              </button>
            </div>
          </div>
        ) : aiSummary?.status === 'unavailable' || aiSummaryError ? (
          <div style={{ padding: '1rem', border: '1px dashed #ccc', color: '#666' }}>
            <div>AI論点カードは未生成です。</div>
            <div style={{ marginTop: '0.35rem', fontSize: '0.82rem' }}>{EMPTY_STATE_HINT}</div>
            <div style={{ marginTop: '0.75rem' }}>
              <button
                onClick={() => handleGenerateThesis(false)}
                disabled={isGeneratingThesis}
                style={{
                  background: isGeneratingThesis ? '#adb5bd' : '#0066cc',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '0.45rem 0.8rem',
                  cursor: isGeneratingThesis ? 'not-allowed' : 'pointer',
                }}
              >
                {isGeneratingThesis ? '生成中...' : 'AI論点カード生成'}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ padding: '1rem', border: '1px dashed #ccc', color: '#666' }}>
            <div>AI論点カードは空です。</div>
            <div style={{ marginTop: '0.35rem', fontSize: '0.82rem' }}>{EMPTY_STATE_HINT}</div>
          </div>
        )}
        {availableSummary && hasSummaryContent && (aiSummaryInsufficientContext || hasNoReferences) && (
          <div style={{ marginTop: '0.5rem', color: '#666', fontSize: '0.82rem' }}>
            {hasNoReferences
              ? '参照情報は0件です。スナップショットやノート中心の要約になっている可能性があります。'
              : '参照情報が不足しているため、要約の精度が限定的な可能性があります。'}
          </div>
        )}
        {generateThesisError && (
          <div style={{ marginTop: '0.5rem', color: '#b02a37', fontSize: '0.85rem' }}>{generateThesisError}</div>
        )}
      </section>

      <section style={{ marginTop: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>Research Note</h2>
          {data.latest_active_note ? (
            <Link
              href={`/notes/${data.latest_active_note.id}`}
              style={{ background: '#0066cc', color: '#fff', textDecoration: 'none', padding: '0.5rem 1rem', borderRadius: '4px' }}
            >
              ノートを開く
            </Link>
          ) : (
            <Link
              href={`/symbols/${symbolId}/note/new`}
              style={{ background: '#28a745', color: '#fff', textDecoration: 'none', padding: '0.5rem 1rem', borderRadius: '4px' }}
            >
              ノートを新規作成
            </Link>
          )}
        </div>

        {data.latest_active_note ? (
          <div style={{ background: '#fff', border: '1px solid #ddd', padding: '1.2rem', borderRadius: '4px', marginTop: '1rem' }}>
            <h3 style={{ marginTop: 0 }}>{data.latest_active_note.title}</h3>
            <div style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.8rem' }}>
              最終更新: {formatDate(data.latest_active_note.updatedAt)} | 状態: <code>{data.latest_active_note.status}</code>
            </div>
            {data.latest_active_note.thesisText && <p style={{ whiteSpace: 'pre-wrap' }}>{data.latest_active_note.thesisText}</p>}
            {data.latest_active_note.nextReviewAt && (
              <div style={{ color: '#d9534f', fontWeight: 600 }}>次回確認日: {formatDate(data.latest_active_note.nextReviewAt)}</div>
            )}
          </div>
        ) : (
          <div style={{ padding: '1rem', border: '1px dashed #ccc', color: '#666', marginTop: '1rem' }}>
            <div>アクティブな research note はありません。</div>
            <div style={{ marginTop: '0.35rem', fontSize: '0.82rem' }}>{EMPTY_STATE_HINT}</div>
          </div>
        )}
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2>関連参照情報</h2>
        <p style={{ marginTop: '-0.2rem', marginBottom: '0.6rem', color: '#666', fontSize: '0.85rem' }}>
          内訳: news {referenceBreakdown.news} / disclosure {referenceBreakdown.disclosure} / earnings {referenceBreakdown.earnings}
        </p>
        {data.related_references.length === 0 ? (
          <div style={{ color: '#666' }}>
            <p style={{ marginTop: 0, marginBottom: '0.35rem' }}>関連参照情報はありません。</p>
            <p style={{ margin: 0, fontSize: '0.82rem' }}>{EMPTY_STATE_HINT}</p>
          </div>
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
                {reference.summary_text && <p style={{ margin: '4px 0 0 0' }}>{reference.summary_text}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
