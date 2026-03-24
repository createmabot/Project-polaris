import { useState } from 'react';
import useSWR from 'swr';
import { Link } from 'wouter';
import { postApi, swrFetcher } from '../api/client';
import { StrategyVersionData } from '../api/types';

type StrategyVersionDetailProps = {
  params: { versionId: string };
};

export default function StrategyVersionDetail({ params }: StrategyVersionDetailProps) {
  const { versionId } = params;
  const { data, error, isLoading, mutate } = useSWR<StrategyVersionData>(
    `/api/strategy-versions/${versionId}`,
    swrFetcher
  );
  const [regenerating, setRegenerating] = useState(false);
  const [regenerateError, setRegenerateError] = useState<string | null>(null);

  const onRegenerate = async () => {
    setRegenerating(true);
    setRegenerateError(null);
    try {
      const response = await postApi<StrategyVersionData>(`/api/strategy-versions/${versionId}/pine/generate`, {});
      await mutate(response, false);
    } catch (requestError: any) {
      setRegenerateError(requestError?.message ?? '再生成に失敗しました。');
    } finally {
      setRegenerating(false);
    }
  };

  if (isLoading) return <div style={{ padding: '2rem' }}>読み込み中...</div>;
  if (error) return <div style={{ padding: '2rem', color: '#a10000' }}>エラー: {error.message}</div>;
  if (!data) return null;

  const version = data.strategy_version;
  const warnings = Array.isArray(version.warnings) ? version.warnings : [];
  const assumptions = Array.isArray(version.assumptions) ? version.assumptions : [];

  return (
    <div style={{ padding: '2rem', maxWidth: '920px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <div style={{ marginBottom: '1rem', display: 'flex', gap: '1rem' }}>
        <Link href='/' style={{ color: '#666', textDecoration: 'none' }}>ホームへ戻る</Link>
        <Link href='/strategy-lab' style={{ color: '#666', textDecoration: 'none' }}>ルール検証ラボへ戻る</Link>
        <Link href={`/strategies/${version.strategy_id}/versions`} style={{ color: '#666', textDecoration: 'none' }}>
          version 一覧へ
        </Link>
      </div>

      <h1>rule version 詳細</h1>
      <div style={{ marginTop: '1rem', display: 'grid', gap: '0.4rem', fontSize: '0.95rem' }}>
        <div><strong>version_id:</strong> <code>{version.id}</code></div>
        <div><strong>strategy_id:</strong> <code>{version.strategy_id}</code></div>
        <div><strong>市場:</strong> {version.market}</div>
        <div><strong>時間足:</strong> {version.timeframe}</div>
        <div><strong>status:</strong> <code>{version.status}</code></div>
        <div><strong>作成:</strong> {new Date(version.created_at).toLocaleString('ja-JP')}</div>
        <div><strong>更新:</strong> {new Date(version.updated_at).toLocaleString('ja-JP')}</div>
      </div>

      <div style={{ marginTop: '1rem' }}>
        <button
          type='button'
          onClick={onRegenerate}
          disabled={regenerating}
          style={{
            padding: '0.55rem 0.95rem',
            border: 'none',
            borderRadius: '4px',
            background: regenerating ? '#9cbbe0' : '#0a5bb5',
            color: '#fff',
            cursor: regenerating ? 'default' : 'pointer',
          }}
        >
          {regenerating ? '再生成中...' : 'Pine を再生成'}
        </button>
      </div>

      {regenerateError && (
        <div style={{ marginTop: '0.8rem', padding: '0.75rem', background: '#fff4f4', border: '1px solid #e08a8a', color: '#a10000', borderRadius: '4px' }}>
          {regenerateError}
        </div>
      )}

      <section style={{ marginTop: '1.2rem' }}>
        <h2 style={{ marginBottom: '0.5rem' }}>自然言語ルール</h2>
        <pre style={{ margin: 0, padding: '1rem', background: '#f7f7f7', border: '1px solid #ddd', borderRadius: '4px', whiteSpace: 'pre-wrap' }}>
          {version.natural_language_rule}
        </pre>
      </section>

      <section style={{ marginTop: '1.2rem' }}>
        <h2 style={{ marginBottom: '0.5rem' }}>warnings</h2>
        {warnings.length === 0 ? (
          <p style={{ color: '#666' }}>なし</p>
        ) : (
          <ul style={{ color: '#8a5b00' }}>
            {warnings.map((item, index) => (
              <li key={`${item}-${index}`}>{item}</li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: '1.2rem' }}>
        <h2 style={{ marginBottom: '0.5rem' }}>assumptions</h2>
        {assumptions.length === 0 ? (
          <p style={{ color: '#666' }}>なし</p>
        ) : (
          <ul>
            {assumptions.map((item, index) => (
              <li key={`${item}-${index}`}>{item}</li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: '1.2rem' }}>
        <h2 style={{ marginBottom: '0.5rem' }}>generated pine</h2>
        {version.generated_pine ? (
          <pre style={{ margin: 0, padding: '1rem', background: '#f7f7f7', border: '1px solid #ddd', borderRadius: '4px', overflowX: 'auto' }}>
            <code>{version.generated_pine}</code>
          </pre>
        ) : (
          <p style={{ color: '#666' }}>まだ生成されていません。</p>
        )}
      </section>
    </div>
  );
}

