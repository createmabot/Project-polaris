import useSWR from 'swr';
import { Link } from 'wouter';
import { swrFetcher } from '../api/client';
import { BacktestListData } from '../api/types';
import { useState } from 'react';

function parseStatusText(status: string | null | undefined): string {
  if (status === 'parsed') return '解析成功';
  if (status === 'failed') return '解析失敗';
  if (status === 'pending') return '解析待ち';
  if (!status) return '取込なし';
  return status;
}

function parseStatusStyle(status: string | null | undefined): { background: string; color: string } {
  if (status === 'parsed') return { background: '#e8f6ea', color: '#176b2d' };
  if (status === 'failed') return { background: '#fdeaea', color: '#9f1c1c' };
  if (status === 'pending') return { background: '#eef4ff', color: '#144b9a' };
  return { background: '#f2f2f2', color: '#444' };
}

export default function BacktestList() {
  const PAGE_SIZE = 20;
  const [page, setPage] = useState(1);
  const { data, error, isLoading } = useSWR<BacktestListData>(
    `/api/backtests?page=${page}&limit=${PAGE_SIZE}`,
    swrFetcher
  );

  if (isLoading) return <div style={{ padding: '2rem' }}>読み込み中...</div>;
  if (error) return <div style={{ padding: '2rem', color: '#a10000' }}>エラー: {error.message}</div>;
  if (!data) return null;

  return (
    <div style={{ padding: '2rem', maxWidth: '960px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <div style={{ marginBottom: '1rem', display: 'flex', gap: '1rem' }}>
        <Link href='/' style={{ color: '#666', textDecoration: 'none' }}>ホームへ戻る</Link>
        <Link href='/strategy-lab' style={{ color: '#666', textDecoration: 'none' }}>ルール検証ラボへ戻る</Link>
      </div>

      <h1>検証履歴一覧（直近）</h1>
      <p style={{ color: '#666' }}>
        直近の backtest を表示します。詳細分析は各 backtest 詳細画面で確認してください。
      </p>

      {data.backtests.length === 0 ? (
        <div style={{ marginTop: '1rem', padding: '1rem', border: '1px solid #ddd', borderRadius: '6px', color: '#666' }}>
          まだ検証履歴はありません。`/strategy-lab` からルール生成とCSV取込を実行してください。
        </div>
      ) : (
        <div style={{ marginTop: '1rem', display: 'grid', gap: '0.8rem' }}>
          {data.backtests.map((item) => {
            const parseStatus = item.latest_import?.parse_status ?? null;
            const style = parseStatusStyle(parseStatus);
            return (
              <div
                key={item.id}
                style={{
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  padding: '1rem',
                  display: 'grid',
                  gap: '0.45rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                  <div style={{ fontWeight: 600 }}>{item.title}</div>
                  <div style={{ color: '#666', fontSize: '0.9rem' }}>
                    作成: {new Date(item.created_at).toLocaleString('ja-JP')}
                  </div>
                </div>

                <div style={{ fontSize: '0.95rem', color: '#333', display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}>
                  <span><strong>市場:</strong> {item.market}</span>
                  <span><strong>時間足:</strong> {item.timeframe}</span>
                  <span><strong>ソース:</strong> {item.execution_source}</span>
                  <span><strong>状態:</strong> <code>{item.status}</code></span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <span style={{ color: '#555' }}><strong>最新解析:</strong></span>
                  <span
                    style={{
                      borderRadius: '999px',
                      padding: '0.2rem 0.6rem',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      ...style,
                    }}
                  >
                    {parseStatusText(parseStatus)}
                  </span>
                  {item.latest_import?.parse_error && (
                    <span style={{ color: '#9f1c1c', fontSize: '0.9rem' }}>エラーあり（詳細で確認）</span>
                  )}
                </div>

                <div>
                  <Link href={`/backtests/${item.id}`} style={{ color: '#0a5bb5', textDecoration: 'none', fontWeight: 600 }}>
                    詳細を開く
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <button
          type='button'
          onClick={() => setPage((current) => Math.max(1, current - 1))}
          disabled={!data.pagination.has_prev}
          style={{
            padding: '0.45rem 0.85rem',
            border: '1px solid #ccc',
            borderRadius: '4px',
            background: data.pagination.has_prev ? '#fff' : '#f3f3f3',
            color: '#333',
            cursor: data.pagination.has_prev ? 'pointer' : 'default',
          }}
        >
          前へ
        </button>
        <button
          type='button'
          onClick={() => setPage((current) => current + 1)}
          disabled={!data.pagination.has_next}
          style={{
            padding: '0.45rem 0.85rem',
            border: '1px solid #ccc',
            borderRadius: '4px',
            background: data.pagination.has_next ? '#fff' : '#f3f3f3',
            color: '#333',
            cursor: data.pagination.has_next ? 'pointer' : 'default',
          }}
        >
          次へ
        </button>
        <span style={{ color: '#666', fontSize: '0.9rem' }}>
          {data.pagination.page} / {Math.max(1, Math.ceil(data.pagination.total / data.pagination.limit))} ページ
        </span>
      </div>
    </div>
  );
}

