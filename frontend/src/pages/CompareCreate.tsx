import { FormEvent, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { postApi } from '../api/client';
import { ComparisonCreateData } from '../api/types';

function parseSymbolIds(raw: string): string[] {
  return [...new Set(raw
    .split(/[\s,\n]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0))];
}

export default function CompareCreate() {
  const [, setLocation] = useLocation();
  const initialSymbolIds = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('symbolIds') ?? '';
  }, []);

  const [symbolIdsText, setSymbolIdsText] = useState(initialSymbolIds);
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    const symbolIds = parseSymbolIds(symbolIdsText);
    if (symbolIds.length < 2 || symbolIds.length > 4) {
      setError('比較対象は2?4銘柄で指定してください。');
      return;
    }

    try {
      setIsSubmitting(true);
      const data = await postApi<ComparisonCreateData>('/api/comparisons', {
        name: name.trim() || undefined,
        symbol_ids: symbolIds,
      });
      setLocation(`/comparisons/${data.comparison_session.id}`);
    } catch (submitError: any) {
      if (submitError?.details?.missing_symbol_ids?.length > 0) {
        setError(`存在しない銘柄IDがあります: ${submitError.details.missing_symbol_ids.join(', ')}`);
      } else {
        setError(submitError?.message ?? '比較セッションの作成に失敗しました。');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '760px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <div style={{ marginBottom: '1rem' }}>
        <Link href='/' style={{ color: '#666', textDecoration: 'none' }}>ホームへ戻る</Link>
      </div>

      <h1>銘柄比較</h1>
      <p style={{ color: '#666' }}>2?4銘柄を選択して、AI要約・ノート・アラート・参照情報を横並びで確認します。</p>

      <form onSubmit={onSubmit} style={{ marginTop: '1.5rem', display: 'grid', gap: '1rem' }}>
        <label style={{ display: 'grid', gap: '0.5rem' }}>
          <span>比較名（任意）</span>
          <input
            type='text'
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder='例: 監視銘柄比較'
            style={{ padding: '0.6rem', border: '1px solid #ccc', borderRadius: '4px' }}
          />
        </label>

        <label style={{ display: 'grid', gap: '0.5rem' }}>
          <span>銘柄ID（必須）</span>
          <textarea
            value={symbolIdsText}
            onChange={(event) => setSymbolIdsText(event.target.value)}
            rows={4}
            placeholder='例: sym_7203, sym_6758'
            style={{ padding: '0.6rem', border: '1px solid #ccc', borderRadius: '4px', resize: 'vertical' }}
          />
          <small style={{ color: '#666' }}>カンマ、スペース、改行区切りで入力できます。</small>
        </label>

        {error && (
          <div style={{ padding: '0.75rem', background: '#fff4f4', border: '1px solid #e08a8a', color: '#a10000', borderRadius: '4px' }}>
            {error}
          </div>
        )}

        <button
          type='submit'
          disabled={isSubmitting}
          style={{
            width: 'fit-content',
            padding: '0.6rem 1rem',
            border: 'none',
            borderRadius: '4px',
            background: isSubmitting ? '#9cbbe0' : '#0a5bb5',
            color: '#fff',
            cursor: isSubmitting ? 'default' : 'pointer',
          }}
        >
          {isSubmitting ? '作成中...' : '比較を開始'}
        </button>
      </form>

      <section style={{ marginTop: '2rem', color: '#555' }}>
        <h2 style={{ fontSize: '1.1rem' }}>空状態の扱い</h2>
        <ul>
          <li>銘柄ID未入力または件数不正: 送信前にバリデーションエラー表示</li>
          <li>存在しない銘柄ID: APIエラー内容を表示</li>
        </ul>
      </section>
    </div>
  );
}

