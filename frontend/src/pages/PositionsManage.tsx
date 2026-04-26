import { FormEvent, useState } from 'react';
import useSWR from 'swr';
import { Link } from 'wouter';
import { deleteApi, patchApi, postApi, swrFetcher } from '../api/client';
import { PositionManagementData, PositionMutateData } from '../api/types';

type MessageState = { kind: 'success' | 'error'; text: string } | null;

function toPositiveNumber(value: FormDataEntryValue | null, fieldName: string): number {
  const parsed = Number(typeof value === 'string' ? value.trim() : value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} は 0 より大きい数値で入力してください。`);
  }
  return parsed;
}

function toNonNegativeNumber(value: FormDataEntryValue | null, fieldName: string): number {
  const parsed = Number(typeof value === 'string' ? value.trim() : value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${fieldName} は 0 以上の数値で入力してください。`);
  }
  return parsed;
}

export default function PositionsManage() {
  const { data, error, isLoading, mutate } = useSWR<PositionManagementData>('/api/positions', swrFetcher);
  const [message, setMessage] = useState<MessageState>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onCreateOrUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    const form = event.currentTarget;
    const formData = new FormData(form);
    const symbolCode = String(formData.get('symbol_code') ?? '').trim();
    const displayName = String(formData.get('display_name') ?? '').trim();
    const marketCode = String(formData.get('market_code') ?? '').trim();
    const tradingviewSymbol = String(formData.get('tradingview_symbol') ?? '').trim();

    if (!symbolCode) {
      setMessage({ kind: 'error', text: 'symbol_code は必須です。' });
      return;
    }

    let quantity = 0;
    let averageCost = 0;
    try {
      quantity = toPositiveNumber(formData.get('quantity'), 'quantity');
      averageCost = toNonNegativeNumber(formData.get('average_cost'), 'average_cost');
    } catch (createError: any) {
      setMessage({ kind: 'error', text: createError?.message ?? '入力値が不正です。' });
      return;
    }

    try {
      setIsSubmitting(true);
      const result = await postApi<PositionMutateData>('/api/positions', {
        symbol_code: symbolCode,
        display_name: displayName || undefined,
        market_code: marketCode || undefined,
        tradingview_symbol: tradingviewSymbol || undefined,
        quantity,
        average_cost: averageCost,
      });
      await mutate();
      form.reset();
      const actionText =
        result.action === 'created'
          ? '追加'
          : result.action === 'updated'
            ? '更新'
            : '変更なし';
      setMessage({ kind: 'success', text: `保有銘柄を${actionText}しました。` });
    } catch (createError: any) {
      setMessage({ kind: 'error', text: createError?.message ?? '保有銘柄の保存に失敗しました。' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const onPatch = async (event: FormEvent<HTMLFormElement>, positionId: string) => {
    event.preventDefault();
    setMessage(null);
    const formData = new FormData(event.currentTarget);
    let quantity = 0;
    let averageCost = 0;
    try {
      quantity = toPositiveNumber(formData.get('quantity'), 'quantity');
      averageCost = toNonNegativeNumber(formData.get('average_cost'), 'average_cost');
    } catch (updateError: any) {
      setMessage({ kind: 'error', text: updateError?.message ?? '入力値が不正です。' });
      return;
    }

    try {
      await patchApi<PositionMutateData>(`/api/positions/${positionId}`, {
        quantity,
        average_cost: averageCost,
      });
      await mutate();
      setMessage({ kind: 'success', text: '保有銘柄を更新しました。' });
    } catch (updateError: any) {
      setMessage({ kind: 'error', text: updateError?.message ?? '保有銘柄の更新に失敗しました。' });
    }
  };

  const onDelete = async (positionId: string) => {
    setMessage(null);
    try {
      await deleteApi<{ deleted: boolean; position_id: string }>(`/api/positions/${positionId}`);
      await mutate();
      setMessage({ kind: 'success', text: '保有銘柄を削除しました。' });
    } catch (deleteError: any) {
      setMessage({ kind: 'error', text: deleteError?.message ?? '保有銘柄の削除に失敗しました。' });
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
      <h1>保有銘柄管理</h1>
      <p style={{ color: '#666' }}>Home の positions で使う保有銘柄を管理します。</p>

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
        <h2 style={{ fontSize: '1.1rem' }}>保有銘柄を追加/更新</h2>
        <form onSubmit={onCreateOrUpdate} style={{ display: 'grid', gap: '0.6rem' }}>
          <input name='symbol_code' placeholder='symbol_code (例: 6758)' />
          <input name='display_name' placeholder='display_name (任意)' />
          <input name='market_code' placeholder='market_code (任意, 例: JP_STOCK)' />
          <input name='tradingview_symbol' placeholder='tradingview_symbol (任意, 例: TSE:6758)' />
          <input name='quantity' placeholder='quantity (必須, > 0)' />
          <input name='average_cost' placeholder='average_cost (必須, >= 0)' />
          <button type='submit' disabled={isSubmitting}>
            {isSubmitting ? '保存中...' : '保存'}
          </button>
        </form>
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2 style={{ fontSize: '1.1rem' }}>現在の保有銘柄</h2>
        {data.positions.length === 0 ? (
          <p style={{ color: '#666' }}>保有銘柄はまだありません。</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {data.positions.map((position) => (
              <li key={position.position_id} style={{ borderBottom: '1px solid #eee', padding: '0.8rem 0' }}>
                <div style={{ marginBottom: '0.4rem' }}>
                  {position.symbol_id ? (
                    <Link href={`/symbols/${position.symbol_id}`} style={{ color: '#0066cc', textDecoration: 'none' }}>
                      {position.display_name ?? position.symbol_code ?? position.symbol_id}
                    </Link>
                  ) : (
                    <span>{position.display_name ?? position.symbol_code ?? '-'}</span>
                  )}
                  <span style={{ marginLeft: '0.5rem', color: '#666', fontSize: '0.85rem' }}>
                    {position.market_code ?? '-'} / {position.tradingview_symbol ?? '-'}
                  </span>
                </div>
                <form
                  onSubmit={(event) => onPatch(event, position.position_id)}
                  style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}
                >
                  <input name='quantity' defaultValue={position.quantity ?? ''} placeholder='quantity' />
                  <input name='average_cost' defaultValue={position.average_cost ?? ''} placeholder='average_cost' />
                  <button type='submit'>更新</button>
                  <button type='button' onClick={() => onDelete(position.position_id)}>
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
