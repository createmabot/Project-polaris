import { FormEvent, useState } from 'react';
import useSWR from 'swr';
import { Link } from 'wouter';
import { deleteApi, patchApi, postApi, swrFetcher } from '../api/client';
import { WatchlistItemData, WatchlistItemMutateData } from '../api/types';

type MessageState = { kind: 'success' | 'error'; text: string } | null;

function toNullableInteger(value: FormDataEntryValue | null): number | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed)) {
    throw new Error('priority は整数で入力してください。');
  }
  return parsed;
}

export default function WatchlistManage() {
  const { data, error, isLoading, mutate } = useSWR<WatchlistItemData>('/api/watchlist-items', swrFetcher);
  const [message, setMessage] = useState<MessageState>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    const form = event.currentTarget;
    const formData = new FormData(form);
    const symbolCode = String(formData.get('symbol_code') ?? '').trim();
    const marketCode = String(formData.get('market_code') ?? '').trim();
    const tradingviewSymbol = String(formData.get('tradingview_symbol') ?? '').trim();
    const displayName = String(formData.get('display_name') ?? '').trim();
    const memo = String(formData.get('memo') ?? '').trim();

    if (!symbolCode) {
      setMessage({ kind: 'error', text: 'symbol_code は必須です。' });
      return;
    }

    let priority: number | null = null;
    try {
      priority = toNullableInteger(formData.get('priority'));
    } catch (createError: any) {
      setMessage({ kind: 'error', text: createError?.message ?? 'priority の入力が不正です。' });
      return;
    }

    try {
      setIsSubmitting(true);
      const result = await postApi<WatchlistItemMutateData>('/api/watchlist-items', {
        symbol_code: symbolCode,
        market_code: marketCode || undefined,
        tradingview_symbol: tradingviewSymbol || undefined,
        display_name: displayName || undefined,
        priority,
        memo: memo || undefined,
      });
      await mutate();
      form.reset();
      if (result.status === 'already_exists') {
        setMessage({ kind: 'success', text: '既存の監視銘柄です。重複追加は行いませんでした。' });
      } else {
        setMessage({ kind: 'success', text: '監視銘柄を追加しました。' });
      }
    } catch (createError: any) {
      setMessage({ kind: 'error', text: createError?.message ?? '監視銘柄の追加に失敗しました。' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const onPatch = async (event: FormEvent<HTMLFormElement>, itemId: string) => {
    event.preventDefault();
    setMessage(null);
    const formData = new FormData(event.currentTarget);
    let priority: number | null = null;
    try {
      priority = toNullableInteger(formData.get('priority'));
    } catch (updateError: any) {
      setMessage({ kind: 'error', text: updateError?.message ?? 'priority の入力が不正です。' });
      return;
    }

    const memoValue = formData.get('memo');
    const memo = typeof memoValue === 'string' ? memoValue : '';

    try {
      await patchApi<WatchlistItemMutateData>(`/api/watchlist-items/${itemId}`, {
        priority,
        memo,
      });
      await mutate();
      setMessage({ kind: 'success', text: '監視銘柄を更新しました。' });
    } catch (updateError: any) {
      setMessage({ kind: 'error', text: updateError?.message ?? '監視銘柄の更新に失敗しました。' });
    }
  };

  const onDelete = async (itemId: string) => {
    setMessage(null);
    try {
      await deleteApi<{ deleted: boolean; item_id: string }>(`/api/watchlist-items/${itemId}`);
      await mutate();
      setMessage({ kind: 'success', text: '監視銘柄を削除しました。' });
    } catch (deleteError: any) {
      setMessage({ kind: 'error', text: deleteError?.message ?? '監視銘柄の削除に失敗しました。' });
    }
  };

  if (isLoading) return <div style={{ padding: '2rem' }}>読み込み中...</div>;
  if (error) return <div style={{ padding: '2rem', color: 'red' }}>エラー: {error.message}</div>;
  if (!data) return null;

  return (
    <div style={{ padding: '2rem', maxWidth: '920px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <div style={{ marginBottom: '1rem' }}>
        <Link href='/' style={{ color: '#666', textDecoration: 'none' }}>
          ホームへ戻る
        </Link>
      </div>
      <h1>監視銘柄管理</h1>
      <p style={{ color: '#666' }}>
        Home の watchlist_symbols で使う監視銘柄を管理します。
      </p>

      {message && (
        <div
          style={{
            margin: '1rem 0',
            padding: '0.75rem',
            borderRadius: '4px',
            background: message.kind === 'success' ? '#f1fff1' : '#fff4f4',
            border: message.kind === 'success' ? '1px solid #72b372' : '1px solid #e08a8a',
            color: message.kind === 'success' ? '#206620' : '#a10000',
          }}
        >
          {message.text}
        </div>
      )}

      <section style={{ marginTop: '1.5rem' }}>
        <h2 style={{ fontSize: '1.1rem' }}>監視銘柄を追加</h2>
        <form onSubmit={onCreate} style={{ display: 'grid', gap: '0.6rem' }}>
          <input name='symbol_code' placeholder='symbol_code (例: 7203)' />
          <input name='display_name' placeholder='display_name (任意)' />
          <input name='market_code' placeholder='market_code (任意, 例: JP_STOCK)' />
          <input name='tradingview_symbol' placeholder='tradingview_symbol (任意, 例: TSE:7203)' />
          <input name='priority' placeholder='priority (任意, 整数)' />
          <input name='memo' placeholder='memo (任意)' />
          <button type='submit' disabled={isSubmitting}>
            {isSubmitting ? '追加中...' : '追加'}
          </button>
        </form>
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2 style={{ fontSize: '1.1rem' }}>現在の監視銘柄</h2>
        {data.items.length === 0 ? (
          <p style={{ color: '#666' }}>監視銘柄はまだありません。</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {data.items.map((item) => (
              <li key={item.item_id} style={{ borderBottom: '1px solid #eee', padding: '0.8rem 0' }}>
                <div style={{ marginBottom: '0.4rem' }}>
                  {item.symbol_id ? (
                    <Link href={`/symbols/${item.symbol_id}`} style={{ color: '#0066cc', textDecoration: 'none' }}>
                      {item.display_name ?? item.symbol_code ?? item.symbol_id}
                    </Link>
                  ) : (
                    <span>{item.display_name ?? item.symbol_code ?? '-'}</span>
                  )}
                  <span style={{ marginLeft: '0.5rem', color: '#666', fontSize: '0.85rem' }}>
                    {item.market_code ?? '-'} / {item.tradingview_symbol ?? '-'}
                  </span>
                </div>

                <form
                  onSubmit={(event) => onPatch(event, item.item_id)}
                  style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}
                >
                  <input name='priority' defaultValue={item.priority ?? ''} placeholder='priority' />
                  <input name='memo' defaultValue={item.memo ?? ''} placeholder='memo' />
                  <button type='submit'>更新</button>
                  <button type='button' onClick={() => onDelete(item.item_id)}>
                    削除
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
