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

function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  return Number(value).toLocaleString('ja-JP', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  return `${Number(value).toFixed(2)}%`;
}

function parseStatusText(status: string | null | undefined): string {
  if (status === 'parsed') return '解析成功';
  if (status === 'failed') return '解析失敗';
  if (status === 'pending') return '解析待ち';
  return valueText(status);
}

function parseStatusStyle(status: string | null | undefined): { background: string; color: string } {
  if (status === 'parsed') return { background: '#e8f6ea', color: '#176b2d' };
  if (status === 'failed') return { background: '#fdeaea', color: '#9f1c1c' };
  if (status === 'pending') return { background: '#eef4ff', color: '#144b9a' };
  return { background: '#f2f2f2', color: '#444' };
}

function metricCard(label: string, value: string) {
  return (
    <div
      style={{
        border: '1px solid #e2e2e2',
        borderRadius: '8px',
        padding: '0.75rem',
        background: '#fafafa',
      }}
    >
      <div style={{ fontSize: '0.85rem', color: '#666' }}>{label}</div>
      <div style={{ marginTop: '0.3rem', fontSize: '1.05rem', fontWeight: 600 }}>{value}</div>
    </div>
  );
}

export default function BacktestDetail({ params }: BacktestDetailProps) {
  const { backtestId } = params;
  const { data, error, isLoading } = useSWR<BacktestDetailData>(`/api/backtests/${backtestId}`, swrFetcher);

  if (isLoading) return <div style={{ padding: '2rem' }}>読み込み中...</div>;
  if (error) return <div style={{ padding: '2rem', color: '#a10000' }}>エラー: {error.message}</div>;
  if (!data) return null;

  const latestImport = data.latest_import;
  const latestStatus = parseStatusText(latestImport?.parse_status);
  const latestStatusStyle = parseStatusStyle(latestImport?.parse_status);
  const summary = latestImport?.parsed_summary;

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <div style={{ marginBottom: '1rem', display: 'flex', gap: '1rem' }}>
        <Link href='/' style={{ color: '#666', textDecoration: 'none' }}>ホームへ戻る</Link>
        <Link href='/strategy-lab' style={{ color: '#666', textDecoration: 'none' }}>ルール検証ラボへ戻る</Link>
        <Link href='/backtests' style={{ color: '#666', textDecoration: 'none' }}>履歴一覧へ</Link>
      </div>

      <h1>検証レポート（最小）</h1>

      <section style={{ marginTop: '1rem', padding: '1rem', border: '1px solid #ddd', borderRadius: '6px' }}>
        <h2 style={{ marginTop: 0 }}>基本情報</h2>
        <div><strong>backtest ID:</strong> <code>{data.backtest.id}</code></div>
        <div><strong>strategy version:</strong> <code>{data.backtest.strategy_version_id}</code></div>
        <div><strong>表示名:</strong> {data.backtest.title}</div>
        <div><strong>検証ソース:</strong> {data.backtest.execution_source}</div>
        <div><strong>市場:</strong> {data.backtest.market}</div>
        <div><strong>時間足:</strong> {data.backtest.timeframe}</div>
        <div><strong>状態:</strong> <code>{data.backtest.status}</code></div>
      </section>

      <section style={{ marginTop: '1rem', padding: '1rem', border: '1px solid #ddd', borderRadius: '6px' }}>
        <h2 style={{ marginTop: 0 }}>取込状態</h2>
        {!latestImport ? (
          <div style={{ color: '#666' }}>
            <p style={{ marginTop: 0 }}>取込データはまだありません。</p>
            <p style={{ marginBottom: 0 }}>`/strategy-lab` で backtest を作成し、CSV を取り込んでください。</p>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div><strong>最新 import ID:</strong> <code>{latestImport.id}</code></div>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  borderRadius: '999px',
                  padding: '0.2rem 0.6rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  ...latestStatusStyle,
                }}
              >
                {latestStatus}
              </div>
            </div>
            {latestImport.parse_error && (
              <div
                style={{
                  marginTop: '0.8rem',
                  color: '#a10000',
                  background: '#fff3f3',
                  border: '1px solid #f1b4b4',
                  borderRadius: '6px',
                  padding: '0.75rem',
                }}
              >
                <strong>解析エラー:</strong> {latestImport.parse_error}
              </div>
            )}
          </>
        )}
      </section>

      <section style={{ marginTop: '1rem', padding: '1rem', border: '1px solid #ddd', borderRadius: '6px' }}>
        <h2 style={{ marginTop: 0 }}>主要指標</h2>
        {!summary ? (
          <p style={{ margin: 0, color: '#666' }}>解析済みサマリーはまだありません。</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
            {metricCard('総取引数', formatNumber(summary.totalTrades, 0))}
            {metricCard('勝率', formatPercent(summary.winRate))}
            {metricCard('Profit Factor', formatNumber(summary.profitFactor, 2))}
            {metricCard('最大ドローダウン', formatNumber(summary.maxDrawdown, 2))}
            {metricCard('純利益', formatNumber(summary.netProfit, 2))}
            {metricCard('対象期間（開始）', valueText(summary.periodFrom))}
            {metricCard('対象期間（終了）', valueText(summary.periodTo))}
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
                <code>{item.id}</code> / {item.file_name} / <code>{parseStatusText(item.parse_status)}</code>
                {item.parse_error ? ` / エラー: ${item.parse_error}` : ''}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
