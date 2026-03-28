import useSWR from 'swr';
import { Link, useLocation } from 'wouter';
import { swrFetcher } from '../api/client';
import { BacktestListData } from '../api/types';
import { FormEvent, useEffect, useState } from 'react';

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

function shortId(value: string | null | undefined): string {
  if (!value) return '-';
  if (value.length <= 14) return value;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

export type BacktestListQueryState = {
  q: string;
  page: number;
  status: string;
  sort: 'created_at' | 'updated_at';
  order: 'asc' | 'desc';
};

function normalizeBacktestSort(value: string | null | undefined): 'created_at' | 'updated_at' {
  return value === 'updated_at' ? 'updated_at' : 'created_at';
}

function normalizeBacktestOrder(value: string | null | undefined): 'asc' | 'desc' {
  return value === 'asc' ? 'asc' : 'desc';
}

export function buildBacktestListPath(page: number, limit: number, q: string, status = '', sort: 'created_at' | 'updated_at' = 'created_at', order: 'asc' | 'desc' = 'desc'): string {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('limit', String(limit));
  if (q.trim()) {
    params.set('q', q.trim());
  }
  if (status.trim()) {
    params.set('status', status.trim());
  }
  params.set('sort', sort);
  params.set('order', order);
  return `/api/backtests?${params.toString()}`;
}

export function parseBacktestsListQuery(locationPath: string): BacktestListQueryState {
  const search = locationPath.includes('?') ? locationPath.slice(locationPath.indexOf('?') + 1) : '';
  const params = new URLSearchParams(search);
  const q = (params.get('q') ?? '').trim();
  const rawPage = Number(params.get('page') ?? '1');
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const status = (params.get('status') ?? '').trim();
  const sort = normalizeBacktestSort(params.get('sort'));
  const order = normalizeBacktestOrder(params.get('order'));
  return { q, page, status, sort, order };
}

export function buildBacktestsListUrl(
  q: string,
  page: number,
  status = '',
  sort: 'created_at' | 'updated_at' = 'created_at',
  order: 'asc' | 'desc' = 'desc',
): string {
  const params = new URLSearchParams();
  const normalizedQ = q.trim();
  if (normalizedQ) params.set('q', normalizedQ);
  const normalizedStatus = status.trim();
  if (normalizedStatus) params.set('status', normalizedStatus);
  if (sort !== 'created_at') params.set('sort', sort);
  if (order !== 'desc') params.set('order', order);
  params.set('page', String(page > 0 ? page : 1));
  const query = params.toString();
  return query ? `/backtests?${query}` : '/backtests';
}

export function buildBacktestDetailUrl(
  backtestId: string,
  q: string,
  page: number,
  status = '',
  sort: 'created_at' | 'updated_at' = 'created_at',
  order: 'asc' | 'desc' = 'desc',
): string {
  const returnPath = buildBacktestsListUrl(q, page, status, sort, order);
  return `/backtests/${backtestId}?return=${encodeURIComponent(returnPath)}`;
}

export default function BacktestList() {
  const PAGE_SIZE = 20;
  const [location, setLocation] = useLocation();
  const { q: appliedQ, page, status: appliedStatus, sort: appliedSort, order: appliedOrder } = parseBacktestsListQuery(location);
  const [inputQ, setInputQ] = useState('');
  const [inputStatus, setInputStatus] = useState(appliedStatus);
  const [inputSort, setInputSort] = useState<'created_at' | 'updated_at'>(appliedSort);
  const [inputOrder, setInputOrder] = useState<'asc' | 'desc'>(appliedOrder);
  const { data, error, isLoading } = useSWR<BacktestListData>(buildBacktestListPath(page, PAGE_SIZE, appliedQ, appliedStatus, appliedSort, appliedOrder), swrFetcher);

  useEffect(() => {
    setInputQ(appliedQ);
    setInputStatus(appliedStatus);
    setInputSort(appliedSort);
    setInputOrder(appliedOrder);
  }, [appliedQ, appliedStatus, appliedSort, appliedOrder]);

  const onSubmitSearch = (event: FormEvent) => {
    event.preventDefault();
    setLocation(buildBacktestsListUrl(inputQ, 1, inputStatus, inputSort, inputOrder));
  };

  const onClearSearch = () => {
    setLocation('/backtests');
  };

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
        直近の backtest を表示します。詳細確認は各 backtest 詳細画面で確認してください。
      </p>

      <form onSubmit={onSubmitSearch} style={{ marginTop: '1rem', display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
        <input
          value={inputQ}
          onChange={(event) => setInputQ(event.target.value)}
          placeholder='タイトルで検索（部分一致）'
          style={{ minWidth: '260px', padding: '0.5rem 0.6rem', borderRadius: '4px', border: '1px solid #ccc' }}
        />
        <button
          type='submit'
          style={{
            padding: '0.45rem 0.85rem',
            border: '1px solid #0a5bb5',
            borderRadius: '4px',
            background: '#0a5bb5',
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          検索
        </button>
        <button
          type='button'
          onClick={onClearSearch}
          style={{
            padding: '0.45rem 0.85rem',
            border: '1px solid #ccc',
            borderRadius: '4px',
            background: '#fff',
            color: '#333',
            cursor: 'pointer',
          }}
        >
          クリア
        </button>
        <select
          value={inputStatus}
          onChange={(event) => setInputStatus(event.target.value)}
          style={{ minWidth: '140px', padding: '0.5rem 0.6rem', borderRadius: '4px', border: '1px solid #ccc' }}
        >
          <option value=''>状態: すべて</option>
          <option value='pending'>pending</option>
          <option value='imported'>imported</option>
          <option value='import_failed'>import_failed</option>
        </select>
        <select
          value={inputSort}
          onChange={(event) => setInputSort((event.target.value === 'updated_at' ? 'updated_at' : 'created_at'))}
          style={{ minWidth: '140px', padding: '0.5rem 0.6rem', borderRadius: '4px', border: '1px solid #ccc' }}
        >
          <option value='created_at'>並び替え: 作成日時</option>
          <option value='updated_at'>並び替え: 更新日時</option>
        </select>
        <select
          value={inputOrder}
          onChange={(event) => setInputOrder((event.target.value === 'asc' ? 'asc' : 'desc'))}
          style={{ minWidth: '120px', padding: '0.5rem 0.6rem', borderRadius: '4px', border: '1px solid #ccc' }}
        >
          <option value='desc'>降順</option>
          <option value='asc'>昇順</option>
        </select>
      </form>

      {(appliedQ || appliedStatus || appliedSort !== 'created_at' || appliedOrder !== 'desc') && (
        <div style={{ marginTop: '0.6rem', color: '#666', fontSize: '0.9rem', display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}>
          {appliedQ && (
            <span>
              検索条件: <code>{appliedQ}</code>
            </span>
          )}
          {appliedStatus && (
            <span>
              状態: <code>{appliedStatus}</code>
            </span>
          )}
          <span>
            並び: <code>{appliedSort}</code> / <code>{appliedOrder}</code>
          </span>
        </div>
      )}

      {data.backtests.length === 0 ? (
        <div style={{ marginTop: '1rem', padding: '1rem', border: '1px solid #ddd', borderRadius: '6px', color: '#666' }}>
          {appliedQ
            ? '検索条件に一致する履歴はありません。'
            : 'まだ検証履歴はありません。`/strategy-lab` からルール作成とCSV取込を実行してください。'}
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

                <div style={{ fontSize: '0.92rem', color: '#333', display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}>
                  <span title={item.strategy_id ?? ''}>
                    <strong>実行時Strategy:</strong> <code>{shortId(item.strategy_id)}</code>
                  </span>
                  <span title={item.strategy_version_id}>
                    <strong>実行時Version:</strong> <code>{shortId(item.strategy_version_id)}</code>
                  </span>
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
                  <Link
                    href={buildBacktestDetailUrl(item.id, appliedQ, page, appliedStatus, appliedSort, appliedOrder)}
                    style={{ color: '#0a5bb5', textDecoration: 'none', fontWeight: 600 }}
                  >
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
          onClick={() => setLocation(buildBacktestsListUrl(appliedQ, Math.max(1, page - 1), appliedStatus, appliedSort, appliedOrder))}
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
          onClick={() => setLocation(buildBacktestsListUrl(appliedQ, page + 1, appliedStatus, appliedSort, appliedOrder))}
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
