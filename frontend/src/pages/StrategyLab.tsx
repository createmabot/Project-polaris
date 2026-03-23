import { FormEvent, useState } from 'react';
import { Link } from 'wouter';
import { postApi } from '../api/client';
import {
  BacktestCreateData,
  BacktestImportData,
  StrategyCreateData,
  StrategyVersionData,
} from '../api/types';

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
  const [backtest, setBacktest] = useState<BacktestCreateData['backtest'] | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [importState, setImportState] = useState<BacktestImportData['import'] | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setResult(null);
    setBacktest(null);
    setImportState(null);
    setImportError(null);

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
      if (generated.strategy_version.status === 'generated') {
        const createdBacktest = await postApi<BacktestCreateData>('/api/backtests', {
          strategy_version_id: generated.strategy_version.id,
          title: `${title.trim()} / ${market} / ${timeframe}`,
          execution_source: 'tradingview',
          market,
          timeframe,
        });
        setBacktest(createdBacktest.backtest);
      }
    } catch (submitError: any) {
      setError(submitError?.message ?? 'ルール生成に失敗しました。');
    } finally {
      setSubmitting(false);
    }
  };

  const onImportCsv = async () => {
    if (!backtest) {
      setImportError('先にルール生成を実行して backtest を作成してください。');
      return;
    }
    if (!csvFile) {
      setImportError('CSVファイルを選択してください。');
      return;
    }

    setImporting(true);
    setImportError(null);
    setImportState(null);

    try {
      const csvText = await csvFile.text();
      const imported = await postApi<BacktestImportData>(`/api/backtests/${backtest.id}/imports`, {
        file_name: csvFile.name,
        content_type: csvFile.type || 'text/csv',
        csv_text: csvText,
      });
      setImportState(imported.import);
    } catch (requestError: any) {
      setImportError(requestError?.message ?? 'CSV取込に失敗しました。');
    } finally {
      setImporting(false);
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
            <div><strong>backtest_id:</strong> <code>{backtest?.id ?? '-'}</code></div>
            {result.status !== 'generated' && (
              <div style={{ color: '#8a5b00' }}>Pine生成が失敗しているため backtest は未作成です。</div>
            )}
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

      {backtest && (
        <section style={{ marginTop: '2rem', display: 'grid', gap: '0.8rem' }}>
          <h2>CSV取込（MVP）</h2>
          <p style={{ margin: 0, color: '#666' }}>
            対応CSV: 1行ヘッダ + 1行データ（列: Net Profit, Total Closed Trades, Percent Profitable, Profit Factor, Max Drawdown, From, To）
          </p>

          <input
            type='file'
            accept='.csv,text/csv'
            onChange={(event) => setCsvFile(event.target.files?.[0] ?? null)}
          />

          <button
            type='button'
            onClick={onImportCsv}
            disabled={importing}
            style={{
              width: 'fit-content',
              padding: '0.6rem 1rem',
              border: 'none',
              borderRadius: '4px',
              background: importing ? '#9cbbe0' : '#0a5bb5',
              color: '#fff',
              cursor: importing ? 'default' : 'pointer',
            }}
          >
            {importing ? '取込中...' : 'CSVを取込'}
          </button>

          {importError && (
            <div style={{ padding: '0.75rem', background: '#fff4f4', border: '1px solid #e08a8a', color: '#a10000', borderRadius: '4px' }}>
              {importError}
            </div>
          )}

          {importState && (
            <div style={{ padding: '1rem', background: '#f7f7f7', border: '1px solid #ddd', borderRadius: '4px' }}>
              <div><strong>import_id:</strong> <code>{importState.id}</code></div>
              <div><strong>parse_status:</strong> <code>{importState.parse_status}</code></div>
              {importState.parse_error && (
                <div style={{ color: '#a10000' }}><strong>parse_error:</strong> {importState.parse_error}</div>
              )}
              {importState.parsed_summary && (
                <div style={{ marginTop: '0.6rem' }}>
                  <div><strong>totalTrades:</strong> {String(importState.parsed_summary.totalTrades)}</div>
                  <div><strong>winRate:</strong> {String(importState.parsed_summary.winRate)}</div>
                  <div><strong>profitFactor:</strong> {String(importState.parsed_summary.profitFactor)}</div>
                  <div><strong>maxDrawdown:</strong> {String(importState.parsed_summary.maxDrawdown)}</div>
                  <div><strong>netProfit:</strong> {String(importState.parsed_summary.netProfit)}</div>
                  <div><strong>periodFrom:</strong> {importState.parsed_summary.periodFrom ?? '-'}</div>
                  <div><strong>periodTo:</strong> {importState.parsed_summary.periodTo ?? '-'}</div>
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
