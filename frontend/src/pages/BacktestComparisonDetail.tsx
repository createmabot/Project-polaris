import useSWR from 'swr';
import { useRoute } from 'wouter';
import { swrFetcher } from '../api/client';
import { BacktestComparisonData } from '../api/types';
import AppLayout from '../components/layout/AppLayout';
import PageHeader from '../components/layout/PageHeader';
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
      <AppLayout>
        <div className='mx-auto max-w-5xl'>
          <LoadingState title='比較結果を読み込み中...' />
        </div>
      </AppLayout>
    );
  }
  if (error) {
    return (
      <AppLayout>
        <div className='mx-auto max-w-5xl'>
          <ErrorState title='比較結果の取得に失敗しました'>
            エラー: {error.message}
          </ErrorState>
        </div>
      </AppLayout>
    );
  }
  if (!data) {
    return (
      <AppLayout>
        <div className='mx-auto max-w-5xl'>
          <EmptyState title='比較結果が見つかりません' />
        </div>
      </AppLayout>
    );
  }

  const metrics = data.comparison.metrics_diff;

  return (
    <AppLayout>
      <div className='mx-auto max-w-5xl space-y-5'>
        <PageHeader
          title='保存済みバックテスト比較'
          description={
            <>
              <p>
                比較ID: <code>{data.comparison.comparison_id}</code>
              </p>
              <p className='mt-1'>
                保存済み pairwise comparison の再訪画面です。本格比較画面候補として、既存の比較 summary / metrics / AI summary を確認できます。
              </p>
            </>
          }
          actions={
            <>
              <TextLink href='/' className='text-sm text-slate-600 no-underline hover:underline'>ホーム</TextLink>
              <TextLink href={`/backtests/${data.comparison.base_backtest_id}?comparisonId=${data.comparison.comparison_id}`} className='text-sm text-slate-600 no-underline hover:underline'>
                比較元backtestへ
              </TextLink>
              <TextLink href={`/backtests/${data.comparison.target_backtest_id}?comparisonId=${data.comparison.comparison_id}`} className='text-sm text-slate-600 no-underline hover:underline'>
                比較先backtestへ
              </TextLink>
            </>
          }
        />

      <SectionCard title='比較対象'>
        <KeyValueList>
          <KeyValueRow label='比較元'><code>{data.comparison.base_backtest_id}</code> / <code>{data.comparison.base_import_id}</code></KeyValueRow>
          <KeyValueRow label='比較先'><code>{data.comparison.target_backtest_id}</code> / <code>{data.comparison.target_import_id}</code></KeyValueRow>
        </KeyValueList>
      </SectionCard>

      <SectionCard title='主要差分'>
        <KeyValueList>
          <KeyValueRow label='総取引数差分'>{formatDiff(metrics.total_trades_diff, '', 0)}</KeyValueRow>
          <KeyValueRow label='勝率差分'>{formatDiff(metrics.win_rate_diff_pt, 'pt')}</KeyValueRow>
          <KeyValueRow label='Profit Factor差分'>{formatDiff(metrics.profit_factor_diff)}</KeyValueRow>
          <KeyValueRow label='最大ドローダウン差分'>{formatDiff(metrics.max_drawdown_diff)}</KeyValueRow>
          <KeyValueRow label='純利益差分'>{formatDiff(metrics.net_profit_diff)}</KeyValueRow>
        </KeyValueList>
      </SectionCard>

      <SectionCard title='tradeoff 要約'>
        <pre className='m-0 whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-sm leading-6 text-slate-700'>
          {data.comparison.tradeoff_summary}
        </pre>
      </SectionCard>

      <SectionCard title='AI比較総評'>
        <p className='mt-0 text-sm leading-6 text-slate-600'>
          ここに表示するのは保存済み pairwise comparison の AI summary です。個別 report の AI summary 同士の自動比較や artifact diff は後続判断です。
        </p>
        {data.comparison.ai_summary ? (
          <div className='mt-3 whitespace-pre-wrap rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700'>
            {data.comparison.ai_summary}
          </div>
        ) : (
          <EmptyState title='AI比較総評は保存されていません。' />
        )}
      </SectionCard>
      </div>
    </AppLayout>
  );
}

