import useSWR from 'swr';
import { useRoute } from 'wouter';
import { swrFetcher } from '../api/client';
import { BacktestComparisonData } from '../api/types';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import { KeyValueList, KeyValueRow } from '../components/ui/KeyValueList';
import LoadingState from '../components/ui/LoadingState';
import SectionCard from '../components/ui/SectionCard';
import TextLink from '../components/ui/TextLink';

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

  if (isLoading) {
    return (
      <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto', fontFamily: 'sans-serif' }}>
        <LoadingState title='比較結果を読み込み中...' />
      </div>
    );
  }
  if (error) {
    return (
      <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto', fontFamily: 'sans-serif' }}>
        <ErrorState title='比較結果の取得に失敗しました'>
          エラー: {error.message}
        </ErrorState>
      </div>
    );
  }
  if (!data) {
    return (
      <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto', fontFamily: 'sans-serif' }}>
        <EmptyState title='比較結果が見つかりません' />
      </div>
    );
  }

  const metrics = data.comparison.metrics_diff;

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <div style={{ marginBottom: '1rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <TextLink href='/' className='text-slate-600 no-underline hover:underline'>ホーム</TextLink>
        <TextLink href={`/backtests/${data.comparison.base_backtest_id}?comparisonId=${data.comparison.comparison_id}`} className='text-slate-600 no-underline hover:underline'>
          比較元backtestへ
        </TextLink>
        <TextLink href={`/backtests/${data.comparison.target_backtest_id}?comparisonId=${data.comparison.comparison_id}`} className='text-slate-600 no-underline hover:underline'>
          比較先backtestへ
        </TextLink>
      </div>

      <h1>保存済みバックテスト比較</h1>
      <p style={{ color: '#666' }}>
        比較ID: <code>{data.comparison.comparison_id}</code>
      </p>
      <p style={{ color: '#666', lineHeight: 1.6 }}>
        保存済み pairwise comparison の再訪画面です。本格比較画面候補として、既存の比較 summary / metrics / AI summary を確認できます。
      </p>

      <SectionCard title='比較対象' className='mt-4'>
        <KeyValueList>
          <KeyValueRow label='比較元'><code>{data.comparison.base_backtest_id}</code> / <code>{data.comparison.base_import_id}</code></KeyValueRow>
          <KeyValueRow label='比較先'><code>{data.comparison.target_backtest_id}</code> / <code>{data.comparison.target_import_id}</code></KeyValueRow>
        </KeyValueList>
      </SectionCard>

      <SectionCard title='主要差分' className='mt-4'>
        <KeyValueList>
          <KeyValueRow label='総取引数差分'>{formatDiff(metrics.total_trades_diff, '', 0)}</KeyValueRow>
          <KeyValueRow label='勝率差分'>{formatDiff(metrics.win_rate_diff_pt, 'pt')}</KeyValueRow>
          <KeyValueRow label='Profit Factor差分'>{formatDiff(metrics.profit_factor_diff)}</KeyValueRow>
          <KeyValueRow label='最大ドローダウン差分'>{formatDiff(metrics.max_drawdown_diff)}</KeyValueRow>
          <KeyValueRow label='純利益差分'>{formatDiff(metrics.net_profit_diff)}</KeyValueRow>
        </KeyValueList>
      </SectionCard>

      <SectionCard title='tradeoff 要約' className='mt-4'>
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{data.comparison.tradeoff_summary}</pre>
      </SectionCard>

      <SectionCard title='AI比較総評' className='mt-4'>
        {data.comparison.ai_summary ? (
          <div style={{ whiteSpace: 'pre-wrap' }}>{data.comparison.ai_summary}</div>
        ) : (
          <EmptyState title='AI比較総評は保存されていません。' />
        )}
      </SectionCard>
    </div>
  );
}

