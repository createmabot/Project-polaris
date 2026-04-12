import useSWR from 'swr';
import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { swrFetcher } from '../api/client';
import { HomeData } from '../api/types';

type HomeSummaryType = 'latest' | 'morning' | 'evening';

const SUMMARY_OPTIONS: Array<{ value: HomeSummaryType; label: string }> = [
  { value: 'latest', label: '最新' },
  { value: 'morning', label: '朝' },
  { value: 'evening', label: '夜' },
];

export function buildHomeApiPath(summaryType: HomeSummaryType, date: string | null): string {
  const params = new URLSearchParams();
  params.set('summary_type', summaryType);
  if (date) {
    params.set('date', date);
  }
  return `/api/home?${params.toString()}`;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function formatDate(value: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ja-JP');
}

export default function Home() {
  const [summaryType, setSummaryType] = useState<HomeSummaryType>('latest');
  const [summaryDate] = useState<string | null>(null);
  const homeApiPath = useMemo(() => buildHomeApiPath(summaryType, summaryDate), [summaryType, summaryDate]);
  const { data, error, isLoading } = useSWR<HomeData>(homeApiPath, swrFetcher);

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
        <h2>マーケット概況</h2>
        <div style={{ background: '#f5f5f5', padding: '1rem', borderRadius: '4px' }}>
          {asArray<{ display_name?: string; price?: number; change_rate?: number }>(data.market_overview?.indices).length === 0 &&
          asArray<{ display_name?: string; price?: number; change_rate?: number }>(data.market_overview?.fx).length === 0 &&
          asArray<{ display_name?: string; change_rate?: number }>(data.market_overview?.sectors).length === 0 ? (
            <p style={{ margin: 0, color: '#777' }}>マーケット概況データはまだありません。</p>
          ) : (
            <div style={{ display: 'grid', gap: '0.6rem' }}>
              {asArray<{ display_name?: string; price?: number; change_rate?: number }>(data.market_overview?.indices).map((item, index) => (
                <div key={`index-${index}`} style={{ fontSize: '0.9rem' }}>
                  指数: {item.display_name ?? '-'} / 値: {item.price ?? '-'} / 変化率: {item.change_rate ?? '-'}
                </div>
              ))}
              {asArray<{ display_name?: string; price?: number; change_rate?: number }>(data.market_overview?.fx).map((item, index) => (
                <div key={`fx-${index}`} style={{ fontSize: '0.9rem' }}>
                  為替: {item.display_name ?? '-'} / 値: {item.price ?? '-'} / 変化率: {item.change_rate ?? '-'}
                </div>
              ))}
              {asArray<{ display_name?: string; change_rate?: number }>(data.market_overview?.sectors).map((item, index) => (
                <div key={`sector-${index}`} style={{ fontSize: '0.9rem' }}>
                  セクター: {item.display_name ?? '-'} / 変化率: {item.change_rate ?? '-'}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section style={{ marginTop: '1.5rem' }}>
        <h2>監視銘柄</h2>
        {data.watchlist_symbols.length === 0 ? (
          <p style={{ color: '#777' }}>監視銘柄はまだありません。</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {data.watchlist_symbols.map((symbol: any, index: number) => (
              <li key={symbol.symbol_id ?? `watch-${index}`} style={{ padding: '0.45rem 0', borderBottom: '1px solid #eee' }}>
                {symbol.symbol_id ? (
                  <Link href={`/symbols/${symbol.symbol_id}`} style={{ color: '#0066cc', textDecoration: 'none' }}>
                    {symbol.display_name ?? symbol.symbol_id}
                  </Link>
                ) : (
                  <span>{symbol.display_name ?? '不明'}</span>
                )}
                <span style={{ fontSize: '0.85rem', color: '#666', marginLeft: '0.6rem' }}>
                  価格: {symbol.latest_price ?? '-'} / 変化率: {symbol.change_rate ?? '-'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: '1.5rem' }}>
        <h2>保有銘柄</h2>
        {data.positions.length === 0 ? (
          <p style={{ color: '#777' }}>保有銘柄はまだありません。</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {data.positions.map((position: any, index: number) => (
              <li key={position.position_id ?? `position-${index}`} style={{ padding: '0.45rem 0', borderBottom: '1px solid #eee' }}>
                <span>{position.display_name ?? position.symbol_id ?? '不明'}</span>
                <span style={{ fontSize: '0.85rem', color: '#666', marginLeft: '0.6rem' }}>
                  数量: {position.quantity ?? '-'} / 評価損益: {position.unrealized_pnl ?? '-'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: '1.5rem' }}>
        <h2>デイリーサマリー</h2>
        <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.6rem' }}>
          {SUMMARY_OPTIONS.map((option) => {
            const selected = summaryType === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setSummaryType(option.value)}
                style={{
                  padding: '0.3rem 0.7rem',
                  borderRadius: '999px',
                  border: selected ? '1px solid #1f6feb' : '1px solid #ccc',
                  background: selected ? '#e7f1ff' : '#fff',
                  color: selected ? '#0b3d91' : '#333',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
                aria-pressed={selected}
              >
                {option.label}
              </button>
            );
          })}
        </div>
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

      <section style={{ marginTop: '1.5rem' }}>
        <h2>注目イベント</h2>
        {data.key_events.length === 0 ? (
          <p style={{ color: '#777' }}>注目イベントはまだありません。</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {data.key_events.map((event: any, index: number) => (
              <li key={`${event.label ?? 'event'}-${index}`} style={{ padding: '0.45rem 0', borderBottom: '1px solid #eee' }}>
                <strong>{event.label ?? 'イベント'}</strong>
                <span style={{ fontSize: '0.85rem', color: '#666', marginLeft: '0.6rem' }}>
                  日付: {event.date ?? '-'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
