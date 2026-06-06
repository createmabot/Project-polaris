import useSWR from 'swr';
import { patchApi, swrFetcher } from '../api/client';
import { StrategyOptimizationSessionData, StrategyRefinementCandidateData } from '../api/types';
import AppLayout from '../components/layout/AppLayout';
import PageHeader from '../components/layout/PageHeader';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import InlineNotice from '../components/ui/InlineNotice';
import { KeyValueList, KeyValueRow } from '../components/ui/KeyValueList';
import LoadingState from '../components/ui/LoadingState';
import SectionCard from '../components/ui/SectionCard';
import StatusBadge from '../components/ui/StatusBadge';
import TextLink from '../components/ui/TextLink';

type StrategyOptimizationSessionDetailProps = {
  params: { sessionId: string };
};

function metricValue(metrics: Record<string, number | string | null> | undefined, key: string): string {
  const value = metrics?.[key];
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'number') {
    return Number(value).toLocaleString('ja-JP', { maximumFractionDigits: 4 });
  }
  return String(value);
}

function candidateVersionUrl(candidate: StrategyRefinementCandidateData): string | null {
  return candidate.detail_url ?? (candidate.created_strategy_version_id ? `/strategy-versions/${candidate.created_strategy_version_id}` : null);
}

export default function StrategyOptimizationSessionDetail({ params }: StrategyOptimizationSessionDetailProps) {
  const { sessionId } = params;
  const { data, error, isLoading, mutate } = useSWR<StrategyOptimizationSessionData>(
    `/api/strategy-optimization-sessions/${sessionId}`,
    swrFetcher,
  );

  const updateCandidateStatus = async (candidateId: string, status: 'selected' | 'rejected' | 'archived') => {
    await patchApi(`/api/strategy-refinement-candidates/${candidateId}/status`, { status });
    await mutate();
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className='mx-auto max-w-6xl'>
          <LoadingState title='optimization session を読み込み中...' />
        </div>
      </AppLayout>
    );
  }
  if (error) {
    return (
      <AppLayout>
        <div className='mx-auto max-w-6xl'>
          <ErrorState title={`optimization session の取得に失敗しました: ${error.message}`} />
        </div>
      </AppLayout>
    );
  }
  const session = data?.optimization_session;
  if (!session) return null;

  return (
    <AppLayout>
      <div className='mx-auto max-w-6xl space-y-4'>
        <PageHeader
          title='Strategy Optimization Session'
          description='Backtest AI summary の改善候補から作成した version と検証結果を横並びで確認します。表示だけでは clone / rewrite / Pine生成 / backtest / apply は実行しません。'
          actions={<TextLink href={session.source_backtest_id ? `/backtests/${session.source_backtest_id}` : '/backtests'}>元の検証結果へ</TextLink>}
        />

        <SectionCard title='Session 概要'>
          <KeyValueList className='gap-x-4 gap-y-1 sm:grid-cols-2'>
            <KeyValueRow label='session id'><code>{session.id}</code></KeyValueRow>
            <KeyValueRow label='status'><StatusBadge status={session.status} /></KeyValueRow>
            <KeyValueRow label='objective'>{session.objective_type}</KeyValueRow>
            <KeyValueRow label='candidate count'>{session.candidate_count}</KeyValueRow>
            <KeyValueRow label='base version'><code>{session.base_strategy_version_id}</code></KeyValueRow>
            <KeyValueRow label='base market / timeframe'>
              {session.base_version?.market ?? '-'} / {session.base_version?.timeframe ?? '-'}
            </KeyValueRow>
            <KeyValueRow label='base status'>{session.base_version?.status ? <StatusBadge status={session.base_version.status} /> : '-'}</KeyValueRow>
            <KeyValueRow label='source backtest'><code>{session.source_backtest_id ?? '-'}</code></KeyValueRow>
          </KeyValueList>
          {session.meta ? (
            <InlineNotice tone='info' className='mt-3'>
              機微な生成入力、取込本文、Pine 本文はこの response に含めません。
            </InlineNotice>
          ) : null}
        </SectionCard>

        {session.source_backtest ? (
          <SectionCard title='Source Backtest'>
            <KeyValueList className='gap-x-4 gap-y-1 sm:grid-cols-2'>
              <KeyValueRow label='title'>{session.source_backtest.title}</KeyValueRow>
              <KeyValueRow label='status'><StatusBadge status={session.source_backtest.status} /></KeyValueRow>
              <KeyValueRow label='source'>{session.source_backtest.execution_source}</KeyValueRow>
              <KeyValueRow label='market / timeframe'>{session.source_backtest.market} / {session.source_backtest.timeframe}</KeyValueRow>
              <KeyValueRow label='PF'>{metricValue(session.source_backtest.metrics, 'profit_factor')}</KeyValueRow>
              <KeyValueRow label='win rate'>{metricValue(session.source_backtest.metrics, 'win_rate')}</KeyValueRow>
              <KeyValueRow label='max drawdown'>{metricValue(session.source_backtest.metrics, 'max_drawdown')}</KeyValueRow>
              <KeyValueRow label='net profit'>{metricValue(session.source_backtest.metrics, 'net_profit')}</KeyValueRow>
            </KeyValueList>
          </SectionCard>
        ) : null}

        <SectionCard title='候補比較ボード'>
          {session.candidates.length === 0 ? (
            <EmptyState title='改善候補はありません。' />
          ) : (
            <div className='overflow-x-auto'>
              <table className='min-w-full border-collapse text-sm'>
                <thead>
                  <tr className='border-b border-slate-200 text-left'>
                    <th className='p-2'>候補</th>
                    <th className='p-2'>target</th>
                    <th className='p-2'>status</th>
                    <th className='p-2'>latest report</th>
                    <th className='p-2'>PF diff</th>
                    <th className='p-2'>win diff</th>
                    <th className='p-2'>actions</th>
                  </tr>
                </thead>
                <tbody>
                  {session.candidates.map((candidate) => {
                    const latest = candidate.latest_backtest_report;
                    const versionUrl = candidateVersionUrl(candidate);
                    return (
                      <tr key={candidate.id} className='border-b border-slate-100 align-top'>
                        <td className='p-2'>
                          <div className='font-semibold text-slate-900'>候補{candidate.candidate_index}: {candidate.title}</div>
                          <div className='mt-1 text-slate-600'>{candidate.change_summary}</div>
                        </td>
                        <td className='p-2'>{candidate.target_area}</td>
                        <td className='p-2'><StatusBadge status={candidate.status} /></td>
                        <td className='p-2'>
                          {latest ? (
                            <div>
                              <TextLink href={`/backtests/${latest.id}`}>{latest.title}</TextLink>
                              <div className='mt-1 text-slate-600'>{latest.status} / {latest.market} / {latest.timeframe}</div>
                            </div>
                          ) : '-'}
                        </td>
                        <td className='p-2'>{metricValue(latest?.diff_vs_base, 'profit_factor')}</td>
                        <td className='p-2'>{metricValue(latest?.diff_vs_base, 'win_rate')}</td>
                        <td className='p-2'>
                          <div className='flex flex-wrap gap-2'>
                            {versionUrl ? <TextLink href={versionUrl}>version を開く</TextLink> : null}
                            {latest ? <TextLink href={`/backtests/${latest.id}`}>report を開く</TextLink> : null}
                            <Button variant='secondary' onClick={() => updateCandidateStatus(candidate.id, 'selected')}>selected</Button>
                            <Button variant='secondary' onClick={() => updateCandidateStatus(candidate.id, 'rejected')}>rejected</Button>
                            <Button variant='secondary' onClick={() => updateCandidateStatus(candidate.id, 'archived')}>archived</Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>
    </AppLayout>
  );
}
