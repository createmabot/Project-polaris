import useSWR from 'swr';
import { Link } from 'wouter';
import { swrFetcher } from '../api/client';
import { BacktestDetailData } from '../api/types';

type BacktestDetailProps = {
  params: { backtestId: string };
};

function valueText(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
}

export default function BacktestDetail({ params }: BacktestDetailProps) {
  const { backtestId } = params;
  const { data, error, isLoading } = useSWR<BacktestDetailData>(`/api/backtests/${backtestId}`, swrFetcher);

  if (isLoading) return <div style={{ padding: '2rem' }}>読み込み中...</div>;
  if (error) return <div style={{ padding: '2rem', color: '#a10000' }}>エラー: {error.message}</div>;
  if (!data) return null;

  const latestImport = data.latest_import;

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <div style={{ marginBottom: '1rem', display: 'flex', gap: '1rem' }}>
        <Link href='/' style={{ color: '#666', textDecoration: 'none' }}>ホームへ戻る</Link>
        <Link href='/strategy-lab' style={{ color: '#666', textDecoration: 'none' }}>ルール検証ラボへ戻る</Link>
      </div>

      <h1>backtest 詳細</h1>

      <section style={{ marginTop: '1rem', padding: '1rem', border: '1px solid #ddd', borderRadius: '6px' }}>
        <h2 style={{ marginTop: 0 }}>ヘッダ</h2>
        <div><strong>backtest_id:</strong> <code>{data.backtest.id}</code></div>
        <div><strong>strategy_version_id:</strong> <code>{data.backtest.strategy_version_id}</code></div>
        <div><strong>title:</strong> {data.backtest.title}</div>
        <div><strong>execution_source:</strong> {data.backtest.execution_source}</div>
        <div><strong>market:</strong> {data.backtest.market}</div>
        <div><strong>timeframe:</strong> {data.backtest.timeframe}</div>
        <div><strong>status:</strong> <code>{data.backtest.status}</code></div>
      </section>

      <section style={{ marginTop: '1rem', padding: '1rem', border: '1px solid #ddd', borderRadius: '6px' }}>
        <h2 style={{ marginTop: 0 }}>最新 import 状態</h2>
        {!latestImport ? (
          <p style={{ margin: 0, color: '#666' }}>import はまだありません。</p>
        ) : (
          <>
            <div><strong>import_id:</strong> <code>{latestImport.id}</code></div>
            <div><strong>parse_status:</strong> <code>{latestImport.parse_status}</code></div>
            {latestImport.parse_error && (
              <div style={{ marginTop: '0.4rem', color: '#a10000' }}>
                <strong>parse_error:</strong> {latestImport.parse_error}
              </div>
            )}
          </>
        )}
      </section>

      <section style={{ marginTop: '1rem', padding: '1rem', border: '1px solid #ddd', borderRadius: '6px' }}>
        <h2 style={{ marginTop: 0 }}>最小 summary</h2>
        {!latestImport?.parsed_summary ? (
          <p style={{ margin: 0, color: '#666' }}>summary はまだありません。</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem 1rem' }}>
            <div><strong>totalTrades:</strong> {valueText(latestImport.parsed_summary.totalTrades)}</div>
            <div><strong>winRate:</strong> {valueText(latestImport.parsed_summary.winRate)}</div>
            <div><strong>profitFactor:</strong> {valueText(latestImport.parsed_summary.profitFactor)}</div>
            <div><strong>maxDrawdown:</strong> {valueText(latestImport.parsed_summary.maxDrawdown)}</div>
            <div><strong>netProfit:</strong> {valueText(latestImport.parsed_summary.netProfit)}</div>
            <div><strong>periodFrom:</strong> {valueText(latestImport.parsed_summary.periodFrom)}</div>
            <div><strong>periodTo:</strong> {valueText(latestImport.parsed_summary.periodTo)}</div>
          </div>
        )}
      </section>

      <section style={{ marginTop: '1rem', padding: '1rem', border: '1px solid #ddd', borderRadius: '6px' }}>
        <h2 style={{ marginTop: 0 }}>import 履歴</h2>
        {data.imports.length === 0 ? (
          <p style={{ margin: 0, color: '#666' }}>履歴はありません。</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: '1rem' }}>
            {data.imports.map((item) => (
              <li key={item.id} style={{ marginBottom: '0.4rem' }}>
                <code>{item.id}</code> / {item.file_name} / <code>{item.parse_status}</code>
                {item.parse_error ? ` / ${item.parse_error}` : ''}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
