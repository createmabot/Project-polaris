import { FormEvent, useState } from 'react';
import { Link } from 'wouter';
import { postApi } from '../api/client';
import { StrategyCreateData, StrategyVersionData } from '../api/types';

const MARKET_OPTIONS = ['JP_STOCK'];
const TIMEFRAME_OPTIONS = ['D'];

export default function StrategyLab() {
  const [title, setTitle] = useState('押し目買い戦略');
  const [naturalLanguageRule, setNaturalLanguageRule] = useState(
    '25日移動平均線の上で、RSIが50以上、出来高が20日平均の1.5倍以上で買い。終値が25日線を下回ったら手仕舞い。'
  );
  const [market, setMarket] = useState('JP_STOCK');
  const [timeframe, setTimeframe] = useState('D');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StrategyVersionData['strategy_version'] | null>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setResult(null);

    try {
      const strategy = await postApi<StrategyCreateData>('/api/strategies', {
        title: title.trim(),
      });

      const version = await postApi<StrategyVersionData>(
        `/api/strategies/${strategy.strategy.id}/versions`,
        {
          natural_language_rule: naturalLanguageRule.trim(),
          market,
          timeframe,
        }
      );

      const generated = await postApi<StrategyVersionData>(
        `/api/strategy-versions/${version.strategy_version.id}/pine/generate`,
        {}
      );

      setResult(generated.strategy_version);
    } catch (submitError: any) {
      setError(submitError?.message ?? 'ルール生成に失敗しました。');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '880px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <div style={{ marginBottom: '1rem' }}>
        <Link href='/' style={{ color: '#666', textDecoration: 'none' }}>ホームへ戻る</Link>
      </div>

      <h1>ルール検証ラボ（MVP）</h1>
      <p style={{ color: '#666' }}>
        自然言語ルールを保存し、version を作成して Pine を生成します。TradingView での一次検証は生成後に実施します。
      </p>

      <form onSubmit={onSubmit} style={{ display: 'grid', gap: '1rem', marginTop: '1.2rem' }}>
        <label style={{ display: 'grid', gap: '0.4rem' }}>
          <span>戦略名</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            style={{ padding: '0.6rem', border: '1px solid #ccc', borderRadius: '4px' }}
          />
        </label>

        <label style={{ display: 'grid', gap: '0.4rem' }}>
          <span>自然言語ルール</span>
          <textarea
            value={naturalLanguageRule}
            onChange={(event) => setNaturalLanguageRule(event.target.value)}
            rows={7}
            style={{ padding: '0.6rem', border: '1px solid #ccc', borderRadius: '4px', resize: 'vertical' }}
          />
        </label>

        <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: '1fr 1fr' }}>
          <label style={{ display: 'grid', gap: '0.4rem' }}>
            <span>市場</span>
            <select value={market} onChange={(event) => setMarket(event.target.value)} style={{ padding: '0.6rem', border: '1px solid #ccc', borderRadius: '4px' }}>
              {MARKET_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>

          <label style={{ display: 'grid', gap: '0.4rem' }}>
            <span>時間足</span>
            <select value={timeframe} onChange={(event) => setTimeframe(event.target.value)} style={{ padding: '0.6rem', border: '1px solid #ccc', borderRadius: '4px' }}>
              {TIMEFRAME_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
        </div>

        <div style={{ fontSize: '0.9rem', color: '#666' }}>
          MVP制約: 日本語中心 / 日足(D)中心 / long_only の基本条件（移動平均・RSI・出来高）を対象
        </div>

        {error && (
          <div style={{ padding: '0.75rem', background: '#fff4f4', border: '1px solid #e08a8a', color: '#a10000', borderRadius: '4px' }}>
            {error}
          </div>
        )}

        <button
          type='submit'
          disabled={submitting}
          style={{
            width: 'fit-content',
            padding: '0.6rem 1rem',
            border: 'none',
            borderRadius: '4px',
            background: submitting ? '#9cbbe0' : '#0a5bb5',
            color: '#fff',
            cursor: submitting ? 'default' : 'pointer',
          }}
        >
          {submitting ? '生成中...' : '保存してPine生成'}
        </button>
      </form>

      {result && (
        <section style={{ marginTop: '2rem', display: 'grid', gap: '1rem' }}>
          <h2>生成結果</h2>
          <div style={{ fontSize: '0.95rem', color: '#333' }}>
            <div><strong>version_id:</strong> <code>{result.id}</code></div>
            <div><strong>status:</strong> <code>{result.status}</code></div>
          </div>

          <div>
            <h3 style={{ marginBottom: '0.5rem' }}>assumptions</h3>
            {result.assumptions.length > 0 ? (
              <ul>
                {result.assumptions.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
              </ul>
            ) : (
              <p style={{ color: '#666' }}>なし</p>
            )}
          </div>

          <div>
            <h3 style={{ marginBottom: '0.5rem' }}>warnings</h3>
            {result.warnings.length > 0 ? (
              <ul style={{ color: '#8a5b00' }}>
                {result.warnings.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
              </ul>
            ) : (
              <p style={{ color: '#666' }}>なし</p>
            )}
          </div>

          <div>
            <h3 style={{ marginBottom: '0.5rem' }}>generated pine</h3>
            {result.generated_pine ? (
              <pre style={{ margin: 0, padding: '1rem', background: '#f7f7f7', border: '1px solid #ddd', borderRadius: '4px', overflowX: 'auto' }}>
                <code>{result.generated_pine}</code>
              </pre>
            ) : (
              <p style={{ color: '#666' }}>生成に失敗しました。warnings を確認してください。</p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
