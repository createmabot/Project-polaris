import useSWR from 'swr';
import { Link, useRoute } from 'wouter';
import { swrFetcher } from '../api/client';
import { BacktestComparisonData } from '../api/types';

function formatDiff(value: number | null | undefined, suffix = '', digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  const sign = value > 0 ? '+' : '';
  return `${sign}${Number(value).toFixed(digits)}${suffix}`;
}

export default function BacktestComparisonDetail() {
  const [, params] = useRoute('/backtest-comparisons/:comparisonId');
  const comparisonId = params?.comparisonId;
  const { data, error, isLoading } = useSWR<BacktestComparisonData>(
    comparisonId ? `/api/backtest-comparisons/${comparisonId}` : null,
    swrFetcher,
  );

  if (isLoading) return <div style={{ padding: '2rem' }}>比較結果を読み込み中...</div>;
  if (error) return <div style={{ padding: '2rem', color: '#a10000' }}>エラー: {error.message}</div>;
  if (!data) return null;

  const metrics = data.comparison.metrics_diff;

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <div style={{ marginBottom: '1rem', display: 'flex', gap: '1rem' }}>
        <Link href='/' style={{ color: '#666', textDecoration: 'none' }}>ホーム</Link>
        <Link href={`/backtests/${data.comparison.base_backtest_id}?comparisonId=${data.comparison.comparison_id}`} style={{ color: '#666', textDecoration: 'none' }}>
          比較元backtestへ
        </Link>
        <Link href={`/backtests/${data.comparison.target_backtest_id}?comparisonId=${data.comparison.comparison_id}`} style={{ color: '#666', textDecoration: 'none' }}>
          比較先backtestへ
        </Link>
      </div>

      <h1>保存済みバックテスト比較</h1>
      <p style={{ color: '#666' }}>
        比較ID: <code>{data.comparison.comparison_id}</code>
      </p>

      <section style={{ marginTop: '1rem', padding: '1rem', border: '1px solid #ddd', borderRadius: '6px' }}>
        <h2 style={{ marginTop: 0 }}>比較対象</h2>
        <div><strong>比較元:</strong> <code>{data.comparison.base_backtest_id}</code> / <code>{data.comparison.base_import_id}</code></div>
        <div><strong>比較先:</strong> <code>{data.comparison.target_backtest_id}</code> / <code>{data.comparison.target_import_id}</code></div>
      </section>

      <section style={{ marginTop: '1rem', padding: '1rem', border: '1px solid #ddd', borderRadius: '6px' }}>
        <h2 style={{ marginTop: 0 }}>主要差分</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '440px' }}>
            <tbody>
              <tr style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '0.5rem' }}>総取引数差分</td>
                <td style={{ padding: '0.5rem' }}>{formatDiff(metrics.total_trades_diff, '', 0)}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '0.5rem' }}>勝率差分</td>
                <td style={{ padding: '0.5rem' }}>{formatDiff(metrics.win_rate_diff_pt, 'pt')}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '0.5rem' }}>Profit Factor差分</td>
                <td style={{ padding: '0.5rem' }}>{formatDiff(metrics.profit_factor_diff)}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '0.5rem' }}>最大ドローダウン差分</td>
                <td style={{ padding: '0.5rem' }}>{formatDiff(metrics.max_drawdown_diff)}</td>
              </tr>
              <tr>
                <td style={{ padding: '0.5rem' }}>純利益差分</td>
                <td style={{ padding: '0.5rem' }}>{formatDiff(metrics.net_profit_diff)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginTop: '1rem', padding: '1rem', border: '1px solid #ddd', borderRadius: '6px' }}>
        <h2 style={{ marginTop: 0 }}>tradeoff 要約</h2>
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{data.comparison.tradeoff_summary}</pre>
      </section>

      <section style={{ marginTop: '1rem', padding: '1rem', border: '1px solid #ddd', borderRadius: '6px' }}>
        <h2 style={{ marginTop: 0 }}>AI比較総評</h2>
        {data.comparison.ai_summary ? (
          <div style={{ whiteSpace: 'pre-wrap' }}>{data.comparison.ai_summary}</div>
        ) : (
          <div style={{ color: '#666' }}>AI比較総評は保存されていません。</div>
        )}
      </section>
    </div>
  );
}

